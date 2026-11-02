// Progress answers «where am I?»: the numbers and the chart first, then two buttons that open the
// forms (measure.js, activity.js), one card for asking Hooshvareh, and the details folded away.
import * as store from '../data/store.js';
import { sortedWeights, rate4w, waistSeries, waistToHeight, WHTR_GOAL } from '../domain/stats.js';
import { rapidLoss } from '../domain/safety.js';
import { shouldSuggestRecalc, phaseOn, maintenanceKcal } from '../domain/targets.js';
import { nextTargets, ENERGY } from '../domain/energy.js';
import { fa, signed, kcal50 } from '../lib/fa.js';
import { icon } from './dom.js';
import { today, addDays, diffDays, relLabel, faDMY, faFull } from '../lib/dates.js';
import { toast, confirmBox } from './dom.js';
import { weightChart } from './chart.js';
import { recalcTargets } from './profile.js';
import { head, progressRow, bindProgressCard, maintainRow, bindMaintainRow, bindAskFolds } from './aiCards.js';
import { openReviews } from './review.js';
import { phaseNotes, bindPhase } from './phase.js';
import { checkinRow, bindCheckin } from './checkin.js';
import { openMeasure, measureLine } from './measure.js';
import { openActivity, activityLine } from './activity.js';
import { aiAvailable } from '../ai/hooshvareh.js';

let rangeKey = '3m';
let metric = 'weight'; // what the trend card shows; or 'waist'
let histAll = false;
let histOpen = false;
export const resetProgress = () => { histAll = false; histOpen = false; };
const RANGES = { '1m': ['۱ ماه', 30], '3m': ['۳ ماه', 90], all: ['همه', null] };

/*
  «مصرف واقعی بدن»: once a few weeks are logged, how much the body uses is measured from the
  log itself (energy.js) instead of the formula. Shows what is still missing until then, and
  offers the new target when it differs from the current one by 100 kcal or more.
*/
function energyCard(s, p, latestKg) {
  if (!p.startDate || !latestKg) return '';
  const t = today();
  const { t: next, m } = nextTargets(p, s.entries, s.weights, latestKg, t);
  const fold = (sub, body, open = false) => `<details class="card fold"${open ? ' open' : ''}>
    <summary><span><h2>مصرف واقعی بدنت</h2><small>${sub}</small></span></summary>${body}</details>`;
  if (!m.ready) {
    const need = [m.needDays ? `${fa(m.needDays)} روز ثبت کامل` : null, m.needWeighs ? `${fa(m.needWeighs)} وزن‌کشی` : null].filter(Boolean);
    return fold(need.length ? `هنوز لازم است: ${need.join(' و ')}` : 'وزن‌کشی‌ها باید دست‌کم دو هفته را پوشش بدهند', `
      <div class="bar"><i style="width:${Math.round(Math.min(1, (m.days / ENERGY.MIN_DAYS + m.weighs / ENERGY.MIN_WEIGHS) / 2) * 100)}%"></i></div>
      <p class="muted small mt">فرمول فقط یک حدس است و برای یک نفر می‌تواند چند صد کالری خطا داشته باشد. بعد از چهار تا شش هفته، تن‌آرا مصرف واقعی بدنت را از روی چیزی که خورده‌ای (روزهایی با دست‌کم دو وعده‌ی ثبت‌شده) و روند وزنت حساب می‌کند. هفته‌ای یک وزن‌کشی برایش کافی است.</p>`);
  }
  const loss = phaseOn(p, t) === 'loss';
  const lossTarget = Number(p.targets?.manualKcal) || p.targets?.kcal;
  const differs = Math.abs(next.kcal - lossTarget) >= 100 || Math.abs(next.tdee - maintenanceKcal(p)) >= 100;
  const moving = Math.abs(m.perWeek) < 0.05 ? 'وزنت تقریباً ثابت مانده' : `هفته‌ای ${fa(Math.abs(m.perWeek), 2)} کیلو ${m.perWeek < 0 ? 'کم' : 'اضافه'} کرده‌ای`;
  return fold(`${kcal50(m.tdee)} کالری در روز${differs ? ' · هدف تازه پیشنهاد شده' : ''}`, `
    <section class="tiles">
      <div class="tile"><span>اندازه‌گیری‌شده</span><b>${kcal50(m.tdee)}</b><small>کالری در روز</small></div>
      <div class="tile"><span>حدس فرمول</span><b>${kcal50(next.formulaTdee)}</b><small>کالری در روز</small></div>
    </section>
    <p class="small">در ${fa(m.days)} روزِ کامل ثبت‌شده‌ی ${fa(Math.round((diffDays(m.to, m.from) + 1) / 7))} هفته‌ی اخیر، میانگین ${kcal50(m.intake)} کالری خورده‌ای و ${moving}.</p>
    ${m.clamped ? '<p class="muted small">عدد خام خیلی از فرمول دور بود (معمولاً یعنی بعضی خوراکی‌ها ثبت نشده)، برای همین حداکثر ۲۵٪ فاصله از فرمول در نظر گرفته شد.</p>' : ''}
    ${differs ? `<div class="ai-goal"><small class="muted">${loss ? 'هدف پیشنهادی (مصرف واقعی منهای ۵۰۰)' : 'سطح نگهداری پیشنهادی'}</small><b>${kcal50(loss ? next.kcal : next.tdee)} کالری${loss && next.hitFloor ? ' (حداقل ایمن)' : ''}</b>
        <button class="btn sm" data-energy-apply>همین را هدف کن</button></div>
        ${p.targets?.manualKcal ? '<p class="muted small">هدف دستی‌ات با این کار پاک می‌شود.</p>' : ''}`
      : '<p class="muted small">هدف فعلی‌ات با مصرف واقعی بدنت می‌خواند.</p>'}`, differs);
}

/* ---------------- the trend of one of the two: chart + its numbers ---------------- */

function trendCard(s, p, sorted, t) {
  const waist = metric === 'waist';
  const series = waist ? waistSeries(s.waists, p).map(w => ({ day: w.day, kg: w.cm })) : sorted;
  const first = series[0], last = series[series.length - 1];
  const from = RANGES[rangeKey][1] ? addDays(t, -RANGES[rangeKey][1]) : (first?.day || t);
  const change = first && first !== last ? signed(last.kg - first.kg) : '—';
  const stat = (label, value) => `<div class="stat"><span>${label}</span><b>${value}</b></div>`;
  let stats;
  if (waist) {
    const ratio = last ? waistToHeight(last.kg, p.heightCm) : null;
    stats = stat('از شروع', `${change}${change === '—' ? '' : ' <small>سانت</small>'}`) + stat('نسبت کمر به قد', ratio ? `${fa(ratio, 2)} <small>${ratio < WHTR_GOAL ? 'سالم' : `هدف زیر ${fa(WHTR_GOAL, 1)}`}</small>` : '—');
  } else {
    const rate = rate4w(sorted, t);
    stats = stat('از شروع', `${change}${change === '—' ? '' : ' <small>کیلو</small>'}`) + stat('سرعت ۴ هفته', rate === null ? '—' : `${signed(rate)} <small>در هفته</small>`);
  }
  return `<section class="card trend">
    <div class="trend-top">
      <div class="trend-now"><span>${waist ? 'دور کمر' : 'وزن'}</span><b>${last ? fa(last.kg, 1) : '—'} <small>${waist ? 'سانت' : 'کیلو'}</small></b><small class="muted">${last ? relLabel(last.day) : 'هنوز ثبت نشده'}</small></div>
      <div class="trend-stats">${stats}</div>
    </div>
    ${waist ? weightChart(series, from, t, { label: 'نمودار دور کمر', dot: 'دور کمر (سانتی‌متر)', line: '', span: 1, empty: 'برای دیدن نمودار، دست‌کم دو بار دور کمر را ثبت کن.' }) : weightChart(series, from, t)}
    <div class="trend-seg">
      <div class="seg small" data-metric role="tablist" aria-label="نمودار">
        <button type="button" role="tab" data-v="weight" aria-selected="${!waist}" class="${waist ? '' : 'on'}">وزن</button>
        <button type="button" role="tab" data-v="waist" aria-selected="${waist}" class="${waist ? 'on' : ''}">دور کمر</button>
      </div>
      <div class="seg small" data-range>${Object.entries(RANGES).map(([k, [l]]) => `<button data-v="${k}" class="${k === rangeKey ? 'on' : ''}">${l}</button>`).join('')}</div>
    </div>
  </section>`;
}

/* ---------------- history: one row per measured day, both numbers ---------------- */

function historyCard(s) {
  const days = new Map();
  for (const w of s.weights) days.set(w.day, { kg: w.kg });
  for (const w of s.waists) days.set(w.day, { ...days.get(w.day), cm: w.cm });
  const all = [...days.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  const rows = histAll ? all : all.slice(0, 7);
  return `<details class="card fold" data-hist${histOpen ? ' open' : ''}>
    <summary><span><h2>ثبت‌های اخیر</h2><small>${all.length ? `${fa(all.length)} روز اندازه‌گیری` : 'هنوز چیزی ثبت نشده'}</small></span></summary>
    ${all.length ? `<div class="wlist">
      <div class="mrow mhead"><span>روز</span><span>وزن</span><span>دور کمر</span></div>
      ${rows.map(([d, v]) => `<button class="wrow mrow" data-mday="${d}" aria-label="ویرایش ${faFull(d)}"><span>${faFull(d)}</span><b>${v.kg ? fa(v.kg, 1) : '—'}</b><b>${v.cm ? fa(v.cm, 1) : '—'}</b></button>`).join('')}
    </div>
    ${all.length > rows.length ? `<button class="link small" data-hist-all>نمایش همه (${fa(all.length)})</button>` : ''}` : ''}
  </details>`;
}

const SCALE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 9a5.5 5.5 0 0 1 8 0l-2.6 2.2h-2.8z"/></svg>';
const RUN = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="14" cy="4.5" r="1.8"/><path d="M8 21l3-6 3 2v4M6.5 11.5L9 8.5l4 1 2.5 3.5 3 .5M11 15l-1-5"/></svg>';

export function renderProgress(root) {
  const s = store.get();
  const p = store.profile();
  const sorted = sortedWeights(s.weights);
  const t = today();
  const latest = sorted[sorted.length - 1];
  const rapid = rapidLoss(s.weights, p.startDate, t);
  const m = measureLine();
  root.innerHTML = `
    <header class="page-head"><h1>پیشرفت</h1></header>

    ${phaseNotes()}

    ${rapid ? `<div class="note doctor"><strong>سرعت کاهش وزن زیاد است</strong><p>سه هفته‌ی پشت‌سرهم بیشتر از ۱٫۵ کیلو در هفته کم کرده‌اید. لطفاً با پزشک‌تان مشورت کنید.</p></div>` : ''}

    ${shouldSuggestRecalc(p, latest?.kg) ? `<div class="note soft">
      <strong>${fa(Math.floor((p.targets.baseWeight - latest.kg)))} کیلو کم کرده‌اید از آخرین محاسبه</strong>
      <p>با وزن جدید، هدف‌ها کمی تغییر می‌کنند. دوباره حساب کنیم؟</p>
      <button class="btn sm" data-recalc>محاسبه‌ی دوباره</button></div>` : ''}

    ${trendCard(s, p, sorted, t)}

    <div class="prog-acts">
      <button class="prog-act${m.due ? ' due' : ''}" data-measure-open><i>${SCALE}</i><b>ثبت وزن و کمر</b><small>${m.text}</small></button>
      <button class="prog-act" data-activity-open><i>${RUN}</i><b>ثبت تحرک</b><small>${activityLine()}</small></button>
    </div>

    ${aiAvailable() ? `<section class="card ai-card ask-card">
      ${head('از هوشواره بپرس')}
      ${maintainRow()}
      ${progressRow()}
      ${checkinRow()}
    </section>` : ''}

    ${energyCard(s, p, latest?.kg)}

    ${historyCard(s)}

    <button class="card set-row reviews-row" data-reviews><span class="grow"><b>مرور هفته‌ها</b><small class="muted">عددها، تحلیل و هدف هر هفته</small></span>${icon.chevL}</button>`;

  const rerender = () => renderProgress(root);
  const pick = (sel, set) => {
    root.querySelector(sel).onclick = e => {
      const b = e.target.closest('[data-v]');
      if (b) { set(b.dataset.v); rerender(); }
    };
  };
  root.querySelector('[data-measure-open]').onclick = () => openMeasure();
  root.querySelector('[data-activity-open]').onclick = () => openActivity();
  root.querySelector('[data-reviews]').onclick = () => openReviews();
  root.querySelector('[data-hist]').ontoggle = e => { histOpen = e.currentTarget.open; };
  const redrawAi = () => { if (root.isConnected && location.hash === '#/progress') rerender(); };
  bindProgressCard(root, redrawAi);
  bindMaintainRow(root, redrawAi);
  bindAskFolds(root);
  bindPhase(root);
  bindCheckin(root, rerender);
  root.querySelector('[data-energy-apply]')?.addEventListener('click', async () => {
    if (!(await confirmBox('هدف کالری از روی مصرف واقعی بدنت دوباره حساب شود؟', 'حساب کن'))) return;
    recalcTargets();
    toast('هدف‌ها به‌روز شد');
  });
  root.querySelector('[data-recalc]')?.addEventListener('click', () => { recalcTargets(); toast('هدف‌ها به‌روز شد'); });
  pick('[data-metric]', v => { metric = v; });
  pick('[data-range]', v => { rangeKey = v; });
  root.querySelector('[data-hist-all]')?.addEventListener('click', () => { histAll = true; rerender(); });
  root.querySelectorAll('[data-mday]').forEach(b => b.onclick = () => openMeasure(b.dataset.mday));
}
