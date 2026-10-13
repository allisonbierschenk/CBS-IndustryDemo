// Apex-styled "contains" search that drives a categorical filter in the embedded workbook
// (replaces the dashboard's Invoice Number type-in filter card).
//  • Shown only while the active sheet has a categorical filter on `field`.
//  • Candidate values = that filter's *relevant* domain (respects RLS and the drill-down status),
//    falling back to the worksheet's summary data.
//  • Typing applies every value containing the text — the Embedding API has no wildcard filter.
import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

const MAX_SUGGESTIONS = 50;

async function findTarget(viz, field) {
  const sheet = viz.workbook?.activeSheet;
  if (!sheet) return null;
  const worksheets = sheet.sheetType === 'worksheet' ? [sheet] : sheet.worksheets || [];
  const targets = [];
  for (const ws of worksheets) {
    try {
      const f = (await ws.getFiltersAsync()).find((x) => x.fieldName === field && x.filterType === 'categorical');
      if (f) targets.push({ ws, filter: f });
    } catch {
      /* ignore sheets we can't read */
    }
  }
  return targets.length ? { sheetName: sheet.name, targets } : null;
}

async function candidateValues({ targets }, field) {
  try {
    const domain = await targets[0].filter.getDomainAsync('relevant');
    return domain.values.map((v) => String(v.value ?? v.formattedValue));
  } catch {
    const data = await targets[0].ws.getSummaryDataAsync({ ignoreSelection: true });
    const idx = data.columns.findIndex((c) => c.fieldName === field);
    return idx < 0 ? [] : [...new Set(data.data.map((row) => String(row[idx].value ?? row[idx].formattedValue)))];
  }
}

export default function InvoiceSearch({ viz, field, label, placeholder }) {
  const [target, setTarget] = useState(null); // { sheetName, targets }
  const [values, setValues] = useState([]);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null); // { matches } | { none: true }
  const sheetRef = useRef(null);
  const timer = useRef(null);
  const applied = useRef(null); // targets that currently carry a search filter

  const detect = useCallback(async () => {
    // Leaving the details sheet: clear any search so the next drill-in starts fresh.
    if (applied.current) {
      await Promise.allSettled(applied.current.map(({ ws }) => ws.clearFilterAsync(field)));
      applied.current = null;
    }
    const t = await findTarget(viz, field);
    sheetRef.current = viz.workbook?.activeSheet?.name ?? null;
    setTarget(t);
    setQuery('');
    setResult(null);
    if (t) {
      // Safety net: if a previous search survived (clearing a non-active sheet can be refused), reset it now.
      const stale = t.targets.filter(({ filter }) => filter.isAllSelected === false && filter.appliedValues?.length);
      if (stale.length) await Promise.allSettled(stale.map(({ ws }) => ws.clearFilterAsync(field)));
      const v = await candidateValues(t, field).catch(() => []);
      console.info(`[search] "${t.sheetName}": ${v.length} ${field} values available`);
      setValues(v.sort());
    }
  }, [viz, field]);

  useEffect(() => {
    detect();
    const onTab = (e) => {
      console.info(`[search] tabswitched ${e.detail.oldSheetName} → ${e.detail.newSheetName}`);
      detect();
    };
    viz.addEventListener('tabswitched', onTab);
    // Fallback for navigation that doesn't raise tabswitched (e.g. Go-to-Sheet buttons): cheap local check.
    const poll = setInterval(() => {
      const name = viz.workbook?.activeSheet?.name;
      if (name && name !== sheetRef.current) detect();
    }, 1000);
    return () => {
      viz.removeEventListener('tabswitched', onTab);
      clearInterval(poll);
    };
  }, [viz, detect]);

  const run = useCallback(
    async (q) => {
      if (!target) return;
      const text = q.trim().toLowerCase();
      if (!text) {
        await Promise.allSettled(target.targets.map(({ ws }) => ws.clearFilterAsync(field)));
        applied.current = null;
        setResult(null);
        return;
      }
      const matches = values.filter((v) => v.toLowerCase().includes(text));
      if (!matches.length) {
        setResult({ none: true }); // leave the view as-is rather than blanking it
        return;
      }
      const res = await Promise.allSettled(target.targets.map(({ ws }) => ws.applyFilterAsync(field, matches, 'replace')));
      applied.current = target.targets;
      console.info(`[search] ${field} contains "${q}" → ${matches.length} values`, res.map((r) => r.status));
      setResult({ matches: matches.length });
    },
    [target, values, field]
  );

  const onInput = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => run(q), 300);
  };

  if (!target) return null;

  const suggestions = query ? values.filter((v) => v.toLowerCase().includes(query.trim().toLowerCase())).slice(0, MAX_SUGGESTIONS) : [];

  return (
    <div className="filter-bar search-bar">
      <span className="kicker">
        <Icon name="table" size={14} />
        {target.sheetName}
      </span>
      <label className={`search-field${query ? ' is-set' : ''}`}>
        <span className="sr-only">{label}</span>
        <Icon name="search" className="search-ic" />
        <input type="search" list="invoice-suggestions" value={query} onChange={onInput} placeholder={placeholder} autoComplete="off" />
        <datalist id="invoice-suggestions">
          {suggestions.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </label>
      {result?.matches && (
        <span className="pill-meta">
          {result.matches} matching {result.matches === 1 ? 'invoice' : 'invoices'}
        </span>
      )}
      {result?.none && <span className="pill-meta search-none">No invoices match “{query}”</span>}
      {query && (
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setQuery('');
            run('');
          }}
        >
          Clear
        </button>
      )}
    </div>
  );
}
