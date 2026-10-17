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
    time: '0:25–0:50',
    title: 'The problem',
    as: 'Salesforce',
    click: ['Salesforce → Campaigns → “Partner portal update: conversational analytics + anonymized benchmarks”.', 'Show the 141 Campaign Members and the Sent / Opened / Clicked funnel.'],
    say: [
      'Apex had two problems. Its clients couldn’t see the value Apex delivers. And Apex couldn’t tell which clients would pay for more — or what its marketing actually earned.',
      'So Apex upgraded its portal, and sent one email to 141 people across its five clients: you can now ask your data anything, and see how you compare to your peers.'
    ],
    captions: ['Salesforce Marketing · Campaign']
  },
  {
    time: '0:50–1:35',
    title: 'The client’s decision',
    as: 'Dana Whitfield · Northstar (Standard)',
    click: ['Sign in as Dana → Home: point at Needs attention (Operational Transformation off track).', 'Hover the locked Agent icon on a Take action row.', 'Show the blurred Industry Benchmarks tile.'],
    say: [
      'This is Dana, VP of Operations at Northstar. She logs in and doesn’t have to go looking — the portal tells her Operational Transformation is off track, why, and what was expected.',
      'Now she wants to ask why — and know how Northstar compares to its peers. That’s Premium. And the decision she’s making is simple: is this worth paying for?'
    ],
    captions: ['Tableau Pulse · Needs attention', 'Tableau Embedded · row-level security']
  },
  {
    time: '1:35–2:20',
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
    time: '2:20–3:00',
    title: 'The client gets the value — at a predictable cost',
    as: 'Sam Patel · Northstar manager (now Premium)',
    click: ['Switch user → Sam Patel → Agent → “Which engagement is furthest behind plan, and why?” → the answer.'],
    say: [
      'Sam is one of those managers. He just got an analyst — plain-English answers from Northstar’s own governed numbers.',
      'And this is why Apex can offer it to every client: the AI is included with Tableau+ and unmetered. No per-question bill. A predictable cost for Apex — and a predictable price for its clients.'
    ],
    captions: ['Tableau Pulse Agent', 'Einstein Trust Layer', 'Included with Tableau+ · unmetered']
  },
  {
    time: '3:00–4:15',
    title: 'The decision that changes for Apex',
    as: 'Alex Morgan · Apex portfolio partner',
    click: [
      'Switch user → Alex Morgan → Client growth: point at “From the launch campaign” (Northstar’s $1,200, marked syncing if Data 360 is still processing).',
      'Next best upsell: tick Meridian and Helix → Create follow-ups in Salesforce → show a Task on the Account.',
      'Agent → “Data 360 · Premium revenue” → “How much Premium revenue have we booked this year, and which clients drove it?”'
    ],
    say: [
      'Now Apex’s side. This is Alex, a portfolio partner. Before, three systems knew three different things: the portal knew usage, Salesforce knew revenue, the campaign knew reach. Nobody could connect them.',
      'Data 360 connects them — one view per client. So Alex can see what that one email earned: Northstar’s $1,200, already here.',
      'And here’s the decision that changes: who do we call next? Meridian and Helix are engaged, the campaign reached them, and they’re still on Standard. One click — and their reps have it in Salesforce, with the numbers to make the call.',
      'Apex’s leaders ask the same AI the same way: how much Premium revenue have we booked, and who drove it? Tableau answers — from Data 360.'
    ],
    captions: ['Data 360 · streams → data model → calculated insights', 'Activated to Salesforce · Tasks', 'Tableau Pulse on Data 360']
  },
  {
    time: '4:15–5:00',
    title: 'The result — and why it scales',
    as: 'Closing frame',
    click: ['The “everyone wins” graphic (The story, top of /guide) — or back to Client growth.'],
    say: [
      'Here’s what changed in five minutes.',
      'Apex’s clients got proof of value, peer benchmarks and an AI analyst — at a price they can plan for.',
      'Apex got booked revenue, measured campaign return, and its next deals on reps’ lists — without adding headcount. Every 100 seats is $6,000 a year of new recurring revenue, from software it already pays for.',
      'And this isn’t one firm. Every Tableau customer with a client portal can do this — Salesforce, Data 360 and Tableau, working as one. An account team could pitch it tomorrow.',
      'One click by a client became revenue in Salesforce. Data 360 told Apex who to call next. And the AI behind it costs the same no matter how much it’s used.',
      'Apex’s portal isn’t a cost center anymore. It’s a revenue-generating machine.'
    ],
    captions: ['Salesforce · Data 360 · Tableau — one platform']
  }
];

const PREP = [
  ['Reset', 'Presenter (⌥P) → Switch account → Reset demo. Every take starts from the same baseline.'],
  ['Tabs', 'Portal (localhost:5173) · Salesforce Sales - Console on the Northstar Enterprises Account · Salesforce Campaigns (the launch campaign).'],
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
