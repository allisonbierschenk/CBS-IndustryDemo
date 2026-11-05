// Server half of "Data Details" (the data catalog panel on each embedded view).
// Ported from Tab-SE/embedding_playbook src/app/api/data-details/route.ts:
//   REST API      → view LUID, total view count
//   Metadata API  → workbook / project / owner / last modified, data sources, certification,
//                   data quality warnings, lineage (tables / databases), fields + formulas + descriptions,
//                   fields used in the view
// Runs as the signed-in user (their own Tableau REST session), so it only returns content they can see.
// Each Metadata query runs on its own, so one unsupported field (or a site without Data Management)
// doesn't blank the whole panel. Failures are returned in `errors`.

const WARNING_FIELDS = 'id isActive isElevated value category message createdAt updatedAt';

// "https://host/t/site/views/Workbook/View?:embed=y" → { origin, site, workbook, view }
function parseViewUrl(src) {
  const url = new URL(src);
  const parts = url.pathname.split('/').filter(Boolean);
  let site = '';
  if (parts[0] === 't') {
    site = parts[1];
    parts.splice(0, 2);
  }
  if (parts[0] !== 'views' || parts.length < 3) return null;
  return { origin: url.origin, site, workbook: parts[1], view: parts[2] };
}

const list = (ids) => JSON.stringify([...new Set(ids)]);

function createDataDetails({ server, apiVersion = '3.27', restSession }) {
  async function gql(token, query) {
    const res = await fetch(`${server}/api/metadata/graphql`, {
      method: 'POST',
      headers: { 'X-Tableau-Auth': token, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables: null })
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    const json = JSON.parse(text);
    if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
    return json.data;
  }

  // Runs a step and records the failure instead of throwing.
  async function step(name, errors, fn) {
    try {
      return await fn();
    } catch (e) {
      const message = e?.message || String(e);
      console.error(`[data-details] ${name} failed:`, message);
      errors.push({ step: name, message });
      return null;
    }
  }

  /** Data Details for one embedded view URL, as `user`. */
  async function forView(user, src) {
    const parsed = (() => {
      try {
        return parseViewUrl(src);
      } catch {
        return null;
      }
    })();
    if (!parsed) throw Object.assign(new Error(`Unrecognized view URL: ${src}`), { status: 400 });

    const s = await restSession(user);
    const token = s.token;
    const errors = [];

    // 1. REST: resolve view LUID + usage
    const contentUrl = `${parsed.workbook}/sheets/${parsed.view}`;
    const restView = await step('rest:view', errors, async () => {
      const headers = { 'X-Tableau-Auth': token, Accept: 'application/json' };
      const base = `${server}/api/${apiVersion}/sites/${s.siteId}/views?includeUsageStatistics=true`;
      let res = await fetch(`${base}&pageSize=100&filter=viewUrlName:eq:${encodeURIComponent(parsed.view)}`, { headers });
      if (!res.ok) res = await fetch(`${base}&pageSize=1000`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const views = (await res.json()).views?.view ?? [];
      const v = views.find((x) => x.contentUrl === contentUrl);
      if (!v) throw new Error(`View ${contentUrl} not found for this user`);
      return v;
    });
    if (!restView) return { view: null, workbook: null, dataSources: [], errors };
    const luid = JSON.stringify(restView.id);

    // 2. Metadata: view, workbook, sheets and the data sources they use
    const core = await step('metadata:core', errors, () =>
      gql(
        token,
        `query {
          dashboards(filter: { luid: ${luid} }) {
            id name updatedAt
            workbook { id name description projectName createdAt updatedAt owner { name username } }
            sheets { id name upstreamDatasources { __typename id name } }
          }
          sheets(filter: { luid: ${luid} }) {
            id name updatedAt
            workbook { id name description projectName createdAt updatedAt owner { name username } }
            upstreamDatasources { __typename id name }
          }
        }`
      )
    );

    const dash = core?.dashboards?.[0];
    const sheet = core?.sheets?.[0];
    const viewNode = dash ?? sheet ?? null;
    const sheetNodes = dash ? dash.sheets ?? [] : sheet ? [sheet] : [];
    const sheetIds = sheetNodes.map((x) => x.id);

    const dsRefs = new Map();
    for (const sh of sheetNodes) for (const ds of sh.upstreamDatasources ?? []) dsRefs.set(ds.id, { id: ds.id, name: ds.name, type: ds.__typename });
    const embeddedIds = [...dsRefs.values()].filter((d) => d.type === 'EmbeddedDatasource').map((d) => d.id);
    const directPublishedIds = [...dsRefs.values()].filter((d) => d.type === 'PublishedDatasource').map((d) => d.id);

    // 3. Embedded data sources: extract info + which published source they point at
    const embedded = embeddedIds.length
      ? await step('metadata:embedded', errors, () =>
          gql(
            token,
            `query {
              embeddedDatasources(filter: { idWithin: ${list(embeddedIds)} }) {
                id name hasExtracts extractLastRefreshTime
                upstreamDatasources { id name }
              }
            }`
          )
        )
      : null;

    const publishedIds = [...directPublishedIds, ...(embedded?.embeddedDatasources ?? []).flatMap((e) => (e.upstreamDatasources ?? []).map((p) => p.id))];
    const allDsIds = [...embeddedIds, ...publishedIds];

    // 4–7 in parallel
    const [published, lineage, fields, usedFields] = await Promise.all([
      publishedIds.length
        ? step('metadata:published', errors, () =>
            gql(
              token,
              `query {
                publishedDatasources(filter: { idWithin: ${list(publishedIds)} }) {
                  id name description hasExtracts extractLastRefreshTime
                  isCertified
                  dataQualityCertifications { isActive message authorDisplayName updatedAt }
                  hasActiveWarning
                  dataQualityWarnings { ${WARNING_FIELDS} }
                }
              }`
            )
          )
        : null,
      allDsIds.length
        ? step('metadata:lineage', errors, () =>
            gql(
              token,
              `query {
                embeddedDatasources(filter: { idWithin: ${list(embeddedIds)} }) {
                  id
                  upstreamTables { id name fullName schema database { id name connectionType } }
                  upstreamDatabases { id name connectionType }
                }
                publishedDatasources(filter: { idWithin: ${list(publishedIds)} }) {
                  id
                  upstreamTables { id name fullName schema database { id name connectionType } }
                  upstreamDatabases { id name connectionType }
                }
              }`
            )
          )
        : null,
      allDsIds.length
        ? step('metadata:fields', errors, () =>
            gql(
              token,
              `query {
                embeddedDatasources(filter: { idWithin: ${list(embeddedIds)} }) { id fields { ...F } }
                publishedDatasources(filter: { idWithin: ${list(publishedIds)} }) { id fields { ...F } }
              }
              fragment F on Field {
                __typename id name description isHidden
                ... on ColumnField { dataType role }
                ... on CalculatedField { dataType role formula }
              }`
            )
          )
        : null,
      sheetIds.length
        ? step('metadata:fieldsInView', errors, () =>
            gql(token, `query { sheets(filter: { idWithin: ${list(sheetIds)} }) { id datasourceFields { id name } } }`)
          )
        : null
    ]);

    // 8. Data quality warnings on upstream tables / databases (needs lineage ids)
    const lineageSources = [...(lineage?.embeddedDatasources ?? []), ...(lineage?.publishedDatasources ?? [])];
    const allTables = lineageSources.flatMap((d) => d.upstreamTables ?? []);
    const allDbs = lineageSources.flatMap((d) => d.upstreamDatabases ?? []);
    const upstreamWarnings =
      allTables.length || allDbs.length
        ? await step('metadata:upstreamWarnings', errors, () =>
            gql(
              token,
              `query {
                databaseTables(filter: { idWithin: ${list(allTables.map((t) => t.id))} }) { id dataQualityWarnings { ${WARNING_FIELDS} } }
                databases(filter: { idWithin: ${list(allDbs.map((d) => d.id))} }) { id dataQualityWarnings { ${WARNING_FIELDS} } }
              }`
            )
          )
        : null;

    // ---- assemble ----
    const byId = (arr) => new Map((arr ?? []).map((x) => [x.id, x]));
    const embeddedMap = byId(embedded?.embeddedDatasources);
    const publishedMap = byId(published?.publishedDatasources);
    const lineageMap = byId(lineageSources);
    const fieldsMap = byId([...(fields?.embeddedDatasources ?? []), ...(fields?.publishedDatasources ?? [])]);
    const warnMap = byId([...(upstreamWarnings?.databaseTables ?? []), ...(upstreamWarnings?.databases ?? [])]);
    const activeWarnings = (w) => (w ?? []).filter((x) => x.isActive);
    const usedFieldNames = new Set((usedFields?.sheets ?? []).flatMap((sh) => (sh.datasourceFields ?? []).map((f) => f.name)));

    const shapeFields = (dsId) =>
      (fieldsMap.get(dsId)?.fields ?? [])
        .filter((f) => !f.isHidden)
        .map((f) => ({
          name: f.name,
          description: f.description || null,
          formula: f.formula || null,
          dataType: f.dataType || null,
          role: f.role || null,
          isCalculated: f.__typename === 'CalculatedField',
          usedInView: usedFieldNames.has(f.name)
        }));

    const shapeLineage = (dsId) => {
      const l = lineageMap.get(dsId);
      return {
        tables: (l?.upstreamTables ?? []).map((t) => ({
          name: t.name,
          fullName: t.fullName,
          schema: t.schema,
          database: t.database?.name ?? null,
          connectionType: t.database?.connectionType ?? null,
          warnings: activeWarnings(warnMap.get(t.id)?.dataQualityWarnings)
        })),
        databases: (l?.upstreamDatabases ?? []).map((d) => ({
          name: d.name,
          connectionType: d.connectionType,
          warnings: activeWarnings(warnMap.get(d.id)?.dataQualityWarnings)
        }))
      };
    };

    const shapePublished = (id) => {
      const p = publishedMap.get(id);
      if (!p) return null;
      const cert = (p.dataQualityCertifications ?? []).find((c) => c.isActive);
      return {
        name: p.name,
        description: p.description || null,
        isCertified: !!p.isCertified,
        certificationNote: cert?.message || null,
        certifierDisplayName: cert?.authorDisplayName || null,
        hasExtracts: p.hasExtracts,
        extractLastRefreshTime: p.extractLastRefreshTime,
        warnings: activeWarnings(p.dataQualityWarnings)
      };
    };

    const dataSources = [...dsRefs.values()].map((ref) => {
      const e = embeddedMap.get(ref.id);
      const upstreamPublishedId = ref.type === 'PublishedDatasource' ? ref.id : e?.upstreamDatasources?.[0]?.id;
      // fields / lineage live on the published source when the workbook connects to one
      const sourceId = upstreamPublishedId && fieldsMap.has(upstreamPublishedId) ? upstreamPublishedId : ref.id;
      const lineageId = upstreamPublishedId && lineageMap.has(upstreamPublishedId) ? upstreamPublishedId : ref.id;
      const embeddedFields = shapeFields(ref.id);
      const publishedFields = upstreamPublishedId ? shapeFields(upstreamPublishedId) : [];
      return {
        id: ref.id,
        name: ref.name,
        type: ref.type,
        hasExtracts: e?.hasExtracts ?? null,
        extractLastRefreshTime: e?.extractLastRefreshTime ?? null,
        published: upstreamPublishedId ? shapePublished(upstreamPublishedId) : null,
        ...shapeLineage(lineageId),
        fields: mergeFields(embeddedFields, publishedFields, sourceId === ref.id)
      };
    });

    return {
      view: {
        name: viewNode?.name ?? restView.name,
        type: dash ? 'dashboard' : 'sheet',
        totalViewCount: restView.usage?.totalViewCount != null ? Number(restView.usage.totalViewCount) : null,
        updatedAt: viewNode?.updatedAt ?? restView.updatedAt ?? null
      },
      workbook: viewNode?.workbook
        ? {
            name: viewNode.workbook.name,
            description: viewNode.workbook.description || null,
            projectName: viewNode.workbook.projectName,
            owner: viewNode.workbook.owner?.name ?? viewNode.workbook.owner?.username ?? null,
            createdAt: viewNode.workbook.createdAt,
            updatedAt: viewNode.workbook.updatedAt
          }
        : null,
      dataSources,
      errors
    };
  }

  return { forView };
}

// Embedded fields win for names (that's what the viz shows); published fields fill in
// descriptions / formulas the embedded copy doesn't carry.
function mergeFields(embedded, published, preferEmbedded) {
  const out = new Map();
  const primary = preferEmbedded || !published.length ? embedded : published;
  const secondary = primary === embedded ? published : embedded;
  for (const f of primary) out.set(f.name, { ...f });
  for (const f of secondary) {
    const existing = out.get(f.name);
    if (!existing) {
      out.set(f.name, { ...f });
      continue;
    }
    existing.description ??= f.description;
    existing.formula ??= f.formula;
    existing.dataType ??= f.dataType;
    existing.role ??= f.role;
    existing.isCalculated ||= f.isCalculated;
    existing.usedInView ||= f.usedInView;
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { createDataDetails, parseViewUrl };
