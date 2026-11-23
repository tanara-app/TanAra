/*
  What the body really uses in a day, measured instead of guessed. Pure functions.

  The formula in targets.js (Mifflin-St Jeor × an activity factor) can be a few hundred
  calories off for one person. Once there are a few weeks of data the answer is in the log:
  energy used = energy eaten − energy that came out of (or went into) the body's stores, and
  the stores show up as the weight trend (about 7700 kcal per kg).

  Only fully logged days count for the eating side (what they said about the day, else at least
  two different meals: fullDay in stats.js, the rule the under-eating check uses too), and the first week of use is skipped: the early drop is
  mostly water and would make the body look hungrier than it is. Four weeks are looked at, or
  six for someone weighing once a week (the reminder's default): the wider span steadies the
  trend as much as more weigh-ins would, so nobody is asked to step on the scale more often.
  Food counts up to yesterday (today isn't over), but weigh-ins count up to today: a weigh-in
  the card asked for must count the moment it is saved (2026-11-23: it didn't, and the card kept
  asking for «one more»). Six weeks need five weigh-ins, not six: people weighing «once a week»
  weigh every 7 to 9 days, and with six the card went back to asking each time the oldest one
  slid out of the window.
  A steady habit of logging a
  little less than was eaten moves the result by the same amount, and the target with it, so
  the target stays right in the person's own way of logging.
*/
import { addDays, diffDays } from '../lib/dates.js';
import { baseMeal } from './meals.js';
import { sortedWeights, fullDay } from './stats.js';
import { computeTargets } from './targets.js';

export const ENERGY = {
  WINDOW: 28,      // days looked at, ending yesterday
  LONG_WINDOW: 42, // … or these, when the 28 hold too few weigh-ins: six weeks of weighing once a week is enough
  SKIP_START: 7,   // days after the start that never count
  MIN_SPAN: 21,    // the window must be at least this long
  MIN_DAYS: 14,    // fully logged days needed in it
  MIN_WEIGHS: 6,   // weigh-ins needed in it …
  MIN_WEIGHS_LONG: 5, // … or in the six weeks
  MIN_WEIGH_SPAN: 14, // … spread over at least this many days
  KCAL_PER_KG: 7700,
  MAX_OFF: 0.25,   // further than this from the formula is more likely a logging gap than a metabolism
};

// kg per day through the weigh-ins, by least squares.
function slope(w) {
  const xs = w.map(x => diffDays(x.day, w[0].day));
  const ys = w.map(x => Number(x.kg));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, den = 0;
  xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
  return den ? num / den : 0;
}

/*
  { ready: true, tdee, intake, perWeek, days, weighs, from, to, clamped } or, while there
  isn't enough data, { ready: false, days, weighs, needDays, needWeighs, needSpan }.
  `formula` (the formula's figure, optional) bounds the result.
*/
export function measuredTdee(entries, weights, { day, startDate, formula, marks } = {}) {
  const E = ENERGY;
  const to = addDays(day, -1); // the last day of food; weigh-ins go up to `day` itself
  const since = n => {
    const d = addDays(day, -n), first = startDate ? addDays(startDate, E.SKIP_START) : d;
    return first > d ? first : d;
  };
  const weighed = from => sortedWeights(weights).filter(x => x.day >= from && x.day <= day);
  const short = weighed(since(E.WINDOW)).length >= E.MIN_WEIGHS;
  const from = since(short ? E.WINDOW : E.LONG_WINDOW);
  const minWeighs = short ? E.MIN_WEIGHS : E.MIN_WEIGHS_LONG;

  const byDay = new Map();
  for (const e of entries) {
    if (e.day < from || e.day > to) continue;
    const d = byDay.get(e.day) || { day: e.day, kcal: 0, meals: new Set() };
    d.kcal += Number(e.kcal) || 0;
    d.meals.add(baseMeal(e.meal));
    byDay.set(e.day, d);
  }
  const full = [...byDay.values()].filter(d => fullDay(d.day, d.meals.size, marks));
  const w = weighed(from);
  const wSpan = w.length > 1 ? diffDays(w[w.length - 1].day, w[0].day) : 0;
  const span = diffDays(to, from) + 1;

  const needDays = Math.max(0, E.MIN_DAYS - full.length);
  const needWeighs = Math.max(0, minWeighs - w.length);
  const needSpan = span < E.MIN_SPAN || wSpan < E.MIN_WEIGH_SPAN;
  if (needDays || needWeighs || needSpan) return { ready: false, days: full.length, weighs: w.length, minWeighs, needDays, needWeighs, needSpan, from, to };

  const intake = full.reduce((s, d) => s + d.kcal, 0) / full.length;
  const perDay = slope(w);
  const raw = intake - perDay * E.KCAL_PER_KG;
  let tdee = raw, clamped = false;
  if (Number(formula) > 0) {
    const lo = formula * (1 - E.MAX_OFF), hi = formula * (1 + E.MAX_OFF);
    if (raw < lo || raw > hi) { tdee = Math.min(hi, Math.max(lo, raw)); clamped = true; }
  }
  return { ready: true, tdee: Math.round(tdee / 50) * 50, intake: Math.round(intake), perWeek: perDay * 7, days: full.length, weighs: w.length, from, to, clamped };
}

// Targets for a profile at a weight: from the measured figure when there is one, else the formula.
// Returns { t (as computeTargets), m (as measuredTdee) }.
export function nextTargets(p, entries, weights, weightKg, day, marks) {
  const f = computeTargets({ ...p, weightKg });
  const m = measuredTdee(entries, weights, { day, startDate: p.startDate, formula: f.tdee, marks });
  return { t: m.ready ? computeTargets({ ...p, weightKg, measuredTdee: m.tdee }) : f, m };
}
