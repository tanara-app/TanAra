/*
  «مکث» (BAZGASHT.md, phase 5; the owner chose it on 2026-11-21). A member says they will be away for a few
  days (travel, illness, guests, a rest), like the pause of Apple's activity rings (watchOS 11). While paused:
  no log or weigh-in reminder and none of the pushes of an absence (remind), no drift card, no welcome-back card,
  and a run of full days towards a reward does not break (a paused day that is still full counts, rewards.js).
  A pause starts today, lasts PAUSE_MAX days at most and can end any time.

  profile.data.pauses: [{ from, to }], days, both included. Past pauses are kept, so a run they protected stays
  protected. Pure functions; supabase/functions/remind has a copy of pauseOn and lastPauseEnd.
*/
import { addDays } from '../lib/dates.js';

export const PAUSE_MAX = 14;
export const PAUSE_LENGTHS = [[1, 'امروز'], [3, '۳ روز'], [7, 'یک هفته'], [14, 'دو هفته']];

const list = pauses => (Array.isArray(pauses) ? pauses : []).filter(x => x && x.from && x.to && x.to >= x.from);

// The pause `day` falls in, or null.
export const pauseOn = (pauses, day) => list(pauses).find(x => x.from <= day && day <= x.to) || null;

// Every paused day up to `upto`.
export function pausedDays(pauses, upto) {
  const out = new Set();
  for (const x of list(pauses)) for (let d = x.from; d <= x.to && d <= upto; d = addDays(d, 1)) out.add(d);
  return out;
}

// The pause going on at `day` ends: it goes if it began that day, else it ends the day before.
export function endPause(pauses, day) {
  const cur = pauseOn(pauses, day);
  return list(pauses).flatMap(x => (x !== cur ? [x] : x.from >= day ? [] : [{ ...x, to: addDays(day, -1) }]));
}

// A pause of `days` days from `day` (today included), in place of one going on.
export function startPause(pauses, day, days) {
  const n = Math.max(1, Math.min(PAUSE_MAX, Math.round(Number(days)) || 1));
  return [...endPause(pauses, day), { from: day, to: addDays(day, n - 1) }];
}

// The last day of the latest pause that ended before `day`, or null: an absence is counted from there.
export function lastPauseEnd(pauses, day) {
  return list(pauses).map(x => x.to).filter(t => t < day).sort().pop() || null;
}
