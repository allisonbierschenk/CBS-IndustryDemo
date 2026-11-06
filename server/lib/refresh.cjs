// On-demand refresh of a published data source (Tableau REST API).
//   POST /api/{v}/sites/{site}/datasources/{id}/refresh   → 202 + job   (scope tableau:tasks:run)
//   GET  /api/{v}/sites/{site}/jobs/{job-id}              → progress, finishCode, notes (scope tableau:jobs:read)
// Tableau only lets the data source owner, a project leader or an admin refresh (a client user gets 403), so the
// portal makes these calls as the data source owner — read from Tableau at runtime — or REFRESH_AS_USER if set.
// End users never get those rights: the portal checks they're entitled to the dashboard before asking Tableau.
const { mintEmbedToken } = require('./jwt.cjs');

const SCOPES = ['tableau:content:read', 'tableau:users:read', 'tableau:tasks:run', 'tableau:jobs:read'];
const SESSION_TTL_MS = 100 * 60 * 1000;

function createRefresher({ server, site, apiVersion = '3.27', clientId, secretId, secretValue, asUser }) {
  const sessions = new Map(); // username -> { token, siteId, expires }

  async function signIn(username) {
    const { token } = mintEmbedToken({ clientId, secretId, secretValue, username, scopes: SCOPES });
    const res = await fetch(`${server}/api/${apiVersion}/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ credentials: { jwt: token, site: { contentUrl: site } } })
    });
    const text = await res.text();
    if (!res.ok) throw Object.assign(new Error(`Tableau sign-in as ${username} failed (HTTP ${res.status}): ${text.slice(0, 300)}`), { status: 502 });
    const { credentials } = JSON.parse(text);
    const s = { token: credentials.token, siteId: credentials.site.id, expires: Date.now() + SESSION_TTL_MS };
    sessions.set(username, s);
    console.log(`⚡ Refresh session as ${username}`);
    return s;
  }
  const session = async (username) => {
    const s = sessions.get(username);
    return s && s.expires > Date.now() ? s : signIn(username);
  };

  // Tableau's JSON error → readable message (keeps its code, e.g. 409093 "Operation already in Queue").
  const tableauError = (status, text) => {
    try {
      const e = JSON.parse(text).error;
      return Object.assign(new Error(`${e.summary}: ${e.detail} (Tableau ${status}, code ${e.code})`), { status, code: e.code });
    } catch {
      return Object.assign(new Error(`Tableau HTTP ${status}: ${text.slice(0, 300)}`), { status });
    }
  };

  async function call(username, method, path, body) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const s = attempt === 0 ? await session(username) : await signIn(username);
      const res = await fetch(`${server}/api/${apiVersion}/sites/${s.siteId}${path}`, {
        method,
        headers: { 'X-Tableau-Auth': s.token, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      if (res.status === 401 && attempt === 0) continue;
      const text = await res.text();
      if (!res.ok) throw tableauError(res.status, text);
      return text ? JSON.parse(text) : {};
    }
  }

  // The user session's token has no tableau:users:read, so the owner's username is looked up with a
  // users:read-only session minted for the user. Returns the owner's Tableau username.
  async function ownerName(ownerId, viewerUsername) {
    const { token } = mintEmbedToken({ clientId, secretId, secretValue, username: viewerUsername, scopes: ['tableau:users:read'] });
    const si = await fetch(`${server}/api/${apiVersion}/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ credentials: { jwt: token, site: { contentUrl: site } } })
    });
    const st = await si.text();
    if (!si.ok) throw tableauError(si.status, st);
    const c = JSON.parse(st).credentials;
    const res = await fetch(`${server}/api/${apiVersion}/sites/${c.site.id}/users/${ownerId}`, { headers: { 'X-Tableau-Auth': c.token, Accept: 'application/json' } });
    const text = await res.text();
    if (!res.ok) throw tableauError(res.status, text);
    return JSON.parse(text).user?.name;
  }

  /** Who the refresh runs as: REFRESH_AS_USER, else the data source owner's username. Cached per data source. */
  const owners = new Map();
  async function refreshIdentity(datasource, viewerUsername) {
    if (asUser) return asUser;
    const ownerId = datasource.owner?.id;
    if (!ownerId) throw new Error('The data source has no owner in Tableau, and REFRESH_AS_USER is not set.');
    if (!owners.has(ownerId)) {
      const name = await ownerName(ownerId, viewerUsername);
      if (!name) throw new Error(`Couldn't look up the data source owner (${ownerId}). Set REFRESH_AS_USER in .env.`);
      owners.set(ownerId, name);
    }
    return owners.get(ownerId);
  }

  /** Start "Update Data Source Now". Returns { jobId, createdAt, runAs }. */
  async function start(datasource, viewerUsername) {
    const runAs = await refreshIdentity(datasource, viewerUsername);
    const j = await call(runAs, 'POST', `/datasources/${datasource.id}/refresh`, {});
    const job = j.job || {};
    return { jobId: job.id, createdAt: job.createdAt, type: job.type, runAs };
  }

  /** "Query Job": { progress, finishCode, completedAt, notes, done, ok }. */
  async function job(runAs, jobId) {
    const j = (await call(runAs, 'GET', `/jobs/${jobId}`)).job || {};
    const notes = [].concat(j.statusNotes?.statusNote || []).map((n) => n.text).filter(Boolean);
    const finish = j.finishCode != null ? Number(j.finishCode) : null;
    const done = Boolean(j.completedAt) || finish === 0 || finish === 1 || finish === 2;
    return {
      id: j.id,
      type: j.type,
      progress: j.progress != null ? Number(j.progress) : null,
      createdAt: j.createdAt,
      startedAt: j.startedAt,
      completedAt: j.completedAt || null,
      finishCode: finish,
      done,
      ok: done && finish === 0,
      notes
    };
  }

  return { start, job };
}

module.exports = { createRefresher };
