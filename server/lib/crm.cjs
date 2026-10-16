// Apex's CRM (Salesforce) as the system of record for its clients' subscription tier.
// Tiers are cached (refreshed every minute) so request handling stays synchronous; the portal's local
// tenant tier is only the fallback when Salesforce isn't configured or reachable.
const REFRESH_MS = 60 * 1000;

function createCrm(sf, { log = console } = {}) {
  const accounts = new Map(); // tenantId → { id, name, tier: 'premium' | 'standard', ownerId }
  const contacts = new Map(); // portal user id → Contact Id (Apex_Portal_User_Id__c)
  let lastError = null;

  async function refresh() {
    if (!sf.enabled) return;
    try {
      const rows = await sf.query('SELECT Id, Name, OwnerId, Apex_Client_Id__c, Apex_Subscription_Tier__c FROM Account WHERE Apex_Client_Id__c != null');
      accounts.clear();
      for (const r of rows) accounts.set(r.Apex_Client_Id__c, { id: r.Id, name: r.Name, ownerId: r.OwnerId, tier: String(r.Apex_Subscription_Tier__c || 'Standard').toLowerCase() });
      const people = await sf.query('SELECT Id, Apex_Portal_User_Id__c FROM Contact WHERE Apex_Portal_User_Id__c != null');
      contacts.clear();
      for (const c of people) contacts.set(c.Apex_Portal_User_Id__c, c.Id);
      if (lastError) log.log('✔ Salesforce reachable again');
      lastError = null;
    } catch (e) {
      if (!lastError) log.warn(`⚠ Salesforce: ${e.message}`);
      lastError = e.message;
    }
  }
  if (sf.enabled) {
    refresh();
    setInterval(refresh, REFRESH_MS).unref();
  }

  const tierFor = (tenantId) => accounts.get(tenantId)?.tier || null;
  const accountFor = (tenantId) => accounts.get(tenantId) || null;
  const status = () => ({ enabled: sf.enabled, mode: sf.mode, accounts: accounts.size, error: lastError });

  function requireAccount(tenant) {
    const a = accountFor(tenant.id);
    if (!a) throw new Error(`No Salesforce Account with Apex Client Id "${tenant.id}".`);
    return a;
  }

  /** Self-service upgrade → Closed Won Opportunity on the client's Account, and the Account's tier → Premium. */
  async function recordUpgrade(user, tenant, { price }) {
    const a = requireAccount(tenant);
    const monthly = Number(String(price || '').replace(/[^0-9.]/g, '')) || 0;
    const today = new Date().toISOString().slice(0, 10);
    const opp = await sf.create('Opportunity', {
      Name: `${tenant.clientName} — Premium (Industry Benchmarks)`,
      AccountId: a.id,
      StageName: 'Closed Won',
      CloseDate: today,
      Amount: monthly * 12,
      Type: 'Existing Customer - Upgrade',
      LeadSource: 'Web',
      Apex_Portal_Upgrade__c: true,
      Description: `Self-service upgrade in the Apex client portal by ${user.name} (${user.email}), ${price}.`
    }).catch(async (e) => {
      // Picklist values differ between orgs — retry without the optional ones.
      if (!/INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST|bad value for restricted picklist/i.test(e.message)) throw e;
      return sf.create('Opportunity', {
        Name: `${tenant.clientName} — Premium (Industry Benchmarks)`,
        AccountId: a.id,
        StageName: 'Closed Won',
        CloseDate: today,
        Amount: monthly * 12,
        Apex_Portal_Upgrade__c: true,
        Description: `Self-service upgrade in the Apex client portal by ${user.name} (${user.email}), ${price}.`
      });
    });
    // The person who upgraded is the Opportunity's primary contact (decision maker).
    const contactId = contacts.get(user.id);
    if (contactId) await sf.create('OpportunityContactRole', { OpportunityId: opp.id, ContactId: contactId, Role: 'Decision Maker', IsPrimary: true }).catch((e) => log.warn(`⚠ Salesforce contact role: ${e.message}`));
    await sf.update('Account', a.id, { Apex_Subscription_Tier__c: 'Premium' });
    a.tier = 'premium';
    await notifyOwner(a, {
      title: `💰 ${tenant.clientName} upgraded to Premium — +${usd(monthly * 12)}/yr`,
      body: `${user.name} upgraded in the Apex client portal (${price}). Closed Won.`,
      targetId: opp.id
    });
    return { opportunityId: opp.id, url: sf.recordUrl(opp.id) };
  }

  const usd = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  let notifTypeId = null;
  /** Bell notification (Salesforce custom notification "Apex Portal Upgrade") to the Account owner — the rep. */
  async function notifyOwner(a, { title, body, targetId }) {
    try {
      if (!notifTypeId) notifTypeId = (await sf.query("SELECT Id FROM CustomNotificationType WHERE DeveloperName = 'Apex_Portal_Upgrade'"))[0]?.Id;
      if (!notifTypeId) throw new Error('custom notification type Apex_Portal_Upgrade not found');
      // Running total, so the rep sees what the portal has brought in.
      const [sum] = await sf.query('SELECT SUM(Amount) total, COUNT(Id) n FROM Opportunity WHERE Apex_Portal_Upgrade__c = true AND IsWon = true AND CloseDate = THIS_YEAR');
      const total = sum ? ` Portal upgrades this year: ${usd(sum.total)} from ${sum.n} upgrade${sum.n === 1 ? '' : 's'}.` : '';
      const [r] = await sf.request('POST', '/actions/standard/customNotificationAction', {
        inputs: [{ customNotifTypeId: notifTypeId, recipientIds: [a.ownerId], title: title.slice(0, 250), body: `${body}${total}`.slice(0, 750), targetId }]
      });
      // The action answers HTTP 200 either way — the outcome is in the body.
      if (!r?.isSuccess) throw new Error(JSON.stringify(r?.errors || r));
      log.log(`🔔 Salesforce notification to the ${a.name} owner: ${title}`);
    } catch (e) {
      log.warn(`⚠ Salesforce notification: ${e.message}`);
    }
  }

  /** Demo reset: put the Account back on Standard so the next demo can upgrade again. The Closed Won Opportunity
   *  stays — it's the record of the upgrade (and the history Data 360 / Tableau report on). */
  async function revertUpgrade(tenant) {
    const a = requireAccount(tenant);
    await sf.update('Account', a.id, { Apex_Subscription_Tier__c: 'Standard' });
    a.tier = 'standard';
  }

  /** A follow-up for the client's Apex account team, on the client's Account. */
  async function createTask(tenant, { user, subject, description, dueInDays = 2 }) {
    const a = requireAccount(tenant);
    const due = new Date(Date.now() + dueInDays * 86400000).toISOString().slice(0, 10);
    const who = user && contacts.get(user.id);
    const t = await sf.create('Task', { WhatId: a.id, ...(who ? { WhoId: who } : {}), OwnerId: a.ownerId, Subject: subject.slice(0, 255), Description: description, ActivityDate: due, Priority: 'High', Status: 'Not Started' });
    return { taskId: t.id, url: sf.recordUrl(t.id) };
  }

  /** Presenter view: the client's Account and the records the portal wrote to it, live from Salesforce. */
  async function recordsFor(tenant) {
    const a = requireAccount(tenant);
    const id = a.id.replace(/'/g, '');
    const [acct, opps, tasks, people] = await Promise.all([
      sf.query(`SELECT Id, Name, Apex_Subscription_Tier__c, Owner.Name FROM Account WHERE Id = '${id}'`),
      sf.query(`SELECT Id, Name, Amount, StageName, CloseDate FROM Opportunity WHERE AccountId = '${id}' AND Apex_Portal_Upgrade__c = true ORDER BY CreatedDate DESC LIMIT 5`),
      sf.query(`SELECT Id, Subject, Status, ActivityDate, Owner.Name FROM Task WHERE WhatId = '${id}' ORDER BY CreatedDate DESC LIMIT 5`),
      sf.query(`SELECT Id, Name, Title, Email FROM Contact WHERE AccountId = '${id}' AND Apex_Portal_User_Id__c != null ORDER BY Name`)
    ]);
    const r = acct[0] || {};
    a.tier = String(r.Apex_Subscription_Tier__c || 'Standard').toLowerCase();
    return {
      account: { id: r.Id, name: r.Name, tier: r.Apex_Subscription_Tier__c, owner: r.Owner?.Name, url: sf.recordUrl(r.Id) },
      opportunities: opps.map((o) => ({ id: o.Id, name: o.Name, amount: o.Amount, stage: o.StageName, closeDate: o.CloseDate, url: sf.recordUrl(o.Id) })),
      tasks: tasks.map((t) => ({ id: t.Id, subject: t.Subject, status: t.Status, due: t.ActivityDate, owner: t.Owner?.Name, url: sf.recordUrl(t.Id) })),
      contacts: people.map((c) => ({ id: c.Id, name: c.Name, title: c.Title, email: c.Email, url: sf.recordUrl(c.Id) }))
    };
  }

  return { enabled: sf.enabled, refresh, tierFor, accountFor, status, recordUpgrade, revertUpgrade, createTask, recordsFor };
}

module.exports = { createCrm };
