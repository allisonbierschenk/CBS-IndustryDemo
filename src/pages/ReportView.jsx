// One report from the library, embedded with the same Connected App JWT and row-level security.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import Crumbs from '../components/Crumbs.jsx';
import AnalyticsAssistantButton from '../components/AnalyticsAssistantButton.jsx';
import ExportMenu from '../components/ExportMenu.jsx';
import InfoTip from '../components/InfoTip.jsx';
import SelectionActions from '../components/SelectionActions.jsx';
import TableauViz from '../components/TableauViz.jsx';
import ViewsMenu from '../components/ViewsMenu.jsx';

export default function ReportView() {
  const { viewId } = useParams();
  const [viz, setViz] = useState(null);
  const [info, setInfo] = useState(null);

  // Title for the header (the embed call below mints its own token).
  useEffect(() => {
    api('/api/library')
      .then((d) => setInfo(d.views.find((v) => v.id === viewId) || null))
      .catch(() => {});
  }, [viewId]);

  const title = info?.name || 'Report';
  return (
    <div className="container">
      <Crumbs items={[{ label: 'Reports', to: '/reports' }, { label: title }]} />
      <div className="viz-card" style={{ marginTop: 18 }} data-tableau="Tableau Embedding API">
        <div className="viz-card-head">
          <div>
            <h3>{title}</h3>
            <p>{info?.workbook}</p>
          </div>
          <div className="viz-meta">
            <AnalyticsAssistantButton viz={viz} />
            <ViewsMenu viz={viz} />
            <ExportMenu viz={viz} title={title} />
            <InfoTip kind="report" extra={{ workbook: info?.workbook }} label="About this report" />
          </div>
        </div>
        <TableauViz key={viewId} viewKey={`library:${viewId}`} endpoint={`/api/embed/library/${encodeURIComponent(viewId)}`} onFirstInteractive={(e, v) => setViz(v)} />
      </div>
      <SelectionActions viz={viz} title={title} />
    </div>
  );
}
