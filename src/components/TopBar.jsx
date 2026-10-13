import { Link, NavLink, useLocation } from 'react-router-dom';
import { useContact } from '../context/ContactContext.jsx';
import { useSession } from '../context/SessionContext.jsx';
import AccountMenu from './AccountMenu.jsx';
import Icon from './Icon.jsx';
import TierBadge from './TierBadge.jsx';

export function Brand({ to = '/' }) {
  return (
    <Link className="brand" to={to} aria-label="Apex Consulting home">
      <img src="/img/apex-mark.svg" alt="" />
      <span>
        Apex.<small>Client Value Intelligence</small>
      </span>
    </Link>
  );
}

// Navigation is derived from server-resolved entitlements in /api/me.
// Industry Benchmarks lives inside the Value Intelligence dashboard, so it's an in-page link.
export default function TopBar() {
  const { me } = useSession();
  const contact = useContact();
  const { pathname, hash } = useLocation();
  const onDashboards = pathname === '/dashboards';
  const onBenchmarks = onDashboards && hash === '#benchmarks';

  return (
    <header className="topbar">
      <Brand />
      <nav className="nav" aria-label="Main">
        <NavLink to="/agent">
          <Icon name="agent" className="nav-ic" />
          Agent
        </NavLink>
        <Link to="/dashboards" aria-current={onDashboards && !onBenchmarks ? 'page' : undefined}>
          Value Intelligence
        </Link>
        {me.views.transportation?.entitled && <NavLink to="/transportation">Transportation</NavLink>}
        <Link to={{ pathname: '/dashboards', hash: '#benchmarks' }} aria-current={onBenchmarks ? 'page' : undefined}>
          Industry Benchmarks
          {!me.entitlements.includes('benchmarks') && <Icon name="lock" className="lock" />}
        </Link>
      </nav>
      <div className="topbar-right">
        <button className="btn btn-dark btn-sm" onClick={() => contact()}>
          <Icon name="mail" />
          Contact Apex
        </button>
        <TierBadge tier={me.tenant.tier} />
        <AccountMenu />
      </div>
    </header>
  );
}
