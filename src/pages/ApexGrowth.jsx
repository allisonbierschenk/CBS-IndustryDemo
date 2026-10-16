// Apex's own view (Apex staff, e.g. Alex Morgan): client growth from Data 360 — Premium revenue (Salesforce
// Opportunities), portal engagement (Apex Portal Activity) and launch-campaign reach, harmonized per client.
// "Create follow-ups" activates the upsell list back into Salesforce as Tasks for each client's rep.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';
import Crumbs from '../components/Crumbs.jsx';
import Icon from '../components/Icon.jsx';
import InfoTip from '../components/InfoTip.jsx';

const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export default function ApexGrowth() {
  const toast = useToast();
  const [state, setState] = useState({ loading: true });
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    api('/api/apex/growth')
      .then((data) => {
        setState({ data });
        setPicked(new Set(data.upsell.slice(0, 2).map((c) => c.id)));
      })
      .catch((e) => setState({ error: e.message }));
  }, []);
  useEffect(load, [load]);

  const followUp = async () => {
    setBusy('followups');
    try {
      const clients = state.data.upsell.filter((c) => picked.has(c.id));
      const r = await api('/api/apex/followups', { method: 'POST', body: { clients } });
      toast(`${r.created.length} follow-up${r.created.length === 1 ? '' : 's'} created in Salesforce for the reps`);
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(null);
    }
  };
  const sync = async () => {
    setBusy('sync');
    try {
      await api('/api/apex/sync', { method: 'POST' });
      toast('Data 360 refresh started — new activity and upgrades land in a few minutes');
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(null);
    }
  };

  const d = state.data;
  return (
    <div className="container">
      <Crumbs items={[{ label: 'Apex' }, { label: 'Client growth' }]} />
      <div className="page-head">
        <div>
          <div className="kicker">Apex · Data 360</div>
          <div className="title-row">
            <h1>Client growth</h1>
            <InfoTip kind="data360" label="About Client growth" />
          </div>
          <p className="lead">Premium revenue, portal engagement and campaign reach for every client — harmonized in Data 360 from Salesforce and the portal.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={sync} disabled={busy === 'sync'}>
          <Icon name="spark" />
          {busy === 'sync' ? 'Syncing…' : 'Sync to Data 360'}
        </button>
      </div>
      {state.loading && !d && <div className="bm-panel bm-loading">Loading from Data 360…</div>}
      {state.error && <div className="error-msg">{state.error}</div>}
      {d && (
        <div className="gr-grid">
          <section className="bm-panel gr-kpis" aria-label="Totals">
            <Kpi label="Premium ARR" value={money(d.totals.arr)} note={`from ${d.sources.arr}`} />
            <Kpi label="From the launch campaign" value={money(d.totals.campaignArr)} note="attributed upgrades" accent />
            <Kpi label="Premium seats" value={d.totals.seats} note="bought in the portal" />
            <Kpi label="Portal activity" value={d.totals.events.toLocaleString('en-US')} note="events, last 30 days" />
          </section>

          <section className="bm-panel gr-upsell" aria-labelledby="gr-upsell-title">
            <div className="bm-panel-head">
              <h3 id="gr-upsell-title">Next best upsell</h3>
              <span>Standard clients the campaign reached, ranked by portal engagement</span>
            </div>
            {d.upsell.length ? (
              <>
                <ul className="gr-list">
                  {d.upsell.map((c, i) => (
                    <li key={c.id}>
                      <label>
                        <input type="checkbox" checked={picked.has(c.id)} onChange={() => setPicked((s) => { const t = new Set(s); t.has(c.id) ? t.delete(c.id) : t.add(c.id); return t; })} />
                        <span className="gr-rank">{i + 1}</span>
                        <span className="gr-name">
                          <b>{c.name}</b>
                          <small>
                            {c.events} events · {c.people} people active · campaign reached {c.recipients}
                          </small>
                        </span>
                        <Spark points={c.weekly} />
                      </label>
                    </li>
                  ))}
                </ul>
                <button className="btn btn-lime btn-sm" onClick={followUp} disabled={!picked.size || busy === 'followups'}>
                  <Icon name="send" />
                  {busy === 'followups' ? 'Creating…' : `Create ${picked.size} follow-up${picked.size === 1 ? '' : 's'} in Salesforce`}
                </button>
              </>
            ) : (
              <p className="gr-empty">No engaged Standard clients right now.</p>
            )}
          </section>

          <section className="bm-panel gr-clients" aria-labelledby="gr-clients-title">
            <div className="bm-panel-head">
              <h3 id="gr-clients-title">Every client</h3>
              <span>
                Revenue from {d.sources.arr} · engagement from {d.sources.engagement}
              </span>
            </div>
            <table className="gr-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Plan</th>
                  <th className="num">Premium ARR</th>
                  <th className="num">Seats</th>
                  <th className="num">Portal events</th>
                  <th className="num">People</th>
                  <th className="num">Campaign reach</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {d.clients.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b>{c.name}</b>
                      <small>{c.industry}</small>
                    </td>
                    <td>
                      <span className={`mini-tier ${c.tier}`}>{c.tier === 'premium' ? 'Premium' : 'Standard'}</span>
                    </td>
                    <td className="num">{money(c.arr)}</td>
                    <td className="num">{c.seats || '—'}</td>
                    <td className="num">{c.events}</td>
                    <td className="num">{c.people}</td>
                    <td className="num">{c.recipients}</td>
                    <td>
                      <Spark points={c.weekly} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="bm-panel gr-upgrades" aria-labelledby="gr-upg-title">
            <div className="bm-panel-head">
              <h3 id="gr-upg-title">Recent Premium upgrades</h3>
              <span>Salesforce Opportunities, via Data 360</span>
            </div>
            <ul className="gr-list">
              {d.upgrades.map((u, i) => (
                <li key={`${u.name}-${i}`} className="gr-upg">
                  <span className="gr-name">
                    <b>{u.name}</b>
                    <small>
                      {u.closed}
                      {u.seats ? ` · ${u.seats} seats` : ''}
                    </small>
                  </span>
                  {u.campaign && <span className="persona-chip">Launch campaign</span>}
                  <b className="gr-amt">{money(u.amount)}/yr</b>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, note, accent }) {
  return (
    <div className={`gr-kpi${accent ? ' is-accent' : ''}`}>
      <span>{label}</span>
      <b>{value}</b>
      <small>{note}</small>
    </div>
  );
}

/** Weekly portal events, as a tiny line. */
function Spark({ points = [] }) {
  if (points.length < 2) return <span className="gr-spark-empty">—</span>;
  const w = 96;
  const h = 26;
  const max = Math.max(...points.map((p) => p.events), 1);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${((i / (points.length - 1)) * w).toFixed(1)},${(h - (p.events / max) * (h - 4) - 2).toFixed(1)}`).join(' ');
  return (
    <svg className="gr-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
