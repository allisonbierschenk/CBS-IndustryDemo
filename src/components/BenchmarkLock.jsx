// Premium upsell drawn over the benchmarks tile inside the embedded dashboard (Standard clients only).
// Cosmetic: the real Premium enforcement is the server-gated /benchmarks page.
import { Link } from 'react-router-dom';
import { useContact } from '../context/ContactContext.jsx';
import { useSession } from '../context/SessionContext.jsx';
import Icon from './Icon.jsx';
import InfoTip from './InfoTip.jsx';

export default function BenchmarkLock({ compact = false }) {
  const { me } = useSession();
  const contact = useContact();
  const price = me.features?.benchmarks?.price;
  return (
    <div className={`bench-lock${compact ? ' is-compact' : ''}`}>
      <span className="bench-lock-ic">
        <Icon name="lock" />
      </span>
      <div className="bench-lock-title">
        <b>Unlock Industry Benchmarks</b>
        <InfoTip kind="premium" label="Why Tableau for Premium analytics" />
      </div>
      <p>See how {me.tenant.shortName} ranks against anonymized {me.tenant.industry.toLowerCase()} peers.</p>
      {price && (
        <div className="bench-lock-price">
          <span>{price}</span> with Premium
        </div>
      )}
      <div className="bench-lock-actions">
        <button
          className="btn btn-lime btn-sm"
          onClick={() => contact('Premium subscription', `We'd like to upgrade ${me.tenant.clientName} to Premium${price ? ` (${price})` : ''} to unlock Industry Performance Benchmarks.`)}
        >
          Upgrade
        </button>
        <Link className="btn btn-ghost-light btn-sm" to="/benchmarks">
          What’s included
        </Link>
      </div>
    </div>
  );
}
