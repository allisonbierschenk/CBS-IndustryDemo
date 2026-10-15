// Act on a selection: Explain with Pulse, ask the Agent, share to Slack (demo), schedule with Apex (the client's
// account manager), or download the selected rows. On embedded dashboards it listens to the viz's
// 'markselectionchanged' event; custom pages (e.g. Industry Benchmarks) pass their own `selection` instead.
// The bar hides when nothing is selected.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { track } from '../lib/api.js';
import { selectionSummary } from '../lib/tableau.js';
import { useContact } from '../context/ContactContext.jsx';
import Icon from './Icon.jsx';
import SelectionInsight from './SelectionInsight.jsx';
import SlackDialog from './SlackDialog.jsx';

const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/** One-line description of the selection, e.g. "Process Optimization, Technology Modernization". */
export function describeSelection(sel) {
  if (!sel?.count) return '';
  const subject = sel.dimensions.length ? sel.dimensions.join(', ') : `${sel.count} mark${sel.count > 1 ? 's' : ''}`;
  return sel.measure ? `${sel.measure} for ${subject}` : subject;
}

// pulseSource: a Pulse data source label (e.g. "Transportation"). When set, questions about the selection
// use only that source's metrics, and "Explain with Pulse" answers right beside the dashboard.
// selection / onClear: a page-controlled selection { worksheet, count, columns, rows, dimensions, measure, question? }.
// actions: extra page-specific buttons [{ label, icon, onClick }].
export default function SelectionActions({ viz, title, ignoreWorksheets = [], extra, onDismissExtra, pulseSource, selection, onClear, actions = [] }) {
  const navigate = useNavigate();
  const contact = useContact();
  const [marks, setMarks] = useState(null);
  const controlled = selection !== undefined;
  const sel = controlled ? selection : marks;
  const [slack, setSlack] = useState(false);
  const [insight, setInsight] = useState(null); // { question, what, worksheet }
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
        setMarks(s.count ? s : null);
      } catch (err) {
        console.warn('[selection] could not read marks:', err);
      }
    };
    viz.addEventListener('markselectionchanged', onSelect);
    return () => viz.removeEventListener('markselectionchanged', onSelect);
  }, [viz, ignoreKey]);

  // Stable so the drawer's request effect doesn't re-run on every render.
  const closeInsight = useCallback(() => setInsight(null), []);

  const clear = () => {
    if (controlled) return onClear?.();
    setMarks(null);
    worksheetRef.current?.clearSelectedMarksAsync?.().catch(() => {});
  };

  const drawer = insight && <SelectionInsight {...insight} source={pulseSource} onClose={closeInsight} />;
  if (drawer || (!sel && !extra)) return drawer || null; // the drawer replaces the bar while open
  const what = describeSelection(sel);
  const question = () => {
    if (sel.question) return sel.question;
    const subject = sel.dimensions.join(' and ') || 'the selected items';
    return sel.measure ? `What is driving ${sel.measure} for ${subject}?` : `What should I know about ${subject}?`;
  };

  const askAgent = () => {
    track('selection-action', { action: 'agent', worksheet: sel.worksheet, source: pulseSource || 'all' });
    navigate(`/agent?q=${encodeURIComponent(question())}${pulseSource ? `&source=${encodeURIComponent(pulseSource)}` : ''}`);
  };

  const explain = () => {
    track('selection-action', { action: 'explain', worksheet: sel.worksheet, source: pulseSource });
    setInsight({ question: question(), what, worksheet: sel.worksheet });
  };

  const schedule = () => {
    track('selection-action', { action: 'schedule', worksheet: sel.worksheet });
    const lines = sel.rows.slice(0, 10).map((r) => `• ${Object.values(r).join(' · ')}`);
    contact('Schedule a review', `I'd like to set up time to review ${what} (from “${sel.worksheet}”${title && title !== sel.worksheet ? ` on ${title}` : ''}).\n\n${lines.join('\n')}`);
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
              {pulseSource && (
                <button className="btn btn-lime btn-sm" onClick={explain}>
                  <Icon name="spark" />
                  Explain with Pulse
                </button>
              )}
              <button className={`btn ${pulseSource ? 'btn-sel' : 'btn-lime'} btn-sm`} onClick={askAgent}>
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
              {actions.map((a) => (
                <button key={a.label} className="btn btn-sel btn-sm" onClick={a.onClick}>
                  {a.icon && <Icon name={a.icon} />}
                  {a.label}
                </button>
              ))}
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
      {drawer}
      {slack && sel && <SlackDialog selection={sel} what={what} title={title} onClose={() => setSlack(false)} />}
    </>
  );
}
