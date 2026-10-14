// "Needs attention" — a Tableau Pulse Insight Brief over the metrics this user follows, asked one
// fixed question. The text comes from Pulse; follow-up questions open in the Agent.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import Icon from './Icon.jsx';
import PulseMarkup from './PulseMarkup.jsx';

export default function AttentionPanel() {
  const [state, setState] = useState({ loading: true });
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async (refresh = false) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const d = await api(`/api/attention${refresh ? '?refresh=1' : ''}`);
      setState({ loading: false, ...d });
    } catch (e) {
      setState({ loading: false, error: e.message });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="attention" aria-labelledby="att-title">
      <div className="attention-head">
        <div>
          <div className="kicker">From your Tableau Pulse metrics</div>
          <h2 id="att-title">Needs attention</h2>
        </div>
        {state.generatedAt && (
          <button className="btn btn-ghost btn-sm" onClick={() => load(true)} disabled={state.loading}>
            {state.loading ? 'Refreshing…' : `Updated ${new Date(state.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
          </button>
        )}
      </div>
      {state.loading && !state.content && (
        <div className="attention-skel" aria-label="Loading">
          <span />
          <span />
          <span />
        </div>
      )}
      {state.error && <div className="error-msg">{state.error}</div>}
      {state.empty && (
        <p className="muted">
          {state.reason} <Link to="/alerts">Follow metrics</Link>
        </p>
      )}
      {state.content && (
        <>
          <div className={`attention-body${expanded ? '' : ' is-clamped'}`}>
            <PulseMarkup text={state.content} />
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setExpanded((x) => !x)} aria-expanded={expanded}>
            {expanded ? 'Show less' : 'Read the full summary'}
          </button>
          {state.followups?.length > 0 && (
            <div className="attention-followups">
              {state.followups.map((q) => (
                <Link key={q} className="chip-q" to={`/agent?q=${encodeURIComponent(q)}`}>
                  {q}
                  <Icon name="arrowRight" />
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
