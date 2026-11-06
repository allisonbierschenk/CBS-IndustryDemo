// Apex-styled filter bar that drives the embedded dashboard's own categorical filters.
//  • Options come from Tableau: each filter's *relevant* domain (respects row-level security and the
//    other filters, so Engagement Type narrows to the selected Service Line).
//  • Selecting applies the filter with dashboard.applyFilterAsync — one call for every worksheet that has it.
//  • A Tableau 'filterchanged' listener keeps the dropdowns in sync if filters change inside the viz.
import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

const ALL = '';

// Dashboard-level Embedding API (one call each, instead of one per worksheet):
//   dashboard.getFiltersAsync()                       → every filter on the dashboard
//   dashboard.applyFilterAsync(field, values, type)   → applies to every worksheet that has that filter
// Falls back to per-worksheet calls only if the viz isn't a dashboard (or Tableau rejects the dashboard call).
const isDashboard = (viz) => viz.workbook.activeSheet?.sheetType === 'dashboard';
const worksheetsOf = (viz) => {
  const sheet = viz.workbook.activeSheet;
  return sheet.sheetType === 'worksheet' ? [sheet] : sheet.worksheets;
};

/** All categorical filters on the dashboard, by field (first one wins). One Tableau call on a dashboard. */
async function filtersByField(viz) {
  let list;
  if (isDashboard(viz) && viz.workbook.activeSheet.getFiltersAsync) {
    list = await viz.workbook.activeSheet.getFiltersAsync();
  } else {
    list = (await Promise.all(worksheetsOf(viz).map((ws) => ws.getFiltersAsync().catch(() => [])))).flat();
  }
  const byField = new Map();
  for (const f of list) if (f.filterType === 'categorical' && !byField.has(f.fieldName)) byField.set(f.fieldName, f);
  return byField;
}

const currentValue = (fl) => (!fl || fl.isAllSelected || !fl.appliedValues?.length ? ALL : String(fl.appliedValues[0].value ?? fl.appliedValues[0].formattedValue));

/** Set (or clear, value = ALL) one field across the whole dashboard. */
async function applyToDashboard(viz, field, value) {
  const dash = viz.workbook.activeSheet;
  if (isDashboard(viz) && dash.applyFilterAsync) {
    try {
      // 'all' selects every value = cleared; 'replace' sets exactly this value.
      return await (value === ALL ? dash.applyFilterAsync(field, [], 'all') : dash.applyFilterAsync(field, [value], 'replace'));
    } catch (e) {
      console.warn(`[filters] dashboard.applyFilterAsync(${field}) failed, applying per worksheet:`, e?.message || e);
    }
  }
  const byField = await filtersByField(viz);
  if (!byField.has(field)) return;
  await Promise.allSettled(
    worksheetsOf(viz).map((ws) => (value === ALL ? ws.clearFilterAsync(field) : ws.applyFilterAsync(field, [value], 'replace')))
  );
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
      const byField = await filtersByField(viz).catch(() => new Map());
      const updates = await Promise.all(
        filters
          .filter((f) => f.field !== except)
          .map(async (f) => {
            const fl = byField.get(f.field);
            if (!fl) return [f.field, null]; // field isn't a filter on this dashboard
            const domain = await fl.getDomainAsync('relevant').catch(() => null);
            return [f.field, domain ? domain.values.map((v) => String(v.value ?? v.formattedValue)).sort((a, b) => a.localeCompare(b)) : []];
          })
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
      // The dashboard may be preloaded and already filtered (e.g. returning to the page): read current values.
      const byField = await filtersByField(viz).catch(() => new Map());
      const current = filters.map((f) => [f.field, currentValue(byField.get(f.field))]);
      if (alive) setState((s) => ({ ...s, ...Object.fromEntries(current.map(([k, v]) => [k, { ...s[k], value: v }])) }));
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
      const t0 = performance.now();
      await applyToDashboard(viz, field, value);
      console.info(`[filters] ${field} = ${value || '(All)'} applied in ${Math.round(performance.now() - t0)} ms`);
      await refreshOptions(field);
      onChangeRef.current?.(field, value);
    } finally {
      applying.current = false;
      setBusy(false);
    }
  };

  // External requests (e.g. "View in dashboard" on an engagement card): { field, value, nonce }.
  // Other filters are cleared first so the combination can't produce an empty dashboard.
  // request = { field, value, nonce } or { values: { [field]: value }, nonce } (e.g. from a shared link).
  useEffect(() => {
    if (!request) return;
    const values = request.values || { [request.field]: request.value };
    const wanted = filters.filter((f) => f.field in values);
    if (!wanted.length) return;
    (async () => {
      console.info('[filters] applying from link/request:', values);
      for (const f of filters) if (!(f.field in values) && state[f.field].value !== ALL) await apply(f.field, ALL);
      for (const f of wanted) await apply(f.field, values[f.field] ?? ALL);
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
