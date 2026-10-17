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
    await markResponded(user);
    await notifyOwner(a, {
      title: `💰 ${tenant.clientName} upgraded to Premium — +${usd(monthly * 12)}/yr`,
      body: `${user.name} upgraded in the Apex client portal (${price}). Closed Won.`,
      targetId: opp.id
    });
    return { opportunityId: opp.id, url: sf.recordUrl(opp.id) };
  }

  /** The buyer answered the launch campaign: their Campaign Member → Responded (Salesforce campaign funnel / ROI). */
  async function markResponded(user) {
    const contactId = contacts.get(user.id);
    if (!campaignId || !contactId) return;
    try {
      const [m] = await sf.query(`SELECT Id FROM CampaignMember WHERE CampaignId = '${campaignId}' AND ContactId = '${contactId}' LIMIT 1`);
      if (m) await sf.update('CampaignMember', m.Id, { Status: 'Responded' });
    } catch (e) {
      log.warn(`⚠ Salesforce campaign response: ${e.message.slice(0, 160)}`);
    }
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
    await markResponded(user);
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

  // ── Portal activity → Salesforce (Apex_Portal_Activity__c) → Data 360 (CRM data stream) ──
  // Client actions only; background work (attention pre-warm, embed token mints) is noise for engagement analytics.
  const SKIP = new Set(['attention', 'dashboard-token']);
  const queue = [];
  const subjectOf = (type, d = {}) =>
    String(d.question || d.view || d.metric || d.topic || d.plan || (d.action ? `${d.action}${d.worksheet ? ` · ${d.worksheet}` : ''}` : '') || d.name || d.channel || type).slice(0, 255);
  function logActivity(e, user, tenant) {
    if (!sf.enabled || !user || !tenant || SKIP.has(e.type)) return;
    const a = accounts.get(tenant.id);
    if (!a) return; // Apex staff (no client Account) — not client engagement
    const d = e.detail || {};
    queue.push({
      attributes: { type: 'Apex_Portal_Activity__c' },
      Event_Id__c: `${e.at}-${user.id}-${e.type}-${Math.random().toString(36).slice(2, 8)}`.slice(0, 64),
      Event_Type__c: e.type,
      Event_Time__c: e.at,
      ...(a ? { Account__c: a.id } : {}),
      ...(contacts.get(user.id) ? { Contact__c: contacts.get(user.id) } : {}),
      Client_Id__c: tenant.id,
      Client_Name__c: tenant.clientName,
      Portal_User_Id__c: user.id,
      User_Name__c: user.name,
      Persona__c: user.persona || 'Executive',
      Tier__c: tenant.tier === 'premium' ? 'Premium' : 'Standard',
      Has_Premium_Seat__c: seats.has(user.id),
      Subject__c: subjectOf(e.type, d),
      ...(d.amount != null ? { Amount__c: Number(d.amount) || 0 } : {}),
      ...(d.seats != null ? { Seats__c: Number(d.seats) || 0 } : {}),
      Detail__c: JSON.stringify(d).slice(0, 4000)
    });
  }
  async function flushActivity() {
    while (queue.length) {
      const batch = queue.splice(0, 200);
      try {
        const r = await sf.request('POST', '/composite/sobjects', { allOrNone: false, records: batch });
        const bad = (r || []).filter((x) => !x.success);
        if (bad.length) log.warn(`⚠ Salesforce activity: ${bad.length} not saved — ${JSON.stringify(bad[0].errors).slice(0, 200)}`);
      } catch (err) {
        log.warn(`⚠ Salesforce activity: ${err.message}`);
        return;
      }
    }
  }
  if (sf.enabled) setInterval(flushActivity, 5000).unref();

  /** Portal upgrades created in Salesforce after `since` — not in Data 360 yet. */
  async function upgradesSince(since) {
    if (!since) return [];
    const iso = new Date(since).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const rows = await sf.query(
      `SELECT Id, Name, Amount, Apex_Premium_Seats__c, CloseDate, CampaignId, Account.Apex_Client_Id__c, Account.Name FROM Opportunity WHERE Apex_Portal_Upgrade__c = true AND IsWon = true AND CreatedDate > ${iso} ORDER BY CreatedDate DESC`
    );
    return rows.map((o) => ({ id: o.Id, name: o.Name, clientId: o.Account?.Apex_Client_Id__c, client: o.Account?.Name, amount: Number(o.Amount || 0), seats: Number(o.Apex_Premium_Seats__c || 0), closed: o.CloseDate, campaign: Boolean(o.CampaignId) }));
  }

  /** DELETE up to 200 records per call (composite). */
  async function removeAll(ids) {
    let n = 0;
    for (let i = 0; i < ids.length; i += 200) {
      const r = await sf.request('DELETE', `/composite/sobjects?allOrNone=false&ids=${ids.slice(i, i + 200).join(',')}`);
      n += (r || []).filter((x) => x.success).length;
    }
    return n;
  }
  async function patchAll(type, records) {
    for (let i = 0; i < records.length; i += 200) {
      await sf.request('PATCH', '/composite/sobjects', { allOrNone: false, records: records.slice(i, i + 200).map((r) => ({ attributes: { type }, ...r })) });
    }
    return records.length;
  }

  /** Presenter "Reset demo": back to the baseline — tiers, no seats, only baseline upgrades, campaign funnel as it was,
   *  no portal Tasks, no live (non-seeded) portal activity. Opportunities etc. leave Data 360 on its next refresh. */
  async function resetDemo({ baselineOpportunities = [], respondedUsers = [], tiers = {} }) {
    const out = {};
    const seated = await sf.query('SELECT Id FROM Contact WHERE Apex_Premium_Seat__c = true');
    out.seats = await patchAll('Contact', seated.map((c) => ({ id: c.Id, Apex_Premium_Seat__c: false })));
    seats.clear();
    const keep = new Set(baselineOpportunities);
    const opps = (await sf.query('SELECT Id FROM Opportunity WHERE Apex_Portal_Upgrade__c = true')).filter((o) => !keep.has(o.Id));
    out.opportunities = await removeAll(opps.map((o) => o.Id));
    const accts = await sf.query('SELECT Id, Apex_Client_Id__c, Apex_Subscription_Tier__c FROM Account WHERE Apex_Client_Id__c != null');
    const tierFix = accts.filter((a) => tiers[a.Apex_Client_Id__c] && a.Apex_Subscription_Tier__c !== tiers[a.Apex_Client_Id__c]);
    out.tiers = await patchAll('Account', tierFix.map((a) => ({ id: a.Id, Apex_Subscription_Tier__c: tiers[a.Apex_Client_Id__c] })));
    for (const a of accts) if (accounts.get(a.Apex_Client_Id__c)) accounts.get(a.Apex_Client_Id__c).tier = String(tiers[a.Apex_Client_Id__c] || a.Apex_Subscription_Tier__c).toLowerCase();
    if (campaignId) {
      const responded = await sf.query(`SELECT Id, Contact.Apex_Portal_User_Id__c FROM CampaignMember WHERE CampaignId = '${campaignId}' AND Status = 'Responded'`);
      const undo = responded.filter((m) => !respondedUsers.includes(m.Contact?.Apex_Portal_User_Id__c));
      out.campaignResponses = await patchAll('CampaignMember', undo.map((m) => ({ id: m.Id, Status: 'Clicked' })));
    }
    const tasks = await sf.query("SELECT Id FROM Task WHERE What.Type = 'Account' AND (Subject LIKE '%(APX-%' OR Subject LIKE 'Upsell Premium%')");
    out.tasks = await removeAll(tasks.map((t) => t.Id));
    queue.length = 0;
    const live = await sf.query("SELECT Id FROM Apex_Portal_Activity__c WHERE (NOT Event_Id__c LIKE 'seed-%')");
    out.activity = await removeAll(live.map((x) => x.Id));
    return out;
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

  return { enabled: sf.enabled, resetDemo, upgradesSince, logActivity, flushActivity, refresh, tierFor, hasSeat, accountFor, status, recordUpgrade, revertUpgrade, createTask, recordsFor, rosterFor, buySeats, resetSeats };
}

module.exports = { createCrm };
