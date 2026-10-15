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
  { id: 'dana', name: 'Dana Whitfield', first: 'Dana', company: 'Northstar Enterprises', role: 'exec', plan: 'standard', story: 'A relationship under pressure — Operational Transformation value has collapsed.', focus: 'Operational Transformation’s value realization has collapsed, while Technology Modernization holds up.' },
  { id: 'priya', name: 'Priya Raman', first: 'Priya', company: 'Crestline Partners', role: 'exec', plan: 'premium', story: 'A Premium success story — Digital Transformation is the top performer.', focus: 'Digital Transformation is the top performer; two engagements show minor friction.' },
  { id: 'marcus', name: 'Marcus Bell', first: 'Marcus', company: 'Meridian Solutions', role: 'exec', plan: 'standard', story: 'Risk visibility — ERP Implementation over budget, milestones slipping.', focus: 'ERP Implementation: Engagement Health has fallen and milestones are slipping.' },
  { id: 'jordan', name: 'Jordan Hayes', first: 'Jordan', company: 'Helix Industries', role: 'exec', plan: 'standard', story: 'Apex’s newest client — about four months of history.', focus: 'The early-stage notice: strong momentum, but not enough history for year-over-year comparisons.' },
  { id: 'sam', name: 'Sam Patel', first: 'Sam', company: 'Northstar Enterprises', role: 'lead', plan: 'standard', story: 'Same company as Dana, but only the Operations service line.', focus: 'Only Operations engagements appear — the Technology engagement Dana sees is gone.' },
  { id: 'maya', name: 'Maya Chen', first: 'Maya', company: 'Crestline Partners', role: 'owner', plan: 'premium', story: 'Sees one engagement only — Digital Transformation.', focus: 'One engagement only: every KPI and chart is Digital Transformation.' },
  { id: 'alex', name: 'Alex Morgan', first: 'Alex', company: 'West Region Portfolio', role: 'portfolio', plan: 'premium', story: 'An Apex partner covering two clients with one login.', focus: 'Crestline and Helix combined in one view — and nothing from any other client.' }
];

// F(id, group, label, build, unavailable?) — one demo feature.
const F = (id, group, label, build, unavailable) => ({ id, group, label, build, unavailable });
const onlyElena = (p) => (p.transport ? null : 'Elena only (Transportation)');
const onlyStandard = (p) => (p.plan === 'standard' ? null : 'Standard clients');
const onlyPremium = (p) => (p.plan === 'premium' ? null : 'Premium clients');

// Feature library in script order. group: 'core' (in every script, not an option) | 'ai' | 'bi' | 'money'.
// unavailable(p) → null, or the reason this persona can't show it.
const FEATURES = [
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
    ask: [['Is the secret exposed?', 'No — the token is signed on the server; only the signed token reaches the browser.']]
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
      ['Is there an LLM?', 'Yes — built-in AI on the Einstein Trust Layer. It describes insights Tableau already computed and never analyzes raw data, so insights are deterministic. Included with Tableau+ and unmetered.']
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
  F('agent', 'ai', 'Ask the Agent', (p) => ({
    title: 'Ask the Agent',
    where: 'Agent',
    do: 'Ask “What are the Value Realization Rate trends?”, then click a follow-up chip; point at the insight cards and trend chart.',
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
  F('selectionAgent', 'ai', 'Ask the Agent about a selection', () => ({
    title: 'Ask about what you selected',
    where: 'Any dashboard',
    do: 'Select marks on a chart, then Ask the Agent — the question is written from your selection.',
    say: 'Point at the data, ask why.',
    tech: ['embed', 'pulse'],
    ask: [['How is the question built?', 'From the selected marks’ fields and values, read through the Embedding API.']]
  })),
  F('explain', 'ai', 'Explain with Pulse', () => ({
    title: 'Explain with Pulse',
    where: 'Transportation',
    do: 'Select a few lanes or carriers and choose Explain with Pulse — the answer opens beside the dashboard.',
    say: 'Ask why — right next to the data.',
    money: 'An AI analyst on every dashboard, with no per-question cost to Apex.',
    tech: ['pulse', 'embed'],
    ask: [['What did it just do?', 'Asked Pulse about the selected marks using only the Transportation metrics the user follows.']]
  }), onlyElena),
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
  F('alerts', 'bi', 'Alerts & Pulse follows', () => ({
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
  F('upgrade', 'money', 'Live upgrade to Premium', () => ({
    title: 'Upgrade to Premium — live',
    where: 'What’s included → Confirm upgrade',
    do: 'Confirm upgrade: the tile unlocks, the badge turns Premium and Industry Benchmarks opens.',
    say: 'Clients upgrade themselves, right inside the experience.',
    money: 'A Standard client becomes Premium in one click ($5/month in this demo). Resets when you sign out.',
    tech: ['portal', 'jwt'],
    ask: [['What changed when they upgraded?', 'The session became Premium on the server; the next Tableau token carries subscription tier = Premium. Sign out to reset.']]
  }), onlyStandard),
  F('benchmarks', 'money', 'Industry Benchmarks page', (p) => ({
    title: 'Industry Benchmarks',
    where: 'Industry Benchmarks',
    do: `${p.plan === 'standard' ? 'After upgrading, open' : 'Open'} Industry Benchmarks: the percentile gauge, the trend over time, and where each engagement stands.`,
    say: 'Your dashboard tells you how you did against your plan. Benchmarks tell you how you did against everyone like you.',
    money: 'Peer comparison only Apex can provide — sold as a Premium tier.',
    tech: ['vds', 'rls', 'portal'],
    beats: benchmarkBeats(p),
    ask: benchmarkAsk
  }), (p) => (p.plan === 'premium' || p.plan === 'standard' ? null : 'Premium')),
  F('benchmarkAct', 'money', 'Act on a benchmark (goal, plan)', () => ({
    title: 'Turn a gap into a plan',
    where: 'Industry Benchmarks → Where you stand',
    do: 'Click an engagement: see the next step, set a goal, and choose Plan the improvement with Apex.',
    say: 'Know where you stand — and what to do next.',
    money: 'Every benchmark gap becomes an advisory conversation.',
    tech: ['portal'],
    ask: [['Where does the next step come from?', 'Rule-based on the percentile — below the median, above it, or top quartile. No AI.']]
  })),
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
    do: 'Open Contact Apex: the client’s account manager, with a topic and message.',
    say: 'Your Apex team is one click away.',
    money: 'Every insight in the portal can start a paid conversation.',
    tech: ['portal'],
    ask: [['Is this sent anywhere?', 'In the demo it’s logged on the server with a reference number.']]
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
  ['Is the Benchmarks page a Tableau dashboard?', 'No — Apex’s own design (d3), fed by the same governed data source through VizQL Data Service, queried as the user.']
];

const OPTIONAL = FEATURES.filter((f) => f.group !== 'core');
// The core story, used until the presenter picks their own.
const RECOMMENDED = ['attention', 'attentionAct', 'agent', 'agentSource', 'selectionAgent', 'explain', 'vi', 'filters', 'scorecard', 'contextNav', 'transportFilters', 'drill', 'actions', 'lock', 'upgrade', 'benchmarks', 'benchmarkAct', 'build'];

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
  const steps = FEATURES.filter(included).map((f) => ({ ...f.build(persona), group: f.group, id: f.id }));
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
            <p className="lead">Pick who you’ll sign in as and the features you want to show. The script below is built from exactly those.</p>
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
                          <span>{f.label}</span>
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
