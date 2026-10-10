// Progress: log weight and waist, chart, total loss, 4-week rate, the measured energy use,
// safety + recalc prompts — and the weekly review as a second section of the same tab.
import * as store from '../data/store.js';
import { sortedWeights, rollingAvg, rate4w, waistSeries, waistToHeight, WHTR_GOAL } from '../domain/stats.js';
import { rapidLoss } from '../domain/safety.js';
import { shouldSuggestRecalc, phaseOn, maintenanceKcal } from '../domain/targets.js';
import { nextTargets, ENERGY } from '../domain/energy.js';
import { fa, signed, parseNum, kcal50 } from '../lib/fa.js';
import { today, addDays, relLabel, faDMY, faFull } from '../lib/dates.js';
import { icon, toast, confirmBox } from './dom.js';
import { weightChart } from './chart.js';
import { recalcTargets } from './profile.js';
import { progressCard, bindProgressCard } from './aiCards.js';
import { renderReview } from './review.js';
import { phaseNotes, bindPhase } from './phase.js';

let wDay = today();
let waistDay = today();
let rangeKey = '3m';
export const resetWeighDay = () => { wDay = today(); waistDay = today(); };
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
  const title = '<h2 class="card-h">مصرف واقعی بدنت</h2>';
  if (!m.ready) {
    const need = [m.needDays ? `${fa(m.needDays)} روز دیگر ثبت کامل (دست‌کم دو وعده)` : null, m.needWeighs ? `${fa(m.needWeighs)} وزن‌کشی دیگر` : null].filter(Boolean);
    return `<section class="card">${title}
      <p class="muted small">فرمول فقط یک حدس است و برای یک نفر می‌تواند چند صد کالری خطا داشته باشد. بعد از حدود چهار هفته، تن‌آرا مصرف واقعی بدنت را از روی چیزی که خورده‌ای و روند وزنت حساب می‌کند.</p>
      <p class="small">${need.length ? `هنوز لازم است: ${need.join(' و ')}.` : 'ثبت‌ها کافی‌اند؛ فقط باید وزن‌کشی‌ها دست‌کم دو هفته را پوشش بدهند.'}</p>
      <div class="bar"><i style="width:${Math.round(Math.min(1, (m.days / ENERGY.MIN_DAYS + m.weighs / ENERGY.MIN_WEIGHS) / 2) * 100)}%"></i></div>
    </section>`;
  }
  const loss = phaseOn(p, t) === 'loss';
  const lossTarget = Number(p.targets?.manualKcal) || p.targets?.kcal;
  const differs = Math.abs(next.kcal - lossTarget) >= 100 || Math.abs(next.tdee - maintenanceKcal(p)) >= 100;
  const moving = Math.abs(m.perWeek) < 0.05 ? 'وزنت تقریباً ثابت مانده' : `هفته‌ای ${fa(Math.abs(m.perWeek), 2)} کیلو ${m.perWeek < 0 ? 'کم' : 'اضافه'} کرده‌ای`;
  return `<section class="card">${title}
    <section class="tiles">
      <div class="tile"><span>اندازه‌گیری‌شده</span><b>${kcal50(m.tdee)}</b><small>کالری در روز</small></div>
      <div class="tile"><span>حدس فرمول</span><b>${kcal50(next.formulaTdee)}</b><small>کالری در روز</small></div>
    </section>
    <p class="small">در ${fa(m.days)} روزِ کامل ثبت‌شده‌ی چهار هفته‌ی اخیر، میانگین ${kcal50(m.intake)} کالری خورده‌ای و ${moving}.</p>
    ${m.clamped ? '<p class="muted small">عدد خام خیلی از فرمول دور بود (معمولاً یعنی بعضی خوراکی‌ها ثبت نشده)، برای همین حداکثر ۲۵٪ فاصله از فرمول در نظر گرفته شد.</p>' : ''}
    ${differs ? `<div class="ai-goal"><small class="muted">${loss ? 'هدف پیشنهادی (مصرف واقعی منهای ۵۰۰)' : 'سطح نگهداری پیشنهادی'}</small><b>${kcal50(loss ? next.kcal : next.tdee)} کالری${loss && next.hitFloor ? ' (حداقل ایمن)' : ''}</b>
        <button class="btn sm" data-energy-apply>همین را هدف کن</button></div>
        ${p.targets?.manualKcal ? '<p class="muted small">هدف دستی‌ات با این کار پاک می‌شود.</p>' : ''}`
      : '<p class="muted small">هدف فعلی‌ات با مصرف واقعی بدنت می‌خواند.</p>'}
  </section>`;
}

/* ---------------- waist ---------------- */

function waistCard(s, p) {
  const t = today();
  const series = waistSeries(s.waists, p);
  const first = series[0], last = series[series.length - 1];
  const existing = s.waists.find(w => w.day === waistDay);
  const ratio = last ? waistToHeight(last.cm, p.heightCm) : null;
  const asWeights = series.map(w => ({ day: w.day, kg: w.cm }));
  return `<section class="card">
    <h2 class="card-h">دور کمر</h2>
    <p class="muted small">هر یکی دو هفته، صبح، با متر نواری روی ناف و بدون تو دادن شکم. وقتی وزن چند هفته ثابت می‌ماند، دور کمر نشان می‌دهد بدنت هنوز دارد عوض می‌شود.</p>
    <form class="row gap weigh-form" data-waist-form novalidate>
      <label class="field grow"><span>دور کمر ${waistDay === t ? 'امروز' : relLabel(waistDay)} (سانتی‌متر)</span><input name="cm" inputmode="decimal" value="${existing ? fa(existing.cm, 1) : ''}" placeholder="${last ? fa(last.cm, 1) : ''}"></label>
      <button class="btn primary">${existing ? 'به‌روزرسانی' : 'ثبت'}</button>
    </form>
    ${existing ? '<button class="link small" data-delwaist>حذف اندازه‌ی این روز</button>' : ''}
    ${last ? `<section class="tiles mt">
      <div class="tile"><span>تغییر از اول</span><b>${first !== last ? signed(last.cm - first.cm) : '—'}</b><small>${first !== last ? `سانتی‌متر از ${faDMY(first.day)}` : 'هنوز یک اندازه ثبت شده'}</small></div>
      <div class="tile"><span>نسبت کمر به قد</span><b>${ratio ? fa(ratio, 2) : '—'}</b><small>${ratio ? (ratio < WHTR_GOAL ? 'در محدوده‌ی سالم (زیر ۰٫۵)' : `هدف: زیر ۰٫۵ (${fa(Math.floor(p.heightCm * WHTR_GOAL))} سانتی‌متر)`) : ''}</small></div>
    </section>` : ''}
    ${series.length >= 2 ? weightChart(asWeights, first.day, t, { label: 'نمودار دور کمر', dot: 'دور کمر (سانتی‌متر)', line: '', span: 1 }) : ''}
    ${s.waists.length ? `<div class="wlist">${[...s.waists].sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 6).map(w => `<button class="wrow" data-waist-day="${w.day}"><span>${faFull(w.day)}</span><b>${fa(w.cm, 1)}</b></button>`).join('')}</div>` : ''}
  </section>`;
}

export function renderProgress(root) {
  const s = store.get();
  const p = store.profile();
  const sorted = sortedWeights(s.weights);
  const t = today();
  const latest = sorted[sorted.length - 1];
  const first = sorted[0];
  const avg7 = rollingAvg(sorted, t);
  const rate = rate4w(sorted, t);
  const existing = s.weights.find(w => w.day === wDay);
  const from = RANGES[rangeKey][1] ? addDays(t, -RANGES[rangeKey][1]) : (first?.day || t);
  const rapid = rapidLoss(s.weights, p.startDate, t);

  const head = `
    <header class="page-head"><h1>پیشرفت</h1></header>
    <div class="seg mode-seg" data-section role="tablist" aria-label="بخش">
      <button type="button" role="tab" data-v="weight" aria-selected="${section === 'weight'}" class="${section === 'weight' ? 'on' : ''}">وزن و روند</button>
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

    <section class="card weigh">
      <div class="day-nav compact">
        <button class="icon-btn" data-prev aria-label="روز قبل">${icon.chevR}</button>
        <div class="day-title"><b>${relLabel(wDay)}</b></div>
        <button class="icon-btn" data-next aria-label="روز بعد" ${wDay === t ? 'disabled' : ''}>${icon.chevL}</button>
      </div>
      <form class="row gap weigh-form" novalidate>
        <label class="field grow"><span>وزن (کیلوگرم)</span><input name="kg" inputmode="decimal" value="${existing ? fa(existing.kg, 1) : ''}" placeholder="${latest ? fa(latest.kg, 1) : ''}"></label>
        <button class="btn primary">${existing ? 'به‌روزرسانی' : 'ثبت وزن'}</button>
      </form>
      ${existing ? '<button class="link small" data-delw>حذف وزن این روز</button>' : ''}
    </section>

    ${phaseNotes()}

    ${rapid ? `<div class="note doctor"><strong>سرعت کاهش وزن زیاد است</strong><p>سه هفته‌ی پشت‌سرهم بیشتر از ۱٫۵ کیلو در هفته کم کرده‌اید. لطفاً با پزشک‌تان مشورت کنید.</p></div>` : ''}

    ${shouldSuggestRecalc(p, latest?.kg) ? `<div class="note soft">
      <strong>${fa(Math.floor((p.targets.baseWeight - latest.kg)))} کیلو کم کرده‌اید از آخرین محاسبه</strong>
      <p>با وزن جدید، هدف‌ها کمی تغییر می‌کنند. دوباره حساب کنیم؟</p>
      <button class="btn sm" data-recalc>محاسبه‌ی دوباره</button></div>` : ''}

    <section class="tiles">
      <div class="tile"><span>میانگین ۷ روز اخیر</span><b>${avg7 ? fa(avg7, 1) : '—'}</b><small>کیلو</small></div>
      <div class="tile"><span>تغییر از روز اول</span><b>${first && latest && first !== latest ? signed(latest.kg - first.kg) : '—'}</b><small>${first ? `از ${faDMY(first.day)}` : ''}</small></div>
      <div class="tile"><span>سرعت ۴ هفته‌ی اخیر</span><b>${rate === null ? '—' : signed(rate)}</b><small>${rate === null ? 'داده‌ی کافی نیست' : 'کیلو در هفته'}</small></div>
      <div class="tile"><span>آخرین وزن</span><b>${latest ? fa(latest.kg, 1) : '—'}</b><small>${latest ? relLabel(latest.day) : ''}</small></div>
    </section>

    ${progressCard()}

    <section class="card">
      <div class="seg small" data-range>${Object.entries(RANGES).map(([k, [l]]) => `<button data-v="${k}" class="${k === rangeKey ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${weightChart(sorted, from, t)}
    </section>

    ${energyCard(s, p, latest?.kg)}

    ${waistCard(s, p)}

    <section class="card">
      <h2 class="card-h">ثبت‌های اخیر</h2>
      <div class="wlist">
        ${[...sorted].reverse().slice(0, 12).map(w => `<button class="wrow" data-day="${w.day}"><span>${faFull(w.day)}</span><b>${fa(w.kg, 1)}</b></button>`).join('') || '<div class="empty">هنوز وزنی ثبت نشده.</div>'}
      </div>
    </section>`;

  const rerender = () => renderProgress(root);
  bindSection();
  bindProgressCard(root, () => { if (root.isConnected && location.hash === '#/progress' && section === 'weight') rerender(); });
  root.querySelector('[data-prev]').onclick = () => { wDay = addDays(wDay, -1); rerender(); };
  root.querySelector('[data-next]').onclick = () => { if (wDay < t) { wDay = addDays(wDay, 1); rerender(); } };
  bindPhase(root);
  root.querySelector('[data-energy-apply]')?.addEventListener('click', async () => {
    if (!(await confirmBox('هدف کالری از روی مصرف واقعی بدنت دوباره حساب شود؟', 'حساب کن'))) return;
    recalcTargets();
    toast('هدف‌ها به‌روز شد');
  });
  root.querySelector('[data-waist-form]').onsubmit = e => {
    e.preventDefault();
    const cm = parseNum(e.target.elements.cm.value);
    if (!(cm >= 40 && cm <= 250)) return toast('دور کمر را به سانتی‌متر وارد کنید');
    store.setWaist(waistDay, cm);
    toast('دور کمر ثبت شد');
  };
  root.querySelector('[data-delwaist]')?.addEventListener('click', async () => {
    if (await confirmBox('اندازه‌ی این روز حذف شود؟', 'حذف')) { store.deleteWaist(waistDay); waistDay = today(); }
  });
  root.querySelectorAll('[data-waist-day]').forEach(b => b.onclick = () => { waistDay = b.dataset.waistDay; rerender(); });
  root.querySelector('form.weigh-form:not([data-waist-form])').onsubmit = e => {
    e.preventDefault();
    const kg = parseNum(e.target.elements.kg.value);
    if (!(kg >= 35 && kg <= 350)) return toast('وزن را درست وارد کنید');
    store.setWeight(wDay, kg);
    toast('وزن ثبت شد');
  };
  root.querySelector('[data-delw]')?.addEventListener('click', async () => {
    if (await confirmBox('وزن این روز حذف شود؟', 'حذف')) store.deleteWeight(wDay);
  });
  root.querySelector('[data-recalc]')?.addEventListener('click', () => { recalcTargets(); toast('هدف‌ها به‌روز شد'); });
  root.querySelector('[data-range]').onclick = e => {
    const b = e.target.closest('[data-v]');
    if (b) { rangeKey = b.dataset.v; rerender(); }
  };
  root.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { wDay = b.dataset.day; rerender(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
}
