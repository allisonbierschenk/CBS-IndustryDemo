// User store, tenant profiles, Tableau content config and entitlement resolution.
const fs = require('fs');
const path = require('path');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const ROOT = path.join(__dirname, '..', '..');
const users = readJson(path.join(ROOT, 'server', 'data', 'users.json')).users;
const tenants = readJson(path.join(ROOT, 'server', 'data', 'tenants.json')).tenants;
const content = readJson(path.join(ROOT, 'config', 'tableau-content.json'));

const tenantById = new Map(tenants.map((t) => [t.id, t]));

function findUserById(id) {
  return users.find((u) => u.id === id) || null;
}

function tenantFor(user) {
  return user ? tenantById.get(user.tenantId) || null : null;
}

// Feature entitlements are resolved on the server; the browser only ever receives the result.
function entitlementsFor(tenant) {
  const set = new Set(tenant.features || []);
  if (tenant.tier === 'premium') {
    set.add('benchmarks');
    set.add('authoring'); // build-your-own reports
    set.add('goals'); // create their own Pulse metrics with goals
  }
  return set;
}

function canAccessView(tenant, viewKey) {
  const view = content.views[viewKey];
  if (!view) return false;
  const ent = entitlementsFor(tenant);
  return (view.requires || []).every((r) => ent.has(r));
}

// A user's data scope, from their JWT user attributes (the same values Tableau's RLS evaluates).
// 'narrowed' = the user sees fewer service lines / engagement types than their organization has.
function scopeFor(user) {
  const a = user.attributes || {};
  const list = (k) => (Array.isArray(a[k]) ? a[k] : a[k] ? [a[k]] : []);
  const scope = { clients: list('client name'), serviceLines: list('service line'), engagementTypes: list('engagement type') };
  const all = tenantFor(user)?.engagements || [];
  const allLines = new Set(all.map((e) => e.serviceLine));
  const allTypes = new Set(all.map((e) => e.dataValue || e.name));
  const fewerLines = [...allLines].some((x) => !scope.serviceLines.includes(x));
  const fewerTypes = [...allTypes].some((x) => !scope.engagementTypes.includes(x));
  // Types narrower than the service lines alone would allow → describe by engagement type.
  const typesWithinLines = all.filter((e) => scope.serviceLines.includes(e.serviceLine)).map((e) => e.dataValue || e.name);
  const typesNarrower = typesWithinLines.some((x) => !scope.engagementTypes.includes(x));
  const parts = [scope.clients.join(' + ')];
  if (typesNarrower) parts.push(scope.engagementTypes.join(', '));
  else if (fewerLines) parts.push(`${scope.serviceLines.join(', ')} service line`);
  scope.narrowed = fewerLines || fewerTypes;
  scope.label = parts.join(' · ');
  return scope;
}

/** The tenant's engagements narrowed to what this user's scope can see (portal UX; Tableau RLS enforces the data). */
function engagementsFor(user, tenant) {
  const sc = scopeFor(user);
  return tenant.engagements.filter(
    (e) =>
      sc.serviceLines.includes(e.serviceLine) &&
      sc.engagementTypes.includes(e.dataValue || e.name) &&
      (!e.client || sc.clients.includes(e.client))
  );
}

/** Demo Slack destinations for a tenant (Slack isn't connected; these are display names only). */
function slackChannelsFor(tenant) {
  const slug = String(tenant.shortName || tenant.clientName).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return [`#${slug}-apex-engagement`, `#${slug}-leadership`, `#${slug}-operations`, '@ Your Apex engagement lead'];
}

function publicUser(user) {
  return { id: user.id, name: user.name, title: user.title, email: user.email, persona: user.persona, roles: user.roles || [], attributes: user.attributes };
}

module.exports = { users, tenants, content, findUserById, tenantFor, entitlementsFor, canAccessView, publicUser, scopeFor, engagementsFor, slackChannelsFor };
