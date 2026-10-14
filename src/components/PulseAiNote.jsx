// How the Agent's AI works, stated on the page: an LLM writes the words, Pulse computes the facts
// deterministically, and there are no tokens or unknown costs (Pulse AI is included in the license, unmetered).
// Kept to one quiet line under the page intro; each point's detail is its hover text (full story in the (i)).
import Icon from './Icon.jsx';

const POINTS = [
  {
    icon: 'target',
    title: 'Deterministic insights',
    text: 'Changes, drivers and outliers are computed by Tableau’s statistical insights engine on governed metrics — the same data always gives the same facts.'
  },
  {
    icon: 'agent',
    title: 'LLM writes the words, not the numbers',
    text: 'Pulse’s language model only phrases those insights. It never analyzes your data, so it can’t invent a figure.'
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
