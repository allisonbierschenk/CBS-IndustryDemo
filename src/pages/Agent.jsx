// Agent — chat entry point. No agent backend is wired up yet, so the composer is disabled and the
// page says so plainly (same honesty rule as unconfigured Tableau views).
import { Link } from 'react-router-dom';
import { useSession } from '../context/SessionContext.jsx';
import Crumbs from '../components/Crumbs.jsx';
import Icon from '../components/Icon.jsx';

export default function Agent() {
  const { me } = useSession();

  return (
    <div className="container">
      <Crumbs items={[{ label: 'Home', to: '/' }, { label: 'Agent' }]} />
      <div className="page-head">
        <div>
          <h1>Agent</h1>
          <p className="lead">Ask questions about {me.tenant.shortName}&apos;s engagements and results.</p>
        </div>
        <Link className="btn btn-ghost" to="/dashboards">
          <Icon name="dashboard" />
          Open dashboards instead
        </Link>
      </div>

      <div className="chat">
        <div className="chat-body">
          <div className="placeholder">
            <b>Agent not connected yet</b>
            <div>
              The chat agent for this portal hasn&apos;t been configured. Your dashboards are available in the meantime.
            </div>
          </div>
        </div>
        <form className="chat-composer" onSubmit={(e) => e.preventDefault()}>
          <input className="input" disabled placeholder="Ask a question about your engagements…" aria-label="Message the agent" />
          <button className="btn btn-dark" type="submit" disabled aria-label="Send">
            <Icon name="send" />
          </button>
        </form>
      </div>
    </div>
  );
}
