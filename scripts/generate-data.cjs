// Generates reference data for the Apex demo Tableau content (deterministic — same output every run).
//   data/apex_engagement_performance.csv  monthly facts per client × engagement (the five stories)
//   data/apex_industry_benchmarks.csv     anonymized peer quantiles + the client's own YTD value (one row per client × KPI)
// Use these if your existing data source doesn't already contain all five clients with a [Client Name] column.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data');
fs.mkdirSync(OUT, { recursive: true });

// ── Deterministic noise ─────────────────────────────────────────────────────
let seed = 20261012;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const jitter = (amp) => (rand() * 2 - 1) * amp;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
// ease: 1 = linear, >1 = accelerating change late (e.g. a collapse), <1 = early change
const curve = ([a, b], t, ease = 1) => lerp(a, b, Math.pow(t, ease));

const monthsFrom = (startIso, endIso) => {
  const out = [];
  const d = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
};

const LAST_MONTH = '2026-09-01'; // last complete month as of the demo build

// plannedHours = per month; rate = $/hr; targetMultiple = targeted $ value per $ of planned fees.
// vrr/health/hours/ontime are [start, end] ratios across the client's history.
const CLIENTS = [
  {
    client: 'Northstar Enterprises', industry: 'Logistics & Distribution', region: 'Northeast', tier: 'Standard', start: '2025-01-01',
    engagements: [
      { name: 'Operational Transformation', plannedHours: 1400, rate: 300, targetMultiple: 3.4, vrr: [0.62, 0.08], vrrEase: 1.6, health: [0.70, 0.22], hours: [0.98, 0.82], ontime: [0.85, 0.35] },
      { name: 'Process Optimization', plannedHours: 900, rate: 275, targetMultiple: 3.0, vrr: [0.80, 0.48], vrrEase: 1.4, health: [0.78, 0.48], hours: [1.0, 0.9], ontime: [0.88, 0.6] },
      { name: 'Technology Modernization', plannedHours: 1100, rate: 325, targetMultiple: 3.5, vrr: [0.82, 0.90], health: [0.82, 0.86], hours: [1.0, 1.0], ontime: [0.9, 0.92] }
    ]
  },
  {
    client: 'Crestline Partners', industry: 'Technology', region: 'West', tier: 'Premium', start: '2025-01-01',
    engagements: [
      { name: 'Digital Transformation', plannedHours: 1600, rate: 350, targetMultiple: 3.8, vrr: [0.90, 1.08], health: [0.85, 0.93], hours: [1.0, 1.01], ontime: [0.9, 0.96] },
      { name: 'Agile Transformation', plannedHours: 900, rate: 300, targetMultiple: 3.2, vrr: [0.82, 0.95], health: [0.82, 0.88], hours: [0.98, 1.0], ontime: [0.88, 0.93] },
      { name: 'Change Management', plannedHours: 600, rate: 260, targetMultiple: 3.0, vrr: [0.80, 0.76], health: [0.80, 0.72], hours: [0.97, 0.95], ontime: [0.86, 0.82] },
      { name: 'Talent & Workforce Strategy', plannedHours: 500, rate: 250, targetMultiple: 2.8, vrr: [0.78, 0.70], health: [0.76, 0.66], hours: [0.96, 0.92], ontime: [0.84, 0.78] }
    ]
  },
  {
    client: 'Meridian Solutions', industry: 'Healthcare', region: 'Midwest', tier: 'Standard', start: '2025-01-01',
    engagements: [
      { name: 'ERP Implementation', plannedHours: 2000, rate: 340, targetMultiple: 3.0, vrr: [0.55, 0.18], vrrEase: 1.3, health: [0.62, 0.26], hours: [1.05, 1.30], ontime: [0.75, 0.28] },
      { name: 'Compliance & Risk', plannedHours: 700, rate: 300, targetMultiple: 3.0, vrr: [0.84, 0.90], health: [0.84, 0.86], hours: [1.0, 1.0], ontime: [0.9, 0.92] },
      { name: 'Process Optimization', plannedHours: 650, rate: 275, targetMultiple: 3.0, vrr: [0.76, 0.82], health: [0.8, 0.8], hours: [0.98, 1.0], ontime: [0.86, 0.88] }
    ]
  },
  {
    client: 'Vantage Group', industry: 'Logistics & Distribution', region: 'South', tier: 'Premium', start: '2025-01-01',
    engagements: [
      { name: 'Supply Chain Optimization', plannedHours: 1200, rate: 310, targetMultiple: 3.8, vrr: [0.85, 1.10], health: [0.84, 0.94], hours: [1.0, 1.0], ontime: [0.9, 0.97] },
      { name: 'Digital Manufacturing', plannedHours: 1300, rate: 330, targetMultiple: 3.6, vrr: [0.80, 1.05], health: [0.82, 0.92], hours: [0.98, 1.0], ontime: [0.88, 0.95] },
      { name: 'Operational Excellence', plannedHours: 900, rate: 290, targetMultiple: 4.0, vrr: [0.88, 1.12], health: [0.86, 0.95], hours: [1.0, 1.0], ontime: [0.92, 0.98] },
      { name: 'Change Management', plannedHours: 500, rate: 260, targetMultiple: 3.2, vrr: [0.82, 0.98], health: [0.84, 0.91], hours: [1.0, 1.0], ontime: [0.9, 0.95] }
    ]
  },
  {
    client: 'Helix Industries', industry: 'Energy', region: 'West', tier: 'Standard', start: '2026-06-01',
    engagements: [
      { name: 'ESG & Sustainability', plannedHours: 800, rate: 300, targetMultiple: 3.2, vrr: [0.30, 0.62], health: [0.84, 0.90], hours: [0.95, 1.0], ontime: [0.9, 1.0] },
      { name: 'Operational Excellence', plannedHours: 900, rate: 290, targetMultiple: 3.4, vrr: [0.35, 0.70], health: [0.86, 0.90], hours: [0.96, 1.0], ontime: [0.92, 1.0] },
      { name: 'Technology Enablement', plannedHours: 700, rate: 310, targetMultiple: 3.0, vrr: [0.28, 0.58], health: [0.82, 0.88], hours: [0.94, 0.98], ontime: [0.88, 0.95] }
    ]
  }
];

const status = (score) => (score >= 70 ? 'On Track' : score >= 40 ? 'At Risk' : 'Critical');

// ── Engagement performance ──────────────────────────────────────────────────
const perf = [];
for (const c of CLIENTS) {
  const months = monthsFrom(c.start, LAST_MONTH);
  for (const e of c.engagements) {
    months.forEach((month, i) => {
      const t = months.length === 1 ? 1 : i / (months.length - 1);
      const plannedHours = Math.round(e.plannedHours * (1 + jitter(0.04)));
      const deliveredHours = Math.round(plannedHours * clamp(curve(e.hours, t) + jitter(0.02), 0.5, 1.5));
      const investment = deliveredHours * e.rate;
      const targetValue = Math.round(plannedHours * e.rate * e.targetMultiple);
      const vrr = clamp(curve(e.vrr, t, e.vrrEase || 1) + jitter(0.025), 0.02, 1.3);
      const businessValue = Math.round(targetValue * vrr);
      const milestonesDue = 2 + Math.floor(rand() * 4);
      const milestonesOnTime = Math.min(milestonesDue, Math.round(milestonesDue * clamp(curve(e.ontime, t) + jitter(0.05), 0, 1)));
      const health = Math.round(clamp(curve(e.health, t) + jitter(0.02), 0.05, 1) * 100);
      perf.push({
        'Client Name': c.client,
        Industry: c.industry,
        Region: c.region,
        'Subscription Tier': c.tier,
        Engagement: e.name,
        Month: month,
        'Planned Hours': plannedHours,
        'Delivered Hours': deliveredHours,
        'Consulting Investment': investment,
        'Target Business Value': targetValue,
        'Business Value Delivered': businessValue,
        'Milestones Due': milestonesDue,
        'Milestones On Time': milestonesOnTime,
        'Engagement Health Score': health,
        'Engagement Status': status(health)
      });
    });
  }
}

// ── Aggregates (also used for benchmarks + the console story check) ─────────
function aggregate(rows) {
  const s = (k) => rows.reduce((a, r) => a + r[k], 0);
  return {
    vrr: s('Business Value Delivered') / s('Target Business Value'),
    v2i: s('Business Value Delivered') / s('Consulting Investment'),
    value: s('Business Value Delivered'),
    investment: s('Consulting Investment'),
    target: s('Target Business Value'),
    hoursVsPlan: s('Delivered Hours') / s('Planned Hours'),
    onTime: s('Milestones On Time') / s('Milestones Due'),
    health: rows.reduce((a, r) => a + r['Engagement Health Score'], 0) / rows.length
  };
}
const ytd = (rows) => rows.filter((r) => r.Month >= '2026-01-01' && r.Month <= LAST_MONTH);
const priorYtd = (rows) => rows.filter((r) => r.Month >= '2025-01-01' && r.Month <= '2025-09-01');

// ── Benchmarks (anonymized peer group; one row per client × KPI) ────────────
const PEERS = {
  'Value Realization Rate': { q: [0.62, 0.74, 0.85, 0.95], key: 'vrr', fmt: 'pct' },
  'Value-to-Investment Ratio': { q: [1.9, 2.5, 3.0, 3.5], key: 'v2i', fmt: 'x' },
  'On-Time Milestone Rate': { q: [0.7, 0.8, 0.88, 0.94], key: 'onTime', fmt: 'pct' },
  'Engagement Health': { q: [62, 72, 81, 88], key: 'health', fmt: 'num' }
};
const INDUSTRY_SHIFT = { 'Logistics & Distribution': -0.02, Technology: 0.03, Healthcare: -0.03, Manufacturing: 0.02, Energy: 0 };
const PEER_COUNT = { 'Logistics & Distribution': 21, Technology: 34, Healthcare: 26, Manufacturing: 29, Energy: 18 };

function percentile(v, [p25, p50, p75, p90]) {
  if (v <= p25) return Math.max(1, Math.round(25 * (v / p25)));
  if (v <= p50) return Math.round(25 + 25 * ((v - p25) / (p50 - p25)));
  if (v <= p75) return Math.round(50 + 25 * ((v - p50) / (p75 - p50)));
  if (v <= p90) return Math.round(75 + 15 * ((v - p75) / (p90 - p75)));
  return Math.min(99, Math.round(90 + 9 * Math.min(1, (v - p90) / (p90 - p75))));
}

function advice(kpi, pct) {
  if (pct >= 75) return `Top-quartile ${kpi.toLowerCase()} — codify what is working and extend it to the next wave of initiatives.`;
  if (pct >= 50) return `Above the peer median — targeted improvements could move ${kpi.toLowerCase()} into the top quartile.`;
  if (pct >= 25) return `Below the peer median — prioritize a joint recovery plan with your Apex engagement lead.`;
  return `Bottom-quartile ${kpi.toLowerCase()} — an executive review of scope, staffing and value levers is recommended.`;
}

const bench = [];
for (const c of CLIENTS) {
  const rows = ytd(perf.filter((r) => r['Client Name'] === c.client));
  const a = aggregate(rows);
  const shift = 1 + INDUSTRY_SHIFT[c.industry];
  for (const [kpi, def] of Object.entries(PEERS)) {
    const q = def.q.map((x) => +(x * shift).toFixed(def.fmt === 'num' ? 0 : 3));
    const value = def.fmt === 'num' ? Math.round(a[def.key]) : +a[def.key].toFixed(3);
    const pct = percentile(value, q);
    let opportunity = 0;
    if (def.key === 'vrr') opportunity = Math.max(0, Math.round((q[2] - value) * a.target));
    if (def.key === 'v2i') opportunity = Math.max(0, Math.round((q[2] - value) * a.investment));
    bench.push({
      'Client Name': c.client,
      'Industry Peer Group': `${c.industry} (anonymized, n=${PEER_COUNT[c.industry]})`,
      KPI: kpi,
      Period: '2026 YTD',
      'Peer P25': q[0],
      'Peer Median': q[1],
      'Peer P75': q[2],
      'Peer Top Decile': q[3],
      'Client Value': value,
      'Client Percentile': pct,
      'Improvement Opportunity to P75 ($)': opportunity,
      'Advisory Recommendation': advice(kpi, pct)
    });
  }
}

// ── Write CSVs ──────────────────────────────────────────────────────────────
function toCsv(rows) {
  const cols = Object.keys(rows[0]);
  const cell = (v) => (typeof v === 'string' && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}
fs.writeFileSync(path.join(OUT, 'apex_engagement_performance.csv'), toCsv(perf));
fs.writeFileSync(path.join(OUT, 'apex_industry_benchmarks.csv'), toCsv(bench));

// ── Story check ─────────────────────────────────────────────────────────────
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const usd = (v) => `$${(v / 1e6).toFixed(2)}M`;
console.log(`Wrote ${perf.length} performance rows, ${bench.length} benchmark rows → data/\n`);
for (const c of CLIENTS) {
  const all = perf.filter((r) => r['Client Name'] === c.client);
  const y = aggregate(ytd(all));
  const pyRows = priorYtd(all);
  const py = pyRows.length ? aggregate(pyRows) : null;
  console.log(`${c.client} (${c.tier}) — 2026 YTD: VRR ${pct(y.vrr)}${py ? ` (PY ${pct(py.vrr)})` : ' (no prior period)'} · V2I ${y.v2i.toFixed(2)}x · Value ${usd(y.value)} · Invest ${usd(y.investment)} · Hours ${pct(y.hoursVsPlan)} · On-time ${pct(y.onTime)} · Health ${y.health.toFixed(0)}%`);
  for (const e of c.engagements) {
    const er = all.filter((r) => r.Engagement === e.name);
    const last = er[er.length - 1];
    const ey = aggregate(ytd(er));
    console.log(`   · ${e.name.padEnd(38)} latest VRR ${pct(last['Business Value Delivered'] / last['Target Business Value']).padStart(6)} · YTD V2I ${ey.v2i.toFixed(2)}x · health ${String(last['Engagement Health Score']).padStart(3)} ${last['Engagement Status']}`);
  }
}
