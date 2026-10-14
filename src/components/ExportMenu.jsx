// Export menu for an embedded Tableau dashboard (Embedding API v3).
//  Image      → viz.exportImageAsync()
//  Data       → in-portal preview via worksheet.getSummaryDataReaderAsync() + viz.exportDataAsync() (CSV)
//  Crosstab   → viz.exportCrosstabAsync(sheet, 'csv' | 'xlsx')
//  PDF        → viz.exportPDFAsync(sheets?, { pageSize, orientation, scaling })
//  PowerPoint → viz.exportPowerPointAsync(sheets?)
//  Workbook   → viz.displayDialogAsync('export-workbook')
//  Share      → copies a portal link (Tableau's Share dialog produces Tableau links external customers can't open)
// Summary data only: Viewer site roles can't read underlying/logical-table data.
import { useEffect, useRef, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import Icon from './Icon.jsx';

const ITEMS = [
  { key: 'image', label: 'Image', icon: 'image' },
  { key: 'data', label: 'Data', icon: 'database' },
  { key: 'crosstab', label: 'Crosstab', icon: 'table' },
  { key: 'pdf', label: 'PDF', icon: 'pdf' },
  { key: 'ppt', label: 'PowerPoint', icon: 'presenter' },
  { key: 'workbook', label: 'Workbook', icon: 'workbook' },
  { key: 'share', label: 'Share', icon: 'share' }
];

const PAGE_SIZES = [['letter', 'Letter'], ['legal', 'Legal'], ['tabloid', 'Tabloid'], ['A3', 'A3'], ['A4', 'A4'], ['A5', 'A5'], ['executive', 'Executive']];
const SCALINGS = [
  ['automatic', 'Automatic'],
  ['at-most-1-page-wide', 'Fit to width'],
  ['at-most-1-page-high', 'Fit to height'],
  ['100%', '100%'],
  ['75%', '75%'],
  ['50%', '50%']
];

/** Sheets available for export, from the workbook itself (never mixes dashboard worksheets with published sheets). */
function sheetsOf(viz) {
  const active = viz.workbook.activeSheet;
  const worksheets = active.sheetType === 'dashboard' ? active.worksheets.map((w) => w.name) : [active.name];
  return { current: active.name, isDashboard: active.sheetType === 'dashboard', worksheets };
}

const errMsg = (e) => e?.message || String(e);

/** Copy text: async Clipboard API, then the legacy execCommand path. Returns false if both are refused. */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.setAttribute('readonly', '');
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

export default function ExportMenu({ viz, title }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState(null); // 'data' | 'crosstab' | 'pdf' | 'ppt'
  const [busy, setBusy] = useState(null);
  const [shareLink, setShareLink] = useState(null); // shown when the browser refuses clipboard access
  const ref = useRef(null);

  const run = async (key, fn, done) => {
    setBusy(key);
    const t = performance.now();
    try {
      await fn();
      console.info(`[export] ${key} → Tableau started the download (${Math.round(performance.now() - t)} ms)`);
      if (done) toast(done);
    } catch (e) {
      toast(`${ITEMS.find((i) => i.key === key)?.label || 'Export'} failed: ${errMsg(e)}`);
      console.error(`[export] ${key} failed:`, e);
    } finally {
      setBusy(null);
    }
  };

  const choose = (key) => {
    setOpen(false);
    if (!viz) return;
    if (key === 'image') return run('image', () => viz.exportImageAsync(), 'Image download started');
    if (key === 'workbook') return run('workbook', () => viz.displayDialogAsync('export-workbook'));
    if (key === 'share') {
      return copyText(window.location.href).then((ok) =>
        ok ? toast('Portal link copied — anyone with portal access can open it') : setShareLink(window.location.href)
      );
    }
    setDialog(key);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="export" ref={ref}>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)} disabled={!viz} aria-haspopup="menu" aria-expanded={open} title={viz ? 'Export' : 'Available once the dashboard has loaded'}>
        <Icon name={busy ? 'spark' : 'download'} />
        {busy ? 'Exporting…' : 'Export'}
      </button>
      {open && (
        <div className="export-menu" role="menu">
          {ITEMS.map((i) => (
            <button key={i.key} role="menuitem" className="export-item" onClick={() => choose(i.key)}>
              <Icon name={i.icon} />
              <span>{i.label}</span>
            </button>
          ))}
        </div>
      )}
      {dialog && <ExportDialog kind={dialog} viz={viz} title={title} onClose={() => setDialog(null)} run={run} />}
      {shareLink && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShareLink(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
            <div className="modal-head">
              <div>
                <div className="kicker">{title}</div>
                <h3 id="share-title">Share this page</h3>
              </div>
              <button className="icon-btn" aria-label="Close" onClick={() => setShareLink(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p className="muted" style={{ marginTop: 0, fontSize: 13.5 }}>Your browser blocked automatic copying. Copy the link below — anyone with portal access can open it.</p>
              <input className="input" readOnly value={shareLink} onFocus={(e) => e.target.select()} autoFocus />
              <div className="modal-actions">
                <button className="btn btn-dark" onClick={() => setShareLink(null)}>
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExportDialog({ kind, viz, title, onClose, run }) {
  const s = sheetsOf(viz);
  const [sheet, setSheet] = useState(s.worksheets[0] || s.current); // sheet shown in the data preview
  const [chosen, setChosen] = useState([s.worksheets[0] || s.current]); // sheets to download (data / crosstab)
  const [format, setFormat] = useState('xlsx');
  const [scope, setScope] = useState('dashboard'); // dashboard | sheets
  const [picked, setPicked] = useState([]); // ordered worksheet names
  const [pageSize, setPageSize] = useState('letter');
  const [orientation, setOrientation] = useState('landscape');
  const [scaling, setScaling] = useState('automatic');
  const [preview, setPreview] = useState({ loading: false });

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Data preview: summary data for the chosen worksheet (the same data "Download CSV" exports).
  useEffect(() => {
    if (kind !== 'data') return;
    if (!sheet) return setPreview({ loading: false });
    let alive = true;
    (async () => {
      setPreview({ loading: true });
      try {
        const ws = viz.workbook.activeSheet.sheetType === 'dashboard' ? viz.workbook.activeSheet.worksheets.find((w) => w.name === sheet) : viz.workbook.activeSheet;
        const reader = await ws.getSummaryDataReaderAsync(200, { ignoreSelection: true });
        const page = await reader.getPageAsync(0);
        const total = reader.totalRowCount;
        await reader.releaseAsync();
        if (alive) setPreview({ loading: false, columns: page.columns.map((c) => c.fieldName), rows: page.data.slice(0, 200), total });
      } catch (e) {
        if (alive) setPreview({ loading: false, error: errMsg(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [kind, sheet, viz]);

  const togglePick = (name) => setPicked((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]));
  const sheetNames = scope === 'dashboard' ? undefined : picked;
  const needsPick = scope === 'sheets' && picked.length === 0;

  const heading = { data: 'View & download data', crosstab: 'Download crosstab', pdf: 'Download PDF', ppt: 'Download PowerPoint' }[kind];

  const submit = () => {
    const many = (label) => (chosen.length === 1 ? `${label} for “${chosen[0]}” is downloading` : `${chosen.length} ${label.toLowerCase()} files are downloading — allow multiple downloads if your browser asks`);
    const each = (fn) => async () => {
      for (const w of chosen) {
        await fn(w);
        if (chosen.length > 1) await new Promise((r) => setTimeout(r, 600)); // let each download start before the next
      }
    };
    if (kind === 'data') return run('data', each((w) => viz.exportDataAsync(w)), many('Data')).then(onClose);
    if (kind === 'crosstab') return run('crosstab', each((w) => viz.exportCrosstabAsync(w, format)), many('Crosstab')).then(onClose);
    if (kind === 'pdf')
      return run('pdf', () => viz.exportPDFAsync(sheetNames, { pageSize, orientation, scaling }), 'PDF is being generated — it will download shortly').then(onClose);
    if (kind === 'ppt') return run('ppt', () => viz.exportPowerPointAsync(sheetNames), 'PowerPoint is being generated — it will download shortly').then(onClose);
  };

  // Data / crosstab exports are one sheet per Tableau call, so multiple sheets = one file per sheet.
  const allChosen = chosen.length === s.worksheets.length;
  // Selection (what to download) and preview (what to look at) are independent.
  const toggleChosen = (w) => setChosen((c) => (c.includes(w) ? c.filter((x) => x !== w) : s.worksheets.filter((x) => c.includes(x) || x === w)));
  const selectAll = () => setChosen(allChosen ? [] : [...s.worksheets]);

  const SheetSelect = (
    <fieldset className="radio-list">
      <legend>
        Worksheets
        <button type="button" className="link-btn" onClick={selectAll}>
          {allChosen ? 'Clear all' : 'Select all'}
        </button>
      </legend>
      {s.worksheets.map((w) => (
        <div key={w} className={`radio-row${chosen.includes(w) ? ' is-on' : ''}`}>
          <label className="rr-pick">
            <input type="checkbox" value={w} checked={chosen.includes(w)} onChange={() => toggleChosen(w)} />
            <span className="check-box" aria-hidden="true" />
            <span>{w}</span>
          </label>
          {kind === 'data' && (
            <button
              type="button"
              className={`preview-btn${sheet === w ? ' is-active' : ''}`}
              onClick={() => setSheet(w)}
              aria-pressed={sheet === w}
              aria-label={`Preview ${w}`}
            >
              <Icon name="eye" />
              {sheet === w ? 'Previewing' : 'Preview'}
            </button>
          )}
        </div>
      ))}
    </fieldset>
  );

  const ScopePicker = s.isDashboard && (
    <>
      <div className="seg" role="radiogroup" aria-label="What to export">
        <button type="button" role="radio" aria-checked={scope === 'dashboard'} onClick={() => setScope('dashboard')}>
          Whole dashboard
        </button>
        <button type="button" role="radio" aria-checked={scope === 'sheets'} onClick={() => setScope('sheets')}>
          Choose worksheets
        </button>
      </div>
      {scope === 'sheets' && (
        <div className="sheet-picks">
          {s.worksheets.map((w) => {
            const n = picked.indexOf(w);
            return (
              <button type="button" key={w} className={`sheet-pick${n >= 0 ? ' is-on' : ''}`} onClick={() => togglePick(w)}>
                <span className="sp-box">{n >= 0 ? n + 1 : ''}</span>
                {w}
              </button>
            );
          })}
          {kind === 'ppt' && <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>Slides follow the order you select.</p>}
        </div>
      )}
    </>
  );

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${kind === 'data' ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="ex-title">
        <div className="modal-head">
          <div>
            <div className="kicker">{title}</div>
            <h3 id="ex-title">{heading}</h3>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {kind === 'data' && (
            <>
              {SheetSelect}
              <div className="data-preview">
                {!sheet && <div className="muted" style={{ padding: 16 }}>Select a worksheet to preview its data.</div>}
                {sheet && preview.loading && <div className="muted" style={{ padding: 16 }}>Loading data from Tableau…</div>}
                {preview.error && <div className="error-msg">{preview.error}</div>}
                {preview.rows && (
                  <>
                    <div className="dp-meta">
                      {preview.total?.toLocaleString()} rows{preview.total > preview.rows.length ? ` · showing first ${preview.rows.length}` : ''} · summary data, filtered to your organization
                    </div>
                    <div className="dp-scroll">
                      <table>
                        <thead>
                          <tr>
                            {preview.columns.map((c) => (
                              <th key={c}>{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.rows.map((r, i) => (
                            <tr key={i}>
                              {r.map((cell, j) => (
                                <td key={j}>{cell.formattedValue}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {kind === 'crosstab' && (
            <>
              {SheetSelect}
              <div className="seg" role="radiogroup" aria-label="Format">
                <button type="button" role="radio" aria-checked={format === 'xlsx'} onClick={() => setFormat('xlsx')}>
                  Excel (.xlsx)
                </button>
                <button type="button" role="radio" aria-checked={format === 'csv'} onClick={() => setFormat('csv')}>
                  CSV
                </button>
              </div>
            </>
          )}

          {kind === 'pdf' && (
            <>
              {ScopePicker}
              <div className="ex-grid">
                <div className="field">
                  <label htmlFor="ex-size">Page size</label>
                  <select id="ex-size" className="input" value={pageSize} onChange={(e) => setPageSize(e.target.value)}>
                    {PAGE_SIZES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ex-orient">Orientation</label>
                  <select id="ex-orient" className="input" value={orientation} onChange={(e) => setOrientation(e.target.value)}>
                    <option value="landscape">Landscape</option>
                    <option value="portrait">Portrait</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ex-scale">Scaling</label>
                  <select id="ex-scale" className="input" value={scaling} onChange={(e) => setScaling(e.target.value)}>
                    {SCALINGS.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {kind === 'ppt' && ScopePicker}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-dark" onClick={submit} disabled={needsPick || ((kind === 'data' || kind === 'crosstab') && chosen.length === 0)}>
              <Icon name="download" />
              {kind === 'data'
                ? chosen.length > 1 ? `Download ${chosen.length} CSVs` : 'Download CSV'
                : kind === 'crosstab'
                  ? `Download ${chosen.length > 1 ? `${chosen.length} ` : ''}${format === 'xlsx' ? 'Excel' : 'CSV'}${chosen.length > 1 ? ' files' : ''}`
                  : `Download ${kind === 'pdf' ? 'PDF' : 'PowerPoint'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
