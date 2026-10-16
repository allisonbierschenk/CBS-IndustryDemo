// Salesforce (Sales Cloud) client for Apex's own org — the system of record for Apex's clients.
// Each portal client is an Account (Apex_Client_Id__c = tenant id) with Apex_Subscription_Tier__c; a self-service
// upgrade becomes a Closed Won Opportunity, and "Schedule with Apex" becomes a Task for the account team.
//
// Auth, in order:
//   SF_CLIENT_ID + SF_CLIENT_SECRET + SF_LOGIN_URL → OAuth client-credentials flow (External Client App) — production.
//   SF_ORG_ALIAS → the Salesforce CLI's stored login for that org (`sf org display`) — local development only.
// Neither set → disabled; the portal falls back to its local tenant tiers.
const { execFile } = require('child_process');

const API = 'v62.0';

function createSalesforceClient(env = process.env) {
  const mode = env.SF_CLIENT_ID && env.SF_CLIENT_SECRET && env.SF_LOGIN_URL ? 'client-credentials' : env.SF_ORG_ALIAS ? 'cli' : null;
  let auth = null; // { token, instanceUrl }

  async function signIn() {
    if (mode === 'client-credentials') {
      const res = await fetch(`${env.SF_LOGIN_URL.replace(/\/+$/, '')}/services/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.SF_CLIENT_ID, client_secret: env.SF_CLIENT_SECRET })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Salesforce sign-in failed (HTTP ${res.status}): ${j.error_description || j.error || ''}`);
      auth = { token: j.access_token, instanceUrl: j.instance_url };
    } else {
      // No colors: under `concurrently` / a TTY, FORCE_COLOR makes the CLI color even its --json output.
      const cliEnv = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', SF_DISABLE_COLORS: 'true', SF_SKIP_NEW_VERSION_CHECK: 'true' };
      const out = await new Promise((resolve, reject) =>
        execFile('sf', ['org', 'display', '-o', env.SF_ORG_ALIAS, '--json'], { timeout: 60000, env: cliEnv }, (err, stdout) => (err && !stdout ? reject(err) : resolve(stdout)))
      );
      const r = JSON.parse(String(out).replace(/\u001b\[[0-9;]*m/g, '')).result || {};
      if (!r.accessToken) throw new Error(`Salesforce CLI has no login for "${env.SF_ORG_ALIAS}" — run: sf org login web -a ${env.SF_ORG_ALIAS}`);
      auth = { token: r.accessToken, instanceUrl: r.instanceUrl };
    }
    return auth;
  }

  /** REST call; signs in on first use and once more on 401. */
  async function request(method, path, body) {
    if (!mode) throw new Error('Salesforce is not configured.');
    for (let attempt = 0; attempt < 2; attempt++) {
      const a = attempt === 0 && auth ? auth : await signIn();
      const res = await fetch(`${a.instanceUrl}/services/data/${API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      if (res.status === 401 && attempt === 0) continue;
      const text = await res.text();
      if (!res.ok) throw Object.assign(new Error(`Salesforce ${method} ${path.split('?')[0]} failed (HTTP ${res.status}): ${text.slice(0, 300)}`), { status: res.status });
      return text ? JSON.parse(text) : {};
    }
  }

  const query = async (soql) => (await request('GET', `/query?q=${encodeURIComponent(soql)}`)).records || [];
  const create = (sobject, fields) => request('POST', `/sobjects/${sobject}`, fields);
  const update = (sobject, id, fields) => request('PATCH', `/sobjects/${sobject}/${id}`, fields);
  const remove = (sobject, id) => request('DELETE', `/sobjects/${sobject}/${id}`);
  const recordUrl = (id) => (auth ? `${auth.instanceUrl.replace('.my.salesforce.com', '.lightning.force.com')}/lightning/r/${id}/view` : null);

  return { enabled: Boolean(mode), mode, query, create, update, remove, recordUrl };
}

module.exports = { createSalesforceClient };
