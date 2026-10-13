// Landing page after sign-in: choose how to work — chat with the agent or use the BI dashboards.
import { Link } from 'react-router-dom';
import { useSession } from '../context/SessionContext.jsx';
import Icon from '../components/Icon.jsx';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const { me } = useSession();

  return (
    <div className="container">
      <section className="choose">
        <div className="kicker">
          {greeting()}, {me.user.name.split(' ')[0]}
        </div>
        <h1>How would you like to explore {me.tenant.shortName}&apos;s results?</h1>

        <div className="choose-grid">
          <Link to="/agent" className="choice choice-agent">
            <span className="choice-ic">
              <Icon name="agent" />
            </span>
            <span className="choice-copy">
              <b>Ask the agent</b>
              <span>Ask questions about your engagements in plain language.</span>
            </span>
            <span className="arrow-chip">
              <Icon name="arrowRight" />
            </span>
          </Link>

          <Link to="/dashboards" className="choice choice-dash">
            <span className="choice-ic">
              <Icon name="dashboard" />
            </span>
            <span className="choice-copy">
              <b>Open dashboards</b>
              <span>
                Value Intelligence
                {me.views.transportation?.entitled ? `, ${me.views.transportation.title}` : ''} and industry benchmarks.
              </span>
            </span>
            <span className="arrow-chip">
              <Icon name="arrowRight" />
            </span>
          </Link>
        </div>
      </section>
    </div>
  );
}
