// Competition cut — the 5-minute video script ("The portal that pays for itself"): per scene the time, what to
// click, the voiceover, and the technology captions to add as on-screen text while editing. Plus prep and recording tips.
import { Link } from 'react-router-dom';
import { Brand } from '../components/TopBar.jsx';
import Icon from '../components/Icon.jsx';

// Each scene is a list of beats: what to click (left) next to the line you say while doing it (right),
// plus any on-screen caption to add over that beat in editing.
const SCENES = [
  {
    time: '0:00–0:25',
    title: 'The hook',
    as: 'Portal',
    beats: [
      {
        do: 'Portal Home, signed in as Dana (Northstar’s logo on screen). Don’t click yet.',
        say: 'Most client portals show clients the most valuable thing a company has, its data, and give it away for free.'
      },
      {
        do: 'Stay on Home.',
        say: 'Apex Consulting runs on Salesforce and Tableau. In this demo, you’ll see those products, working together, turn its portal into a revenue-generating machine: Tableau gives clients the experience, Salesforce runs the campaign and the sale, and D360 connects them, so Apex’s teams stop pulling reports together and spend that time with the clients most ready to buy.',
        cap: ['Apex Consulting · Salesforce + Tableau customer', 'Tableau · Salesforce · D360']
      }
    ]
  },
  {
    time: '0:25–0:45',
    title: 'The problem',
    as: 'Salesforce',
    beats: [
      {
        do: 'Switch to the Salesforce tab: Campaigns → “Partner portal update: conversational analytics + anonymized benchmarks”.',
        say: 'Apex recently added two things clients have been asking for to its portal: the ability to ask questions about their own data, which clients now expect, and anonymized benchmarks that show how they compare to their peers.'
      },
      {
        do: 'Scroll to Campaign Members (141) and the Sent / Opened / Clicked numbers.',
        say: 'Then Apex announced it with a Salesforce marketing campaign: one email, sent to 141 people across Apex’s five clients.',
        cap: ['Salesforce Marketing · Campaign']
      }
    ]
  },
  {
    time: '0:45–1:40',
    title: 'The client’s decision',
    as: 'Dana Whitfield · Northstar (Standard)',
    beats: [
      {
        do: 'Back to the portal (Dana) → Home: point at the Needs attention summary.',
        say: 'This is Dana, VP of Operations at Northstar, one of the people who got that email. When she signs in, Tableau Pulse tells her what needs attention: on-time milestones, value realization and engagement health have been trending down for months, while Northstar’s consulting spend keeps rising.',
        cap: ['Tableau Pulse · Needs attention']
      },
      {
        do: 'Click Value Intelligence (top nav) → scroll to the blurred, locked Industry Benchmarks tile.',
        say: 'This is her own Tableau dashboard, embedded in Apex’s portal, showing Northstar’s numbers and nobody else’s. In the same dashboard are the benchmarks she can’t see yet.',
        cap: ['Tableau Embedded · row-level security']
      },
      {
        do: 'Hover the Agent icon with the lock badge (nav or a Take action row on Home).',
        say: 'To ask questions about her data or compare Northstar to its peers, she needs Premium. So her decision is simple: is it worth paying for?'
      }
    ]
  },
  {
    time: '1:40–2:20',
    title: 'One click, booked revenue',
    as: 'Dana → Salesforce',
    beats: [
      {
        do: 'Click Agent → Upgrade your team → point at “Used … times” next to each name → click All managers (20) → Upgrade 20 people.',
        say: 'Dana decides it is, but only for her 20 managers. D360 shows her how often each of her managers uses the portal, so she knows who will get value from it. At five dollars per user per month, that’s $1,200 a year, in one click.',
        cap: ['D360 · portal use per person']
      },
      {
        do: 'Switch to Salesforce → click the bell 🔔 (“Northstar Enterprises bought 20 Premium seats — +$1,200/yr”, with the D360 line underneath) → it opens the Opportunity.',
        say: 'Now look at Salesforce. Apex’s account rep has already been notified, and D360 adds what’s behind the sale: forty Northstar people have been active in the portal this month, and the campaign reached all of them. In Sales Cloud the opportunity is closed-won and credited to the campaign, before Dana has even closed the window.',
        cap: ['Salesforce notification', 'Salesforce Sales Cloud · Opportunity · campaign attribution']
      },
      {
        do: 'Stay on the Opportunity (20 seats, Dana as decision maker, the campaign).',
        say: 'Apex’s portal just made a sale on its own.'
      }
    ]
  },
  {
    time: '2:20–2:55',
    title: 'The client gets the value — at a predictable cost',
    as: 'Sam Patel · Northstar manager (now Premium)',
    beats: [
      {
        do: 'Portal → Presenter (⌥P) → Switch user → Sam Patel → on Home, click “Which engagement is furthest behind plan, and why?” under Try asking.',
        say: 'Sam is one of those 20 managers, so he has Premium now. He asks the Tableau Pulse agent which engagement is furthest behind plan and why, and he gets a plain-English answer built from Northstar’s own numbers.',
        cap: ['Tableau Pulse Agent']
      },
      {
        do: 'Let the answer and its insight cards show.',
        say: 'Apex can offer this to every client because the AI, built on the Einstein Trust Layer, is included with Tableau+ and unmetered: a predictable cost for Apex, and a predictable price for its clients.',
        cap: ['Einstein Trust Layer', 'Included with Tableau+ · unmetered']
      }
    ]
  },
  {
    time: '2:55–4:15',
    title: 'The decision that changes for Apex',
    as: 'Apex’s account team · Salesforce',
    beats: [
      {
        do: 'Switch to Salesforce (Sales - Console) → Home: the embedded Tableau Next dashboard “Apex Client Growth (D360)”.',
        say: 'Now let’s look at Apex’s side, in Salesforce, where Apex’s account team works. This dashboard is Tableau Next, built on D360, which brings together who uses the portal, who pays for Premium, and who the campaign reached.',
        cap: ['Tableau Next on D360 · embedded in Salesforce']
      },
      {
        do: 'Point at the top two charts side by side: Premium Revenue by Client (left) and Portal Engagement by Client (right).',
        say: 'Look at these two charts side by side. Northstar is Apex’s most engaged client, and until a minute ago it didn’t pay for Premium. Meridian is next: it uses the portal heavily, the campaign reached it, and it’s still on Standard.'
      },
      {
        do: 'Switch to the Data Cloud tab → Data Streams (searched for “Apex”): Apex_Portal_Activity, Apex_Opportunity, Apex_CampaignMember side by side.',
        say: 'Without D360, nobody would see that, because usage, revenue and the campaign live in three different systems. Here they are in D360: three streams, combined into one model per client and kept up to date automatically.',
        cap: ['D360 · three sources, one model']
      },
      {
        do: 'Back to Sales - Console → Meridian Solutions Account → Activity (or the To Do List at the bottom): the task “Upsell Premium — Meridian Solutions is engaged and on Standard”.',
        say: 'And D360 doesn’t just show it, it acts on it. Meridian’s account manager already has a follow-up task in Salesforce, with the numbers to start the conversation. That’s time the team used to spend pulling reports, now spent with the clients most ready to buy.',
        cap: ['D360 → Salesforce · follow-up task']
      }
    ]
  },
  {
    time: '4:15–5:00',
    title: 'The result — and why it scales',
    as: 'Closing frame',
    beats: [
      {
        do: 'Cut to the “everyone wins” graphic (The story, top of /guide).',
        say: 'So here’s what changed. Apex’s clients got proof of value, peer benchmarks and an AI analyst, at a price they can plan for.'
      },
      {
        do: 'Hold on the graphic.',
        say: 'Apex got booked revenue and a measurable return on its campaign. And its people got time back: clients answer their own questions instead of waiting on an analyst, no one has to stitch spreadsheets together at month-end, and reps get their next call handed to them.'
      },
      {
        do: 'Hold on the graphic.',
        say: 'And most Tableau customers with a client portal could do the same, with Salesforce, D360 and Tableau working as one platform.',
        cap: ['Salesforce · D360 · Tableau — one platform']
      },
      {
        do: 'Hold — end on the line.',
        say: 'Apex’s portal isn’t a cost center anymore. It’s a revenue-generating machine.'
      }
    ]
  }
];

const PREP = [
  ['Reset', 'Presenter (⌥P) → Switch account → Reset demo. Every take starts from the same baseline.'],
  ['Tabs', 'Portal (localhost:5173) · Salesforce Sales - Console: Home with the embedded Tableau Next dashboard “Apex Client Growth (D360)”, plus the Meridian Solutions Account · Salesforce Campaigns (the launch campaign) · Data Cloud → Data Streams, searched for “Apex”.'],
  ['Warm up', 'Sign in as Dana and Sam once before recording so Needs attention and the Agent are cached and answer fast. After Reset demo, D360 recreates the follow-up tasks for its most engaged non-paying clients within minutes.'],
  ['Clean screen', 'Close the presenter dock, hide bookmarks, zoom the browser so text is readable at 1080p.']
];

const TIPS = [
  ['Record scene by scene', 'One clip per scene, in order, then stitch. Retakes become cheap and the pacing stays tight.'],
  ['Load before you record', 'Open each page first, then start recording. Cut any Agent “thinking” time in the edit — it’s fine to say “answers in seconds”.'],
  ['Voiceover separately', 'Record the voiceover from this script on its own track; match the clicks to it. At a natural ~140 words a minute it runs about 3:45 — the rest of the 5:00 is clicks and pauses, so don’t rush.'],
  ['Name the product as it works', 'Each line names its product at the moment it does something — “Tableau Pulse tells her…”, “D360 brings all three together…”. Say the name clearly; don’t stop to explain it. The dark chips under each click are the product for that step, and double as optional on-screen captions.'],
  ['Land the numbers', '141 people · 5 clients · 20 seats · $5/user · $1,200/yr · every 100 seats = $6,000/yr. Pause a beat after each.'],
  ['The closing line', 'Record the last two sentences until they’re perfect — it’s what judges remember.'],
  ['D360 screen timing', 'The portal starts the D360 refresh and recomputes the insights by itself — Data Explorer shows a new purchase a few minutes after it’s made (Client growth shows it instantly, marked syncing). Record the Data Explorer clip once it has landed, or show the baseline clients.'],
  ['Dates stay current', 'The portal’s demo clock keeps the story fresh by itself: the campaign is always “sent last week” and in progress, and the seeded 30-day history always ends today. Nothing to update before a take.'],
  ['Check what needs attention', 'Needs attention is live Tableau Pulse output, so its wording can change as the data moves. Sign in as Dana before recording and make sure the Scene 3 line still matches the summary (currently: On-Time Milestone Rate, Value Realization Rate and Engagement Health trending down; Consulting Investment trending up). Say only what’s on screen.'],
  ['Live final backup', 'Keep a screen recording of Scenes 4–6 in case a live system is slow on the day.']
];

const CAPTION_STYLE = [
  'Lower-third, bottom-left, white text on a dark translucent bar (or Apex lime on near-black to match the portal).',
  'Show each caption for 3–4 seconds, appearing the moment that piece is on screen.',
  'Short: product name first, then what it’s doing (e.g. “D360 · calculated insights”).',
  'Never more than two captions on screen at once.'
];

export default function CompetitionGuide() {
  const words = SCENES.reduce((n, s) => n + s.beats.map((b) => b.say).join(' ').split(/\s+/).length, 0);
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
                  <div className="comp-beats">
                    <div className="comp-beats-head">
                      <span>Click</span>
                      <span>Say</span>
                    </div>
                    {s.beats.map((b, k) => (
                      <div key={k} className="comp-beat">
                        <div className="comp-do">
                          <span className="comp-step">{k + 1}</span>
                          <span>
                            {b.do}
                            {b.cap?.length > 0 && (
                              <span className="comp-beat-caps">
                                {b.cap.map((c) => (
                                  <span key={c} className="comp-cap">
                                    {c}
                                  </span>
                                ))}
                              </span>
                            )}
                          </span>
                        </div>
                        <p className="comp-line">“{b.say}”</p>
                      </div>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <section className="comp-block comp-d360">
            <h2>Without vs. with D360 — the role in plain words</h2>
            <p className="muted">Use this to explain D360 to anyone — including yourself before you record. The question is the account team’s: “Which clients are ready to buy, and how would we know?”</p>
            <div className="comp-vs">
              <div className="is-without">
                <b>Without D360</b>
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
                <b>With D360</b>
                <ul>
                  <li>All three land in one model per client — continuously</li>
                  <li>D360 calculates the answers once: Premium revenue, engagement, campaign reach</li>
                  <li>Everyone uses the same numbers: the portal, Tableau, the Pulse Agent</li>
                  <li>And it acts: the next-best upsell becomes a Task for the rep in Salesforce</li>
                </ul>
                <p>Both questions are answered the day the signal appears, not after days of reporting.</p>
              </div>
            </div>
            <h3>One-line version</h3>
            <p className="comp-oneliner">“Salesforce knows who bought. The portal knows who’s using it. Marketing knows who was reached. D360 is the only place that knows all three, so it’s the only place that can tell Apex what its marketing earned and where its next revenue will come from.”</p>
          </section>

          <section className="comp-block">
            <h2>Product by step (optional captions)</h2>
            <p className="muted">Where each product is named in the voiceover. If you add on-screen text later, use these.</p>
            <table className="comp-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Scene</th>
                  <th>At</th>
                  <th>On-screen text</th>
                </tr>
              </thead>
              <tbody>
                {SCENES.flatMap((s) =>
                  s.beats
                    .flatMap((b, k) => (b.cap || []).map((c) => ({ c, k })))
                    .map(({ c, k }, j) => (
                      <tr key={`${s.title}-${c}`}>
                        <td>{j === 0 ? s.time : ''}</td>
                        <td>{j === 0 ? s.title : ''}</td>
                        <td>Step {k + 1}</td>
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
                <b>D360</b>Data Cloud app → Data Streams (Apex Portal Activity, Opportunity, Campaign Member) → Data Model → Calculated Insights.
              </li>
              <li>
                <b>Pulse on D360</b>Tableau Cloud → the “Apex Client Growth … (Data 360)” data sources and the Apex Premium Revenue / Portal Engagement metrics.
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
