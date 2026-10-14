// Portal capabilities layered on the existing dashboards and data:
//  • Needs-attention panel (Pulse Insight Brief over the user's followed metrics)
//  • Report library + Tableau favorites
//  • Email subscriptions (REST) and Pulse metric follows
//  • Signed share links (with filters) for deep links / QR codes
//  • Build-your-own report (embedded web authoring on a published data source)
//  • Refreshable, RLS-scoped CSV data feeds (VizQL Data Service as the user)
//  • Portal activity log
// Every Tableau call runs in the signed-in user's own Tableau session, so Tableau permissions and
// row-level security still apply; the portal adds its own entitlement checks on top.
const crypto = require('crypto');

module.exports = function registerFeatures(app, { store, pulse, activity, requireUser, env, mintEmbedToken, mintFor, sessionSecret }) {
  const cfg = store.content;
  const ent = (tenant) => store.entitlementsFor(tenant);
  const fail = (res, e, status = 502) => {
    console.error('feature error:', e.message);
    res.status(e.status === 403 ? 403 : status).json({ error: e.message });
  };

  // ── Signing helper (share links, feed tokens) ─────────────────────────────
  const sign = (payload) => {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${crypto.createHmac('sha256', sessionSecret).update(body).digest('base64url')}`;
  };
  const verify = (token) => {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    const expected = crypto.createHmac('sha256', sessionSecret).update(body).digest('base64url');
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    try {
      const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      return p.exp && p.exp > Date.now() ? p : null;
    } catch {
      return null;
    }
  };

  // ── Activity log (#10) ────────────────────────────────────────────────────
  const CLIENT_EVENTS = new Set(['export', 'share', 'filter', 'custom-view', 'assistant', 'dashboard-view', 'selection-action']);
  app.post('/api/activity', requireUser, (req, res) => {
    const type = String(req.body?.type || '');
    if (!CLIENT_EVENTS.has(type)) return res.status(400).json({ error: 'Unknown activity type' });
    activity.record(req.user, req.tenant, type, sanitize(req.body?.detail));
    res.json({ ok: true });
  });
  app.get('/api/activity', requireUser, (req, res) => {
    if (!(req.user.roles || []).includes('activity')) return res.status(403).json({ error: 'Activity log is available to Apex administrators only.' });
    res.json({ entries: activity.list({ type: req.query.type || undefined, client: req.query.client || undefined, limit: 300 }) });
  });
  function sanitize(d) {
    if (!d || typeof d !== 'object') return {};
    return Object.fromEntries(Object.entries(d).slice(0, 12).map(([k, v]) => [String(k).slice(0, 40), typeof v === 'object' ? JSON.stringify(v).slice(0, 300) : String(v).slice(0, 300)]));
  }

  // ── Needs attention (#4) ──────────────────────────────────────────────────
  const attentionCache = new Map(); // userId -> { at, value }
  app.get('/api/attention', requireUser, async (req, res) => {
    const ttl = (cfg.attention?.cacheMinutes || 15) * 60 * 1000;
    const hit = attentionCache.get(req.user.id);
    if (hit && Date.now() - hit.at < ttl && req.query.refresh !== '1') return res.json({ ...hit.value, cached: true });
    try {
      const ctx = await pulse.metricContext(req.user, agentScope(req.tenant));
      if (!ctx.length) return res.json({ empty: true, reason: 'You aren’t following any Tableau Pulse metrics yet.' });
      const r = await pulse.brief(req.user, [
        { role: 'ROLE_USER', content: cfg.attention.question, action_type: 'ACTION_TYPE_ANSWER', metric_group_context: ctx.map((c) => c.item), metric_group_context_resolved: false }
      ]);
      const content = r.markup || '';
      // Metrics the summary actually talks about (in the order it mentions them), with where to look further.
      const ROUTES = { valueIntelligence: '/dashboards', transportation: '/transportation' };
      const mentioned = ctx
        .map((c) => ({ c, at: content.indexOf(c.item.metadata.name) }))
        .filter((x) => x.at >= 0)
        .sort((a, b) => a.at - b.at)
        .map(({ c }) => {
          const ds = cfg.agent.datasources.find((d) => d.label === c.source);
          const view = ds?.view && store.canAccessView(req.tenant, ds.view) ? ds.view : null;
          return { name: c.item.metadata.name, metricId: c.item.metadata.metric_id, source: c.source, dashboard: view ? { title: cfg.views[view].title, to: ROUTES[view] } : null };
        });
      const value = {
        question: cfg.attention.question,
        content,
        metrics: mentioned,
        notEnoughInformation: Boolean(r.not_enough_information),
        followups: (r.follow_up_questions || []).map((q) => q?.content ?? q).filter(Boolean).slice(0, 3),
        insights: (r.source_insights || []).map((si) => ({ id: si.id, type: si.type, markup: si.markup })),
        generatedAt: new Date().toISOString()
      };
      attentionCache.set(req.user.id, { at: Date.now(), value });
      activity.record(req.user, req.tenant, 'attention', { metrics: ctx.length });
      res.json(value);
    } catch (e) {
      fail(res, e);
    }
  });

  function agentScope(tenant) {
    const e = ent(tenant);
    return { datasources: cfg.agent.datasources.filter((d) => (d.requires || []).every((r) => e.has(r))) };
  }

  // ── Report library + favorites (#6) ───────────────────────────────────────
  async function libraryFor(user, tenant) {
    const e = ent(tenant);
    const allowed = new Map(cfg.library.workbooks.filter((w) => (w.requires || []).every((r) => e.has(r))).map((w) => [w.name, w]));
    const filter = encodeURIComponent(`projectName:eq:${cfg.library.project}`);
    const j = await pulse.request(user, 'GET', `/views?filter=${filter}&pageSize=200&fields=_default_,workbook.name`, null, { base: 'rest' });
    const views = (j.views?.view || []).filter((v) => allowed.has(v.workbook?.name));
    return views.map((v) => ({
      id: v.id,
      name: v.name,
      workbookId: v.workbook.id,
      workbook: v.workbook.name,
      contentUrl: v.contentUrl, // Workbook/sheets/View
      embedUrl: `${env.server}/t/${env.site}/views/${String(v.contentUrl).replace('/sheets/', '/')}`,
      updatedAt: v.updatedAt
    }));
  }

  app.get('/api/library', requireUser, async (req, res) => {
    try {
      const [views, me] = await Promise.all([libraryFor(req.user, req.tenant), pulse.me(req.user)]);
      const favs = await pulse.request(req.user, 'GET', `/favorites/${me.userId}`, null, { base: 'rest' }).catch(() => ({}));
      const favIds = new Set((favs.favorites?.favorite || []).map((f) => f.view?.id).filter(Boolean));
      res.json({ views: views.map(({ embedUrl, ...v }) => ({ ...v, favorite: favIds.has(v.id) })) });
    } catch (e) {
      fail(res, e);
    }
  });

  app.put('/api/library/:viewId/favorite', requireUser, async (req, res) => {
    try {
      const view = (await libraryFor(req.user, req.tenant)).find((v) => v.id === req.params.viewId);
      if (!view) return res.status(404).json({ error: 'Report not found' });
      const me = await pulse.me(req.user);
      await pulse.request(req.user, 'PUT', `/favorites/${me.userId}`, { favorite: { label: view.name, view: { id: view.id } } }, { base: 'rest' });
      activity.record(req.user, req.tenant, 'favorite', { view: view.name, on: true });
      res.json({ ok: true });
    } catch (e) {
      fail(res, e);
    }
  });
  app.delete('/api/library/:viewId/favorite', requireUser, async (req, res) => {
    try {
      const me = await pulse.me(req.user);
      await pulse.request(req.user, 'DELETE', `/favorites/${me.userId}/views/${encodeURIComponent(req.params.viewId)}`, null, { base: 'rest' });
      activity.record(req.user, req.tenant, 'favorite', { viewId: req.params.viewId, on: false });
      res.json({ ok: true });
    } catch (e) {
      fail(res, e);
    }
  });

  // Embed any library view (URL only handed out if it's in the user's library)
  app.get('/api/embed/library/:viewId', requireUser, async (req, res) => {
    try {
      const view = (await libraryFor(req.user, req.tenant)).find((v) => v.id === req.params.viewId);
      if (!view) return res.status(403).json({ error: 'This report isn’t available to you.' });
      const minted = mintFor(req.user);
      activity.record(req.user, req.tenant, 'report-view', { view: view.name });
      res.json({ configured: true, src: view.embedUrl, title: view.name, workbook: view.workbook, token: minted.token, expiresAt: minted.claims.exp * 1000, claims: minted.claims });
    } catch (e) {
      fail(res, e);
    }
  });

  // ── Email subscriptions + Pulse follows (#5) ──────────────────────────────
  async function viewIdForKey(user, tenant, viewKey) {
    if (!store.canAccessView(tenant, viewKey)) throw Object.assign(new Error('Not included in your subscription'), { status: 403 });
    const url = cfg.views[viewKey]?.url || '';
    const m = /\/views\/([^/]+)\/([^/?#]+)/.exec(url);
    if (!m) throw new Error(`Can't resolve the Tableau view for ${viewKey}`);
    const j = await pulse.request(user, 'GET', `/views?filter=${encodeURIComponent(`viewUrlName:eq:${m[2]}`)}&pageSize=50`, null, { base: 'rest' });
    const v = (j.views?.view || []).find((x) => x.contentUrl === `${m[1]}/sheets/${m[2]}`);
    if (!v) throw new Error(`View ${m[1]}/${m[2]} not found`);
    return v;
  }

  app.get('/api/subscriptions', requireUser, async (req, res) => {
    try {
      const me = await pulse.me(req.user);
      const j = await pulse.request(req.user, 'GET', `/subscriptions?pageSize=100`, null, { base: 'rest' });
      const mine = (j.subscriptions?.subscription || []).filter((s) => s.user?.id === me.userId);
      res.json({
        subscriptions: mine.map((s) => ({
          id: s.id,
          subject: s.subject,
          contentType: s.content?.type,
          contentId: s.content?.id,
          frequency: s.schedule?.frequency,
          details: s.schedule?.frequencyDetails,
          nextRunAt: s.schedule?.nextRunAt,
          attachPdf: s.attachPdf,
          attachImage: s.attachImage
        }))
      });
    } catch (e) {
      fail(res, e);
    }
  });

  const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  app.post('/api/subscriptions', requireUser, async (req, res) => {
    const { viewKey, frequency = 'Weekly', weekDay = 'Monday', monthDay = '1', time = '08:00', attachment = 'pdf' } = req.body || {};
    try {
      if (!['Daily', 'Weekly', 'Monthly'].includes(frequency)) return res.status(400).json({ error: 'Choose daily, weekly or monthly.' });
      if (!/^\d{2}:\d{2}$/.test(time) || Number(time.slice(3)) % 5) return res.status(400).json({ error: 'Pick a time on a 5-minute boundary.' });
      const view = await viewIdForKey(req.user, req.tenant, viewKey);
      const me = await pulse.me(req.user);
      const start = `${time}:00`;
      const intervals =
        frequency === 'Daily'
          ? { interval: [{ hours: '24' }, ...WEEKDAYS.map((d) => ({ weekDay: d }))] }
          : frequency === 'Weekly'
            ? { interval: [{ weekDay: WEEKDAYS.includes(weekDay) ? weekDay : 'Monday' }] }
            : { interval: [{ monthDay: String(monthDay) }] };
      const body = {
        subscription: {
          subject: `${cfg.views[viewKey].title} — ${req.tenant.clientName}`,
          attachImage: attachment === 'image' ? 'true' : 'false',
          attachPdf: attachment === 'pdf' ? 'true' : 'false',
          pageOrientation: 'Landscape',
          content: { id: view.id, type: 'View', sendIfViewEmpty: 'false' },
          user: { id: me.userId }
        },
        schedule: { frequency, frequencyDetails: { start, intervals } }
      };
      const j = await pulse.request(req.user, 'POST', '/subscriptions', body, { base: 'rest' });
      activity.record(req.user, req.tenant, 'subscription', { view: cfg.views[viewKey].title, frequency, on: true });
      res.json({ ok: true, id: j.subscription?.id, nextRunAt: j.subscription?.schedule?.nextRunAt });
    } catch (e) {
      fail(res, e);
    }
  });

  app.delete('/api/subscriptions/:id', requireUser, async (req, res) => {
    try {
      const me = await pulse.me(req.user);
      const j = await pulse.request(req.user, 'GET', `/subscriptions/${encodeURIComponent(req.params.id)}`, null, { base: 'rest' });
      if (j.subscription?.user?.id !== me.userId) return res.status(403).json({ error: 'Not your subscription' });
      await pulse.request(req.user, 'DELETE', `/subscriptions/${encodeURIComponent(req.params.id)}`, null, { base: 'rest' });
      activity.record(req.user, req.tenant, 'subscription', { id: req.params.id, on: false });
      res.json({ ok: true });
    } catch (e) {
      fail(res, e);
    }
  });

  // Pulse metrics: what the user follows (and how), plus metrics they could follow on their data sources.
  let definitionsCache = null; // { at, list }
  async function definitionsOn(user, datasourceIds) {
    if (!definitionsCache || Date.now() - definitionsCache.at > 10 * 60 * 1000) {
      let list = [];
      let token = '';
      for (let i = 0; i < 50; i++) {
        const j = await pulse.request(user, 'GET', `/pulse/definitions?page_size=100${token ? `&page_token=${encodeURIComponent(token)}` : ''}`);
        list = list.concat(j.definitions || []);
        token = j.next_page_token;
        if (!token) break;
      }
      definitionsCache = { at: Date.now(), list };
    }
    return definitionsCache.list.filter((d) => datasourceIds.has(d.specification?.datasource?.id));
  }

  app.get('/api/metrics', requireUser, async (req, res) => {
    try {
      const scope = agentScope(req.tenant);
      const dsIds = new Map();
      for (const ds of scope.datasources) dsIds.set(await pulse.resolveDatasource(req.user, ds.name), ds.label);
      const me = await pulse.me(req.user);
      const [followed, subs, defs] = await Promise.all([
        pulse.request(req.user, 'GET', '/pulse/metrics:followedMetricsGroups'),
        pulse.request(req.user, 'GET', `/pulse/subscriptions?user_id=${me.userId}&page_size=200`),
        definitionsOn(req.user, new Set(dsIds.keys()))
      ]);
      const direct = new Map((subs.subscriptions || []).filter((s) => s.follower?.user_id === me.userId).map((s) => [s.metric_id, s.id]));
      const followedMetrics = (followed.metric_groups || []).flatMap((g) => g.metrics || []);
      const followedIds = new Set(followedMetrics.map((m) => m.id));
      const defName = new Map(defs.map((d) => [d.metadata.id, d.metadata.name]));
      const out = followedMetrics
        .filter((m) => defName.has(m.definition_id))
        .map((m) => ({ id: m.id, name: defName.get(m.definition_id), following: true, via: direct.has(m.id) ? 'you' : 'group', canUnfollow: direct.has(m.id) }));
      // Followable: each definition's default (unfiltered) metric that the user doesn't already follow.
      const followable = await Promise.all(
        defs.map(async (d) => {
          const { metrics = [] } = await pulse.request(req.user, 'GET', `/pulse/definitions/${d.metadata.id}/metrics`).catch(() => ({}));
          const m = metrics.find((x) => x.is_default) || metrics.find((x) => !(x.specification?.filters || []).length);
          return m && !followedIds.has(m.id) ? { id: m.id, name: d.metadata.name, following: false, canFollow: true } : null;
        })
      );
      res.json({ metrics: [...out, ...followable.filter(Boolean)].sort((a, b) => a.name.localeCompare(b.name)) });
    } catch (e) {
      fail(res, e);
    }
  });

  app.post('/api/metrics/:metricId/follow', requireUser, async (req, res) => {
    try {
      const me = await pulse.me(req.user);
      await pulse.request(req.user, 'POST', '/pulse/subscriptions', { metric_id: req.params.metricId, follower: { user_id: me.userId } });
      pulse.resetContext(req.user);
      attentionCache.delete(req.user.id);
      activity.record(req.user, req.tenant, 'pulse-follow', { metricId: req.params.metricId, on: true });
      res.json({ ok: true });
    } catch (e) {
      fail(res, e);
    }
  });
  app.delete('/api/metrics/:metricId/follow', requireUser, async (req, res) => {
    try {
      const me = await pulse.me(req.user);
      const subs = await pulse.request(req.user, 'GET', `/pulse/subscriptions?user_id=${me.userId}&metric_id=${encodeURIComponent(req.params.metricId)}`);
      const mine = (subs.subscriptions || []).find((s) => s.follower?.user_id === me.userId);
      if (!mine) return res.status(409).json({ error: 'You follow this metric through a group — ask your Apex team to change group follows.' });
      await pulse.request(req.user, 'DELETE', `/pulse/subscriptions/${mine.id}`);
      pulse.resetContext(req.user);
      attentionCache.delete(req.user.id);
      activity.record(req.user, req.tenant, 'pulse-follow', { metricId: req.params.metricId, on: false });
      res.json({ ok: true });
    } catch (e) {
      fail(res, e);
    }
  });

  // ── Share a selection to Slack (demo: recorded, not posted) ───────────────
  app.post('/api/actions/slack', requireUser, (req, res) => {
    const { channel, message, worksheet, view, rows } = req.body || {};
    if (!store.slackChannelsFor(req.tenant).includes(channel)) return res.status(400).json({ error: 'Choose a channel' });
    if (!String(message || '').trim()) return res.status(400).json({ error: 'Write a message' });
    const n = Array.isArray(rows) ? rows.length : 0;
    console.log(`→ [demo Slack] ${req.user.email} → ${channel}: "${String(message).slice(0, 200)}" (${worksheet}, ${n} rows)`);
    activity.record(req.user, req.tenant, 'slack-share', { channel, view: String(view || '').slice(0, 80), worksheet: String(worksheet || '').slice(0, 80), rows: n });
    res.json({ ok: true, channel, demo: true });
  });

  // ── Signed share links (#3) ───────────────────────────────────────────────
  app.post('/api/links', requireUser, (req, res) => {
    const path = String(req.body?.path || '');
    if (!/^\/[A-Za-z0-9/_\-?=&%.+#]*$/.test(path) || path.startsWith('//')) return res.status(400).json({ error: 'Invalid link target' });
    const hours = cfg.links?.ttlHours || 72;
    const token = sign({ p: path, by: req.user.email, exp: Date.now() + hours * 3600 * 1000 });
    activity.record(req.user, req.tenant, 'share', { path });
    res.json({ url: `${req.protocol}://${req.get('host')}/l/${token}`, expiresAt: new Date(Date.now() + hours * 3600 * 1000).toISOString() });
  });
  // Opening a link: the recipient still signs in as themselves and sees only their own data (RLS).
  app.get('/l/:token', (req, res) => {
    const p = verify(req.params.token);
    if (!p) return res.redirect('/login?link=expired');
    res.redirect(`/login?next=${encodeURIComponent(p.p)}`);
  });

  // ── Build your own report (#8) ────────────────────────────────────────────
  app.get('/api/authoring/sources', requireUser, (req, res) => {
    const allowed = (cfg.authoring.requires || []).every((r) => ent(req.tenant).has(r));
    res.json({ allowed, datasources: allowed ? cfg.authoring.datasources.map(({ label }, i) => ({ id: i, label })) : [] });
  });
  app.get('/api/embed/authoring/:sourceId', requireUser, async (req, res) => {
    try {
      if (!(cfg.authoring.requires || []).every((r) => ent(req.tenant).has(r))) return res.status(403).json({ error: 'Building reports is part of Premium.' });
      const ds = cfg.authoring.datasources[Number(req.params.sourceId)];
      if (!ds) return res.status(404).json({ error: 'Unknown data source' });
      const j = await pulse.request(req.user, 'GET', `/datasources?filter=${encodeURIComponent(`name:eq:${ds.name}`)}`, null, { base: 'rest' });
      const d = j.datasources?.datasource?.[0];
      if (!d) throw new Error(`Data source "${ds.name}" not found`);
      const attributes = Object.fromEntries(Object.entries(req.user.attributes || {}).map(([k, v]) => [k, Array.isArray(v) ? v : [v]]));
      const minted = mintEmbedToken({
        clientId: env.clientId,
        secretId: env.secretId,
        secretValue: env.secretValue,
        username: req.user.email,
        attributes,
        ttlSeconds: env.ttl,
        scopes: ['tableau:views:embed', 'tableau:views:embed_authoring', 'tableau:content:read']
      });
      activity.record(req.user, req.tenant, 'authoring', { datasource: ds.label });
      res.json({ configured: true, src: `${env.server}/t/${env.site}/authoringNewWorkbook/${crypto.randomUUID()}/${d.contentUrl}`, token: minted.token, claims: minted.claims, label: ds.label });
    } catch (e) {
      fail(res, e);
    }
  });

  // ── Data feeds (#9) ───────────────────────────────────────────────────────
  app.get('/api/feeds', requireUser, (req, res) => {
    const days = cfg.feeds.tokenDays || 30;
    res.json({
      feeds: cfg.feeds.items.map((f) => ({
        key: f.key,
        title: f.title,
        fields: f.fields.map((x) => x.fieldCaption),
        url: `${req.protocol}://${req.get('host')}/feeds/${f.key}.csv?token=${sign({ u: req.user.id, f: f.key, exp: Date.now() + days * 86400000 })}`,
        expiresAt: new Date(Date.now() + days * 86400000).toISOString()
      }))
    });
  });
  // Token-authenticated so Excel Power Query / Google Sheets can refresh it without a portal session.
  app.get('/feeds/:key.csv', async (req, res) => {
    const p = verify(req.query.token);
    const feed = cfg.feeds.items.find((f) => f.key === req.params.key);
    if (!p || !feed || p.f !== feed.key) return res.status(401).type('text').send('Feed link is invalid or expired. Generate a new one in the portal (Data feeds).');
    const user = store.findUserById(p.u);
    const tenant = store.tenantFor(user);
    if (!user || !tenant) return res.status(401).type('text').send('Unknown user');
    try {
      const luid = await pulse.resolveDatasource(user, feed.datasource);
      const r = await pulse.vds(user, luid, feed.fields);
      const text = r.text;
      if (!r.ok) {
        const msg = /VIZQL_DATA_API_ACCESS/.test(text)
          ? 'Your Tableau account needs the "API Access" capability on this data source to use data feeds.'
          : `Tableau returned HTTP ${r.status}`;
        return res.status(r.status === 403 ? 403 : 502).type('text').send(msg);
      }
      const rows = JSON.parse(text).data || [];
      const cols = rows.length ? Object.keys(rows[0]) : feed.fields.map((f) => f.fieldCaption);
      const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
      activity.record(user, tenant, 'feed', { feed: feed.key, rows: rows.length });
      res.type('text/csv').set('Content-Disposition', `inline; filename="${feed.key}.csv"`).send([cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n'));
    } catch (e) {
      res.status(502).type('text').send(e.message);
    }
  });
};
