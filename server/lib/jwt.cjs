// Tableau Connected App (Direct Trust) JWT minting.
// Spec: https://help.tableau.com/current/online/en-us/connected_apps_direct.htm
//   header : alg HS256 (only supported alg), kid = secret ID, iss = client ID
//   payload: iss, sub (Tableau username), aud "tableau", exp (<= 10 min), jti (unique), scp (list)
//   + user attribute claims, read in Tableau with USERATTRIBUTE / USERATTRIBUTEINCLUDES
//     https://help.tableau.com/current/pro/desktop/en-us/functions_functions_user.htm
const crypto = require('crypto');

const MAX_TTL_SECONDS = 600;

const DEFAULT_SCOPES = [
  'tableau:views:embed',   // <tableau-viz>
  'tableau:insights:embed' // <tableau-pulse>
];

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

function mintEmbedToken({ clientId, secretId, secretValue, username, attributes = {}, ttlSeconds = 300, scopes = DEFAULT_SCOPES }) {
  if (!clientId || !secretId || !secretValue) {
    throw new Error('Connected app credentials are not configured (CONNECTED_APP_CLIENT_ID / _SECRET_ID / _SECRET_VALUE).');
  }
  if (!username) throw new Error('Cannot mint a token without a Tableau username (sub).');

  const ttl = Math.min(Math.max(Number(ttlSeconds) || 300, 30), MAX_TTL_SECONDS);
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'HS256', typ: 'JWT', kid: secretId, iss: clientId };
  const claims = {
    ...attributes,           // user attributes first so they can never override registered claims
    iss: clientId,
    sub: username,
    aud: 'tableau',
    exp: now + ttl,
    iat: now,
    jti: crypto.randomUUID(),
    scp: scopes
  };

  const signingInput = `${b64url(header)}.${b64url(claims)}`;
  const signature = crypto.createHmac('sha256', secretValue).update(signingInput).digest('base64url');
  return { token: `${signingInput}.${signature}`, header, claims };
}

module.exports = { mintEmbedToken, DEFAULT_SCOPES, MAX_TTL_SECONDS };
