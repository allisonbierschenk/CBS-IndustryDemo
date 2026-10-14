// Build your own report (Premium): Tableau web authoring embedded on the governed data source.
// The token carries the user's attributes, so row-level security applies while authoring too.
// The editor is sized to the window (so the page never needs scrolling), and Tableau's ✕ button
// raises 'workbookreadytoclose', which returns the user to Reports.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../context/SessionContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Crumbs from '../components/Crumbs.jsx';
import EmbedPlaceholder from '../components/EmbedPlaceholder.jsx';
import Icon from '../components/Icon.jsx';
import TableauViz from '../components/TableauViz.jsx';

export default function ReportBuilder() {
  const { me } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [sources, setSources] = useState(null);
  const [source, setSource] = useState(0);
  const [size, setSize] = useState(null);
  const slotRef = useRef(null);

  useEffect(() => {
    api('/api/authoring/sources')
      .then(setSources)
      .catch((e) => setSources({ error: e.message }));
  }, []);

  // Measured once: resizing the editor would reload it and lose unsaved work.
  useLayoutEffect(() => {
    const el = slotRef.current;
    if (!el || size) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    setSize({ width: Math.max(900, el.clientWidth - 16), height: Math.max(560, window.innerHeight - top - 24) });
  }, [sources, size]);

  const events = {
    workbookreadytoclose: () => navigate('/reports'),
    workbookpublished: () => toast('Report saved to Tableau'),
    workbookpublishedas: () => toast('Report saved to Tableau')
  };

  return (
    <div className="container">
      <Crumbs items={[{ label: 'Reports', to: '/reports' }, { label: 'Build your own' }]} />
      <div className="page-head builder-head">
        <div>
          <h1>Build your own report</h1>
          <p className="lead">Start from {me.tenant.shortName}&apos;s data. You only see data you&apos;re entitled to.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {sources?.datasources?.length > 1 && (
            <select className="input" style={{ width: 'auto' }} value={source} onChange={(e) => setSource(Number(e.target.value))} aria-label="Data source">
              {sources.datasources.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          )}
          <Link className="btn btn-ghost" to="/reports">
            <Icon name="arrowLeft" />
            Back to reports
          </Link>
        </div>
      </div>
      {sources?.error && <div className="error-msg">{sources.error}</div>}
      {sources && !sources.error && !sources.allowed && (
        <EmbedPlaceholder title="Building reports is part of Premium">Ask your Apex team about upgrading your subscription.</EmbedPlaceholder>
      )}
      {sources?.allowed && (
        <div className="viz-card" ref={slotRef}>
          {size && (
            <TableauViz key={source} viewKey="authoring" authoring endpoint={`/api/embed/authoring/${source}`} width={size.width} height={size.height} events={events} />
          )}
        </div>
      )}
    </div>
  );
}
