// «نکته‌ی امروز» on «امروز»: one tip a day from the fixed list (TIPS.md → js/data/tips.js), the same
// for the whole family (js/domain/tips.js), with no AI and nothing to wait for. The title shows and
// the text folds open on a tap; the choice is remembered on this device. Whoever doesn't want it turns
// it off in «تنظیمات» (profile.tipOff).
import * as store from '../data/store.js';
import { TIPS } from '../data/tips.js';
import { tipOfDay } from '../domain/tips.js';
import { today } from '../lib/dates.js';
import { esc } from '../lib/fa.js';
import { icon } from './dom.js';
import { aiAvailable } from '../ai/hooshvareh.js';

const BULB = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.1V16h5v-.1c0-.8.4-1.6 1.1-2.1A6 6 0 0 0 12 3z"/></svg>';
const FOLD = () => store.localKey('tipOpen');
const isOpen = () => { try { return localStorage.getItem(FOLD()) === '1'; } catch { return false; } };

export const tipOn = () => !store.profile()?.tipOff;
export const setTipOn = on => store.saveProfile({ ...store.profile(), tipOff: !on });

export function tipCard() {
  const t = tipOn() && tipOfDay(TIPS, store.profile(), today());
  if (!t) return '';
  return `<section class="card ai-card fold${isOpen() ? '' : ' folded'}" data-tip-fold>
    <div class="ai-card-h"><span class="ai-mark">${BULB}</span><b>نکته‌ی امروز</b></div>
    <button type="button" class="fold-h tip-title" aria-expanded="${isOpen()}"><b>${esc(t.title)}</b>${icon.chevD}</button>
    <div class="fold-body"><div class="ai-text"><p>${esc(t.body)}</p></div>${aiAvailable() ? '<a class="link small" href="#/ai">بیشتر بپرس</a>' : ''}</div>
  </section>`;
}

export function bindTip(root = document) {
  root.querySelector('[data-tip-fold] .fold-h')?.addEventListener('click', e => {
    const open = e.currentTarget.closest('[data-tip-fold]').classList.toggle('folded') === false;
    e.currentTarget.setAttribute('aria-expanded', open);
    try { localStorage.setItem(FOLD(), open ? '1' : '0'); } catch { /* ignore */ }
  });
}
