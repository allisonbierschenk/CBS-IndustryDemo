// Full-screen closing frame for the competition video: matches Scene 7's lines. Open /guide/close, press F (or ⌘⇧F) for full screen.
import { Brand } from '../components/TopBar.jsx';

const WINS = [
  ['Apex’s clients', ['Proof of the value Apex delivers', 'Benchmarks against their peers', 'An AI analyst', 'A price they can plan for']],
  ['Apex', ['Booked revenue, measured campaign return', 'Its next deals already on reps’ lists', 'Time back: no month-end spreadsheets', 'No new headcount']],
  ['Salesforce + Tableau', ['Salesforce, D360 and Tableau working as one platform', 'AI included with Tableau+, unmetered', 'More seats, more data, more platform in use']]
];

export default function ClosingSlide() {
  return (
    <div className="close-slide">
      <div className="close-brand">
        <Brand to="/guide/competition" />
      </div>
      <div className="close-kicker">What changed</div>
      <h1>
        The portal isn’t a cost center anymore.
        <br />
        <span>It’s a revenue-generating machine.</span>
      </h1>
      <div className="close-wins">
        {WINS.map(([who, items]) => (
          <section key={who}>
            <b>{who}</b>
            <ul>
              {items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <ol className="close-loop" aria-label="The loop">
        {['Campaign', 'Client experience', 'Upgrade', 'Revenue in Salesforce', 'D360 insight', 'Next deal'].map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </div>
  );
}
