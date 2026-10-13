// Drill-down — Invoice & Shipment Details, filtered by the invoice status chosen on the summary.
// The filter lives in the URL (?status=Outstanding) so Back / deep links behave naturally.
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '../context/SessionContext.jsx';
import Crumbs from '../components/Crumbs.jsx';
import Icon from '../components/Icon.jsx';
import TableauViz from '../components/TableauViz.jsx';

export default function InvoiceDetails() {
  const { me } = useSession();
  const [params, setParams] = useSearchParams();
  const status = params.get('status');
  const view = me.views.invoiceDetails;
  const field = me.drilldown?.targetFilterField || 'Invoice Status';
  const filters = useMemo(() => (status ? [{ field, value: status }] : []), [field, status]);

  return (
    <div className="container">
      <Crumbs
        items={[
          { label: 'Value Intelligence', to: '/dashboards' },
          { label: me.views.transportation.title, to: '/transportation' },
          { label: view.title }
        ]}
      />
      <div className="page-head">
        <div>
          <div className="kicker">Drill-down</div>
          <h1>{view.title}</h1>
          <p className="lead">The invoices and shipments behind the summary, at the transaction level.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {status && (
            <span className="filter-chip">
              {field}: <b>{status}</b>
              <button
                onClick={() => setParams({})}
                aria-label="Clear filter"
                style={{ background: 'none', border: 0, color: '#fff', cursor: 'pointer', padding: 0, marginLeft: 4 }}
              >
                ✕
              </button>
            </span>
          )}
          <Link className="btn btn-dark" to="/transportation">
            <Icon name="arrowLeft" />
            Back to Transportation
          </Link>
        </div>
      </div>
      <div className="viz-card">
        <div className="viz-card-head">
          <div>
            <h3>{status ? `${status} invoices & shipments` : 'All invoices & shipments'}</h3>
            <p>{view.subtitle}</p>
          </div>
        </div>
        <TableauViz key={status || 'all'} viewKey="invoiceDetails" width={view.width} height={view.height} filters={filters} />
      </div>
    </div>
  );
}
