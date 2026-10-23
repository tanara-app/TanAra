/*
  Activity on «امروز»: a pill with this week's minutes against the goal of the phase, and a
  small sheet to set the minutes of the day shown. Moving more matters most once the weight is
  off (see ACTIVITY_GOAL in stats.js).
*/
import * as store from '../data/store.js';
import { activityWeek, ACTIVITY_GOAL } from '../domain/stats.js';
import { phaseOn } from '../domain/targets.js';
import { fa, parseNum } from '../lib/fa.js';
import { weekStart, relLabel } from '../lib/dates.js';
import { sheet, toast, icon } from './dom.js';

const run = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="14" cy="4.5" r="1.8"/><path d="M8 21l3-6 3 2v4M6.5 11.5L9 8.5l4 1 2.5 3.5 3 .5M11 15l-1-5"/></svg>';
const QUICK = [15, 30, 45, 60, 90];

export function activityPill(day) {
  const p = store.profile();
  const goal = ACTIVITY_GOAL[phaseOn(p, day)] || 150;
  const week = activityWeek(store.get().activity, weekStart(day));
  return `<button class="pill pill-btn" data-activity>${run}<span>تحرک این هفته: <b>${fa(week)}</b> از ${fa(goal)} دقیقه</span></button>`;
}

export function bindActivity(root, day) {
  root.querySelector('[data-activity]')?.addEventListener('click', () => openActivity(day));
}

function openActivity(day) {
  const p = store.profile();
  const phase = phaseOn(p, day);
  const goal = ACTIVITY_GOAL[phase] || 150;
  const cur = store.get().activity.find(a => a.day === day)?.minutes || 0;
  sheet.open(body => {
    body.innerHTML = `
      <div class="sheet-head"><h2>تحرک ${relLabel(day)}</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <form class="stack" novalidate>
        <label class="field"><span>چند دقیقه؟ (پیاده‌روی تند، ورزش، کار بدنی، دوچرخه…)</span><input name="m" inputmode="numeric" value="${cur ? fa(cur) : ''}" placeholder="مثلاً ${fa(30)}"></label>
        <div class="chips">${QUICK.map(q => `<button type="button" class="chip" data-q="${q}">${fa(q)}</button>`).join('')}</div>
        <p class="muted small">${phase === 'maintain'
          ? `در نگهداری هدف حدود ${fa(goal)} دقیقه در هفته است: کسانی که وزن کم‌شده را سال‌ها نگه می‌دارند معمولاً زیاد تحرک دارند. لازم نیست یک‌جا باشد؛ چند تکه‌ی ده‌دقیقه‌ای هم حساب است.`
          : `دست‌کم ${fa(goal)} دقیقه در هفته، توصیه‌ی سازمان جهانی بهداشت است. بیشتر از کالری‌سوزی، برای سلامت و نگه داشتن عضله و بعداً نگه داشتن وزن مهم است.`}</p>
        <button class="btn primary block big">ذخیره</button>
      </form>`;
    const input = body.querySelector('[name=m]');
    body.querySelector('[data-close]').onclick = () => sheet.close();
    body.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { input.value = fa(Number(b.dataset.q)); });
    body.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const raw = input.value.trim();
      const m = raw ? parseNum(raw) : 0;
      if (!(m >= 0 && m <= 1440)) return toast('تعداد دقیقه را درست وارد کن');
      store.setActivity(day, m);
      sheet.close();
      toast(m ? 'ثبت شد' : 'حذف شد');
    };
  });
}
