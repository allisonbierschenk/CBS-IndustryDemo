// Data Details: data catalog panel for an embedded view. Ported from Tab-SE/embedding_playbook
// (src/components/TableauEmbed/TableauToolbar/DataDetails.jsx), restyled for this portal.
//   1. Browser half — Tableau Embedding API v3: the view's data sources, connections, logical tables and fields.
//   2. Server half — /api/data-details (Metadata API + REST API, as the signed-in user): workbook, project, owner,
//      view count, certification, data quality warnings, lineage, field descriptions, formulas, fields used in the view.
//   3. Merge by data source / field name.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import Icon from './Icon.jsx';

// ── 1. Browser half: Tableau Embedding API v3 ──────────────────────────────

// getDataSourcesAsync() only exists on worksheets, so resolve them first
const getWorksheets = (activeSheet) => {
  if (!activeSheet) return [];
  switch (activeSheet.sheetType) {
    case 'dashboard':
      return activeSheet.worksheets;
    case 'story': {
      const contained = activeSheet.activeStoryPoint?.containedSheet;
      return contained ? getWorksheets(contained) : [];
    }
    default:
      return [activeSheet];
  }
};

export const loadEmbeddingDetails = async (viz) => {
  const workbook = viz?.workbook;
  const activeSheet = workbook?.activeSheet;
  if (!activeSheet) throw new Error('Viz is not interactive yet.');

  const byId = new Map();
  for (const ws of getWorksheets(activeSheet)) {
    for (const ds of await ws.getDataSourcesAsync()) {
      if (!byId.has(ds.id)) byId.set(ds.id, { ds, sheets: [] });
      byId.get(ds.id).sheets.push(ws.name);
    }
  }

  const dataSources = await Promise.all(
    [...byId.values()].map(async ({ ds, sheets }) => {
      const [connections, tables] = await Promise.allSettled([ds.getConnectionSummariesAsync(), ds.getLogicalTablesAsync()]);
      return {
        name: ds.name,
        isExtract: ds.isExtract,
        isPublished: ds.isPublished,
        extractUpdateTime: ds.extractUpdateTime,
        sheets,
        connections: connections.status === 'fulfilled' ? connections.value.map((c) => ({ name: c.name, type: c.type })) : [],
        tables: tables.status === 'fulfilled' ? tables.value.map((t) => t.caption) : [],
        fields: ds.fields
          .filter((f) => !f.isHidden && !f.isGenerated)
          .map((f) => ({
            name: f.name,
            description: f.description || null,
            role: f.role,
            aggregation: f.aggregation,
            isCalculated: f.isCalculatedField,
            isCombined: f.isCombinedField
          }))
      };
    })
  );

  return { workbookName: workbook.name, sheetName: activeSheet.name, dataSources };
};

// ── 2. Server half: /api/data-details (Metadata API + REST API) ────────────

const loadServerDetails = (src) => api(`/api/data-details?src=${encodeURIComponent(src)}`);

// ── 3. Merge: match data sources and fields by name ────────────────────────

const norm = (s) => (s || '').trim().toLowerCase();

const mergeDetails = (emb, srv) => {
  const srvSources = srv?.dataSources ?? [];
  const used = new Set();

  const merged = emb.dataSources.map((e) => {
    const s = srvSources.find((x) => !used.has(x.id) && (norm(x.name) === norm(e.name) || norm(x.published?.name) === norm(e.name)));
    if (s) used.add(s.id);
    const srvFields = new Map((s?.fields ?? []).map((f) => [norm(f.name), f]));
    const fields = e.fields.map((f) => {
      const m = srvFields.get(norm(f.name));
      return { ...f, description: f.description || m?.description || null, formula: m?.formula || null, dataType: m?.dataType || null, usedInView: m?.usedInView ?? false };
    });
    return { ...e, server: s ?? null, fields };
  });

  // server-only sources (e.g. Embedding API returned nothing for them)
  for (const s of srvSources) {
    if (used.has(s.id)) continue;
    merged.push({
      name: s.name,
      isExtract: s.hasExtracts,
      isPublished: s.type === 'PublishedDatasource' || !!s.published,
      extractUpdateTime: s.extractLastRefreshTime,
      sheets: [],
      connections: [],
      tables: [],
      server: s,
      fields: s.fields.map((f) => ({ ...f, aggregation: null, isCombined: false }))
    });
  }

  return merged.map((ds) => ({ ...ds, fields: ds.fields.sort((a, b) => Number(b.usedInView) - Number(a.usedInView) || a.name.localeCompare(b.name)) }));
};

const collectWarnings = (dataSources) =>
  dataSources.flatMap((ds) => [
    ...(ds.server?.published?.warnings ?? []).map((w) => ({ ...w, on: ds.server.published.name })),
    ...(ds.server?.tables ?? []).flatMap((t) => t.warnings.map((w) => ({ ...w, on: t.name }))),
    ...(ds.server?.databases ?? []).flatMap((d) => d.warnings.map((w) => ({ ...w, on: d.name })))
  ]);

// ── 4. UI ──────────────────────────────────────────────────────────────────

/** Toolbar button + side panel. `viz` = the <tableau-viz>, `src` = its view URL (fallback: viz.src). */
export default function DataDetailsButton({ viz, src }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} disabled={!viz} title={viz ? 'Data used by this view' : 'Available once the dashboard has loaded'}>
        <Icon name="database" />
        Data Details
      </button>
      {open && <DataDetails viz={viz} src={src} onClose={() => setOpen(false)} />}
    </>
  );
}

export function DataDetails({ viz, src, onClose }) {
  const [emb, setEmb] = useState(null);
  const [srv, setSrv] = useState(null);
  const [embError, setEmbError] = useState(null);
  const [srvError, setSrvError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  const load = async () => {
    setLoading(true);
    setEmbError(null);
    setSrvError(null);
    const vizSrc = viz?.src || src;
    const [e, s] = await Promise.allSettled([loadEmbeddingDetails(viz), vizSrc ? loadServerDetails(vizSrc) : Promise.reject(new Error('No view URL available'))]);
    if (e.status === 'fulfilled') setEmb(e.value);
    else {
      console.error('DataDetails: Embedding API failed', e.reason);
      setEmbError(e.reason?.message || String(e.reason));
    }
    if (s.status === 'fulfilled') {
      setSrv(s.value);
      if (s.value.errors?.length) console.warn('DataDetails: server steps failed', s.value.errors);
    } else {
      console.error('DataDetails: /api/data-details failed', s.reason);
      setSrvError(s.reason?.message || String(s.reason));
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dataSources = useMemo(() => mergeDetails(emb ?? { dataSources: [] }, srv), [emb, srv]);
  const warnings = useMemo(() => collectWarnings(dataSources), [dataSources]);
  const wb = srv?.workbook;
  const view = srv?.view;

  return (
    <aside className="insight-drawer dd" role="dialog" aria-labelledby="dd-title">
      <div className="insight-head">
        <div>
          <div className="kicker">
            <Icon name="database" size={13} /> Data Details
          </div>
          <h3 id="dd-title">{view?.name || emb?.sheetName || 'Data used by this view'}</h3>
        </div>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="insight-body">
        {/* ---- View / workbook summary ---- */}
        {(wb || view) && (
          <dl className="dd-grid">
            {view?.totalViewCount != null && <Row label="Total views" value={view.totalViewCount.toLocaleString()} />}
            {wb?.name && <Row label="Workbook" value={wb.name} />}
            {wb?.projectName && <Row label="Project" value={wb.projectName} />}
            {wb?.owner && <Row label="Owner" value={wb.owner} />}
            {(view?.updatedAt || wb?.updatedAt) && <Row label="Last modified" value={formatTime(view?.updatedAt || wb.updatedAt)} />}
            {wb?.description && <Row label="Description" value={wb.description} />}
          </dl>
        )}

        {/* ---- Data quality warnings ---- */}
        {warnings.length > 0 && (
          <div className="dd-warnings">
            {warnings.map((w, i) => (
              <Warning key={`${w.id}-${i}`} w={w} />
            ))}
          </div>
        )}

        <div className="dd-search">
          <input className="input" placeholder="Search fields" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search fields" />
          <button className="icon-btn" onClick={load} disabled={loading} title="Reload" aria-label="Reload">
            <span className={loading ? 'dd-spin' : ''}>↻</span>
          </button>
        </div>

        {embError && <p className="dd-err">Embedding API: {embError}</p>}
        {srvError && <p className="dd-err">Server details unavailable: {srvError}</p>}
        {srv?.errors?.length > 0 && <p className="dd-warn-text">Some details could not be loaded ({srv.errors.map((e) => e.step).join(', ')}). See browser console.</p>}
        {loading && !emb && !srv && <p className="muted">Loading…</p>}
        {!loading && (emb || srv) && dataSources.length === 0 && <p className="muted">No data sources found for this view.</p>}

        <div className="dd-sources">
          {dataSources.map((ds, i) => (
            <DataSourceSection key={`${ds.name}-${i}`} ds={ds} query={query} />
          ))}
        </div>
      </div>
    </aside>
  );
}

const Row = ({ label, value }) => (
  <>
    <dt>{label}</dt>
    <dd>{value}</dd>
  </>
);

const Warning = ({ w }) => (
  <div className={`dd-warning${w.isElevated ? ' is-elevated' : ''}`}>
    <span aria-hidden="true">⚠</span>
    <div>
      <b>
        {w.value || w.category || 'Data quality warning'}
        {w.on ? ` · ${w.on}` : ''}
      </b>
      {w.message && <div>{w.message}</div>}
      {w.updatedAt && <div className="muted">Updated {formatTime(w.updatedAt)}</div>}
    </div>
  </div>
);

const DataSourceSection = ({ ds, query }) => {
  const q = query.trim().toLowerCase();
  const fields = useMemo(() => (q ? ds.fields.filter((f) => [f.name, f.description, f.formula].some((v) => v?.toLowerCase().includes(q))) : ds.fields), [ds.fields, q]);

  const pub = ds.server?.published;
  const isExtract = ds.isExtract ?? ds.server?.hasExtracts;
  const refreshed = ds.extractUpdateTime || ds.server?.extractLastRefreshTime || pub?.extractLastRefreshTime;
  const usedCount = ds.fields.filter((f) => f.usedInView).length;

  return (
    <section className="dd-source">
      <h4 className="dd-source-name">
        {ds.name}
        {pub?.isCertified && (
          <span className="dd-cert" title="Certified">
            <Icon name="check" size={12} />
          </span>
        )}
      </h4>
      <div className="dd-badges">
        <span className="pill-meta">{isExtract ? 'Extract' : 'Live'}</span>
        {(ds.isPublished || pub) && <span className="pill-meta">Published</span>}
        {pub?.isCertified && <span className="pill-meta">Certified</span>}
      </div>

      <dl className="dd-grid">
        {pub?.description && <Row label="Description" value={pub.description} />}
        {pub?.isCertified && (pub.certifierDisplayName || pub.certificationNote) && <Row label="Certified by" value={[pub.certifierDisplayName, pub.certificationNote].filter(Boolean).join(' — ')} />}
        {isExtract && refreshed && <Row label="Extract refreshed" value={formatTime(refreshed)} />}
        {ds.connections.length > 0 && <Row label="Connections" value={ds.connections.map((c) => `${c.name}${c.type ? ` (${c.type})` : ''}`).join(', ')} />}
        {ds.sheets.length > 0 && <Row label="Used by" value={ds.sheets.join(', ')} />}
      </dl>

      <Lineage ds={ds} />

      <FieldGroup title="Fields used in this view" fields={fields.filter((f) => f.usedInView)} defaultOpen />
      <FieldGroup title={usedCount ? 'Other fields' : 'Fields'} fields={fields.filter((f) => !f.usedInView)} defaultOpen={!usedCount || !!q} />
      {fields.length === 0 && <p className="muted dd-small">No matching fields.</p>}
    </section>
  );
};

const Lineage = ({ ds }) => {
  const tables = ds.server?.tables ?? [];
  const databases = ds.server?.databases ?? [];
  // fall back to Embedding API logical tables if Catalog lineage isn't available
  if (!tables.length && !databases.length && !ds.tables.length) return null;
  return (
    <div className="dd-block">
      <h5 className="dd-h">Lineage</h5>
      <ul className="dd-lineage">
        {databases.map((d, i) => (
          <li key={`db-${i}`}>
            <Icon name="database" size={13} /> {d.name}
            {d.connectionType && <span className="muted"> ({d.connectionType})</span>}
            {d.warnings.length > 0 && <span className="dd-warn-icon"> ⚠</span>}
          </li>
        ))}
        {tables.map((t, i) => (
          <li key={`t-${i}`} className="dd-indent">
            <Icon name="table" size={13} /> {t.fullName || t.name}
            {t.warnings.length > 0 && <span className="dd-warn-icon"> ⚠</span>}
          </li>
        ))}
        {!tables.length &&
          ds.tables.map((t, i) => (
            <li key={`lt-${i}`} className="dd-indent">
              <Icon name="table" size={13} /> {t}
            </li>
          ))}
      </ul>
    </div>
  );
};

const FieldGroup = ({ title, fields, defaultOpen }) => {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => setOpen(defaultOpen), [defaultOpen]);
  if (fields.length === 0) return null;
  return (
    <div className="dd-block">
      <button className="dd-group-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />
        {title} ({fields.length})
      </button>
      {open && (
        <ul className="dd-fields">
          {fields.map((f) => (
            <FieldRow key={f.name} f={f} />
          ))}
        </ul>
      )}
    </div>
  );
};

const FieldRow = ({ f }) => {
  const [open, setOpen] = useState(false);
  const hasMore = f.description || f.formula || f.dataType;
  const measure = f.role === 'measure' || f.role === 'MEASURE';
  return (
    <li>
      <button className="dd-field" onClick={() => hasMore && setOpen(!open)} aria-expanded={hasMore ? open : undefined}>
        {hasMore ? <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} className="dd-caret" /> : <span className="dd-caret" />}
        <span className={measure ? 'dd-measure' : 'dd-dimension'}>{f.name}</span>
        {f.isCalculated && <span className="dd-tag">Calc</span>}
        {f.isCombined && <span className="dd-tag">Combined</span>}
        {f.aggregation && f.aggregation !== 'none' && f.role === 'measure' && <span className="dd-agg">{f.aggregation}</span>}
      </button>
      {open && (
        <div className="dd-field-more">
          <p>{f.description || <i>No description available</i>}</p>
          {f.dataType && (
            <p>
              <span className="muted">Type:</span> {f.dataType.toLowerCase()}
            </p>
          )}
          {f.formula && <pre>{f.formula}</pre>}
        </div>
      )}
    </li>
  );
};

const formatTime = (value) => {
  const d = new Date(value);
  return isNaN(d) ? String(value) : d.toLocaleString();
};
