// Customize a template (Premium): open an existing Apex dashboard in Tableau web authoring.
// <tableau-authoring-viz> loads the template's /authoring/ URL; the token carries the user's attributes,
// so row-level security applies while editing. Save As writes the customer's own copy — the Apex
// template is never changed. Tableau's ✕ raises 'workbookreadytoclose', which returns the user.
import { useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useToast } from '../context/ToastContext.jsx';
import Crumbs from '../components/Crumbs.jsx';
import Icon from '../components/Icon.jsx';
import TableauViz from '../components/TableauViz.jsx';

export default function CustomizeReport() {
  const { key } = useParams(); // views key (e.g. valueIntelligence) or library:<viewId>
  const [params] = useSearchParams();
  const back = params.get('back') || '/reports';
  const title = params.get('title') || 'Report';
  const navigate = useNavigate();
  const toast = useToast();
  const [size, setSize] = useState(null);
  const slotRef = useRef(null);

  // Measured once: resizing the editor would reload it and lose unsaved work.
  useLayoutEffect(() => {
    const el = slotRef.current;
    if (!el || size) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    setSize({ width: Math.max(900, el.clientWidth - 16), height: Math.max(560, window.innerHeight - top - 24) });
  }, [size]);

  const events = {
    workbookreadytoclose: () => navigate(back),
    workbookpublished: () => toast('Your version was saved to Tableau'),
    workbookpublishedas: () => toast('Your version was saved to Tableau')
  };

  return (
    <div className="container">
      <Crumbs items={[{ label: 'Reports', to: '/reports' }, { label: `Customize: ${title}` }]} />
      <div className="page-head builder-head">
        <div>
          <h1>Customize {title}</h1>
          <p className="lead">Start from Apex&apos;s template: add a chart, change a measure, rearrange it. Use File → Save As to keep your own version; the template stays as it is.</p>
        </div>
        <Link className="btn btn-ghost" to={back}>
          <Icon name="arrowLeft" />
          Back
        </Link>
      </div>
      <div className="viz-card" ref={slotRef}>
        {size && <TableauViz key={key} viewKey={`customize:${key}`} authoring endpoint={`/api/embed/customize/${encodeURIComponent(key)}`} width={size.width} height={size.height} events={events} />}
      </div>
    </div>
  );
}
