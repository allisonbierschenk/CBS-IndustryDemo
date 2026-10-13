# Agent: Tableau Pulse Insight Brief chat

The Agent page (`/agent`) answers natural-language questions with the **Tableau Pulse Insight Brief API** (`POST /api/-/pulse/insights/brief`, `EmbeddingsService_GenerateInsightBrief`). Every word of each answer comes from Pulse. The portal adds no LLM; it renders what Pulse returns.

## How it works

```
Browser (/agent)                    Apex server                                   Tableau Cloud
GET  /api/agent/context  ─────────▶ per-user REST session (JWT sub = user email)
                                    GET /pulse/metrics:followedMetricsGroups  ──▶  the user's followed metrics
                                    GET /pulse/definitions/{id}               ──▶  each definition
                                    keep only allowed data sources (config + entitlements)
POST /api/agent/chat {question, conversationId}
                                    POST /pulse/insights/brief {messages}     ──▶  narrative + insights
                                    (conversation history kept on the server)
```

| File | Purpose |
|---|---|
| `server/lib/pulse.cjs` | Per-user Tableau session, Pulse requests (vendor media types, XSRF/cookie forwarding), metric context, Vega spec → chart series |
| `server/index.cjs` | `/api/agent/context` and `/api/agent/chat` |
| `config/tableau-content.json → agent` | Allowed data sources (by name) plus entitlement gating, featured-metric order, and number of suggested questions |
| `src/pages/Agent.jsx` | Chat UI: metrics-in-scope pills, suggested questions, KPI chips, trend chart, narrative, follow-up chips, inline errors |
| `src/components/PulseMarkup.jsx` | Safe renderer for Pulse markup (headings, bullets, `number` / `metric` / `dimension` / `insight-type-keyword` spans, `<llm_value>`, `**bold**`). It strips citations and never uses `dangerouslySetInnerHTML`. |
| `src/components/TrendChart.jsx` | D3 chart built from `source_insights[].viz` data (`truncDate` / `rawValue`, projections dropped) |

## Security model

- **Scope = the Pulse metrics the user follows in Tableau.** Nothing else is sent to Pulse. To change what a customer can ask about, change their follows in Tableau.
- **Defense in depth.** A followed metric is used only if it sits on a data source listed in `agent.datasources` that the customer is entitled to. For example, Operational Value & Savings requires `transportation` (Vantage only).
- **Row-level security** is enforced by Tableau on the published data source (`USERNAME()` = the JWT `sub`). Pulse computes each metric for the signed-in user only.
- **One Tableau session per portal user**, never a shared service account. Sessions are cached for about 110 minutes and renewed on 401.
- **Conversation history stays on the server**, keyed by a conversation ID and tied to the user. The browser can't alter the metric context sent to Tableau. Conversations expire after 1 hour.

## What we learned on this site (verified against the live API)

1. **`followedMetricsGroups` is the source of truth.** With no follows, the agent shows "You aren't following any Tableau Pulse metrics yet".
2. **Send the definition's `extension_options`, `representation_options` and `insights_options`** on each context item, alongside `definition` and `metric_specification`.
   - Without them, breakdown questions ("which engagement type has the lowest…") return `not_enough_information`, and numbers come back unformatted (0.87 instead of 86.76%).
3. **All followed metrics can go in one `metric_group_context`.** Pulse picks the relevant ones, so the app doesn't route questions by keyword. Multi-metric requests failed only when the options in step 2 were missing.
4. **`metric_group_context_resolved` is message-level.** Send `false` on user turns and `true` on the echoed assistant turn.
5. **No XSRF token was issued on this site,** and the brief works without one. The client still forwards XSRF and cookies if Tableau sends them.
6. **Response shape:** `markup`, `source_insights[]`, `follow_up_questions[]`, `group_context` and `not_enough_information`. It's a flat object, not a messages array.
7. **Latency:** roughly 10–30 s per answer with 7 metrics in scope. The UI shows an "Analyzing your data with Tableau Pulse…" card.

## Required Connected App scopes (agent session)

`tableau:content:read`, `tableau:metric_subscriptions:read`, `tableau:insight_definitions_metrics:read`, `tableau:insight_metrics:read`, `tableau:insights:read`, `tableau:insight_brief:create`

## Demo checklist

- [ ] Each demo user follows the Pulse metrics they should be able to ask about, and nothing else.
- [ ] The published data source behind those metrics has the `USERNAME()` RLS filter, and no duplicate-named data source exists.
- [ ] Open `/agent` as two different customers, ask the same question, and confirm the numbers differ.
