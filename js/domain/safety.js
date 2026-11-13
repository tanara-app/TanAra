// Fixed safety rules. Pure functions; the UI decides where to show them.
import { addDays, weekStart } from '../lib/dates.js';
import { baseMeal } from './meals.js';
import { sortedWeights, weekAvg, totals } from './stats.js';

/*
  Rapid loss: the weekly mean weight dropped by more than `perWeek` kg (1.5; 1 for a teen and
  with some conditions, see rapidLimit), three weeks in a row.
  Weeks are Sat→Fri. The first three weeks of use are exempt (early water loss is normal),
  so only drops landing in week 4 or later count. A week needs at least one weigh-in;
  the running week counts only once it has three, so a single low reading can't trigger it.
*/
export function rapidLoss(weights, startDay, day, perWeek = 1.5) {
  if (!startDay || weights.length < 4) return null;
  const sorted = sortedWeights(weights);
  const first = weekStart(startDay);
  const current = weekStart(day);
  const weeks = [];
  for (let ws = first; ws <= current; ws = addDays(ws, 7)) {
    const a = weekAvg(sorted, ws);
    const ok = a && (ws < current || a.n >= 3);
    weeks.push(ok ? a.avg : null);
  }
  // latest usable week
  let i = weeks.length - 1;
  while (i >= 0 && weeks[i] === null) i--;
  if (i < 5) return null; // need drops at weeks i, i-1, i-2 all ≥ index 3
  const drops = [];
  for (let k = i; k > i - 3; k--) {
    if (weeks[k] === null || weeks[k - 1] === null) return null;
    drops.push(weeks[k - 1] - weeks[k]);
  }
  if (drops.every(d => d > perWeek)) return { drops, weekIndex: i, perWeek };
  return null;
}

/*
  kg a week that counts as too fast: 1.5, and 1 for a body that is still growing — or with
  gout (fast loss raises uric acid and brings on attacks), gallstones (losing more than about
  1.5 kg a week makes new stones likely, NIDDK) or fatty liver (AASLD: no more than about 1 kg
  a week; faster loss can worsen liver inflammation).
*/
export const SLOW_LOSS = ['gout', 'gallstone', 'liver'];
// …and 1 kg too while breastfeeding or on insulin or a sugar-lowering pill (`slow`: the profile's
// pregnancy / glucoseMeds), where a fast loss risks the milk or a low blood sugar.
export const slowPace = p => !!p?.glucoseMeds || p?.pregnancy === 'breastfeeding';
export const rapidLimit = (teen, conditions = [], slow = false) => (teen || slow || conditions.some(c => SLOW_LOSS.includes(c)) ? 1 : 1.5);

/*
  Under-eating: three days in a row (before today) each logged as a full day and below the
  safety floor. A "full day" means at least two different meals were logged — otherwise a day
  where only breakfast was entered would look like starvation.
*/
export function underEating(entries, floor, day) {
  const days = [1, 2, 3].map(n => addDays(day, -n));
  for (const d of days) {
    const list = entries.filter(e => e.day === d);
    const meals = new Set(list.map(e => baseMeal(e.meal)));
    if (meals.size < 2) return null;
    if (totals(list).kcal >= floor) return null;
  }
  return { days };
}
