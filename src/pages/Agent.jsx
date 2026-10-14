// Agent — natural-language questions answered by the Tableau Pulse Insight Brief API.
// Every word of each answer comes from Pulse; the portal only renders it. Metrics in scope are the
// signed-in customer's Pulse metrics (row-level security applies), discovered by the server.
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../context/SessionContext.jsx';
import Crumbs from '../components/Crumbs.jsx';
import Icon from '../components/Icon.jsx';
import PulseMarkup, { direction } from '../components/PulseMarkup.jsx';
import TrendChart from '../components/TrendChart.jsx';

const plain = (s) => String(s || '').replace(/<[^>]+>/g, '');

/** KPI chip from an insight's markup: metric name, value, and change. */
function chipFrom(markup) {
  const metric = /<span data-type="metric">(.*?)<\/span>/.exec(markup)?.[1];
  const keyword = /<span data-type="insight-type-keyword">(.*?)<\/span>/.exec(markup)?.[1];
  const spanNumbers = [...markup.matchAll(/<span data-type="number">(.*?)<\/span>/g)].map((m) => m[1]);
  const textNumbers = plain(markup).match(/-?\$?\d[\d,]*(?:\.\d+)?\s?[%KMBx]?/g) || [];
  const value = spanNumbers[0] || textNumbers.find((n) => /[%$KMBx.]/.test(n));
  if (!metric || !value) return null;
  return { metric: plain(metric), value: value.trim(), change: keyword ? plain(keyword) : spanNumbers[1] || null, dir: direction(keyword || plain(markup)) };
}

const formatFor = (markup) => (/\d%/.test(plain(markup)) ? 'percent' : /\$\d/.test(plain(markup)) ? 'currency' : 'number');

function Answer({ msg }) {
  const chips = msg.insightCards.map((c) => chipFrom(c.markup || '')).filter(Boolean);
  const seen = new Set();
  const uniqueChips = chips.filter((c) => (seen.has(c.metric) ? false : seen.add(c.metric)));
  const chartCard = msg.insightCards.find((c) => c.series?.points?.length >= 2);

  return (
    <article className="ai-card">
      <header className="ai-head">
        <span className="ai-badge">
          <Icon name="bolt" size={13} />
          Tableau Pulse
        </span>
      </header>
      {uniqueChips.length > 0 && (
        <div className="kpi-chips">
          {uniqueChips.slice(0, 4).map((c) => (
            <div key={c.metric} className={`kpi-chip is-${c.dir}`}>
              <span className="kc-metric">{c.metric}</span>
              <span className="kc-value">{c.value}</span>
              {c.change && (
                <span className="kc-change">
                  {c.dir === 'down' ? '↓' : c.dir === 'up' ? '↑' : '→'} {c.change}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {chartCard && (
        <TrendChart points={chartCard.series.points} format={formatFor(msg.content + chartCard.markup)} tone={direction(msg.content.split('\n')[0])} />
      )}
      {msg.content ? <PulseMarkup text={msg.content} /> : <p className="muted">No insight available.</p>}
    </article>
  );
}

export default function Agent() {
  const { me } = useSession();
  const [prep, setPrep] = useState({ loading: true });
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [followups, setFollowups] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const threadRef = useRef(null);
  const lastRef = useRef(null);
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    api('/api/agent/context')
      .then((d) => setPrep({ loading: false, ...d }))
      .catch((e) => setPrep({ loading: false, error: e.message }));
  }, []);

  // Scroll the thread only (not the page): new answers show from their top; otherwise follow the end.
  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    const last = messages[messages.length - 1];
    const top = !loading && last?.role === 'assistant' && lastRef.current ? lastRef.current.offsetTop - thread.offsetTop - 12 : thread.scrollHeight;
    thread.scrollTo({ top, behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text) => {
    const question = text.trim();
    if (!question || loading) return;
    setMessages((m) => [...m, { role: 'user', text: question }]);
    setFollowups([]);
    setInput('');
    setLoading(true);
    try {
      const d = await api('/api/agent/chat', { method: 'POST', body: { question, conversationId } });
      setConversationId(d.conversationId);
      setMessages((m) => [...m, { role: 'assistant', content: d.content, insightCards: d.insightCards || [] }]);
      setFollowups((d.followups || []).slice(0, 3));
    } catch (e) {
      setMessages((m) => [...m, { role: 'error', text: e.message }]);
    } finally {
      setLoading(false);
    }
  };

  // A question handed over from elsewhere in the portal (e.g. "Needs attention" on Home): /agent?q=…
  const handedOff = useRef(false);
  useEffect(() => {
    const q = params.get('q');
    if (!q || handedOff.current) return;
    handedOff.current = true;
    setParams({}, { replace: true });
    send(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = () => {
    setMessages([]);
    setConversationId(null);
    setFollowups([]);
  };

  return (
    <div className="container">
      <Crumbs items={[{ label: 'Home', to: '/' }, { label: 'Agent' }]} />
      <div className="page-head">
        <div>
          <h1>Agent</h1>
          <p className="lead">Ask about {me.tenant.shortName}&apos;s engagements and results. Answers come from your Tableau Pulse metrics.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {messages.length > 0 && (
            <button className="btn btn-ghost" onClick={reset}>
              New conversation
            </button>
          )}
          <Link className="btn btn-ghost" to="/dashboards">
            <Icon name="dashboard" />
            Open dashboards
          </Link>
        </div>
      </div>

      <div className="chat">
        <div className="chat-thread" ref={threadRef}>
          {messages.length === 0 && (
            <div className="chat-starters">
              {prep.loading && (
                <div className="ai-loading">
                  <span className="dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  Loading your Pulse metrics…
                </div>
              )}
              {prep.error && (
                <div className="placeholder error">
                  <b>The agent couldn&apos;t load your metrics</b>
                  <div>{prep.error}</div>
                </div>
              )}
              {prep.metrics && (
                <>
                  <div className="kicker">Metrics in scope</div>
                  <div className="metric-pills">
                    {prep.metrics.map((m) => (
                      <span key={m.metricId} className="metric-pill" title={m.source}>
                        {m.name}
                      </span>
                    ))}
                  </div>
                  <div className="kicker" style={{ marginTop: 22 }}>
                    Suggested questions
                  </div>
                  <div className="starter-list">
                    {prep.suggested.map((q) => (
                      <button key={q} className="starter" onClick={() => send(q)}>
                        {q}
                        <Icon name="arrowRight" />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {messages.map((m, i) => {
            const ref = i === messages.length - 1 ? lastRef : undefined;
            return m.role === 'user' ? (
              <div key={i} ref={ref} className="user-msg">
                {m.text}
              </div>
            ) : m.role === 'error' ? (
              <div key={i} ref={ref} className="error-msg" role="alert">
                <b>Couldn&apos;t get an answer.</b> {m.text}
              </div>
            ) : (
              <div key={i} ref={ref} style={{ scrollMarginTop: 12 }}>
                <Answer msg={m} />
              </div>
            );
          })}

          {loading && (
            <div className="ai-card ai-loading">
              <span className="dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              Analyzing your data with Tableau Pulse…
            </div>
          )}
        </div>

        <div className="chat-input-area">
          {followups.length > 0 && (
            <div className="followups">
              {followups.map((q) => (
                <button key={q} className="follow-chip" onClick={() => send(q)}>
                  {q}
                </button>
              ))}
            </div>
          )}
          <form
            className="chat-composer"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              className="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your engagements…"
              aria-label="Ask the agent"
              disabled={!prep.metrics}
            />
            <button className="btn btn-dark" type="submit" disabled={!input.trim() || loading || !prep.metrics} aria-label="Send">
              <Icon name="send" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
