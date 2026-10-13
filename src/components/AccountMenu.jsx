import { useEffect, useRef, useState } from 'react';
import { initials } from '../lib/api.js';
import { useSession } from '../context/SessionContext.jsx';
import Icon from './Icon.jsx';

export default function AccountMenu() {
  const { me, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { user, tenant } = me;

  useEffect(() => {
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('click', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', esc);
    };
  }, []);

  return (
    <div className="account" ref={ref}>
      <button className="avatar-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="avatar">{initials(user.name)}</span>
        <span className="who">
          <b>{user.name}</b>
          <span>{tenant.clientName}</span>
        </span>
        <Icon name="chevronDown" />
      </button>
      <div className={`menu${open ? ' open' : ''}`} role="menu">
        <div className="menu-head">
          <span className="avatar">{initials(user.name)}</span>
          <div>
            <b>{user.name}</b>
            <span>{user.title}</span>
          </div>
        </div>
        <div className="menu-sec">
          <dl>
            <dt>Organization</dt>
            <dd>{tenant.clientName}</dd>
            <dt>Industry</dt>
            <dd>{tenant.industry}</dd>
            <dt>Subscription</dt>
            <dd>{tenant.tier === 'premium' ? 'Premium' : 'Standard'}</dd>
            <dt>Signed in as</dt>
            <dd>{user.email}</dd>
          </dl>
        </div>
        <div className="menu-sec">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--ink-2)', fontWeight: 600 }}>
            <Icon name="lock" size={14} />
            Data access is limited to {tenant.clientName}
          </div>
        </div>
        <button className="menu-item" role="menuitem" onClick={signOut}>
          <Icon name="logout" />
          Sign out
        </button>
      </div>
    </div>
  );
}
