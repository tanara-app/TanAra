/*
  The road has an end: reaching the goal weight, holding it, and resting on the way.
  Pure functions over the profile; the UI decides where to show what they find.

  Profile fields: goalKg (optional), phase ('maintain' or absent = losing), maintainFrom
  { day, kg }, breakFrom / breakUntil (a diet break), lossSince (when this stretch of
  losing began, if not at startDate).
*/
import { addDays, diffDays } from '../lib/dates.js';
import { rollingAvg } from './stats.js';
import { phaseOn } from './targets.js';

export const BREAK_DAYS = 14;
export const BREAK_AFTER_WEEKS = 12; // of losing in a row before a break is offered
export const REGAIN_KG = 2;          // above the weight maintenance began at

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
  if (phaseOn(p, day) !== 'maintain' || !(Number(p?.maintainFrom?.kg) > 0)) return null;
  const avg = rollingAvg(sorted, day);
  if (avg === null) return null;
  const gain = avg - Number(p.maintainFrom.kg);
  return gain >= REGAIN_KG ? { gain, avg } : null;
}

// The profile after a change of phase. kg: the weight to hold, for 'maintain'.
export function withPhase(p, action, { day, kg = null } = {}) {
  switch (action) {
    case 'maintain': return { ...p, phase: 'maintain', maintainFrom: { day, kg }, breakFrom: null, breakUntil: null };
    case 'loss': return { ...p, phase: 'loss', maintainFrom: null, lossSince: day, breakFrom: null, breakUntil: null };
    case 'break': return { ...p, phase: 'loss', maintainFrom: null, breakFrom: day, breakUntil: addDays(day, BREAK_DAYS - 1) };
    case 'endBreak': return { ...p, breakFrom: p.breakFrom && p.breakFrom < day ? p.breakFrom : null, breakUntil: p.breakFrom && p.breakFrom < day ? addDays(day, -1) : null, lossSince: day };
    default: return p;
  }
}
