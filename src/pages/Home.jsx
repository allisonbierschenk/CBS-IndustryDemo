// Landing page after sign-in: choose how to work — chat with the agent or use the BI dashboards.
import { Link } from 'react-router-dom';
import { useSession } from '../context/SessionContext.jsx';
import AttentionPanel from '../components/AttentionPanel.jsx';
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
          <Link to="/agent" className={`choice choice-agent${me.features?.agent ? '' : ' is-locked'}`}>
            <span className="choice-ic">
              <Icon name="agent" />
              {!me.features?.agent && <span className="lock-badge" aria-hidden="true"><Icon name="lock" /></span>}
            </span>
            <span className="choice-copy">
              <b>
                Ask the agent{!me.features?.agent && <span className="mini-tier premium choice-badge">Premium</span>}
              </b>
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
        {me.features?.agentQuestions?.length > 0 && (
          <div className="home-asks">
            <span className="home-asks-label">
              <Icon name="agent" />
              Try asking
            </span>
            {me.features.agentQuestions.map(({ q, source }) => (
              <Link key={q} className="chip-q" to={`/agent?q=${encodeURIComponent(q)}${source ? `&source=${encodeURIComponent(source)}` : ''}`}>
                {q}
                <Icon name="arrowRight" />
              </Link>
            ))}
          </div>
        )}
      </section>
      <AttentionPanel />
    </div>
  );
}
