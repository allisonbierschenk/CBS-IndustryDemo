# Row-level security personas

The same dashboards serve users with different scopes. Every scope comes from **JWT user attributes** in `server/data/users.json`, so changing what a user can see is a configuration change, not a dashboard change.

| Persona | User | JWT attributes | Sees |
|---|---|---|---|
| Executive | dana.whitfield@northstar.com (and the other four executives) | `client name: [Northstar Enterprises]` | Every engagement for their organization |
| **Service-line lead** | sam.patel@northstar.com | `client name: [Northstar Enterprises]`, `service line: [Operations]` | Only Northstar's Operations engagements |
| **Engagement owner** | maya.chen@crestline.com | `client name: [Crestline Partners]`, `engagement type: [Digital Transformation]` | One engagement |
| **Portfolio partner** (consolidated) | alex.morgan@apexconsulting.com | `client name: [Crestline Partners, Helix Industries]` | Both clients combined, and no other client |

Attributes are multi-valued. A user with no `service line` or `engagement type` attribute is not narrowed on that field.

## 1. Dashboards: workbook data source filter

Replace the existing `Client Name RLS` calculation in each workbook with the following, and keep it as a **data source filter = True**:

```
// Client Name RLS
ISMEMBEROF("admin")
OR (
  USERATTRIBUTEINCLUDES("client name", [Client Name])
  AND ( ISNULL(USERATTRIBUTE("service line"))    OR USERATTRIBUTEINCLUDES("service line", [Service Line]) )
  AND ( ISNULL(USERATTRIBUTE("engagement type")) OR USERATTRIBUTEINCLUDES("engagement type", [Engagement Type]) )
)
```

The transportation data source has no `Service Line` or `Engagement Type` fields. Keep its client-only rule there.

## 2. Pulse: published data source

Pulse can't read user attributes, which aren't supported in published data sources on Tableau Cloud, so it uses `USERNAME()`. Join the published data source to `data/apex_client_entitlements.csv` (`npm run generate-data` writes one row per user and client, with `Service Line` and `Engagement Type` columns where `*` means all). Then use this data source filter:

```
ISMEMBEROF("admin")
OR (
  USERNAME() = [Tableau Username]
  AND ( [Entitled Service Line]    = "*" OR [Entitled Service Line]    = [Service Line] )
  AND ( [Entitled Engagement Type] = "*" OR [Entitled Engagement Type] = [Engagement Type] )
)
```

Join on `Client Name`. The entitlement columns are prefixed `Entitled …` to avoid name clashes.

## 3. Tableau Cloud setup for the new personas

1. Add the three new users. Give them the same site role as the existing demo users, and the same group membership and permissions on the Apex content.
2. Have each new user follow the Pulse metrics they should ask the agent about. The agent's scope is the user's followed metrics.
3. **Check:** sign in as Sam Patel. The Engagement Type filter should list only Operational Transformation and Process Optimization, and the KPI cards should differ from Dana's.
