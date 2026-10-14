# Row-level security personas

The same dashboards serve users with different scopes. Every scope comes from **JWT user attributes** in `server/data/users.json`, so changing what a user can see is a configuration change, not a dashboard change.

| Persona | User | JWT attributes | Sees |
|---|---|---|---|
| Executive | dana.whitfield@northstar.com (and the other four executives) | `client name: [Northstar Enterprises]` | Every engagement for their organization |
| **Service-line lead** | sam.patel@northstar.com | `client name: [Northstar Enterprises]`, `service line: [Operations]` | Only Northstar's Operations engagements |
| **Engagement owner** | maya.chen@crestline.com | `client name: [Crestline Partners]`, `engagement type: [Digital Transformation]` | One engagement |
| **Portfolio partner** (consolidated) | alex.morgan@apexconsulting.com | `client name: [Crestline Partners, Helix Industries]` | Both clients combined, and no other client |

Attributes are multi-valued. A user with no `service line` or `engagement type` attribute is not narrowed on that field.

## 1. Dashboards: add a second data source filter

Keep your existing client-name calculation and its data source filter as they are. Add a **new** calculated field in the Value Intelligence workbook's data source, and add it as a second **data source filter = True**. Tableau combines data source filters with AND, so a row must pass both: the right client *and* the right scope within that client.

```
// Scope RLS  (service line / engagement type narrowing)
ISMEMBEROF("admin")
OR (
  ( ISNULL(USERATTRIBUTE("service line"))    OR USERATTRIBUTEINCLUDES("service line", [Service Line]) )
  AND
  ( ISNULL(USERATTRIBUTE("engagement type")) OR USERATTRIBUTEINCLUDES("engagement type", [Engagement Type]) )
)
```

- A user without the attribute isn't narrowed on that field: `USERATTRIBUTE` returns NULL when the JWT doesn't carry it. That covers the executives and Alex Morgan. It also covers authoring in Tableau without a JWT.
- Multi-client access (Alex: Crestline + Helix) needs no change, because your existing `USERATTRIBUTEINCLUDES("client name", …)` already matches any value in the list.
- Don't add this to the transportation workbook. Its data has no `Service Line` or `Engagement Type`, and the client-only rule is enough there.

## 2. Pulse: add a second filter on the published data source

Pulse can't read user attributes, which aren't supported in published data sources on Tableau Cloud, so it relies on `USERNAME()` and an entitlement table. Keep your existing `USERNAME()` client filter. Then:

1. Refresh the entitlement table from `data/apex_client_entitlements.csv` (`npm run generate-data`). It now has `Entitled Service Line` and `Entitled Engagement Type` columns, where `*` means all, plus rows for the three new users.
2. Make sure the entitlement table joins to the data on `Client Name`. It should be the same table your existing `USERNAME()` filter uses, so both filters evaluate the same entitlement row.
3. Add a new calculated field as a second data source filter = True:

```
// Pulse Scope RLS
ISMEMBEROF("admin")
OR (
  ( [Entitled Service Line]    = "*" OR [Entitled Service Line]    = [Service Line] )
  AND
  ( [Entitled Engagement Type] = "*" OR [Entitled Engagement Type] = [Engagement Type] )
)
```

4. Republish the data source. Pulse metrics built on it pick up the filter automatically.

## 3. Tableau Cloud setup for the new personas

1. Add the three new users. Give them the same site role as the existing demo users, and the same group membership and permissions on the Apex content.
2. Have each new user follow the Pulse metrics they should ask the agent about. The agent's scope is the user's followed metrics.
3. **Check:** sign in as Sam Patel. The Engagement Type filter should list only Operational Transformation and Process Optimization, and the KPI cards should differ from Dana's.
4. **Check:** sign in as Maya Chen. The dashboard should show only Digital Transformation. Then sign in as Alex Morgan. The dashboard should show Crestline and Helix together, and no other client.
