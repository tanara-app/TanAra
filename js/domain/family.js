/*
  «خانواده» on «پیشرفت»: a weekly score for each member, made only of habits that are in their
  own hands, each measured against that member's own goal — never weight, calories or the
  scale, so a body that loses more slowly (a condition, age, a teenager) is never behind.

  - log:  days with something logged, out of LOG_GOAL a week
  - move: minutes of activity, out of the member's own weekly goal (ACTIVITY_GOAL by phase)
  - plan: occasions eaten as planned, when they follow a plan (left out with a possible
          eating-disorder history: no counting of how they eat)

  The score is the average of the parts that apply, as a percentage, each part capped at 100.
  Only these numbers leave the device (table family_week); the team goal adds up everyone's
  minutes against everyone's goals.
*/
import { addDays } from '../lib/dates.js';
import { daysLoggedInWeek, activityWeek, ACTIVITY_GOAL } from './stats.js';
import { phaseOn } from './targets.js';
import { adherence } from './plan.js';

export const LOG_GOAL = 5;

const edCare = p => ['yes', 'unsure'].includes(p?.edHistory);

// The row this member sends for the week starting `ws` (counted up to `to`, today for the current week).
export function weekRow({ entries = [], activity = [], notes = [], profile: p }, ws, to = addDays(ws, 6)) {
  const end = to < addDays(ws, 6) ? to : addDays(ws, 6);
  const row = {
    week: ws,
    log_days: Math.min(7, daysLoggedInWeek(entries.filter(e => e.day <= end), ws)),
    move_min: Math.round(activityWeek(activity.filter(a => a.day <= end), ws)),
    move_goal: ACTIVITY_GOAL[phaseOn(p, end)] || 150,
    plan_done: 0,
    plan_of: 0,
  };
  if (p?.mode === 'plan' && !edCare(p)) {
    const a = adherence(notes, entries, ws, end);
    row.plan_done = a.done;
    row.plan_of = a.of;
  }
  row.score = score(row);
  return row;
}

// Each part 0–1, or null when it doesn't apply.
export function parts(r) {
  return {
    log: Math.min(1, (r.log_days || 0) / LOG_GOAL),
    move: r.move_goal > 0 ? Math.min(1, (r.move_min || 0) / r.move_goal) : null,
    plan: r.plan_of > 0 ? Math.min(1, r.plan_done / r.plan_of) : null,
  };
}

export function score(r) {
  const v = Object.values(parts(r)).filter(x => x !== null);
  return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 100) : 0;
}

// The family's minutes together against the sum of everyone's own goals.
export function teamGoal(rows) {
  const min = rows.reduce((s, r) => s + (r.move_min || 0), 0);
  const goal = rows.reduce((s, r) => s + (r.move_goal || 0), 0);
  return { min, goal, done: goal > 0 && min >= goal, pct: goal > 0 ? Math.min(1, min / goal) : 0 };
}

// Rows of one week, best score first (ties: more minutes, then name).
export function board(rows, week) {
  return rows.filter(r => r.week === week)
    .sort((a, b) => b.score - a.score || b.move_min - a.move_min || String(a.name).localeCompare(String(b.name), 'fa'));
}
