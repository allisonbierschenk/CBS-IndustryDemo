// Alerts & subscriptions — the user's Tableau email subscriptions and Tableau Pulse metric follows.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';
import Crumbs from '../components/Crumbs.jsx';
import Icon from '../components/Icon.jsx';

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
          <h1>Alerts &amp; subscriptions</h1>
          <p className="lead">Dashboards emailed to you on a schedule, and the Tableau Pulse metrics you follow.</p>
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
          Tableau Pulse metrics
        </h2>
        <p className="muted" style={{ margin: '6px 0 16px' }}>
          Metrics you follow power the Agent and the “Needs attention” summary on your home page.
        </p>
        {metrics.loading && <p className="muted">Loading…</p>}
        {metrics.error && <div className="error-msg">{metrics.error}</div>}
        {metrics.metrics?.length > 0 && (
          <div className="list-card">
            {metrics.metrics.map((m) => (
              <div className="list-row" key={m.id}>
                <Icon name="chart" />
                <div>
                  <b>{m.name}</b>
                  <span>{m.following ? (m.via === 'group' ? 'Following · set by your Apex team' : 'Following') : 'Not following'}</span>
                </div>
                {m.following ? (
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
