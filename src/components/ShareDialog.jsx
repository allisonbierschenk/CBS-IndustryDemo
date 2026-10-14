// Share this page (with its current filters) as a signed, expiring link and a QR code.
// Recipients still sign in as themselves, so they only ever see their own data (row-level security).
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api, track } from '../lib/api.js';
import Icon from './Icon.jsx';

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    Object.assign(ta.style, { position: 'fixed', top: '-1000px', opacity: '0' });
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export default function ShareDialog({ title, onClose }) {
  const [state, setState] = useState({ loading: true });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const path = window.location.pathname + window.location.search;
        const { url, expiresAt } = await api('/api/links', { method: 'POST', body: { path } });
        const qr = await QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: '#111614', light: '#ffffff' } });
        const filters = [...new URLSearchParams(window.location.search).entries()];
        if (alive) setState({ url, qr, expiresAt, filters });
      } catch (e) {
        if (alive) setState({ error: e.message });
      }
    })();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      alive = false;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const copy = async () => {
    const ok = await copyText(state.url);
    setCopied(ok);
    track('share', { method: 'copy' });
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div className="modal-head">
          <div>
            <div className="kicker">{title}</div>
            <h3 id="share-title">Share this view</h3>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {state.loading && <p className="muted">Creating a secure link…</p>}
          {state.error && <div className="error-msg">{state.error}</div>}
          {state.url && (
            <div className="share-grid">
              <img className="share-qr" src={state.qr} alt="QR code for the shared link" width="180" height="180" />
              <div>
                <p className="muted" style={{ margin: '0 0 10px', fontSize: 13.5 }}>
                  Anyone with portal access can open this link — they&apos;ll sign in and see it with <b>their own</b> data access.
                </p>
                {state.filters.length > 0 && (
                  <div className="share-filters">
                    {state.filters.map(([k, v]) => (
                      <span key={k} className="fact-pill">
                        {k.replace(/-/g, ' ')} <b>{v}</b>
                      </span>
                    ))}
                  </div>
                )}
                <input className="input" readOnly value={state.url} onFocus={(e) => e.target.select()} />
                <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
                  Expires {new Date(state.expiresAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </div>
            </div>
          )}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={onClose}>
              Done
            </button>
            <button className="btn btn-dark" onClick={copy} disabled={!state.url}>
              <Icon name={copied ? 'check' : 'share'} />
              {copied ? 'Link copied' : 'Copy link'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
