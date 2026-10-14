// Persistent (preloaded) Tableau embeds.
// A dashboard is embedded ONCE at the layout level as soon as the user is signed in, so it's already
// interactive by the time they open its page. Pages don't render the iframe themselves — they render an
// <EmbedSlot>, and the persistent embed is positioned exactly over that slot. The iframe is never moved
// in the DOM (moving an iframe reloads it).
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import EmbedPlaceholder from '../components/EmbedPlaceholder.jsx';
import TableauViz from '../components/TableauViz.jsx';
import { useSession } from './SessionContext.jsx';

const EmbedContext = createContext(null);


export function EmbedProvider({ views, children }) {
  const [slots, setSlots] = useState({}); // key -> slot element (when its page is mounted)
  const [vizzes, setVizzes] = useState({}); // key -> viz once interactive
  const [heights, setHeights] = useState({}); // key -> rendered height (so the slot reserves space)
  const handlers = useRef({}); // key -> { onMarkSelection }

  const registerSlot = useCallback((key, el) => setSlots((s) => (s[key] === el ? s : { ...s, [key]: el })), []);
  const unregisterSlot = useCallback((key, el) => setSlots((s) => (s[key] === el ? { ...s, [key]: null } : s)), []);

  const value = { slots, vizzes, heights, handlers, registerSlot, unregisterSlot, setVizzes, setHeights, views };
  return <EmbedContext.Provider value={value}>{children}</EmbedContext.Provider>;
}

const useEmbedContext = () => {
  const ctx = useContext(EmbedContext);
  if (!ctx) throw new Error('Embed components must be inside <EmbedProvider>');
  return ctx;
};

/** Page-side: reserve the space and get the (possibly already loaded) viz. */
export function EmbedSlot({ viewKey, onMarkSelection, onViz }) {
  const { registerSlot, unregisterSlot, heights, vizzes, handlers, views } = useEmbedContext();
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    registerSlot(viewKey, el);
    return () => unregisterSlot(viewKey, el);
  }, [viewKey, registerSlot, unregisterSlot]);

  useEffect(() => {
    handlers.current[viewKey] = { onMarkSelection };
    return () => {
      handlers.current[viewKey] = {};
    };
  }, [viewKey, onMarkSelection, handlers]);

  const viz = vizzes[viewKey];
  useEffect(() => {
    if (viz) onViz?.(viz);
  }, [viz, onViz]);

  if (!views[viewKey]) {
    return (
      <div className="viz-host" style={{ minHeight: 240 }}>
        <EmbedPlaceholder title="Tableau view not connected yet">
          Paste the view URL into <code>config/tableau-content.json → views.{viewKey}.url</code>.
        </EmbedPlaceholder>
      </div>
    );
  }
  return <div ref={ref} className="embed-slot" style={{ height: heights[viewKey] || views[viewKey]?.height || 600 }} />;
}

/** Layout-side: the persistent embeds, positioned over their slot when it's on screen. */
export function PersistentEmbeds({ containerRef }) {
  const { slots, views, handlers, setVizzes, setHeights } = useEmbedContext();
  return Object.entries(views).map(([key, view]) => (
    <PersistentEmbed
      key={key}
      viewKey={key}
      view={view}
      slot={slots[key]}
      containerRef={containerRef}
      handlers={handlers}
      onReady={(viz) => setVizzes((v) => ({ ...v, [key]: viz }))}
      onHeight={(h) => setHeights((s) => (s[key] === h ? s : { ...s, [key]: h }))}
    />
  ));
}

function PersistentEmbed({ viewKey, view, slot, containerRef, handlers, onReady, onHeight }) {
  const boxRef = useRef(null);
  const [rect, setRect] = useState(null);

  // Track the slot's position within the page container.
  useLayoutEffect(() => {
    if (!slot) return setRect(null);
    const container = containerRef.current;
    const measure = () => {
      const s = slot.getBoundingClientRect();
      const c = container.getBoundingClientRect();
      setRect((r) => {
        const next = { top: s.top - c.top, left: s.left - c.left, width: s.width };
        return r && Math.abs(r.top - next.top) < 0.5 && Math.abs(r.left - next.left) < 0.5 && Math.abs(r.width - next.width) < 0.5 ? r : next;
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(slot);
    ro.observe(container);
    window.addEventListener('resize', measure);
    const t = setInterval(measure, 500); // content above the slot can shift without resizing the container
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      clearInterval(t);
    };
  }, [slot, containerRef]);

  // Report the embed's rendered height so the slot reserves exactly that much space.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => onHeight(Math.ceil(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = Boolean(slot && rect);
  const style = shown
    ? { position: 'absolute', top: rect.top, left: rect.left, width: rect.width, zIndex: 1 }
    : // Preloading: keep it IN the viewport but invisible and inert. (Positioned off-screen, Tableau never
      // loads the view — verified: no view request and no FirstInteractive while at left:-20000px.)
      { position: 'fixed', top: 0, left: 0, width: Math.min(window.innerWidth - 120, view.width + 16), visibility: 'hidden', pointerEvents: 'none', zIndex: -1 };

  return (
    <div ref={boxRef} className="persistent-embed" style={style} aria-hidden={!shown}>
      <TableauViz
        viewKey={viewKey}
        width={view.width}
        height={view.height}
        onMarkSelection={(e) => handlers.current[viewKey]?.onMarkSelection?.(e)}
        onFirstInteractive={(e, viz) => onReady(viz)}
      />
    </div>
  );
}

/** Views to preload for the signed-in customer (entitled + configured only). */
export function usePreloadViews(keys) {
  const { me } = useSession();
  return Object.fromEntries(keys.filter((k) => me.views[k]?.configured).map((k) => [k, me.views[k]]));
}
