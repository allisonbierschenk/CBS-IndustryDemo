// "Needs attention" — a Tableau Pulse Insight Brief over the metrics this user follows, asked one
// fixed question. The text comes from Pulse; follow-up questions open in the Agent.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, track } from '../lib/api.js';
import { useContact } from '../context/ContactContext.jsx';
import Icon from './Icon.jsx';
import PulseMarkup from './PulseMarkup.jsx';

/** Pulse markup → plain text lines (no tags, markdown or citation links). */
const plainLines = (markup) =>
  String(markup)
    .replace(/\[\[\d+\]\]\([^)]*\)/g, '')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map((l) => l.replace(/^[\s>#*\-•\d.)]+/, '').replace(/\*\*|__|\*/g, '').replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 12 && !/^-{3,}$/.test(l));

/** What the summary says about one metric (the lines that mention it). */
const linesAbout = (markup, name) => plainLines(markup).filter((l) => l.toLowerCase().includes(name.toLowerCase()));

export default function AttentionPanel() {
  const contact = useContact();
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
          {state.metrics?.length > 0 && (
            <div className="att-actions">
              <div className="kicker">Take action</div>
              {state.metrics.slice(0, 5).map((m) => {
                const about = linesAbout(state.content, m.name);
                const agentQ = `Why does ${m.name} need attention, and what is driving it?`;
                const discuss = () => {
                  track('selection-action', { action: 'attention-contact', metric: m.name });
                  const agenda = (state.followups || []).filter((q) => q.toLowerCase().includes(m.name.toLowerCase()));
                  contact(
                    'Schedule a review',
                    [
                      `I'd like to discuss ${m.name} (${m.source}). Tableau Pulse flagged it in my portal's Needs attention summary on ${new Date(state.generatedAt).toLocaleDateString([], { dateStyle: 'medium' })}.`,
                      about.length ? `\nWhat Pulse flagged:\n${about.slice(0, 4).map((l) => `• ${l}`).join('\n')}` : '',
                      `\nWhat I'd like to cover:\n${(agenda.length ? agenda : [`What is driving the change in ${m.name}?`, 'What should we do about it, and by when?']).map((q) => `• ${q}`).join('\n')}`
                    ].join('\n')
                  );
                };
                return (
                  <div className="att-row" key={m.metricId}>
                    <div className="att-what">
                      <b>{m.name}</b>
                      <span>{about[0] || `${m.source} metric`}</span>
                    </div>
                    <div className="att-btns">
                      <Link className="btn btn-ghost btn-sm" to={`/agent?q=${encodeURIComponent(agentQ)}&source=${encodeURIComponent(m.source)}`}>
                        <Icon name="agent" />
                        Ask the Agent
                      </Link>
                      {m.dashboard && (
                        <Link className="btn btn-ghost btn-sm" to={m.dashboard.to} title={m.dashboard.title}>
                          <Icon name="dashboard" />
                          Open dashboard
                        </Link>
                      )}
                      <button className="btn btn-dark btn-sm" onClick={discuss}>
                        <Icon name="mail" />
                        Contact Apex
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
