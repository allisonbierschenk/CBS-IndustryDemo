// Data 360 (Data Cloud) for Apex's own business: the client growth view reads harmonized data — Premium upgrades
// (Salesforce Opportunities), portal engagement (Apex Portal Activity) and launch-campaign reach (Campaign Members) —
// through the Data 360 Query API (/ssot/query-sql). Calculated insights first; if they haven't run yet, the same
// numbers aggregated from the data model objects. Definitions: salesforce/data360/.
const STREAMS = ['Apex_Opportunity', 'Apex_Portal_Activity', 'Apex_CampaignMember', 'Apex_Campaign'];
const INSIGHTS = ['Apex_Client_ARR__cio', 'Apex_Client_Engagement__cio', 'Apex_Campaign_Reach__cio'];

function createData360(sf, { log = console } = {}) {
  /** Query API → array of row objects keyed by column name. */
  async function query(sql) {
    const r = await sf.request('POST', '/ssot/query-sql', { sql });
    const cols = (r.metadata || []).map((m) => m.name);
    return (r.data || []).map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
  }
  const at = (v) => (v ? Date.parse(v) : 0);
  const get = (path) => sf.request('GET', path).catch(() => null);
  // Calculated insight when it's at least as fresh as its source stream; otherwise (it recomputes on a schedule) the
  // same numbers aggregated from the data model, which is current as soon as the stream lands. Never goes backwards.
  async function insightOr(ci, stream, ciSql, dmoSql) {
    const [c, st] = await Promise.all([get(`/ssot/calculated-insights/${ci}`), get(`/ssot/data-streams/${stream}`)]);
    // A run in progress (PENDING / PROCESSING) still serves the previous run's rows — only trust a finished run.
    if (c?.lastRunStatus === 'SUCCESS' && at(c.lastRunDateTime) >= at(st?.lastRefreshDate)) {
      try {
        const rows = await query(ciSql);
        if (rows.length) return { rows, from: 'calculated insight' };
      } catch (e) {
        log.warn(`⚠ Data 360 insight: ${e.message.slice(0, 160)}`);
      }
    }
    return { rows: await query(dmoSql), from: 'data model' };
  }

  async function growth() {
    const [arr, engagement, reach, upgrades, weekly] = await Promise.all([
      insightOr(
        'Apex_Client_ARR__cio',
        'Apex_Opportunity',
        'SELECT client_id__c, premium_arr__c, premium_seats__c, upgrades__c FROM Apex_Client_ARR__cio',
        'SELECT Client_Id__c AS client_id__c, SUM(Amount__c) AS premium_arr__c, SUM(Seats__c) AS premium_seats__c, COUNT(Opportunity_Id__c) AS upgrades__c FROM Apex_Premium_Upgrade__dlm WHERE Portal_Upgrade__c = true GROUP BY Client_Id__c'
      ),
      insightOr(
        'Apex_Client_Engagement__cio',
        'Apex_Portal_Activity',
        'SELECT client_id__c, events__c, active_people__c FROM Apex_Client_Engagement__cio',
        'SELECT Client_Id__c AS client_id__c, COUNT(Event_Id__c) AS events__c, APPROX_COUNT_DISTINCT(Portal_User_Id__c) AS active_people__c FROM Apex_Portal_Activity__dlm GROUP BY Client_Id__c'
      ),
      insightOr(
        'Apex_Campaign_Reach__cio',
        'Apex_CampaignMember',
        'SELECT client_id__c, recipients__c FROM Apex_Campaign_Reach__cio',
        'SELECT Client_Id__c AS client_id__c, COUNT(Member_Id__c) AS recipients__c FROM Apex_Campaign_Response__dlm GROUP BY Client_Id__c'
      ),
      query(
        'SELECT Name__c, Client_Id__c, Client_Name__c, Amount__c, Seats__c, Close_Date__c, Campaign_Id__c FROM Apex_Premium_Upgrade__dlm WHERE Portal_Upgrade__c = true ORDER BY Close_Date__c DESC LIMIT 12'
      ),
      query(
        "SELECT Client_Id__c, DATE_TRUNC('week', Event_Time__c) AS week, COUNT(Event_Id__c) AS events FROM Apex_Portal_Activity__dlm GROUP BY Client_Id__c, DATE_TRUNC('week', Event_Time__c) ORDER BY week"
      )
    ]);
    return { arr, engagement, reach, upgrades, weekly };
  }

  /** Refresh the CRM → Data 360 streams now (the presenter's "Sync to Data 360"); insights follow on their schedule. */
  async function sync() {
    const results = await Promise.all(
      STREAMS.map((s) =>
        sf.request('POST', `/ssot/data-streams/${s}/actions/run`, {}).then(
          () => ({ stream: s, ok: true }),
          (e) => ({ stream: s, ok: false, error: e.message.slice(0, 160) })
        )
      )
    );
    return results;
  }

  // Automatic sync: the portal calls requestSync() whenever it writes something Data 360 should see (an upgrade,
  // seats, follow-ups). Debounced, so a burst of writes starts one refresh. Data 360 then processes it on its queue.
  let timer = null;
  let activityDirty = false;
  function requestSync(reason = 'portal change', delayMs = 15000) {
    if (!sf.enabled) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const startedAt = Date.now();
      sync().then((r) => {
        log.log(`↻ Data 360 sync started (${reason}): ${r.filter((x) => x.ok).map((x) => x.stream).join(', ') || 'none'}`);
        watchThenRecompute(startedAt);
      });
      activityDirty = false;
    }, delayMs);
    timer.unref?.();
  }
  // Once the streams have landed, recompute the calculated insights now instead of waiting for their hourly schedule,
  // so Data 360's own screens (Data Explorer) match the portal within minutes.
  let watching = null;
  function watchThenRecompute(startedAt) {
    clearInterval(watching);
    const deadline = startedAt + 45 * 60 * 1000;
    watching = setInterval(async () => {
      if (Date.now() > deadline) return clearInterval(watching);
      const states = await Promise.all(STREAMS.map((n) => sf.request('GET', `/ssot/data-streams/${n}`).catch(() => null)));
      const landed = states.every((d) => d && d.lastRunStatus !== 'PENDING' && d.lastRunStatus !== 'PROCESSING' && Date.parse(d.lastRefreshDate || 0) >= startedAt - 60000);
      if (!landed) return;
      clearInterval(watching);
      const r = await Promise.all(
        INSIGHTS.map((ci) =>
          sf.request('POST', `/ssot/calculated-insights/${ci}/actions/run`, {}).then(
            () => `${ci} ✓`,
            (e) => (/ALREADY_IN_PROCESS/.test(e.message) ? `${ci} (already running)` : `${ci} ✗ ${e.message.replace(/^.*failed \(HTTP/, '(HTTP').slice(0, 140)}`)
          )
        )
      );
      log.log(`↻ Data 360 streams landed — recomputing insights: ${r.join(' · ')}`);
    }, 60000);
    watching.unref?.();
  }

  // Ordinary portal activity: refresh at most every 15 minutes while there's something new.
  const markActivity = () => (activityDirty = true);
  if (sf.enabled) setInterval(() => activityDirty && requestSync('portal activity', 1000), 15 * 60 * 1000).unref();

  /** When the Opportunity stream last landed in Data 360 (to show newer CRM upgrades as "syncing"). */
  async function upgradesRefreshedAt() {
    const d = await sf.request('GET', '/ssot/data-streams/Apex_Opportunity').catch(() => null);
    return d?.lastRefreshDate || null;
  }

  /** When each stream / insight last refreshed. */
  async function freshness() {
    const streams = await Promise.all(
      STREAMS.map((s) =>
        sf.request('GET', `/ssot/data-streams/${s}`).then(
          (d) => ({ name: s, status: d.lastRunStatus, refreshed: d.lastRefreshDate, records: d.totalRecords }),
          () => ({ name: s, status: 'UNKNOWN' })
        )
      )
    );
    const insights = await Promise.all(
      INSIGHTS.map((n) =>
        sf.request('GET', `/ssot/calculated-insights/${n}`).then(
          (d) => ({ name: n, status: d.lastRunStatus || d.calculatedInsightStatus, refreshed: d.lastRunDateTime || null }),
          () => ({ name: n, status: 'UNKNOWN' })
        )
      )
    );
    return { streams, insights };
  }

  return { enabled: sf.enabled, query, growth, sync, requestSync, markActivity, upgradesRefreshedAt, freshness };
}

module.exports = { createData360 };
