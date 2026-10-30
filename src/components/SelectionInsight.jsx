// "Explain with Pulse" for a mark selection: asks the Tableau Pulse Insight Brief about the selected
// marks, using only the metrics the user follows on one data source (e.g. Transportation), and shows
// the answer beside the dashboard. Follow-ups continue in the Agent on the same data source.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import Icon from './Icon.jsx';
import PulseMarkup from './PulseMarkup.jsx';

export default function SelectionInsight({ question, source, what, worksheet, onClose }) {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let alive = true;
    api('/api/agent/chat', { method: 'POST', body: { question, source, explain: true } })
      .then((d) => alive && setState(d))
      .catch((e) => alive && setState({ error: e.message }));
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      alive = false;
      document.removeEventListener('keydown', onKey);
    };
  }, [question, source, onClose]);

  const agentLink = (q) => `/agent?q=${encodeURIComponent(q)}&source=${encodeURIComponent(source)}`;

  return (
    <aside className="insight-drawer" role="dialog" aria-labelledby="insight-title">
      <div className="insight-head">
        <div>
          <div className="kicker">Explained from your {source} metrics</div>
          <h3 id="insight-title">{what}</h3>
          <small className="muted">Selected in {worksheet}</small>
        </div>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="insight-body">
        <div className="user-msg insight-q">{question}</div>
        {state.loading && (
          <div className="ai-loading">
            <span className="dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            Analyzing your {source} metrics…
          </div>
        )}
        {state.error && <div className="error-msg">{state.error}</div>}
        {state.content && (
          <>
            {state.metricCount && <p className="muted insight-scope">Answered from {state.metricCount} {source} metrics you follow.</p>}
            <PulseMarkup text={state.content} />
            {state.followups?.length > 0 && (
              <div className="attention-followups">
                {state.followups.slice(0, 3).map((q) => (
                  <Link key={q} className="chip-q" to={agentLink(q)}>
                    {q}
                    <Icon name="arrowRight" />
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <div className="insight-foot">
        <Link className="btn btn-dark btn-sm" to={agentLink(question)}>
          <Icon name="agent" />
          Continue in the Agent
        </Link>
      </div>
    </aside>
  );
}
