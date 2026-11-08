import { suite, test, eq } from './harness.js';
import { weekRow, score, parts, board, LOG_GOAL } from '../js/domain/family.js';

const ws = '2026-11-07'; // a Saturday
const e = days => days.map(day => ({ day, meal: 'lunch', kcal: 300 }));

suite('family', () => {
  test('logging counts days up to the goal of five, capped at 100%', () => {
    eq(score({ log_days: LOG_GOAL, move_goal: 0 }), 100);
    eq(score({ log_days: 7, move_goal: 0 }), 100);
    eq(parts({ log_days: 2, move_goal: 150 }).log, 0.4);
  });

  test('the score averages only the parts that apply', () => {
    // logging 100%, moving 50%, no plan → 75
    eq(score({ log_days: 5, move_min: 75, move_goal: 150, plan_of: 0 }), 75);
    // with a plan at 50% too → (1 + 0.5 + 0.5) / 3
    eq(score({ log_days: 5, move_min: 75, move_goal: 150, plan_done: 5, plan_of: 10 }), 67);
    // more minutes than the goal don't make up for other parts
    eq(score({ log_days: 0, move_min: 600, move_goal: 150 }), 50);
  });

  test('a week row counts only that week and up to the given day', () => {
    const p = { phase: 'loss' };
    const entries = e(['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-08', '2026-11-10']);
    const activity = [{ day: '2026-11-07', minutes: 30 }, { day: '2026-11-09', minutes: 20 }, { day: '2026-11-14', minutes: 60 }];
    const r = weekRow({ entries, activity, profile: p }, ws, '2026-11-09');
    eq(r.log_days, 2);
    eq(r.move_min, 50);
    eq(r.move_goal, 150);
    const whole = weekRow({ entries, activity, profile: p }, ws);
    eq(whole.log_days, 3);
    eq(whole.move_min, 50);
  });

  test('maintenance has the higher activity goal', () => {
    eq(weekRow({ profile: { phase: 'maintain' } }, ws).move_goal, 250);
  });

  test('no plan part with a possible eating-disorder history, or without a plan', () => {
    eq(weekRow({ profile: { mode: 'plan', edHistory: 'yes' } }, ws).plan_of, 0);
    eq(weekRow({ profile: { mode: 'count' } }, ws).plan_of, 0);
  });

  test('the board is one week, best score first', () => {
    const rows = [
      { name: 'ب', week: ws, score: 60, move_min: 10 },
      { name: 'الف', week: ws, score: 80, move_min: 0 },
      { name: 'پ', week: '2026-10-31', score: 100, move_min: 0 },
      { name: 'ت', week: ws, score: 60, move_min: 40 },
    ];
    eq(board(rows, ws).map(r => r.name), ['الف', 'ت', 'ب']);
  });
});
