// <tableau-viz> wrapper. Asks the Apex server for the view URL (entitlement-checked) and a
// freshly minted Connected App JWT, then mounts the Embedding API v3 web component.
//
// Sizing: the dashboard always renders at its true fixed size (width × height from config, then
// re-read from the Embedding API once loaded). The frame reserves exactly that space; when the
// available width is narrower, the dashboard is scaled down proportionally — never cropped or scrolled.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { announceToken, loadEmbeddingLibrary } from '../lib/tableau.js';
import { useSession } from '../context/SessionContext.jsx';
import EmbedPlaceholder, { EmbedLoading } from './EmbedPlaceholder.jsx';

const HOST_PADDING = 8; // matches .viz-host padding

export default function TableauViz({ viewKey, endpoint, authoring = false, width = 1200, height = 900, filters = [], onMarkSelection, onFirstInteractive, events }) {
  const { config } = useSession();
  const hostRef = useRef(null);
  const mountRef = useRef(null);
  const markRef = useRef(onMarkSelection);
  const readyRef = useRef(onFirstInteractive);
  markRef.current = onMarkSelection;
  readyRef.current = onFirstInteractive;
  const eventsRef = useRef(events); // extra Tableau events, e.g. { workbookreadytoclose: fn }
  eventsRef.current = events;
  const [phase, setPhase] = useState({ kind: 'loading', label: 'Authenticating securely with Tableau…' });
  const [size, setSize] = useState({ width, height });
  const [available, setAvailable] = useState(null);
  const [attempt, setAttempt] = useState(0); // bump to re-embed with a freshly minted JWT
  const autoRetried = useRef(false);
  const filterKey = JSON.stringify(filters);

  useEffect(() => setSize({ width, height }), [width, height]);

  // Track the width actually available to the dashboard.
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => setAvailable(el.clientWidth - HOST_PADDING * 2);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let viz = null;
    setPhase({ kind: 'loading', label: 'Authenticating securely with Tableau…' });

    (async () => {
      let data;
      try {
        data = await api(endpoint || `/api/embed/view/${encodeURIComponent(viewKey)}`);
        if (cancelled) return;
        if (!data.configured) return setPhase({ kind: 'unconfigured' });
        await loadEmbeddingLibrary(config?.embeddingLibrary);
      } catch (e) {
        if (!cancelled) setPhase({ kind: e.status === 403 ? 'forbidden' : 'error', message: e.message });
        return;
      }
      if (cancelled) return;
      announceToken('view', viewKey, data);

      // authoring: Tableau web authoring (<tableau-authoring-viz>) for building a new report.
      viz = document.createElement(authoring ? 'tableau-authoring-viz' : 'tableau-viz');
      viz.setAttribute('src', data.src);
      viz.setAttribute('token', data.token);
      if (!authoring) {
        viz.setAttribute('toolbar', 'hidden'); // Tableau recommends hiding the toolbar with connected apps
        viz.setAttribute('hide-tabs', '');
      }
      viz.setAttribute('width', `${width}px`);
      viz.setAttribute('height', `${height}px`);
      for (const f of JSON.parse(filterKey)) {
        const vf = document.createElement('viz-filter');
        vf.setAttribute('field', f.field);
        vf.setAttribute('value', f.value);
        viz.appendChild(vf);
      }
      viz.addEventListener('firstinteractive', (e) => {
        if (cancelled) return;
        autoRetried.current = false;
        // Use the dashboard's real size if Tableau reports a fixed / max size.
        const s = authoring ? null : viz.workbook?.activeSheet?.size;
        const w = s?.maxSize?.width || s?.minSize?.width;
        const h = s?.maxSize?.height || s?.minSize?.height;
        if (s) console.info(`Tableau "${viewKey}" sheet size`, JSON.stringify(s));
        if (w > 200 && h > 200) {
          viz.setAttribute('width', `${w}px`);
          viz.setAttribute('height', `${h}px`);
          setSize({ width: w, height: h });
        }
        setPhase({ kind: 'ready' });
        readyRef.current?.(e, viz);
      });
      viz.addEventListener('vizloaderror', (e) => {
        console.error('Tableau vizloaderror', e.detail);
        if (cancelled) return;
        const message = e.detail?.message || 'Tableau rejected the request.';
        // Tableau occasionally rejects a sign-in (e.g. 401 / 10085). Retry once, automatically, with a new token.
        if (!autoRetried.current && /401/.test(message)) {
          autoRetried.current = true;
          console.warn(`Tableau "${viewKey}" sign-in rejected — retrying once with a fresh JWT`);
          setAttempt((a) => a + 1);
          return;
        }
        setPhase({ kind: 'error', message, tableau: true });
      });
      viz.addEventListener('markselectionchanged', (e) => markRef.current?.(e));
      for (const name of Object.keys(eventsRef.current || {})) viz.addEventListener(name, (e) => eventsRef.current?.[name]?.(e));

      setPhase({ kind: 'mounting', label: 'Loading your analytics…' });
      mountRef.current?.appendChild(viz);
    })();

    return () => {
      cancelled = true;
      viz?.remove();
    };
  }, [viewKey, endpoint, authoring, width, height, filterKey, config?.embeddingLibrary, attempt]);

  const live = phase.kind === 'loading' || phase.kind === 'mounting' || phase.kind === 'ready';
  const scale = available ? Math.min(1, available / size.width) : 1;

  return (
    <div className="viz-host" ref={hostRef}>
      {live ? (
        <div
          className="viz-frame"
          style={{ width: size.width * scale, height: size.height * scale }}
          title={scale < 1 ? `Scaled to ${Math.round(scale * 100)}% to fit your window` : undefined}
        >
          <EmbedLoading label={phase.label} done={phase.kind === 'ready'} />
          <div
            ref={mountRef}
            style={{ width: size.width, height: size.height, transform: scale < 1 ? `scale(${scale})` : undefined, transformOrigin: 'top left' }}
          />
        </div>
      ) : (
        <>
          {phase.kind === 'unconfigured' && (
            <EmbedPlaceholder title="Tableau view not connected yet">
              Paste the view URL into <code>config/tableau-content.json → views.{viewKey}.url</code>. The portal never substitutes
              sample numbers for Tableau analytics.
            </EmbedPlaceholder>
          )}
          {phase.kind === 'forbidden' && <EmbedPlaceholder title="Not included in your subscription">{phase.message}</EmbedPlaceholder>}
          {phase.kind === 'error' && (
            <EmbedPlaceholder title="This view could not be loaded" error>
              {phase.message}
              {phase.tableau && (
                <>
                  <br />
                  <br />
                  Check that the Tableau user exists on the site, has View permission on this content, the connected app is
                  enabled for this project, and this domain is on the connected app allowlist.
                </>
              )}
              <div style={{ marginTop: 12 }}>
                <button
                  className="btn btn-dark btn-sm"
                  onClick={() => {
                    autoRetried.current = false;
                    setAttempt((a) => a + 1);
                  }}
                >
                  Try again
                </button>
              </div>
            </EmbedPlaceholder>
          )}
          <div ref={mountRef} hidden />
        </>
      )}
    </div>
  );
}
