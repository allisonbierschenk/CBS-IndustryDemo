// Apex Consulting — Client Value Intelligence Portal (server)
// Responsibilities:
//   • Sign demo users in from the Apex user store (server/data/users.json)
//   • Resolve tenant + entitlements server-side (Standard vs Premium, Northstar transportation)
//   • Mint Tableau Connected App (Direct Trust) JWTs with the user's 'client name' attribute
//   • Hand out Tableau view / Pulse URLs ONLY for content the customer is entitled to
require('dotenv').config();

const crypto = require('crypto');
const path = require('path');
const express = require('express');
const { createCookieJar } = require('./lib/session.cjs');
const { mintEmbedToken, DEFAULT_SCOPES } = require('./lib/jwt.cjs');
const { createPulseClient, extractSeries } = require('./lib/pulse.cjs');
const { createMcpAgent, TOOL_GROUPS } = require('./lib/mcpAgent.cjs');
const { createDataDetails, parseViewUrl } = require('./lib/dataDetails.cjs');
const { createRefresher } = require('./lib/refresh.cjs');
const activity = require('./lib/activity.cjs');
const registerFeatures = require('./routes/features.cjs');
const store = require('./lib/store.cjs');

const env = {
  server: (process.env.TABLEAU_SERVER || '').replace(/\/+$/, ''),
  site: process.env.TABLEAU_SITE || '',
  clientId: process.env.CONNECTED_APP_CLIENT_ID,
  secretId: process.env.CONNECTED_APP_SECRET_ID,
  secretValue: process.env.CONNECTED_APP_SECRET_VALUE,
  ttl: Number(process.env.JWT_TTL_SECONDS || 300),
  attributeClaim: process.env.USER_ATTRIBUTE_CLAIM || 'client name',
  // Optional override of the embed token's scopes (comma separated). Default: see DEFAULT_SCOPES in lib/jwt.cjs
  embedScopes: (process.env.TABLEAU_EMBED_SCOPES || '').split(',').map((x) => x.trim()).filter(Boolean),
  sessionSecret: process.env.SESSION_SECRET,
  port: Number(process.env.PORT || 3000),
  production: process.env.NODE_ENV === 'production'
};

if (!env.sessionSecret || env.sessionSecret.length < 32) {
  if (env.production) {
    console.error('✖ SESSION_SECRET must be set to a random string of at least 32 characters (see .env.example).');
    process.exit(1);
  }
  env.sessionSecret = crypto.randomBytes(32).toString('hex');
  console.warn('⚠ SESSION_SECRET not set — using a temporary one (you will be signed out when the server restarts).');
}

const SESSION_COOKIE = 'apex_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const jar = createCookieJar({ secret: env.sessionSecret, secure: env.production });
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));

// ── Security headers ────────────────────────────────────────────────────────
const TABLEAU_SOURCES = ['https://*.online.tableau.com', 'https://*.tableau.com', env.server].filter(Boolean).join(' ');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      `script-src 'self' ${TABLEAU_SOURCES}`,
      `frame-src ${TABLEAU_SOURCES}`,
      `connect-src 'self' ${TABLEAU_SOURCES}`,
      `img-src 'self' data: blob: ${TABLEAU_SOURCES}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
  );
  next();
});

// ── Session helpers ─────────────────────────────────────────────────────────
// Demo upgrade: a Standard client can "buy" Premium during the demo. It lives only in this portal session
// (signed cookie), so signing out or switching users resets it. While upgraded, the tenant is treated as
// Premium and the JWT's 'subscription tier' attribute says Premium, so Tableau sees it too.
function withUpgrade(user, s) {
  if (!user || !s?.upgraded) return user;
  return { ...user, attributes: { ...user.attributes, 'subscription tier': ['Premium'] }, upgradedInSession: true };
}
function tenantForSession(user) {
  const t = store.tenantFor(user);
  return t && user?.upgradedInSession ? { ...t, tier: 'premium', upgradedInSession: true } : t;
}

function currentUser(req) {
  const s = jar.read(req, SESSION_COOKIE);
  return s ? withUpgrade(store.findUserById(s.uid), s) : null;
}

function startSession(res, user) {
  // A brand-new signed session per sign-in / user switch — nothing carries over between customers.
  jar.write(res, SESSION_COOKIE, { uid: user.id, sid: crypto.randomUUID() }, SESSION_TTL_MS);
}

function requireUser(req, res, next) {
  const user = currentUser(req);
  const tenant = tenantForSession(user);
  if (!user || !tenant) return res.status(401).json({ error: 'Not signed in' });
  req.user = user;
  req.tenant = tenant;
  next();
}

// Naive in-memory login throttle (per IP)
const attempts = new Map();
function throttle(req, res, next) {
  const now = Date.now();
  const a = attempts.get(req.ip) || { count: 0, reset: now + 15 * 60 * 1000 };
  if (now > a.reset) Object.assign(a, { count: 0, reset: now + 15 * 60 * 1000 });
  a.count += 1;
  attempts.set(req.ip, a);
  if (a.count > 60) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  next();
}

// ── Token minting ───────────────────────────────────────────────────────────
function mintFor(user) {
  // Every attribute in the user store becomes a JWT user-attribute claim (values always sent as arrays).
  const attributes = Object.fromEntries(
    Object.entries(user.attributes || {}).map(([k, v]) => [k, Array.isArray(v) ? v : [v]]).filter(([, v]) => v.length)
  );
  if (!attributes[env.attributeClaim]) {
    throw new Error(`User ${user.id} has no '${env.attributeClaim}' attribute — refusing to mint a token without row-level security context.`);
  }
  return mintEmbedToken({
    clientId: env.clientId,
    secretId: env.secretId,
    secretValue: env.secretValue,
    username: user.email, // JWT sub = the user's email (their Tableau Cloud username)
    attributes,
    ttlSeconds: env.ttl,
    ...(env.embedScopes.length ? { scopes: env.embedScopes } : {})
  });
}

// The JWT is visible to the browser anyway (Tableau docs note it can be decoded), so the decoded
// claims are returned for the "under the hood" panel. The signing secret never leaves the server.
const tokenResponse = (minted) => ({ token: minted.token, expiresAt: minted.claims.exp * 1000, claims: minted.claims });

const monthsBetween = (fromIso, to = new Date()) => {
  const f = new Date(fromIso);
  return (to.getUTCFullYear() - f.getUTCFullYear()) * 12 + (to.getUTCMonth() - f.getUTCMonth());
};

function personaSummary(u) {
  const t = store.tenantFor(u);
  return {
    userId: u.id,
    tenantId: u.tenantId,
    email: u.email,
    persona: u.persona || 'Executive',
    scope: store.scopeFor(u).label,
    name: u.name,
    title: u.title,
    clientName: t.clientName,
    shortName: t.shortName,
    monogram: t.monogram,
    color: t.color,
    industry: t.industry,
    tier: t.tier,
    demoFocus: t.demoFocus,
    hasTransportation: (t.features || []).includes('transportation'),
    story: t.presenterNotes?.story,
    owner: (u.roles || []).includes('activity') // demo owner: can run the demo reset
  };
}

// ── Public config + demo users ──────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({
    tableauServer: env.server,
    embeddingLibrary: env.server ? `${env.server}/javascripts/api/tableau.embedding.3.latest.min.js` : null,
    connectedAppConfigured: Boolean(env.clientId && env.secretId && env.secretValue && env.server)
  });
});

app.get('/api/users', (req, res) => res.json({ personas: store.users.map(personaSummary) }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ── Auth: click a user → sign in as that customer and mint their JWT (demo: no password) ──
app.post('/api/auth/login', throttle, (req, res) => {
  const user = store.findUserById(req.body?.userId);
  if (!user) return res.status(404).json({ error: 'Unknown user' });

  startSession(res, user);
  pulse.forgetSession(user); forgetMcpSession(user); // a fresh sign-in never inherits an earlier session's (e.g. upgraded) attributes
  console.log(`→ signed in ${user.id} (${user.email})`);
  activity.record(user, store.tenantFor(user), 'sign-in', {});
  features.warmAttention(user); // start the (slow) Pulse brief now so Home doesn't wait for it

  // Mint a token right away so the browser can show (and log) exactly what Tableau will receive.
  // Only the signed token leaves the server — never the connected app secret.
  try {
    const minted = mintFor(user);
    res.json({ ok: true, token: minted.token, claims: minted.claims });
  } catch (e) {
    res.json({ ok: true, token: null, claims: { error: e.message } });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const user = currentUser(req);
  if (user) { pulse.forgetSession(user); forgetMcpSession(user); } // next Tableau session uses the stored (non-upgraded) attributes
  jar.clear(res, SESSION_COOKIE);
  res.json({ ok: true });
});

// Demo checkout: upgrade this session to Premium (reset by signing out / switching users).
app.post('/api/upgrade', requireUser, (req, res) => {
  if (req.tenant.tier === 'premium') return res.json({ ok: true, already: true });
  const s = jar.read(req, SESSION_COOKIE);
  jar.write(res, SESSION_COOKIE, { ...s, upgraded: true }, SESSION_TTL_MS);
  pulse.forgetSession(req.user); forgetMcpSession(req.user); // re-sign in to Tableau with subscription tier = Premium
  activity.record(req.user, req.tenant, 'upgrade', { plan: 'Premium', price: store.content.benchmarks?.price || '' });
  console.log(`→ demo upgrade: ${req.user.email} (${req.tenant.clientName}) → Premium for this session`);
  res.json({ ok: true });
});

// ── Customer context ────────────────────────────────────────────────────────
// "Who's signed in?" — answers 200 either way so a signed-out check doesn't log a red 401 in the console.
app.get('/api/me', (req, res) => {
  const user = currentUser(req);
  const tenant = tenantForSession(user);
  if (!user || !tenant) return res.json({ authenticated: false });
  const ent = store.entitlementsFor(tenant);

  const views = Object.fromEntries(
    Object.entries(store.content.views).map(([key, v]) => {
      const entitled = store.canAccessView(tenant, key);
      return [key, { key, title: v.title, subtitle: v.subtitle, width: v.width, height: v.height, filters: v.filters || [], search: v.search || null, entitled, configured: entitled && Boolean(v.url) }];
    })
  );

  const dd = store.content.drilldown;
  const ddActive = dd?.enabled && Boolean(store.content.views[dd.targetView]?.url) && store.canAccessView(tenant, dd.targetView);
  const ctx = store.content.views.valueIntelligence.contextLinks;
  res.json({
    authenticated: true,
    user: store.publicUser(user),
    tenant: { ...tenant, engagements: store.engagementsFor(user, tenant) },
    scope: store.scopeFor(user),
    relationship: { clientSince: tenant.clientSince, monthsOfHistory: Math.max(1, monthsBetween(tenant.clientSince)) },
    entitlements: [...ent],
    views,
    drilldown: ddActive ? dd : null,
    // Only links to pages this customer is entitled to ever reach the browser.
    contextLinks: ctx ? { field: ctx.field, links: ctx.links.filter((l) => store.canAccessView(tenant, l.view)) } : null,
    attributeClaim: env.attributeClaim,
    attributeClaims: Object.keys(user.attributes || {}),
    features: {
      scorecard: store.content.scorecard || null,
      authoring: (store.content.authoring?.requires || []).every((r) => ent.has(r)),
      activityLog: (user.roles || []).includes('activity'),
      slackChannels: store.slackChannelsFor(tenant),
      pulseGoals: ent.has('goals'),
      benchmarks: { price: store.content.benchmarks?.price || null, cover: store.content.benchmarks?.cover || null }
    }
  });
});

// ── Embed endpoints (URL + fresh single-use JWT, entitlement-checked) ───────
app.get('/api/embed/view/:key', requireUser, (req, res) => {
  const view = store.content.views[req.params.key];
  if (!view) return res.status(404).json({ error: 'Unknown view' });
  if (!store.canAccessView(req.tenant, req.params.key)) {
    return res.status(403).json({ error: 'Your subscription does not include this analytics experience.' });
  }
  if (!view.url) return res.json({ configured: false });
  try {
    activity.record(req.user, req.tenant, 'dashboard-token', { view: view.title });
    res.json({ configured: true, src: view.url, ...tokenResponse(mintFor(req.user)) });
  } catch (e) {
    console.error('token error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Agent: Tableau Pulse Insight Brief (server-side proxy, per-user Tableau session) ──
const userAttributes = (user) =>
  Object.fromEntries(Object.entries(user.attributes || {}).map(([k, v]) => [k, Array.isArray(v) ? v : [v]]));
const pulse = createPulseClient({
  server: env.server,
  site: env.site,
  clientId: env.clientId,
  secretId: env.secretId,
  secretValue: env.secretValue,
  attributeFor: userAttributes
});

function agentScope(tenant) {
  const cfg = store.content.agent;
  const ent = store.entitlementsFor(tenant);
  return { datasources: cfg.datasources.filter((d) => (d.requires || []).every((r) => ent.has(r))) };
}

// Featured metrics (config) first, then the rest alphabetically.
function orderMetrics(ctx) {
  const featured = store.content.agent.featuredMetrics || [];
  const rank = (n) => (featured.includes(n) ? featured.indexOf(n) : featured.length);
  return [...ctx].sort((a, b) => rank(a.item.metadata.name) - rank(b.item.metadata.name) || a.item.metadata.name.localeCompare(b.item.metadata.name));
}

app.get('/api/agent/context', requireUser, async (req, res) => {
  try {
    const ctx = orderMetrics(await pulse.metricContext(req.user, agentScope(req.tenant)));
    const metrics = ctx.map(({ source, item }) => ({ name: item.metadata.name, metricId: item.metadata.metric_id, source }));
    const n = store.content.agent.suggestedQuestions || 4;
    const ask = (list) => list.slice(0, n).map((m) => `What are the ${m.name} trends?`);
    // One entry per data source the user follows metrics on (e.g. Value Intelligence, Transportation).
    const sources = [...new Set(metrics.map((m) => m.source))].map((label) => ({ label, count: metrics.filter((m) => m.source === label).length }));
    const suggestedBySource = Object.fromEntries(sources.map(({ label }) => [label, ask(metrics.filter((m) => m.source === label))]));
    res.json({ metrics, sources, suggested: ask(metrics), suggestedBySource });
  } catch (e) {
    console.error('agent context error:', e.message);
    res.status(502).json({ error: e.message });
  }
});

// Conversations live on the server (the Pulse history repeats the full metric context every turn —
// too large to round-trip, and the browser shouldn't be able to edit what's sent to Tableau).
const conversations = new Map(); // id -> { userId, messages, at }
const CONVERSATION_TTL_MS = 60 * 60 * 1000;
setInterval(() => {
  for (const [id, c] of conversations) if (Date.now() - c.at > CONVERSATION_TTL_MS) conversations.delete(id);
}, 5 * 60 * 1000).unref();

app.post('/api/agent/chat', requireUser, async (req, res) => {
  const question = String(req.body?.question || '').trim().slice(0, 1000);
  if (!question) return res.status(400).json({ error: 'Please enter a question.' });
  // source: a data source label (e.g. "Transportation") to ask only that source's metrics; default all.
  const source = String(req.body?.source || 'all');
  const found = conversations.get(String(req.body?.conversationId || ''));
  const prior = found && found.userId === req.user.id && found.source === source ? found : null; // switching source = new conversation
  const conversationId = prior ? req.body.conversationId : require('crypto').randomUUID();
  const history = prior ? prior.messages.slice(-20) : [];
  const started = Date.now();
  try {
    const all = await pulse.metricContext(req.user, agentScope(req.tenant));
    if (!all.length) return res.status(404).json({ error: 'You aren’t following any metrics yet, so the agent has nothing to answer from.' });
    const ctx = source === 'all' ? all : all.filter((c) => c.source === source);
    if (!ctx.length) return res.status(400).json({ error: `You don’t follow any metrics on ${source}.` });
    const messages = [
      ...history,
      {
        role: 'ROLE_USER',
        content: question,
        action_type: 'ACTION_TYPE_ANSWER',
        metric_group_context: ctx.map((c) => c.item),
        metric_group_context_resolved: false // message-level field (rejected on the context items)
      }
    ];
    const r = await pulse.brief(req.user, messages);
    const content = r.markup || '';
    const assistant = { role: 'ROLE_ASSISTANT', content, metric_group_context: r.group_context ?? [], metric_group_context_resolved: true };
    res.json({
      content,
      notEnoughInformation: Boolean(r.not_enough_information),
      followups: (r.follow_up_questions || []).map((q) => q?.content ?? q).filter(Boolean),
      insightCards: (r.source_insights || []).map((si) => ({
        id: si.id,
        type: si.type,
        markup: si.markup,
        series: extractSeries(si.viz, si.type),
        // Pulse's own period-over-period facts (values exactly as Tableau formatted them), for the KPI card.
        facts:
          si.type === 'popc' && si.facts?.target_period_value
            ? {
                now: si.facts.target_period_value.formatted,
                was: si.facts.comparison_period_value?.formatted || null,
                rel: si.facts.difference?.relative?.formatted || null,
                abs: si.facts.difference?.absolute?.formatted || null,
                dir: si.facts.difference?.direction || null,
                period: si.facts.target_time_period?.label || null,
                vs: si.facts.comparison_time_period?.label || null
              }
            : null
      })),
      conversationId,
      source,
      metricCount: ctx.length
    });
    conversations.set(conversationId, { userId: req.user.id, source, messages: [...messages, assistant], at: Date.now() });
    console.log(`⚡ brief for ${req.user.email} in ${Date.now() - started} ms (${ctx.length} metrics, source: ${source})`);
    activity.record(req.user, req.tenant, 'agent-question', { question, source, ms: Date.now() - started });
  } catch (e) {
    console.error('agent chat error:', e.message);
    res.status(502).json({ error: e.message });
  }
});

// ── On-demand refresh: REST "Update Data Source Now" + "Query Job" on the dashboard's published data source ──
// The client user can't refresh (Tableau 403), so the call runs as the data source owner (or REFRESH_AS_USER),
// only after the portal checks the user is entitled to the dashboard. See server/lib/refresh.cjs.
const refresher = createRefresher({ server: env.server, site: env.site, clientId: env.clientId, secretId: env.secretId, secretValue: env.secretValue, asUser: process.env.REFRESH_AS_USER || null });
const refreshJobs = new Map(); // jobId -> { userId, runAs, datasource, viewKey, at }
const runningByDatasource = new Map(); // datasource id -> jobId (one refresh at a time per data source)
setInterval(() => {
  for (const [id, j] of refreshJobs) if (Date.now() - j.at > 2 * 60 * 60 * 1000) refreshJobs.delete(id);
}, 10 * 60 * 1000).unref();

app.post('/api/refresh/:viewKey', requireUser, async (req, res) => {
  const viewKey = req.params.viewKey;
  if (!store.canAccessView(req.tenant, viewKey)) return res.status(403).json({ error: 'Your subscription does not include this dashboard.' });
  const cfg = (store.content.agent.datasources || []).find((d) => d.view === viewKey);
  if (!cfg) return res.status(404).json({ error: 'No published data source is configured for this dashboard.' });
  try {
    const list = await pulse.request(req.user, 'GET', `/datasources?filter=${encodeURIComponent(`name:eq:${cfg.name}`)}`, null, { base: 'rest' });
    const ds = list.datasources?.datasource?.[0];
    if (!ds) return res.status(404).json({ error: `Data source "${cfg.name}" not found in Tableau.` });
    const running = runningByDatasource.get(ds.id);
    if (running && refreshJobs.has(running)) {
      return res.json({ jobId: running, datasource: ds.name, alreadyRunning: true });
    }
    const r = await refresher.start(ds, req.user.email);
    refreshJobs.set(r.jobId, { userId: req.user.id, runAs: r.runAs, datasource: { id: ds.id, name: ds.name }, viewKey, at: Date.now() });
    runningByDatasource.set(ds.id, r.jobId);
    console.log(`⚡ refresh requested by ${req.user.email}: ${ds.name} → job ${r.jobId} (as ${r.runAs})`);
    activity.record(req.user, req.tenant, 'refresh-data', { view: viewKey, datasource: ds.name, job: r.jobId });
    res.status(202).json({ jobId: r.jobId, createdAt: r.createdAt, datasource: ds.name, datasourceId: ds.id, request: `POST /api/3.27/sites/{site}/datasources/${ds.id}/refresh` });
  } catch (e) {
    console.error('refresh error:', e.message);
    res.status(e.status && e.status < 500 ? e.status : 502).json({ error: e.message, code: e.code || null });
  }
});

app.get('/api/refresh/jobs/:jobId', requireUser, async (req, res) => {
  const meta = refreshJobs.get(req.params.jobId);
  if (!meta || meta.userId !== req.user.id) return res.status(404).json({ error: 'Unknown refresh job.' });
  try {
    const j = await refresher.job(meta.runAs, req.params.jobId);
    if (j.done) runningByDatasource.delete(meta.datasource.id);
    res.json({ ...j, datasource: meta.datasource.name });
  } catch (e) {
    console.error('refresh job error:', e.message);
    res.status(502).json({ error: e.message });
  }
});

// ── Data Details: data catalog panel for an embedded view (Metadata API + REST, as the user) ──
// Ported from Tab-SE/embedding_playbook (api/data-details). The Embedding API half runs in the browser.
const dataDetails = createDataDetails({ server: env.server, restSession: pulse.restSession });
app.get('/api/data-details', requireUser, async (req, res) => {
  const src = String(req.query.src || '');
  const parsed = (() => {
    try {
      return parseViewUrl(src);
    } catch {
      return null;
    }
  })();
  if (!parsed) return res.status(400).json({ error: `Unrecognized view URL: ${src}` });
  if (parsed.origin !== env.server || parsed.site !== env.site) return res.status(400).json({ error: 'That view is not on this Tableau site.' });
  try {
    res.json(await dataDetails.forView(req.user, src));
    activity.record(req.user, req.tenant, 'data-details', { view: parsed.view });
  } catch (e) {
    console.error('data details error:', e.message);
    res.status(e.status || 502).json({ error: e.message });
  }
});

// ── Data Agent: OpenAI + Tableau MCP server (passthrough auth, per-user Tableau session) ──
// The user's own REST session token is forwarded to the MCP server as X-Tableau-Auth, so every
// MCP tool call runs as that user: Tableau permissions + row-level security apply. See docs/MCP_AGENT.md.
// Separate Tableau session from the Pulse one: these scopes cover the REST/VDS/Pulse calls the MCP tools make.
const MCP_SCOPES = [
  'tableau:content:read',
  'tableau:mcp_site_settings:read',
  'tableau:viz_data_service:read',
  'tableau:views:download', // get-view-data / get-view-image
  'tableau:insight_definitions_metrics:read',
  'tableau:insight_metrics:read',
  'tableau:metric_subscriptions:read',
  'tableau:insights:read',
  'tableau:insight_brief:create',
  'tableau:entitlements:read',
  // Tableau Cloud releases older than 2026.2 also require the wildcard on passthrough JWT sessions.
  ...(process.env.TABLEAU_MCP_WILDCARD_SCOPE === 'false' ? [] : ['tableau:*:*'])
];
const mcpTableau = createPulseClient({
  server: env.server,
  site: env.site,
  clientId: env.clientId,
  secretId: env.secretId,
  secretValue: env.secretValue,
  attributeFor: userAttributes,
  scopes: MCP_SCOPES,
  label: 'MCP'
});
const mcpAgent = createMcpAgent({
  mcpUrl: process.env.TABLEAU_MCP_URL,
  openaiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  restSession: mcpTableau.restSession,
  forgetSession: mcpTableau.forgetSession,
  // Pulse metric context for ask_pulse_agent: the user's followed metrics on their entitled data sources.
  pulseContext: async (user) => (await pulse.metricContext(user, agentScope(store.tenantFor(user)))).map((c) => c.item)
});

// Hoisted so sign-in / sign-out / upgrade (defined above) can drop the MCP session too.
function forgetMcpSession(user) {
  mcpTableau.forgetSession(user);
}

/** The customer's entitled dashboards with their view LUIDs (resolved as the user, by URL), for get-view-data/-image. */
const mcpViewIds = new Map(); // viewKey -> luid (view LUIDs are site-wide)
async function mcpViews(user, tenant) {
  const out = [];
  for (const [key, v] of Object.entries(store.content.views)) {
    if (!v?.url || !store.canAccessView(tenant, key)) continue;
    try {
      if (!mcpViewIds.has(key)) {
        const m = /\/views\/([^/]+)\/([^/?#]+)/.exec(v.url);
        if (!m) continue;
        const j = await mcpTableau.request(user, 'GET', `/views?filter=${encodeURIComponent(`viewUrlName:eq:${m[2]}`)}&pageSize=50`, null, { base: 'rest' });
        const hit = (j.views?.view || []).find((x) => x.contentUrl === `${m[1]}/sheets/${m[2]}`);
        if (hit) mcpViewIds.set(key, hit.id);
      }
      if (mcpViewIds.has(key)) out.push({ key, title: v.title, luid: mcpViewIds.get(key), filters: (v.filters || []).map((f) => f.field) });
    } catch (e) {
      console.warn(`⚠ mcp: couldn't resolve view ${key}: ${e.message}`);
    }
  }
  return out;
}

/** The customer's entitled agent data sources with their LUIDs (resolved as the user). */
async function mcpDatasources(user, tenant) {
  const list = agentScope(tenant).datasources;
  return Promise.all(list.map(async (d) => ({ name: d.name, label: d.label, view: d.view, dateField: d.dateField, luid: await mcpTableau.resolveDatasource(user, d.name) })));
}

const MCP_MAX_QUESTIONS = 3;
const mcpConversations = new Map(); // id -> { userId, messages: [{role, content}], at }
setInterval(() => {
  for (const [id, c] of mcpConversations) if (Date.now() - c.at > CONVERSATION_TTL_MS) mcpConversations.delete(id);
}, 5 * 60 * 1000).unref();

app.get('/api/mcp/context', requireUser, async (req, res) => {
  if (!mcpAgent.configured()) return res.json({ configured: false });
  try {
    const datasources = await mcpDatasources(req.user, req.tenant);
    res.json({
      configured: true,
      mcpHost: new URL(process.env.TABLEAU_MCP_URL).host,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      maxQuestions: MCP_MAX_QUESTIONS,
      toolGroups: TOOL_GROUPS,
      datasources: datasources.map(({ name, label, view }) => ({ name, label, key: view })),
      // One per MCP group: data, a dashboard image, Pulse's agent, and signal → action.
      suggested: [
        'Which service line delivered the most business value?',
        'Show me my Value Intelligence dashboard',
        'Why is my Engagement Health metric down?',
        'Which engagement is most off track?'
      ]
    });
  } catch (e) {
    console.error('mcp context error:', e.message);
    res.status(502).json({ error: e.message });
  }
});

app.post('/api/mcp/chat', requireUser, async (req, res) => {
  const question = String(req.body?.question || '').trim().slice(0, 1000);
  if (!question) return res.status(400).json({ error: 'Please enter a question.' });
  const found = mcpConversations.get(String(req.body?.conversationId || ''));
  const prior = found && found.userId === req.user.id ? found : null;
  // Each Data Agent conversation is capped at MCP_MAX_QUESTIONS; after that the user must start a new chat.
  const asked = prior ? prior.messages.filter((m) => m.role === 'user').length : 0;
  if (asked >= MCP_MAX_QUESTIONS) {
    return res.status(429).json({ error: `This chat has reached its ${MCP_MAX_QUESTIONS}-question limit. Start a new chat to keep asking.`, code: 'limit', limit: MCP_MAX_QUESTIONS });
  }
  const conversationId = prior ? req.body.conversationId : crypto.randomUUID();
  const started = Date.now();
  try {
    const [datasources, views] = await Promise.all([mcpDatasources(req.user, req.tenant), mcpViews(req.user, req.tenant)]);
    const r = await mcpAgent.ask(req.user, { question, history: prior ? prior.messages.slice(-12) : [], tenantName: req.tenant.clientName, datasources, views });
    const turns = [...(prior?.messages || []), { role: 'user', content: question }, { role: 'assistant', content: r.content }];
    mcpConversations.set(conversationId, { userId: req.user.id, messages: turns, at: Date.now() });
    const ms = Date.now() - started;
    console.log(`⚡ MCP agent for ${req.user.email} in ${ms} ms (${r.steps.length} tool calls: ${r.steps.map((s) => `${s.tool}${s.ok ? '' : '✖'}`).join(', ')})`);
    activity.record(req.user, req.tenant, 'mcp-question', { question, ms, tools: r.steps.length });
    res.json({ content: r.content, steps: r.steps, images: r.images, action: r.action, conversationId, ms, asked: asked + 1, limit: MCP_MAX_QUESTIONS });
  } catch (e) {
    console.error('mcp chat error:', e.message);
    res.status(e.status || 502).json({ error: e.message });
  }
});

// ── Messages to the Apex engagement team (contact form + Premium requests) ──
// Demo: messages are kept in memory and written to the server log for the Apex team.
const messages = [];
const TOPICS = ['General question', 'Engagement update', 'Data or dashboard question', 'Schedule a review', 'Premium subscription', 'Billing'];
app.post('/api/messages', requireUser, (req, res) => {
  const topic = TOPICS.includes(req.body?.topic) ? req.body.topic : 'General question';
  const body = String(req.body?.message || '').trim().slice(0, 2000);
  if (!body) return res.status(400).json({ error: 'Please enter a message.' });
  const ref = `APX-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const to = req.tenant.accountManager || null;
  const entry = { ref, at: new Date().toISOString(), client: req.tenant.clientName, from: req.user.email, to: to?.email || null, topic, body };
  messages.push(entry);
  console.log('✉ message for Apex team', entry);
  activity.record(req.user, req.tenant, 'message', { topic, to: to?.email || '', ref });
  res.json({ ok: true, ref, topic, to });
});
app.get('/api/messages/topics', requireUser, (req, res) => res.json({ topics: TOPICS }));

// ── Portal capabilities (library, subscriptions, attention, links, authoring, feeds, activity) ──
const features = registerFeatures(app, { store, pulse, activity, requireUser, env, mintEmbedToken, mintFor, sessionSecret: env.sessionSecret });

// ── React build (production) — BrowserRouter fallback to index.html ─────────
const DIST = path.join(__dirname, '..', 'dist');
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use(express.static(DIST, { index: false }));
// index.html is served with absolute URLs for link-preview tags (og:image needs an absolute URL).
const fs = require('fs');
let indexHtml = null;
app.get('*', (req, res) => {
  try {
    indexHtml = indexHtml || fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  } catch {
    return res.status(503).send('Frontend not built yet — run `npm run build`, or use `npm run dev` and open http://localhost:5173');
  }
  const origin = `${req.protocol}://${req.get('host')}`;
  res.type('html').send(indexHtml.replaceAll('__ORIGIN__', origin));
});

app.listen(env.port, () => {
  console.log(`\nApex Client Value Intelligence API → http://localhost:${env.port}`);
  if (!env.server || !env.clientId) console.warn('⚠ Tableau Connected App not configured — embeds will show configuration placeholders.');
  console.log('  Login: one click per demo user (no password)');
  console.log(`  JWT user attributes: every key in users.json 'attributes' (required: '${env.attributeClaim}')  ·  embed scopes: ${(env.embedScopes.length ? env.embedScopes : DEFAULT_SCOPES).join(', ')}`);
});
