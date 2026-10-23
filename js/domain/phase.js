/*
  The road has an end: reaching the goal weight, holding it, and resting on the way.
  Pure functions over the profile; the UI decides where to show what they find.

  Profile fields: goalKg (optional), phase ('maintain' or absent = losing), maintainFrom
  { day, kg, kcal } (kcal: the target losing ended on, where the climb to maintenance starts),
  breakFrom / breakUntil (a diet break), lossSince (when this stretch of losing began, if not
  at startDate), correctFrom / correctUntil (a short correction in maintenance), lightLog
  (in maintenance: logging food is optional while the weight stays in its band).

  Keeping the weight off is most of the work: in maintenance the weight being held has a
  band around it, and the response grows with how far above it the 7-day average is.
*/
import { addDays, diffDays } from '../lib/dates.js';
import { rollingAvg } from './stats.js';
import { phaseOn, correcting } from './targets.js';

export const BREAK_DAYS = 14;
export const BREAK_AFTER_WEEKS = 12; // of losing in a row before a break is offered
export const REGAIN_KG = 2;          // above the weight maintenance began at: back to losing
export const BAND_KG = 1;            // above it: a short correction; within it, all is well
export const LOW_KG = 2;             // below it: maintenance is set too low
export const CORRECT_DAYS = 14;
export const LIGHT_AFTER_WEEKS = 6;  // of maintenance, with the weight in its band, before logging may get lighter
export const LAPSE_DAYS = 10;        // without a weigh-in: stopping weighing is how regain usually starts
export const MILESTONES = [1, 3, 6, 12, 18, 24]; // months of maintenance worth celebrating

// The day the current stretch of losing began.
export function lossStart(p) {
  const days = [p?.startDate, p?.lossSince, p?.breakUntil ? addDays(p.breakUntil, 1) : null].filter(Boolean);
  return days.length ? days.sort()[days.length - 1] : null;
}

// Goal reached: the 7-day average (from at least two weigh-ins) is at or under the goal.
export function goalReached(p, sorted, day) {
  if (!(Number(p?.goalKg) > 0) || phaseOn(p, day) !== 'loss') return null;
  const from = addDays(day, -6);
  if (sorted.filter(w => w.day >= from && w.day <= day).length < 2) return null;
  const avg = rollingAvg(sorted, day);
  return avg !== null && avg <= Number(p.goalKg) ? { avg } : null;
}

// How far there is to go, for the progress screen: { left, done (0..1) } or null without a goal.
export function goalProgress(p, sorted, day) {
  const goal = Number(p?.goalKg);
  if (!(goal > 0) || !sorted.length) return null;
  const first = Number(sorted[0].kg);
  const now = rollingAvg(sorted, day) ?? Number(sorted[sorted.length - 1].kg);
  const total = first - goal;
  return { left: Math.max(0, now - goal), done: total > 0 ? Math.min(1, Math.max(0, (first - now) / total)) : now <= goal ? 1 : 0 };
}

// Losing for BREAK_AFTER_WEEKS in a row: a two-week break at maintenance is worth offering.
export function breakDue(p, day) {
  if (phaseOn(p, day) !== 'loss') return null;
  const since = lossStart(p);
  if (!since) return null;
  const weeks = Math.floor(diffDays(day, since) / 7);
  return weeks >= BREAK_AFTER_WEEKS ? { weeks, since } : null;
}

// In maintenance, and the average has crept REGAIN_KG above where maintenance began.
export function regain(p, sorted, day) {
  const z = zone(p, sorted, day);
  return z?.zone === 'red' ? { gain: z.gain, avg: z.avg } : null;
}

/*
  Where the 7-day average sits against the weight being held, in maintenance:
  'green' (from LOW_KG below to BAND_KG above), 'yellow' (BAND_KG to REGAIN_KG above: time for
  a short correction), 'red' (REGAIN_KG or more above: back to losing), 'low' (LOW_KG or more
  below: maintenance is set too low). { zone, avg, gain, kg, lo, hi } or null.
*/
export function zone(p, sorted, day) {
  const kg = Number(p?.maintainFrom?.kg);
  if (phaseOn(p, day) !== 'maintain' || !(kg > 0)) return null;
  const avg = rollingAvg(sorted, day);
  if (avg === null) return null;
  const gain = avg - kg;
  const z = gain >= REGAIN_KG - 1e-9 ? 'red' : gain >= BAND_KG - 1e-9 ? 'yellow' : gain <= -LOW_KG + 1e-9 ? 'low' : 'green';
  return { zone: z, avg, gain, kg, lo: kg - BAND_KG, hi: kg + BAND_KG };
}

// Weeks in maintenance so far (0 in the first week), or null outside it.
export function maintainWeeks(p, day) {
  if (phaseOn(p, day) !== 'maintain' || !p?.maintainFrom?.day) return null;
  return Math.max(0, Math.floor(diffDays(day, p.maintainFrom.day) / 7));
}

// A correction is worth offering: yellow, and none running.
export const correctionDue = (p, sorted, day) => {
  const z = zone(p, sorted, day);
  return z?.zone === 'yellow' && !correcting(p, day) ? z : null;
};

// Light logging is worth offering: LIGHT_AFTER_WEEKS into maintenance, in the band, not on yet.
export function lightDue(p, sorted, day) {
  if (p?.lightLog || (maintainWeeks(p, day) ?? 0) < LIGHT_AFTER_WEEKS) return false;
  return zone(p, sorted, day)?.zone === 'green';
}

// Light logging in force today: chosen, and the weight still in (or under) its band. Above
// it, full logging comes back by itself until the weight is back.
export function lightOn(p, sorted, day) {
  if (!p?.lightLog || phaseOn(p, day) !== 'maintain') return false;
  const z = zone(p, sorted, day);
  return !z || z.zone === 'green' || z.zone === 'low';
}

// Days since the last weigh-in, when that is long enough to say something (LAPSE_DAYS, or a few
// days past the chosen weigh-in interval when that is longer). null otherwise or with none yet.
export function lapse(sorted, day, every = 7) {
  const last = sorted.filter(w => w.day <= day).pop();
  if (!last) return null;
  const days = diffDays(day, last.day);
  return days >= Math.max(LAPSE_DAYS, (Number(every) || 7) + 3) ? { days, last: last.day } : null;
}

// The milestone reached most recently (months of maintenance), while it is fresh (three weeks)
// and the weight is not above the band. { months, day } or null.
export function milestone(p, sorted, day) {
  if (phaseOn(p, day) !== 'maintain' || !p?.maintainFrom?.day) return null;
  const z = zone(p, sorted, day);
  if (z && (z.zone === 'red' || z.zone === 'yellow')) return null;
  const start = p.maintainFrom.day;
  for (const m of [...MILESTONES].reverse()) {
    const at = addMonths(start, m);
    if (at <= day) return diffDays(day, at) < 21 ? { months: m, day: at } : null;
  }
  return null;
}

function addMonths(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(y, m - 1 + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

// The profile after a change of phase. kg: the weight to hold, for 'maintain'; kcal: the target
// losing ended on, where the climb to maintenance starts.
export function withPhase(p, action, { day, kg = null, kcal = null } = {}) {
  switch (action) {
    case 'maintain': return { ...p, phase: 'maintain', maintainFrom: { day, kg, ...(kcal ? { kcal } : {}) }, breakFrom: null, breakUntil: null, correctFrom: null, correctUntil: null };
    case 'loss': return { ...p, phase: 'loss', maintainFrom: null, lossSince: day, breakFrom: null, breakUntil: null, correctFrom: null, correctUntil: null };
    case 'correct': return { ...p, correctFrom: day, correctUntil: addDays(day, CORRECT_DAYS - 1) };
    case 'endCorrect': return { ...p, correctFrom: null, correctUntil: null };
    case 'light': return { ...p, lightLog: true };
    case 'full': return { ...p, lightLog: false };
    case 'break': return { ...p, phase: 'loss', maintainFrom: null, breakFrom: day, breakUntil: addDays(day, BREAK_DAYS - 1) };
    case 'endBreak': return { ...p, breakFrom: p.breakFrom && p.breakFrom < day ? p.breakFrom : null, breakUntil: p.breakFrom && p.breakFrom < day ? addDays(day, -1) : null, lossSince: day };
    default: return p;
  }
}
