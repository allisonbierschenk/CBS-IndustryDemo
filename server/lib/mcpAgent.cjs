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

// Read-only tools offered to the model. list-datasources is deliberately left out: the model is given
// the customer's entitled data sources (name + LUID) up front instead of roaming the site.
const ALLOWED_TOOLS = [
  'get-datasource-metadata',
  'query-datasource',
  'list-pulse-metric-subscriptions',
  'list-pulse-metrics-from-metric-ids',
  'list-pulse-metric-definitions-from-definition-ids',
  'generate-pulse-metric-value-insight-bundle'
];
// Tools whose datasourceLuid argument must be one of the customer's entitled data sources.
const DATASOURCE_TOOLS = new Set(['get-datasource-metadata', 'query-datasource']);

const MAX_STEPS = 12;
const MAX_TOOL_RESULT_CHARS = 15000;

function systemPrompt({ tenantName, datasources }) {
  return `You are the Apex Consulting analytics assistant inside the Client Value Intelligence portal.
You are talking to a user from ${tenantName}. Answer questions about their engagements and results using the
Tableau MCP tools. Be concise and businesslike: a short answer, then key numbers as a few bullets.
Use **bold** for key numbers. Plain markdown only: paragraphs, "- " bullets, "### " headings. No tables.
When ranking, list each item as its own bullet: "- **Technology**: **$5.8M**". Round money to $0.1M or $K like the dashboard.

# Data sources you may use (and no others)
${datasources.map((d) => `- "${d.name}" (${d.label}), datasourceLuid: ${d.luid}${d.dateField ? `, date field: "${d.dateField}"` : ''}`).join('\n')}

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
5. Pulse tools: list-pulse-metric-subscriptions shows the metrics this user follows; use the Pulse tools for
   questions about followed metrics, goals and insights.`;
}

/** Content of an MCP tool result → text for the model (truncated). */
function resultText(result) {
  const text = (result.content || [])
    .map((c) => (c.type === 'text' ? c.text : c.type === 'resource' ? c.resource?.text || '' : `[${c.type}]`))
    .join('\n');
  return text.length > MAX_TOOL_RESULT_CHARS ? `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n…(truncated)` : text;
}

function createMcpAgent({ mcpUrl, openaiKey, model, restSession, forgetSession }) {
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
  async function ask(user, { question, history = [], tenantName, datasources }) {
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
      const tools = available.map((t) => ({
        type: 'function',
        function: { name: t.name, description: (t.description || '').slice(0, 1024), parameters: t.inputSchema || { type: 'object', properties: {} } }
      }));
      const allowedLuids = new Set(datasources.map((d) => d.luid));

      const messages = [{ role: 'system', content: systemPrompt({ tenantName, datasources }) }, ...history, { role: 'user', content: question }];
      for (let i = 0; i < MAX_STEPS; i++) {
        const msg = await openai(messages, tools);
        messages.push(msg);
        if (!msg.tool_calls?.length) return { content: msg.content || '', steps, toolsOffered: available.map((t) => t.name) };

        for (const call of msg.tool_calls) {
          const name = call.function.name;
          const started = Date.now();
          let args = {};
          let output;
          try {
            args = JSON.parse(call.function.arguments || '{}');
            if (!ALLOWED_TOOLS.includes(name)) throw new Error(`Tool ${name} is not allowed in this portal.`);
            if (DATASOURCE_TOOLS.has(name) && !allowedLuids.has(args.datasourceLuid)) {
              throw new Error(`Data source ${args.datasourceLuid} is not one of this customer's data sources. Use one of: ${[...allowedLuids].join(', ')}`);
            }
            const result = await client.callTool({ name, arguments: args });
            output = resultText(result);
            steps.push({ tool: name, args, ok: !result.isError, ms: Date.now() - started, ...(result.isError ? { error: output.slice(0, 300) } : {}) });
          } catch (e) {
            output = `Error: ${e.message}`;
            steps.push({ tool: name, args, ok: false, ms: Date.now() - started, error: e.message.slice(0, 300) });
          }
          messages.push({ role: 'tool', tool_call_id: call.id, content: output });
        }
      }
      return { content: 'I couldn’t finish that analysis in the allowed number of steps. Try a narrower question.', steps, toolsOffered: available.map((t) => t.name) };
    } finally {
      client.close().catch(() => {});
    }
  }

  return { ask, configured };
}

module.exports = { createMcpAgent, ALLOWED_TOOLS };
