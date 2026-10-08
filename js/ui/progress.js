// Progress: log weight, chart, total loss, 4-week rate, safety + recalc prompts.
import * as store from '../data/store.js';
import { sortedWeights, rollingAvg, rate4w } from '../domain/stats.js';
import { rapidLoss } from '../domain/safety.js';
import { shouldSuggestRecalc } from '../domain/targets.js';
import { fa, signed, parseNum } from '../lib/fa.js';
import { today, addDays, relLabel, faDMY, faFull } from '../lib/dates.js';
import { icon, toast, confirmBox } from './dom.js';
import { weightChart } from './chart.js';
import { recalcTargets } from './profile.js';
import { progressCard, bindProgressCard } from './aiCards.js';

let wDay = today();
let rangeKey = '3m';
export const resetWeighDay = () => { wDay = today(); };
const RANGES = { '1m': ['۱ ماه', 30], '3m': ['۳ ماه', 90], all: ['همه', null] };

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

  root.innerHTML = `
    <header class="page-head"><h1>پیشرفت</h1></header>

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

    <section class="card">
      <h2 class="card-h">ثبت‌های اخیر</h2>
      <div class="wlist">
        ${[...sorted].reverse().slice(0, 12).map(w => `<button class="wrow" data-day="${w.day}"><span>${faFull(w.day)}</span><b>${fa(w.kg, 1)}</b></button>`).join('') || '<div class="empty">هنوز وزنی ثبت نشده.</div>'}
      </div>
    </section>`;

  const rerender = () => renderProgress(root);
  bindProgressCard(root, () => { if (root.isConnected && location.hash === '#/progress') rerender(); });
  root.querySelector('[data-prev]').onclick = () => { wDay = addDays(wDay, -1); rerender(); };
  root.querySelector('[data-next]').onclick = () => { if (wDay < t) { wDay = addDays(wDay, 1); rerender(); } };
  root.querySelector('.weigh-form').onsubmit = e => {
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
