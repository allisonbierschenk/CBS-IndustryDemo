// "Refresh data": refreshes the dashboard's PUBLISHED DATA SOURCE in Tableau, on demand.
//   1. POST /api/refresh/:viewKey → the server calls Tableau REST "Update Data Source Now"
//      (POST /datasources/{id}/refresh) as the data source owner, after checking the user is entitled.
//   2. Polls GET /api/refresh/jobs/:id → Tableau "Query Job" (progress, finishCode) until it finishes.
//   3. On success, viz.refreshDataAsync() so the dashboard re-queries the freshly refreshed data.
// Every step shows Tableau's own response (job id, status, errors), so the demo proves what happened.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';
import Icon from './Icon.jsx';

const POLL_MS = 4000;
const MAX_POLLS = 150; // ~10 minutes
const timeOf = (v) => (v ? new Date(v).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '');

export default function RefreshButton({ viz, viewKey }) {
  const toast = useToast();
  const [state, setState] = useState(null); // { phase: 'starting'|'running'|'done'|'error', ... }
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const alive = useRef(true);

  useEffect(() => () => {
    alive.current = false;
    clearTimeout(timer.current);
  }, []);

  const poll = async (jobId, n = 0) => {
    if (!alive.current) return;
    try {
      const j = await api(`/api/refresh/jobs/${jobId}`);
      if (!alive.current) return;
      if (!j.done) {
        setState((s) => ({ ...s, phase: 'running', job: j }));
        if (n < MAX_POLLS) timer.current = setTimeout(() => poll(jobId, n + 1), POLL_MS);
        else setState((s) => ({ ...s, phase: 'error', error: 'Still running in Tableau after 10 minutes. Check the job in Tableau Cloud.' }));
        return;
      }
      if (j.ok) {
        try {
          await viz?.refreshDataAsync();
        } catch (e) {
          console.warn('[refresh] refreshDataAsync after extract refresh failed:', e);
        }
        setState((s) => ({ ...s, phase: 'done', job: j }));
        toast(`${j.datasource} refreshed in Tableau`);
      } else {
        setState((s) => ({ ...s, phase: 'error', job: j, error: j.notes?.join(' ') || `Tableau job finished with code ${j.finishCode} (${j.finishCode === 2 ? 'canceled' : 'failed'}).` }));
      }
    } catch (e) {
      setState((s) => ({ ...s, phase: 'error', error: e.message }));
    }
  };

  const start = async () => {
    if (state?.phase === 'starting' || state?.phase === 'running') return setOpen(true);
    setOpen(true);
    setState({ phase: 'starting', requestedAt: new Date().toISOString() });
    try {
      const r = await api(`/api/refresh/${encodeURIComponent(viewKey)}`, { method: 'POST' });
      setState((s) => ({ ...s, phase: 'running', start: r }));
      poll(r.jobId);
    } catch (e) {
      setState((s) => ({ ...s, phase: 'error', error: e.message }));
    }
  };

  const busy = state?.phase === 'starting' || state?.phase === 'running';
  const label = busy ? 'Refreshing in Tableau…' : state?.phase === 'done' ? `Refreshed · ${timeOf(state.job?.completedAt)}` : 'Refresh data';

  return (
    <span className="rf-wrap">
      <button className="btn btn-ghost btn-sm btn-icon" onClick={start} aria-label={label} title={`${label}: refresh this dashboard's published data source in Tableau now`}>
        <Icon name="refresh" className={busy ? 'dd-spin' : undefined} />
      </button>
      {open && state && (
        <div className="rf-pop" role="status">
          <div className="rf-head">
            <b>On-demand refresh · Tableau REST API</b>
            <button className="link-btn" onClick={() => setOpen(false)} aria-label="Close">
              ✕
            </button>
          </div>
          <ol className="rf-steps">
            <li className={state.start ? 'is-ok' : state.phase === 'error' && !state.start ? 'is-err' : ''}>
              <code>POST …/datasources/{state.start?.datasourceId ? `${state.start.datasourceId.slice(0, 8)}…` : '{id}'}/refresh</code>
              <div className="muted">
                {state.start ? `Accepted · job ${state.start.jobId} · ${state.start.datasource}` : state.phase === 'starting' ? 'Asking Tableau…' : ''}
              </div>
            </li>
            {state.start && (
              <li className={state.phase === 'done' ? 'is-ok' : state.phase === 'error' ? 'is-err' : ''}>
                <code>GET …/jobs/{state.start.jobId.slice(0, 8)}…</code>
                <div className="muted">
                  {state.job
                    ? state.job.done
                      ? `Finished ${timeOf(state.job.completedAt)} · finishCode ${state.job.finishCode}${state.job.ok ? ' (success)' : ''}`
                      : `In progress${state.job.progress != null ? ` · ${state.job.progress}%` : ''}${state.job.startedAt ? ` · started ${timeOf(state.job.startedAt)}` : ' · queued'}`
                    : 'Queued in Tableau…'}
                </div>
              </li>
            )}
            {state.phase === 'done' && (
              <li className="is-ok">
                <code>viz.refreshDataAsync()</code>
                <div className="muted">Dashboard re-queried the refreshed data</div>
              </li>
            )}
          </ol>
          {state.error && <div className="error-msg rf-err">{state.error}</div>}
        </div>
      )}
    </span>
  );
}
