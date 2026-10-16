// Apex's CRM (Salesforce) as the system of record for its clients' subscription tier.
// Tiers are cached (refreshed every minute) so request handling stays synchronous; the portal's local
// tenant tier is only the fallback when Salesforce isn't configured or reachable.
const REFRESH_MS = 60 * 1000;

function createCrm(sf, { log = console, campaign = null } = {}) {
  const accounts = new Map(); // tenantId → { id, name, tier: 'premium' | 'standard', ownerId }
  const contacts = new Map(); // portal user id → Contact Id (Apex_Portal_User_Id__c)
  const seats = new Set(); // portal user ids with a Premium seat (Contact.Apex_Premium_Seat__c)
  let campaignId = null; // the launch campaign upgrades are attributed to (Opportunity.CampaignId)
  let lastError = null;

  async function refresh() {
    if (!sf.enabled) return;
    try {
      const rows = await sf.query('SELECT Id, Name, OwnerId, Apex_Client_Id__c, Apex_Subscription_Tier__c FROM Account WHERE Apex_Client_Id__c != null');
      accounts.clear();
      for (const r of rows) accounts.set(r.Apex_Client_Id__c, { id: r.Id, name: r.Name, ownerId: r.OwnerId, tier: String(r.Apex_Subscription_Tier__c || 'Standard').toLowerCase() });
      const people = await sf.query('SELECT Id, Apex_Portal_User_Id__c, Apex_Premium_Seat__c FROM Contact WHERE Apex_Portal_User_Id__c != null');
      contacts.clear();
      seats.clear();
      for (const c of people) {
        contacts.set(c.Apex_Portal_User_Id__c, c.Id);
        if (c.Apex_Premium_Seat__c) seats.add(c.Apex_Portal_User_Id__c);
      }
      if (campaign && !campaignId) campaignId = (await sf.query(`SELECT Id FROM Campaign WHERE Name = '${campaign.replace(/'/g, "\\'")}' LIMIT 1`))[0]?.Id || null;
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
  const hasSeat = (userId) => seats.has(userId);
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
      ...(campaignId ? { CampaignId: campaignId } : {}),
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

  /** The client's people (Contacts) and who has a Premium seat — live from Salesforce. */
  async function rosterFor(tenant) {
    const a = requireAccount(tenant);
    const rows = await sf.query(
      `SELECT Id, Name, Title, Email, Apex_Portal_User_Id__c, Apex_People_Manager__c, Apex_Premium_Seat__c FROM Contact WHERE AccountId = '${a.id.replace(/'/g, '')}' AND Apex_Portal_User_Id__c != null ORDER BY Apex_People_Manager__c DESC, Name`
    );
    return rows.map((c) => ({ contactId: c.Id, userId: c.Apex_Portal_User_Id__c, name: c.Name, title: c.Title, email: c.Email, manager: Boolean(c.Apex_People_Manager__c), seat: Boolean(c.Apex_Premium_Seat__c) }));
  }

  /** Seat-based upgrade: Premium seats for the chosen people → Contacts flagged, one Closed Won Opportunity for the
   *  new seats (Quantity × price × 12), the buyer as primary contact, attributed to the launch campaign; bell to the rep. */
  async function buySeats(user, tenant, contactIds, { price }) {
    const a = requireAccount(tenant);
    const roster = await rosterFor(tenant);
    const chosen = roster.filter((p) => contactIds.includes(p.contactId) && !p.seat);
    if (!chosen.length) throw Object.assign(new Error('Everyone you picked already has a seat.'), { status: 400 });
    const monthly = Number(String(price || '').replace(/[^0-9.]/g, '')) || 0;
    const amount = chosen.length * monthly * 12;
    const opp = await sf.create('Opportunity', {
      Name: `${tenant.clientName} — Premium seats (${chosen.length})`,
      AccountId: a.id,
      StageName: 'Closed Won',
      CloseDate: new Date().toISOString().slice(0, 10),
      Amount: amount,
      Apex_Premium_Seats__c: chosen.length,
      Apex_Portal_Upgrade__c: true,
      ...(campaignId ? { CampaignId: campaignId } : {}),
      Description: `${user.name} (${user.email}) bought ${chosen.length} Premium seat${chosen.length === 1 ? '' : 's'} in the Apex client portal at ${price} per user: ${chosen.map((p) => p.name).join(', ')}.`
    });
    const contactId = contacts.get(user.id);
    if (contactId) await sf.create('OpportunityContactRole', { OpportunityId: opp.id, ContactId: contactId, Role: 'Decision Maker', IsPrimary: true }).catch((e) => log.warn(`⚠ Salesforce contact role: ${e.message}`));
    for (let i = 0; i < chosen.length; i += 200) {
      await sf.request('PATCH', '/composite/sobjects', { allOrNone: true, records: chosen.slice(i, i + 200).map((p) => ({ attributes: { type: 'Contact' }, id: p.contactId, Apex_Premium_Seat__c: true })) });
    }
    for (const p of chosen) seats.add(p.userId);
    await notifyOwner(a, {
      title: `💰 ${tenant.clientName} bought ${chosen.length} Premium seat${chosen.length === 1 ? '' : 's'} — +${usd(amount)}/yr`,
      body: `${user.name} upgraded ${chosen.length} ${chosen.every((p) => p.manager) ? 'managers' : 'people'} in the Apex client portal (${price} per user). Closed Won.`,
      targetId: opp.id
    });
    return { opportunityId: opp.id, url: sf.recordUrl(opp.id), seats: chosen.length, amount };
  }

  /** Demo reset: take every Premium seat back (Opportunities stay as history). */
  async function resetSeats(tenant) {
    const roster = await rosterFor(tenant);
    const seated = roster.filter((p) => p.seat);
    for (let i = 0; i < seated.length; i += 200) {
      await sf.request('PATCH', '/composite/sobjects', { allOrNone: true, records: seated.slice(i, i + 200).map((p) => ({ attributes: { type: 'Contact' }, id: p.contactId, Apex_Premium_Seat__c: false })) });
    }
    for (const p of seated) seats.delete(p.userId);
    return seated.length;
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

  return { enabled: sf.enabled, refresh, tierFor, hasSeat, accountFor, status, recordUpgrade, revertUpgrade, createTask, recordsFor, rosterFor, buySeats, resetSeats };
}

module.exports = { createCrm };
