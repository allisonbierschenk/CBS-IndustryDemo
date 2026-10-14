// How the Agent's AI works, stated on the page: Pulse computes the facts deterministically, its built-in AI
// (on the Einstein Trust Layer) explains them, and there are no tokens or unknown costs (Pulse AI is included in the license, unmetered).
// Kept to one quiet line under the page intro; each point's detail is its hover text (full story in the (i)).
import Icon from './Icon.jsx';

const POINTS = [
  {
    icon: 'target',
    title: 'Deterministic insights',
    text: 'Changes, drivers and outliers are computed by Tableau’s statistical insights engine on your governed metrics — the same data always gives the same facts, and every number matches your dashboard.'
  },
  {
    icon: 'shield',
    title: 'Built-in AI, on the Einstein Trust Layer',
    text: 'Pulse’s AI is built into Tableau and runs on the Einstein Trust Layer — trusted AI that doesn’t compromise data security or privacy. It describes insights Tableau has already computed; it never analyzes your raw data.'
  },
  {
    icon: 'check',
    title: 'LLM included: no tokens, no unknown costs',
    text: 'Pulse’s AI is included with Tableau+ and unmetered, so pricing stays predictable however many questions you ask.'
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
