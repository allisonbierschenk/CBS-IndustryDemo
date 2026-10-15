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
  // A Pulse brief takes ~15–35 s (time grows with the length of the answer), so the portal never makes
  // the user wait for one it can avoid:
  //  • started in the background at sign-in (warmAttention) — usually ready by the time Home renders
  //  • one in-flight brief per user (sign-in warm-up, two tabs, a refresh click all share it)
  //  • cached for cfg.attention.cacheMinutes, persisted to disk so dev restarts (node --watch) keep it
  //  • after it expires the last answer is served immediately (stale) while a fresh one is built
  const ATTENTION_FILE = require('path').join(__dirname, '..', '..', 'data', 'attention-cache.json');
  const attentionCache = new Map(); // `${userId}|${question}` -> { at, value }
  const attentionInflight = new Map(); // same key -> Promise<value>
  try {
    for (const [k, v] of Object.entries(JSON.parse(require('fs').readFileSync(ATTENTION_FILE, 'utf8')))) attentionCache.set(k, v);
  } catch {
    /* no cache yet */
  }
  const saveAttention = () => require('fs').writeFile(ATTENTION_FILE, JSON.stringify(Object.fromEntries(attentionCache)), () => {});
  const ATTENTION_FORMAT = 10; // bump when the cached shape changes so old entries are ignored
  const attentionKey = (user) => `v${ATTENTION_FORMAT}|${user.id}|${cfg.attention.question}`;
  const attentionTtl = () => (cfg.attention?.cacheMinutes || 15) * 60 * 1000;

  function buildAttention(user, tenant) {
    const key = attentionKey(user);
    if (attentionInflight.has(key)) return attentionInflight.get(key);
    const started = Date.now();
    const job = (async () => {
      const ctx = await pulse.metricContext(user, agentScope(tenant));
      if (!ctx.length) return { empty: true, reason: 'You aren’t following any metrics yet.' };
      const r = await pulse.brief(user, [
        { role: 'ROLE_USER', content: cfg.attention.question, action_type: 'ACTION_TYPE_ANSWER', metric_group_context: ctx.map((c) => c.item), metric_group_context_resolved: false }
      ]);
      const content = r.markup || '';
      const { metrics, onTrack } = attentionRows(ctx, r.source_insights || [], content, tenant);
      const value = {
        question: cfg.attention.question,
        content,
        metrics,
        onTrack,
        notEnoughInformation: Boolean(r.not_enough_information),
        followups: (r.follow_up_questions || []).map((q) => q?.content ?? q).filter(Boolean).slice(0, 3),
        generatedAt: new Date().toISOString()
      };
      attentionCache.set(key, { at: Date.now(), value });
      saveAttention();
      console.log(`⚡ attention brief for ${user.email} in ${Date.now() - started} ms (${ctx.length} metrics)`);
      activity.record(user, tenant, 'attention', { metrics: ctx.length, ms: Date.now() - started });
      return value;
    })().finally(() => attentionInflight.delete(key));
    attentionInflight.set(key, job);
    return job;
  }


  /**
   * Turn Pulse's source insights into rows that say what to act on:
   *   issue       – what changed, with the numbers (from the period-over-period facts)
   *   expectation – which direction is good (the metric's sentiment type) and the level to hold
   *   drivers     – the biggest contributors (top-drivers facts), skipping one-member breakdowns
   * Metrics without a current-period value are left out (nothing to act on yet).
   * Insights name their metric in their text (the answer's citation ids don't match insight ids),
   * so they're matched by name, longest first so names can't collide.
   */
  function attentionRows(ctx, sourceInsights, content, tenant) {
    const plain = (m) => String(m || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const byLength = [...ctx].sort((a, b) => b.item.metadata.name.length - a.item.metadata.name.length);
    const insightsFor = new Map();
    for (const si of sourceInsights) {
      const text = plain(si.markup);
      const c = byLength.find((x) => text.includes(x.item.metadata.name));
      if (!c) continue;
      insightsFor.set(c.item.metadata.metric_id, [...(insightsFor.get(c.item.metadata.metric_id) || []), { type: si.type, text, facts: si.facts || {} }]);
    }
    const ROUTES = { valueIntelligence: '/dashboards', transportation: '/transportation' };
    const rows = [];
    const onTrack = [];
    for (const c of ctx) {
      const id = c.item.metadata.metric_id;
      const name = c.item.metadata.name;
      const list = insightsFor.get(id) || [];
      if (!list.length && content.indexOf(name) < 0) continue;
      const upIsGood = c.item.metric.representation_options?.sentiment_type !== 'SENTIMENT_TYPE_DOWN_IS_GOOD';
      const ds = cfg.agent.datasources.find((d) => d.label === c.source);
      const view = ds?.view && store.canAccessView(tenant, ds.view) ? ds.view : null;
      const base = { name, metricId: id, source: c.source, upIsGood, dashboard: view ? { title: cfg.views[view].title, to: ROUTES[view] } : null };

      const popc = list.find((i) => i.type === 'popc' && i.facts.target_period_value && !i.facts.target_period_value.is_nan);
      if (!popc) continue; // no current-period value to act on
      const f = popc.facts;
      const dir = f.difference?.direction; // up | down | flat
      const rel = String(f.difference?.relative?.formatted || '').replace(/^[-+]/, '');
      const abs = f.difference?.absolute?.formatted || '';
      const now = f.target_period_value.formatted;
      const was = f.comparison_period_value?.formatted;
      const vs = f.comparison_time_period?.label || 'the prior period';
      const period = f.target_time_period?.label || 'this period';
      const goalMiss = c.goal?.value != null && f.target_period_value.raw != null && (upIsGood ? f.target_period_value.raw < c.goal.value : f.target_period_value.raw > c.goal.value);
      const unfavorable = goalMiss || f.sentiment === 'negative' || (dir !== 'flat' && (dir === 'up') !== upIsGood);
      if (!unfavorable) {
        onTrack.push({ name, note: dir === 'flat' ? `steady at ${now}` : `${dir} ${rel} to ${now}` });
        continue;
      }
      // Drivers that moved the metric the wrong way (one-member breakdowns only restate the total).
      const drv = list
        .filter((i) => /drivers/.test(i.type) && i.facts.total_members > 1 && (i.facts.drivers || []).length)
        .map((i) => `${i.facts.dimension?.label}: ${i.facts.drivers.slice(0, 3).map((d) => `${d.entity} ${d.change_value?.formatted}`).join(', ')}`);
      rows.push({
        ...base,
        status: 'off-track',
        issue: `${dir === 'up' ? 'Up' : 'Down'} ${rel} (${abs}) vs ${vs}: ${now} in ${period}${was ? ` vs ${was}` : ''}.`,
        expectation: c.goal?.value != null
          ? `${c.goal.name || 'Goal'}: ${upIsGood ? 'at least' : 'at most'} ${formatGoal(c.item.metric, c.goal.value)} (your goal).`
          : upIsGood ? `Higher is better: should be at or above ${was || 'the prior period'}.` : `Lower is better: should be at or below ${was || 'the prior period'}.`,
        drivers: drv.slice(0, 2),
        ask: `Why is ${name} ${dir} ${rel} vs ${vs}, and what is driving it?`,
        _mag: Math.abs(f.difference?.relative?.raw || 0)
      });
    }
    rows.sort((a, b) => b._mag - a._mag);
    return { metrics: rows.map(({ _mag, ...m }) => m), onTrack };
  }

  // Keep every demo user's brief ready before anyone signs in: at startup and then on a timer, refresh
  // each user's cached answer in the background (a couple at a time so briefs don't slow each other).
  // Switching personas mid-demo then shows Needs attention instantly instead of waiting 30–60 s.
  async function prewarmAll() {
    const due = store.users.filter((u) => {
      const hit = attentionCache.get(attentionKey(u));
      return store.tenantFor(u) && !(hit && Date.now() - hit.at < attentionTtl() * 0.8);
    });
    if (!due.length) return;
    const started = Date.now();
    const queue = [...due];
    const worker = async () => {
      for (let u = queue.shift(); u; u = queue.shift()) {
        await buildAttention(u, store.tenantFor(u)).catch((e) => console.warn(`attention pre-warm for ${u.email} skipped: ${e.message}`));
      }
    };
    await Promise.all(Array.from({ length: Math.min(cfg.attention?.prewarmConcurrency || 2, due.length) }, worker));
    console.log(`⚡ Needs attention pre-warmed for ${due.length} user(s) in ${Math.round((Date.now() - started) / 1000)} s`);
  }
  if (cfg.attention?.prewarm !== false && env.server) {
    setTimeout(() => prewarmAll().catch(() => {}), 3000).unref();
    setInterval(() => prewarmAll().catch(() => {}), attentionTtl() * 0.8).unref();
  }

  /** Called at sign-in: build the brief in the background unless a fresh one is cached. */
  function warmAttention(user) {
    const tenant = store.tenantFor(user);
    const hit = attentionCache.get(attentionKey(user));
    if (!tenant || (hit && Date.now() - hit.at < attentionTtl())) return;
    buildAttention(user, tenant).catch((e) => console.warn(`attention warm-up for ${user.email} failed: ${e.message}`));
  }

  app.get('/api/attention', requireUser, async (req, res) => {
    const hit = attentionCache.get(attentionKey(req.user));
    const fresh = hit && Date.now() - hit.at < attentionTtl();
    try {
      if (req.query.refresh === '1') return res.json(await buildAttention(req.user, req.tenant));
      if (fresh) return res.json({ ...hit.value, cached: true });
      if (hit && req.query.wait !== '1') {
        buildAttention(req.user, req.tenant).catch(() => {}); // refresh behind the stale answer
        return res.json({ ...hit.value, cached: true, stale: true });
      }
      res.json(await buildAttention(req.user, req.tenant));
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
      const defById = new Map(defs.map((d) => [d.metadata.id, d]));
      const filterLabel = (m) => (m.specification?.filters || []).map((f) => (f.values || f.categorical_values?.map((c) => c.string_value) || []).join(', ')).filter(Boolean).join(' · ');
      const out = followedMetrics
        .filter((m) => defName.has(m.definition_id))
        .map((m) => ({
          id: m.id,
          name: defName.get(m.definition_id),
          detail: filterLabel(m),
          goal: m.goals?.target ? { ...m.goals.target, display: formatGoal(defById.get(m.definition_id), m.goals.target.value) } : null,
          own: isOwnGoalMetric(m, req.user),
          following: true,
          via: direct.has(m.id) ? 'you' : 'group',
          canUnfollow: direct.has(m.id)
        }));
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

  // ── Customer-created Pulse metrics with a goal ────────────────────────────
  // Per Tableau's Pulse REST API: any user with read/connect access can create a metric in a definition
  // (metrics:getOrCreate) and follow it (subscriptions). The goal is stored on that metric only
  // (UpdateMetricRequest.goals.target), so it never touches other clients' metrics.
  const isPercent = (d) => /PERCENT/.test(d?.representation_options?.type || '');
  function formatGoal(d, v) {
    if (v == null) return '';
    if (isPercent(d)) return `${Math.round(v * 1000) / 10}%`;
    if (/CURRENCY/.test(d?.representation_options?.type || '')) return `$${Number(v).toLocaleString('en-US')}`;
    return Number(v).toLocaleString('en-US');
  }

  app.get('/api/metrics/definitions', requireUser, async (req, res) => {
    if (!ent(req.tenant).has('goals')) return res.status(403).json({ error: 'Creating your own metrics with goals is part of Premium.' });
    try {
      const scope = agentScope(req.tenant);
      const dsIds = new Map();
      for (const ds of scope.datasources) dsIds.set(await pulse.resolveDatasource(req.user, ds.name), ds.label);
      const defs = await definitionsOn(req.user, new Set(dsIds.keys()));
      res.json({
        definitions: defs
          .map((d) => ({
            id: d.metadata.id,
            name: d.metadata.name,
            source: dsIds.get(d.specification?.datasource?.id),
            unit: isPercent(d) ? 'percent' : /CURRENCY/.test(d.representation_options?.type || '') ? 'currency' : 'number',
            upIsGood: d.representation_options?.sentiment_type !== 'SENTIMENT_TYPE_DOWN_IS_GOOD'
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
      });
    } catch (e) {
      fail(res, e);
    }
  });

  app.post('/api/metrics/create', requireUser, async (req, res) => {
    if (!ent(req.tenant).has('goals')) return res.status(403).json({ error: 'Creating your own metrics with goals is part of Premium.' });
    // engagementType: optional extra filter (e.g. a benchmark goal for one engagement).
    // raw: goal is already in the metric's own units (e.g. 0.75 for the 75th percentile).
    const { definitionId, definitionName, goal, goalName, engagementType, raw } = req.body || {};
    try {
      const scope = agentScope(req.tenant);
      const dsIds = new Set();
      for (const ds of scope.datasources) dsIds.add(await pulse.resolveDatasource(req.user, ds.name));
      const def = (await definitionsOn(req.user, dsIds)).find((d) => d.metadata.id === definitionId || (definitionName && d.metadata.name === definitionName));
      if (!def) {
        // e.g. the metric definition was deleted in Tableau Pulse — say so rather than blame the user's pick.
        if (definitionName) console.warn(`[metrics/create] no Pulse definition named "${definitionName}" on the agent data sources`);
        return res.status(400).json({ error: definitionName ? `“${definitionName}” isn’t set up in Tableau right now, so a goal can’t be created for it.` : 'Pick one of your metrics.' });
      }
      const value = Number(goal);
      if (!Number.isFinite(value)) return res.status(400).json({ error: 'Enter a goal.' });
      // Start from the definition's default metric (period + comparison), scoped to this client.
      const { metrics = [] } = await pulse.request(req.user, 'GET', `/pulse/definitions/${def.metadata.id}/metrics`);
      const base = metrics.find((m) => m.is_default) || metrics.find((m) => !(m.specification?.filters || []).length) || metrics[0];
      const clients = store.scopeFor(req.user).clients;
      const specification = {
        measurement_period: base?.specification?.measurement_period || { granularity: 'GRANULARITY_BY_YEAR', range: 'RANGE_CURRENT_PARTIAL' },
        comparison: base?.specification?.comparison || { comparison: 'TIME_COMPARISON_PREVIOUS_PERIOD' },
        filters: [
          { field: 'Client Name', operator: 'OPERATOR_EQUAL', categorical_values: clients.map((c) => ({ string_value: c })) },
          ...(engagementType ? [{ field: 'Engagement Type', operator: 'OPERATOR_EQUAL', categorical_values: [{ string_value: String(engagementType) }] }] : [])
        ]
      };
      // Never write a goal onto a metric that already existed in Tableau (the demo's shared metrics).
      // getOrCreate matches on filters only (comparison and include_null are ignored — verified on this site),
      // so if it hands back a metric this portal didn't create for this user, refuse rather than edit it.
      const created = await pulse.request(req.user, 'POST', '/pulse/metrics:getOrCreate', { definition_id: def.metadata.id, specification });
      if (created.is_metric_created) rememberOwn(req.user, created.metric.id); // only portal-created metrics are editable / deletable here
      if (!ownIds(req.user).has(created.metric.id)) return res.status(409).json({ error: 'This metric is already shared with your team, so a personal goal can’t be added to it. Pick a specific engagement instead.' });
      const metric = created.metric;
      // Pulse rejects goal names longer than ~20 characters (HTTP 400; verified on this site — 20 OK, 25 rejected).
      const target = { name: String(goalName || 'Our goal').trim().slice(0, 20) || 'Our goal', value: !raw && isPercent(def) ? value / 100 : value };
      await pulse.request(req.user, 'PATCH', `/pulse/metrics/${metric.id}`, { metric_id: metric.id, specification: metric.specification, goals: { target } });
      const me = await pulse.me(req.user);
      // Follow it (skip if already following).
      const subs = await pulse.request(req.user, 'GET', `/pulse/subscriptions?user_id=${me.userId}&metric_id=${encodeURIComponent(metric.id)}`);
      if (!(subs.subscriptions || []).some((s) => s.follower?.user_id === me.userId)) {
        await pulse.request(req.user, 'POST', '/pulse/subscriptions', { metric_id: metric.id, follower: { user_id: me.userId } });
      }
      pulse.resetContext(req.user);
      attentionCache.delete(attentionKey(req.user));
      saveAttention();
      activity.record(req.user, req.tenant, 'pulse-metric', { metric: def.metadata.name, goal: formatGoal(def, target.value), created: Boolean(created.is_metric_created) });
      res.json({ ok: true, metricId: metric.id, name: def.metadata.name, goal: formatGoal(def, target.value), created: Boolean(created.is_metric_created) });
    } catch (e) {
      fail(res, e);
    }
  });

  // The client's goal metrics, live from Pulse: each followed metric with a goal, its current value from the
  // Pulse BAN insight (POST /pulse/insights/ban), and progress to the goal. Premium.
  const BAN_TYPE = 'application/vnd.tableau.pulse.insightsservice.v1.GenerateInsightBundleBANRequest+json';
  app.get('/api/metrics/goals', requireUser, async (req, res) => {
    if (!ent(req.tenant).has('goals')) return res.status(403).json({ error: 'Goals are part of Premium.' });
    try {
      // Only the metrics this client created here — never the shared metrics the demo relies on.
      const mine = ownIds(req.user);
      const ctx = (await pulse.metricContext(req.user, agentScope(req.tenant))).filter((c) => c.goal?.value != null && mine.has(c.item.metadata.metric_id));
      const goals = await Promise.all(
        ctx.map(async (c) => {
          const body = {
            bundle_request: {
              version: 1,
              options: { output_format: 'OUTPUT_FORMAT_TEXT', time_zone: 'America/New_York', language: 'LANGUAGE_EN_US', locale: 'LOCALE_EN_US' },
              input: { metadata: c.item.metadata, metric: { ...c.item.metric, goals: { metric_goals: { target: c.goal } } } }
            }
          };
          const r = await pulse.request(req.user, 'POST', '/pulse/insights/ban', body, { types: { contentType: BAN_TYPE, accept: BAN_TYPE.replace('Request', 'Response') } }).catch((e) => ({ error: e.message }));
          const ins = (r.bundle_response?.result?.insight_groups || []).flatMap((g) => g.insights || []).find((i) => i.result?.facts?.target_period_value) || null;
          const f = ins?.result?.facts || {};
          const upIsGood = c.item.metric.representation_options?.sentiment_type !== 'SENTIMENT_TYPE_DOWN_IS_GOOD';
          const value = f.target_period_value?.raw ?? null;
          const filters = (c.item.metric.metric_specification?.filters || []).filter((x) => x.field !== 'Client Name');
          return {
            metricId: c.item.metadata.metric_id,
            name: c.item.metadata.name,
            scope: filters.map((x) => (x.values || x.categorical_values?.map((v) => v.string_value) || []).join(', ')).join(' · '),
            source: c.source,
            percentile: /Benchmark Percentile/i.test(c.item.metadata.name),
            unit: isPercent(c.item.metric) ? 'percent' : /CURRENCY/.test(c.item.metric.representation_options?.type || '') ? 'currency' : 'number',
            goal: c.goal,
            goalDisplay: formatGoal(c.item.metric, c.goal.value),
            value,
            valueDisplay: f.target_period_value?.formatted ?? null,
            period: f.target_time_period?.label ?? null,
            upIsGood,
            onTrack: value == null ? null : upIsGood ? value >= c.goal.value : value <= c.goal.value,
            sentence: ins?.result?.markup ? String(ins.result.markup).replace(/<[^>]+>/g, '') : null
          };
        })
      );
      res.json({ goals });
    } catch (e) {
      fail(res, e);
    }
  });

  // ── Delete a client's own goal metric (demo clean-up) ─────────────────────
  // Safeguard: only metrics this portal actually created for this user (getOrCreate returned
  // is_metric_created = true) — recorded in data/portal-metrics.json. A metric that already existed in Tableau
  // (even if a goal was added to it) and any shared / default metric can never be deleted from the portal.
  const OWN_FILE = require('path').join(__dirname, '..', '..', 'data', 'portal-metrics.json');
  let ownMetrics = {};
  try {
    ownMetrics = JSON.parse(require('fs').readFileSync(OWN_FILE, 'utf8'));
  } catch {
    /* none yet */
  }
  const saveOwn = () => require('fs').writeFile(OWN_FILE, JSON.stringify(ownMetrics, null, 1), () => {});
  const ownIds = (user) => new Set(ownMetrics[user.id] || []);
  const rememberOwn = (user, id) => {
    ownMetrics[user.id] = [...new Set([...(ownMetrics[user.id] || []), id])];
    saveOwn();
  };
  const forgetOwn = (user, id) => {
    ownMetrics[user.id] = (ownMetrics[user.id] || []).filter((x) => x !== id);
    saveOwn();
  };
  function isOwnGoalMetric(m, user) {
    return Boolean(m && !m.is_default && ownIds(user).has(m.id));
  }
  async function deleteOwnMetric(user, metricId) {
    const { metric } = await pulse.request(user, 'GET', `/pulse/metrics/${encodeURIComponent(metricId)}`);
    if (!isOwnGoalMetric(metric, user)) throw Object.assign(new Error('Only metrics you created with a goal can be deleted.'), { status: 403 });
    await pulse.request(user, 'DELETE', `/pulse/metrics/${encodeURIComponent(metricId)}`);
    forgetOwn(user, metricId);
    return metric;
  }
  app.delete('/api/metrics/:metricId', requireUser, async (req, res) => {
    if (!ent(req.tenant).has('goals')) return res.status(403).json({ error: 'Goals are part of Premium.' });
    try {
      await deleteOwnMetric(req.user, req.params.metricId);
      pulse.resetContext(req.user);
      attentionCache.delete(attentionKey(req.user));
      saveAttention();
      activity.record(req.user, req.tenant, 'pulse-metric', { metricId: req.params.metricId, deleted: true });
      res.json({ ok: true });
    } catch (e) {
      fail(res, e, e.status || 502);
    }
  });
  // Presenter clean-up: delete every metric the portal created for this client.
  app.post('/api/metrics/reset-goals', requireUser, async (req, res) => {
    try {
      const ids = [...ownIds(req.user)];
      const results = await Promise.all(
        ids.map((id) =>
          deleteOwnMetric(req.user, id).then(
            () => true,
            (e) => {
              if (e.status === 404) forgetOwn(req.user, id); // already gone in Tableau
              return e.status === 404;
            }
          )
        )
      );
      pulse.resetContext(req.user);
      attentionCache.delete(attentionKey(req.user));
      saveAttention();
      activity.record(req.user, req.tenant, 'pulse-metric', { reset: true, deleted: results.filter(Boolean).length });
      res.json({ ok: true, deleted: results.filter(Boolean).length, failed: results.filter((x) => !x).length });
    } catch (e) {
      fail(res, e);
    }
  });

  app.post('/api/metrics/:metricId/follow', requireUser, async (req, res) => {
    try {
      const me = await pulse.me(req.user);
      await pulse.request(req.user, 'POST', '/pulse/subscriptions', { metric_id: req.params.metricId, follower: { user_id: me.userId } });
      pulse.resetContext(req.user);
      attentionCache.delete(attentionKey(req.user));
      saveAttention();
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
      attentionCache.delete(attentionKey(req.user));
      saveAttention();
      activity.record(req.user, req.tenant, 'pulse-follow', { metricId: req.params.metricId, on: false });
      res.json({ ok: true });
    } catch (e) {
      fail(res, e);
    }
  });

  // ── Premium Industry Benchmarks (custom d3 page) ──────────────────────────
  // Queried with VizQL Data Service as the user, so row-level security applies; Premium is enforced here.
  app.get('/api/benchmarks', requireUser, async (req, res) => {
    const bc = cfg.benchmarks || {};
    if (!(bc.requires || ['benchmarks']).every((r) => ent(req.tenant).has(r))) {
      return res.status(403).json({ error: 'Industry Benchmarks are part of Premium.', price: bc.price || null });
    }
    try {
      const luid = await pulse.resolveDatasource(req.user, bc.datasource || cfg.authoring.datasources[0].name);
      const q = async (fields) => {
        const r = await pulse.vds(req.user, luid, fields);
        if (!r.ok) throw Object.assign(new Error(/VIZQL_DATA_API_ACCESS/.test(r.text) ? 'Your Tableau account needs API Access on this data source.' : `Tableau returned HTTP ${r.status}`), { status: r.status });
        return JSON.parse(r.text).data || [];
      };
      const month = { fieldCaption: 'Date', function: 'TRUNC_MONTH', fieldAlias: 'Month' };
      const avg = (f, alias) => ({ fieldCaption: f, function: 'AVG', fieldAlias: alias });
      const [byEngagement, kpis, vertical] = await Promise.all([
        q([{ fieldCaption: 'Engagement Type', fieldAlias: 'Engagement' }, month, avg('Benchmark Percentile', 'Percentile'), avg('Benchmark Target', 'Target'), { fieldCaption: 'Business Value Delivered', function: 'SUM', fieldAlias: 'Value' }]),
        q([month, avg('Value Realization Rate', 'VRR'), avg('Value Realization Target', 'VRR Target'), avg('Engagement Health', 'Health'), avg('Engagement Health Target', 'Health Target'), avg('Cycle Time Reduction', 'Cycle'), avg('Cycle Time Target', 'Cycle Target'), avg('Benchmark Percentile', 'Percentile')]),
        q([{ fieldCaption: 'Industry Vertical', fieldAlias: 'Vertical' }])
      ]);
      // Synthetic data runs past today; only use months that have happened.
      const now = new Date();
      const cutoff = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const inPast = (r) => String(r.Month).slice(0, 7) <= cutoff;
      activity.record(req.user, req.tenant, 'report-view', { view: 'Industry Benchmarks' });
      res.json({
        vertical: vertical.map((v) => v.Vertical).filter(Boolean),
        engagements: byEngagement.filter(inPast).map((r) => ({ engagement: r.Engagement, month: String(r.Month).slice(0, 7), percentile: r.Percentile, target: r.Target, value: r.Value })),
        kpis: kpis.filter(inPast).map((r) => ({ month: String(r.Month).slice(0, 7), vrr: r.VRR, vrrTarget: r['VRR Target'], health: r.Health, healthTarget: r['Health Target'], cycle: r.Cycle, cycleTarget: r['Cycle Target'], percentile: r.Percentile })).sort((a, b) => a.month.localeCompare(b.month))
      });
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
  return { warmAttention };
};
