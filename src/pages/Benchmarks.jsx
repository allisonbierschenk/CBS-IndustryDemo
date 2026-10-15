// Industry Benchmarks (Premium) — a custom, headless view built with d3 from the governed published data
// source (VizQL Data Service, queried as the user, so row-level security applies). Premium is enforced by
// the server; Standard clients see what's included and an upgrade path.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { api } from '../lib/api.js';
import { useSession } from '../context/SessionContext.jsx';
import { useContact } from '../context/ContactContext.jsx';
import BenchmarkLock from '../components/BenchmarkLock.jsx';
import Crumbs from '../components/Crumbs.jsx';
import InfoTip from '../components/InfoTip.jsx';

const COLORS = ['#e6f264', '#7ad7f0', '#f2a65a', '#c39bff', '#6fe3b0', '#ff8fa3'];
const ZONES = [
  { from: 0, to: 25, label: 'Lagging' },
  { from: 25, to: 50, label: 'Below median' },
  { from: 50, to: 75, label: 'Above median' },
  { from: 75, to: 100, label: 'Leading' }
];
const pct = (v) => Math.round(v * 100);
const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`;
const monthLabel = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

export default function Benchmarks() {
  const { me } = useSession();
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    api('/api/benchmarks')
      .then((d) => setState({ data: d }))
      .catch((e) => setState({ error: e.message, locked: e.status === 403 }));
  }, []);

  return (
    <div className="container">
      <Crumbs items={[{ label: 'Value Intelligence', to: '/dashboards' }, { label: 'Industry Benchmarks' }]} />
      <div className="page-head">
        <div>
          <div className="kicker">★ Premium</div>
          <div className="title-row">
            <h1>Industry Benchmarks</h1>
            <InfoTip kind="benchmarks" label="About Industry Benchmarks" />
          </div>
          <p className="lead">
            How {me.tenant.shortName} ranks against anonymized {(state.data?.vertical?.[0] || me.tenant.industry).toLowerCase()} peers — by engagement, over time.
          </p>
        </div>
      </div>
      {state.loading && <div className="bm-panel bm-loading">Loading benchmarks from Tableau…</div>}
      {state.locked && <LockedPreview />}
      {state.error && !state.locked && <div className="error-msg">{state.error}</div>}
      {state.data && <BenchmarkBoard data={state.data} me={me} />}
    </div>
  );
}

function LockedPreview() {
  return (
    <div className="bm-panel bm-locked">
      <div className="bm-locked-art" aria-hidden="true">
        <svg viewBox="0 0 600 220" preserveAspectRatio="none">
          {[0.2, 0.45, 0.7].map((y, i) => (
            <path key={i} d={`M0 ${120 + i * 30} C 120 ${60 + i * 40}, 240 ${170 - i * 30}, 360 ${110 + i * 10} S 540 ${70 + i * 30}, 600 ${90 + i * 25}`} fill="none" stroke={COLORS[i]} strokeWidth="5" opacity={0.9 - y / 2} />
          ))}
        </svg>
      </div>
      <BenchmarkLock />
    </div>
  );
}

function BenchmarkBoard({ data, me }) {
  const contact = useContact();
  const series = useMemo(() => {
    const by = d3.group(data.engagements, (r) => r.engagement);
    return [...by.entries()].map(([name, rows], i) => {
      const pts = rows.map((r) => ({ month: r.month, date: new Date(`${r.month}-01T00:00:00Z`), v: r.percentile * 100 })).sort((a, b) => a.date - b.date);
      const value = d3.sum(rows, (r) => r.value || 0);
      return { name, color: COLORS[i % COLORS.length], pts, last: pts[pts.length - 1], first: pts[0], value };
    });
  }, [data]);

  const kpis = data.kpis;
  const latest = kpis[kpis.length - 1];
  const yearAgo = kpis[Math.max(0, kpis.length - 13)];
  const overall = latest ? pct(latest.percentile) : null;
  const delta = latest && yearAgo ? pct(latest.percentile) - pct(yearAgo.percentile) : null;
  const leader = [...series].sort((a, b) => b.last.v - a.last.v)[0];
  const laggard = [...series].sort((a, b) => a.last.v - b.last.v)[0];

  return (
    <div className="bm-board">
      <section className="bm-panel bm-hero">
        <Gauge value={overall} />
        <div className="bm-hero-copy">
          <div className="bm-kicker">Overall standing · {latest ? monthLabel(latest.month) : ''}</div>
          <h2>
            Ahead of <span>{overall}%</span> of {data.vertical?.[0] || 'industry'} peers
          </h2>
          <p>
            {delta != null && (
              <>
                {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} pts vs {monthLabel(yearAgo.month)}.{' '}
              </>
            )}
            Strongest: <b>{leader?.name}</b> ({ordinal(Math.round(leader?.last.v))}). Most room to grow: <b>{laggard?.name}</b> ({ordinal(Math.round(laggard?.last.v))}).
          </p>
          <button
            className="btn btn-lime btn-sm"
            onClick={() =>
              contact(
                'Schedule a review',
                `We'd like an advisory session on our Industry Benchmarks: ${me.tenant.shortName} is at the ${ordinal(overall)} percentile overall; ${laggard?.name} is at the ${ordinal(Math.round(laggard?.last.v))}. What would it take to move it into the top quartile?`
              )
            }
          >
            Book a benchmark review
          </button>
        </div>
      </section>

      <section className="bm-panel bm-trend">
        <div className="bm-panel-head">
          <h3>Percentile over time</h3>
          <span>Each engagement against the peer distribution · median = benchmark target</span>
        </div>
        <TrendChart series={series} target={(data.engagements[0]?.target ?? 0.5) * 100} />
      </section>

      <section className="bm-panel bm-track">
        <div className="bm-panel-head">
          <h3>Where you stand</h3>
          <span>Latest percentile by engagement · dot size = business value delivered</span>
        </div>
        <StandingTrack series={series} />
      </section>

      <section className="bm-panel bm-bullets">
        <div className="bm-panel-head">
          <h3>Against target</h3>
          <span>{latest ? monthLabel(latest.month) : ''}</span>
        </div>
        {latest && (
          <div className="bullet-list">
            <Bullet label="Value Realization Rate" value={latest.vrr} target={latest.vrrTarget} />
            <Bullet label="Engagement Health" value={latest.health} target={latest.healthTarget} />
            <Bullet label="Cycle Time Reduction" value={latest.cycle} target={latest.cycleTarget} />
          </div>
        )}
      </section>
    </div>
  );
}

/** Radial gauge 0–100 with quartile arcs and an animated needle arc. */
function Gauge({ value }) {
  const size = 220;
  const r = 92;
  const arc = d3.arc().innerRadius(r - 16).outerRadius(r).cornerRadius(8);
  const angle = d3.scaleLinear().domain([0, 100]).range([-Math.PI * 0.75, Math.PI * 0.75]);
  return (
    <svg className="bm-gauge" width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} role="img" aria-label={`${value}th percentile`}>
      <defs>
        <linearGradient id="gaugeGrad" x1="0" x2="1" y1="1" y2="0">
          <stop offset="0" stopColor="#7ad7f0" />
          <stop offset="1" stopColor="#e6f264" />
        </linearGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {ZONES.map((z) => (
        <path key={z.label} d={arc({ startAngle: angle(z.from) + 0.02, endAngle: angle(z.to) - 0.02 })} fill="rgba(255,255,255,.08)" />
      ))}
      {value != null && <path className="bm-gauge-fill" d={arc({ startAngle: angle(0), endAngle: angle(value) })} fill="url(#gaugeGrad)" filter="url(#glow)" />}
      {[25, 50, 75].map((t) => {
        const a = angle(t) - Math.PI / 2;
        return <circle key={t} cx={Math.cos(a) * (r + 10)} cy={Math.sin(a) * (r + 10)} r="2" fill="rgba(255,255,255,.4)" />;
      })}
      <text className="bm-gauge-num" y="6" textAnchor="middle">
        {value}
        <tspan className="bm-gauge-suf" dy="-22">
          {value != null ? ordinal(value).replace(String(value), '') : ''}
        </tspan>
      </text>
      <text className="bm-gauge-lbl" y="34" textAnchor="middle">
        percentile
      </text>
    </svg>
  );
}

/** Multi-line percentile trend over quartile bands, with a hover crosshair. */
function TrendChart({ series, target }) {
  const ref = useRef(null);
  const [w, setW] = useState(900);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const h = 320;
  const m = { t: 14, r: 200, b: 28, l: 44 };
  const dates = series.flatMap((s) => s.pts.map((p) => p.date));
  const x = d3.scaleUtc().domain(d3.extent(dates)).range([m.l, w - m.r]);
  // Zoom to where the data is (always keeping the peer median in view), clamped to the 0–100 scale.
  const vals = series.flatMap((s) => s.pts.map((p) => p.v)).concat(target);
  const lo = Math.max(0, Math.floor((d3.min(vals) - 8) / 5) * 5);
  const hi = Math.min(100, Math.ceil((d3.max(vals) + 8) / 5) * 5);
  const y = d3.scaleLinear().domain([lo, hi]).range([h - m.b, m.t]);
  const clampY = (v) => y(Math.max(lo, Math.min(hi, v)));
  // End labels: keep at least 16px apart so they never overlap.
  const labels = [...series].sort((a, b) => y(a.last.v) - y(b.last.v)).map((s) => ({ s, y: y(s.last.v) }));
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 16);
  const line = d3.line().x((p) => x(p.date)).y((p) => y(p.v)).curve(d3.curveMonotoneX);
  const months = [...new Set(dates.map((d) => +d))].sort((a, b) => a - b).map((t) => new Date(t));
  const onMove = (e) => {
    const box = ref.current.getBoundingClientRect();
    const px = e.clientX - box.left;
    const near = d3.least(months, (d) => Math.abs(x(d) - px));
    setHover(near ? { date: near, x: x(near) } : null);
  };
  return (
    <div ref={ref} className="bm-trend-wrap" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg width={w} height={h} role="img" aria-label="Benchmark percentile over time by engagement">
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.name} id={`area${i}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={s.color} stopOpacity=".1" />
              <stop offset="1" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ZONES.filter((z) => z.to > lo && z.from < hi).map((z, i) => (
          <g key={z.label}>
            <rect x={m.l} width={w - m.l - m.r} y={clampY(z.to)} height={clampY(z.from) - clampY(z.to)} fill={i % 2 ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.015)'} />
            <text className="bm-zone-lbl" x={m.l + 8} y={clampY(z.to) + 14}>
              {z.label}
            </text>
          </g>
        ))}
        {y.ticks(5).map((t) => (
          <text key={t} className="bm-axis" x={m.l - 10} y={y(t) + 4} textAnchor="end">
            {t}
          </text>
        ))}
        {x.ticks(6).map((t) => (
          <text key={+t} className="bm-axis" x={x(t)} y={h - 8} textAnchor="middle">
            {d3.utcFormat('%b %y')(t)}
          </text>
        ))}
        <line x1={m.l} x2={w - m.r} y1={y(target)} y2={y(target)} className="bm-target" />
        <text className="bm-target-lbl" x={w - m.r + 6} y={y(target) + 4}>
          Peer median
        </text>
        {series.map((s, i) => (
          <path key={`a-${s.name}`} d={d3.area().x((p) => x(p.date)).y0(h - m.b).y1((p) => y(p.v)).curve(d3.curveMonotoneX)(s.pts)} fill={`url(#area${i})`} />
        ))}
        {series.map((s) => (
          <path key={s.name} className="bm-line" d={line(s.pts)} stroke={s.color} />
        ))}
        {labels.map(({ s, y: ly }) => (
          <g key={`e-${s.name}`}>
            <circle cx={x(s.last.date)} cy={y(s.last.v)} r="5" fill={s.color} className="bm-pulse" />
            <text className="bm-end-lbl" x={x(s.last.date) + 12} y={ly + 4} fill={s.color}>
              {Math.round(s.last.v)} · {s.name}
            </text>
          </g>
        ))}
        {hover && (
          <g>
            <line x1={hover.x} x2={hover.x} y1={m.t} y2={h - m.b} className="bm-cross" />
            {series.map((s) => {
              const p = s.pts.find((q) => +q.date === +hover.date);
              return p ? <circle key={s.name} cx={hover.x} cy={y(p.v)} r="4" fill="#111614" stroke={s.color} strokeWidth="2" /> : null;
            })}
          </g>
        )}
      </svg>
      {hover && (
        <div className="bm-tip" style={{ left: Math.min(hover.x + 14, w - 220) }}>
          <b>{d3.utcFormat('%B %Y')(hover.date)}</b>
          {series.map((s) => {
            const p = s.pts.find((q) => +q.date === +hover.date);
            return p ? (
              <div key={s.name}>
                <i style={{ background: s.color }} />
                {s.name}
                <span>{ordinal(Math.round(p.v))}</span>
              </div>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}

/** 0–100 track with quartile zones; one dot per engagement, sized by business value. */
function StandingTrack({ series }) {
  const max = d3.max(series, (s) => s.value) || 1;
  const size = d3.scaleSqrt().domain([0, max]).range([10, 26]);
  const sorted = [...series].sort((a, b) => b.last.v - a.last.v);
  return (
    <div className="track">
      <div className="track-zones">
        {ZONES.map((z) => (
          <span key={z.label} style={{ left: `${z.from}%`, width: `${z.to - z.from}%` }}>
            {z.label}
          </span>
        ))}
      </div>
      {sorted.map((s, i) => {
        const d = size(s.value);
        const change = Math.round(s.last.v - s.first.v);
        return (
          <div className="track-row" key={s.name} style={{ animationDelay: `${i * 90}ms` }}>
            <span className="track-name">{s.name}</span>
            <div className="track-rail">
              <span className="track-fill" style={{ width: `${s.last.v}%`, background: `linear-gradient(90deg, transparent, ${s.color})` }} />
              <span className="track-dot" style={{ left: `${s.last.v}%`, width: d, height: d, background: s.color, boxShadow: `0 0 18px ${s.color}` }} title={`${d3.format('$,.3s')(s.value).replace('G', 'B')} delivered`} />
            </div>
            <span className="track-val">
              {ordinal(Math.round(s.last.v))}
              <small className={change >= 0 ? 'up' : 'down'}>
                {change >= 0 ? '▲' : '▼'}
                {Math.abs(change)}
              </small>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Bullet({ label, value, target }) {
  if (value == null || target == null) return null;
  const scaleMax = Math.max(value, target) * 1.25;
  const ahead = value >= target;
  return (
    <div className="bullet">
      <div className="bullet-head">
        <span>{label}</span>
        <b className={ahead ? 'up' : 'down'}>
          {d3.format('.0%')(value)} <small>vs {d3.format('.0%')(target)} target</small>
        </b>
      </div>
      <div className="bullet-rail">
        <span className="bullet-bar" style={{ width: `${(value / scaleMax) * 100}%` }} />
        <span className="bullet-target" style={{ left: `${(target / scaleMax) * 100}%` }} />
      </div>
    </div>
  );
}
