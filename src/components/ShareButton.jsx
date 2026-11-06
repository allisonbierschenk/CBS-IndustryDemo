// Share icon on every dashboard header: a signed, expiring portal link (and QR code) to this page with its
// current filters. The recipient signs in as themselves, so they only ever see their own data (RLS).
import { useState } from 'react';
import Icon from './Icon.jsx';
import ShareDialog from './ShareDialog.jsx';

// When a saved view is open (viz.workbook.activeCustomView), the dialog names it, and its filters are read from
// Tableau ONCE when Share is clicked (no listeners) and put in the link. `filters` = the page's filter config.
export default function ShareButton({ title, viz, filters }) {
  const [open, setOpen] = useState(false);
  const savedView = open ? viz?.workbook?.activeCustomView?.name || null : null;
  return (
    <>
      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setOpen(true)} aria-label="Share" title="Share: get a link to this dashboard in the portal">
        <Icon name="share" />
      </button>
      {open && <ShareDialog title={title} savedView={savedView} viz={viz} filters={filters} onClose={() => setOpen(false)} />}
    </>
  );
}
