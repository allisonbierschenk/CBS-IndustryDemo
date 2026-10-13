# Apex Consulting · Client Value Intelligence Portal

A Tableau Embedded industry demo for Consumer & Business Services, focused on professional services (management and technology consulting). Apex Consulting embeds Tableau dashboards and Tableau Pulse into a client portal so that five customer organizations each get a live, row-level-secured view of the value Apex delivers.

**Stack:** React 19 + React Router (`BrowserRouter`) + Vite · Node/Express API · Tableau Embedding API v3 (`<tableau-viz>`, `<tableau-pulse>`) · Connected Apps Direct Trust JWT with the `client name` user attribute.

## Quick start

```bash
npm install
cp .env.example .env          # fill in Tableau + secrets (see below)
npm run generate-data         # optional: reference CSVs in data/
npm run check                 # pre-demo readiness check
npm run dev                   # API :3000 + React :5173 → open http://localhost:5173
```

**Production / Heroku:**

```bash
npm run build && npm start
```

`heroku-postbuild` builds automatically. Set the `.env` values as config vars, with `NODE_ENV=production`.

## How it fits together

```
Browser (React)                    Apex server (Express)                         Tableau Cloud
───────────────                    ─────────────────────                         ─────────────
/login ── click a user ──────────▶ users.json → signed HttpOnly session + JWT preview
/  (Value Intelligence) ─ GET /api/me ──▶ tenant, entitlements, nav (no URLs for un-entitled content)
<TableauViz viewKey> ── GET /api/embed/view/:key ─▶ entitlement check → URL + fresh JWT
                                         { sub, "client name": [..], scp, jti, exp≤10m }
<tableau-viz token=JWT> ─────────────────────────────────────────────────────▶ data source filter
                                                                               USERATTRIBUTEINCLUDES('client name',[Client Name])
Switch user ⌥1–5 ─────── POST /api/auth/login ─▶ new session for that customer
```

| Path | Purpose |
|---|---|
| `server/data/users.json` | **User store.** Portal email, name, title, Tableau username (JWT `sub`), and `attributes["client name"]` |
| `server/data/tenants.json` | Customer profiles: industry, tier, engagements, presenter notes (qualitative only, no metric values) |
| `config/tableau-content.json` | Tableau view URLs, Pulse metric URLs, drill-down wiring, view entitlements |
| `server/lib/jwt.cjs` | Direct Trust JWT minting |
| `src/components/TableauViz.jsx` | Embedding API v3 wrapper (fits the dashboard's fixed size, scales to the window) |
| `src/pages/*` | Login, Value Intelligence, Transportation (Vantage), optional Invoice Details |
| `scripts/generate-data.cjs` | Deterministic data for the five customer stories + benchmark + entitlement tables |
| `docs/TABLEAU_SETUP.md` | Step-by-step Tableau Cloud configuration |
| `docs/DEMO_SCRIPT.md` | 5–7 minute talk track |

## Routes

| Route | Who |
|---|---|
| `/login` | Click a user to sign in (JWT is logged to the browser console with a jwt.io link) |
| `/` | Landing page after sign-in: **Ask the agent** or **Open dashboards** |
| `/agent` | Chat agent (not connected yet — composer disabled, links to dashboards) |
| `/dashboards` | Value Intelligence dashboard (Pulse KPIs, engagement charts, Premium benchmarks) — every customer |
| `/dashboards#benchmarks` | Premium panel: Crestline/Vantage → "view in dashboard"; Standard → locked + upgrade request |
| `/transportation` | Transportation Optimization & Savings — **Vantage only** (drill-down happens inside the workbook; invoice search above it) |
| `/help` | How to use the portal + KPI definitions |
| `/privacy` | How client data is protected |
| Contact Apex (top bar, footer, “Schedule a review”, “Ask about Premium”) | In-portal message to the Apex team → `POST /api/messages`, returns a reference number (demo: logged on the server) |

## Principles

- **No fake numbers.** If a Tableau URL isn't configured, the portal shows a "not connected" card. It never shows sample figures.
- **Defense in depth.** Entitlements are enforced at three layers: the server (no URL or token is issued), Tableau permissions (groups), and row-level security in the data.
- **Secrets stay server-side.** The browser only receives short-lived, single-use JWTs.

`npm test` runs the JWT unit tests.
