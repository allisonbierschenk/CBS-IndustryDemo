// Engagement cards — scope of each engagement, with real actions:
//  • "View in dashboard" filters the embedded Value Intelligence dashboard to that engagement.
//  • Engagements with an operational dashboard also link to it.
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';

const ROUTES = { transportation: '/transportation' };

export default function EngagementCards({ me, onView }) {
  return (
    <div className="eng-grid">
      {me.tenant.engagements.map((e) => {
        const linked = e.analytics && me.views[e.analytics]?.entitled && ROUTES[e.analytics];
        return (
          <article key={e.name} className={`eng${linked ? ' feature' : ''}`}>
            <div className="eng-ic">
              <Icon name={e.icon} />
            </div>
            <h4>{e.name}</h4>
            <p>{e.description}</p>
            <div className="eng-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => onView?.(e)}>
                <Icon name="chart" />
                View in dashboard
              </button>
              {linked && (
                <Link className="btn btn-dark btn-sm" to={ROUTES[e.analytics]}>
                  {e.analyticsLabel}
                  <Icon name="arrowRight" />
                </Link>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
