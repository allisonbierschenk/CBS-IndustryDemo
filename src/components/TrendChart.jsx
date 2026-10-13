// D3 trend chart for a Pulse insight's time series (extracted server-side from the insight's Vega spec).
import { useEffect, useId, useRef } from 'react';
import * as d3 from 'd3';

const COLORS = { up: '#1f7a4d', down: '#c0392b', flat: '#111614' };

export default function TrendChart({ points, format = 'number', tone = 'flat' }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const tipRef = useRef(null);
  const gradId = `grad-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    // de-duplicate by date (Pulse repeats the latest point), parse, sort
    const byDate = new Map();
    for (const p of points) {
      const d = new Date(p.date);
      if (!Number.isNaN(+d) && d.getUTCFullYear() > 2000 && Number.isFinite(p.value)) byDate.set(+d, { date: d, value: p.value });
    }
    const data = [...byDate.values()].sort((a, b) => a.date - b.date);
    if (data.length < 2) return;

    const fmt =
      format === 'percent'
        ? d3.format('.0%')
        : format === 'currency'
          ? (v) => (Math.abs(v) >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v.toFixed(0)}`)
          : d3.format('~s');
    const fmtTip = format === 'percent' ? d3.format('.2%') : format === 'currency' ? d3.format('$,.0f') : d3.format(',.2f');
    const color = COLORS[tone] || COLORS.flat;

    const draw = () => {
      const width = Math.max(280, Math.floor(wrap.getBoundingClientRect().width) - 8); // inner width (padding 4px each side)
      const height = 210;
      const m = { top: 18, right: 24, bottom: 34, left: 54 };
      const svg = d3.select(svgRef.current).attr('width', width).attr('height', height);
      svg.selectAll('*').remove();

      const x = d3.scaleTime().domain(d3.extent(data, (d) => d.date)).range([m.left, width - m.right]);
      const [lo, hi] = d3.extent(data, (d) => d.value);
      const pad = (hi - lo || Math.abs(hi) || 1) * 0.15;
      const y = d3.scaleLinear().domain([lo >= 0 ? Math.max(0, lo - pad) : lo - pad, hi + pad]).nice().range([height - m.bottom, m.top]);

      const defs = svg.append('defs').append('linearGradient').attr('id', gradId).attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 1);
      defs.append('stop').attr('offset', '0%').attr('stop-color', color).attr('stop-opacity', 0.22);
      defs.append('stop').attr('offset', '100%').attr('stop-color', color).attr('stop-opacity', 0);

      svg.append('g').attr('transform', `translate(${m.left},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(width - m.left - m.right)).tickFormat(fmt))
        .call((g) => g.select('.domain').remove())
        .call((g) => g.selectAll('.tick line').attr('stroke', '#e2e9e6').attr('stroke-dasharray', '3 3'))
        .call((g) => g.selectAll('.tick text').attr('fill', '#5e6a66').attr('font-size', 11));

      const idx = [...new Set([0, Math.floor(data.length / 3), Math.floor((2 * data.length) / 3), data.length - 1])];
      svg.append('g').attr('transform', `translate(0,${height - m.bottom})`)
        .call(d3.axisBottom(x).tickValues(idx.map((i) => data[i].date)).tickFormat(d3.utcFormat('%b %Y')).tickSize(0).tickPadding(10))
        .call((g) => g.select('.domain').remove())
        .call((g) => g.selectAll('.tick text').attr('fill', '#5e6a66').attr('font-size', 11))
        .call((g) => g.select('.tick:last-of-type text').attr('text-anchor', 'end'));

      const curve = d3.curveMonotoneX;
      svg.append('path').datum(data).attr('fill', `url(#${gradId})`)
        .attr('d', d3.area().x((d) => x(d.date)).y0(height - m.bottom).y1((d) => y(d.value)).curve(curve));
      svg.append('path').datum(data).attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2.5)
        .attr('d', d3.line().x((d) => x(d.date)).y((d) => y(d.value)).curve(curve));
      svg.append('g').selectAll('circle').data(data).join('circle')
        .attr('cx', (d) => x(d.date)).attr('cy', (d) => y(d.value)).attr('r', 3).attr('fill', color).attr('stroke', '#fff').attr('stroke-width', 1.5);

      const guide = svg.append('line').attr('stroke', '#8c9893').attr('stroke-dasharray', '3 3').attr('y1', m.top).attr('y2', height - m.bottom).style('opacity', 0);
      const dot = svg.append('circle').attr('r', 5.5).attr('fill', color).attr('stroke', '#fff').attr('stroke-width', 2).style('opacity', 0);
      const tip = d3.select(tipRef.current);
      const bisect = d3.bisector((d) => d.date).center;
      svg.append('rect').attr('x', m.left).attr('y', m.top).attr('width', width - m.left - m.right).attr('height', height - m.top - m.bottom).attr('fill', 'transparent')
        .on('mousemove', (e) => {
          const d = data[bisect(data, x.invert(d3.pointer(e)[0]))];
          const cx = x(d.date);
          const cy = y(d.value);
          guide.attr('x1', cx).attr('x2', cx).style('opacity', 1);
          dot.attr('cx', cx).attr('cy', cy).style('opacity', 1);
          tip.style('opacity', 1).style('left', `${Math.min(cx + 12, width - 150)}px`).style('top', `${Math.max(cy - 44, 0)}px`)
            .html(null).call((t) => {
              t.append('div').attr('class', 'tc-date').text(d3.utcFormat('%B %Y')(d.date));
              t.append('div').attr('class', 'tc-val').text(fmtTip(d.value));
            });
        })
        .on('mouseleave', () => {
          guide.style('opacity', 0);
          dot.style('opacity', 0);
          tip.style('opacity', 0);
        });
    };

    draw();
    let lastWidth = wrap.getBoundingClientRect().width;
    const ro = new ResizeObserver(() => {
      const w = wrap.getBoundingClientRect().width;
      if (Math.abs(w - lastWidth) > 1) {
        lastWidth = w;
        draw();
      }
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [points, format, tone, gradId]);

  return (
    <div className="trend-chart" ref={wrapRef}>
      <svg ref={svgRef} role="img" aria-label="Metric trend" />
      <div className="tc-tip" ref={tipRef} />
    </div>
  );
}
