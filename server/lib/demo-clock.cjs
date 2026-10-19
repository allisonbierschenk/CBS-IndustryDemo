// Demo clock: keeps a long-running demo current. On startup and once a day it moves the seeded story forward to
// today — the launch campaign is always "last week" and in progress, the seeded portal history always ends today,
// and the baseline upgrades keep their place in the year. Live demo records are never touched (Reset demo removes them).
// The shift is worked out from the data itself (newest seeded event vs. now), so there's no state to keep.
const DAY = 86400000;

function createDemoClock(sf, { campaign, baselineOpportunities = [], onShift = () => {}, log = console } = {}) {
  const ymd = (d) => new Date(d).toISOString().slice(0, 10);
  const plusDays = (iso, n) => new Date(Date.parse(iso) + n * DAY);

  async function patchAll(type, records) {
    for (let i = 0; i < records.length; i += 200) {
      await sf.request('PATCH', '/composite/sobjects', { allOrNone: false, records: records.slice(i, i + 200).map((r) => ({ attributes: { type }, ...r })) });
    }
  }

  async function tick() {
    if (!sf.enabled) return;
    try {
      const today = new Date();
      // 1. The launch campaign: sent a week ago, still running.
      if (campaign) {
        const [c] = await sf.query(`SELECT Id, Status, StartDate, EndDate FROM Campaign WHERE Name = '${campaign.replace(/'/g, "\\'")}' LIMIT 1`);
        const start = ymd(today.getTime() - 7 * DAY);
        const end = ymd(today.getTime() + 21 * DAY);
        if (c && (c.Status !== 'In Progress' || c.StartDate !== start || c.EndDate !== end)) {
          await sf.update('Campaign', c.Id, { Status: 'In Progress', IsActive: true, StartDate: start, EndDate: end });
        }
      }
      // 2. How far behind is the seeded story? (whole days; the newest seeded event should be "today")
      const [{ latest } = {}] = await sf.query("SELECT MAX(Event_Time__c) latest FROM Apex_Portal_Activity__c WHERE Event_Id__c LIKE 'seed-%'");
      if (!latest) return;
      const days = Math.floor((today.getTime() - Date.parse(latest)) / DAY);
      if (days < 1) return;
      // 3. Move the seeded portal history and the baseline upgrades forward by that many days.
      const seeded = await sf.query("SELECT Id, Event_Time__c FROM Apex_Portal_Activity__c WHERE Event_Id__c LIKE 'seed-%'");
      await patchAll('Apex_Portal_Activity__c', seeded.map((r) => ({ id: r.Id, Event_Time__c: plusDays(r.Event_Time__c, days).toISOString() })));
      if (baselineOpportunities.length) {
        const opps = await sf.query(`SELECT Id, CloseDate FROM Opportunity WHERE Id IN ('${baselineOpportunities.join("','")}')`);
        await patchAll('Opportunity', opps.map((o) => ({ id: o.Id, CloseDate: ymd(plusDays(`${o.CloseDate}T12:00:00Z`, days)) })));
      }
      log.log(`🕒 Demo clock: moved the seeded story forward ${days} day${days === 1 ? '' : 's'} (${seeded.length} activity events, ${baselineOpportunities.length} baseline upgrades); campaign in progress`);
      onShift(days);
    } catch (e) {
      log.warn(`⚠ Demo clock: ${e.message.slice(0, 200)}`);
    }
  }

  if (sf.enabled) {
    setTimeout(tick, 20000).unref?.(); // after startup settles
    setInterval(tick, DAY).unref();
  }
  return { tick };
}

module.exports = { createDemoClock };
