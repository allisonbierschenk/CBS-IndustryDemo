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

const slug = (field) => field.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** What's on screen right now: the dashboard's current single-value filters for the configured fields → { slug: value }.
 *  One dashboard.getFiltersAsync() call (Embedding API v3); per-worksheet only if the viz isn't a dashboard. */
async function readFilters(viz, defs) {
  const sheet = viz.workbook.activeSheet;
  const list =
    sheet.sheetType === 'dashboard' && sheet.getFiltersAsync
      ? await sheet.getFiltersAsync()
      : (await Promise.all((sheet.sheetType === 'worksheet' ? [sheet] : sheet.worksheets).map((ws) => ws.getFiltersAsync().catch(() => [])))).flat();
  const want = new Set(defs.map((f) => f.field));
  const out = Object.fromEntries(defs.map((f) => [slug(f.field), '']));
  const seen = new Set();
  for (const f of list) {
    if (!want.has(f.fieldName) || f.filterType !== 'categorical' || seen.has(f.fieldName)) continue;
    seen.add(f.fieldName);
    out[slug(f.fieldName)] = !f.isAllSelected && f.appliedValues?.length === 1 ? String(f.appliedValues[0].value ?? f.appliedValues[0].formattedValue) : '';
  }
  console.info('[share] filters on screen:', out);
  return out;
}

export default function ShareDialog({ title, savedView, viz, filters: filterDefs, onClose }) {
  const [state, setState] = useState({ loading: true });
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Read the filters actually on screen (a saved view sets them inside Tableau and never touches the page URL).
        const params = new URLSearchParams(window.location.search);
        if (viz && filterDefs?.length) {
          for (const [k, v] of Object.entries(await readFilters(viz, filterDefs))) v ? params.set(k, v) : params.delete(k);
        }
        const path = window.location.pathname + (params.toString() ? `?${params}` : '');
        const { url, expiresAt } = await api('/api/links', { method: 'POST', body: { path } });
        const qr = await QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: '#111614', light: '#ffffff' } });
        const filters = [...params.entries()];
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
            <h3 id="share-title">{savedView ? `Share “${savedView}”` : 'Share this view'}</h3>
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
                {savedView && (
                  <p className="muted" style={{ fontSize: 12.5, margin: '0 0 8px' }}>
                    The link opens this dashboard with the saved view&apos;s filters{state.filters.length ? '' : ' (it has none set)'}.
                  </p>
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
