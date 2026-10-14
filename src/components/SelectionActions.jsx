// Act on a mark selection in an embedded dashboard: ask the Agent about it, share it to Slack (demo),
// schedule time with Apex about it, or download the selected rows. Listens to the viz's
// 'markselectionchanged' event; the bar hides when nothing is selected.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { track } from '../lib/api.js';
import { selectionSummary } from '../lib/tableau.js';
import { useContact } from '../context/ContactContext.jsx';
import Icon from './Icon.jsx';
import SlackDialog from './SlackDialog.jsx';

const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/** One-line description of the selection, e.g. "Process Optimization, Technology Modernization". */
export function describeSelection(sel) {
  if (!sel?.count) return '';
  const subject = sel.dimensions.length ? sel.dimensions.join(', ') : `${sel.count} mark${sel.count > 1 ? 's' : ''}`;
  return sel.measure ? `${sel.measure} for ${subject}` : subject;
}

export default function SelectionActions({ viz, title, ignoreWorksheets = [], extra, onDismissExtra }) {
  const navigate = useNavigate();
  const contact = useContact();
  const [sel, setSel] = useState(null);
  const [slack, setSlack] = useState(false);
  const worksheetRef = useRef(null);
  const ignoreKey = ignoreWorksheets.join('|');

  useEffect(() => {
    if (!viz) return;
    const ignore = new Set(ignoreKey ? ignoreKey.split('|') : []);
    const onSelect = async (e) => {
      if (ignore.has(e.detail.worksheet?.name)) return;
      try {
        const s = await selectionSummary(e);
        worksheetRef.current = e.detail.worksheet;
        setSel(s.count ? s : null);
      } catch (err) {
        console.warn('[selection] could not read marks:', err);
      }
    };
    viz.addEventListener('markselectionchanged', onSelect);
    return () => viz.removeEventListener('markselectionchanged', onSelect);
  }, [viz, ignoreKey]);

  const clear = () => {
    setSel(null);
    worksheetRef.current?.clearSelectedMarksAsync?.().catch(() => {});
  };

  if (!sel && !extra) return null;
  const what = describeSelection(sel);

  const askAgent = () => {
    track('selection-action', { action: 'agent', worksheet: sel.worksheet });
    const q = sel.measure ? `What is driving ${sel.measure} for ${sel.dimensions.join(' and ') || 'the selected items'}?` : `What should I know about ${sel.dimensions.join(' and ')}?`;
    navigate(`/agent?q=${encodeURIComponent(q)}`);
  };

  const schedule = () => {
    track('selection-action', { action: 'schedule', worksheet: sel.worksheet });
    const lines = sel.rows.slice(0, 10).map((r) => `• ${Object.values(r).join(' · ')}`);
    contact('Schedule a review', `I'd like to set up time to review ${what} (from “${sel.worksheet}” on ${title}).\n\n${lines.join('\n')}`);
  };

  const download = () => {
    const csv = [sel.columns.map(csvCell).join(','), ...sel.rows.map((r) => sel.columns.map((c) => csvCell(r[c] ?? '')).join(','))].join('\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `${sel.worksheet || 'selection'}.csv` });
    a.click();
    URL.revokeObjectURL(a.href);
    track('selection-action', { action: 'download', worksheet: sel.worksheet, rows: sel.count });
  };

  return (
    <>
      <div className="sel-bar" role="region" aria-label="Actions for your selection">
        {sel ? (
          <>
            <div className="sel-what">
              <span className="sel-count">{sel.count}</span>
              <span>
                <b>{what}</b>
                <small>{sel.worksheet}</small>
              </span>
            </div>
            <div className="sel-actions">
              <button className="btn btn-lime btn-sm" onClick={askAgent}>
                <Icon name="agent" />
                Ask the Agent
              </button>
              <button className="btn btn-sel btn-sm" onClick={() => setSlack(true)}>
                <Icon name="send" />
                Share to Slack
              </button>
              <button className="btn btn-sel btn-sm" onClick={schedule}>
                <Icon name="calendar" />
                Schedule with Apex
              </button>
              <button className="btn btn-sel btn-sm" onClick={download}>
                <Icon name="download" />
                Download rows
              </button>
              {extra && (
                <Link className="btn btn-sel btn-sm" to={extra.to}>
                  {extra.label}
                  <Icon name="arrowRight" />
                </Link>
              )}
            </div>
            <button className="icon-btn" aria-label="Clear selection" onClick={clear}>
              ✕
            </button>
          </>
        ) : (
          <>
            <span>
              <b>{extra.value}</b> selected
            </span>
            <Link className="btn btn-lime btn-sm" to={extra.to}>
              {extra.label}
              <Icon name="arrowRight" />
            </Link>
            <button className="icon-btn" aria-label="Dismiss" onClick={onDismissExtra}>
              ✕
            </button>
          </>
        )}
      </div>
      {slack && sel && <SlackDialog selection={sel} what={what} title={title} onClose={() => setSlack(false)} />}
    </>
  );
}
