/*
  «چه شد؟» (BAZGASHT.md, phase 7): the sheet the last push of an absence opens (#/why), and that the welcome-back
  card of «امروز» opens with a reason already tapped. What each reason does:
  - «وقت ندارم», «ثبت کردن سخت است»: one line (two rough meals a day are enough) and the small step;
  - «فقط یادم رفت»: the same, and the reminder's time to change;
  - «نتیجه نگرفتم»: «برگشت به مسیر» with that cause ticked; «حالم خوب نیست»: «برگشت به مسیر»;
  - «فعلاً نمی‌خواهم»: a month with nothing sent (quietUntil).
*/
import * as store from '../data/store.js';
import { REASONS, reasonLabel, whyKey, quietEnd } from '../domain/why.js';
import { today, faDM } from '../lib/dates.js';
import { sheet, toast, icon } from './dom.js';
import { openMeasure } from './measure.js';
import { openCheckin } from './checkin.js';
import { openReminders } from './reminders.js';
import { absenceSince } from './back.js';

const edCare = p => ['yes', 'unsure'].includes(p?.edHistory);
const LINES = {
  time: 'روزی دو وعده‌ی اصلی، تقریبی، کافی است؛ یک دقیقه وقت می‌گیرد.',
  hard: 'لازم نیست دقیق باشد: روزی دو وعده‌ی تقریبی کافی است، و غذاهای تکراری از بانک غذا با یک لمس ثبت می‌شوند.',
  forgot: 'یادآور ثبت غذا هر شب می‌آید؛ اگر ساعت دیگری بهتر است، عوضش کن.',
};

export const reasonChips = () => `<div class="chip-row why-chips">${REASONS.map(([k, l]) => `<button type="button" class="chip-btn" data-why="${k}">${l}</button>`).join('')}</div>`;

// `reason`: already tapped (on the welcome-back card). Nothing opens when they are not away.
export function openWhy({ reason = null } = {}) {
  const since = absenceSince();
  if (!since) return;
  sheet.open(body => {
    const head = `<div class="sheet-head"><h2>این چند وقت چه شد؟</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>`;
    const bindClose = () => { body.querySelector('[data-close]').onclick = () => sheet.close(); };
    const ask = () => {
      body.innerHTML = `${head}${reasonChips()}`;
      bindClose();
      body.querySelectorAll('[data-why]').forEach(b => b.onclick = () => reply(b.dataset.why));
    };
    const reply = r => {
      store.saveNote({ key: whyKey(since), kind: 'why', text: reasonLabel(r), data: { reason: r, day: today() } });
      if (r === 'results') return sheet.closeThen(() => openCheckin({ causes: ['نتیجه نمی‌بینم'] }));
      if (r === 'mood') return sheet.closeThen(() => openCheckin());
      if (r === 'notnow') {
        const until = quietEnd(today());
        store.saveProfile({ ...store.profile(), quietUntil: until });
        toast(`تا ${faDM(until)} چیزی نمی‌فرستیم`);
        return sheet.close();
      }
      body.innerHTML = `${head}
        <p>${LINES[r]}</p>
        ${r === 'forgot' ? '<button class="link small" data-why-rem>ساعت یادآور</button>' : ''}
        <div class="row gap">
          <button class="btn primary grow" data-why-meal>ثبت یک وعده</button>
          ${edCare(store.profile()) ? '' : '<button class="btn grow" data-why-weigh>فقط وزن</button>'}
        </div>`;
      bindClose();
      // the same sheet as the «ثبت غذا» button of «امروز»
      body.querySelector('[data-why-meal]').onclick = () => sheet.closeThen(() => {
        if (location.hash !== '#/today') location.hash = '#/today';
        setTimeout(() => document.querySelector('[data-log]')?.click(), 50);
      });
      body.querySelector('[data-why-weigh]')?.addEventListener('click', () => sheet.closeThen(() => openMeasure()));
      body.querySelector('[data-why-rem]')?.addEventListener('click', () => sheet.closeThen(() => openReminders()));
    };
    reason ? reply(reason) : ask();
  });
}
