// Data Agent: floating chat bubble on every signed-in page. An OpenAI model queries Tableau through the
// Tableau MCP server. The server forwards the signed-in user's own Tableau session to MCP (passthrough
// auth), so every query runs as them and row-level security applies. Each answer shows its MCP tool calls.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useSession } from '../context/SessionContext.jsx';
import Icon from './Icon.jsx';
import InfoTip from './InfoTip.jsx';
import PulseMarkup from './PulseMarkup.jsx';

function Steps({ steps }) {
  const [open, setOpen] = useState(false);
  if (!steps?.length) return null;
  return (
    <div className="mcp-steps">
      <button className="link-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {steps.length} Tableau MCP tool call{steps.length === 1 ? '' : 's'} {open ? '▴' : '▾'}
      </button>
      {open && (
        <ol className="mcp-step-list">
          {steps.map((s, i) => (
            <li key={i} className={s.ok ? '' : 'is-error'}>
              <code>{s.tool}</code> <span className="muted">{s.ms} ms</span>
              {s.args?.query && <pre>{JSON.stringify(s.args.query, null, 1)}</pre>}
              {s.error && <div className="muted">{s.error}</div>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function DataAgentChat() {
  const { me } = useSession();
  const [open, setOpen] = useState(false);
  const [prep, setPrep] = useState(null); // loaded on first open
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const threadRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open || prep) return;
    setPrep({ loading: true });
    api('/api/mcp/context')
      .then((d) => setPrep({ loading: false, ...d }))
      .catch((e) => setPrep({ loading: false, error: e.message }));
  }, [open, prep]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text) => {
    const question = text.trim();
    if (!question || loading || asked >= limit) return;
    setMessages((m) => [...m, { role: 'user', text: question }]);
    setInput('');
    setLoading(true);
    try {
      const d = await api('/api/mcp/chat', { method: 'POST', body: { question, conversationId } });
      setConversationId(d.conversationId);
      setMessages((m) => [...m, { role: 'assistant', content: d.content, steps: d.steps, ms: d.ms }]);
    } catch (e) {
      // A rejected question at the limit isn't shown as a question asked.
      if (e.status === 429) setMessages((m) => m.slice(0, -1));
      else setMessages((m) => [...m, { role: 'error', text: e.message }]);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setMessages([]);
    setConversationId(null);
  };
  const ready = prep?.configured && !prep.error;
  // Server enforces the cap too (HTTP 429); this keeps the UI in step with it.
  const limit = prep?.maxQuestions || 3;
  const asked = messages.filter((m) => m.role === 'user').length;
  const atLimit = asked >= limit && !loading;

  return (
    <>
      <button className={`mcp-fab${open ? ' is-open' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? 'Close Data Agent' : 'Open Data Agent'} title="Data Agent: ask anything (Tableau MCP)">
        <Icon name={open ? 'close' : 'agent'} size={24} />
      </button>

      {open && (
        <section className="mcp-panel" aria-label="Data Agent">
          <header className="mcp-panel-head">
            <div>
              <div className="title-row mcp-title">
                <b>Data Agent</b>
                <span className="mcp-tag">Tableau MCP</span>
                {ready && <InfoTip kind="mcpAgent" extra={prep} label="About the Data Agent" />}
              </div>
              <div className="muted">
                Ask anything about {me.tenant.shortName}&apos;s data{ready ? ` · ${prep.datasources.map((d) => d.label).join(', ')}` : ''}
              </div>
            </div>
            {messages.length > 0 && (
              <button className="link-btn" onClick={reset}>
                New chat
              </button>
            )}
          </header>

          <div className="mcp-thread" ref={threadRef}>
            {messages.length === 0 && (
              <>
                {prep?.loading && <div className="ai-loading">Connecting to Tableau MCP…</div>}
                {prep?.error && (
                  <div className="error-msg" role="alert">
                    <b>The Data Agent couldn&apos;t start.</b> {prep.error}
                  </div>
                )}
                {prep?.configured === false && (
                  <div className="error-msg" role="alert">
                    <b>Data Agent not configured.</b> Set TABLEAU_MCP_URL and OPENAI_API_KEY in .env and restart the server.
                  </div>
                )}
                {ready && (
                  <div className="mcp-starters">
                    {prep.suggested.map((q) => (
                      <button key={q} className="starter" onClick={() => send(q)}>
                        {q}
                        <Icon name="arrowRight" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="user-msg">
                  {m.text}
                </div>
              ) : m.role === 'error' ? (
                <div key={i} className="error-msg" role="alert">
                  <b>Couldn&apos;t get an answer.</b> {m.text}
                </div>
              ) : (
                <div key={i} className="mcp-answer">
                  <PulseMarkup text={m.content} />
                  <Steps steps={m.steps} />
                </div>
              )
            )}

            {loading && (
              <div className="mcp-answer ai-loading">
                <span className="dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                Querying Tableau…
              </div>
            )}
          </div>

          {atLimit ? (
            <div className="mcp-limit">
              <span>
                You&apos;ve asked {limit} questions in this chat. Start a new chat to keep going.
              </span>
              <button className="btn btn-dark btn-sm" onClick={reset}>
                New chat
              </button>
            </div>
          ) : (
          <form
            className="chat-composer mcp-composer"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input ref={inputRef} className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder={asked ? `Ask a follow-up (${limit - asked} left)…` : 'Ask about your data…'} aria-label="Ask the Data Agent" disabled={!ready} />
            <button className="btn btn-dark" type="submit" disabled={!input.trim() || loading || !ready} aria-label="Send">
              <Icon name="send" />
            </button>
          </form>
          )}
        </section>
      )}
    </>
  );
}
