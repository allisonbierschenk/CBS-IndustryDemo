// Presenter guide: the end-to-end demo in a few short scenes. Each scene has what to do, one line to say,
// and color-coded Tableau tech chips + "If they ask" answers — knowledge for the presenter, not script.
import { Link } from 'react-router-dom';
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

// Who to sign in as — what each persona represents and what to demo with them.
const ROLE = {
  exec: { icon: 'users', label: 'Executive' },
  lead: { icon: 'grid', label: 'Service-line lead' },
  owner: { icon: 'target', label: 'Engagement owner' },
  portfolio: { icon: 'people', label: 'Portfolio partner' }
};
const PLAN = { premium: { icon: 'star', label: 'Premium' }, standard: { icon: 'shield', label: 'Standard' } };
const PERSONAS = [
  ['Elena Ortiz', 'Vantage Group', 'exec', 'premium', 'The showcase client — every engagement improving; has the Transportation engagement.', ['Transportation + drill-down', 'Explain with Pulse', 'Agent across 2 data sources', 'Industry Benchmarks', 'Build your own report']],
  ['Dana Whitfield', 'Northstar Enterprises', 'exec', 'standard', 'A relationship under pressure — Operational Transformation value has collapsed.', ['Needs attention (off-track metrics)', 'Act on a selection', 'Locked benchmarks → live upgrade']],
  ['Priya Raman', 'Crestline Partners', 'exec', 'premium', 'A Premium success story — Digital Transformation is the top performer.', ['Value Intelligence', 'Industry Benchmarks', 'Build your own report']],
  ['Marcus Bell', 'Meridian Solutions', 'exec', 'standard', 'Risk visibility — ERP Implementation over budget, milestones slipping.', ['Engagement Health', 'Needs attention', 'Schedule with Apex']],
  ['Jordan Hayes', 'Helix Industries', 'exec', 'standard', 'Apex’s newest client — about four months of history.', ['Early-stage notice', 'Trends with limited history']],
  ['Sam Patel', 'Northstar Enterprises', 'lead', 'standard', 'Same company as Dana, but only the Operations service line.', ['Data security by service line']],
  ['Maya Chen', 'Crestline Partners', 'owner', 'premium', 'Sees one engagement only — Digital Transformation.', ['Data security by engagement']],
  ['Alex Morgan', 'West Region Portfolio', 'portfolio', 'premium', 'An Apex partner covering two clients with one login.', ['Multi-client view (Crestline + Helix)', 'Activity log (account menu)']]
];

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
      ['What can it see?', 'Only the Pulse metrics the user follows, on the data source they pick, under the same data security.']
    ]
  },
  {
    n: 6,
    title: 'Upgrade to premium — live',
    where: 'Value Intelligence → Industry Benchmarks',
    do: 'Switch to Dana Whitfield (⌥1, Standard). The benchmarks tile is blurred: click What’s included, then Confirm upgrade. Open Industry Benchmarks, click an engagement under Where you stand, set a goal and choose Plan the improvement with Apex.',
    say: 'Monetize your expertise — clients upgrade themselves, right inside the experience.',
    money: 'Self-serve upsell — a Standard client becomes Premium in one click ($5/month in this demo) — and every benchmark gap becomes an advisory conversation.',
    beats: [
      ['Against the plan', '“Dana’s dashboard says value realization is behind plan. Useful — but is that bad, or is everyone struggling?”'],
      ['Against peers', '“Benchmarks answer that: Northstar is behind about 70% of comparable logistics companies. Companies like hers are getting more from similar programs — so better is achievable.”'],
      ['Why it matters', '“Now Dana knows where she’s losing ground, which engagement to fix first, and what to tell her CFO.”'],
      ['Where Apex comes in', '“And only Apex can show her what the top performers do differently — that’s the next engagement.”']
    ],
    beatsNote: 'Read Dana’s live percentile from the Benchmarks headline after upgrading (about the 30th today).',
    tech: ['portal', 'jwt', 'vds', 'rls'],
    ask: [
      ['Are the peers their competitors?', 'Not necessarily — they’re comparable, anonymized companies in the same industry (e.g. Apex’s other logistics clients). Some may be competitors, but no one can tell who: only aggregate results are shown. The point is what good looks like for a company like yours.'],
      ['What does “where you stand among peers” mean?', 'Apex compares this client’s engagement results with anonymized companies in the same industry. The percentile is the share they outperform: 70th = better results than 70 out of 100 peers. 50th is the peer median.'],
      ['Why would the client care?', 'Hitting their own target doesn’t mean the result is good — 89% value realization sounds fine unless peers get 95%. Benchmarks justify the consulting spend to the CFO (“top quartile in our industry”), and show where the next dollar pays off most — because they reveal what’s achievable for a company like theirs.'],
      ['Why can Apex charge for it?', 'No single client can see how its peers perform — Apex can, across all its clients, anonymized. Every gap the benchmark shows is a reason for the next engagement.'],
      ['What changed when they upgraded?', 'The portal marked the session Premium on the server; the next Tableau token carries subscription tier = Premium, so the tile and the Benchmarks page unlock — no new dashboards, no reload of data.'],
      ['Is the Benchmarks page a Tableau dashboard?', 'No — Apex’s own design (d3), fed by the same governed data source through VizQL Data Service, queried as the user. Custom look, same source of truth and security.'],
      ['Where does the next step come from?', 'It’s rule-based on the percentile: below the median, above it, or top quartile — no AI involved. The plan request carries the numbers so Apex starts with the facts.'],
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

          <section className="guide-personas" aria-label="Who to sign in as">
            <div className="kicker">Who to sign in as</div>
            <div className="persona-legend">
              {[...Object.values(ROLE), ...Object.values(PLAN)].map((r) => (
                <span key={r.label}>
                  <Icon name={r.icon} />
                  {r.label}
                </span>
              ))}
            </div>
            <div className="persona-grid">
              {PERSONAS.map(([name, co, role, plan, story, demos]) => (
                <div key={name} className="pcard">
                  <div className="pcard-head">
                    <span className={`pcard-role is-${role}`} title={ROLE[role].label}>
                      <Icon name={ROLE[role].icon} />
                    </span>
                    <div>
                      <b>{name}</b>
                      <span>{co}</span>
                      <span className={`pcard-plan is-${plan}`}>
                        <Icon name={PLAN[plan].icon} />
                        {PLAN[plan].label}
                      </span>
                    </div>
                  </div>
                  <p>
                    <b>{ROLE[role].label}.</b> {story}
                  </p>
                  <ul>
                    {demos.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
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
                      {s.beatsNote && <small>{s.beatsNote}</small>}
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

          <section className="guide-explain" aria-label="How to talk about benchmarks">
            <div className="kicker">How to talk about Industry Benchmarks</div>
            <div className="explain-grid">
              <div>
                <b>What it is</b>
                <span>How the client’s engagement results compare with anonymized companies in the same industry. 70th percentile = ahead of 70 of every 100 peers; 50th = the median.</span>
              </div>
              <div>
                <b>Why the client cares</b>
                <span>
                  <em>Is our result good?</em> 89% vs an 85% target sounds fine — unless peers get 95%. <em>Is the spend worth it?</em> “Top quartile in our industry” answers the CFO.{' '}
                  <em>Where next?</em> The biggest gap to peers is the biggest upside.
                </span>
              </div>
              <div>
                <b>What they do with it</b>
                <span>Find the engagement furthest from the top quartile, set a goal, and plan it with Apex.</span>
              </div>
              <div>
                <b>Why Apex can charge for it</b>
                <span>No client can build this alone — only Apex sees results across many clients. And every gap it shows is a reason for the next engagement.</span>
              </div>
              <div className="explain-say">
                <b>Say it like this</b>
                <span>“Your dashboard tells you how you did against your plan. Benchmarks tell you how you did against everyone like you — and where Apex can help you close the gap.”</span>
              </div>
            </div>
          </section>

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
