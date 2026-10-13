import { logJwt } from './jwtDebug.js';

// Tableau Embedding API v3 — library loader and mark-selection helper.
// The library is loaded from the same Tableau Cloud pod that serves the content (per Tableau guidance).
let libPromise = null;

export function loadEmbeddingLibrary(url) {
  if (!url) return Promise.reject(new Error('TABLEAU_SERVER is not configured on the Apex server.'));
  if (libPromise) return libPromise;
  libPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = url;
    script.onerror = () => reject(new Error(`Could not load the Tableau Embedding API from ${url}`));
    document.head.appendChild(script);
    const timer = setTimeout(() => reject(new Error('Timed out loading the Tableau Embedding API.')), 20000);
    customElements.whenDefined('tableau-viz').then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
  libPromise.catch(() => {
    libPromise = null;
  });
  return libPromise;
}

/** First selected value of `field` from a markselectionchanged event (tolerates ATTR(Field)). */
export async function selectedValue(event, field) {
  const marks = await event.detail.getMarksAsync();
  const want = field.toLowerCase();
  for (const table of marks.data || []) {
    const idx = table.columns.findIndex((c) => {
      const name = (c.fieldName || '').toLowerCase();
      return name === want || name.replace(/^[a-z]+\((.*)\)$/, '$1') === want;
    });
    if (idx >= 0 && table.data.length) {
      const cell = table.data[0][idx];
      return cell.formattedValue ?? cell.value;
    }
  }
  return null;
}

/** Log every freshly minted embed JWT client-side and broadcast it to the "under the hood" panel. */
export function announceToken(kind, key, data) {
  if (!data?.token) return;
  const label = `Embed JWT · ${key}`;
  logJwt(data.token, label);
  sessionStorage.setItem('apex.lastJwt', JSON.stringify({ label, token: data.token }));
  window.dispatchEvent(new CustomEvent('apex:token', { detail: { kind, key, label, token: data.token, claims: data.claims, at: Date.now() } }));
}
