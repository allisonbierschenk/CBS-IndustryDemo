// Presenter guide: the end-to-end demo in a few short scenes. Each scene has what to do, one line to say,
// and color-coded Tableau tech chips + "If they ask" answers — knowledge for the presenter, not script.
import { Link } from 'react-router-dom';
import { Brand } from '../components/TopBar.jsx';
import Icon from '../components/Icon.jsx';

const TECH = {
  embed: { label: 'Embedding API v3', color: '#2f5fe0', note: 'Tableau dashboards inside the portal; the portal drives filters, reads selections and data, exports.' },
  jwt: { label: 'Connected App JWT', color: '#7a4fd6', note: 'Signed on the server per user and single-use; Tableau validates it, then keeps the user signed in with its own browser cookie (~2 hours).' },
  rls: { label: 'Row-level security', color: '#1f8a5b', note: 'User attributes in the JWT; a filter on the published data source decides which rows each user sees.' },
  pulse: { label: 'Tableau Pulse', color: '#e0702f', note: 'Governed metrics + insights platform; built-in AI on the Einstein Trust Layer explains them.' },
  rest: { label: 'REST API', color: '#5c6670', note: 'Library, favorites, subscriptions and Pulse follows — run as the signed-in user.' },
  vds: { label: 'VizQL Data Service', color: '#0f8a8a', note: 'Governed data as JSON/CSV, queried as the user — same security as the dashboards.' },
  author: { label: 'Web authoring', color: '#c0398a', note: 'Tableau’s editor embedded on the governed data source.' },
  portal: { label: 'Portal entitlements', color: '#2a312e', note: 'Apex’s app decides what a client’s subscription includes — enforced on the server, not hidden in the UI.' }
};

const MONEY = [
  ['Premium analytics tier', 'Benchmarks and build-your-own reports, sold per client ($5/month in this demo).'],
  ['Advisory upsell', 'Insights surface the next engagement — “Book a benchmark review”, Contact Apex.'],
  ['Retention & expansion', 'Live proof of value replaces the quarterly deck at renewal time.'],
  ['Scale without cost', 'One governed app for every client; no new build per customer.']
];

const SCENES = [
  {
    n: 1,
    title: 'Share live proof of value',
    where: 'Login → Home',
    do: 'Sign in as Elena Ortiz (Vantage Group). Point to Needs attention, then open Value Intelligence.',
    say: 'Show your clients the measurable value of your services every time they log in.',
    money: 'Proof of value at every login is what wins renewals and expansions.',
    tech: ['jwt', 'rls', 'pulse', 'embed'],
    ask: [
      ['Do clients need a Tableau login?', 'No. The portal signs a short-lived JWT for the user (email as the username, 10-minute expiry); Tableau trusts it through a Connected App. The secret never leaves the server.'],
      ['What happens to the token after sign-in?', 'Tableau validates the JWT once, then sets its own session cookie in the browser that lasts about 2 hours. The token itself is single-use — each one has a unique ID, so it can’t be replayed — and the portal mints a fresh one for every embed.'],
      ['Where do the KPI tiles come from?', 'Tableau Pulse metrics on the published data source — one governed definition each, so tiles, charts, the Agent and feeds agree.'],
      ['What is Needs attention?', 'A Pulse Insight Brief over the metrics the user follows. Numbers and drivers come from Pulse’s insights platform; the Issue / Expected rows use only those facts.']
    ]
  },
  {
    n: 2,
    title: 'Explore an engagement',
    where: 'Value Intelligence → Transportation',
    do: 'Use the filter bar, click a scorecard row, then select Supply Chain Optimization on a chart and follow “Explore Transportation”.',
    say: 'Connect high-level business outcomes to the initiatives driving them.',
    money: 'Engagement-level ROI shows Apex where to sell the next engagement.',
    tech: ['embed', 'rls'],
    ask: [
      ['Are those filters Tableau’s?', 'Yes — the portal’s filter bar drives the dashboard’s own Tableau filters through the Embedding API, and only lists values the user is allowed to see.'],
      ['How does the portal know what I clicked?', 'It listens to Tableau’s mark-selection events and reads the selected marks, then offers the next step.'],
      ['Is the scorecard a separate query?', 'No. It reads the summary data Tableau already computed for the dashboard, so it can’t disagree with the charts.']
    ]
  },
  {
    n: 3,
    title: 'Investigate the savings',
    where: 'Transportation Optimization & Savings',
    do: 'Filter by Carrier or Savings & Optimization Initiative. Select a few marks and choose Explain with Pulse.',
    say: 'Don’t just report value delivered — let clients explore how it was created.',
    money: 'Savings the client can verify justify extending the program — and its fees.',
    tech: ['embed', 'pulse'],
    ask: [
      ['What did Explain with Pulse just do?', 'Asked Pulse about the selected marks using only the Transportation metrics the user follows, and showed the answer beside the dashboard.'],
      ['Could it make numbers up?', 'No. Insights are computed by Pulse’s statistical insights platform; the AI only describes them.'],
      ['Do these numbers reconcile with Value Intelligence?', 'Not automatically — they are separate data sources in this demo. Don’t claim they reconcile.']
    ]
  },
  {
    n: 4,
    title: 'See the transactions',
    where: 'Transportation → invoice detail',
    do: 'Select Outstanding in Invoice Status Breakdown to drill into the invoice and shipment records, or search an invoice number.',
    say: 'Move from an insight to the detailed transactions behind it.',
    money: 'Transaction-level transparency builds the trust that keeps clients paying.',
    tech: ['embed', 'rls'],
    ask: [
      ['How does the drill-down work?', 'With actions built into the Tableau workbook — no extra portal code. The invoice search above it applies a Tableau filter through the Embedding API.'],
      ['Can they take the data with them?', 'Yes: Export (image, data, crosstab, PDF, PowerPoint), or select marks and Download rows — always only their rows.']
    ]
  },
  {
    n: 5,
    title: 'Ask the Agent',
    where: 'Agent',
    do: 'Pick Transportation, ask “What is driving Freight Cost?”, then a follow-up chip.',
    say: 'Answers in plain language — from the same governed metrics as the dashboard.',
    money: 'An AI analyst for every client, with Pulse AI included in Tableau+ — no per-question cost eating Apex’s margin.',
    tech: ['pulse', 'rls'],
    ask: [
      ['Is there an LLM?', 'Yes — built-in AI on the Einstein Trust Layer. It describes insights Tableau already computed; it never analyzes raw data, so insights are deterministic.'],
      ['What does it cost to run?', 'Included with Tableau+ and unmetered — no tokens, no usage bill, however many questions clients ask.'],
      ['What can it see?', 'Only the Pulse metrics the user follows, on the data source they pick, under the same row-level security.']
    ]
  },
  {
    n: 6,
    title: 'Upgrade to premium — live',
    where: 'Value Intelligence → Industry Benchmarks',
    do: 'Switch to Dana Whitfield (⌥1, Standard). The benchmarks tile is blurred: click What’s included, then Confirm upgrade. The tile unlocks; open Industry Benchmarks.',
    say: 'Monetize your expertise — clients upgrade themselves, right inside the experience.',
    money: 'Self-serve upsell: a Standard client becomes a paying Premium client in one click ($5/month in this demo).',
    tech: ['portal', 'jwt', 'vds', 'rls'],
    ask: [
      ['What changed when they upgraded?', 'The portal marked the session Premium on the server; the next Tableau token carries subscription tier = Premium, so the tile and the Benchmarks page unlock — no new dashboards, no reload of data.'],
      ['Is the Benchmarks page a Tableau dashboard?', 'No — Apex’s own design (d3), fed by the same governed data source through VizQL Data Service, queried as the user. Custom look, same source of truth and security.'],
      ['How do I reset the demo?', 'Sign out or switch users — the upgrade lives only in that session.']
    ]
  },
  {
    n: 7,
    title: 'Secure personalization at scale',
    where: 'Presenter dock (⌥P)',
    do: 'Switch users: Sam Patel (Operations only), Maya Chen (one engagement), Alex Morgan (two clients combined).',
    say: 'One application, many clients — each sees only their own data.',
    money: 'Every new client is new revenue on the same app — not a new build.',
    tech: ['rls', 'jwt'],
    ask: [
      ['How is each client isolated?', 'Each user’s JWT carries client name, service line and engagement type; filters on the published data source apply them everywhere — dashboards, Pulse, the Agent and feeds.'],
      ['How do you add a new client?', 'Add the users with their attributes to the portal’s user store and create them in Tableau. No new dashboards.']
    ]
  }
];

const EXTRAS = [
  ['Saved views', 'Views button — save filters, set a default.', ['embed']],
  ['Subscribe', 'Email the dashboard on a schedule.', ['rest']],
  ['Share + QR', 'Signed link that keeps filters.', ['embed']],
  ['Act on a selection', 'Slack (mock), schedule with Apex, download rows.', ['embed']],
  ['Reports library', 'Every entitled view, with favorites.', ['rest', 'embed']],
  ['Data feeds', 'Live CSV for Excel / Google Sheets.', ['vds', 'rls']],
  ['Alerts', 'Subscriptions and Pulse follows.', ['rest', 'pulse']],
  ['Activity log', 'Alex Morgan → account menu.', ['portal']]
];

const Chip = ({ k }) => (
  <span className="tech-chip" style={{ '--c': TECH[k].color }} title={TECH[k].note}>
    <i aria-hidden="true" />
    {TECH[k].label}
  </span>
);

export default function DemoGuide() {
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
            <div className="kicker">Presenter guide · 5–7 minutes</div>
            <h1>Share live proof of value — and get paid for it</h1>
            <p className="lead">
              Apex Consulting (Tableau’s customer) embeds Tableau in its client portal so clients like Vantage and Northstar see the value Apex delivers — and Apex
              turns that data into revenue.
            </p>
          </section>

          <section className="guide-money" aria-label="How Apex makes money">
            <div className="kicker">The story: how Apex makes money with Tableau Embedded</div>
            <div className="money-grid">
              {MONEY.map(([t, d]) => (
                <div key={t}>
                  <b>{t}</b>
                  <span>{d}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="guide-legend" aria-label="Tableau technology key">
            <div className="kicker">Tableau tech key — for you, not the script</div>
            <div className="legend-grid">
              {Object.keys(TECH).map((k) => (
                <div key={k}>
                  <Chip k={k} />
                  <span>{TECH[k].note}</span>
                </div>
              ))}
            </div>
          </section>

          <ol className="scenes">
            {SCENES.map((s) => (
              <li key={s.n} className="scene">
                <div className="scene-n">{s.n}</div>
                <div className="scene-body">
                  <div className="scene-head">
                    <h2>{s.title}</h2>
                    <span className="scene-where">{s.where}</span>
                  </div>
                  <p className="scene-do">
                    <b>Do</b> {s.do}
                  </p>
                  <p className="scene-say">“{s.say}”</p>
                  <p className="scene-money">
                    <span>$</span>
                    {s.money}
                  </p>
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

          <section className="guide-extras">
            <div className="kicker">Time permitting</div>
            <div className="extras-grid">
              {EXTRAS.map(([t, d, tech]) => (
                <div key={t} className="extra">
                  <b>{t}</b>
                  <span>{d}</span>
                  <div className="scene-tech">
                    {tech.map((k) => (
                      <Chip key={k} k={k} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

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
