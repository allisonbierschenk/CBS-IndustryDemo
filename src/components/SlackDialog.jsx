// Share a mark selection to Slack — demo: the portal composes the message and a signed link back to
// this view, and the server records it, but nothing is posted to a real Slack workspace.
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useSession } from '../context/SessionContext.jsx';
import Icon from './Icon.jsx';

export default function SlackDialog({ selection, what, title, onClose }) {
  const { me } = useSession();
  const channels = me.features?.slackChannels || [];
  const [channel, setChannel] = useState(channels[0] || '');
  const [message, setMessage] = useState(`Take a look at ${what} on ${title}.`);
  const [link, setLink] = useState(null);
  const [state, setState] = useState({ kind: 'editing' });

  useEffect(() => {
    api('/api/links', { method: 'POST', body: { path: window.location.pathname + window.location.search } })
      .then((d) => setLink(d.url))
      .catch(() => setLink(null));
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rows = selection.rows.slice(0, 5);

  const send = async (e) => {
    e.preventDefault();
    setState({ kind: 'sending' });
    try {
      const r = await api('/api/actions/slack', { method: 'POST', body: { channel, message, link, worksheet: selection.worksheet, view: title, rows: selection.rows.slice(0, 25) } });
      setState({ kind: 'sent', channel: r.channel });
    } catch (err) {
      setState({ kind: 'error', message: err.message });
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="slack-title">
        <div className="modal-head">
          <div>
            <div className="kicker">{title}</div>
            <h3 id="slack-title">Share to Slack</h3>
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
                <b>Posted to {state.channel}</b>
                Demo workspace — Slack isn&apos;t connected, so no real message was sent.
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
              <label htmlFor="slack-ch">Channel</label>
              <select id="slack-ch" className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>
                {channels.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="slack-msg">Message</label>
              <textarea id="slack-msg" className="input" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} />
            </div>

            <div className="slack-preview" aria-label="Preview">
              <span className="slack-avatar">{me.user.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}</span>
              <div>
                <div className="slack-meta">
                  <b>{me.user.name}</b> <span>via Apex portal</span>
                </div>
                <p>{message}</p>
                <div className="slack-card">
                  <b>{selection.worksheet}</b>
                  {rows.map((r, i) => (
                    <div key={i}>{Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>
                  ))}
                  {selection.count > rows.length && <div className="muted">+{selection.count - rows.length} more</div>}
                  <span className="slack-link">{link ? 'Open in Apex portal →' : 'Creating link…'}</span>
                </div>
              </div>
            </div>

            {state.kind === 'error' && <div className="error-msg">{state.message}</div>}
            <div className="modal-actions">
              <span className="muted" style={{ marginRight: 'auto', fontSize: 12 }}>
                Demo — Slack isn&apos;t connected
              </span>
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-dark" disabled={state.kind === 'sending' || !channel || !message.trim()}>
                <Icon name="send" />
                {state.kind === 'sending' ? 'Posting…' : 'Post'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
