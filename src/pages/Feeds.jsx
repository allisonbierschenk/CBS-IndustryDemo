// Data feeds — a personal, refreshable CSV link (scoped to the user's data by Tableau) for Excel or Google Sheets.
import { useEffect, useState } from 'react';
import { api, track } from '../lib/api.js';
import Crumbs from '../components/Crumbs.jsx';
import Icon from '../components/Icon.jsx';
import InfoTip from '../components/InfoTip.jsx';

export default function Feeds() {
  const [state, setState] = useState({ loading: true });
  const [copied, setCopied] = useState(null);
  const [sheets, setSheets] = useState(null); // { key, formula, copied }

  useEffect(() => {
    api('/api/feeds')
      .then((d) => setState(d))
      .catch((e) => setState({ error: e.message }));
  }, []);

  const copy = async (f) => {
    try {
      await navigator.clipboard.writeText(f.url);
      setCopied(f.key);
      track('export', { kind: 'feed-link', feed: f.key });
    } catch {
      setCopied(null);
    }
  };

  // One click: copy the IMPORTDATA formula and open a new blank Google Sheet — the user just pastes in A1.
  // (Google has no link that pre-fills a formula, so a single paste is as automated as Sheets allows.)
  const openInSheets = async (f) => {
    const formula = `=IMPORTDATA("${f.url}")`;
    let ok = false;
    try {
      await navigator.clipboard.writeText(formula);
      ok = true;
    } catch {
      ok = false;
    }
    window.open('https://sheets.new', '_blank', 'noopener');
    setSheets({ key: f.key, formula, copied: ok });
    track('export', { kind: 'feed-sheets', feed: f.key });
  };

  return (
    <div className="container">
      <Crumbs items={[{ label: 'Home', to: '/' }, { label: 'Data feeds' }]} />
      <div className="page-head">
        <div>
          <div className="title-row">
            <h1>Data feeds</h1>
            <InfoTip kind="feeds" label="About data feeds" />
          </div>
          <p className="lead">Connect Excel or Google Sheets to a live CSV of your data. It refreshes from Tableau every time it’s opened.</p>
        </div>
      </div>
      {state.loading && <p className="muted">Loading…</p>}
      {state.error && <div className="error-msg">{state.error}</div>}
      {state.feeds?.map((f) => (
        <div className="viz-card feed-card" key={f.key}>
          <div className="viz-card-head">
            <div>
              <h3>{f.title}</h3>
              <p>{f.fields.join(' · ')}</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <a className="btn btn-ghost btn-sm" href={f.url} target="_blank" rel="noreferrer">
                <Icon name="download" />
                Download CSV
              </a>
              <button className="btn btn-dark btn-sm sheets-btn" onClick={() => openInSheets(f)}>
                <Icon name="table" />
                Open in Google Sheets
              </button>
            </div>
          </div>
          <div className="feed-body">
            {sheets?.key === f.key && (
              <div className="notice info sheets-note" role="status">
                <Icon name={sheets.copied ? 'check' : 'info'} />
                <div>
                  <b>{sheets.copied ? 'A new Google Sheet is opening — press ⌘V (Ctrl+V) in cell A1.' : 'A new Google Sheet is opening — paste this into cell A1:'}</b>
                  {sheets.copied ? 'The live formula is on your clipboard. Sheets refreshes it automatically from now on.' : <code className="sheets-formula">{sheets.formula}</code>}
                </div>
              </div>
            )}
            <label className="vm-label" htmlFor={`feed-${f.key}`}>
              Your personal link
            </label>
            <div className="feed-url">
              <input id={`feed-${f.key}`} className="input" readOnly value={f.url} onFocus={(e) => e.target.select()} />
              <button className="btn btn-dark btn-sm" onClick={() => copy(f)}>
                <Icon name={copied === f.key ? 'check' : 'share'} />
                {copied === f.key ? 'Copied' : 'Copy link'}
              </button>
            </div>
            <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
              Treat this link like a password — it opens your data without signing in. Expires {new Date(f.expiresAt).toLocaleDateString([], { dateStyle: 'medium' })}; come back here for a new one.
            </p>
            <div className="feed-how">
              <div>
                <b>Excel</b>
                <ol>
                  <li>Data → Get Data → From Web</li>
                  <li>Paste the link, then Load</li>
                  <li>Data → Refresh All to update</li>
                </ol>
              </div>
              <div>
                <b>Google Sheets</b>
                <ol>
                  <li>Click Open in Google Sheets</li>
                  <li>Press ⌘V (Ctrl+V) in cell A1</li>
                  <li>Sheets keeps it up to date automatically</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
