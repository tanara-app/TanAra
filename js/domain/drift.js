/*
  Drifting off the road: the early signs that the diet is slipping, read from the record, so
  the app can stop and ask what is going on (the «برگشت به مسیر» check-in) before a small slip
  becomes a regain. Pure functions; the UI decides when to ask and Hooshvareh looks for the why.

  Signs, each judged on the last full week (yesterday back) against the weeks before it:
  - weight: the mean of the last two weeks' weigh-ins WEIGHT_KG above the two to six weeks before
    (while losing only; in maintenance the band in phase.js answers for the weight);
  - waist: the latest measurement WAIST_CM above the one before it;
  - logging: logged days fell by LOG_DROP or more from the usual (not under light logging);
  - over: OVER_DAYS or more well-logged days OVER_KCAL above the target;
  - plan: in the diet plan, under half the occasions eaten as planned, after keeping to it.
*/
import { addDays, diffDays } from '../lib/dates.js';

export const WEIGHT_KG = 0.7;
export const WAIST_CM = 1.5;
export const LOG_DROP = 3;
export const OVER_KCAL = 250;
export const OVER_DAYS = 3;
export const AGAIN_DAYS = 7;      // after a check-in, quiet for a week; then: how did it go?
export const FOLLOW_UNTIL = 21;   // the follow-up question stays this long, then lapses

const mean = list => list.reduce((s, x) => s + x, 0) / list.length;
const r1 = n => Math.round(n * 10) / 10;

export function weightSign(weights, day) {
  const kg = (from, to) => weights.filter(w => w.day >= from && w.day <= to).map(w => Number(w.kg));
  const now = kg(addDays(day, -13), day);
  const before = kg(addDays(day, -41), addDays(day, -14));
  if (!now.length || !before.length) return null;
  const gain = mean(now) - mean(before);
  return gain >= WEIGHT_KG - 1e-9 ? { from: r1(mean(before)), to: r1(mean(now)), gain: r1(gain) } : null;
}

// The latest waist against the one before it, while the latest is still recent (three weeks).
export function waistSign(waists, day) {
  const list = [...waists].filter(w => w.day <= day).sort((a, b) => (a.day < b.day ? -1 : 1));
  const last = list[list.length - 1], prev = list[list.length - 2];
  if (!last || !prev || diffDays(day, last.day) > 21 || diffDays(last.day, prev.day) > 60) return null;
  const gain = Number(last.cm) - Number(prev.cm);
  return gain >= WAIST_CM - 1e-9 ? { from: r1(Number(prev.cm)), to: r1(Number(last.cm)), gain: r1(gain), since: prev.day } : null;
}

// Days with something logged in the last week, against the weekly mean of the three before.
export function loggingSign(entries, day) {
  const days = (from, to) => new Set(entries.filter(e => e.day >= from && e.day <= to).map(e => e.day)).size;
  const now = days(addDays(day, -7), addDays(day, -1));
  const before = days(addDays(day, -28), addDays(day, -8)) / 3;
  return before >= 4 && now <= before - LOG_DROP + 1e-9 ? { before: r1(before), now } : null;
}

// Well-logged days (two meals or more) last week that went well over that day's target.
export function overSign(entries, day, kcalOn) {
  const by = new Map();
  for (const e of entries) if (e.day >= addDays(day, -7) && e.day <= addDays(day, -1)) {
    const d = by.get(e.day) || { kcal: 0, meals: new Set() };
    d.kcal += Number(e.kcal) || 0; d.meals.add(e.meal);
    by.set(e.day, d);
  }
  const over = [...by].filter(([d, x]) => x.meals.size >= 2 && kcalOn(d) && x.kcal > kcalOn(d) + OVER_KCAL)
    .map(([d, x]) => Math.round(x.kcal - kcalOn(d)));
  return over.length >= OVER_DAYS ? { days: over.length, by: Math.round(mean(over)) } : null;
}

// adherence(from, to) → { done, of } over the days a plan was in force.
export function planSign(adherence, day) {
  const now = adherence(addDays(day, -7), addDays(day, -1));
  const before = adherence(addDays(day, -21), addDays(day, -8));
  if (now.of < 15 || before.of < 25) return null;
  const a = now.done / now.of, b = before.done / before.of;
  return a < 0.5 && b >= 0.7 ? { before: Math.round(b * 100), now: Math.round(a * 100) } : null;
}

/*
  Every sign showing on `day`, or null when there are none. `phase` is today's phase: no signs
  on a diet break (its first days bring water weight back), and in maintenance no weight sign.
  `light`: light logging is in force, so fewer logged days is expected.
*/
export function drift({ entries = [], weights = [], waists = [], phase = 'loss', light = false, kcalOn, adherence = null }, day) {
  if (phase === 'break') return null;
  const signs = {
    weight: phase === 'loss' ? weightSign(weights, day) : null,
    waist: waistSign(waists, day),
    logging: light ? null : loggingSign(entries, day),
    over: light || !kcalOn ? null : overSign(entries, day, kcalOn),
    plan: adherence ? planSign(adherence, day) : null,
  };
  for (const k of Object.keys(signs)) if (!signs[k]) delete signs[k];
  return Object.keys(signs).length ? signs : null;
}

/*
  Check-ins are ai_notes `checkin:<day>`. The latest one, and what to do with it today:
  'quiet' (under a week old), 'follow' (a week or more, outcome not given yet, not too old),
  or null.
*/
export function lastCheckin(notes) {
  return notes.filter(n => n.kind === 'checkin').sort((a, b) => (a.key < b.key ? 1 : -1))[0] || null;
}
export function checkinState(n, day) {
  if (!n) return null;
  const age = diffDays(day, n.key.slice(8));
  if (age < AGAIN_DAYS) return 'quiet';
  return !n.data?.outcome && age <= FOLLOW_UNTIL ? 'follow' : null;
}
