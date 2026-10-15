// Tableau Pulse client for the agent (Insight Brief API).
//  • One Tableau REST session per portal user: Connected App JWT with sub = the user's email,
//    so Pulse evaluates row-level security (USERNAME()) as that user.
//  • Pulse endpoints live under the version-less base `${server}/api/-`.
//  • The brief needs the embeddingsservice vendor media types; XSRF + cookies are forwarded when
//    Tableau issues them (not required on this site, but supported).
// Reference: POST /api/-/pulse/insights/brief (EmbeddingsService_GenerateInsightBrief), REST API 3.26+.
const { mintEmbedToken } = require('./jwt.cjs');

const BRIEF_TYPES = {
  contentType: 'application/vnd.tableau.pulse.embeddingsservice.v1.GenerateInsightBriefRequest+json',
  accept: 'application/vnd.tableau.pulse.embeddingsservice.v1.GenerateInsightBriefResponse+json'
};

// Scopes for the per-user REST/Pulse session (agent, attention panel, library, favorites,
// subscriptions, Pulse follows, data feeds). Each still respects the user's own Tableau permissions.
const SCOPES = [
  'tableau:content:read',
  'tableau:views:download',
  'tableau:favorites:update',
  'tableau:favorites:delete',
  'tableau:tasks:read',
  'tableau:tasks:create',
  'tableau:tasks:delete',
  'tableau:metric_subscriptions:read',
  'tableau:metric_subscriptions:create',
  'tableau:metric_subscriptions:delete',
  'tableau:insight_definitions_metrics:read',
  'tableau:insight_metrics:read',
  'tableau:insights:read',
  'tableau:insight_brief:create',
  'tableau:viz_data_service:read'
];

const SESSION_TTL_MS = 110 * 60 * 1000; // REST sessions last longer; renew well before, and on any 401
const CONTEXT_TTL_MS = 2 * 60 * 1000; // pick up follow/unfollow changes quickly

function createPulseClient({ server, site, apiVersion = '3.27', clientId, secretId, secretValue, attributeFor }) {
  const sessions = new Map(); // email -> { token, siteId, cookies, xsrf, expires }
  const datasourceIds = new Map(); // name -> luid (per process; names are site-wide)
  const contexts = new Map(); // userId -> { at, value }

  function captureCookies(session, res) {
    const list = res.headers.getSetCookie?.() || [];
    for (const c of list) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      if (i > 0) session.cookies[kv.slice(0, i).trim()] = kv.slice(i + 1);
    }
    if (session.cookies['XSRF-TOKEN']) session.xsrf = decodeURIComponent(session.cookies['XSRF-TOKEN']);
  }

  async function signIn(user) {
    const { token } = mintEmbedToken({ clientId, secretId, secretValue, username: user.email, attributes: attributeFor(user), scopes: SCOPES });
    const res = await fetch(`${server}/api/${apiVersion}/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ credentials: { jwt: token, site: { contentUrl: site } } })
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Tableau sign-in failed for ${user.email} (HTTP ${res.status}): ${text.slice(0, 400)}`);
    const { credentials } = JSON.parse(text);
    const session = { token: credentials.token, siteId: credentials.site.id, userId: credentials.user?.id, cookies: {}, xsrf: null, expires: Date.now() + SESSION_TTL_MS };
    captureCookies(session, res);
    sessions.set(user.email, session);
    console.log(`⚡ Pulse session for ${user.email}`);
    return session;
  }

  async function session(user) {
    const s = sessions.get(user.email);
    return s && s.expires > Date.now() ? s : signIn(user);
  }

  function headers(s, { contentType = 'application/json', accept = 'application/json' } = {}) {
    const h = { 'X-Tableau-Auth': s.token, 'Content-Type': contentType, Accept: accept, Origin: server, Referer: `${server}/` };
    if (s.xsrf) h['X-XSRF-Token'] = s.xsrf;
    const cookie = Object.entries(s.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) h.Cookie = cookie;
    return h;
  }

  // Authenticated request; re-signs in once on 401. `base` is 'pulse' (/api/-) or 'rest' (/api/{version}).
  async function request(user, method, path, body, { base = 'pulse', types } = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const s = attempt === 0 ? await session(user) : await signIn(user);
      const root = base === 'pulse' ? `${server}/api/-` : `${server}/api/${apiVersion}/sites/${s.siteId}`;
      const res = await fetch(`${root}${path}`, { method, headers: headers(s, types), body: body ? JSON.stringify(body) : undefined });
      captureCookies(s, res);
      if (res.status === 401 && attempt === 0) continue;
      const text = await res.text();
      if (!res.ok) {
        console.error(`✖ Tableau ${method} ${path} → ${res.status}`, Object.fromEntries(res.headers), text.slice(0, 2000));
        throw Object.assign(new Error(`Tableau ${method} ${path} failed (HTTP ${res.status}): ${text.slice(0, 600)}`), { status: res.status });
      }
      return text ? JSON.parse(text) : {};
    }
  }

  async function resolveDatasource(user, name) {
    if (datasourceIds.has(name)) return datasourceIds.get(name);
    const j = await request(user, 'GET', `/datasources?filter=name:eq:${encodeURIComponent(name)}&pageSize=10`, null, { base: 'rest' });
    const list = j.datasources?.datasource || [];
    if (list.length > 1) console.warn(`⚠ ${list.length} data sources are named "${name}" — using the most recently updated. Rename duplicates to avoid surprises.`);
    const pick = list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    if (!pick) throw new Error(`Pulse data source "${name}" not found on the site (or not visible to ${user.email}).`);
    datasourceIds.set(name, pick.id);
    return pick.id;
  }

  /**
   * Metric context for a user = ONLY the Pulse metrics that user follows in Tableau, further limited to
   * the data sources their portal entitlements allow (defense in depth). Row-level security on the
   * published data source scopes every metric to the user's own rows.
   */
  async function metricContext(user, { datasources }) {
    const cached = contexts.get(user.id);
    if (cached && Date.now() - cached.at < CONTEXT_TTL_MS) return cached.value;

    const allowed = new Map();
    for (const ds of datasources) allowed.set(await resolveDatasource(user, ds.name), ds);

    const { metric_groups = [] } = await request(user, 'GET', '/pulse/metrics:followedMetricsGroups');
    const followed = metric_groups.flatMap((g) => g.metrics || []);

    const items = await Promise.all(
      followed.map(async (m) => {
        try {
          const res = await request(user, 'GET', `/pulse/definitions/${m.definition_id}`);
          const d = res.definition ?? res;
          const source = allowed.get(d?.specification?.datasource?.id);
          if (!source) return null; // followed, but on a data source this customer isn't entitled to
          return {
            source: source.label,
            item: {
              metadata: { name: d.metadata.name, metric_id: m.id, definition_id: m.definition_id },
              metric: {
                definition: { datasource: d.specification.datasource, basic_specification: d.specification.basic_specification },
                metric_specification: {
                  measurement_period: m.specification?.measurement_period,
                  comparison: { comparison: m.specification?.comparison?.comparison ?? 'TIME_COMPARISON_PREVIOUS_PERIOD' }
                },
                // Required for breakdown questions ("which engagement type…") and correct number formatting.
                extension_options: d.extension_options,
                representation_options: d.representation_options,
                insights_options: d.insights_options
              }
            }
          };
        } catch (e) {
          console.warn(`⚠ skipping followed metric ${m.id}: ${e.message}`);
          return null;
        }
      })
    );
    const value = items.filter(Boolean);
    contexts.set(user.id, { at: Date.now(), value });
    return value;
  }

  async function brief(user, messages) {
    return request(user, 'POST', '/pulse/insights/brief', { messages }, { types: BRIEF_TYPES });
  }

  /** Raw authenticated GET (e.g. PNG thumbnails). */
  async function getBinary(user, restPath) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const s = attempt === 0 ? await session(user) : await signIn(user);
      const res = await fetch(`${server}/api/${apiVersion}/sites/${s.siteId}${restPath}`, { headers: { 'X-Tableau-Auth': s.token } });
      if (res.status === 401 && attempt === 0) continue;
      if (!res.ok) throw Object.assign(new Error(`Tableau GET ${restPath} failed (HTTP ${res.status})`), { status: res.status });
      return { type: res.headers.get('content-type'), body: Buffer.from(await res.arrayBuffer()) };
    }
  }

  async function me(user) {
    const s = await session(user);
    if (!s.userId) {
      const j = await request(user, 'GET', `/users?filter=name:eq:${encodeURIComponent(user.email)}`, null, { base: 'rest' });
      s.userId = j.users?.user?.[0]?.id;
    }
    return { userId: s.userId, siteId: s.siteId };
  }

  /** VizQL Data Service query as the user (RLS applies). Returns { ok, status, text }. */
  async function vds(user, datasourceLuid, fields) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const s = attempt === 0 ? await session(user) : await signIn(user);
      const res = await fetch(`${server}/api/v1/vizql-data-service/query-datasource`, {
        method: 'POST',
        headers: { 'X-Tableau-Auth': s.token, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ datasource: { datasourceLuid }, query: { fields } })
      });
      if (res.status === 401 && attempt === 0) continue;
      return { ok: res.ok, status: res.status, text: await res.text() };
    }
  }

  /** VizQL Data Service field list for a data source, as the user. Returns { ok, status, text }. */
  async function vdsMetadata(user, datasourceLuid) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const s = attempt === 0 ? await session(user) : await signIn(user);
      const res = await fetch(`${server}/api/v1/vizql-data-service/read-metadata`, {
        method: 'POST',
        headers: { 'X-Tableau-Auth': s.token, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ datasource: { datasourceLuid } })
      });
      if (res.status === 401 && attempt === 0) continue;
      return { ok: res.ok, status: res.status, text: await res.text() };
    }
  }

  const resetContext = (user) => contexts.delete(user.id);

  return { metricContext, brief, request, getBinary, me, resolveDatasource, resetContext, vds, vdsMetadata };
}

/** Vega-Lite spec → [{date, value}] for the trend chart (drops forecast/projection points). */
function extractSeries(spec, insightType) {
  if (!spec || insightType === 'popc') return null;
  const arrays = [];
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (Array.isArray(node.data?.values) && node.data.values.length >= 2) arrays.push(node.data.values);
    Object.values(node).forEach(walk);
  })(typeof spec === 'string' ? safeParse(spec) : spec);

  for (const rows of arrays) {
    const sample = rows[0] || {};
    const dateKey = 'truncDate' in sample ? 'truncDate' : Object.keys(sample).find((k) => /date/i.test(k) && /^\d{4}-\d{2}/.test(String(sample[k])));
    const valueKey = 'rawValue' in sample ? 'rawValue' : Object.keys(sample).find((k) => typeof sample[k] === 'number' && Math.abs(sample[k]) > 1000);
    if (!dateKey || !valueKey) continue;
    const points = rows
      .filter((r) => !r.isProjection)
      .map((r) => ({ date: String(r[dateKey]), value: Number(r[valueKey]) }))
      .filter((p) => p.date && Number.isFinite(p.value));
    if (points.length >= 2) return { points, dateKey, valueKey };
  }
  return null;
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

module.exports = { createPulseClient, extractSeries };
