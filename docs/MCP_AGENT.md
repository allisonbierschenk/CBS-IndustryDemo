# Data Agent: OpenAI + Tableau MCP server

The **Data Agent** chat bubble (bottom-right on every signed-in page) answers open-ended questions about the customer's data. An OpenAI model calls tools on the **Tableau MCP server** ([tableau/tableau-mcp](https://github.com/tableau/tableau-mcp)). This follows the pattern in [Tab-SE/embedding_playbook](https://github.com/Tab-SE/embedding_playbook) (`src/app/api/chat/agent/mcp.ts`).

Two agents, named so users can tell them apart:

| | **Pulse Agent** (top bar → `/agent`) | **Data Agent** (chat bubble, every page) |
|---|---|---|
| Runs on | Tableau Pulse Insight Brief | Tableau MCP server + OpenAI |
| Answers from | The Pulse metrics the user follows | Any field on the client's data sources (VizQL Data Service) |
| AI cost | Included with Tableau+, unmetered | Metered by the LLM provider (your key) |
| (i) popover | `agent` | `mcpAgent` (`src/lib/provenance.js`) |

```
Browser (chat bubble)        Apex server                                   Tableau MCP (AUTH=passthrough)       Tableau Cloud
POST /api/mcp/chat ────────▶ per-user REST session (JWT sub = user email,
                             + 'client name' attribute)
                             OpenAI chat.completions  ⇄  MCP tools/call ─▶ X-Tableau-Auth: <user's token> ──▶ VizQL Data Service
                                                                                                              RLS = that user
```

## Auth: passthrough

- The portal signs each user in to Tableau with the Connected App (Direct Trust) and their own `sub` and user attributes. It then forwards that REST token to MCP in `X-Tableau-Auth` on every request.
- The MCP server holds **no credentials** and acts as the user. Tableau permissions and row-level security apply to every query. There is no shared service account and no separate AI identity.
- Verified on this site: the same `query-datasource` call returns only `Northstar Enterprises` for Dana and only `Crestline Partners` for Priya.
- The MCP session uses its own Tableau session, separate from the Pulse one. Its scopes are `MCP_SCOPES` in `server/index.cjs`. Tableau releases before 2026.2 also need `tableau:*:*` (`TABLEAU_MCP_WILDCARD_SCOPE`).

## Guardrails (server-side)

- **Tool allowlist:** `get-datasource-metadata`, `query-datasource` and the read-only Pulse tools. Nothing that writes, deletes or lists the whole site (`server/lib/mcpAgent.cjs → ALLOWED_TOOLS`).
- **Data-source pinning:** the model gets the customer's entitled data sources (from `config/tableau-content.json → agent.datasources` plus entitlements) with their LUIDs. Any data tool call that uses another LUID is rejected before it reaches MCP.
- **Trace:** each answer lists the MCP tool calls it made, including the VizQL query JSON, under "N Tableau MCP tool calls".

## Setup

```bash
# .env
TABLEAU_MCP_URL=https://<your-mcp-host>/tableau-mcp   # include the /tableau-mcp path; the host root returns "Cannot POST /"
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini                              # optional
```

No hosted MCP server? Run one locally. The script sets `TRANSPORT=http`, `AUTH=passthrough`, `SERVER` and `SITE_NAME` from `.env`:

```bash
npm run mcp        # → http://localhost:3927/tableau-mcp
npm run dev:mcp    # MCP + API + web together
```

## Demo checklist

- [ ] Open the chat bubble as Dana (Northstar), then Priya (Crestline). Ask "Which service line delivered the most business value?" Each sees only their own client.
- [ ] Expand the tool-call trace to show the VizQL Data Service query the agent wrote.
