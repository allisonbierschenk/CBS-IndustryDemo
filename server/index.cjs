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
const activity = require('./lib/activity.cjs');
const registerFeatures = require('./routes/features.cjs');
const store = require('./lib/store.cjs');
const { createSalesforceClient } = require('./lib/salesforce.cjs');
const { createCrm } = require('./lib/crm.cjs');
const { createData360 } = require('./lib/data360.cjs');

// Apex's Salesforce org is the system of record for each client's subscription tier (see lib/crm.cjs).
const sfClient = createSalesforceClient();
const crm = createCrm(sfClient, { campaign: store.content.crm?.campaign || null });
const d360 = createData360(sfClient); // Data 360 Query API — Apex's client growth view
activity.onRecord((e, user, tenant) => crm.logActivity(e, user, tenant)); // portal engagement → Salesforce → Data 360

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
// A client's tier comes from their Salesforce Account (Apex_Subscription_Tier__c) when Salesforce is configured,
// else from tenants.json. Demo upgrade: a Standard client "buys" Premium during the demo — recorded in Salesforce
// as a Closed Won Opportunity + tier change, and flagged in this portal session (signed cookie); signing out or
// switching users puts the Account back on Standard (the Opportunity stays as the record of the upgrade). While Premium, the JWT's 'subscription tier' attribute says Premium, so Tableau sees it too.
// A person is Premium if their company is, or if their company bought them a Premium seat (Contact.Apex_Premium_Seat__c).
function crmTier(user) {
  if (!user) return null;
  const company = crm.tierFor(user.tenantId);
  return company !== 'premium' && crm.hasSeat(user.id) ? 'premium' : company;
}
const isApexGrowth = (user) => (user?.roles || []).includes('apex-growth') && d360.enabled;
const isSeatAdmin = (user) => (user?.roles || []).includes('seat-admin') && crm.enabled;
function withUpgrade(user, s) {
  if (!user) return user;
  const tier = s?.upgraded ? 'premium' : crmTier(user);
  if (!tier) return user;
  return { ...user, attributes: { ...user.attributes, 'subscription tier': [tier === 'premium' ? 'Premium' : 'Standard'] }, upgradedInSession: Boolean(s?.upgraded), crmTier: tier };
}
function tenantForSession(user) {
  const t = store.tenantFor(user);
  if (!t) return t;
  if (user?.upgradedInSession) return { ...t, tier: 'premium', upgradedInSession: true };
  return user?.crmTier ? { ...t, tier: user.crmTier } : t;
}
// Sign-out / user switch: undo this session's demo upgrade in Salesforce too.
async function revertSessionUpgrade(s) {
  if (!s?.upgraded) return;
  const tenant = store.tenantFor(store.findUserById(s.uid));
  if (!tenant || !crm.enabled) return;
  try {
    await crm.revertUpgrade(tenant);
    console.log(`→ demo reset: ${tenant.clientName} back on Standard in Salesforce (upgrade Opportunity kept)`);
  } catch (e) {
    console.warn(`⚠ could not revert ${tenant.clientName}'s upgrade in Salesforce: ${e.message}`);
  }
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
    story: t.presenterNotes?.story
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

  revertSessionUpgrade(jar.read(req, SESSION_COOKIE)); // switching users resets the previous demo upgrade
  startSession(res, user);
  pulse.forgetSession(user); // a fresh sign-in never inherits an earlier session's (e.g. upgraded) attributes
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

app.post('/api/auth/logout', async (req, res) => {
  const user = currentUser(req);
  if (user) pulse.forgetSession(user); // next Tableau session uses the stored (non-upgraded) attributes
  await revertSessionUpgrade(jar.read(req, SESSION_COOKIE));
  jar.clear(res, SESSION_COOKIE);
  res.json({ ok: true });
});

// Demo checkout: upgrade this session to Premium (reset by signing out / switching users).
app.post('/api/upgrade', requireUser, async (req, res) => {
  if (req.tenant.tier === 'premium') return res.json({ ok: true, already: true });
  const price = store.content.benchmarks?.price || '';
  // Record it in Apex's CRM: Closed Won Opportunity + Account tier → Premium. If Salesforce is unreachable the
  // demo still upgrades this session, and says so.
  let salesforce = null;
  if (crm.enabled) {
    try {
      salesforce = await crm.recordUpgrade(req.user, req.tenant, { price });
    } catch (e) {
      console.warn(`⚠ Salesforce upgrade not recorded: ${e.message}`);
      salesforce = { error: 'The upgrade worked, but it could not be recorded in Salesforce.' };
    }
  }
  const s = jar.read(req, SESSION_COOKIE);
  jar.write(res, SESSION_COOKIE, { ...s, upgraded: true, upgradeOpp: salesforce?.opportunityId || null }, SESSION_TTL_MS);
  pulse.forgetSession(req.user); // re-sign in to Tableau with subscription tier = Premium
  activity.record(req.user, req.tenant, 'upgrade', { plan: 'Premium', price, amount: (Number(String(price).replace(/[^0-9.]/g, '')) || 0) * 12, opportunity: salesforce?.opportunityId || null });
  console.log(`→ demo upgrade: ${req.user.email} (${req.tenant.clientName}) → Premium${salesforce?.opportunityId ? ` · Salesforce Opportunity ${salesforce.opportunityId}` : ''}`);
  res.json({ ok: true, salesforce });
});

app.get('/api/crm/status', requireUser, (req, res) => res.json(crm.status()));

// ── Apex client growth (Apex staff, e.g. Alex Morgan) — Data 360 ────────────
// Harmonized in Data 360: Premium upgrades (CRM Opportunities), portal engagement (Apex Portal Activity) and launch
// campaign reach (Campaign Members), one row per client; "next best upsell" = engaged Standard clients the campaign reached.
app.get('/api/apex/growth', requireUser, async (req, res) => {
  if (!isApexGrowth(req.user)) return res.status(403).json({ error: 'Apex staff only.' });
  try {
    const g = await d360.growth();
    const by = (rows) => Object.fromEntries(rows.map((r) => [r.client_id__c, r]));
    const arr = by(g.arr.rows);
    const eng = by(g.engagement.rows);
    const reach = by(g.reach.rows);
    const num = (v) => Number(v || 0);
    const clients = store.tenants
      .filter((t) => crm.accountFor(t.id))
      .map((t) => {
        const tier = crm.tierFor(t.id) || t.tier;
        const e = eng[t.id] || {};
        const a = arr[t.id] || {};
        const events = num(e.events__c);
        const people = num(e.active_people__c);
        const recipients = num(reach[t.id]?.recipients__c);
        return {
          id: t.id,
          name: t.clientName,
          industry: t.industry,
          tier,
          arr: num(a.premium_arr__c),
          seats: num(a.premium_seats__c),
          upgrades: num(a.upgrades__c),
          events,
          people,
          recipients,
          weekly: g.weekly.filter((w) => w.Client_Id__c === t.id).map((w) => ({ week: String(w.week).slice(0, 10), events: num(w.events) })),
          // Upsell signal: Standard, reached by the launch campaign, and actively using the portal.
          upsell: tier !== 'premium' && recipients > 0 && events > 0 ? Math.round(events * 0.6 + people * 4 + recipients) : 0
        };
      })
      .sort((x, y) => y.arr - x.arr || y.events - x.events);
    const campaignId = g.upgrades.find((u) => u.Campaign_Id__c)?.Campaign_Id__c || null;
    const upgrades = g.upgrades.map((u) => ({ name: u.Name__c, client: u.Client_Name__c, amount: num(u.Amount__c), seats: num(u.Seats__c), closed: String(u.Close_Date__c || '').slice(0, 10), campaign: Boolean(u.Campaign_Id__c) }));
    res.json({
      sources: { arr: g.arr.from, engagement: g.engagement.from, reach: g.reach.from },
      totals: {
        arr: clients.reduce((s, c) => s + c.arr, 0),
        campaignArr: upgrades.filter((u) => u.campaign).reduce((s, u) => s + u.amount, 0),
        seats: clients.reduce((s, c) => s + c.seats, 0),
        events: clients.reduce((s, c) => s + c.events, 0)
      },
      clients,
      upsell: clients.filter((c) => c.upsell > 0).sort((a, b) => b.upsell - a.upsell),
      upgrades,
      campaign: store.content.crm?.campaign || null,
      campaignId
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});
// Activation: the Data 360 upsell list → follow-up Tasks for each client's Apex rep in Salesforce.
app.post('/api/apex/followups', requireUser, async (req, res) => {
  if (!isApexGrowth(req.user)) return res.status(403).json({ error: 'Apex staff only.' });
  const picks = Array.isArray(req.body?.clients) ? req.body.clients.slice(0, 20) : [];
  try {
    const out = [];
    for (const p of picks) {
      const tenant = store.tenants.find((t) => t.id === p.id);
      if (!tenant) continue;
      const t = await crm.createTask(tenant, {
        subject: `Upsell Premium — ${tenant.clientName} is engaged and on Standard`,
        description: `From Data 360 (Apex client growth): ${p.events} portal events by ${p.people} people in the last 30 days; the launch campaign reached ${p.recipients} of their people; still on Standard. Suggest: Premium seats for their managers.\nRequested by ${req.user.name}.`,
        dueInDays: 2
      });
      out.push({ client: tenant.clientName, taskId: t.taskId });
    }
    activity.record(req.user, store.tenantFor(req.user), 'message', { topic: 'Upsell follow-ups', count: out.length });
    res.json({ ok: true, created: out });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});
app.post('/api/apex/sync', requireUser, async (req, res) => {
  if (!d360.enabled) return res.status(400).json({ error: 'Salesforce isn’t connected.' });
  try {
    await crm.flushActivity();
    res.json({ ok: true, streams: await d360.sync() });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});
app.get('/api/apex/freshness', requireUser, async (req, res) => {
  if (!d360.enabled) return res.json({ enabled: false });
  try {
    res.json({ enabled: true, ...(await d360.freshness()) });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ── Premium seats (portal admin, e.g. Dana at Northstar) ────────────────────
app.get('/api/seats', requireUser, async (req, res) => {
  if (!isSeatAdmin(req.user)) return res.status(403).json({ error: 'Only your company’s portal admin can manage seats.' });
  try {
    res.json({ price: store.content.crm?.seatPrice || '', people: await crm.rosterFor(req.tenant) });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});
app.post('/api/seats', requireUser, async (req, res) => {
  if (!isSeatAdmin(req.user)) return res.status(403).json({ error: 'Only your company’s portal admin can manage seats.' });
  const ids = Array.isArray(req.body?.contactIds) ? req.body.contactIds.map(String).slice(0, 500) : [];
  if (!ids.length) return res.status(400).json({ error: 'Pick at least one person.' });
  try {
    const price = store.content.crm?.seatPrice || '';
    const r = await crm.buySeats(req.user, req.tenant, ids, { price });
    for (const u of store.users.filter((x) => x.tenantId === req.tenant.id)) pulse.forgetSession(u); // next Tableau session carries their new tier
    activity.record(req.user, req.tenant, 'upgrade', { plan: 'Premium seats', seats: r.seats, amount: r.amount, price, opportunity: r.opportunityId });
    console.log(`→ ${req.user.email} bought ${r.seats} Premium seats for ${req.tenant.clientName} · Salesforce Opportunity ${r.opportunityId}`);
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(e.status || 502).json({ error: e.message });
  }
});
// Presenter clean-up: take Northstar's seats back so the seat purchase can be demoed again.
app.post('/api/seats/reset', requireUser, async (req, res) => {
  if (!crm.enabled) return res.status(400).json({ error: 'Salesforce isn’t connected.' });
  try {
    const n = await crm.resetSeats(req.tenant);
    for (const u of store.users.filter((x) => x.tenantId === req.tenant.id)) pulse.forgetSession(u);
    activity.record(req.user, req.tenant, 'upgrade', { plan: 'Seats reset', seats: n });
    res.json({ ok: true, removed: n });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});
// Presenter dock: this client's Salesforce Account and the records the portal wrote to it.
app.get('/api/crm/records', requireUser, async (req, res) => {
  if (!crm.enabled) return res.json({ enabled: false });
  try {
    res.json({ enabled: true, ...(await crm.recordsFor(req.tenant)) });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
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
      agent: ent.has('agent'),
      // Dana-style portal admin: buys Premium seats for named people instead of upgrading the whole company.
      seats: isSeatAdmin(user) ? { price: store.content.crm?.seatPrice || store.content.benchmarks?.price || '' } : null,
      seatRoster: crm.enabled && tenant.id === 'northstar' ? true : false,
      apexGrowth: isApexGrowth(user),
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

// The Pulse Agent chat is Premium. "Explain this" (explain: true) uses the same Pulse brief and stays open to everyone.
const agentAllowed = (req) => store.entitlementsFor(req.tenant).has('agent') || req.body?.explain === true;
app.get('/api/agent/context', requireUser, async (req, res) => {
  if (!agentAllowed(req)) return res.status(403).json({ error: 'The Agent is part of Premium.', premium: true });
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
  if (!agentAllowed(req)) return res.status(403).json({ error: 'The Agent is part of Premium.', premium: true });
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
      insightCards: (r.source_insights || []).map((si) => ({ id: si.id, type: si.type, markup: si.markup, series: extractSeries(si.viz, si.type) })),
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

// ── Messages to the Apex engagement team (contact form + Premium requests) ──
// Demo: messages are kept in memory and written to the server log for the Apex team.
const messages = [];
const TOPICS = ['General question', 'Engagement update', 'Data or dashboard question', 'Schedule a review', 'Premium subscription', 'Billing'];
// A client's message becomes a follow-up Task on their Salesforce Account for the Apex account team.
app.post('/api/messages', requireUser, async (req, res) => {
  const topic = TOPICS.includes(req.body?.topic) ? req.body.topic : 'General question';
  const body = String(req.body?.message || '').trim().slice(0, 2000);
  if (!body) return res.status(400).json({ error: 'Please enter a message.' });
  const ref = `APX-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const to = req.tenant.accountManager || null;
  let salesforce = null;
  if (crm.enabled) {
    try {
      salesforce = await crm.createTask(req.tenant, {
        user: req.user,
        subject: `${topic} — ${req.user.name} (${ref})`,
        description: `From ${req.user.name} <${req.user.email}> via the Apex client portal.${to ? ` Account manager: ${to.name}.` : ''}\n\n${body}`,
        dueInDays: topic === 'Schedule a review' ? 1 : 2
      });
    } catch (e) {
      console.warn(`⚠ Salesforce task not created: ${e.message}`);
    }
  }
  const entry = { ref, at: new Date().toISOString(), client: req.tenant.clientName, from: req.user.email, to: to?.email || null, topic, body, task: salesforce?.taskId || null };
  messages.push(entry);
  console.log('✉ message for Apex team', entry);
  activity.record(req.user, req.tenant, 'message', { topic, to: to?.email || '', ref, task: salesforce?.taskId || null });
  res.json({ ok: true, ref, topic, to, salesforce: salesforce ? { taskId: salesforce.taskId } : null });
});
app.get('/api/messages/topics', requireUser, (req, res) => res.json({ topics: TOPICS }));

// ── Portal capabilities (library, subscriptions, attention, links, authoring, feeds, activity) ──
const features = registerFeatures(app, { store, pulse, activity, requireUser, env, mintEmbedToken, mintFor, sessionSecret: env.sessionSecret, crm });

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
