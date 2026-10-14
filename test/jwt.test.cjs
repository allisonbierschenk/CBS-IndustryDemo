const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { mintEmbedToken } = require('../server/lib/jwt.cjs');

const base = { clientId: 'client-123', secretId: 'secret-id-456', secretValue: 'super-secret-value', username: 'dana@example.com' };
const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

test('produces a Direct Trust JWT with required header and claims', () => {
  const { token } = mintEmbedToken({ ...base, attributes: { 'client name': ['Northstar Enterprises'] } });
  const [h, p, s] = token.split('.');
  const header = decode(h);
  const claims = decode(p);
  assert.deepStrictEqual([header.alg, header.kid, header.iss], ['HS256', 'secret-id-456', 'client-123']);
  assert.strictEqual(claims.iss, 'client-123');
  assert.strictEqual(claims.sub, 'dana@example.com');
  assert.strictEqual(claims.aud, 'tableau');
  assert.ok(claims.jti && claims.jti.length >= 32);
  assert.ok(claims.exp - Math.floor(Date.now() / 1000) <= 600);
  assert.deepStrictEqual(claims.scp, ['tableau:views:embed', 'tableau:insights:embed', 'tableau:content:read']);
  assert.deepStrictEqual(claims['client name'], ['Northstar Enterprises']);
  const expected = crypto.createHmac('sha256', base.secretValue).update(`${h}.${p}`).digest('base64url');
  assert.strictEqual(s, expected);
});

test('caps lifetime at 10 minutes and uses unique jti', () => {
  const a = mintEmbedToken({ ...base, ttlSeconds: 9999 });
  const b = mintEmbedToken({ ...base });
  assert.ok(a.claims.exp - a.claims.iat <= 600);
  assert.notStrictEqual(a.claims.jti, b.claims.jti);
});

test('user attributes cannot override registered claims', () => {
  const { claims } = mintEmbedToken({ ...base, attributes: { sub: 'attacker@example.com', aud: 'x' } });
  assert.strictEqual(claims.sub, 'dana@example.com');
  assert.strictEqual(claims.aud, 'tableau');
});

test('refuses to mint without credentials', () => {
  assert.throws(() => mintEmbedToken({ ...base, secretValue: '' }));
});
