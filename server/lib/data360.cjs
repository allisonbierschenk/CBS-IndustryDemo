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
  // Calculated insight, else the DMO aggregate (same columns).
  async function insightOr(ciSql, dmoSql) {
    try {
      const rows = await query(ciSql);
      if (rows.length) return { rows, from: 'calculated insight' };
    } catch (e) {
      log.warn(`⚠ Data 360 insight: ${e.message.slice(0, 160)}`);
    }
    return { rows: await query(dmoSql), from: 'data model' };
  }

  async function growth() {
    const [arr, engagement, reach, upgrades, weekly] = await Promise.all([
      insightOr(
        'SELECT client_id__c, premium_arr__c, premium_seats__c, upgrades__c FROM Apex_Client_ARR__cio',
        'SELECT Client_Id__c AS client_id__c, SUM(Amount__c) AS premium_arr__c, SUM(Seats__c) AS premium_seats__c, COUNT(Opportunity_Id__c) AS upgrades__c FROM Apex_Premium_Upgrade__dlm WHERE Portal_Upgrade__c = true GROUP BY Client_Id__c'
      ),
      insightOr(
        'SELECT client_id__c, events__c, active_people__c FROM Apex_Client_Engagement__cio',
        'SELECT Client_Id__c AS client_id__c, COUNT(Event_Id__c) AS events__c, APPROX_COUNT_DISTINCT(Portal_User_Id__c) AS active_people__c FROM Apex_Portal_Activity__dlm GROUP BY Client_Id__c'
      ),
      insightOr(
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

  return { enabled: sf.enabled, query, growth, sync, freshness };
}

module.exports = { createData360 };
