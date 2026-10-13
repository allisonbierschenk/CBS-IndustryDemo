// Help & KPI definitions — how to use the portal and what each measure means.
import { Link } from 'react-router-dom';
import { useContact } from '../context/ContactContext.jsx';
import { useSession } from '../context/SessionContext.jsx';
import Crumbs from '../components/Crumbs.jsx';

const KPIS = [
  ['Value Realization Rate', 'Business value delivered ÷ the business value targeted for the period. Shows how much of the agreed outcome has been achieved.'],
  ['Value-to-Investment Ratio', 'Business value delivered ÷ consulting investment, shown as a multiplier (e.g. 3.0x = $3 of measurable value for every $1 invested).'],
  ['Business Value Delivered', 'Total measurable financial benefit produced by your engagements — savings, revenue impact and cost avoidance agreed at baseline.'],
  ['Hours Delivered vs. Plan', 'Consulting hours delivered ÷ hours planned for the period. Above 100% means more effort than planned; well below means delivery is behind.'],
  ['On-Time Milestone Rate', 'Milestones completed on or before their due date ÷ milestones due in the period.'],
  ['Consulting Investment', 'Fees invested in Apex services for the period.'],
  ['Engagement Health', 'Overall health score of each active engagement, combining delivery, budget and outcome indicators.'],
  ['Net Business Value', 'Business value delivered minus consulting investment, accumulated over time.']
];

export default function Help() {
  const { me } = useSession();
  const contact = useContact();
  const hasTransport = me.views.transportation?.entitled;

  return (
    <div className="container doc">
      <Crumbs items={[{ label: 'Home', to: '/' }, { label: 'Help & KPI definitions' }]} />
      <div className="page-head">
        <div>
          <h1>Help &amp; KPI definitions</h1>
          <p className="lead">How to use your portal and what each measure on your dashboards means.</p>
        </div>
      </div>

      <section className="doc-section">
        <h2>Using your dashboard</h2>
        <ul>
          <li>
            <b>Filter</b> by Service Line or Engagement Type with the filter bar above the dashboard. <b>Reset</b> returns to all
            engagements.
          </li>
          <li>
            <b>View an engagement</b> from the engagement cards on <Link to={{ pathname: '/dashboards', hash: '#engagements' }}>Value Intelligence</Link> — the dashboard filters to
            that engagement.
          </li>
          <li>
            <b>Hover</b> any chart for exact values.
          </li>
          <li>
            <b>Year to date</b> figures compare with the same period last year. Where an engagement is newer than a year, no prior
            period comparison is shown.
          </li>
          {hasTransport && (
            <li>
              <b>Transportation Optimization &amp; Savings</b>: select an invoice status to see the underlying invoices and
              shipments, then use the invoice search to find a specific invoice.
            </li>
          )}
          <li>
            <b>Premium Industry Benchmarks</b> compare your results with an anonymized industry peer group
            {me.entitlements.includes('benchmarks') ? ' and are included in your subscription.' : ' and are available with a Premium subscription.'}
          </li>
        </ul>
      </section>

      <section className="doc-section">
        <h2>KPI definitions</h2>
        <dl className="kpi-defs">
          {KPIS.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="doc-section">
        <h2>Still have a question?</h2>
        <p>Your Apex engagement team can walk through any metric or result with you.</p>
        <button className="btn btn-dark" onClick={() => contact('Data or dashboard question')}>
          Contact your Apex team
        </button>
      </section>
    </div>
  );
}
