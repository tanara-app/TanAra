/*
  «سرقت بزرگ», phase 5 (briefs/heist-5.md): what a member's diet habits give them in the game. Pure, shared by the app and the `heist`
  Edge Function, which is the one that decides (from the member's own entries, notes and activity on the server).

  Habits only, never weight, waist or calories (the owner's decision on 2026-11-17, the same rule as «خانواده» on «پیشرفت»):
    - raids on members today: 1, +1 if today is a full-log day (stats.js fullDay), +1 if today has activity logged
    - every full-log day: FULL_DAY_COINS coins, once (the last 7 days are looked at, so filling in yesterday still counts)
    - every 7 full days in a row: one more gadget for good (decoy, lockpick, goggles), then a third gadget slot
    - every week of the season whose «خانواده» score is 100 (5 days logged and the week's activity goal): +10 to the defence budget
    - practice vaults pay only on a full-log day
*/
import { addDays, weekStart } from '../lib/dates.js';
import { baseMeal } from './meals.js';
import { logMarks, fullDay } from './stats.js';
import { weekRow } from './family.js';

export const FULL_DAY_COINS = 100;
export const RUN = 7;                                    // full days in a row for one unlock
export const BASE_GADGETS = ['emp', 'smoke'];
export const UNLOCKS = ['decoy', 'lockpick', 'goggles', 'slot3'];
export const BUDGET_BASE = 100, WEEK_BUDGET = 10, WEEKS_MAX = 4;
export const SEASON_DAYS = 28, DIAMOND = 5000;

// The full-log days among [from, to].
export function fullDays(entries, notes, from, to) {
  const meals = new Map();
  for (const e of entries || []) {
    if (e.day < from || e.day > to) continue;
    (meals.get(e.day) || meals.set(e.day, new Set()).get(e.day)).add(baseMeal(e.meal));
  }
  const marks = logMarks(notes);
  const out = new Set();
  for (const [d, m] of meals) if (fullDay(d, m.size, marks)) out.add(d);
  return out;
}

// The gadgets and slots `unlocks` earned runs give.
export function kitOf(unlocks = 0) {
  const n = Math.max(0, Math.min(UNLOCKS.length, unlocks | 0));
  return { gadgets: [...BASE_GADGETS, ...UNLOCKS.slice(0, n).filter(u => u !== 'slot3')], slots: n >= UNLOCKS.length ? 3 : 2 };
}

/*
  Where a member stands today. `since` is the day they began playing (runs count from then); `season` the day the season began.
  { full, moved, raids, runs, toNext, weeksHit, budget, credit }: `runs` the 7-day runs completed since `since`; `toNext` the full days
  still needed for the next one (today, not over yet, doesn't break a run); `credit` the full days of the last week that earn coins.
*/
export function diet({ entries = [], notes = [], activity = [], profile = null }, today, { since = today, season = today } = {}) {
  const from = since < addDays(today, -400) ? addDays(today, -400) : since;
  const full = fullDays(entries, notes, from, today);
  const isFull = full.has(today);
  const moved = (activity || []).some(a => a.day === today && Number(a.minutes) > 0);
  let runs = 0, c = 0;
  for (let d = from; d <= today; d = addDays(d, 1)) {
    if (full.has(d)) { if (++c === RUN) { runs++; c = 0; } }
    else if (d !== today) c = 0;
  }
  let weeksHit = 0;
  for (let ws = weekStart(season); ws <= today; ws = addDays(ws, 7)) {
    const row = weekRow({ entries, activity, notes, profile }, ws, today < addDays(ws, 6) ? today : addDays(ws, 6));
    if (row.score >= 100) weeksHit++;
  }
  const lastWeek = addDays(today, -6);
  const credit = [...full].filter(d => d >= lastWeek && d >= since).sort();
  return {
    full: isFull, moved, raids: 1 + (isFull ? 1 : 0) + (moved ? 1 : 0),
    runs, toNext: RUN - c, weeksHit,
    budget: BUDGET_BASE + WEEK_BUDGET * Math.min(WEEKS_MAX, weeksHit),
    credit,
  };
}
