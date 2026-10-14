// Engagement scorecard built from a worksheet's summary data in the embedded dashboard (no extra
// Tableau content). It follows the dashboard's filters, and clicking a row filters the dashboard.
import { useCallback, useEffect, useState } from 'react';
import InfoTip from './InfoTip.jsx';

export default function EngagementScorecard({ viz, worksheet, keyField, maxRows = 25, onSelect }) {
  const [state, setState] = useState({ loading: true });

  const load = useCallback(async () => {
    if (!viz) return;
    try {
      const sheet = viz.workbook.activeSheet;
      const ws = sheet.sheetType === 'dashboard' ? sheet.worksheets.find((w) => w.name === worksheet) : sheet;
      if (!ws) return setState({ error: `Worksheet “${worksheet}” isn’t on this dashboard.` });
      const reader = await ws.getSummaryDataReaderAsync(maxRows, { ignoreSelection: true });
      const page = await reader.getPageAsync(0);
      await reader.releaseAsync();
      const columns = page.columns.map((c) => c.fieldName);
      const keyIndex = columns.findIndex((c) => c === keyField || c.replace(/^[A-Z]+\((.*)\)$/, '$1') === keyField);
      setState({ columns, keyIndex, rows: page.data.map((r) => r.map((c) => ({ text: c.formattedValue, value: c.value }))) });
    } catch (e) {
      setState({ error: e?.message || String(e) });
    }
  }, [viz, worksheet, keyField, maxRows]);

  useEffect(() => {
    load();
    if (!viz) return;
    let t;
    const onFilter = () => {
      clearTimeout(t);
      t = setTimeout(load, 400);
    };
    viz.addEventListener('filterchanged', onFilter);
    return () => {
      clearTimeout(t);
      viz.removeEventListener('filterchanged', onFilter);
    };
  }, [viz, load]);

  if (!viz) return null;
  return (
    <div className="viz-card scorecard">
      <div className="viz-card-head">
        <div>
          <h3>Engagement scorecard</h3>
          <p>From your dashboard’s “{worksheet}” data · select a row to focus the dashboard</p>
        </div>
        <InfoTip kind="scorecard" extra={{ worksheet }} label="About the scorecard" />
      </div>
      {state.error && <div className="error-msg" style={{ margin: 16 }}>{state.error}</div>}
      {state.loading && !state.rows && <p className="muted" style={{ padding: 16 }}>Reading from Tableau…</p>}
      {state.rows && (
        <div className="dp-scroll" style={{ maxHeight: 'none' }}>
          <table>
            <thead>
              <tr>
                {state.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.rows.map((r, i) => {
                const key = state.keyIndex >= 0 ? r[state.keyIndex].text : null;
                return (
                  <tr key={i} className={key ? 'is-clickable' : ''} onClick={() => key && onSelect?.(key)} tabIndex={key ? 0 : -1} onKeyDown={(e) => e.key === 'Enter' && key && onSelect?.(key)}>
                    {r.map((c, j) => (
                      <td key={j}>{c.text}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
