// "Contact your Apex team" — one dialog the whole portal can open, optionally pre-set to a topic.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import { useSession } from './SessionContext.jsx';

const ContactContext = createContext(() => {});
const TOPICS = ['General question', 'Engagement update', 'Data or dashboard question', 'Schedule a review', 'Premium subscription', 'Billing'];

export function ContactProvider({ children }) {
  const [open, setOpen] = useState(null); // { topic, message }
  const openContact = useCallback((topic = 'General question', message = '') => setOpen({ topic, message }), []);
  return (
    <ContactContext.Provider value={openContact}>
      {children}
      {open && <ContactDialog initial={open} onClose={() => setOpen(null)} />}
    </ContactContext.Provider>
  );
}

export const useContact = () => useContext(ContactContext);

function ContactDialog({ initial, onClose }) {
  const { me } = useSession();
  const [topic, setTopic] = useState(initial.topic);
  const [message, setMessage] = useState(initial.message);
  const [state, setState] = useState({ kind: 'editing' }); // editing | sending | sent | error
  const textRef = useRef(null);

  useEffect(() => {
    textRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = async (e) => {
    e.preventDefault();
    setState({ kind: 'sending' });
    try {
      const res = await api('/api/messages', { method: 'POST', body: { topic, message } });
      setState({ kind: 'sent', ref: res.ref });
    } catch (err) {
      setState({ kind: 'error', message: err.message });
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="contact-title">
        <div className="modal-head">
          <div>
            <div className="kicker">{me.tenant.clientName}</div>
            <h3 id="contact-title">Contact your Apex team</h3>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        {state.kind === 'sent' ? (
          <div className="modal-body">
            <div className="notice info" style={{ marginTop: 0 }}>
              <Icon name="check" />
              <div>
                <b>Message received · Reference {state.ref}</b>
                Your Apex engagement team will reply to {me.user.email}. Quote the reference if you follow up.
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-dark" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form className="modal-body" onSubmit={send}>
            <div className="field">
              <label htmlFor="c-topic">Topic</label>
              <select id="c-topic" className="input" value={topic} onChange={(e) => setTopic(e.target.value)}>
                {TOPICS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="c-msg">Message</label>
              <textarea
                id="c-msg"
                ref={textRef}
                className="input"
                rows={5}
                maxLength={2000}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="How can we help?"
              />
            </div>
            <p className="muted" style={{ fontSize: 12.5, margin: '0 0 4px' }}>
              Sent from {me.user.name} · {me.user.email}
            </p>
            {state.kind === 'error' && (
              <p className="form-error" role="alert">
                {state.message}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-dark" disabled={state.kind === 'sending' || !message.trim()}>
                {state.kind === 'sending' ? 'Sending…' : 'Send message'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
