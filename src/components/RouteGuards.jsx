import { Link, Navigate } from 'react-router-dom';
import { useSession } from '../context/SessionContext.jsx';
import Icon from './Icon.jsx';

export function RequireAuth({ children }) {
  const { status } = useSession();
  if (status !== 'authenticated') return <Navigate to="/login" replace />;
  return children;
}

// UX guard only — the server independently refuses URLs/tokens for un-entitled views,
// and Tableau permissions are the final enforcement layer.
export function RequireView({ view, children }) {
  const { me } = useSession();
  if (me.views[view]?.entitled) return children;
  return (
    <div className="container">
      <section className="section" style={{ maxWidth: 640 }}>
        <div className="kicker">Not available</div>
        <h1 className="section-title" style={{ margin: '10px 0' }}>
          This analytics experience isn’t part of {me.tenant.clientName}’s portal
        </h1>
        <p className="muted">
          Detailed operational dashboards are provisioned per engagement. Your Value Intelligence Dashboard covers every active
          engagement.
        </p>
        <Link className="btn btn-dark" to="/dashboards">
          <Icon name="arrowLeft" />
          Back to Value Intelligence
        </Link>
      </section>
    </div>
  );
}
