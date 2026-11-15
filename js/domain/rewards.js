/*
  «جوایز»: things a member earns by keeping a habit. Pure functions.

  The first reward is the «پرنیان» finish (a soft, plush look laid over any of the colour themes,
  css/app.css [data-finish="parniyan"]), for RUN full days in a row: a full day is the rule used
  everywhere (stats.js fullDay: what they said about the day, else two meals or more). Earned once,
  it stays earned (profile.data.rewards).
*/
import { addDays } from '../lib/dates.js';
import { baseMeal } from './meals.js';
import { logMarks, fullDay } from './stats.js';

export const REWARDS = {
  parniyan: { name: 'پرنیان', run: 21 },
};

/*
  { best, now }: the longest run of full days so far (up to `day`), and the run going on now —
  ending today when today is already full, else ending yesterday (today is not over yet).
*/
export function fullRuns(entries, notes, day) {
  const meals = new Map();
  for (const e of entries) {
    if (e.day > day) continue;
    (meals.get(e.day) || meals.set(e.day, new Set()).get(e.day)).add(baseMeal(e.meal));
  }
  const marks = logMarks(notes);
  const full = new Set([...meals].filter(([d, m]) => fullDay(d, m.size, marks)).map(([d]) => d));
  let best = 0;
  for (const d of full) {
    if (full.has(addDays(d, -1))) continue; // not the start of a run
    let n = 0;
    for (let x = d; full.has(x); x = addDays(x, 1)) n++;
    best = Math.max(best, n);
  }
  let now = 0;
  for (let x = full.has(day) ? day : addDays(day, -1); full.has(x); x = addDays(x, -1)) now++;
  return { best, now };
}

// Whether a reward is earned now (or was earlier: `earned`, from the profile).
export const earnedNow = (key, runs, earned = {}) => !!earned[key] || runs.best >= REWARDS[key].run;
