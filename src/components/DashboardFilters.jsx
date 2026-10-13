// Apex-styled filter bar that drives the embedded dashboard's own categorical filters.
//  • Options come from Tableau: each filter's *relevant* domain (respects row-level security and the
//    other filters, so Engagement Type narrows to the selected Service Line).
//  • Selecting applies the filter to every worksheet in the dashboard that carries that field.
//  • A Tableau 'filterchanged' listener keeps the dropdowns in sync if filters change inside the viz.
import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

const ALL = '';

/** Worksheets in the dashboard that have a filter on `field`. */
async function sheetsWithFilter(viz, field) {
  const sheet = viz.workbook.activeSheet;
  const worksheets = sheet.sheetType === 'worksheet' ? [sheet] : sheet.worksheets;
  const found = [];
  for (const ws of worksheets) {
    try {
      const filters = await ws.getFiltersAsync();
      const f = filters.find((x) => x.fieldName === field && x.filterType === 'categorical');
      if (f) found.push({ ws, filter: f });
    } catch {
      /* sheet without filter access — skip */
    }
  }
  return found;
}

async function relevantValues(viz, field) {
  const [first] = await sheetsWithFilter(viz, field);
  if (!first) return null; // field isn't filterable on any worksheet
  const domain = await first.filter.getDomainAsync('relevant');
  return domain.values.map((v) => String(v.value ?? v.formattedValue)).sort((a, b) => a.localeCompare(b));
}

export default function DashboardFilters({ viz, filters, onChange, request }) {
  const [state, setState] = useState(() => Object.fromEntries(filters.map((f) => [f.field, { options: [], value: ALL, missing: false }])));
  const [busy, setBusy] = useState(true);
  const applying = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Refresh options for every filter except the one the user just set (so it keeps its full list).
  const refreshOptions = useCallback(
    async (except) => {
      const updates = await Promise.all(
        filters.filter((f) => f.field !== except).map(async (f) => [f.field, await relevantValues(viz, f.field).catch(() => null)])
      );
      for (const [field, values] of updates) console.info(`[filters] ${field} options from Tableau:`, values ?? 'not a filter on any worksheet');
      setState((s) => {
        const next = { ...s };
        for (const [field, values] of updates) {
          next[field] = { ...next[field], options: values || [], missing: values === null };
        }
        return next;
      });
    },
    [viz, filters]
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      setBusy(true);
      await refreshOptions(null);
      if (alive) setBusy(false);
    })();
    return () => {
      alive = false;
    };
  }, [refreshOptions]);

  // Keep the bar in sync with filter changes made inside the dashboard itself.
  // FilterChangedEvent: detail.fieldName + detail.getFilterAsync() (Embedding API v3 reference).
  useEffect(() => {
    const fields = new Set(filters.map((f) => f.field));
    const onFilterChanged = async (e) => {
      if (applying.current || !fields.has(e.detail.fieldName)) return;
      const f = await e.detail.getFilterAsync().catch(() => null);
      if (!f) return;
      const value = f.isAllSelected || !f.appliedValues?.length ? ALL : String(f.appliedValues[0].value ?? f.appliedValues[0].formattedValue);
      setState((s) => ({ ...s, [f.fieldName]: { ...s[f.fieldName], value } }));
    };
    viz.addEventListener('filterchanged', onFilterChanged);
    return () => viz.removeEventListener('filterchanged', onFilterChanged);
  }, [viz, filters]);

  const apply = async (field, value) => {
    setState((s) => ({ ...s, [field]: { ...s[field], value } }));
    setBusy(true);
    applying.current = true;
    try {
      const targets = await sheetsWithFilter(viz, field);
      const results = await Promise.allSettled(
        targets.map(({ ws }) => (value === ALL ? ws.clearFilterAsync(field) : ws.applyFilterAsync(field, [value], 'replace')))
      );
      console.info(
        `[filters] ${field} = ${value || '(All)'} →`,
        Object.fromEntries(targets.map(({ ws }, i) => [ws.name, results[i].status === 'fulfilled' ? 'applied' : results[i].reason?.message]))
      );
      await refreshOptions(field);
      onChangeRef.current?.(field, value);
    } finally {
      applying.current = false;
      setBusy(false);
    }
  };

  // External requests (e.g. "View in dashboard" on an engagement card): { field, value, nonce }.
  // Other filters are cleared first so the combination can't produce an empty dashboard.
  useEffect(() => {
    if (!request || !filters.some((f) => f.field === request.field)) return;
    (async () => {
      for (const f of filters) if (f.field !== request.field && state[f.field].value !== ALL) await apply(f.field, ALL);
      await apply(request.field, request.value);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.nonce]);

  const reset = async () => {
    for (const f of filters) if (state[f.field].value !== ALL) await apply(f.field, ALL);
  };

  const active = filters.some((f) => state[f.field].value !== ALL);

  return (
    <div className="filter-bar" aria-busy={busy}>
      <span className="kicker">
        <Icon name="grid" size={14} />
        Filter dashboard
      </span>
      {filters.map((f) => {
        const s = state[f.field];
        return (
          <label key={f.field} className={`filter-select${s.value !== ALL ? ' is-set' : ''}`}>
            <span>{f.label}</span>
            <select
              value={s.value}
              disabled={s.missing || (busy && !s.options.length)}
              onChange={(e) => apply(f.field, e.target.value)}
              title={s.missing ? `“${f.field}” isn't a filter on this dashboard's worksheets` : undefined}
            >
              <option value={ALL}>{f.allLabel || 'All'}</option>
              {s.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <Icon name="chevronDown" className="caret" />
          </label>
        );
      })}
      <button className="btn btn-ghost btn-sm" onClick={reset} disabled={!active || busy}>
        Reset
      </button>
      {busy && <span className="filter-busy" aria-hidden="true" />}
    </div>
  );
}
