// Value Intelligence — the client's home page: account summary, the embedded Value Intelligence
// dashboard (KPI cards, engagement charts, Premium benchmarks), engagements and benchmark access.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { formatMonth } from '../lib/api.js';
import { selectedValue } from '../lib/tableau.js';
import { useContact } from '../context/ContactContext.jsx';
import { useSession } from '../context/SessionContext.jsx';
import DashboardFilters from '../components/DashboardFilters.jsx';
import EngagementCards from '../components/EngagementCards.jsx';
import AnalyticsAssistantButton from '../components/AnalyticsAssistantButton.jsx';
import ExportMenu from '../components/ExportMenu.jsx';
import EngagementScorecard from '../components/EngagementScorecard.jsx';
import SelectionActions from '../components/SelectionActions.jsx';
import SubscribeButton from '../components/SubscribeButton.jsx';
import ViewsMenu from '../components/ViewsMenu.jsx';
import Icon from '../components/Icon.jsx';
import InfoTip from '../components/InfoTip.jsx';
import PremiumPanel from '../components/PremiumPanel.jsx';
import { EmbedSlot } from '../context/EmbedContext.jsx';
import TierBadge from '../components/TierBadge.jsx';

// Filter state lives in the URL (?service-line=…&engagement-type=…) so links and QR codes reopen it.
const slug = (field) => field.toLowerCase().replace(/[^a-z0-9]+/g, '-');

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function ValueIntelligence() {
  const { me } = useSession();
  const contact = useContact();
  const { hash } = useLocation();
  const dashRef = useRef(null);
  const [contextLink, setContextLink] = useState(null);
  const [viz, setViz] = useState(null);
  const [params, setParams] = useSearchParams();
  // A link with filters (e.g. from Share / QR) is applied once the dashboard is ready.
  const [filterRequest, setFilterRequest] = useState(() => {
    const values = {};
    for (const f of me.views.valueIntelligence.filters || []) if (params.get(slug(f.field))) values[f.field] = params.get(slug(f.field));
    return Object.keys(values).length ? { values, nonce: Date.now() } : null;
  });
  const t = me.tenant;
  const vi = me.views.valueIntelligence;
  const early = me.relationship.monthsOfHistory <= 6;
  const opsEngagement = t.engagements.find((e) => e.analytics && me.views[e.analytics]?.entitled);
  const engagementField = vi.filters.find((f) => /engagement/i.test(f.field))?.field;

  // In-page anchors (#engagements, #benchmarks) from the nav, breadcrumbs and footer.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);

  const scrollToDashboard = () => dashRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Contextual navigation: selecting e.g. "Supply Chain Optimization" offers the deeper page.
  const onMarkSelection = useCallback(
    async (event) => {
      const ctx = me.contextLinks;
      if (!ctx?.links.length) return;
      const value = await selectedValue(event, ctx.field);
      setContextLink(ctx.links.find((l) => l.value === value) || null);
    },
    [me.contextLinks]
  );

  const onFilterChange = useCallback(
    (field, value) => {
      const ctx = me.contextLinks;
      if (ctx && field === ctx.field) setContextLink(ctx.links.find((l) => l.value === value) || null);
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (value) n.set(slug(field), value);
          else n.delete(slug(field));
          return n;
        },
        { replace: true }
      );
    },
    [me.contextLinks, setParams]
  );

  const viewEngagement = (e) => {
    if (engagementField) setFilterRequest({ field: engagementField, value: e.dataValue || e.name, nonce: Date.now() });
    scrollToDashboard();
  };

  return (
    <div className="container">
      <section className="account-head">
        <div>
          <div className="kicker">
            {greeting()}, {me.user.name.split(' ')[0]}
          </div>
          <h1>{t.clientName}</h1>
          <div className="account-facts">
            <TierBadge tier={t.tier} />
            <span className="fact-pill">
              Industry <b>{t.industry}</b>
            </span>
            <span className="fact-pill">
              Client since <b>{formatMonth(t.clientSince)}</b>
            </span>
            <span className="fact-pill">
              Active engagements <b>{t.engagements.length}</b>
            </span>
            {(me.scope?.narrowed || me.scope?.clients?.length > 1) && (
              <span className="fact-pill" title="Your data access, enforced by Tableau row-level security">
                Your access <b>{me.scope.label}</b>
              </span>
            )}
          </div>
        </div>
        <div className="account-actions">
          {opsEngagement && (
            <Link className="btn btn-ghost" to="/transportation">
              <Icon name="truck" />
              {me.views.transportation.title}
            </Link>
          )}
          <button className="btn btn-dark" onClick={() => contact('Schedule a review')}>
            <Icon name="calendar" />
            Schedule a review
          </button>
        </div>
      </section>

      {early && (
        <div className="notice">
          <Icon name="calendar" />
          <div>
            <b>Early-stage relationship · {me.relationship.monthsOfHistory} months of history</b>
            Your engagements began in {formatMonth(t.clientSince)}. Prior-period comparisons appear only where a comparable period
            exists; long-term value realization will become clearer as programs mature.
          </div>
        </div>
      )}

      <section className="section" ref={dashRef} id="dashboard" aria-labelledby="vi-title" style={{ paddingTop: 24 }}>
        <div className="viz-card">
          <div className="viz-card-head">
            <div>
              <h3 id="vi-title">{vi.title}</h3>
              <p>Year-to-date performance across {t.shortName}&apos;s engagements</p>
            </div>
            <div className="viz-meta">
              <AnalyticsAssistantButton viz={viz} />
              <ViewsMenu viz={viz} />
              <SubscribeButton viewKey="valueIntelligence" title={vi.title} />
              <ExportMenu viz={viz} title={vi.title} />
              <InfoTip kind="valueIntelligence" label="About this dashboard" />
            </div>
          </div>
          {viz && vi.filters.length > 0 && (
            <DashboardFilters viz={viz} filters={vi.filters} onChange={onFilterChange} request={filterRequest} />
          )}
          {/* The dashboard is preloaded at sign-in (see EmbedContext); this slot is where it appears. */}
          <EmbedSlot viewKey="valueIntelligence" onMarkSelection={onMarkSelection} onViz={setViz} />
        </div>
      </section>

      {viz && me.features?.scorecard && (
        <section className="section" id="scorecard" style={{ paddingTop: 24 }}>
          <EngagementScorecard
            viz={viz}
            worksheet={me.features.scorecard.worksheet}
            keyField={me.features.scorecard.keyField}
            maxRows={me.features.scorecard.maxRows}
            onSelect={(value) => {
              setFilterRequest({ field: me.features.scorecard.keyField, value, nonce: Date.now() });
              scrollToDashboard();
            }}
          />
        </section>
      )}

      <section className="section" id="engagements" aria-labelledby="eng-title">
        <div className="section-head">
          <div>
            <h2 className="section-title" id="eng-title">Your engagements</h2>
            <p className="muted">Select an engagement to see it on your dashboard.</p>
          </div>
        </div>
        <EngagementCards me={me} onView={viewEngagement} />
      </section>

      <section className="section" id="benchmarks" aria-labelledby="bm-title">
        <div className="section-head">
          <h2 className="section-title" id="bm-title">Industry Performance Benchmarks</h2>
        </div>
        <PremiumPanel me={me} onViewBenchmarks={scrollToDashboard} />
      </section>

      {/* Select marks in the dashboard → act on them; also carries the contextual deep link. */}
      <SelectionActions viz={viz} title={vi.title} extra={contextLink} onDismissExtra={() => setContextLink(null)} pulseSource="Value Intelligence" />
    </div>
  );
}
