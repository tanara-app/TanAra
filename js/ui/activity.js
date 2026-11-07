/*
  Activity on «پیشرفت»: a button with this week's minutes against the goal of the phase, and a
  small sheet to set the minutes of a day. Moving more matters most once the weight is
  off (see ACTIVITY_GOAL in stats.js).
*/
import * as store from '../data/store.js';
import { activityWeek, ACTIVITY_GOAL } from '../domain/stats.js';
import { phaseOn } from '../domain/targets.js';
import { fa, parseNum } from '../lib/fa.js';
import { today, addDays, weekStart, relLabel } from '../lib/dates.js';
import { sheet, toast, icon } from './dom.js';
import { cheer } from './mascot.js';

const QUICK = [15, 30, 45, 60, 90];

// For the button on «پیشرفت».
export function activityLine() {
  const t = today();
  const goal = ACTIVITY_GOAL[phaseOn(store.profile(), t)] || 150;
  return `این هفته ${fa(activityWeek(store.get().activity, weekStart(t)))} از ${fa(goal)} دقیقه`;
}

/*
  What some conditions need before or during exercise (ACSM pre-participation screening, the
  MS Society on heat, gout flares). Shown under the goal.
*/
const MOVE_TIPS = {
  heart: 'با بیماری قلبی یا گرفتگی عروق، پیاده‌روی آرام را می‌توانی شروع کنی؛ برای ورزش تندتر از آن اول با پزشکت هماهنگ کن. اگر درد یا فشار قفسه‌ی سینه، تنگی نفس غیرعادی یا سرگیجه داشتی، همان لحظه دست نگه دار و به پزشک خبر بده.',
  ms: 'با ام‌اس، ورزش منظم به خستگی و قدرت کمک می‌کند. گرما علائم را موقتاً بدتر می‌کند: در هوای خنک یا ساعت خنک روز ورزش کن، آب همراهت باشد و هر وقت خسته شدی استراحت کن.',
  gout: 'در روزهای حمله‌ی نقرس به مفصل دردناک استراحت بده و بعد کم‌کم برگرد؛ موقع ورزش آب کافی بنوش.',
};
const moveTips = p => (p?.conditions || []).map(c => MOVE_TIPS[c]).filter(Boolean).map(t => `<p class="note doctor small">${t}</p>`).join('');

export function openActivity(on = today()) {
  let day = on;
  sheet.open(body => {
    const draw = () => {
      const phase = phaseOn(store.profile(), day);
      const goal = ACTIVITY_GOAL[phase] || 150;
      const cur = store.get().activity.find(a => a.day === day)?.minutes || 0;
      const isToday = day === today();
      body.innerHTML = `
        <div class="sheet-head"><h2>ثبت تحرک</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
        <div class="day-nav compact">
          <button class="icon-btn" data-a-prev aria-label="روز قبل">${icon.chevR}</button>
          <div class="day-title"><b>${relLabel(day)}</b></div>
          <button class="icon-btn" data-a-next aria-label="روز بعد" ${isToday ? 'disabled' : ''}>${icon.chevL}</button>
        </div>
        <form class="stack" novalidate>
          <label class="field"><span>چند دقیقه؟ (پیاده‌روی تند، ورزش، کار بدنی، دوچرخه…)</span><input name="m" inputmode="numeric" value="${cur ? fa(cur) : ''}" placeholder="مثلاً ${fa(30)}"></label>
          <div class="chips">${QUICK.map(q => `<button type="button" class="chip" data-q="${q}">${fa(q)}</button>`).join('')}</div>
          <p class="muted small">${phase === 'maintain'
            ? `در نگهداری هدف حدود ${fa(goal)} دقیقه در هفته است: کسانی که وزن کم‌شده را سال‌ها نگه می‌دارند معمولاً زیاد تحرک دارند. لازم نیست یک‌جا باشد؛ چند تکه‌ی ده‌دقیقه‌ای هم حساب است.`
            : `دست‌کم ${fa(goal)} دقیقه در هفته، توصیه‌ی سازمان جهانی بهداشت است. بیشتر از کالری‌سوزی، برای سلامت و نگه داشتن عضله و بعداً نگه داشتن وزن مهم است.`}</p>
          ${moveTips(store.profile())}
          <button class="btn primary block big">ذخیره</button>
        </form>`;
      const input = body.querySelector('[name=m]');
      body.querySelector('[data-close]').onclick = () => sheet.close();
      body.querySelector('[data-a-prev]').onclick = () => { day = addDays(day, -1); draw(); };
      body.querySelector('[data-a-next]').onclick = () => { if (!isToday) { day = addDays(day, 1); draw(); } };
      body.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { input.value = fa(Number(b.dataset.q)); });
      body.querySelector('form').onsubmit = e => {
        e.preventDefault();
        const raw = input.value.trim();
        const m = raw ? parseNum(raw) : 0;
        if (!(m >= 0 && m <= 1440)) return toast('تعداد دقیقه را درست وارد کن');
        store.setActivity(day, m);
        sheet.close();
        toast(m ? 'ثبت شد' : 'حذف شد');
        if (m) cheer('activity');
      };
    };
    draw();
  });
}
