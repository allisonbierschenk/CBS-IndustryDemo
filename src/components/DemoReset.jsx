// Demo reset: find every demo-created Pulse metric any portal user follows (portal goal metrics and
// client-scoped metrics), list them, then delete them all. Shared metrics are kept.
// The server only allows this for the demo owner (users.json roles ["activity"]). With `owner` set (sign-in
// page), the panel signs in as the owner for the reset and signs out again afterwards.
import { useState } from 'react';
import { api } from '../lib/api.js';

export default function DemoReset({ owner = null, onDone }) {
  const [scan, setScan] = useState(null); // { targets, kept, errors }
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  // Runs fn as the owner; on the sign-in page that means a temporary owner session.
  const asOwner = async (fn) => {
    if (!owner) return fn();
    await api('/api/auth/login', { method: 'POST', body: { userId: owner.userId } });
    try {
      return await fn();
    } finally {
      await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    }
  };

  const find = async () => {
    setBusy('scan');
    setMsg('');
    try {
      setScan(await asOwner(() => api('/api/admin/demo-metrics')));
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy('');
    }
  };
  const del = async () => {
    const n = scan.targets.length;
    if (!window.confirm(`Delete ${n} Pulse metric definition${n === 1 ? '' : 's'} from Tableau for every portal user? This can't be undone.`)) return;
    setBusy('delete');
    setMsg('');
    try {
      const r = await asOwner(() => api('/api/admin/demo-metrics/delete', { method: 'POST' }));
      setMsg(`Deleted ${r.deleted.length} metric${r.deleted.length === 1 ? '' : 's'}${r.failed.length ? ` · couldn’t delete: ${r.failed.map((f) => f.name).join(', ')}` : ''}.`);
      setScan(null);
      onDone?.(r);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="dock-reset" style={{ display: 'block' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
        <span>
          <b>Demo reset</b> Delete every demo-created Pulse metric (goals and client-scoped metrics) the portal users follow. Shared metrics are kept.
        </span>
        <button className="btn btn-ghost btn-sm" onClick={find} disabled={Boolean(busy)}>
          {busy === 'scan' ? 'Searching…' : scan ? 'Search again' : 'Find demo metrics'}
        </button>
      </div>
      {scan && (
        <div style={{ marginTop: 8 }}>
          {scan.targets.length ? (
            <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>
              {scan.targets.map((d) => (
                <li key={d.id}>
                  <b>{d.name}</b> — {d.reason} · followed by {d.followers.join(', ')}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: '0 0 8px' }}>No demo-created metrics found — the demo is clean.</p>
          )}
          <p style={{ margin: '0 0 8px' }}>Kept (shared): {scan.kept.join(', ') || 'none'}</p>
          {scan.errors?.length > 0 && <p style={{ margin: '0 0 8px' }}>Couldn’t scan: {scan.errors.join('; ')}</p>}
          {scan.targets.length > 0 && (
            <button className="btn btn-lime btn-sm" onClick={del} disabled={Boolean(busy)}>
              {busy === 'delete' ? 'Deleting…' : `Delete ${scan.targets.length} metric${scan.targets.length === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      )}
      {msg && (
        <p style={{ margin: '8px 0 0' }} role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
