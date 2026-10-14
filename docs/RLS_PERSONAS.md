# Row-level security personas

The same dashboards serve users with different scopes. Every scope comes from **JWT user attributes** in `server/data/users.json`, so changing what a user can see is a configuration change, not a dashboard change.

| Persona | User | Sees |
|---|---|---|
| Executive | dana.whitfield@northstar.com (and the other four executives) | Every service line and engagement type for their organization |
| **Service-line lead** | sam.patel@northstar.com | Only Northstar's Operations service line |
| **Engagement owner** | maya.chen@crestline.com | Only Crestline's Digital Transformation engagement |
| **Portfolio partner** (consolidated) | alex.morgan@apexconsulting.com | Crestline Partners and Helix Industries combined, and no other client |

Every user carries four multi-valued JWT user attributes from `server/data/users.json`: `client name`, `subscription tier`, `service line` and `engagement type`. The values list exactly what the user may see and must match the data exactly; the executives' lists were read from the data source in Tableau. A user missing an attribute sees nothing (the filter fails closed). If a client gets a new service line or engagement type, add it to that client's users.

## 1. Add one scope filter to the Value Intelligence published data source

Keep your existing client-name calculation and filter as they are. Add a **new** calculated field to the published data source **Apex Consulting - Client Value Intelligence**, and add it as a second **data source filter = True**. Tableau combines data source filters with AND, so a row must pass both: the right client *and* the right scope within that client.

```
// Scope RLS
ISMEMBEROF("admin")
OR (
  USERATTRIBUTEINCLUDES("service line", [Service Line])
  AND USERATTRIBUTEINCLUDES("engagement type", [Engagement Type])
)
```

Because the filter lives in the published data source, it applies to the embedded dashboard and the Pulse metrics built on it. Pulse honors user attribute functions, so no entitlement table is needed.

- Multi-client access (Alex: Crestline + Helix) is already handled by your existing `USERATTRIBUTEINCLUDES("client name", …)`.
- **Not on Apex Consulting - Operational Value & Savings.** That data source has no `Service Line` or `Engagement Type`. VizQL Data Service returns `Unknown Field: Service Line`. Its client-only rule is enough.

## 2. Tableau Cloud setup for the new personas

1. Add the three new users. Give them the same site role as the existing demo users, and the same group membership and permissions on the Apex content.
2. Have each new user follow the Pulse metrics they should ask the agent about. The agent's scope is the user's followed metrics.
3. **Check:** sign in as Sam Patel. The Engagement Type filter should list only Operational Transformation and Process Optimization, and the KPI cards should differ from Dana's.
4. **Check:** sign in as Maya Chen. The dashboard should show only Digital Transformation. Then sign in as Alex Morgan. The dashboard should show Crestline and Helix together, and no other client.
