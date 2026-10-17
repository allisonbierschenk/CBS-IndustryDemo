// Competition cut — the 5-minute video script ("The portal that pays for itself"): per scene the time, what to
// click, the voiceover, and the technology captions to add as on-screen text while editing. Plus prep and recording tips.
import { Link } from 'react-router-dom';
import { Brand } from '../components/TopBar.jsx';
import Icon from '../components/Icon.jsx';

const SCENES = [
  {
    time: '0:00–0:25',
    title: 'The hook',
    as: 'Any persona',
    click: ['Apex portal Home (Northstar’s logo on screen).'],
    say: [
      'Every company that serves clients has a client portal. And almost every one is a cost center — a place to send reports that nobody pays for.',
      'In the next five minutes, Apex Consulting turns its portal into a revenue-generating machine — using the Salesforce and Tableau it already owns.'
    ],
    captions: ['Apex Consulting · Salesforce + Tableau customer']
  },
  {
    time: '0:25–0:45',
    title: 'The problem',
    as: 'Salesforce',
    click: ['Salesforce → Campaigns → “Partner portal update: conversational analytics + anonymized benchmarks”.', 'Show the 141 Campaign Members and the Sent / Opened / Clicked funnel.'],
    say: [
      'So Apex upgraded its portal, and sent one email to 141 people across its five clients: you can now ask your data anything, and see how you compare to your peers.'
    ],
    captions: ['Salesforce Marketing · Campaign']
  },
  {
    time: '0:45–1:40',
    title: 'The client’s decision',
    as: 'Dana Whitfield · Northstar (Standard)',
    click: [
      'Sign in as Dana → Home: point at Needs attention (Operational Transformation off track).',
      'Open Value Intelligence — the embedded Tableau dashboard: Northstar’s numbers only. Scroll to the Industry Benchmarks tile, blurred and locked inside the dashboard.',
      'Hover the locked Agent icon (on Home or in the nav).'
    ],
    say: [
      'This is Dana, VP of Operations at Northstar. Without going looking, the portal tells her Operational Transformation is off track — and why.',
      'Here’s her own dashboard, inside Apex’s portal — Northstar’s numbers and nobody else’s. And right there in it, the benchmarks she can’t see yet.',
      'She wants to ask why, and know how Northstar compares to its peers. That’s Premium. Her decision: is this worth paying for?'
    ],
    captions: ['Tableau Pulse · Needs attention', 'Tableau Embedded · row-level security']
  },
  {
    time: '1:40–2:20',
    title: 'One click, booked revenue',
    as: 'Dana → Salesforce',
    click: ['Agent (locked) → Upgrade your team → All managers (20) → $1,200/yr → Upgrade 20 people.', 'Switch to Salesforce → the bell 🔔 “Northstar Enterprises bought 20 Premium seats — +$1,200/yr” → click it → the Closed Won Opportunity (20 seats, Dana as decision maker, campaign).'],
    say: [
      'She doesn’t need everyone — just her 20 managers. Five dollars a user. One click.',
      'And here’s Apex’s rep, in Salesforce: Northstar just bought 20 seats, $1,200 a year. Closed Won, credited to the campaign — before Dana has closed the window.',
      'The portal just sold something.'
    ],
    captions: ['Salesforce Sales Cloud · Opportunity', 'Campaign attribution', 'Salesforce notification']
  },
  {
    time: '2:20–2:55',
    title: 'The client gets the value — at a predictable cost',
    as: 'Sam Patel · Northstar manager (now Premium)',
    click: ['Switch user → Sam Patel → Agent → “Which engagement is furthest behind plan, and why?” → the answer.'],
    say: [
      'Sam is one of those managers. He just got an analyst — plain-English answers from Northstar’s own governed numbers.',
      'And Apex can offer it to every client: the AI is included with Tableau+ and unmetered — a predictable cost for Apex, and a predictable price for its clients.'
    ],
    captions: ['Tableau Pulse Agent', 'Einstein Trust Layer', 'Included with Tableau+ · unmetered']
  },
  {
    time: '2:55–4:25',
    title: 'The decision that changes for Apex',
    as: 'Alex Morgan · Apex portfolio partner',
    click: [
      'Switch user → Alex Morgan → Client growth: point at “From the launch campaign” (Northstar’s $1,200, marked syncing if Data 360 is still processing).',
      'Switch to the Data Cloud app → Data Explorer → Calculated Insight “Apex Client Premium ARR”: one row per client — the same numbers, in Data 360 itself. (Optional, 3 seconds: Data Streams list — Apex Portal Activity, Apex Opportunity, Apex Campaign Member.)',
      'Next best upsell: tick Meridian and Helix → Create follow-ups in Salesforce → show a Task on the Account.',
      'Agent → “Data 360 · Premium revenue” → “How much Premium revenue have we booked this year, and which clients drove it?”'
    ],
    say: [
      'Now Apex’s side. This is Alex, a portfolio partner, and Alex has one question: who do we call next?',
      'Without Data 360, that answer lives in three places. Who’s using the portal is in the portal’s logs. Who bought is in Salesforce. Who opened the campaign is in Marketing. Someone exports all three every month, stitches them together in a spreadsheet — and by the time it’s done, the moment has passed.',
      'With Data 360, all three land in one place, per client, all the time. That’s this page: what the email earned — Northstar’s $1,200, already here — and who to call next.',
      'And this is Data 360 itself: one model, and Data 360 calculates every client’s Premium revenue once — so the portal, Tableau and the AI all use the same numbers.',
      'And here’s the decision that changes: who do we call next? Meridian and Helix are engaged, the campaign reached them, and they’re still on Standard. One click — and their reps have it in Salesforce, with the numbers to make the call.',
      'And Apex’s leaders ask the same AI: how much Premium revenue have we booked, and who drove it? Answered from Data 360.'
    ],
    captions: ['Without Data 360: 3 systems · 1 spreadsheet · monthly', 'Data 360 · one model per client · always current', 'Data 360 · Data Explorer', 'Activated to Salesforce · Tasks', 'Tableau Pulse on Data 360']
  },
  {
    time: '4:25–5:00',
    title: 'The result — and why it scales',
    as: 'Closing frame',
    click: ['The “everyone wins” graphic (The story, top of /guide) — or back to Client growth.'],
    say: [
      'Apex’s clients got proof of value, peer benchmarks and an AI analyst — at a price they can plan for.',
      'Apex got booked revenue, measured campaign return, and its next deals on reps’ lists — without adding headcount. Every 100 seats is $6,000 a year of new recurring revenue, from software it already pays for.',
      'And this isn’t one firm. Every Tableau customer with a client portal can do this — Salesforce, Data 360 and Tableau, working as one. An account team could pitch it tomorrow.',
      'One click became revenue in Salesforce. Data 360 told Apex who to call next. And the AI behind it costs the same however much it’s used.',
      'Apex’s portal isn’t a cost center anymore. It’s a revenue-generating machine.'
    ],
    captions: ['Salesforce · Data 360 · Tableau — one platform']
  }
];

const PREP = [
  ['Reset', 'Presenter (⌥P) → Switch account → Reset demo. Every take starts from the same baseline.'],
  ['Tabs', 'Portal (localhost:5173) · Salesforce Sales - Console on the Northstar Enterprises Account · Salesforce Campaigns (the launch campaign) · Data Cloud app → Data Explorer, Calculated Insight “Apex Client Premium ARR” already selected.'],
  ['Warm up', 'Sign in as Dana, Sam and Alex once before recording so Needs attention and the Agent are cached and answer fast.'],
  ['Clean screen', 'Close the presenter dock, hide bookmarks, zoom the browser so text is readable at 1080p.']
];

const TIPS = [
  ['Record scene by scene', 'One clip per scene, in order, then stitch. Retakes become cheap and the pacing stays tight.'],
  ['Load before you record', 'Open each page first, then start recording. Cut any Agent “thinking” time in the edit — it’s fine to say “answers in seconds”.'],
  ['Voiceover separately', 'Record the voiceover from this script on its own track; match the clicks to it. At a natural ~140 words a minute it runs about 3:45 — the rest of the 5:00 is clicks and pauses, so don’t rush.'],
  ['Say value, show technology', 'Don’t name the products out loud — add them as on-screen captions (below). Judges credit every name they see without costing you seconds.'],
  ['Land the numbers', '141 people · 5 clients · 20 seats · $5/user · $1,200/yr · every 100 seats = $6,000/yr. Pause a beat after each.'],
  ['The closing line', 'Record the last two sentences until they’re perfect — it’s what judges remember.'],
  ['Data 360 screen timing', 'The portal starts the Data 360 refresh and recomputes the insights by itself — Data Explorer shows a new purchase a few minutes after it’s made (Client growth shows it instantly, marked syncing). Record the Data Explorer clip once it has landed, or show the baseline clients.'],
  ['Live final backup', 'Keep a screen recording of Scenes 4–6 in case a live system is slow on the day.']
];

const CAPTION_STYLE = [
  'Lower-third, bottom-left, white text on a dark translucent bar (or Apex lime on near-black to match the portal).',
  'Show each caption for 3–4 seconds, appearing the moment that piece is on screen.',
  'Short: product name first, then what it’s doing (e.g. “Data 360 · calculated insights”).',
  'Never more than two captions on screen at once.'
];

export default function CompetitionGuide() {
  const words = SCENES.reduce((n, s) => n + s.say.join(' ').split(/\s+/).length, 0);
  return (
    <div className="frame">
      <div className="page">
        <header className="topbar" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
          <Brand to="/login" />
          <span />
          <span style={{ display: 'flex', gap: 8 }}>
            <Link className="btn btn-ghost btn-sm" to="/guide">
              Full demo guide
            </Link>
            <Link className="btn btn-dark btn-sm" to="/login">
              Open the portal
              <Icon name="arrowRight" />
            </Link>
          </span>
        </header>
        <main className="container guide comp">
          <section className="guide-hero">
            <div className="kicker">Competition cut · 5-minute video</div>
            <h1>The portal that pays for itself</h1>
            <p className="lead">
              Problem → demo → result. One client’s decision, one decision changed for Apex, a measured result — and why every account team can pitch it tomorrow.
              <span className="comp-meta">
                {SCENES.length} scenes · ~{words} spoken words · 5:00
              </span>
            </p>
          </section>

          <section className="comp-block">
            <h2>Before every take</h2>
            <ul className="comp-list">
              {PREP.map(([t, d]) => (
                <li key={t}>
                  <b>{t}</b>
                  {d}
                </li>
              ))}
            </ul>
          </section>

          <ol className="scenes comp-scenes">
            {SCENES.map((s, i) => (
              <li key={s.title} className="scene">
                <div className="scene-n">{i + 1}</div>
                <div className="scene-body">
                  <div className="scene-head">
                    <h2>{s.title}</h2>
                    <span className="scene-where">
                      {s.time} · {s.as}
                    </span>
                  </div>
                  <div className="comp-click">
                    <b>Click</b>
                    <ol>
                      {s.click.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ol>
                  </div>
                  <div className="comp-say">
                    <b>Say</b>
                    {s.say.map((l) => (
                      <p key={l}>“{l}”</p>
                    ))}
                  </div>
                  <div className="comp-captions">
                    <b>On-screen text</b>
                    {s.captions.map((c) => (
                      <span key={c} className="comp-cap">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <section className="comp-block comp-d360">
            <h2>Without vs. with Data 360 — the role in plain words</h2>
            <p className="muted">Use this to explain Data 360 to anyone — including yourself before you record. The question is Alex’s: “Who do we call next, and why?”</p>
            <div className="comp-vs">
              <div className="is-without">
                <b>Without Data 360</b>
                <ul>
                  <li>
                    <i>Usage</i> is in the portal’s logs
                  </li>
                  <li>
                    <i>Revenue</i> is in Salesforce
                  </li>
                  <li>
                    <i>Campaign response</i> is in Marketing
                  </li>
                </ul>
                <p>Someone exports all three, stitches them in a spreadsheet once a month. It’s stale on arrival, nobody trusts the numbers, and the AI can’t answer across them — no single place has them all.</p>
              </div>
              <div className="is-with">
                <b>With Data 360</b>
                <ul>
                  <li>All three land in one model per client — continuously</li>
                  <li>Data 360 calculates the answers once: Premium revenue, engagement, campaign reach</li>
                  <li>Everyone uses the same numbers: the portal, Tableau, the Pulse Agent</li>
                  <li>And it acts: the next-best upsell becomes a Task for the rep in Salesforce</li>
                </ul>
                <p>The decision — who to call next — is made the day the signal appears, not at month-end.</p>
              </div>
            </div>
            <h3>One-line version</h3>
            <p className="comp-oneliner">“Salesforce knows who bought. The portal knows who’s using it. Marketing knows who was reached. Data 360 is the only place that knows all three — so it’s the only place that can tell you who to call next.”</p>
          </section>

          <section className="comp-block">
            <h2>Caption sheet (for editing)</h2>
            <p className="muted">Add these as on-screen text over the recording. Name the technology in captions; spend your voice on value.</p>
            <table className="comp-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Scene</th>
                  <th>On-screen text</th>
                </tr>
              </thead>
              <tbody>
                {SCENES.flatMap((s) =>
                  s.captions.map((c, j) => (
                    <tr key={`${s.title}-${c}`}>
                      <td>{j === 0 ? s.time : ''}</td>
                      <td>{j === 0 ? s.title : ''}</td>
                      <td>
                        <span className="comp-cap">{c}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <h3>Caption style</h3>
            <ul className="comp-list">
              {CAPTION_STYLE.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </section>

          <section className="comp-block">
            <h2>Recording tips</h2>
            <ul className="comp-list">
              {TIPS.map(([t, d]) => (
                <li key={t}>
                  <b>{t}</b>
                  {d}
                </li>
              ))}
            </ul>
          </section>

          <section className="comp-block">
            <h2>If a judge asks “is it real?”</h2>
            <ul className="comp-list">
              <li>
                <b>Data 360</b>Data Cloud app → Data Streams (Apex Portal Activity, Opportunity, Campaign Member) → Data Model → Calculated Insights.
              </li>
              <li>
                <b>Pulse on Data 360</b>Tableau Cloud → the “Apex Client Growth … (Data 360)” data sources and the Apex Premium Revenue / Portal Engagement metrics.
              </li>
              <li>
                <b>Who sees what</b>Presenter → Under the hood: each person’s sign-in token, with their company and their own tier.
              </li>
              <li>
                <b>Seeded data</b>The 30-day portal history and two earlier seat purchases are seeded; everything clicked in the video happens live.
              </li>
            </ul>
          </section>
        </main>
      </div>
    </div>
  );
}
