# Tableau Cloud setup — Apex Client Value Intelligence

This is the Tableau-side configuration for the portal. The doc sources are listed at the end, and every step was checked against them. Steps marked **⚠ verify** are behaviors the docs don't spell out, so confirm them on your site.

---

## 0. How security works (read first)

| Layer | Enforces | Where |
|---|---|---|
| Apex portal login | Who the customer is | `server/data/users.json` (server-side) |
| Portal entitlements | Which Tableau URLs and tokens the server will hand out (Premium, Northstar transportation) | `server/lib/store.cjs` → `/api/embed/*` returns 403 |
| Connected App JWT | The Tableau identity (`sub`) and the `client name` user attribute | `server/lib/jwt.cjs` |
| Tableau permissions | Which workbooks each Tableau user can open, even if they have a URL | Groups + project/workbook permissions (§4) |
| **Row-level security (dashboards)** | Which rows each customer sees | Data source filter `USERATTRIBUTEINCLUDES('client name', [Client Name])` |
| **Row-level security (Pulse)** | Which rows feed each customer's Pulse KPIs | Published data source filter `USERNAME() = [Tableau Username]` (entitlements table) |

**Why Pulse uses a different RLS function.** Tableau's docs say *"User attribute functions in published data sources (.pds) are not supported"* on Tableau Cloud. Pulse can *only* use published data sources. Pulse *"respects row-level security applied to the data source"*.

So the setup works like this:

- **Dashboards** use an embedded (workbook) data source with `USERATTRIBUTEINCLUDES` driven by the JWT `client name` claim.
- **Pulse** uses a published data source joined to an entitlements table. The table is generated from the same user store and filtered on `USERNAME()`, which equals the JWT `sub`.

Both layers are driven from one source of truth: `server/data/users.json`.

---

## 1. Site setting — user attributes

**Settings → Authentication → "Control User Access in Authentication Workflows"** → check **Enable capture of user attributes in authentication workflows** → **Save**.

Without this setting, the `client name` claim is ignored. `USERATTRIBUTEINCLUDES` then returns FALSE and every dashboard renders empty.

## 2. Connected App (Direct Trust)

1. **Settings → Connected Apps → New Connected App ▾ → Direct Trust.**
2. **Name:** `Apex Client Portal`.
3. **Applies to:** *Only one project* → `Apex Client Portal`. This project is created in §4.
   - Nested projects are **not** included, so keep all portal content directly in this project.
4. **Domain allowlist:** *Only specific domains*. Enter one per line, for example `apex-portal.herokuapp.com` and `localhost:5173`.
   - **⚠ verify:** if localhost is rejected during development, temporarily use *All domains*.
5. **Create**, then on the actions menu (`…`) choose **Enable**. New apps are disabled by default.
6. Open the app → **Generate New Secret**.
7. Copy these into `.env`:
   - Client ID → `CONNECTED_APP_CLIENT_ID`
   - Secret ID → `CONNECTED_APP_SECRET_ID`
   - Secret value → `CONNECTED_APP_SECRET_VALUE`

What the server signs:

- **Header:** `alg HS256` · `kid` = secret ID · `iss` = client ID
- **Claims:** `iss`, `sub` (Tableau username), `aud: "tableau"`, `exp` (5 min; Tableau's max is 10), unique `jti`, and `scp: ["tableau:views:embed", "tableau:insights:embed"]`
- **User attributes:** every key in `users.json → attributes`, currently `"client name": ["<Client Name>"]` and `"subscription tier": ["Premium" | "Standard"]`. USERATTRIBUTE returns the *first* value of the claim.
- The host must keep correct UTC time, or Tableau will not trust the token.

## 3. Users (one per customer)

1. **Users → Add Users → Add Users by Username.**
2. Choose the authentication method. The default is *Tableau with MFA*.
3. Enter the five usernames in email format, separated by semicolons. They must match `email` in `server/data/users.json` **exactly** (it is sent as the JWT `sub`).
   - Plus-addressing on a mailbox you control works well, e.g. `you+apex-northstar@yourcompany.com`.
4. **Site role: Viewer.** Tableau recommends Viewer for embedded Pulse, because Explorers and Creators can edit Pulse definitions.
5. **⚠ verify:** after adding the users, test each persona once. If Tableau requires the invitation to be accepted before JWT sign-in works on your site, accept each invite from the plus-address inbox.

| Portal persona | Tableau username (edit) | `client name` | Groups |
|---|---|---|---|
| Dana Whitfield — Northstar Enterprises | `dana.whitfield@northstar.com` | Northstar Enterprises | Apex Clients |
| Priya Raman — Crestline Partners | `priya.raman@crestline.com` | Crestline Partners | Apex Clients, Apex Premium Clients |
| Marcus Bell — Meridian Solutions | `marcus.bell@meridian.com` | Meridian Solutions | Apex Clients |
| Elena Ortiz — Vantage Group | `elena.ortiz@vantage.com` | Vantage Group | Apex Clients, Apex Premium Clients, Apex Logistics Analytics |
| Jordan Hayes — Helix Industries | `jordan.hayes@helix.com` | Helix Industries | Apex Clients |

## 4. Groups, project and permissions

1. **Groups:**
   - `Apex Clients` — all 5 users
   - `Apex Premium Clients` — Crestline, Vantage
   - `Apex Logistics Analytics` — Northstar
   - `Apex Data Admins` — you and any authors
2. **Project:** `Apex Client Portal`. Set content permissions to **Customizable** so each workbook can carry its own rules.
3. **Permissions** (remove *All Users* everywhere):

| Content | Group | Capabilities |
|---|---|---|
| Apex Value Intelligence (workbook) | Apex Clients | View (Viewer template). Deny Download Full Data, Web Edit |
| Apex Transportation Optimization (workbook) | Vantage user (or a Vantage-only group) | View |
| Apex Engagement Performance – Pulse (published DS) | Apex Clients | Connect + View (required for Pulse) |
| All of the above | Apex Data Admins | Full |

This makes Premium a real permission, not just hidden navigation. A Standard user who somehow obtained the benchmarks URL would still be refused by Tableau.

## 5. Data

If your existing data sources already contain all five clients with a `[Client Name]` column whose values match the user store, keep them. Otherwise, run `npm run generate-data` and use the files in `data/`:

| File | Grain | Use |
|---|---|---|
| `apex_engagement_performance.csv` | client × engagement × month (Jan-2025 → Sep-2026; Helix Jun → Sep-2026) | Value Intelligence + Pulse |
| `apex_industry_benchmarks.csv` | client × KPI (anonymized peer quantiles + the client's own YTD value) | Benchmarks |
| `apex_client_entitlements.csv` | Tableau Username → Client Name | Pulse RLS join (regenerate whenever users.json changes) |

The generator prints a story check: YTD vs prior-year KPIs per client and the latest status per engagement. Every number in the portal comes from these rows via Tableau, so KPI tiles and charts stay mathematically consistent.

### 5a. Calculated fields (in the Value Intelligence workbook)

```
Value Realization Rate     = SUM([Business Value Delivered]) / SUM([Target Business Value])          // %
Value-to-Investment Ratio  = SUM([Business Value Delivered]) / SUM([Consulting Investment])           // format: 0.00"x"
Hours Delivered vs Plan    = SUM([Delivered Hours]) / SUM([Planned Hours])                            // %
On-Time Milestone Rate     = SUM([Milestones On Time]) / SUM([Milestones Due])                        // %
Engagement Health          = AVG([Engagement Health Score]) / 100                                     // %
Net Business Value         = SUM([Business Value Delivered]) - SUM([Consulting Investment])           // RUNNING_SUM for "over time"
```

Visualizations:

- **Value Realization by Engagement:** line, MONTH(Month) × VRR, color = Engagement.
- **Net Business Value Over Time:** area, RUNNING_SUM(Net Business Value).
- **Value-to-Investment by Engagement:** bar, sorted descending, with a reference line at 1.0x.
- **Engagement Health by Initiative:** bar or bullet of Engagement Health, colored by the latest `Engagement Status` (On Track ≥ 70, At Risk 40–69, Critical < 40).

### 5b. Row-level security for dashboards (embedded data source)

1. In each workbook (Value Intelligence, Transportation, Benchmarks), keep the data source **embedded in the workbook**. Extract or live both work. Embed the credentials, because Tableau can't prompt for them through a connected app.
2. Create a calculated field:
   ```
   [RLS · Client] = USERATTRIBUTEINCLUDES('client name', [Client Name])
   ```
   The attribute name is case sensitive and must equal `USER_ATTRIBUTE_CLAIM` in `.env`.
3. **Data → Edit Data Source Filters → Add → [RLS · Client] → True.**
   - Do this **last**: in Desktop and web authoring the function returns NULL/FALSE, so the workbook goes blank.
   - Anyone opening the workbook outside the portal, without a JWT, sees no rows. That is secure by default.
4. **Transportation data** has no client column. Add one, or create a constant calc `[Client Name] = "Vantage Group"`, then apply the same filter.
5. **Benchmarks:** each row carries `Client Name`. The filter leaves only the customer's own row per KPI, which includes the anonymized peer quantiles. No other client is ever present in the result set.

### 5c. Row-level security for Pulse (published data source)

1. In Desktop, connect `apex_engagement_performance.csv` and **join** (inner, on `Client Name`) to `apex_client_entitlements.csv`.
2. **Data source filter:**
   ```
   USERNAME() = [Tableau Username] OR ISMEMBEROF('Apex Data Admins')
   ```
   The `ISMEMBEROF` clause lets authors see data while building Pulse definitions. Customers are not in that group.
3. Add the aggregate calcs from §5a to the data source, then **publish** to `Apex Client Portal` as `Apex Engagement Performance – Pulse`.

## 6. The two dashboards

| Config key | Dashboard | Size | Who |
|---|---|---|---|
| `views.valueIntelligence` | ApexConsulting-ClientValueIntelligence / **YourValueIntelligenceDashboard**: Pulse KPI cards, engagement charts, Premium benchmarks | 1366 × 1200 (fixed) | All 5 customers |
| `views.transportation` | ApexConsulting-OperationalValueSavings / **TransportationValuePerformance** | 1200 × 1400 (fixed) | **Vantage only** |

The portal reads each dashboard's real size from the Embedding API. If the window is too narrow, it scales the dashboard to fit instead of showing scrollbars.

**Before demoing, fix these in the workbooks:**

1. **Row-level security is not applied yet.** The dashboard shows every client.
   - Add the §5b data source filter to the chart data source.
   - Add the §5c `USERNAME()` filter to the **published** data source behind the Pulse KPI cards. Pulse is always built on a published data source, and USERATTRIBUTE isn't supported there on Tableau Cloud.
2. **Remove the `Client Name` quick filter** from the dashboard. With RLS it would only ever show one value.
3. **Number formats:**
   - Value-to-Investment shows `3.02`. Make it `3.02x`.
   - On-Time Milestone Rate (`0.85`) and Engagement Health (`0.86`) should be percentages.
4. **Transportation data belongs to Vantage.** Add `[Client Name] = "Vantage Group"` (column or constant calc) plus the USERATTRIBUTEINCLUDES filter. Grant View on that workbook only to Vantage (group `Apex Logistics Analytics` → rename/repurpose for Vantage).
5. **Premium benchmarks sit inside the shared dashboard,** so a permission can't hide them from Standard clients. Every JWT now carries `"subscription tier": ["Premium"]` or `["Standard"]` from `server/data/users.json`. Filter the benchmark sheet with:
   ```
   USERATTRIBUTEINCLUDES('subscription tier', 'Premium')   // keep True
   ```
   Standard clients then see an empty benchmark panel, and the portal shows its "Available with Premium" card. As with `client name`, test whether a workbook-level calc on the published data source works; if not, use the `Subscription Tier` column in `data/apex_client_entitlements.csv` with `USERNAME()`.
6. **Contextual navigation.** Selecting a mark whose `Engagement Type` is `Supply Chain Optimization` raises "Explore Transportation Optimization & Savings". Rename in `views.valueIntelligence.contextLinks` if your field or value differs.
7. **Drill-down.** Invoice drill-down stays inside the Transportation workbook (its own actions). To use the portal's URL-based drill-down instead, publish a separate details view and set `views.invoiceDetails.url`.

## 8. Demo-day browser

- **Allow third-party cookies** for `[*.]online.tableau.com`; connected-app embedding requires them. In Chrome: Settings → Privacy → Third-party cookies → Sites allowed.
- Run `npm run check`. It validates the env, user store and URL shapes.

---

**Doc sources:**

- [Connected apps — Direct Trust](https://help.tableau.com/current/online/en-us/connected_apps_direct.htm)
- [User functions (USERATTRIBUTE / USERATTRIBUTEINCLUDES)](https://help.tableau.com/current/pro/desktop/en-us/functions_functions_user.htm#userattributeincludes)
- [Embedding API — user attributes & limitations](https://help.tableau.com/current/api/embedding_api/en-us/docs/embedding_api_user_attributes.html)
- [Embed Tableau Pulse](https://help.tableau.com/current/api/embedding_api/en-us/docs/embedding_api_pulse.html)
- [Set up Tableau Pulse (RLS & permissions)](https://help.tableau.com/current/online/en-us/pulse_set_up.htm)
- [Pulse data source requirements](https://help.tableau.com/current/online/en-us/pulse_data_source_requirements.htm)
- [Add users to a site](https://help.tableau.com/current/online/en-us/sites_addusers.htm)
