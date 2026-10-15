// (i) button that explains a Tableau-powered surface: freshness, source, security and why Tableau helps there. Opens on hover (and on click / keyboard focus for touch and keyboard users);
// a short close delay lets the pointer move into the popover. Fixed-positioned so overflow:hidden cards can't clip it.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { provenance } from '../lib/provenance.js';
import { useSession } from '../context/SessionContext.jsx';

export default function InfoTip({ kind, extra, label = 'About this' }) {
  const { me } = useSession();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const pop = useRef(null);
  const closeTimer = useRef(null);
  const show = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hideSoon = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const info = provenance(kind, me, extra);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const place = () => {
      const r = btn.current.getBoundingClientRect();
      const width = Math.min(380, window.innerWidth - 24);
      const left = Math.max(12, Math.min(r.right - width, window.innerWidth - width - 12));
      const h = Math.min(pop.current?.offsetHeight || 0, window.innerHeight - 24);
      // Below the button if it fits, else above it, else pinned inside the window.
      let top = r.bottom + 8;
      if (top + h > window.innerHeight - 12) top = r.top - h - 8 >= 12 ? r.top - h - 8 : Math.max(12, window.innerHeight - h - 12);
      setPos({ top, left, width });
    };
    place();
    const frame = requestAnimationFrame(place); // again once the popover has its real height
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => !btn.current?.contains(e.target) && !pop.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!info) return null;
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`info-btn${open ? ' is-open' : ''}`}
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        onFocus={show}
        onBlur={hideSoon}
        onClick={show}
        aria-expanded={open}
        aria-label={label}
      >
        i
      </button>
      {/* Portaled to <body>: inside a scaled container (the embedded dashboard) position:fixed would be offset. */}
      {open &&
        createPortal(
        <div ref={pop} className="info-pop" role="dialog" aria-label={label} onMouseEnter={show} onMouseLeave={hideSoon} style={pos ? { top: pos.top, left: pos.left, width: pos.width } : { visibility: 'hidden' }}>
          <div className="info-tag">{info.tag}</div>
          <h4>Freshness</h4>
          <p>{info.freshness}</p>
          <h4>Source</h4>
          <p>{info.source}</p>
          <h4>Security</h4>
          <p>{info.security}</p>
          <div className="info-why">
            <h4>Why Tableau helps here</h4>
            <p>{info.why}</p>
          </div>
        </div>,
          document.body
        )}
    </>
  );
}
