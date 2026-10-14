// Portal activity log: who did what in the portal (sign-ins, dashboard views, exports, shares, agent
// questions, subscriptions, follows, favorites, data feeds). Kept in memory (newest first) and appended
// to data/activity.jsonl so it survives restarts on a persistent disk. Tableau-side activity is covered
// by Tableau Cloud Admin Insights.
const fs = require('fs');
const path = require('path');

const MAX = 2000;
const FILE = path.join(__dirname, '..', '..', 'data', 'activity.jsonl');
const entries = [];

try {
  const lines = fs.readFileSync(FILE, 'utf8').trim().split('\n').filter(Boolean).slice(-MAX);
  for (const l of lines) entries.unshift(JSON.parse(l));
} catch {
  /* no log yet */
}

function record(user, tenant, type, detail = {}) {
  const e = {
    at: new Date().toISOString(),
    type,
    user: user?.email || null,
    name: user?.name || null,
    persona: user?.persona || null,
    client: tenant?.clientName || null,
    detail
  };
  entries.unshift(e);
  if (entries.length > MAX) entries.length = MAX;
  fs.appendFile(FILE, `${JSON.stringify(e)}\n`, () => {});
  return e;
}

function list({ type, user, client, limit = 200 } = {}) {
  return entries.filter((e) => (!type || e.type === type) && (!user || e.user === user) && (!client || e.client === client)).slice(0, limit);
}

module.exports = { record, list };
