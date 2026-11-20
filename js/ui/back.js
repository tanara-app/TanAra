/*
  The welcome back (BAZGASHT.md, phase 2). Opening the app after three days or more with nothing recorded,
  and nothing yet today, the first card of «امروز» offers one small step: a meal, or just the weight
  (Duolingo's re-onboarding, cut down to one tap; two logged meals a day are what counts, and a weigh-in
  is the easiest way back). No count of the days away and no explanation. It goes once anything is
  recorded, or when closed (for that absence).
*/
import * as store from '../data/store.js';
import { awayDays, BACK_DAYS } from '../domain/lapse.js';
import { today, addDays } from '../lib/dates.js';
import { icon } from './dom.js';
import { dismissed, dismiss } from './notices.js';
import { openMeasure } from './measure.js';

const edCare = p => ['yes', 'unsure'].includes(p?.edHistory);

// The day the absence began after (its last active day), or null when they are not away.
function absence() {
  const t = today();
  const gap = awayDays(store.get(), t);
  return gap !== null && gap >= BACK_DAYS ? addDays(t, -gap) : null;
}

export function backCard() {
  const since = absence();
  if (!since || dismissed('back', since)) return '';
  return `<section class="card back-card" data-back-card>
    <div class="back-h"><b>از همین امروز</b><button class="icon-btn" data-back-close aria-label="بستن">${icon.close}</button></div>
    <div class="row gap">
      <button class="btn primary grow" data-back-meal>ثبت یک وعده</button>
      ${edCare(store.profile()) ? '' : '<button class="btn grow" data-back-weigh>فقط وزن</button>'}
    </div>
  </section>`;
}

export function bindBack(root) {
  const card = root.querySelector('[data-back-card]');
  if (!card) return;
  // the same sheet as the «ثبت غذا» button of «امروز»
  card.querySelector('[data-back-meal]').onclick = () => root.querySelector('[data-log]')?.click();
  card.querySelector('[data-back-weigh]')?.addEventListener('click', () => openMeasure());
  card.querySelector('[data-back-close]').onclick = () => {
    const since = absence();
    if (since) dismiss('back', since);
    card.remove();
  };
}
