// Pre-demo readiness check: `npm run check`
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const users = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/data/users.json'), 'utf8')).users;
const tenants = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/data/tenants.json'), 'utf8')).tenants;
const content = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/tableau-content.json'), 'utf8'));
const claim = process.env.USER_ATTRIBUTE_CLAIM || 'client name';

let problems = 0;
const ok = (m) => console.log(`  ✔ ${m}`);
const bad = (m) => { problems += 1; console.log(`  ✖ ${m}`); };
const check = (cond, good, fail) => (cond ? ok(good) : bad(fail));

console.log('\nEnvironment');
const server = process.env.TABLEAU_SERVER || '';
check(/^https:\/\/[^/]+\.tableau\.com$/.test(server.replace(/\/$/, '')) && !server.includes('YOUR-POD'), `TABLEAU_SERVER = ${server}`, 'TABLEAU_SERVER missing or placeholder (e.g. https://prod-useast-b.online.tableau.com)');
check(process.env.TABLEAU_SITE && process.env.TABLEAU_SITE !== 'your-site-content-url', `TABLEAU_SITE = ${process.env.TABLEAU_SITE}`, 'TABLEAU_SITE missing');
for (const k of ['CONNECTED_APP_CLIENT_ID', 'CONNECTED_APP_SECRET_ID', 'CONNECTED_APP_SECRET_VALUE']) check(process.env[k], `${k} set`, `${k} missing`);
check((process.env.SESSION_SECRET || '').length >= 32, 'SESSION_SECRET set (≥32 chars)', 'SESSION_SECRET missing or shorter than 32 chars');
const ttl = Number(process.env.JWT_TTL_SECONDS || 300);
check(ttl > 0 && ttl <= 600, `JWT_TTL_SECONDS = ${ttl}`, 'JWT_TTL_SECONDS must be 1–600 (Tableau max is 10 minutes)');

console.log('\nUser store');
const clientNames = new Set(tenants.map((t) => t.clientName));
for (const u of users) {
  const t = tenants.find((x) => x.id === u.tenantId);
  const values = u.attributes?.[claim];
  check(t, `${u.id} → tenant ${u.tenantId}`, `${u.id}: unknown tenant ${u.tenantId}`);
  check(/^[^@\s]+@[^@\s]+\.[a-z]+$/i.test(u.email), `${u.id} email / JWT sub ${u.email}`, `${u.id}: email is not a valid address (${u.email})`);
  check(Array.isArray(values) && values.length && values.every((v) => clientNames.has(v)), `${u.id} '${claim}' = ${JSON.stringify(values)}`, `${u.id}: '${claim}' attribute missing or doesn't match a tenant clientName`);
  if (t && values) check(values.includes(t.clientName), `${u.id} attribute matches its tenant`, `${u.id}: attribute ${JSON.stringify(values)} ≠ tenant ${t.clientName}`);
  const tier = u.attributes?.['subscription tier'];
  if (t) check(Array.isArray(tier) && tier.length === 1 && tier[0].toLowerCase() === t.tier, `${u.id} 'subscription tier' = ${JSON.stringify(tier)}`, `${u.id}: 'subscription tier' ${JSON.stringify(tier)} should be ["${t.tier[0].toUpperCase() + t.tier.slice(1)}"] to match the tenant`);
}

console.log('\nTableau content');
const site = process.env.TABLEAU_SITE;
for (const [k, v] of Object.entries(content.views)) {
  if (!v.url) { (k === 'invoiceDetails' ? ok : bad)(`views.${k}.url is empty${k === 'invoiceDetails' ? ' (optional — portal drill-down off)' : ''}`); continue; }
  check(v.url.startsWith(server) && v.url.includes(`/t/${site}/views/`), `views.${k} → ${v.url}`, `views.${k}.url should look like ${server}/t/${site}/views/<Workbook>/<View> (got ${v.url})`);
}

console.log(problems ? `\n${problems} item(s) need attention.\n` : '\nAll checks passed — ready to demo.\n');
process.exit(problems ? 1 : 0);
