// "Needs attention" — a Tableau Pulse Insight Brief over the metrics this user follows, asked one
// fixed question. The text comes from Pulse; follow-up questions open in the Agent.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, track } from '../lib/api.js';
import { useContact } from '../context/ContactContext.jsx';
import Icon from './Icon.jsx';
import PulseMarkup from './PulseMarkup.jsx';

export default function AttentionPanel() {
  const contact = useContact();
  const [state, setState] = useState({ loading: true });
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async (refresh = false) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const d = await api(`/api/attention${refresh ? '?refresh=1' : ''}`);
      setState({ loading: Boolean(d.stale), ...d });
      // A stale answer shows instantly; the server is already building a fresh one — swap it in when ready.
      if (d.stale) {
        const fresh = await api('/api/attention?wait=1');
        setState({ loading: false, ...fresh });
      }
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: s.content ? null : e.message }));
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
          {state.metrics?.length > 0 && (
            <div className="att-actions">
              <div className="kicker">Take action</div>
              {state.metrics.slice(0, 5).map((m) => {
                const agentQ = m.noData ? `Why is there no current data for ${m.name}?` : `What is driving the latest change in ${m.name}?`;
                const discuss = () => {
                  track('selection-action', { action: 'attention-contact', metric: m.name });
                  const agenda = (state.followups || []).filter((q) => q.toLowerCase().includes(m.name.toLowerCase()));
                  contact(
                    'Schedule a review',
                    [
                      `I'd like to discuss ${m.name} (${m.source}). Tableau Pulse flagged it in my portal's Needs attention summary on ${new Date(state.generatedAt).toLocaleDateString([], { dateStyle: 'medium' })}.`,
                      m.details?.length ? `\nWhat Pulse flagged:\n${m.details.map((l) => `• ${l}`).join('\n')}` : '\nPulse has no data for this metric in the current period yet.',
                      `\nWhat I'd like to cover:\n${(agenda.length ? agenda : [`What is driving the change in ${m.name}?`, 'What should we do about it, and by when?']).map((q) => `• ${q}`).join('\n')}`
                    ].join('\n')
                  );
                };
                return (
                  <div className={`att-row${m.sentiment === 'negative' ? ' is-negative' : ''}${m.noData ? ' is-nodata' : ''}`} key={m.metricId}>
                    <div className="att-what">
                      <b>{m.name}</b>
                      <span title={m.headline}>{m.headline}</span>
                    </div>
                    <div className="att-btns">
                      <Link className="att-icon" to={`/agent?q=${encodeURIComponent(agentQ)}&source=${encodeURIComponent(m.source)}`} title="Ask the Agent" aria-label={`Ask the Agent about ${m.name}`}>
                        <Icon name="agent" />
                      </Link>
                      {m.dashboard && (
                        <Link className="att-icon" to={m.dashboard.to} title={`Open ${m.dashboard.title}`} aria-label={`Open ${m.dashboard.title}`}>
                          <Icon name="dashboard" />
                        </Link>
                      )}
                      <button className="att-icon is-dark" onClick={discuss} title="Contact Apex about this" aria-label={`Contact Apex about ${m.name}`}>
                        <Icon name="mail" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
