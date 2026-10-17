# Data 360 setup (Apex client portal)

Created through the Data 360 Connect REST API (`/services/data/v62.0/ssot/...`) as the org admin.
Each JSON file here is the exact request body used. Re-create in another org, in this order:

1. **Streams** — `POST /ssot/data-streams` with `streams/*.json` (CRM connector `SalesforceDotCom_Home`).
   CRM custom fields appear in Data 360 as `<Name>_c`; types must match what Data 360 expects (it says which on error).
   Then `POST /ssot/data-streams/<name>/actions/run` to refresh.
2. **Data model objects** — `POST /ssot/data-model-objects` with `dmos/*.json`.
3. **Mappings** — `POST /ssot/data-model-object-mappings?dataspace=default` with `mappings/*.json` (stream DLO → DMO).
4. **Calculated insights** — `POST /ssot/calculated-insights` with `calculated-insights/*.json`.
5. **Ingestion API** (optional, for direct event ingestion) — connector `Apex Client Portal` (`POST /ssot/connections`)
   with schema `ingestion/PortalActivity.schema.json` (`PUT /ssot/connections/<id>/schema`). Sending events needs an
   External Client App with the `cdp_ingest_api` scope; the portal currently routes activity through CRM instead.

Notes from this org: the package-kit `Account_Home` / `Contact_Home` streams were already failing (since 2025-07) and a
second stream per CRM object isn't allowed, so client name / id travel on the Opportunity, Campaign Member and Portal
Activity records themselves (formula fields + portal-written fields).
