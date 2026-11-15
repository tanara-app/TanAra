/*
  «جوایز»: things a member earns by keeping a habit. Pure functions.

  Each reward is one entry of REWARDS: what it is (`kind`, `name`, and `about`, the few words shown
  under its name), and the goal that earns it (`goal`). Adding a reward = one more entry here (and,
  for a new kind of goal, one more case in `progress`); the «جوایز» page lists them all the same way.
  Earned once, a reward stays earned (profile.data.rewards: { key: day earned }).

  Kinds: 'finish' — a look laid over any colour theme (css/app.css [data-finish]), worn from «ظاهر».
  Goals: 'fullRun' — `of` full days in a row (stats.js fullDay: what they said about the day, else two
  meals or more).
*/
import { addDays } from '../lib/dates.js';
import { baseMeal } from './meals.js';
import { logMarks, fullDay } from './stats.js';

export const REWARDS = [
  { key: 'parniyan', kind: 'finish', name: 'پرنیان', about: 'پوسته‌ی ظاهر اپ', goal: { type: 'fullRun', of: 21 } },
];
export const rewardOf = key => REWARDS.find(r => r.key === key) || null;

// the goal in words, under the reward's name
export function goalText(r, fa = String) {
  if (r.goal.type === 'fullRun') return `${fa(r.goal.of)} روز پشت‌سرهم ثبت کامل`;
  return '';
}

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

/*
  Where a member stands with each reward: [{ reward, earned, now, of }]. `earned` (from the profile)
  keeps a reward earned; otherwise it is earned once its goal was ever met. `now`/`of`: the progress
  shown while it is still ahead.
*/
export function progress({ entries = [], notes = [], earned = {} }, day) {
  const runs = fullRuns(entries, notes, day);
  return REWARDS.map(r => {
    const of = r.goal.of;
    const now = r.goal.type === 'fullRun' ? runs.now : 0;
    const met = r.goal.type === 'fullRun' ? runs.best >= of : false;
    return { reward: r, earned: !!earned[r.key] || met, now: Math.min(now, of), of };
  });
}

// the finishes they may wear (earned ones)
export const earnedFinishes = earned => REWARDS.filter(r => r.kind === 'finish' && earned?.[r.key]);
