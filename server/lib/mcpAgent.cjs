// Tableau MCP agent: OpenAI tool-calling loop over a Tableau MCP server (passthrough auth).
//  • Auth: the signed-in user's own Tableau REST session token is forwarded as X-Tableau-Auth
//    (https://tableau.github.io/tableau-mcp/docs/configuration/mcp-config/authentication/passthrough).
//    The MCP server acts as that user, so Tableau permissions and row-level security
//    (USERATTRIBUTEINCLUDES / USERNAME()) apply to every tool call. No service account.
//  • Scope: only a read-only allowlist of MCP tools is offered to the model, and data tools are only
//    allowed against the data sources this customer is entitled to (checked here, server-side).
//  • Pattern adapted from Tab-SE/embedding_playbook (src/app/api/chat/agent/mcp.ts).
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

// Read-only tools offered to the model, grouped for the UI (data / agents). list-datasources and the
// site-wide list tools are left out: the model is given the customer's entitled data sources and
// dashboards (names + LUIDs) up front instead of roaming the site.
const TOOL_GROUPS = {
  // get-view-data is not offered: on a dashboard it returns an empty CSV (verified) — data comes from query-datasource.
  data: ['get-datasource-metadata', 'query-datasource', 'get-view-image', 'search-content', 'list-pulse-metric-subscriptions', 'list-pulse-metrics-from-metric-ids', 'list-pulse-metric-definitions-from-definition-ids'],
  agents: ['generate-pulse-insight-brief', 'generate-pulse-metric-value-insight-bundle']
};
// The model asks Pulse's agent in plain words; the portal fills in the full Pulse metric context (the user's
// followed metrics, as the Pulse Agent builds it) and calls the real MCP tool generate-pulse-insight-brief.
const ASK_PULSE_TOOL = {
  type: 'function',
  function: {
    name: 'ask_pulse_agent',
    description:
      'Ask Tableau Pulse\'s AI agent (over MCP: generate-pulse-insight-brief) a question about the metrics this user follows — best for "why" questions (drivers, contributors, trends). The portal supplies the metric context; you only pass the question.',
    parameters: {
      type: 'object',
      properties: { question: { type: 'string', description: 'The question for Pulse, in plain English, e.g. "Why is Engagement Health below target?"' } },
      required: ['question']
    }
  }
};
const ALLOWED_TOOLS = [...TOOL_GROUPS.data, ...TOOL_GROUPS.agents];
// Tools whose datasourceLuid argument must be one of the customer's entitled data sources.
const DATASOURCE_TOOLS = new Set(['get-datasource-metadata', 'query-datasource']);
// Tools whose viewId must be one of the customer's entitled dashboards.
const VIEW_TOOLS = new Set(['get-view-image']);
const MAX_IMAGE_BYTES = 1_500_000;
// Wording that means the answer found a problem (used to make sure the agent proposes a next step).
const ON_TRACK = /\b(not (clearly )?(down|declining)|remains? stable|is stable|on track overall|no significant (change|decline))/i;
const OFF_TRACK = /\b(below (the )?target|off[- ]track|declin|decreas|dropp?|down by|down \*?\*?-|over budget|slipp|behind|at risk|underperform|lowest|worst)/i;

// Workflow actions the agent can PROPOSE (portal actions, run only after the user confirms in the UI).
const ACTION_TOOL = {
  type: 'function',
  function: {
    name: 'propose_action',
    description:
      'Propose ONE next step for the user after you have answered, when the data shows something that needs attention. The user sees a button and decides; nothing happens until they confirm. Kinds: "contact_apex" (message their Apex account team, e.g. schedule a review), "subscribe" (email this dashboard to them on a schedule), "open_dashboard" (open the dashboard filtered to what you found).',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['contact_apex', 'subscribe', 'open_dashboard'] },
        label: { type: 'string', description: 'Button text, under 40 characters, e.g. "Schedule a review of ERP Implementation"' },
        reason: { type: 'string', description: 'One sentence: the finding that makes this worth doing.' },
        view: { type: 'string', description: 'Dashboard key (from the list of dashboards), for subscribe / open_dashboard.' },
        filters: { type: 'object', description: 'For open_dashboard: { "<filter field>": "<value>" } using the dashboard filter fields listed.', additionalProperties: { type: 'string' } },
        message: { type: 'string', description: 'For contact_apex: the message to send, 2-3 sentences, citing the numbers.' }
      },
      required: ['kind', 'label', 'reason']
    }
  }
};

const MAX_STEPS = 12;
const MAX_TOOL_RESULT_CHARS = 15000;

function systemPrompt({ tenantName, datasources, views = [] }) {
  return `You are the Apex Consulting analytics assistant inside the Client Value Intelligence portal.
You are talking to a user from ${tenantName}. Answer questions about their engagements and results using the
Tableau MCP tools. Be concise and businesslike: a short answer, then key numbers as a few bullets.
Use **bold** for key numbers. Plain markdown only: paragraphs, "- " bullets, "### " headings. No tables.
When ranking, list each item as its own bullet: "- **Technology**: **$5.8M**". Round money to $0.1M or $K like the dashboard.
Rates (anything shown as a %): give the current and prior rate and the RELATIVE change, like the dashboard tile —
"64.76%, down 20.8% from 81.81%". If you mention the absolute difference, call it percentage points ("17.05 points"),
never "%". When citing Pulse's answer, keep its numbers exactly; just label a points change as points.

# Data sources you may use (and no others)
${datasources.map((d) => `- "${d.name}" (${d.label}), datasourceLuid: ${d.luid}${d.dateField ? `, date field: "${d.dateField}"` : ''}`).join('\n')}

# Dashboards you may show (get-view-image takes the viewId)
${views.map((v) => `- ${v.key}: "${v.title}", viewId: ${v.luid}${v.filters?.length ? `, filter fields: ${v.filters.join(', ')}` : ''}`).join('\n') || '(none)'}
Use search-content to find which of their dashboards or data sources covers a topic. Answer numbers with
query-datasource. Use get-view-image when the user asks to SEE a dashboard (the portal displays the image under
your answer; don't describe it pixel by pixel).

# Signal to action (required)
Whenever your answer shows something off track (below target, declining, over budget, a slipping engagement),
you MUST call the propose_action tool before your final answer, with the single most useful next step.
Never just ask "would you like me to…" in text — the tool puts a button in front of the user instead.
Don't propose actions for neutral or positive answers (e.g. when the metric turns out to be stable).

# Why questions
For "why" about a metric the user follows, call ask_pulse_agent (Tableau Pulse's AI agent, over MCP) in
addition to querying the data, and cite the drivers it finds. Use ONLY real_drivers (dimensions with more than one
value in this user's data). Never present a single-value dimension — e.g. the user's own client name, tier, region or
industry — as a driver or as where the change is "concentrated"; it is just the user's whole data.

# Time period: match the dashboard
The portal's dashboards and KPI cards show YEAR TO DATE (the current calendar year so far). Unless the user
asks for a different period, ALWAYS filter every query to year to date on that data source's date field:
  { "field": { "fieldCaption": "<date field>" }, "filterType": "DATE", "periodType": "YEARS", "dateRangeType": "CURRENT" }
Say "year to date" in your answer. If the user asks for another period (last year, all time, by month, a date
range), use that instead and say which period the numbers cover. Never mix periods in one answer.

# How to query data
1. ALWAYS call get-datasource-metadata for a data source before your first query on it. Use only field
   captions that appear verbatim in the metadata (exact spacing and casing). Never invent fields.
2. Call query-datasource with { "datasourceLuid": "<luid>", "query": { "fields": [...], "filters": [...] } }.
   - Dimension: { "fieldCaption": "Service Line" } (no function).
   - Measure: { "fieldCaption": "Business Value Delivered", "function": "SUM" } (SUM, AVG, MEDIAN, COUNT,
     COUNTD, MIN, MAX; dates: YEAR, QUARTER, MONTH, TRUNC_MONTH, TRUNC_QUARTER, TRUNC_YEAR...).
   - Rank with "sortDirection": "DESC", "sortPriority": 1. Never put the aggregation in the caption.
3. If a tool returns a validation error, read it, fix the arguments, and retry once. Do not repeat the same call.
4. Row-level security already limits the data to this customer. Never claim to see other clients' data.
   If the data can't answer the question, say what the data source does contain.
5. Pulse tools: list-pulse-metric-subscriptions shows the metrics this user follows. For "why" questions about
   a followed metric, call ask_pulse_agent: it is Tableau Pulse's own AI agent, reached over MCP.
   Cite what it found rather than re-deriving it.`;
}

/** Content of an MCP tool result → text for the model (truncated). */
function resultText(result) {
  const text = (result.content || [])
    .map((c) => (c.type === 'text' ? c.text : c.type === 'resource' ? c.resource?.text || '' : `[${c.type}]`))
    .join('\n');
  return text.length > MAX_TOOL_RESULT_CHARS ? `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n…(truncated)` : text;
}

/** Keep only search-content hits that are this customer's dashboards or data sources. */
function scopeSearch(result, allowedViews, allowedLuids) {
  const ok = (item) => item && (allowedViews.has(item.luid) || allowedLuids.has(item.luid) || allowedLuids.has(item.datasourceLuid));
  const content = (result.content || []).map((c) => {
    if (c.type !== 'text') return c;
    try {
      const parsed = JSON.parse(c.text);
      const filtered = Array.isArray(parsed) ? parsed.filter(ok) : Array.isArray(parsed?.items) ? { ...parsed, items: parsed.items.filter(ok) } : parsed;
      return { ...c, text: JSON.stringify(filtered) };
    } catch {
      return { ...c, text: '[search results not in a recognized format; not shown]' };
    }
  });
  return { ...result, content };
}

/** First image in an MCP tool result → data URL (for the UI), or null. */
function resultImage(result) {
  const img = (result.content || []).find((c) => c.type === 'image' && c.data);
  if (!img) return null;
  if (img.data.length * 0.75 > MAX_IMAGE_BYTES) return null;
  return `data:${img.mimeType || 'image/png'};base64,${img.data}`;
}

function createMcpAgent({ mcpUrl, openaiKey, model, restSession, forgetSession, pulseContext }) {
  const configured = () => Boolean(mcpUrl && openaiKey);

  async function connect(user) {
    const s = await restSession(user);
    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
      requestInit: { headers: { 'X-Tableau-Auth': s.token } }
    });
    const client = new Client({ name: 'apex-client-portal', version: '1.0.0' });
    await client.connect(transport);
    return client;
  }

  async function openai(messages, tools) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, temperature: 0.2, messages, tools, tool_choice: 'auto' })
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`OpenAI request failed (HTTP ${res.status}): ${text.slice(0, 400)}`);
    return JSON.parse(text).choices[0].message;
  }

  /**
   * Run one question. history = prior [{role:'user'|'assistant', content}] turns.
   * datasources = [{ name, label, luid }] the customer is entitled to.
   * Returns { content, steps: [{ tool, args, ok, ms, error? }] }.
   */
  async function ask(user, { question, history = [], tenantName, datasources, views = [] }) {
    if (!configured()) throw Object.assign(new Error('Tableau MCP agent is not configured (set TABLEAU_MCP_URL and OPENAI_API_KEY).'), { status: 503 });
    let client;
    try {
      client = await connect(user);
    } catch (e) {
      // A stale Tableau session is the usual cause; sign in fresh once.
      forgetSession(user);
      client = await connect(user);
    }
    const steps = [];
    try {
      const { tools: mcpTools } = await client.listTools();
      const available = mcpTools.filter((t) => ALLOWED_TOOLS.includes(t.name));
      if (!available.some((t) => t.name === 'query-datasource')) {
        throw new Error(`The MCP server at ${mcpUrl} did not offer query-datasource (offered: ${mcpTools.map((t) => t.name).join(', ') || 'none'}).`);
      }
      const tools = [
        ...available.filter((t) => t.name !== 'generate-pulse-insight-brief').map((t) => ({
          type: 'function',
          function: { name: t.name, description: (t.description || '').slice(0, 1024), parameters: t.inputSchema || { type: 'object', properties: {} } }
        })),
        ...(available.some((t) => t.name === 'generate-pulse-insight-brief') && pulseContext ? [ASK_PULSE_TOOL] : []),
        ACTION_TOOL
      ];
      const allowedLuids = new Set(datasources.map((d) => d.luid));
      const allowedViews = new Map(views.map((v) => [v.luid, v]));
      const images = [];
      let action = null;
      let nudged = false;
      const groupOf = (name) => (TOOL_GROUPS.agents.includes(name) ? 'agents' : 'data');
      const done = (content) => ({ content, steps, images, action, toolsOffered: available.map((t) => t.name) });

      const messages = [{ role: 'system', content: systemPrompt({ tenantName, datasources, views }) }, ...history, { role: 'user', content: question }];
      for (let i = 0; i < MAX_STEPS; i++) {
        const msg = await openai(messages, tools);
        messages.push(msg);
        if (!msg.tool_calls?.length) {
          // Signal → action: if the answer reports something off track but no action was proposed yet, ask the
          // model once for the propose_action call (it tends to end with "would you like…" in text instead).
          // Not for answers that say things are fine ("not down", "stable", "on track").
          if (!action && !nudged && OFF_TRACK.test(msg.content || '') && !ON_TRACK.test(msg.content || '')) {
            nudged = true;
            messages.push({ role: 'user', content: 'Call propose_action now with the single most useful next step for what you just found. Then give the same answer again without asking "would you like".' });
            continue;
          }
          return done(msg.content || '');
        }

        for (const call of msg.tool_calls) {
          const name = call.function.name;
          const started = Date.now();
          let args = {};
          let output;
          try {
            args = JSON.parse(call.function.arguments || '{}');
            if (name === 'propose_action') {
              // Not an MCP call: recorded for the UI, which asks the user before doing anything.
              const v = args.view && views.find((x) => x.key === args.view);
              if ((args.kind === 'subscribe' || args.kind === 'open_dashboard') && !v) throw new Error(`Unknown dashboard "${args.view}". Use one of: ${views.map((x) => x.key).join(', ')}`);
              action = {
                kind: args.kind,
                label: String(args.label || '').slice(0, 60),
                reason: String(args.reason || '').slice(0, 300),
                view: v?.key || null,
                filters: args.kind === 'open_dashboard' ? Object.fromEntries(Object.entries(args.filters || {}).filter(([k]) => v?.filters?.includes(k)).map(([k, x]) => [k, String(x).slice(0, 120)])) : null,
                message: args.kind === 'contact_apex' ? String(args.message || args.reason || '').slice(0, 1500) : null
              };
              output = 'Proposed to the user. They decide whether to do it; nothing has happened yet. Do not call propose_action again.';
              steps.push({ tool: 'propose_action', group: 'workflows', args: { kind: action.kind, view: action.view }, ok: true, ms: 0, portal: true });
              messages.push({ role: 'tool', tool_call_id: call.id, content: output });
              continue;
            }
            if (name === 'ask_pulse_agent') {
              // The MCP tool's schema also requires definition.is_running_total and metric.candidates
              // (verified against the server's validation error); the Pulse REST context omits them.
              const ctx = (await pulseContext(user)).map((it) => ({
                ...it,
                metric: { ...it.metric, definition: { ...it.metric.definition, is_running_total: Boolean(it.metric.definition?.is_running_total) }, candidates: it.metric.candidates || [] }
              }));
              if (!ctx.length) throw new Error('This user follows no Pulse metrics, so Pulse has nothing to analyze.');
              const briefRequest = {
                language: 'LANGUAGE_EN_US',
                locale: 'LOCALE_EN_US',
                messages: [{ role: 'ROLE_USER', content: String(args.question || question).slice(0, 500), action_type: 'ACTION_TYPE_ANSWER', metric_group_context: ctx, metric_group_context_resolved: false }]
              };
              const result = await client.callTool({ name: 'generate-pulse-insight-brief', arguments: { briefRequest } });
              // Parse Pulse's FULL response: resultText() truncates at 15k chars, which cut the JSON mid-string (verified:
              // "Bad control character … at position 15000"), so the cleanup below never ran and raw text went to the model.
              const text = (result.content || []).map((c) => (c.type === 'text' ? c.text : '')).join('');
              let out = text;
              try {
                const j = JSON.parse(text);
                // Pulse's breakdowns, as Pulse computed them. A dimension with ONE member in this user's data (e.g. their
                // only client, tier, region) restates the total — it isn't a driver — so tell the model which those are.
                const breakdowns = (j.source_insights || [])
                  .filter((si) => /drivers|detractors/.test(si.type) && si.facts?.dimension)
                  .map((si) => ({ dimension: si.facts.dimension.label, members_in_your_data: si.facts.total_members, top: (si.facts.drivers || []).slice(0, 3).map((d) => `${d.entity} ${d.change_value?.formatted ?? ''}`.trim()) }));
                const single = [...new Set(breakdowns.filter((b) => b.members_in_your_data <= 1).map((b) => b.dimension))];
                // Pulse's prose lists those single-value slices too ("Client Name: Northstar … −0.15"). The model kept
                // repeating them despite the instruction (verified twice), so drop those lines from what it reads.
                // Pulse's numbers are untouched; only lines that are about a single-value dimension are left out.
                // Match on the slice's VALUE (Pulse writes "Client = Northstar Enterprises", not the dimension label).
                const singleValues = (j.source_insights || [])
                  .filter((si) => /drivers|detractors/.test(si.type) && si.facts?.total_members <= 1)
                  .flatMap((si) => (si.facts.drivers || []).map((d) => String(d.entity || '')))
                  .filter((v) => v.length > 2);
                const isSingleLine = (line) => singleValues.some((v) => line.includes(v));
                const answer = (j.markup || '')
                  .replace(/<[^>]+>/g, '')
                  .replace(/&amp;/g, '&')
                  .split('\n')
                  .filter((line) => !isSingleLine(line))
                  .join('\n');
                out = JSON.stringify({
                  answer,
                  real_drivers: breakdowns.filter((b) => b.members_in_your_data > 1),
                  not_drivers_single_value: single.length ? `${single.join(', ')}: only one value in this user's data, so it equals the whole change. Do not list these as drivers or "concentrated in".` : null,
                  follow_up_questions: (j.follow_up_questions || []).map((q) => q?.content ?? q),
                  not_enough_information: j.not_enough_information
                });
              } catch (e) {
                console.warn('[mcp] could not post-process Pulse brief; passing raw text:', e.message, '| starts:', text.slice(0, 120));
              }
              output = out.slice(0, MAX_TOOL_RESULT_CHARS);
              steps.push({ tool: 'generate-pulse-insight-brief', group: 'agents', args: { question: briefRequest.messages[0].content, metrics: ctx.map((c) => c.metadata?.name) }, ok: !result.isError, ms: Date.now() - started, ...(result.isError ? { error: text.slice(0, 300) } : {}) });
              messages.push({ role: 'tool', tool_call_id: call.id, content: output });
              continue;
            }
            if (!ALLOWED_TOOLS.includes(name)) throw new Error(`Tool ${name} is not allowed in this portal.`);
            if (DATASOURCE_TOOLS.has(name) && !allowedLuids.has(args.datasourceLuid)) {
              throw new Error(`Data source ${args.datasourceLuid} is not one of this customer's data sources. Use one of: ${[...allowedLuids].join(', ')}`);
            }
            if (VIEW_TOOLS.has(name) && !allowedViews.has(args.viewId)) {
              throw new Error(`View ${args.viewId} is not one of this customer's dashboards. Use one of: ${[...allowedViews.keys()].join(', ')}`);
            }
            if (name === 'get-view-image') args = { ...args, format: 'PNG', width: Math.min(Number(args.width) || 1000, 1200) };
            let result = await client.callTool({ name, arguments: args });
            // search-content runs as the user (so it only finds what they can open); also drop anything that isn't
            // one of this customer's dashboards or data sources, so the agent never surfaces other Apex content.
            if (name === 'search-content' && !result.isError) result = scopeSearch(result, allowedViews, allowedLuids);
            const image = !result.isError && name === 'get-view-image' ? resultImage(result) : null;
            if (image) images.push({ view: allowedViews.get(args.viewId)?.title || 'Dashboard', src: image });
            output = image ? `Image of "${allowedViews.get(args.viewId)?.title}" retrieved and shown to the user under your answer.` : resultText(result);
            steps.push({ tool: name, group: groupOf(name), args, ok: !result.isError, ms: Date.now() - started, ...(result.isError ? { error: output.slice(0, 300) } : {}), ...(image ? { image: true } : {}) });
          } catch (e) {
            output = `Error: ${e.message}`;
            steps.push({ tool: name, group: name === 'propose_action' ? 'workflows' : groupOf(name), args, ok: false, ms: Date.now() - started, error: e.message.slice(0, 300) });
          }
          messages.push({ role: 'tool', tool_call_id: call.id, content: output });
        }
      }
      return done('I couldn’t finish that analysis in the allowed number of steps. Try a narrower question.');
    } finally {
      client.close().catch(() => {});
    }
  }

  return { ask, configured };
}

module.exports = { createMcpAgent, ALLOWED_TOOLS, TOOL_GROUPS };
