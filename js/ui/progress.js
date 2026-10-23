// Progress: the check-in (weight and waist in one form, see measure.js), one trend card for
// either of them, the measured energy use, safety + recalc prompts, the history — and the
// weekly review as a second section of the same tab.
import * as store from '../data/store.js';
import { sortedWeights, rollingAvg, rate4w, waistSeries, waistToHeight, WHTR_GOAL } from '../domain/stats.js';
import { rapidLoss } from '../domain/safety.js';
import { shouldSuggestRecalc, phaseOn, maintenanceKcal } from '../domain/targets.js';
import { nextTargets, ENERGY } from '../domain/energy.js';
import { fa, signed, kcal50 } from '../lib/fa.js';
import { today, addDays, relLabel, faDMY, faFull } from '../lib/dates.js';
import { toast, confirmBox } from './dom.js';
import { weightChart } from './chart.js';
import { recalcTargets } from './profile.js';
import { progressCard, bindProgressCard, maintainCard, bindMaintainCard } from './aiCards.js';
import { renderReview } from './review.js';
import { phaseNotes, bindPhase } from './phase.js';
import { measureCard, bindMeasure, resetMeasureDay, setMeasureDay, takeJump } from './measure.js';

let rangeKey = '3m';
let metric = 'weight'; // what the trend card shows; or 'waist'
let histAll = false;
export const resetWeighDay = () => { resetMeasureDay(); histAll = false; };
let section = 'weight'; // or 'review'
export const showReview = () => { section = 'review'; };
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
      <p class="muted small mt">فرمول فقط یک حدس است و برای یک نفر می‌تواند چند صد کالری خطا داشته باشد. بعد از حدود چهار هفته، تن‌آرا مصرف واقعی بدنت را از روی چیزی که خورده‌ای (روزهایی با دست‌کم دو وعده‌ی ثبت‌شده) و روند وزنت حساب می‌کند.</p>`);
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
    <p class="small">در ${fa(m.days)} روزِ کامل ثبت‌شده‌ی چهار هفته‌ی اخیر، میانگین ${kcal50(m.intake)} کالری خورده‌ای و ${moving}.</p>
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
  const change = `<div class="tile"><span>تغییر از روز اول</span><b>${first && first !== last ? signed(last.kg - first.kg) : '—'}</b><small>${first ? `${waist ? 'سانت ' : ''}از ${faDMY(first.day)}` : ''}</small></div>`;
  let tiles;
  if (waist) {
    const ratio = last ? waistToHeight(last.kg, p.heightCm) : null;
    tiles = `<div class="tile"><span>آخرین اندازه</span><b>${last ? fa(last.kg, 1) : '—'}</b><small>${last ? relLabel(last.day) : 'هنوز ثبت نشده'}</small></div>
      ${change}
      <div class="tile wide"><span>نسبت کمر به قد</span><b>${ratio ? fa(ratio, 2) : '—'}</b><small>${ratio ? (ratio < WHTR_GOAL ? 'در محدوده‌ی سالم (زیر ۰٫۵)' : `هدف: زیر ۰٫۵، یعنی دور کمر زیر ${fa(Math.floor(p.heightCm * WHTR_GOAL))} سانت`) : ''}</small></div>`;
  } else {
    const avg7 = rollingAvg(sorted, t);
    const rate = rate4w(sorted, t);
    tiles = `<div class="tile"><span>آخرین وزن</span><b>${last ? fa(last.kg, 1) : '—'}</b><small>${last ? relLabel(last.day) : ''}</small></div>
      <div class="tile"><span>میانگین ۷ روز اخیر</span><b>${avg7 ? fa(avg7, 1) : '—'}</b><small>کیلو</small></div>
      ${change}
      <div class="tile"><span>سرعت ۴ هفته‌ی اخیر</span><b>${rate === null ? '—' : signed(rate)}</b><small>${rate === null ? 'داده‌ی کافی نیست' : 'کیلو در هفته'}</small></div>`;
  }
  return `<section class="card">
    <div class="seg" data-metric role="tablist" aria-label="نمودار">
      <button type="button" role="tab" data-v="weight" aria-selected="${!waist}" class="${waist ? '' : 'on'}">وزن</button>
      <button type="button" role="tab" data-v="waist" aria-selected="${waist}" class="${waist ? 'on' : ''}">دور کمر</button>
    </div>
    ${waist ? weightChart(series, from, t, { label: 'نمودار دور کمر', dot: 'دور کمر (سانتی‌متر)', line: '', span: 1, empty: 'برای دیدن نمودار، دست‌کم دو بار دور کمر را ثبت کن.' }) : weightChart(series, from, t)}
    <div class="seg small range-seg" data-range>${Object.entries(RANGES).map(([k, [l]]) => `<button data-v="${k}" class="${k === rangeKey ? 'on' : ''}">${l}</button>`).join('')}</div>
    <section class="tiles mt">${tiles}</section>
  </section>`;
}

/* ---------------- history: one row per measured day, both numbers ---------------- */

function historyCard(s) {
  const days = new Map();
  for (const w of s.weights) days.set(w.day, { kg: w.kg });
  for (const w of s.waists) days.set(w.day, { ...days.get(w.day), cm: w.cm });
  const all = [...days.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  const rows = histAll ? all : all.slice(0, 7);
  return `<section class="card">
    <h2 class="card-h">ثبت‌های اخیر</h2>
    ${all.length ? `<div class="wlist">
      <div class="mrow mhead"><span>روز</span><span>وزن</span><span>دور کمر</span></div>
      ${rows.map(([d, v]) => `<button class="wrow mrow" data-mday="${d}" aria-label="ویرایش ${faFull(d)}"><span>${faFull(d)}</span><b>${v.kg ? fa(v.kg, 1) : '—'}</b><b>${v.cm ? fa(v.cm, 1) : '—'}</b></button>`).join('')}
    </div>
    ${all.length > rows.length ? `<button class="link small" data-hist-all>نمایش همه (${fa(all.length)})</button>` : ''}` : '<div class="empty">هنوز چیزی ثبت نشده.</div>'}
  </section>`;
}

export function renderProgress(root) {
  const s = store.get();
  const p = store.profile();
  const sorted = sortedWeights(s.weights);
  const t = today();
  const latest = sorted[sorted.length - 1];
  const rapid = rapidLoss(s.weights, p.startDate, t);
  if (takeJump()) section = 'weight';

  const head = `
    <header class="page-head"><h1>پیشرفت</h1></header>
    <div class="seg mode-seg" data-section role="tablist" aria-label="بخش">
      <button type="button" role="tab" data-v="weight" aria-selected="${section === 'weight'}" class="${section === 'weight' ? 'on' : ''}">اندازه‌ها و روند</button>
      <button type="button" role="tab" data-v="review" aria-selected="${section === 'review'}" class="${section === 'review' ? 'on' : ''}">مرور هفته</button>
    </div>`;
  const bindSection = () => {
    root.querySelector('[data-section]').onclick = e => {
      const b = e.target.closest('[data-v]');
      if (b && b.dataset.v !== section) { section = b.dataset.v; renderProgress(root); window.scrollTo(0, 0); }
    };
  };
  if (section === 'review') {
    root.innerHTML = `${head}<div data-review></div>`;
    bindSection();
    renderReview(root.querySelector('[data-review]'));
    return;
  }

  root.innerHTML = `${head}

    ${measureCard()}

    ${phaseNotes()}

    ${rapid ? `<div class="note doctor"><strong>سرعت کاهش وزن زیاد است</strong><p>سه هفته‌ی پشت‌سرهم بیشتر از ۱٫۵ کیلو در هفته کم کرده‌اید. لطفاً با پزشک‌تان مشورت کنید.</p></div>` : ''}

    ${shouldSuggestRecalc(p, latest?.kg) ? `<div class="note soft">
      <strong>${fa(Math.floor((p.targets.baseWeight - latest.kg)))} کیلو کم کرده‌اید از آخرین محاسبه</strong>
      <p>با وزن جدید، هدف‌ها کمی تغییر می‌کنند. دوباره حساب کنیم؟</p>
      <button class="btn sm" data-recalc>محاسبه‌ی دوباره</button></div>` : ''}

    ${trendCard(s, p, sorted, t)}

    ${maintainCard()}

    ${progressCard()}

    ${energyCard(s, p, latest?.kg)}

    ${historyCard(s)}`;

  const rerender = () => renderProgress(root);
  const pick = (sel, set) => {
    root.querySelector(sel).onclick = e => {
      const b = e.target.closest('[data-v]');
      if (b) { set(b.dataset.v); rerender(); }
    };
  };
  bindSection();
  bindMeasure(root, rerender);
  const redrawAi = () => { if (root.isConnected && location.hash === '#/progress' && section === 'weight') rerender(); };
  bindProgressCard(root, redrawAi);
  bindMaintainCard(root, redrawAi);
  bindPhase(root);
  root.querySelector('[data-energy-apply]')?.addEventListener('click', async () => {
    if (!(await confirmBox('هدف کالری از روی مصرف واقعی بدنت دوباره حساب شود؟', 'حساب کن'))) return;
    recalcTargets();
    toast('هدف‌ها به‌روز شد');
  });
  root.querySelector('[data-recalc]')?.addEventListener('click', () => { recalcTargets(); toast('هدف‌ها به‌روز شد'); });
  pick('[data-metric]', v => { metric = v; });
  pick('[data-range]', v => { rangeKey = v; });
  root.querySelector('[data-hist-all]')?.addEventListener('click', () => { histAll = true; rerender(); });
  root.querySelectorAll('[data-mday]').forEach(b => b.onclick = () => { setMeasureDay(b.dataset.mday); rerender(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
}
