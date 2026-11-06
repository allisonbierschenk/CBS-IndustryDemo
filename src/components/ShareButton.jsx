// Share icon on every dashboard header: a signed, expiring portal link (and QR code) to this page with its
// current filters. The recipient signs in as themselves, so they only ever see their own data (RLS).
import { useState } from 'react';
import Icon from './Icon.jsx';
import ShareDialog from './ShareDialog.jsx';

export default function ShareButton({ title }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setOpen(true)} aria-label="Share" title="Share: get a link to this dashboard in the portal">
        <Icon name="share" />
      </button>
      {open && <ShareDialog title={title} onClose={() => setOpen(false)} />}
    </>
  );
}
