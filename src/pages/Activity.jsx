// Portal activity log (Apex administrators): sign-ins, dashboard views, exports, shares, subscriptions…
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import Crumbs from '../components/Crumbs.jsx';

const LABELS = {
  'sign-in': 'Signed in',
  'dashboard-token': 'Opened dashboard',
  'dashboard-view': 'Opened dashboard',
  'report-view': 'Opened report',
  'agent-question': 'Asked the agent',
  attention: 'Needs-attention summary',
  export: 'Exported',
  share: 'Shared a link',
  filter: 'Filtered',
  'custom-view': 'Saved view',
  assistant: 'Tableau Agent',
  favorite: 'Favorite',
  subscription: 'Subscription',
  'pulse-follow': 'Followed a metric',
  authoring: 'Built a report',
  feed: 'Data feed refreshed',
  message: 'Messaged Apex',
  'slack-share': 'Shared to Slack (demo)',
  'selection-action': 'Acted on a selection'
};

const describe = (d = {}) =>
  Object.entries(d)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');

export default function Activity() {
  const [state, setState] = useState({ loading: true });
  const [type, setType] = useState('');
  const [client, setClient] = useState('');

  useEffect(() => {
    api('/api/activity')
      .then((d) => setState(d))
      .catch((e) => setState({ error: e.message }));
  }, []);

  const entries = state.entries || [];
  const clients = useMemo(() => [...new Set(entries.map((e) => e.client).filter(Boolean))].sort(), [entries]);
  const types = useMemo(() => [...new Set(entries.map((e) => e.type))].sort(), [entries]);
  const shown = entries.filter((e) => (!type || e.type === type) && (!client || e.client === client));

  return (
    <div className="container">
      <Crumbs items={[{ label: 'Home', to: '/' }, { label: 'Activity log' }]} />
      <div className="page-head">
        <div>
          <h1>Activity log</h1>
          <p className="lead">What clients do in the portal, most recent first.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <select className="input" style={{ width: 'auto' }} value={client} onChange={(e) => setClient(e.target.value)} aria-label="Client">
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select className="input" style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value)} aria-label="Activity">
            <option value="">All activity</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {LABELS[t] || t}
              </option>
            ))}
          </select>
        </div>
      </div>
      {state.loading && <p className="muted">Loading…</p>}
      {state.error && <div className="error-msg">{state.error}</div>}
      {state.entries && (
        <div className="viz-card">
          <div className="dp-scroll" style={{ maxHeight: '70vh' }}>
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Client</th>
                  <th>Activity</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e, i) => (
                  <tr key={i}>
                    <td>{new Date(e.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td>
                      {e.name || e.user}
                      {e.name && <div className="muted" style={{ fontSize: 11.5 }}>{e.user}</div>}
                    </td>
                    <td>{e.client}</td>
                    <td>{LABELS[e.type] || e.type}</td>
                    <td style={{ whiteSpace: 'normal', color: 'var(--muted)' }}>{describe(e.detail)}</td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      No activity yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
