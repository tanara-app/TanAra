/*
  The check-in: weight and waist are entered together, in one sheet with one button. The app
  says when each is due (domain/stats.js → measureDue): a note on «امروز» on the day of the
  weigh-in, and the button on «پیشرفت». Any earlier day can be opened in the same form.
*/
import * as store from '../data/store.js';
import { measureDue, sortedWeights, waistSeries } from '../domain/stats.js';
import { lapse } from '../domain/phase.js';
import { fa, parseNum } from '../lib/fa.js';
import { today, addDays, relLabel } from '../lib/dates.js';
import { icon, toast, confirmBox, sheet } from './dom.js';
import { cheer } from './mascot.js';
import { dismissed, dismiss } from './notices.js';

// Opens the check-in on today's form, from anywhere.
export const goMeasure = () => openMeasure(today());

export function due(on = today()) {
  const s = store.get();
  const p = store.profile();
  return measureDue(s.weights, s.waists, p, on, p?.reminders?.weigh?.every);
}

const inDays = n => (n === 1 ? 'فردا' : `${fa(n)} روز دیگر`);

function state(d) {
  if (d.weigh && d.waist) return ['وقت اندازه‌گیری است', 'وزن و دور کمر را با هم ثبت کن.'];
  if (d.weigh) return ['وقت وزن‌کشی است', `دور کمر: ${inDays(d.waistIn)}`];
  if (d.waist) return ['وقت اندازه‌گیری دور کمر است', `وزن‌کشی بعدی: ${inDays(d.weighIn)}`];
  return ['اندازه‌ها به‌روزند', `وزن‌کشی بعدی: ${inDays(d.weighIn)} · دور کمر: ${inDays(d.waistIn)}`];
}

// For the button on «پیشرفت»: what is due, or when the next weigh-in is.
export function measureLine() {
  const d = due();
  return { due: d.weigh || d.waist, text: d.weigh || d.waist ? state(d)[0] : `وزن‌کشی بعدی: ${inDays(d.weighIn)}` };
}

/* ---------------- «امروز»: the nudge ---------------- */

export function measureNote() {
  const d = due();
  if (!d.weigh || dismissed('measure', today())) return '';
  // a long gap has its own, stronger note (phase.js)
  const gap = lapse(sortedWeights(store.get().weights), today(), store.profile()?.reminders?.weigh?.every);
  if (gap && !dismissed('lapse', gap.last)) return '';
  return `<div class="note soft" data-measure-note>
    <strong>${d.waist ? 'امروز وقت اندازه‌گیری است: وزن و دور کمر' : 'امروز وقت وزن‌کشی است'}</strong>
    <p>صبح، ناشتا و بعد از دستشویی${d.waist ? '؛ هر دو عدد را یک‌جا ثبت می‌کنی' : ''}.</p>
    <div class="row gap"><button class="btn primary sm" data-measure-go>ثبت اندازه‌ها</button><button class="btn ghost sm" data-measure-later>بعداً</button></div>
  </div>`;
}

export function bindMeasureNote(root) {
  root.querySelector('[data-measure-go]')?.addEventListener('click', goMeasure);
  root.querySelector('[data-measure-later]')?.addEventListener('click', e => { dismiss('measure', today()); e.target.closest('.note').remove(); });
}

/* ---------------- the form ---------------- */

export function openMeasure(on = today()) {
  let day = on;
  sheet.open(body => {
    const draw = () => {
      const s = store.get();
      const t = today();
      const isToday = day === t;
      const d = due(t);
      const exW = s.weights.find(w => w.day === day);
      const exC = s.waists.find(w => w.day === day);
      const lastW = sortedWeights(s.weights).pop();
      const lastC = waistSeries(s.waists, store.profile()).pop();
      const [title, sub] = state(d);
      // a day that is already filled in is not «due» any more, whatever the schedule says
      const open = isToday && ((d.weigh && !exW) || (d.waist && !exC));
      body.innerHTML = `
        <div class="sheet-head"><h2>ثبت وزن و کمر</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
        <div class="day-nav compact">
          <button class="icon-btn" data-m-prev aria-label="روز قبل">${icon.chevR}</button>
          <div class="day-title"><b>${relLabel(day)}</b></div>
          <button class="icon-btn" data-m-next aria-label="روز بعد" ${isToday ? 'disabled' : ''}>${icon.chevL}</button>
        </div>
        ${isToday ? `<div class="measure-state${open ? ' due' : ''}"><b>${title}</b><small class="muted">${sub}</small></div>` : ''}
        <form class="stack" novalidate>
          <div class="row gap">
            <label class="field grow"><span>وزن (کیلو)</span><input name="kg" inputmode="decimal" value="${exW ? fa(exW.kg, 1) : ''}" placeholder="${lastW ? fa(lastW.kg, 1) : ''}"></label>
            <label class="field grow"><span>دور کمر (سانت)${isToday && !d.waist && !exC ? ' <em>اختیاری</em>' : ''}</span><input name="cm" inputmode="decimal" value="${exC ? fa(exC.cm, 1) : ''}" placeholder="${lastC ? fa(lastC.cm, 1) : ''}"></label>
          </div>
          <button class="btn primary block">${exW || exC ? 'به‌روزرسانی' : 'ثبت'}</button>
        </form>
        <div class="measure-foot">
          <details class="hint"><summary class="link small">چطور اندازه بگیرم؟</summary>
            <p class="muted small">وزن: صبح، ناشتا و بعد از دستشویی، تا عددها با هم قابل‌مقایسه باشند. دور کمر: با متر نواری روی ناف و بدون تو دادن شکم. وقتی وزن چند هفته ثابت می‌ماند، دور کمر نشان می‌دهد بدنت هنوز دارد عوض می‌شود.</p>
          </details>
          ${exW || exC ? '<button class="link small" data-m-del>حذف ثبت این روز</button>' : ''}
        </div>`;
      body.querySelector('[data-close]').onclick = () => sheet.close();
      body.querySelector('[data-m-prev]').onclick = () => { day = addDays(day, -1); draw(); };
      body.querySelector('[data-m-next]').onclick = () => { if (day < t) { day = addDays(day, 1); draw(); } };
      body.querySelector('form').onsubmit = e => {
        e.preventDefault();
        const kgRaw = e.target.elements.kg.value.trim();
        const cmRaw = e.target.elements.cm.value.trim();
        const kg = parseNum(kgRaw);
        const cm = parseNum(cmRaw);
        if (!kgRaw && !cmRaw && !exW && !exC) return toast('وزن یا دور کمر را وارد کن');
        if (kgRaw && !(kg >= 35 && kg <= 350)) return toast('وزن را به کیلوگرم درست وارد کن');
        if (cmRaw && !(cm >= 40 && cm <= 250)) return toast('دور کمر را به سانتی‌متر درست وارد کن');
        const waistLeft = day === t && !cmRaw && !exC && d.waist;
        // a field that was emptied takes its value away
        if (kgRaw) store.setWeight(day, kg); else if (exW) store.deleteWeight(day);
        if (cmRaw) store.setWaist(day, cm); else if (exC) store.deleteWaist(day);
        if (kgRaw || cmRaw) cheer('measure');
        toast(!kgRaw && !cmRaw ? 'ثبت این روز حذف شد' : waistLeft ? 'وزن ثبت شد؛ دور کمر هنوز مانده' : 'ثبت شد');
        sheet.close();
      };
      body.querySelector('[data-m-del]')?.addEventListener('click', async () => {
        if (!(await confirmBox(`وزن و دور کمرِ ${relLabel(day)} حذف شود؟`, 'حذف'))) return;
        if (exW) store.deleteWeight(day);
        if (exC) store.deleteWaist(day);
        sheet.close();
      });
    };
    draw();
  });
}
