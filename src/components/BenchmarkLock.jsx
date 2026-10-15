// Premium upsell drawn over the benchmarks tile inside the embedded dashboard (Standard clients only).
// Cosmetic: the real Premium enforcement is the server-gated /benchmarks page.
import { useSession } from '../context/SessionContext.jsx';
import Icon from './Icon.jsx';
import InfoTip from './InfoTip.jsx';
import UpgradeButton from './UpgradeButton.jsx';

export default function BenchmarkLock({ compact = false }) {
  const { me } = useSession();
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
        <UpgradeButton />
        <UpgradeButton className="btn btn-ghost-light btn-sm" label="What’s included" intent="learn" />
      </div>
    </div>
  );
}
