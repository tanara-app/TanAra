/*
  «مکث» (BAZGASHT.md, phase 5): the sheet that starts or ends a pause, its row in «تنظیمات», and the pill on
  «امروز» while one is on. What a pause does is in domain/pause.js.
*/
import * as store from '../data/store.js';
import { pauseOn, startPause, endPause, PAUSE_LENGTHS } from '../domain/pause.js';
import { today, faDM } from '../lib/dates.js';
import { sheet, toast, icon } from './dom.js';

export const PAUSE_ICON = (size = 20) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="6.5" y="5" width="3.5" height="14" rx="1.2"/><rect x="14" y="5" width="3.5" height="14" rx="1.2"/></svg>`;

export const currentPause = () => pauseOn(store.profile()?.pauses, today());
// the second line of its row in «تنظیمات»
export const pauseLine = () => { const c = currentPause(); return c ? `تا ${faDM(c.to)}` : 'خاموش'; };

const save = pauses => { const p = store.profile(); store.saveProfile({ ...p, pauses }); };

export function openPause({ onDone = () => {} } = {}) {
  let len = 3;
  sheet.open(body => {
    const draw = () => {
      const cur = currentPause();
      body.innerHTML = `
        <div class="sheet-head"><h2>مکث</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
        <p class="muted small">یادآورها ساکت می‌شوند و رشته‌ی جایزه نمی‌شکند.</p>
        ${cur ? `<div class="pause-now">${PAUSE_ICON(22)}<b>تا ${faDM(cur.to)}</b></div>
          <button class="btn block" data-pause-end>تمام کردن مکث</button>`
        : `<div class="seg" data-len>${PAUSE_LENGTHS.map(([n, l]) => `<button type="button" data-v="${n}" class="${n === len ? 'on' : ''}">${l}</button>`).join('')}</div>
          <button class="btn primary block" data-pause-go>شروع مکث</button>`}`;
      body.querySelector('[data-close]').onclick = () => sheet.close();
      body.querySelectorAll('[data-len] button').forEach(b => b.onclick = () => { len = Number(b.dataset.v); draw(); });
      body.querySelector('[data-pause-go]')?.addEventListener('click', () => {
        save(startPause(store.profile()?.pauses, today(), len));
        toast(`مکث تا ${faDM(currentPause().to)}`);
        sheet.close();
        onDone();
      });
      body.querySelector('[data-pause-end]')?.addEventListener('click', () => {
        save(endPause(store.profile()?.pauses, today()));
        sheet.close();
        onDone();
      });
    };
    draw();
  });
}

// On «امروز» while paused: where it shows and how it ends.
export function pausePill() {
  const c = currentPause();
  return c ? `<button type="button" class="pill pause-pill" data-pause-pill>${PAUSE_ICON(16)}<span>مکث تا <b>${faDM(c.to)}</b></span></button>` : '';
}
export function bindPausePill(root, redraw) {
  root.querySelector('[data-pause-pill]')?.addEventListener('click', () => openPause({ onDone: redraw }));
}
