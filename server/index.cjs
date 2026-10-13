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
const { mintEmbedToken } = require('./lib/jwt.cjs');
const store = require('./lib/store.cjs');

const env = {
  server: (process.env.TABLEAU_SERVER || '').replace(/\/+$/, ''),
  site: process.env.TABLEAU_SITE || '',
  clientId: process.env.CONNECTED_APP_CLIENT_ID,
  secretId: process.env.CONNECTED_APP_SECRET_ID,
  secretValue: process.env.CONNECTED_APP_SECRET_VALUE,
  ttl: Number(process.env.JWT_TTL_SECONDS || 300),
  attributeClaim: process.env.USER_ATTRIBUTE_CLAIM || 'client name',
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
function currentUser(req) {
  const s = jar.read(req, SESSION_COOKIE);
  return s ? store.findUserById(s.uid) : null;
}

function startSession(res, user) {
  // A brand-new signed session per sign-in / user switch — nothing carries over between customers.
  jar.write(res, SESSION_COOKIE, { uid: user.id, sid: crypto.randomUUID() }, SESSION_TTL_MS);
}

function requireUser(req, res, next) {
  const user = currentUser(req);
  const tenant = store.tenantFor(user);
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
    ttlSeconds: env.ttl
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
    email: u.email,
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

  startSession(res, user);
  console.log(`→ signed in ${user.id} (${user.email})`);

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
  jar.clear(res, SESSION_COOKIE);
  res.json({ ok: true });
});

// ── Customer context ────────────────────────────────────────────────────────
// "Who's signed in?" — answers 200 either way so a signed-out check doesn't log a red 401 in the console.
app.get('/api/me', (req, res) => {
  const user = currentUser(req);
  const tenant = store.tenantFor(user);
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
    tenant,
    relationship: { clientSince: tenant.clientSince, monthsOfHistory: Math.max(1, monthsBetween(tenant.clientSince)) },
    entitlements: [...ent],
    views,
    drilldown: ddActive ? dd : null,
    // Only links to pages this customer is entitled to ever reach the browser.
    contextLinks: ctx ? { field: ctx.field, links: ctx.links.filter((l) => store.canAccessView(tenant, l.view)) } : null,
    attributeClaim: env.attributeClaim,
    attributeClaims: Object.keys(user.attributes || {})
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
    res.json({ configured: true, src: view.url, ...tokenResponse(mintFor(req.user)) });
  } catch (e) {
    console.error('token error:', e.message);
    res.status(500).json({ error: e.message });
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
  const entry = { ref, at: new Date().toISOString(), client: req.tenant.clientName, from: req.user.email, topic, body };
  messages.push(entry);
  console.log('✉ message for Apex team', entry);
  res.json({ ok: true, ref, topic });
});
app.get('/api/messages/topics', requireUser, (req, res) => res.json({ topics: TOPICS }));

// ── React build (production) — BrowserRouter fallback to index.html ─────────
const DIST = path.join(__dirname, '..', 'dist');
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use(express.static(DIST, { index: false }));
app.get('*', (req, res) => {
  res.sendFile(path.join(DIST, 'index.html'), (err) => {
    if (err) res.status(503).send('Frontend not built yet — run `npm run build`, or use `npm run dev` and open http://localhost:5173');
  });
});

app.listen(env.port, () => {
  console.log(`\nApex Client Value Intelligence API → http://localhost:${env.port}`);
  if (!env.server || !env.clientId) console.warn('⚠ Tableau Connected App not configured — embeds will show configuration placeholders.');
  console.log('  Login: one click per demo user (no password)');
  console.log(`  JWT user attributes: every key in users.json 'attributes' (required: '${env.attributeClaim}')  ·  scopes: tableau:views:embed, tableau:insights:embed`);
});
