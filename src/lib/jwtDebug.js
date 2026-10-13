// Client-side JWT inspection for demos: decode in the browser, log to the console, link to jwt.io.
// The token goes in the URL *fragment* (#…), which browsers never send to the jwt.io server.

export const jwtIoUrl = (token) => `https://jwt.io/#debugger-io?token=${encodeURIComponent(token)}`;

function decodePart(part) {
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  const json = decodeURIComponent(
    Array.from(atob(b64), (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')
  );
  return JSON.parse(json);
}

export function decodeJwt(token) {
  const [h, p] = String(token).split('.');
  return { header: decodePart(h), payload: decodePart(p) };
}

/** Pretty console output: the raw JWT, decoded header + payload, and a jwt.io link. */
export function logJwt(token, label = 'Tableau Connected App JWT') {
  if (!token) return;
  const { header, payload } = decodeJwt(token);
  const style = 'background:#111614;color:#eef26b;padding:3px 8px;border-radius:4px;font-weight:700';
  console.groupCollapsed(`%c${label}%c  sub=${payload.sub}`, style, 'color:inherit');
  console.log('JWT:', token);
  console.log('Header:', header);
  console.log('Payload:', payload);
  console.log('Expires:', new Date(payload.exp * 1000).toLocaleString());
  console.log('Open in jwt.io →', jwtIoUrl(token));
  console.groupEnd();
}
