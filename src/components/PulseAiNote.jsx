// How the Agent's AI works, stated on the page: an LLM writes the words, Pulse computes the facts
// deterministically, and there are no tokens or unknown costs (Pulse AI is included in the license, unmetered).
import Icon from './Icon.jsx';

const POINTS = [
  {
    icon: 'target',
    title: 'Deterministic insights',
    text: 'Changes, drivers and outliers are computed by Tableau’s statistical insights engine on governed metrics — the same data always gives the same facts.'
  },
  {
    icon: 'agent',
    title: 'The LLM writes the words, not the numbers',
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
    <div className="ai-note" role="note" aria-label="How the Agent's AI works">
      {POINTS.map((p) => (
        <div key={p.title}>
          <Icon name={p.icon} />
          <span>
            <b>{p.title}</b>
            {p.text}
          </span>
        </div>
      ))}
    </div>
  );
}
