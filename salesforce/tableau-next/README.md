# Tableau Next — Apex Client Growth (on D360)

Created through the Tableau Next / Semantic Layer REST APIs (API v64.0) as the org admin. Re-create in order:

1. `POST /services/data/v64.0/ssot/semantic/models` — `semantic-model.json` (semantic model "Apex Client Growth" on the
   D360 data model objects Apex_Premium_Upgrade__dlm, Apex_Portal_Activity__dlm, Apex_Campaign_Response__dlm).
2. `POST /services/data/v64.0/tableau/workspaces` — `workspace.json`.
3. `POST /services/data/v64.0/tableau/visualizations` — each `viz-*.json` (count function is `Countd`; weekly dates `DateTruncWeek`).
4. `POST /services/data/v64.0/tableau/dashboards` — `dashboard.json` ("Apex Client Growth (D360)", 2×2 + title).
   The layout needs `rowHeight` (10) and `style`; without them the widgets are placed but the page renders blank.

Embed in Salesforce: Lightning App Builder → the page Apex staff use (e.g. Sales - Console Home) → add the Tableau Next
dashboard component → pick "Apex Client Growth (D360)" → Save / Activate.
