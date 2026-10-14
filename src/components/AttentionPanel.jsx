// "Needs attention" — a Tableau Pulse Insight Brief over the metrics this user follows, asked one
// fixed question. The text comes from Pulse; follow-up questions open in the Agent.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, track } from '../lib/api.js';
import { useContact } from '../context/ContactContext.jsx';
import Icon from './Icon.jsx';
import InfoTip from './InfoTip.jsx';
import PulseMarkup from './PulseMarkup.jsx';

export default function AttentionPanel() {
  const contact = useContact();
  const [state, setState] = useState({ loading: true });
  const [expanded, setExpanded] = useState(false);

  // Pulse's suggested follow-ups that mention this topic become the agenda; otherwise sensible defaults.
  const agendaFor = (name, fallback) => {
    const own = (state.followups || []).filter((q) => q.toLowerCase().includes(name.toLowerCase()));
    return own.length ? own : fallback;
  };
  const contactAbout = (topic, opening, facts, agenda) => {
    track('selection-action', { action: 'attention-contact', metric: topic });
    const when = new Date(state.generatedAt).toLocaleDateString([], { dateStyle: 'medium' });
    contact(
      'Schedule a review',
      [`${opening} Tableau Pulse flagged it in my portal's Needs attention summary on ${when}.`, `\nWhat Pulse shows:\n${facts.filter(Boolean).map((l) => `• ${l}`).join('\n')}`, `\nWhat I'd like to cover:\n${agenda.map((q) => `• ${q}`).join('\n')}`].join('\n')
    );
  };

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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {state.generatedAt && (
            <button className="btn btn-ghost btn-sm" onClick={() => load(true)} disabled={state.loading}>
              {state.loading ? 'Refreshing…' : `Updated ${new Date(state.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
            </button>
          )}
          <InfoTip kind="attention" extra={{ generatedAt: state.generatedAt }} label="About Needs attention" />
        </div>
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
          {(state.metrics?.length > 0 || state.onTrack?.length > 0) && (
            <div className="att-actions">
              <div className="kicker">Take action</div>
              {state.metrics.slice(0, 5).map((m) => (
                <ActionRow
                  key={m.metricId}
                  title={m.name}
                  status="Off track"
                  issue={m.issue}
                  expectation={m.expectation}
                  drivers={m.drivers}
                  ask={m.ask}
                  source={m.source}
                  dashboard={m.dashboard}
                  onContact={() =>
                    contactAbout(
                      m.name,
                      `I'd like to discuss ${m.name} (${m.source}).`,
                      [m.issue, m.expectation, ...(m.drivers || []).map((d) => `Driven by ${d}`)],
                      agendaFor(m.name, [`What is driving the change in ${m.name}?`, 'What should we do about it, and by when?'])
                    )
                  }
                />
              ))}
              {state.onTrack?.length > 0 && (
                <p className="att-ontrack">
                  <Icon name="check" size={14} />
                  <span>
                    <b>On track:</b> {state.onTrack.map((o) => `${o.name} (${o.note})`).join(' · ')}
                  </span>
                </p>
              )}
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

function ActionRow({ title, status, issue, expectation, drivers = [], ask, source, dashboard, onContact }) {
  return (
    <div className="att-row is-negative">
      <div className="att-what">
        <div className="att-title">
          <b>{title}</b>
          <span className="att-status">{status}</span>
        </div>
        <dl className="att-facts">
          <dt>Issue</dt>
          <dd>{issue}</dd>
          <dt>Expected</dt>
          <dd>{expectation}</dd>
          {drivers.length > 0 && (
            <>
              <dt>Driven by</dt>
              <dd>{drivers.join(' · ')}</dd>
            </>
          )}
        </dl>
      </div>
      <div className="att-btns">
        <Link className="att-icon" to={`/agent?q=${encodeURIComponent(ask)}${source ? `&source=${encodeURIComponent(source)}` : ''}`} title="Ask the Agent" aria-label={`Ask the Agent about ${title}`}>
          <Icon name="agent" />
        </Link>
        {dashboard && (
          <Link className="att-icon" to={dashboard.to} title={`Open ${dashboard.title}`} aria-label={`Open ${dashboard.title}`}>
            <Icon name="dashboard" />
          </Link>
        )}
        <button className="att-icon is-dark" onClick={onContact} title="Contact Apex about this" aria-label={`Contact Apex about ${title}`}>
          <Icon name="mail" />
        </button>
      </div>
    </div>
  );
}
