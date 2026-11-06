// Fixed safety rules. Pure functions; the UI decides where to show them.
import { addDays, weekStart } from '../lib/dates.js';
import { sortedWeights, weekAvg, totals } from './stats.js';

/*
  Rapid loss: the weekly mean weight dropped by more than `perWeek` kg (1.5; 1 for a teen, see
  rapidLimit), three weeks in a row.
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

// kg a week that counts as too fast: stricter for a body that is still growing.
export const rapidLimit = teen => (teen ? 1 : 1.5);

/*
  Under-eating: three days in a row (before today) each logged as a full day and below the
  safety floor. A "full day" means at least two different meals were logged — otherwise a day
  where only breakfast was entered would look like starvation.
*/
export function underEating(entries, floor, day) {
  const days = [1, 2, 3].map(n => addDays(day, -n));
  for (const d of days) {
    const list = entries.filter(e => e.day === d);
    const meals = new Set(list.map(e => e.meal));
    if (meals.size < 2) return null;
    if (totals(list).kcal >= floor) return null;
  }
  return { days };
}
