// Build your own report (Premium): Tableau web authoring embedded on the governed data source.
// The token carries the user's attributes, so row-level security applies while authoring too.
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useSession } from '../context/SessionContext.jsx';
import Crumbs from '../components/Crumbs.jsx';
import EmbedPlaceholder from '../components/EmbedPlaceholder.jsx';
import TableauViz from '../components/TableauViz.jsx';

export default function ReportBuilder() {
  const { me } = useSession();
  const [sources, setSources] = useState(null);
  const [source, setSource] = useState(0);

  useEffect(() => {
    api('/api/authoring/sources')
      .then(setSources)
      .catch((e) => setSources({ error: e.message }));
  }, []);

  return (
    <div className="container">
      <Crumbs items={[{ label: 'Reports', to: '/reports' }, { label: 'Build your own' }]} />
      <div className="page-head">
        <div>
          <h1>Build your own report</h1>
          <p className="lead">Start from {me.tenant.shortName}&apos;s data. Drag fields onto the canvas; you only see data you&apos;re entitled to.</p>
        </div>
        {sources?.datasources?.length > 1 && (
          <select className="input" style={{ width: 'auto' }} value={source} onChange={(e) => setSource(Number(e.target.value))} aria-label="Data source">
            {sources.datasources.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        )}
      </div>
      {sources?.error && <div className="error-msg">{sources.error}</div>}
      {sources && !sources.error && !sources.allowed && (
        <EmbedPlaceholder title="Building reports is part of Premium">Ask your Apex team about upgrading your subscription.</EmbedPlaceholder>
      )}
      {sources?.allowed && (
        <div className="viz-card">
          <TableauViz key={source} viewKey="authoring" authoring endpoint={`/api/embed/authoring/${source}`} width={1400} height={860} />
        </div>
      )}
    </div>
  );
}
