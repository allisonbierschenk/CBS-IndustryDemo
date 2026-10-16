// Presenter guide: pick a persona, then click the features to show — AI, traditional BI, data monetization and
// platform features, one by one or a whole group at a time. The script below is built from exactly
// those features, written for that persona — features a persona can't do are shown disabled with the reason.
// Each step: what to do, one line to say, the monetization angle, color-coded Tableau tech and "If they ask".
// The selection lives in the URL (?p=dana&f=vi,upgrade,feeds) so a script can be bookmarked or shared.
import { Link, useSearchParams } from 'react-router-dom';
import { Brand } from '../components/TopBar.jsx';
import Icon from '../components/Icon.jsx';

const TECH = {
  embed: { label: 'Embedding API v3', color: '#2f5fe0', note: 'Tableau dashboards inside the portal; the portal drives filters, reads selections and data, exports.' },
  jwt: { label: 'Connected App JWT', color: '#7a4fd6', note: 'Signed on the server per user and single-use; Tableau validates it, then keeps the user signed in with its own browser cookie (~2 hours).' },
  rls: { label: 'Data security', color: '#1f8a5b', note: 'Row-level security: user attributes in the JWT and a filter on the published data source decide which rows each user sees.' },
  pulse: { label: 'Tableau Pulse', color: '#e0702f', note: 'Governed metrics + insights platform; built-in AI on the Einstein Trust Layer explains them.' },
  pulseApi: { label: 'Pulse REST API', color: '#b8541f', note: 'Creates Pulse metric definitions, metrics, goals and follows programmatically — as the signed-in user, straight from the data source.' },
  d360: { label: 'Data 360', color: '#5a2fd6', note: 'Harmonizes CRM revenue, portal engagement and campaign reach into one model per client; calculated insights + Query API; activates back to Salesforce.' },
  salesforce: { label: 'Salesforce CRM', color: '#0b5cab', note: 'Apex’s Sales Cloud org is the system of record: client tier on the Account, upgrades as Opportunities, follow-ups as Tasks.' },
  rest: { label: 'REST API', color: '#5c6670', note: 'Library, favorites, subscriptions and Pulse follows — run as the signed-in user.' },
  vds: { label: 'VizQL Data Service', color: '#0f8a8a', note: 'Governed data as JSON/CSV, queried as the user — same security as the dashboards.' },
  author: { label: 'Web authoring', color: '#c0398a', note: 'Tableau’s editor embedded on the governed data source.' },
  portal: { label: 'Portal entitlements', color: '#2a312e', note: 'Apex’s app decides what a client’s subscription includes — enforced on the server, not hidden in the UI.' }
};

const ROLE = {
  exec: { icon: 'users', label: 'Executive' },
  lead: { icon: 'grid', label: 'Service-line lead' },
  owner: { icon: 'target', label: 'Engagement owner' },
  portfolio: { icon: 'people', label: 'Portfolio partner' }
};
const PLAN = { premium: { icon: 'star', label: 'Premium' }, standard: { icon: 'shield', label: 'Standard' } };

const GROUPS = [
  { key: 'ai', label: 'AI', icon: 'agent', note: 'Pulse insights and the Agent' },
  { key: 'bi', label: 'Traditional BI', icon: 'dashboard', note: 'Dashboards, drill-down, delivery' },
  { key: 'money', label: 'Data monetization', icon: 'star', note: 'Premium tier and upsell' }
];

// story = what they represent; focus = what to point at on Value Intelligence.
const PERSONAS = [
  { id: 'elena', name: 'Elena Ortiz', first: 'Elena', company: 'Vantage Group', role: 'exec', plan: 'premium', transport: true, story: 'The showcase client — every engagement improving; has the Transportation engagement.', focus: 'Supply Chain Optimization: falling freight cost and rising realized savings.' },
  { id: 'dana', name: 'Dana Whitfield', first: 'Dana', company: 'Northstar Enterprises', role: 'exec', plan: 'standard', seats: true, story: 'A relationship under pressure — Operational Transformation value has collapsed. Northstar’s portal admin: buys Premium seats for her 40-person team.', focus: 'Operational Transformation’s value realization has collapsed, while Technology Modernization holds up.' },
  { id: 'priya', name: 'Priya Raman', first: 'Priya', company: 'Crestline Partners', role: 'exec', plan: 'premium', story: 'A Premium success story — Digital Transformation is the top performer.', focus: 'Digital Transformation is the top performer; two engagements show minor friction.' },
  { id: 'marcus', name: 'Marcus Bell', first: 'Marcus', company: 'Meridian Solutions', role: 'exec', plan: 'standard', story: 'Risk visibility — ERP Implementation over budget, milestones slipping.', focus: 'ERP Implementation: Engagement Health has fallen and milestones are slipping.' },
  { id: 'jordan', name: 'Jordan Hayes', first: 'Jordan', company: 'Helix Industries', role: 'exec', plan: 'standard', story: 'Apex’s newest client — about four months of history.', focus: 'The early-stage notice: strong momentum, but not enough history for year-over-year comparisons.' },
  { id: 'sam', name: 'Sam Patel', first: 'Sam', company: 'Northstar Enterprises', role: 'lead', plan: 'standard', story: 'Same company as Dana, but only the Operations service line. One of Northstar’s 20 managers — Premium once Dana gives him a seat.', focus: 'Only Operations engagements appear — the Technology engagement Dana sees is gone.' },
  { id: 'maya', name: 'Maya Chen', first: 'Maya', company: 'Crestline Partners', role: 'owner', plan: 'premium', story: 'Sees one engagement only — Digital Transformation.', focus: 'One engagement only: every KPI and chart is Digital Transformation.' },
  { id: 'alex', name: 'Alex Morgan', first: 'Alex', company: 'West Region Portfolio', role: 'portfolio', plan: 'premium', story: 'An Apex partner covering two clients with one login.', focus: 'Crestline and Helix combined in one view — and nothing from any other client.' }
];

// F(id, group, label, build, unavailable?) — one demo feature.
const F = (id, group, label, build, unavailable) => ({ id, group, label, build, unavailable });
const onlyElena = (p) => (p.transport ? null : 'Elena only (Transportation)');
const onlyStandard = (p) => (p.plan === 'standard' ? null : 'Standard clients');
const onlyPremium = (p) => (p.plan === 'premium' ? null : 'Premium clients');
// The Agent is Premium: Standard personas show it after upgrading (Dana: after giving herself a seat, or as Sam).
const agentFirst = (p) => (p.plan === 'standard' ? (p.seats ? 'Premium — after the seat purchase, switch to Sam (or give Dana a seat too). ' : 'Premium — after upgrading. ') : '');

// Feature library in script order. group: 'core' (in every script, not an option) | 'ai' | 'bi' | 'money'.
// unavailable(p) → null, or the reason this persona can't show it.
const FEATURES = [
  // ── Opener ──────────────────────────────────────────────────────────────
  F('campaign', 'money', 'The launch campaign (why they’re here)', (p) => ({
    title: 'Set the scene: the launch campaign',
    where: 'Salesforce → Campaigns (optional)',
    do: `Open with the story: last week Apex emailed every client — “Our partner portal now includes conversational analytics and anonymized industry benchmarks.” ${p.first} got that email. Optionally show the Campaign in Salesforce (“Partner portal update: conversational analytics + anonymized benchmarks”) with ${p.company}’s people as members.`,
    say: 'Apex told every client — 141 people across five companies — about two things they can’t get anywhere else: ask your data anything, and see how you compare to your peers. Now watch what one of them does with it.',
    money: 'Marketing → product → revenue in one loop: every upgrade in the portal is attributed back to this Campaign in Salesforce, so Apex knows exactly what the launch earned.',
    tech: ['salesforce'],
    ask: [['How do you know the campaign worked?', 'Each upgrade Opportunity’s Primary Campaign Source is the launch Campaign, so Salesforce campaign influence shows the revenue it drove.']]
  })),
  // ── Always ──────────────────────────────────────────────────────────────
  F('signin', 'core', null, (p) => ({
    title: 'Sign in',
    where: 'Login',
    do: `Click ${p.name} (${p.company}).`,
    say: 'One click, no second login — Tableau trusts the portal.',
    money: 'A seamless, branded experience is what makes clients log in — and keep paying.',
    tech: ['jwt', 'rls'],
    ask: [
      ['Do clients need a Tableau login?', 'No. The portal signs a short-lived JWT for the user (email as the username, 10-minute expiry); Tableau trusts it through a Connected App. The secret never leaves the server.'],
      ['What happens to the token after sign-in?', 'Tableau validates it once, then sets its own session cookie in the browser that lasts about 2 hours. The token is single-use — the portal mints a fresh one for every embed.']
    ]
  })),
  F('hood', 'core', null, () => ({
    title: 'Under the hood',
    where: 'Presenter dock → Under the hood',
    do: 'Show the JWT the portal just signed: sub = the user’s email, plus client name, service line and engagement type. Open it in jwt.io.',
    say: 'This token is all Tableau needs — no passwords, no second login.',
    tech: ['jwt', 'rls'],
    ask: [
      ['Is the secret exposed?', 'No — the token is signed on the server; only the signed token reaches the browser.'],
      ['What is the token allowed to do?', 'Only what its scopes list — e.g. read content, query data (VizQL Data Service), and for Premium goals create, update and delete Pulse metric definitions and metrics through the Pulse REST API. Always as this user, under their permissions and row-level security.']
    ]
  })),
  // ── AI ──────────────────────────────────────────────────────────────────
  F('attention', 'ai', 'Needs attention', () => ({
    title: 'Needs attention',
    where: 'Home',
    do: 'Point to Needs attention: each off-track row shows the issue, what’s expected and what’s driving it.',
    say: 'Pulse tells you what needs attention before you go looking.',
    tech: ['pulse', 'rls'],
    ask: [
      ['Where does this come from?', 'A Tableau Pulse Insight Brief over the metrics the user follows. The numbers and drivers come from Pulse’s insights platform; the Issue / Expected rows use only those facts.'],
      ['Is there an LLM?', 'Yes — built-in AI on the Einstein Trust Layer. It describes insights Tableau already computed and never analyzes raw data, so insights are deterministic. Included with Tableau+ and unmetered.'],
      ['Can “expected” be a real target?', 'Yes — Premium clients can set a goal on their own Pulse metric (Alerts & subscriptions → Create your own metric), and “Expected” becomes that goal.']
    ]
  })),
  F('attentionAct', 'ai', 'Act on an off-track metric', () => ({
    title: 'Act on an off-track metric',
    where: 'Home → Needs attention',
    do: 'On an off-track row, use the icons: Ask the Agent, Open dashboard, or Contact Apex (prefilled with what Pulse found).',
    say: 'From “something’s wrong” to the next step in one click.',
    money: 'Every off-track metric becomes a conversation with Apex — already filled in with the facts.',
    tech: ['pulse'],
    ask: [['Who wrote the Contact Apex message?', 'The portal, from Pulse’s facts for that metric — no generated text.']]
  })),
  F('goals', 'money', 'Your own metric with a goal (Premium)', (p) => ({
    title: 'Set your own goal in Pulse',
    where: 'Industry Benchmarks (or Account menu → Alerts & subscriptions)',
    do: `${p.plan === 'standard' ? 'After upgrading, open' : 'Open'} Industry Benchmarks, click an engagement’s point on the chart → Set a goal, drag to the 75th percentile and click Set goal & follow. A “Your goals” card appears with the live value from Pulse — hover its (i) to show the Pulse REST API calls. (Or: Alerts & subscriptions → Create your own metric, pick any KPI, e.g. Value Realization Rate at 92%.) Then show Needs attention: “Expected” is now ${p.first}’s goal. Clean up with the card’s ✕ or Presenter → Reset demo goals.`,
    say: 'Set the target once — Pulse tells you every week whether you’re on track to hit it.',
    money: 'A Premium feature: client-set goals give Apex a standing reason for the next check-in — and a clear way to prove it delivered.',
    tech: ['pulseApi', 'pulse', 'rls'],
    beats: [
      ['The ask', `“${p.first} doesn’t just want to see the number — they want a target, and to know if they’re on track.”`],
      ['The click', '“One click, and it’s a real Tableau Pulse metric with their goal — Pulse tracks it from now on.”'],
      ['Under the hood', '“That was the Pulse REST API: the portal built a new metric definition straight from the data source, scoped it to this client, saved the goal and followed it — no analyst, no new dashboard.”']
    ],
    ask: [
      ['What just happened in Tableau?', 'Four Pulse REST API calls, as the user: POST /pulse/definitions (a new metric definition from the data source field, scoped to this client and engagement), POST /pulse/metrics:getOrCreate (their metric), PATCH /pulse/metrics/{id} (the goal) and POST /pulse/subscriptions (the follow). The card value is POST /pulse/insights/ban.'],
      ['Does it depend on metrics someone already built in Pulse?', 'No — it’s created from the published data source itself, so any KPI on the data source can become a client’s goal.'],
      ['Does the goal affect other clients?', 'No — the definition and metric are this client’s own, and other clients never see them. Shared metrics are never edited.'],
      ['How do I clean up after a demo?', 'The ✕ on the goal card, Delete in Alerts & subscriptions, or Presenter → Reset demo goals — each deletes only metrics this client created in the portal, in Tableau too.'],
      ['What does Pulse do with the goal?', 'It tracks progress to the goal; Pulse also offers Goal and Threshold Breakdown and Pace to Goal insights (Pace to Goal needs Tableau+ with Forecast on).']
    ]
  })),
  F('agent', 'ai', 'Ask the Agent', (p) => ({
    title: 'Ask the Agent',
    where: 'Agent',
    do: `${agentFirst(p)}Ask “What are the Value Realization Rate trends?”, then click a follow-up chip; point at the insight cards and trend chart.${p.plan === 'standard' ? ' (Before upgrading, the Agent shows a Premium lock — a good upsell moment.)' : ''}`,
    say: 'Answers in plain language — from the same governed metrics as the dashboard.',
    money: 'Pulse AI is included with Tableau+ and unmetered — no tokens, no usage bill, however many questions clients ask.',
    tech: ['pulse', 'rls'],
    ask: [
      ['Is there an LLM?', 'Yes — built-in AI on the Einstein Trust Layer. It describes insights Tableau already computed; it never analyzes raw data, so insights are deterministic.'],
      ['What can it see?', `Only the Pulse metrics ${p.first} follows, under the same data security as the dashboards.`]
    ]
  })),
  F('agentSource', 'ai', 'Agent data-source picker', () => ({
    title: 'Switch data sources',
    where: 'Agent',
    do: 'Pick Transportation and ask “What is driving Freight Cost?” — only the Transportation metrics are in play.',
    say: 'One agent, scoped to the data you choose.',
    tech: ['pulse'],
    ask: [['Why separate sources?', 'Each source is its own conversation, so answers never mix metrics from different data.']]
  }), onlyElena),
  F('selectionAgent', 'ai', 'Ask the Agent about a selection', (p) => ({
    title: 'Ask about what you selected',
    where: 'Any dashboard',
    do: `${agentFirst(p)}Select marks on a chart, then Ask the Agent — the question is written from your selection.`,
    say: 'Point at the data, ask why.',
    tech: ['embed', 'pulse'],
    ask: [['How is the question built?', 'From the selected marks’ fields and values, read through the Embedding API.']]
  })),
  F('explain', 'ai', 'Explain this', (p) => ({
    title: 'Explain this',
    where: p.transport ? 'Transportation (or Value Intelligence)' : 'Value Intelligence',
    do: p.transport
      ? 'Select a few lanes or carriers → Explain this → click a follow-up to act.'
      : 'Select a few engagements on a chart → Explain this → click a follow-up to act.',
    say: 'See something on a dashboard? Get the why — and act on it — without leaving the page.',
    money: 'Every explanation ends in a next step — Continue in the Agent, or a conversation with Apex.',
    tech: ['pulse', 'embed'],
    ask: [['What did it just do?', 'Asked Pulse about the selected marks using only the Pulse metrics the user follows on that dashboard’s data source, and showed the answer beside the dashboard.']]
  })),
  F('tableauAgent', 'ai', 'Tableau Agent in the dashboard', () => ({
    title: 'Tableau Agent in the dashboard',
    where: 'Dashboard header → Ask Tableau Agent',
    do: 'Open Ask Tableau Agent inside the embedded dashboard and ask about a chart.',
    say: 'Conversational analytics right inside the viz.',
    tech: ['embed', 'pulse'],
    ask: [['Does it always work?', 'It needs Tableau Agent enabled and licensed for the site — check before demoing; this site reported it as not licensed earlier.']]
  })),
  // ── Traditional BI ──────────────────────────────────────────────────────
  F('vi', 'bi', 'Value Intelligence dashboard', (p) => ({
    title: 'Share live proof of value',
    where: 'Value Intelligence',
    do: `Open Value Intelligence. Point out: ${p.focus}`,
    say: 'Show your clients the measurable value of your services every time they log in.',
    money: 'Proof of value at every login is what wins renewals and expansions.',
    tech: ['embed', 'pulse', 'rls'],
    ask: [['Where do the KPI tiles come from?', 'Tableau Pulse metrics on the published data source — one governed definition each, so tiles, charts, the Agent and feeds agree.']]
  })),
  F('early', 'bi', 'Early-stage notice', () => ({
    title: 'Honest about early data',
    where: 'Value Intelligence',
    do: 'Point to the early-stage notice: about four months of history, so no year-over-year comparisons yet.',
    say: 'The portal never overstates what the data can show.',
    tech: ['portal'],
    ask: [['When does it go away?', 'Automatically once the client has more than six months of history.']]
  }), (p) => (p.id === 'jordan' ? null : 'Jordan only')),
  F('filters', 'bi', 'Filter bar', () => ({
    title: 'Filter the dashboard',
    where: 'Value Intelligence',
    do: 'Use the Service Line and Engagement Type filters; Reset clears them. The URL keeps the filters.',
    say: 'Your filters, your brand — Tableau underneath.',
    tech: ['embed', 'rls'],
    ask: [['Are those filters Tableau’s?', 'Yes — the portal drives the dashboard’s own Tableau filters through the Embedding API, and only lists values the user is allowed to see.']]
  })),
  F('scorecard', 'bi', 'Engagement scorecard', () => ({
    title: 'Engagement scorecard',
    where: 'Value Intelligence',
    do: 'Click a scorecard row — the dashboard filters to that engagement.',
    say: 'A portal table built from the dashboard’s own data.',
    tech: ['embed'],
    ask: [['Is it a separate query?', 'No — it reads the summary data Tableau already computed for the dashboard, so it can’t disagree with the charts.']]
  })),
  F('engagements', 'bi', 'Your engagements → dashboard', () => ({
    title: 'Jump to an engagement',
    where: 'Value Intelligence → Your engagements',
    do: 'Click an engagement card — the dashboard scrolls up, filtered to it.',
    say: 'From the list to the numbers in one click.',
    tech: ['embed'],
    ask: [['Where do the cards come from?', 'The client’s engagement list, limited to what the user is allowed to see.']]
  })),
  F('contextNav', 'bi', 'Explore Transportation from a selection', () => ({
    title: 'From value to the engagement behind it',
    where: 'Value Intelligence → Transportation',
    do: 'Select Supply Chain Optimization on a chart and follow Explore Transportation.',
    say: 'Connect high-level outcomes to the initiatives driving them.',
    tech: ['embed', 'portal'],
    ask: [['Why only for some clients?', 'The link only appears if the client’s subscription includes the Transportation page — checked on the server.']]
  }), onlyElena),
  F('transportFilters', 'bi', 'Transportation filters', () => ({
    title: 'Investigate the savings',
    where: 'Transportation',
    do: 'Filter by Carrier or Savings & Optimization Initiative; walk realized savings, freight cost and savings by initiative.',
    say: 'Don’t just report value — let clients explore how it was created.',
    money: 'Savings the client can verify justify extending the program — and its fees.',
    tech: ['embed', 'rls'],
    ask: [['Do these reconcile with Value Intelligence?', 'Not automatically — they are separate data sources in this demo. Don’t claim they reconcile.']]
  }), onlyElena),
  F('drill', 'bi', 'Invoice drill-down & search', () => ({
    title: 'See the transactions',
    where: 'Transportation',
    do: 'Select Outstanding in Invoice Status Breakdown to see the invoices; or search an invoice number.',
    say: 'Move from an insight to the transactions behind it.',
    tech: ['embed', 'rls'],
    ask: [['How does the drill-down work?', 'With actions built into the Tableau workbook; the invoice search applies a Tableau filter through the Embedding API.']]
  }), onlyElena),
  F('views', 'bi', 'Saved views', () => ({
    title: 'Save a view',
    where: 'Dashboard header → Views',
    do: 'Set a filter, save it as a view and make it the default — it opens that way next time.',
    say: 'Each client sees the dashboard the way they like it.',
    tech: ['embed'],
    ask: [['Where are views stored?', 'In Tableau, as the user’s custom views — so they follow the user, not the browser.']]
  })),
  F('export', 'bi', 'Export (PDF, PowerPoint, data)', () => ({
    title: 'Export',
    where: 'Dashboard header → Export',
    do: 'Export to PDF or PowerPoint, preview a sheet’s data, or download a crosstab.',
    say: 'Board-ready in one click.',
    tech: ['embed', 'rls'],
    ask: [['Is it the same data?', 'Yes — Tableau produces the export from the user’s own view, with the same data security.']]
  })),
  F('share', 'bi', 'Share link + QR', () => ({
    title: 'Share a view',
    where: 'Export → Share',
    do: 'Create a secure link (with filters) and its QR code.',
    say: 'Share exactly what you’re looking at.',
    tech: ['embed'],
    ask: [['Does the link expose data?', 'No — the person opening it signs in as themselves and sees it with their own data access.']]
  })),
  F('subscribe', 'bi', 'Email subscriptions', () => ({
    title: 'Subscribe',
    where: 'Dashboard header → Subscribe',
    do: 'Schedule the dashboard by email (weekly, PDF).',
    say: 'The dashboard comes to them.',
    money: 'A weekly email keeps Apex’s value in front of the client.',
    tech: ['rest', 'rls'],
    ask: [['Will the email show other clients’ data?', 'No — Tableau renders each email as that user.']]
  })),
  F('actions', 'bi', 'Act on a selection (Slack, schedule, download)', () => ({
    title: 'Act on what you see',
    where: 'Any dashboard',
    do: 'Select marks: Share to Slack, Schedule with Apex, or Download rows.',
    say: 'Every insight leads somewhere — to a person, a meeting or a spreadsheet.',
    money: 'Schedule with Apex turns a chart into a meeting request with the data attached.',
    tech: ['embed'],
    ask: [['Is Slack connected?', 'Not in this demo — the post is shown and logged, not sent.']]
  })),
  F('reports', 'bi', 'Reports library & favorites', () => ({
    title: 'Reports library',
    where: 'Reports',
    do: 'Show every report the client can open; star one; open it.',
    say: 'New reports appear as soon as Apex publishes them.',
    money: 'Every new report Apex publishes adds value to the subscription — with no portal release.',
    tech: ['rest', 'embed'],
    ask: [['Where do favorites live?', 'In Tableau — so they follow the user into Tableau too.']]
  })),
  F('feeds', 'bi', 'Data feeds → Google Sheets', () => ({
    title: 'Live data in a spreadsheet',
    where: 'Account menu → Data feeds',
    do: 'Click Open in Google Sheets and paste in A1 (use the deployed site — Google can’t reach localhost).',
    say: 'Governed, always-current data where your clients already work.',
    money: 'A live data feed is a natural add-on to sell.',
    tech: ['vds', 'rls'],
    ask: [['Is the spreadsheet a copy?', 'No — it’s a live query against the same governed data source, under the same data security.']]
  })),
  F('alerts', 'bi', 'Alerts & followed metrics', () => ({
    title: 'Alerts & subscriptions',
    where: 'Account menu → Alerts & subscriptions',
    do: 'Show email subscriptions and followed Pulse metrics; follow a new one.',
    say: 'Clients choose what they’re told about.',
    tech: ['rest', 'pulse'],
    ask: [['Where are follows stored?', 'In Tableau Pulse — following a metric also drives the Agent and Needs attention.']]
  })),
  F('help', 'bi', 'Help & KPI definitions', () => ({
    title: 'KPI definitions',
    where: 'Footer → Help & KPI definitions',
    do: 'Show how each KPI is defined.',
    say: 'Everyone reads the numbers the same way.',
    tech: ['portal'],
    ask: [['Who maintains these?', 'Apex — they mirror the governed definitions in the published data source.']]
  })),
  // ── Data monetization ───────────────────────────────────────────────────
  F('lock', 'money', 'Locked Premium tile', () => ({
    title: 'The Premium moment',
    where: 'Value Intelligence',
    do: 'Scroll to the blurred benchmarks tile: “Unlock Industry Benchmarks — $5/month”. Click What’s included.',
    say: 'Clients see what they’re missing — right where they work.',
    money: 'The upsell lives inside the product, not in a sales email.',
    tech: ['portal', 'embed'],
    ask: [['Is the lock security?', 'It’s the upsell moment — the real enforcement is on the server, which gives Standard clients no Premium data.']]
  }), onlyStandard),
  F('upgrade', 'money', 'Live upgrade to Premium', (p) => p.seats ? ({
    title: 'Upgrade the team — Premium seats',
    where: 'Agent (locked) or the benchmarks tile → Upgrade your team',
    do: 'Open the Agent (Premium lock) → Upgrade your team. The roster is Northstar’s 40 people from Salesforce; click “All managers (20)” — 20 seats × $5/user/month = $100/month · $1,200/yr — and confirm. Switch to Salesforce: the bell 🔔 shows “💰 Northstar Enterprises bought 20 Premium seats — +$1,200/yr”; click it → the Closed Won Opportunity (20 seats, Dana as decision maker, attributed to the launch Campaign). Then Switch user → Sam Patel: he’s one of the managers, so he’s Premium — the Agent and benchmarks are open. Dana herself stays Standard (she didn’t give herself a seat).',
    say: 'Dana buys exactly what her team needs — the managers — in one step. Apex sees $1,200 of new annual revenue before she’s closed the dialog.',
    money: 'Seat-based pricing scales with the client: 20 managers today, all 40 next quarter. Every seat is a Contact in Salesforce, every purchase a Closed Won Opportunity attributed to the launch campaign.',
    tech: ['portal', 'salesforce', 'd360', 'jwt'],
    beats: [
      ['The need', '“Northstar has 40 people in the portal. Dana wants her 20 managers to have benchmarks and the Agent — not everyone.”'],
      ['The purchase', '“She picks All managers and confirms: 20 seats, $1,200 a year.”'],
      ['The rep', '“Apex’s rep gets the bell in Salesforce — with the revenue and the campaign that drove it.”'],
      ['The result', '“Sam is one of those managers. He signs in — Premium. Same portal, same data security, new features.”']
    ],
    ask: [
      ['Where do the seats live?', 'On each person’s Contact in Salesforce (Apex Premium Seat). The portal reads it at sign-in and puts subscription tier = Premium in that person’s Tableau token — so Premium is per person, not per company.'],
      ['How do I reset?', 'Presenter → Salesforce → Reset Northstar seats. The Opportunities stay as history.']
    ]
  }) : ({
    title: 'Upgrade to Premium — live',
    where: 'What’s included → Confirm upgrade',
    do: 'Confirm upgrade: the tile unlocks, the badge turns Premium and Industry Benchmarks opens. Then switch to Salesforce: the bell 🔔 shows “💰 <client> upgraded to Premium — +$60/yr” for the account owner; click it to open the new Closed Won Opportunity on the client’s Account (tier now Premium). Or use Presenter → Salesforce → Open ↗.',
    say: 'Clients upgrade themselves, right inside the experience — and it’s booked revenue in Salesforce the moment they click.',
    money: 'A Standard client becomes Premium in one click ($5/month in this demo): benchmarks, their own Pulse goals and build-your-own reports. The account team sees it as a Closed Won Opportunity. Resets when you sign out.',
    tech: ['portal', 'salesforce', 'jwt'],
    ask: [
      ['What changed when they upgraded?', 'Salesforce got a Closed Won Opportunity ($60/yr) and the Account’s Apex Subscription Tier became Premium; the portal reads the tier from that Account, so the next Tableau token carries subscription tier = Premium. Signing out puts the Account back on Standard so you can demo it again; the Opportunity stays in Salesforce as the record of the upgrade.'],
      ['Where does a client’s plan come from?', 'Their Salesforce Account (Apex Subscription Tier) — change it in Salesforce and the portal follows within a minute.']
    ]
  }), onlyStandard),
  F('benchmarks', 'money', 'Industry Benchmarks page', (p) => ({
    title: 'Industry Benchmarks',
    where: 'Industry Benchmarks',
    do: `${p.plan === 'standard' ? 'After upgrading, open' : 'Open'} Industry Benchmarks: the percentile gauge, the trend over time and where each engagement stands. Click an engagement’s point → Explain this, Schedule with Apex, or Set a goal (creates the client’s own Pulse metric through the Pulse REST API — see “Your own metric with a goal”).`,
    say: 'Your dashboard tells you how you did against your plan. Benchmarks tell you how you did against everyone like you.',
    money: 'Peer comparison only Apex can provide — sold as a Premium tier.',
    tech: ['vds', 'pulseApi', 'rls', 'portal'],
    beats: benchmarkBeats(p),
    ask: benchmarkAsk
  }), (p) => (p.plan === 'premium' || p.plan === 'standard' ? null : 'Premium')),
  F('growth', 'money', 'Apex client growth (Data 360)', () => ({
    title: 'Close the loop: Apex’s view in Data 360',
    where: 'Switch user → Alex Morgan → Client growth',
    do: 'Switch to Alex Morgan (Apex portfolio partner) → Client growth. Point at Premium ARR and “From the launch campaign” — Northstar’s $1,200 seat purchase is there, attributed to the campaign. Then Next best upsell: engaged Standard clients the campaign reached, ranked by portal engagement (the activity every client generates in the portal). Tick the top two → Create follow-ups in Salesforce → switch to Salesforce: Tasks for each client’s rep, with the Data 360 numbers in them. Then Agent → pick “Data 360 · Premium revenue” and ask “How much Premium revenue have we booked this year, and which clients drove it?” — Tableau Pulse answers from the Data 360 data (or “Data 360 · Portal engagement”: “Which clients are most engaged?”). Hover the (i) for the Data 360 story.',
    say: 'Every click in the portal, every deal in Salesforce and every campaign email lands in Data 360 — one model per client. That’s how Apex knows which campaign paid off and who to call next.',
    money: 'Data 360 turns the portal into a growth engine: usage signals become the next upsell, and the campaign’s ROI is measured, not guessed.',
    tech: ['d360', 'salesforce', 'portal'],
    beats: [
      ['Three systems, one model', '“The portal knows usage, Salesforce knows revenue, the campaign knows reach. Data 360 harmonizes all three per client.”'],
      ['Measured', '“$1,200 of new ARR from the launch campaign — attributed, not guessed.”'],
      ['Next', '“Northstar’s managers are using it heavily; Meridian is engaged and still on Standard — that’s the next call.”'],
      ['Activated', '“One click: the reps have Tasks in Salesforce with the numbers to make the call.”']
    ],
    ask: [
      ['What’s in Data 360 exactly?', 'CRM data streams for Opportunity, Campaign, Campaign Member and Apex Portal Activity (every portal sign-in, Agent question, goal, request and upgrade, written to Salesforce by the portal); mapped to three data model objects; calculated insights for Premium ARR and seats, engagement and campaign reach. The page reads them with the Data 360 Query API.'],
      ['How fresh is it?', 'Data 360 refreshes the Salesforce streams on its schedule (minutes); Sync to Data 360 starts a refresh now. Insights recompute hourly.'],
      ['Where does Tableau come in?', 'Tableau Cloud connects to the same Data 360 model, and Pulse metrics on it (Premium ARR, portal engagement) alert Apex leaders — the same governed numbers.']
    ]
  }), (p) => (p.id === 'alex' ? null : 'Alex Morgan (Apex)')),
  F('build', 'money', 'Build your own report', () => ({
    title: 'Build your own report',
    where: 'Reports → Build your own report',
    do: 'Drag a few fields onto the canvas; close with Tableau’s ✕.',
    say: 'Clients answer their own questions — on governed data.',
    money: 'Self-service authoring as a Premium feature.',
    tech: ['author', 'rls'],
    ask: [['Can they see other clients’ data while authoring?', 'No — the authoring token carries the same user attributes.']]
  }), onlyPremium),
  F('contact', 'money', 'Contact your account manager', () => ({
    title: 'Talk to Apex',
    where: 'Contact Apex',
    do: 'Open Contact Apex (or Schedule with Apex on any selection): pick a topic, send. Then Presenter → Salesforce: it’s a Task on the client’s Account for the account team, with the reference number.',
    say: 'Your Apex team is one click away — and the request lands in their Salesforce, not an inbox.',
    money: 'Every insight in the portal can start a paid conversation, and it’s tracked in Apex’s CRM.',
    tech: ['portal', 'salesforce'],
    ask: [['Is this sent anywhere?', 'Yes — it creates a Task on the client’s Salesforce Account, assigned to the account owner (due tomorrow for review requests), with the message and a reference number.']]
  })),
  F('activity', 'money', 'Activity log', () => ({
    title: 'See how clients use the portal',
    where: 'Account menu → Activity log',
    do: 'Open the Activity log: sign-ins, exports, shares, upgrades and Agent questions.',
    say: 'Apex sees which clients engage — and which need a call.',
    money: 'Usage signals show who to upsell and who is at risk of churning.',
    tech: ['portal'],
    ask: [['Is this Tableau data?', 'No — the portal’s own log. Tableau-side usage is in Tableau Cloud’s Admin Insights.']]
  }), (p) => (p.id === 'alex' ? null : 'Alex only')),
  // ── In every script ─────────────────────────────────────────────────────
  F('info', 'core', null, () => ({
    title: 'Why Tableau, on every surface',
    where: 'Any (i)',
    do: 'Hover an (i): freshness, source, data security — and why Tableau helps there.',
    say: 'Every number has a source you can trust.',
    tech: ['portal'],
    ask: [['Do clients see these?', 'Yes — they’re written for clients; the Why Tableau part is the value story.']]
  })),
  F('security', 'core', null, (p) => ({
    title: 'Secure personalization at scale',
    where: 'Presenter dock (Switch user)',
    do:
      p.role === 'exec'
        ? 'Switch to Sam Patel (Northstar, Operations only) or Alex Morgan (two clients): same dashboards, different data.'
        : `Point out what ${p.first} can’t see, then switch to ${p.role === 'lead' ? 'Dana Whitfield — same company, every service line' : p.role === 'owner' ? 'Priya Raman — same company, every engagement' : 'Priya Raman — one of the two clients, on her own'}.`,
    say: 'One application, many clients — each sees only their own data.',
    money: 'Every new client is new revenue on the same app — not a new build.',
    tech: ['rls', 'jwt'],
    ask: [
      ['How is each client isolated?', 'Each user’s JWT carries client name, service line and engagement type; filters on the published data source apply them everywhere.'],
      ['How do you add a new client?', 'Add the users with their attributes to the portal’s user store and create them in Tableau. No new dashboards.']
    ]
  }))
];

function benchmarkBeats(p) {
  return [
    ['Against the plan', `“${p.first}’s dashboard shows results against plan. Useful — but is that good, or is everyone in the industry doing better?”`],
    ['Against peers', '“Benchmarks answer that: the percentile is the share of comparable, anonymized companies they outperform. Read the headline — 30th means behind 70 of every 100.”'],
    ['Why it matters', `“Now ${p.first} knows which engagement to fix first, and what to tell the CFO.”`],
    ['Where Apex comes in', '“Only Apex can show what the top performers do differently — that’s the next engagement.”']
  ];
}
const benchmarkAsk = [
  ['What does “where you stand among peers” mean?', 'Apex compares this client’s engagement results with anonymized companies in the same industry. 70th percentile = better results than 70 out of 100 peers; 50th is the median.'],
  ['Why would the client care?', 'Hitting their own target doesn’t mean the result is good — 89% value realization sounds fine unless peers get 95%. Benchmarks justify the spend to the CFO and show where the next dollar pays off most.'],
  ['Is the Benchmarks page a Tableau dashboard?', 'No — Apex’s own design (d3), fed by the same governed data source through VizQL Data Service, queried as the user.'],
  ['What does Set a goal do in Tableau?', 'It calls the Pulse REST API as the user: creates a new metric definition from the Benchmark Percentile field, scoped to this client and engagement; creates their metric; saves the goal; and follows it. The “Your goals” card shows Pulse’s live value.']
];

// Plain-English: what the audience will see — for presenters who have never seen the portal.
const ABOUT = {
  "growth": "Alex (Apex) sees every client’s Premium revenue, portal engagement and campaign reach — harmonized in Data 360 — and turns the next-best upsell into Salesforce Tasks.",
  "campaign": "Open with why the client is here: Apex’s email announcing conversational analytics and anonymized benchmarks — a real Salesforce Campaign every upgrade is attributed to.",
  "signin": "Pick a person — you’re in. No password, no Tableau login.",
  "hood": "The secure token behind the sign-in.",
  "attention": "Pulse flags the metrics going the wrong way.",
  "attentionAct": "One click to ask why, open the dashboard or email Apex.",
  "goals": "Premium: the client sets a goal on any KPI — the portal creates a real Pulse metric for them through the Pulse REST API, sets the goal and follows it.",
  "agent": "Ask a question in plain English, get an answer from the client’s metrics.",
  "agentSource": "Choose which metrics the chat uses (Elena has two sets).",
  "selectionAgent": "Select data on a chart, ask the chat about it.",
  "explain": "Select a data point in a dashboard → Pulse explains it.",
  "tableauAgent": "Tableau’s AI inside the dashboard (needs a license).",
  "vi": "The value Apex has delivered to this client.",
  "early": "Banner for a brand-new client with little history.",
  "filters": "Dropdowns that filter every chart at once.",
  "scorecard": "Engagement summary table; click a row to filter.",
  "engagements": "Click an engagement to jump to it on the dashboard.",
  "contextNav": "Click Supply Chain → open the Transportation dashboard.",
  "transportFilters": "Freight cost and savings, filtered by carrier or initiative.",
  "drill": "Click a bar to see the invoices behind it.",
  "views": "Save filters as a view that opens by default.",
  "export": "PDF, PowerPoint, image or the data.",
  "share": "A secure link and QR code to this exact view.",
  "subscribe": "Email the dashboard on a schedule.",
  "actions": "Select data → Slack, meeting with Apex, or download.",
  "reports": "Every report the client can open, with favorites.",
  "feeds": "Live data in Google Sheets or Excel.",
  "alerts": "Manage email subscriptions and followed metrics.",
  "help": "What each KPI means.",
  "lock": "Premium chart blurred: “Unlock — $5/month”.",
  "upgrade": "Upgrade on the spot; the blur lifts. Sign out to reset.",
  "benchmarks": "How the client compares with similar companies.",
  "build": "Clients build their own charts in Tableau.",
  "contact": "Message the client’s Apex account manager.",
  "activity": "Apex sees what clients do in the portal.",
  "info": "Blue (i) icons: where the data comes from, why Tableau.",
  "security": "Switch users: same dashboards, different data."
};
const OPTIONAL = FEATURES.filter((f) => f.group !== 'core');
// The core story, used until the presenter picks their own.
const RECOMMENDED = ['campaign', 'growth', 'attention', 'attentionAct', 'goals', 'agent', 'agentSource', 'selectionAgent', 'explain', 'vi', 'filters', 'scorecard', 'contextNav', 'transportFilters', 'drill', 'actions', 'lock', 'upgrade', 'benchmarks', 'build'];

const Chip = ({ k }) => (
  <span className="tech-chip" style={{ '--c': TECH[k].color }} title={TECH[k].note}>
    <i aria-hidden="true" />
    {TECH[k].label}
  </span>
);

export default function DemoGuide() {
  const [params, setParams] = useSearchParams();
  const persona = PERSONAS.find((x) => x.id === params.get('p')) || PERSONAS[0];
  // Selected features (default: the recommended set). Sign-in, under the hood, the (i) popovers and the data
  // security switch are in every script.
  const selected = new Set(params.has('f') ? params.get('f').split(',').filter(Boolean) : RECOMMENDED);
  const save = (p, set) => setParams({ p, f: [...set].join(',') }, { replace: true });
  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    save(persona.id, next);
  };
  const setGroup = (group, on) => {
    const next = new Set(selected);
    for (const f of OPTIONAL.filter((x) => x.group === group)) on ? next.add(f.id) : next.delete(f.id);
    save(persona.id, next);
  };
  const available = (f) => !f.unavailable?.(persona);
  const included = (f) => available(f) && (f.group === 'core' || selected.has(f.id));
  const steps = FEATURES.filter(included).map((f) => ({ ...f.build(persona), group: f.group, id: f.id, about: ABOUT[f.id] }));
  const showMoney = OPTIONAL.some((f) => f.group === 'money' && included(f));
  const minutes = Math.max(3, Math.round(steps.length * 0.75));

  return (
    <div className="frame">
      <div className="page">
        <header className="topbar" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
          <Brand to="/login" />
          <span />
          <Link className="btn btn-dark btn-sm" to="/login">
            Open the portal
            <Icon name="arrowRight" />
          </Link>
        </header>
        <main className="container guide">
          <section className="guide-hero">
            <div className="kicker">Presenter guide</div>
            <h1>Share live proof of value — and get paid for it</h1>
            <p className="lead">A step-by-step script for demoing the Apex client portal — even if you’ve never seen it.</p>
            <ol className="guide-how">
              <li>
                <b>Pick a person.</b> Each one is a different client with different data and plan.
              </li>
              <li>
                <b>Tick what you want to show.</b> Each option says what the audience will see.
              </li>
              <li>
                <b>Follow the script.</b> Every step tells you what it is, what to click and what to say.
              </li>
            </ol>
          </section>

          <section className="guide-story" aria-labelledby="story-title">
            <div className="kicker">The story</div>
            <h2 id="story-title">The client portal is now a revenue-generating machine — and everyone wins</h2>
            <p>
              Apex Consulting runs on Salesforce and Tableau. Its client portal used to be a cost center — a place to send reports. Now Salesforce, Data 360 and
              Tableau work together so that every client visit can become value for the client <i>and</i> revenue for Apex.
            </p>
            <div className="story-wins">
              <div>
                <b>Apex’s clients win</b>
                <span>
                  Proof of the value Apex delivers, how they compare to their peers, their own goals — and an AI agent that answers their questions. At a predictable price:
                  $5 per user per month.
                </span>
              </div>
              <div>
                <b>Apex wins</b>
                <span>
                  One campaign email reached 141 client people. A client upgrades in one click and it’s booked revenue in Salesforce before the dialog closes. Data 360 shows
                  which campaign drove it and who’s next — and the reps already have the follow-up.
                </span>
              </div>
              <div>
                <b>Salesforce and Tableau win</b>
                <span>
                  The AI is included with Tableau+ and unmetered, so Apex can offer it to every client with no per-question bill — a predictable cost for Apex and a
                  predictable price for its clients. More clients, more seats, more of the platform in use.
                </span>
              </div>
            </div>
            <ol className="story-loop" aria-label="The loop">
              <li>Campaign</li>
              <li>Client experience</li>
              <li>Upgrade</li>
              <li>Revenue in Salesforce</li>
              <li>Data 360 insight</li>
              <li>Next campaign</li>
            </ol>
            <blockquote>
              “One click by a client became revenue in Salesforce, Data 360 told Apex who to call next, and the AI behind it costs the same no matter how much clients use it.
              Apex’s portal isn’t a cost center anymore — it’s a revenue-generating machine.”
            </blockquote>
          </section>

          <section className="guide-personas" aria-label="Who to sign in as">
            <div className="kicker">1 · Who you’ll sign in as</div>
            <div className="persona-grid">
              {PERSONAS.map((p) => (
                <button key={p.id} type="button" className={`pcard${p.id === persona.id ? ' is-picked' : ''}`} onClick={() => save(p.id, selected)} aria-pressed={p.id === persona.id}>
                  <div className="pcard-head">
                    <span className={`pcard-role is-${p.role}`} title={ROLE[p.role].label}>
                      <Icon name={ROLE[p.role].icon} />
                    </span>
                    <div>
                      <b>{p.name}</b>
                      <span>{p.company}</span>
                      <span className={`pcard-plan is-${p.plan}`}>
                        <Icon name={PLAN[p.plan].icon} />
                        {PLAN[p.plan].label}
                      </span>
                    </div>
                  </div>
                  <p>
                    <b>{ROLE[p.role].label}.</b> {p.story}
                  </p>
                </button>
              ))}
            </div>
          </section>

          <section className="guide-features" aria-label="Features to show">
            <div className="features-head">
              <div className="kicker">2 · Features to show</div>
              <div className="features-presets">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => save(persona.id, new Set(RECOMMENDED))}>
                  Recommended
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => save(persona.id, new Set(OPTIONAL.map((f) => f.id)))}>
                  Everything
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => save(persona.id, new Set())}>
                  Clear
                </button>
              </div>
            </div>
            <div className="feature-groups">
              {GROUPS.map((g) => {
                const items = FEATURES.filter((f) => f.group === g.key && f.label);
                const opt = items.filter(available);
                const allOn = opt.length > 0 && opt.every((f) => selected.has(f.id));
                return (
                  <div key={g.key} className={`fgroup is-${g.key}`}>
                    <div className="fgroup-head">
                      <Icon name={g.icon} />
                      <span>
                        <b>{g.label}</b>
                        <small>{g.note}</small>
                      </span>
                      <button type="button" className="fgroup-all" onClick={() => setGroup(g.key, !allOn)}>
                        {allOn ? 'None' : 'All'}
                      </button>
                    </div>
                    {items.map((f) => {
                      const reason = f.unavailable?.(persona);
                      const on = !reason && selected.has(f.id);
                      return (
                        <label key={f.id} className={`fopt${reason ? ' is-off' : ''}`}>
                          <input type="checkbox" checked={on} disabled={Boolean(reason)} onChange={() => toggle(f.id)} />
                          <span>
                            {f.label}
                            <em>{ABOUT[f.id]}</em>
                          </span>
                          {reason && <small>{reason}</small>}
                        </label>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </section>

          <section aria-label="Script">
            <div className="script-head">
              <div className="kicker">3 · Your script</div>
              <h2>
                {persona.name} · {steps.length} steps · ~{minutes} min
              </h2>
            </div>
            <ol className="scenes">
              {steps.map((s, i) => (
                <li key={s.id} className="scene">
                  <div className="scene-n">{i + 1}</div>
                  <div className="scene-body">
                    <div className="scene-head">
                      <h2>
                        {s.title}
                        {s.group !== 'core' && <span className={`theme-tag is-${s.group}`}>{GROUPS.find((g) => g.key === s.group).label}</span>}
                      </h2>
                      <span className="scene-where">{s.where}</span>
                    </div>
                    {s.about && <p className="scene-about">{s.about}</p>}
                    <p className="scene-do">
                      <b>Do</b> {s.do}
                    </p>
                    <p className="scene-say">“{s.say}”</p>
                    {showMoney && s.money && (
                      <p className="scene-money">
                        <span>$</span>
                        {s.money}
                      </p>
                    )}
                    {s.beats && (
                      <div className="scene-beats">
                        <div className="kicker">Benchmarking talk track</div>
                        <ol>
                          {s.beats.map(([t, line]) => (
                            <li key={t}>
                              <b>{t}</b>
                              <span>{line}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    <div className="scene-tech">
                      {s.tech.map((k) => (
                        <Chip key={k} k={k} />
                      ))}
                    </div>
                    <details className="scene-ask">
                      <summary>If they ask…</summary>
                      <dl>
                        {s.ask.map(([q, a]) => (
                          <div key={q}>
                            <dt>{q}</dt>
                            <dd>{a}</dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <details className="guide-legend guide-legend-fold">
            <summary className="kicker">Tableau tech key — for you, not the script</summary>
            <div className="legend-grid">
              {Object.keys(TECH).map((k) => (
                <div key={k}>
                  <Chip k={k} />
                  <span>{TECH[k].note}</span>
                </div>
              ))}
            </div>
          </details>

          <section className="guide-close">
            <h2>Turn services delivered into value demonstrated.</h2>
            <div className="close-grid">
              <div>
                <b>For Apex</b>
                <span>A new revenue line — premium analytics and advisory upsell — plus stronger renewals.</span>
              </div>
              <div>
                <b>For their clients</b>
                <span>ROI they can see, explore and verify, down to the transaction.</span>
              </div>
              <div>
                <b>For Tableau</b>
                <span>Embedded, secure, multi-tenant analytics with Pulse AI — one governed source of truth.</span>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
