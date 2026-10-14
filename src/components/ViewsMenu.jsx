// Saved views (Tableau custom views) for the embedded dashboard: switch, save, set as my default, delete.
// Embedding API: workbook.getCustomViewsAsync / saveCustomViewAsync / showCustomViewAsync /
// setActiveCustomViewAsDefaultAsync / removeCustomViewAsync. A default custom view opens automatically.
import { useCallback, useEffect, useRef, useState } from 'react';
import { track } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';
import Icon from './Icon.jsx';

export default function ViewsMenu({ viz }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState([]);
  const [active, setActive] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  const refresh = useCallback(async () => {
    if (!viz) return;
    try {
      const list = await viz.workbook.getCustomViewsAsync();
      setViews(list.map((v) => ({ name: v.name, isDefault: v.default, owner: v.ownerName, shared: v.shared })));
      setActive(viz.workbook.activeCustomView?.name || null);
    } catch (e) {
      console.warn('[custom views] list failed:', e);
    }
  }, [viz]);

  useEffect(() => {
    refresh();
    if (!viz) return;
    const events = ['customviewloaded', 'customviewsaved', 'customviewremoved', 'customviewsetdefault'];
    events.forEach((ev) => viz.addEventListener(ev, refresh));
    return () => events.forEach((ev) => viz.removeEventListener(ev, refresh));
  }, [viz, refresh]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const act = async (label, fn, done) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      if (done) toast(done);
      track('custom-view', { action: label });
    } catch (e) {
      toast(`${label} failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const save = (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    act('save', () => viz.workbook.saveCustomViewAsync(n), `Saved “${n}”`).then(() => setName(''));
  };

  const current = views.find((v) => v.name === active);

  return (
    <div className="export" ref={ref}>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)} disabled={!viz} aria-haspopup="menu" aria-expanded={open} title="Saved views">
        <Icon name="eye" />
        {active ? active : 'Views'}
      </button>
      {open && (
        <div className="export-menu views-menu" role="menu">
          <div className="vm-label">Your saved views</div>
          <button className={`export-item${!active ? ' is-active' : ''}`} onClick={() => act('show original', () => viz.workbook.showCustomViewAsync())}>
            <Icon name="dashboard" />
            <span>Original view</span>
          </button>
          {views.map((v) => (
            <div key={v.name} className={`vm-row${v.name === active ? ' is-active' : ''}`}>
              <button className="export-item" onClick={() => act('show', () => viz.workbook.showCustomViewAsync(v.name))}>
                <Icon name={v.isDefault ? 'star' : 'eye'} />
                <span>
                  {v.name}
                  {v.isDefault && <small className="vm-default"> · default</small>}
                </span>
              </button>
              <button className="icon-btn vm-del" aria-label={`Delete ${v.name}`} onClick={() => act('delete', () => viz.workbook.removeCustomViewAsync(v.name), `Deleted “${v.name}”`)}>
                ✕
              </button>
            </div>
          ))}
          {views.length === 0 && <p className="vm-empty">No saved views yet. Set filters, then save them here.</p>}
          <form className="vm-save" onSubmit={save}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this view…" maxLength={60} />
            <button className="btn btn-dark btn-sm" type="submit" disabled={busy || !name.trim()}>
              Save
            </button>
          </form>
          <button
            className="btn btn-ghost btn-sm vm-default-btn"
            disabled={busy || !active || current?.isDefault}
            onClick={() => act('set default', () => viz.workbook.setActiveCustomViewAsDefaultAsync(), `“${active}” will open by default`)}
            title={active ? 'Open this view by default next time' : 'Open a saved view first'}
          >
            <Icon name="star" />
            {current?.isDefault ? 'This is your default view' : 'Make this my default view'}
          </button>
        </div>
      )}
    </div>
  );
}
