/*
  The welcome back (BAZGASHT.md, phase 2). Opening the app after three days or more with nothing recorded,
  and nothing yet today, the first card of «امروز» offers one small step: a meal, or just the weight
  (Duolingo's re-onboarding, cut down to one tap; two logged meals a day are what counts, and a weigh-in
  is the easiest way back). No count of the days away and no explanation. It goes once anything is
  recorded, or when closed (for that absence).

  Away a week or more and not yet asked this absence, the card first asks «این چند وقت چه شد؟» with the six
  one-tap reasons (BAZGASHT.md phase 7, ui/why.js); once answered it is the small step again.

  Away a month or more (BAZGASHT.md phase 9), the step is «شروع دوباره»: today's weight first, then a meal. Once
  they have weighed on the day they came back, one card shows the daily targets worked out with that weight,
  old and new, to take or leave (not with targets set by hand, nor with a possible eating-disorder history,
  nor when the change is too small to matter: under STEP_KCAL and STEP_PROTEIN).
*/
import * as store from '../data/store.js';
import { awayDays, returnedAfter, BACK_DAYS, AWAY_DAYS, GONE_DAYS } from '../domain/lapse.js';
import { nextTargets } from '../domain/energy.js';
import { effectiveTargets } from '../domain/targets.js';
import { logMarks } from '../domain/stats.js';
import { fa } from '../lib/fa.js';
import { recalcTargets } from './profile.js';
import { today, addDays, diffDays } from '../lib/dates.js';
import { answered } from '../domain/why.js';
import { openWhy, reasonChips } from './why.js';
import { icon, toast } from './dom.js';
import { dismissed, dismiss } from './notices.js';
import { openMeasure } from './measure.js';
import { pauseOn } from '../domain/pause.js';

const edCare = p => ['yes', 'unsure'].includes(p?.edHistory);
const STEP_KCAL = 50, STEP_PROTEIN = 5;

/*
  The day they came back after a month or more, with a weigh-in that day: { since, from, to } (the targets they
  have and the ones today's weight gives, as «امروز» shows them), or null when there is nothing to offer.
*/
function restart() {
  const t = today(), s = store.get(), p = store.profile();
  const since = returnedAfter(s, t);
  if (!since || dismissed('restart', since) || edCare(p) || p?.targets?.manualKcal || p?.targets?.manualProtein) return null;
  const w = s.weights.find(x => x.day === t);
  if (!w || !p?.targets) return null;
  const { t: next } = nextTargets(p, s.entries, s.weights, Number(w.kg), t, logMarks(s.ai_notes));
  const from = effectiveTargets(p, t);
  const to = effectiveTargets({ ...p, targets: { ...p.targets, kcal: next.kcal, protein: next.protein, baseWeight: Number(w.kg) } }, t);
  const moved = Math.abs(to.kcal - from.kcal) >= STEP_KCAL || Math.abs(to.protein - from.protein) >= STEP_PROTEIN;
  return moved ? { since, from, to } : null;
}

// The day the absence began after (its last active day), or null when they are not away.
export function absenceSince() {
  const t = today();
  if (pauseOn(store.profile()?.pauses, t)) return null; // they said they would be away
  const gap = awayDays(store.get(), t);
  return gap !== null && gap >= BACK_DAYS ? addDays(t, -gap) : null;
}

export function backCard() {
  const r = restart();
  if (r) return `<section class="card back-card" data-restart-card>
    <div class="back-h"><b>هدف‌های روزانه با وزن امروز</b><button class="icon-btn" data-restart-no aria-label="بستن">${icon.close}</button></div>
    <div class="restart-nums">
      <span>کالری <b>${fa(r.from.kcal)}</b> ← <b>${fa(r.to.kcal)}</b></span>
      <span>پروتئین <b>${fa(r.from.protein)}</b> ← <b>${fa(r.to.protein)}</b> گرم</span>
    </div>
    <div class="row gap"><button class="btn primary grow" data-restart-yes>به‌روز کن</button><button class="btn grow" data-restart-no>همان قبلی</button></div>
  </section>`;
  const since = absenceSince();
  if (!since || dismissed('back', since)) return '';
  if (diffDays(today(), since) >= AWAY_DAYS && !answered(store.get().ai_notes, since)) return `<section class="card back-card" data-back-card>
    <div class="back-h"><b>این چند وقت چه شد؟</b><button class="icon-btn" data-back-close aria-label="بستن">${icon.close}</button></div>
    ${reasonChips()}
  </section>`;
  // a month or more away: start again, from today's weight (not with a possible eating-disorder history)
  const again = diffDays(today(), since) >= GONE_DAYS && !edCare(store.profile());
  return `<section class="card back-card" data-back-card>
    <div class="back-h"><b>${again ? 'شروع دوباره' : 'از همین امروز'}</b><button class="icon-btn" data-back-close aria-label="بستن">${icon.close}</button></div>
    <div class="row gap">${again
      ? '<button class="btn primary grow" data-back-weigh>وزن امروز</button><button class="btn grow" data-back-meal>ثبت یک وعده</button>'
      : `<button class="btn primary grow" data-back-meal>ثبت یک وعده</button>${edCare(store.profile()) ? '' : '<button class="btn grow" data-back-weigh>فقط وزن</button>'}`}
    </div>
  </section>`;
}

export function bindBack(root) {
  const rc = root.querySelector('[data-restart-card]');
  if (rc) {
    const done = () => { const r = returnedAfter(store.get(), today()); if (r) dismiss('restart', r); rc.remove(); };
    rc.querySelector('[data-restart-yes]').onclick = () => { done(); recalcTargets(); toast('هدف‌ها به‌روز شد'); };
    rc.querySelectorAll('[data-restart-no]').forEach(b => b.onclick = done);
  }
  const card = root.querySelector('[data-back-card]');
  if (!card) return;
  // the same sheet as the «ثبت غذا» button of «امروز»
  card.querySelectorAll('[data-why]').forEach(b => b.onclick = () => openWhy({ reason: b.dataset.why }));
  card.querySelector('[data-back-meal]')?.addEventListener('click', () => root.querySelector('[data-log]')?.click());
  card.querySelector('[data-back-weigh]')?.addEventListener('click', () => openMeasure());
  card.querySelector('[data-back-close]').onclick = () => {
    const since = absenceSince();
    if (since) dismiss('back', since);
    card.remove();
  };
}
