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
  const { pathname } = useLocation();
  const onDashboards = pathname === '/dashboards';

  return (
    <header className="topbar">
      <Brand />
      <nav className="nav" aria-label="Main">
        <NavLink to="/agent">
          <Icon name="agent" className="nav-ic" />
          Agent
          {!me.features?.agent && <Icon name="lock" className="lock" />}
        </NavLink>
        <Link to="/dashboards" aria-current={onDashboards ? 'page' : undefined}>
          Value Intelligence
        </Link>
        {me.views.transportation?.entitled && <NavLink to="/transportation">Transportation</NavLink>}
        <NavLink to="/reports">Reports</NavLink>
        {me.features?.apexGrowth && <NavLink to="/growth">Client growth</NavLink>}
        <NavLink to="/benchmarks">
          Industry Benchmarks
          {!me.entitlements.includes('benchmarks') && <Icon name="lock" className="lock" />}
        </NavLink>
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
