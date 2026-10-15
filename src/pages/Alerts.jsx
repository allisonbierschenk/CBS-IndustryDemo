// Alerts & subscriptions — the user's Tableau email subscriptions and Tableau Pulse metric follows.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';
import Crumbs from '../components/Crumbs.jsx';
import Icon from '../components/Icon.jsx';
import InfoTip from '../components/InfoTip.jsx';
import UpgradeButton from '../components/UpgradeButton.jsx';
import { useSession } from '../context/SessionContext.jsx';

function schedule(s) {
  const iv = [].concat(s.details?.intervals?.interval || []);
  const at = s.details?.start?.slice(0, 5);
  if (s.frequency === 'Weekly') return `Weekly · ${iv.map((i) => i.weekDay).filter(Boolean).join(', ')} at ${at}`;
  if (s.frequency === 'Monthly') return `Monthly · day ${iv.map((i) => (i.monthDay === 'LastDay' ? 'last' : i.monthDay)).filter(Boolean).join(', ')} at ${at}`;
  return `${s.frequency || 'Scheduled'} at ${at}`;
}

export default function Alerts() {
  const toast = useToast();
  const [subs, setSubs] = useState({ loading: true });
  const [metrics, setMetrics] = useState({ loading: true });
  const [busy, setBusy] = useState(null);

  const loadSubs = useCallback(() => api('/api/subscriptions').then((d) => setSubs(d)).catch((e) => setSubs({ error: e.message })), []);
  const loadMetrics = useCallback(() => api('/api/metrics').then((d) => setMetrics(d)).catch((e) => setMetrics({ error: e.message })), []);
  useEffect(() => {
    loadSubs();
    loadMetrics();
  }, [loadSubs, loadMetrics]);

  const removeSub = async (s) => {
    setBusy(s.id);
    try {
      await api(`/api/subscriptions/${s.id}`, { method: 'DELETE' });
      toast('Subscription removed');
      await loadSubs();
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(null);
    }
  };

  const removeMetric = async (m) => {
    if (!window.confirm(`Delete your ${m.name} metric and its goal? This removes it from Tableau.`)) return;
    setBusy(m.id);
    try {
      await api(`/api/metrics/${m.id}`, { method: 'DELETE' });
      toast(`Deleted your ${m.name} metric`);
      await loadMetrics();
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(null);
    }
  };

  const follow = async (m, on) => {
    setBusy(m.id);
    try {
      await api(`/api/metrics/${m.id}/follow`, { method: on ? 'POST' : 'DELETE' });
      toast(on ? `Following ${m.name}` : `Unfollowed ${m.name}`);
      await loadMetrics();
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="container">
      <Crumbs items={[{ label: 'Home', to: '/' }, { label: 'Alerts & subscriptions' }]} />
      <div className="page-head">
        <div>
          <div className="title-row">
            <h1>Alerts &amp; subscriptions</h1>
            <InfoTip kind="alerts" label="About alerts & subscriptions" />
          </div>
          <p className="lead">Dashboards emailed to you on a schedule, and the metrics you follow.</p>
        </div>
      </div>

      <section className="section" style={{ paddingTop: 8 }} aria-labelledby="subs-title">
        <h2 className="section-title" id="subs-title" style={{ fontSize: 22 }}>
          Email subscriptions
        </h2>
        <p className="muted" style={{ margin: '6px 0 16px' }}>
          Use <b>Subscribe</b> on any dashboard to add one. Each email shows only your data.
        </p>
        {subs.loading && <p className="muted">Loading…</p>}
        {subs.error && <div className="error-msg">{subs.error}</div>}
        {subs.subscriptions && subs.subscriptions.length === 0 && (
          <p className="muted">
            No subscriptions yet. <Link to="/dashboards">Open a dashboard</Link> and choose Subscribe.
          </p>
        )}
        {subs.subscriptions?.length > 0 && (
          <div className="list-card">
            {subs.subscriptions.map((s) => (
              <div className="list-row" key={s.id}>
                <Icon name="mail" />
                <div>
                  <b>{s.subject}</b>
                  <span>
                    {schedule(s)} · {s.attachPdf === true || s.attachPdf === 'true' ? 'PDF' : 'Image'}
                    {s.nextRunAt && ` · next ${new Date(s.nextRunAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`}
                  </span>
                </div>
                <button className="btn btn-ghost btn-sm" disabled={busy === s.id} onClick={() => removeSub(s)}>
                  {busy === s.id ? 'Removing…' : 'Unsubscribe'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="metrics-title">
        <h2 className="section-title" id="metrics-title" style={{ fontSize: 22 }}>
          Your metrics
        </h2>
        <p className="muted" style={{ margin: '6px 0 16px' }}>
          Metrics you follow power the Agent and the “Needs attention” summary on your home page.
        </p>
        <CreateMetric onCreated={loadMetrics} />
        {metrics.loading && <p className="muted">Loading…</p>}
        {metrics.error && <div className="error-msg">{metrics.error}</div>}
        {metrics.metrics?.length > 0 && (
          <div className="list-card">
            {metrics.metrics.map((m) => (
              <div className="list-row" key={m.id}>
                <Icon name="chart" />
                <div>
                  <b>
                    {m.name}
                    {m.detail && <span className="metric-detail"> · {m.detail}</span>}
                  </b>
                  <span>
                    {m.following ? (m.via === 'group' ? 'Following · set by your Apex team' : 'Following') : 'Not following'}
                    {m.goal && <span className="goal-chip">🎯 {m.goal.name}: {m.goal.display}</span>}
                  </span>
                </div>
                {m.own ? (
                  <button className="btn btn-ghost btn-sm" disabled={busy === m.id} onClick={() => removeMetric(m)}>
                    {busy === m.id ? 'Deleting…' : 'Delete'}
                  </button>
                ) : m.following ? (
                  m.canUnfollow ? (
                    <button className="btn btn-ghost btn-sm" disabled={busy === m.id} onClick={() => follow(m, false)}>
                      Unfollow
                    </button>
                  ) : (
                    <span className="list-note">
                      <Icon name="lock" size={13} />
                      Group follow
                    </span>
                  )
                ) : (
                  <button className="btn btn-dark btn-sm" disabled={busy === m.id} onClick={() => follow(m, true)}>
                    Follow
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** Create your own Pulse metric with a goal; you follow it automatically. */
function CreateMetric({ onCreated }) {
  const { me } = useSession();
  if (!me.features?.pulseGoals) return <CreateMetricLocked />;
  return <CreateMetricForm onCreated={onCreated} />;
}

/** Standard clients: what Premium adds here, with the in-place upgrade. */
function CreateMetricLocked() {
  return (
    <div className="create-metric is-locked">
      <div className="cm-head">
        <Icon name="lock" />
        <div>
          <b>Create your own metrics with goals · Premium</b>
          <span>Set a target on any KPI — we track your progress to it every week, and Needs attention measures you against your goal.</span>
        </div>
        <UpgradeButton className="btn btn-dark btn-sm" label="Upgrade" />
      </div>
    </div>
  );
}

function CreateMetricForm({ onCreated }) {
  const toast = useToast();
  const [defs, setDefs] = useState(null);
  const [form, setForm] = useState({ definitionId: '', goal: '', goalName: 'Our goal' });
  const [state, setState] = useState({ kind: 'idle' });
  useEffect(() => {
    api('/api/metrics/definitions')
      .then((d) => {
        setDefs(d.definitions);
        if (d.definitions[0]) setForm((f) => ({ ...f, definitionId: d.definitions[0].id }));
      })
      .catch((e) => setState({ kind: 'error', message: e.message }));
  }, []);
  const def = defs?.find((d) => d.id === form.definitionId);
  const submit = async (e) => {
    e.preventDefault();
    setState({ kind: 'saving' });
    try {
      const r = await api('/api/metrics/create', { method: 'POST', body: form });
      toast(`Following ${r.name} with a goal of ${r.goal}`);
      setState({ kind: 'done', ...r });
      onCreated?.();
    } catch (err) {
      setState({ kind: 'error', message: err.message });
    }
  };
  return (
    <form className="create-metric" onSubmit={submit}>
      <div className="cm-head">
        <Icon name="target" />
        <div>
          <b className="title-row">
            Create your own metric <InfoTip kind="goals" label="About your own metrics" />
          </b>
          <span>Pick a KPI and set your goal. We track your progress, and you follow it automatically.</span>
        </div>
      </div>
      <div className="cm-fields">
        <div className="field">
          <label htmlFor="cm-def">Metric</label>
          <select id="cm-def" className="input" value={form.definitionId} onChange={(e) => setForm((f) => ({ ...f, definitionId: e.target.value }))} disabled={!defs}>
            {!defs && <option>Loading your metrics…</option>}
            {(defs || []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.source && d.source !== 'Value Intelligence' ? ` (${d.source})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cm-goal">Goal{def ? (def.upIsGood ? ' (at least)' : ' (at most)') : ''}</label>
          <div className="cm-goal">
            {def?.unit === 'currency' && <span>$</span>}
            <input id="cm-goal" className="input" type="number" step="any" required value={form.goal} onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))} placeholder={def?.unit === 'percent' ? '90' : '100000'} />
            {def?.unit === 'percent' && <span>%</span>}
          </div>
        </div>
        <div className="field">
          <label htmlFor="cm-name">Goal name</label>
          <input id="cm-name" className="input" maxLength={20} value={form.goalName} onChange={(e) => setForm((f) => ({ ...f, goalName: e.target.value }))} />
        </div>
        <button className="btn btn-dark" type="submit" disabled={state.kind === 'saving' || !defs}>
          {state.kind === 'saving' ? 'Creating…' : 'Create & follow'}
        </button>
      </div>
      {state.kind === 'error' && <div className="error-msg">{state.message}</div>}
      {state.kind === 'done' && (
        <p className="cm-done">
          <Icon name="check" size={14} /> {state.created ? 'Created' : 'Updated'} your {state.name} metric with a goal of {state.goal}. It now appears in the Agent and Needs attention.
        </p>
      )}
    </form>
  );
}
