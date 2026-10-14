// How the Agent's AI works, stated on the page: Pulse computes the facts deterministically, its AI explains
// them (grounded in governed metrics), and there are no tokens or unknown costs (Pulse AI is included in the license, unmetered).
// Kept to one quiet line under the page intro; each point's detail is its hover text (full story in the (i)).
import Icon from './Icon.jsx';

const POINTS = [
  {
    icon: 'target',
    title: 'Deterministic insights',
    text: 'Changes, drivers and outliers are computed by Tableau’s statistical insights engine on governed metrics — the same data always gives the same facts.'
  },
  {
    icon: 'database',
    title: 'Grounded in governed metrics',
    text: 'Pulse’s AI explains insights Tableau has already computed from your governed metrics — it never analyzes raw data, so every number matches your dashboard.'
  },
  {
    icon: 'shield',
    title: 'No tokens, no unknown costs',
    text: 'Pulse’s AI is included in the Tableau license and unmetered, so pricing stays predictable however many questions you ask.'
  }
];

export default function PulseAiNote() {
  return (
    <ul className="ai-note" aria-label="How the Agent's AI works">
      {POINTS.map((p) => (
        <li key={p.title} title={p.text}>
          <Icon name={p.icon} />
          {p.title}
        </li>
      ))}
    </ul>
  );
}
