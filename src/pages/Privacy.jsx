// Data & privacy — how this portal protects the client's data.
import { useContact } from '../context/ContactContext.jsx';
import { useSession } from '../context/SessionContext.jsx';
import Crumbs from '../components/Crumbs.jsx';

export default function Privacy() {
  const { me } = useSession();
  const contact = useContact();
  const org = me.tenant.clientName;

  return (
    <div className="container doc">
      <Crumbs items={[{ label: 'Home', to: '/' }, { label: 'Data & privacy' }]} />
      <div className="page-head">
        <div>
          <h1>Data &amp; privacy</h1>
          <p className="lead">How your engagement data is protected in the Apex client portal.</p>
        </div>
      </div>

      <section className="doc-section">
        <h2>Who can see your data</h2>
        <p>
          Only users from {org} who have been granted portal access. Every dashboard is filtered to {org} inside the analytics
          platform itself, so no other Apex client&apos;s engagements, financials or operational records are ever returned to your
          session.
        </p>
      </section>

      <section className="doc-section">
        <h2>How you are signed in</h2>
        <p>
          Your portal session is issued by Apex. When a dashboard loads, the portal requests a short-lived access token (valid for a
          few minutes) that identifies you and your organization to Tableau. Apex&apos;s signing keys never leave Apex&apos;s servers,
          and you don&apos;t need a separate analytics login.
        </p>
      </section>

      <section className="doc-section">
        <h2>Industry benchmarks</h2>
        <p>
          Benchmarks compare your results with aggregated, anonymized peer data. Individual peer organizations are never named or
          shown, and your own results are only ever shown to {org}.
        </p>
      </section>

      <section className="doc-section">
        <h2>What you can see in the portal</h2>
        <p>
          Your subscription ({me.tenant.tier === 'premium' ? 'Premium' : 'Standard'}) determines which analytics are available.
          Content outside your subscription is never sent to your browser.
        </p>
      </section>

      <section className="doc-section">
        <h2>Questions or requests</h2>
        <p>For data access, corrections or removal of portal users, contact your Apex engagement team.</p>
        <button className="btn btn-dark" onClick={() => contact('General question', 'Data & privacy request: ')}>
          Contact your Apex team
        </button>
      </section>
    </div>
  );
}
