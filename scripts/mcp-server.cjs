// Local Tableau MCP server for the Data Agent (passthrough auth), for when you don't have a hosted one.
//   npm run mcp   →  http://localhost:3927/tableau-mcp   (set TABLEAU_MCP_URL to that)
// The server holds no credentials: the portal forwards each user's own Tableau session as X-Tableau-Auth.
require('dotenv').config();
const { spawn } = require('child_process');

const port = process.env.TABLEAU_MCP_PORT || '3927';
const env = {
  ...process.env,
  TRANSPORT: 'http',
  AUTH: 'passthrough',
  SERVER: (process.env.TABLEAU_SERVER || '').replace(/\/+$/, ''),
  SITE_NAME: process.env.TABLEAU_SITE || '',
  PORT: port
};
if (!env.SERVER) {
  console.error('✖ TABLEAU_SERVER is not set in .env');
  process.exit(1);
}
const child = spawn('npx', ['-y', '@tableau/mcp-server@5.5.0'], { env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
