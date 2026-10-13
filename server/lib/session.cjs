// Minimal stateless, HMAC-signed cookies (HttpOnly, SameSite=Lax, Secure in production).
const crypto = require('crypto');

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function encode(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

function decode(raw, secret) {
  if (!raw || typeof raw !== 'string' || !raw.includes('.')) return null;
  const [body, sig] = raw.split('.');
  const expected = sign(body, secret);
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))];
    })
  );
}

function cookieString(name, value, { maxAgeMs, secure }) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (maxAgeMs !== undefined) parts.push(`Max-Age=${Math.floor(maxAgeMs / 1000)}`);
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function createCookieJar({ secret, secure }) {
  return {
    read(req, name) {
      return decode(parseCookies(req.headers.cookie)[name], secret);
    },
    write(res, name, payload, ttlMs) {
      const value = encode({ ...payload, exp: Date.now() + ttlMs }, secret);
      res.append('Set-Cookie', cookieString(name, value, { maxAgeMs: ttlMs, secure }));
    },
    clear(res, name) {
      res.append('Set-Cookie', cookieString(name, '', { maxAgeMs: 0, secure }));
    }
  };
}

module.exports = { createCookieJar };
