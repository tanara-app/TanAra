// Weight chart: weigh-ins as dots, trailing 7-day mean as a line. Plain SVG.
// Also draws the waist (rows given as { day, kg: cm }), with its own labels.
import { fa } from '../lib/fa.js';
import { diffDays, faShort, faDM, addDays } from '../lib/dates.js';
import { rollingAvg } from '../domain/stats.js';

export function weightChart(sorted, from, to, { label = 'نمودار وزن', dot = 'وزن ثبت‌شده', line: lineLabel = 'میانگین ۷ روزه', empty = 'برای دیدن نمودار، دست‌کم دو روز وزن ثبت کنید.', span: avgSpan = 7 } = {}) {
  const pts = sorted.filter(w => w.day >= from && w.day <= to);
  if (pts.length < 2) {
    return `<div class="chart-empty">${empty}</div>`;
  }
  const W = 340, H = 200, L = 36, R = 26, T = 12, B = 26;
  const start = pts[0].day, end = to;
  const span = Math.max(1, diffDays(end, start));
  const avg = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const a = rollingAvg(sorted, d, avgSpan);
    if (a !== null) avg.push({ day: d, kg: a });
  }
  const vals = [...pts.map(p => Number(p.kg)), ...avg.map(a => a.kg)];
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max(0.5, (hi - lo) * 0.12);
  lo = Math.floor(lo - pad); hi = Math.ceil(hi + pad);
  // RTL: time runs right → left, matching the reading direction.
  const x = d => W - R - (diffDays(d, start) / span) * (W - L - R);
  const y = kg => T + (1 - (kg - lo) / (hi - lo)) * (H - T - B);

  const ticks = 4;
  const grid = Array.from({ length: ticks + 1 }, (_, i) => lo + (i * (hi - lo)) / ticks);
  const xLabels = span >= 10 ? [start, addDays(start, Math.round(span / 2)), end] : [start, end];
  const line = avg.map((a, i) => `${i ? 'L' : 'M'}${x(a.day).toFixed(1)},${y(a.kg).toFixed(1)}`).join('');

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">
    ${grid.map(g => `<line x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}" class="grid"/><text x="${L - 6}" y="${y(g) + 4}" class="ax" text-anchor="end">${fa(g, 1)}</text>`).join('')}
    ${xLabels.map(d => `<text x="${x(d)}" y="${H - 6}" class="ax" text-anchor="middle">${faDM(d)}</text>`).join('')}
    <path d="${line}" class="avg-line"/>
    ${pts.map(p => `<circle cx="${x(p.day)}" cy="${y(p.kg)}" r="3.2" class="dot"><title>${faShort(p.day)}: ${fa(p.kg, 1)}</title></circle>`).join('')}
  </svg>
  <div class="legend"><span><i class="lg-dot"></i>${dot}</span>${lineLabel ? `<span><i class="lg-line"></i>${lineLabel}</span>` : ''}</div>`;
}
