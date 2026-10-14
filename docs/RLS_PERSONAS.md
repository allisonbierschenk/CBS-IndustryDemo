# Row-level security personas

The same dashboards serve users with different scopes. Every scope comes from **JWT user attributes** in `server/data/users.json`, so changing what a user can see is a configuration change, not a dashboard change.

| Persona | User | JWT attributes | Sees |
|---|---|---|---|
| Executive | dana.whitfield@northstar.com (and the other four executives) | `client name: [Northstar Enterprises]` | Every engagement for their organization |
| **Service-line lead** | sam.patel@northstar.com | `client name: [Northstar Enterprises]`, `service line: [Operations]` | Only Northstar's Operations engagements |
| **Engagement owner** | maya.chen@crestline.com | `client name: [Crestline Partners]`, `engagement type: [Digital Transformation]` | One engagement |
| **Portfolio partner** (consolidated) | alex.morgan@apexconsulting.com | `client name: [Crestline Partners, Helix Industries]` | Both clients combined, and no other client |

Attributes are multi-valued. A user with no `service line` or `engagement type` attribute is not narrowed on that field.

## 1. Add one scope filter to the Value Intelligence published data source

Keep your existing client-name calculation and filter as they are. Add a **new** calculated field to the published data source **Apex Consulting - Client Value Intelligence**, and add it as a second **data source filter = True**. Tableau combines data source filters with AND, so a row must pass both: the right client *and* the right scope within that client.

```
// Scope RLS  (service line / engagement type narrowing)
ISMEMBEROF("admin")
OR (
  ( ISNULL(USERATTRIBUTE("service line"))    OR USERATTRIBUTEINCLUDES("service line", [Service Line]) )
  AND
  ( ISNULL(USERATTRIBUTE("engagement type")) OR USERATTRIBUTEINCLUDES("engagement type", [Engagement Type]) )
)
```

Because the filter lives in the published data source, it applies to the embedded dashboard and the Pulse metrics built on it. Pulse honors user attribute functions, so no entitlement table is needed.

- A user without the attribute isn't narrowed on that field: `USERATTRIBUTE` returns NULL when the JWT doesn't carry it. That covers the executives and Alex Morgan.
- Multi-client access (Alex: Crestline + Helix) is already handled by your existing `USERATTRIBUTEINCLUDES("client name", …)`.
- **Not on Apex Consulting - Operational Value & Savings.** That data source has no `Service Line` or `Engagement Type`. VizQL Data Service returns `Unknown Field: Service Line`. Its client-only rule is enough.

## 2. Tableau Cloud setup for the new personas

1. Add the three new users. Give them the same site role as the existing demo users, and the same group membership and permissions on the Apex content.
2. Have each new user follow the Pulse metrics they should ask the agent about. The agent's scope is the user's followed metrics.
3. **Check:** sign in as Sam Patel. The Engagement Type filter should list only Operational Transformation and Process Optimization, and the KPI cards should differ from Dana's.
4. **Check:** sign in as Maya Chen. The dashboard should show only Digital Transformation. Then sign in as Alex Morgan. The dashboard should show Crestline and Helix together, and no other client.
