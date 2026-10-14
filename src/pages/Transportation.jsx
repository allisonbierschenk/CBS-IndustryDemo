// Page 2 — Transportation Optimization & Savings (Vantage only; entitlement-gated on the server and in Tableau).
import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { selectedValue } from '../lib/tableau.js';
import { useSession } from '../context/SessionContext.jsx';
import Crumbs from '../components/Crumbs.jsx';
import Icon from '../components/Icon.jsx';
import AnalyticsAssistantButton from '../components/AnalyticsAssistantButton.jsx';
import ExportMenu from '../components/ExportMenu.jsx';
import SelectionActions from '../components/SelectionActions.jsx';
import SubscribeButton from '../components/SubscribeButton.jsx';
import ViewsMenu from '../components/ViewsMenu.jsx';
import InvoiceSearch from '../components/InvoiceSearch.jsx';
import TableauViz from '../components/TableauViz.jsx';

export default function Transportation() {
  const { me } = useSession();
  const navigate = useNavigate();
  const view = me.views.transportation;
  const dd = me.drilldown;
  const [viz, setViz] = useState(null);
  const engagement = me.tenant.engagements.find((e) => e.analytics === 'transportation');

  // Selecting an invoice status opens Invoice & Shipment Details filtered to that status.
  const onMarkSelection = useCallback(
    async (event) => {
      if (!dd || event.detail.worksheet?.name !== dd.sourceWorksheet) return;
      const value = await selectedValue(event, dd.field);
      if (value) navigate(`/transportation/invoices?status=${encodeURIComponent(value)}`);
    },
    [dd, navigate]
  );

  return (
    <div className="container">
      <Crumbs
        items={[
          { label: 'Value Intelligence', to: '/dashboards' },
          { label: engagement?.name || 'Engagements', to: { pathname: '/dashboards', hash: '#engagements' } },
          { label: view.title }
        ]}
      />
      <div className="page-head">
        <div>
          <div className="kicker">{engagement?.name}</div>
          <h1>{view.title}</h1>
        </div>
        {dd && (
          <div style={{ display: 'grid', gap: 10, justifyItems: 'end' }}>
            <span className="tip">
              <Icon name="pointer" />
              Select an invoice status in “{dd.sourceWorksheet}” to see the underlying records
            </span>
            <Link className="btn btn-ghost btn-sm" to="/transportation/invoices">
              <Icon name="table" />
              All invoice &amp; shipment details
            </Link>
          </div>
        )}
      </div>

      <div className="viz-card">
        <div className="viz-card-head">
          <div>
            <h3>{view.title}</h3>
            <p>{view.subtitle}</p>
          </div>
          <div className="viz-meta">
            <AnalyticsAssistantButton viz={viz} />
            <ViewsMenu viz={viz} />
            <SubscribeButton viewKey="transportation" title={view.title} />
            <ExportMenu viz={viz} title={view.title} />
          </div>
        </div>
        {viz && view.search && <InvoiceSearch viz={viz} {...view.search} />}
        <TableauViz
          viewKey="transportation"
          width={view.width}
          height={view.height}
          onMarkSelection={onMarkSelection}
          onFirstInteractive={(e, v) => setViz(v)}
        />
      </div>
      {/* The drill-down worksheet navigates instead, so it's excluded here. */}
      <SelectionActions viz={viz} title={view.title} ignoreWorksheets={dd ? [dd.sourceWorksheet] : []} />
    </div>
  );
}
