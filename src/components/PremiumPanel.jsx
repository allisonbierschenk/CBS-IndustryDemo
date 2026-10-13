// Industry Performance Benchmarks status card.
//  • Premium: points to the benchmarks panel inside the Value Intelligence dashboard.
//  • Standard: explains what's included with Premium and opens a pre-filled request to the Apex team.
import { useContact } from '../context/ContactContext.jsx';
import Icon from './Icon.jsx';

export default function PremiumPanel({ me, onViewBenchmarks }) {
  const contact = useContact();
  const premium = me.entitlements.includes('benchmarks');
  const t = me.tenant;
  const peers = `${t.industry.toLowerCase()} peer group`;

  return (
    <div className={`bench-card${premium ? ' is-premium' : ''}`}>
      <div className="bench-ic">
        <Icon name={premium ? 'star' : 'lock'} />
      </div>
      <div className="bench-copy">
        <h3>{premium ? 'Included in your Premium subscription' : 'Available with Premium'}</h3>
        <p>
          {premium
            ? `Your Industry Performance Benchmarks panel compares ${t.shortName}'s results with an anonymized ${peers}.`
            : `Industry Performance Benchmarks compare your results with an anonymized ${peers}: peer percentile rankings, improvement opportunities and advisory recommendations. They aren't part of your Standard subscription.`}
        </p>
      </div>
      {premium ? (
        <button className="btn btn-dark" onClick={onViewBenchmarks}>
          Go to benchmarks
          <Icon name="arrowRight" />
        </button>
      ) : (
        <button
          className="btn btn-dark"
          onClick={() =>
            contact('Premium subscription', `We'd like to learn more about adding Industry Performance Benchmarks for ${t.clientName}.`)
          }
        >
          Ask about Premium
        </button>
      )}
    </div>
  );
}
