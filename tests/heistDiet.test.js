import { suite, test, eq, ok } from './harness.js';
import { diet, kitOf, fullDays, RUN, BUDGET_BASE } from '../js/domain/heistDiet.js';
import { addDays } from '../js/lib/dates.js';

// two meals a day is a full day (stats.js fullDay), one is not, unless the member said so
const meals = (days, n = 2) => days.flatMap(d => ['breakfast', 'lunch', 'dinner'].slice(0, n).map(meal => ({ day: d, meal })));
const span = (from, n) => Array.from({ length: n }, (_, k) => addDays(from, k));
const T = '2026-11-20';   // a Friday; the week began on Saturday the 14th

suite('heist and the diet', () => {
  test('raids today: one, one more for a full-log day, one more for activity', () => {
    eq(diet({}, T).raids, 1);
    eq(diet({ entries: meals([T]) }, T).raids, 2);
    eq(diet({ entries: meals([T]), activity: [{ day: T, minutes: 20 }] }, T).raids, 3);
    eq(diet({ entries: meals([T], 1), activity: [{ day: T, minutes: 0 }] }, T).raids, 1, 'one meal and no minutes');
  });

  test('a day the member marked «ثبت کامل» counts even with one meal, and «ثبت ناقص» doesn\'t with three', () => {
    const notes = [{ kind: 'logday', key: `logday:${T}`, data: { full: true } }, { kind: 'logday', key: `logday:${addDays(T, -1)}`, data: { full: false } }];
    eq([...fullDays([...meals([T], 1), ...meals([addDays(T, -1)], 3)], notes, addDays(T, -3), T)], [T]);
  });

  test('every seven full days in a row is one unlock; today, not over yet, does not break a run', () => {
    const since = addDays(T, -20);
    eq(diet({ entries: meals(span(since, 7)) }, T, { since }).runs, 1);
    eq(diet({ entries: meals(span(since, 14)) }, T, { since }).runs, 2);
    eq(diet({ entries: meals(span(since, 6)) }, T, { since }).runs, 0);
    const upToYesterday = diet({ entries: meals(span(addDays(T, -5), 5)) }, T, { since });
    eq([upToYesterday.runs, upToYesterday.toNext], [0, RUN - 5]);
    eq(diet({ entries: meals([...span(addDays(T, -10), 4), ...span(addDays(T, -5), 6)]) }, T, { since }).toNext, 1, 'a gap starts the count again');
    eq(diet({ entries: meals(span(addDays(T, -30), 14)) }, T, { since }).runs, 0, 'runs before they began playing don\'t count');
  });

  test('what the unlocks give: decoy, lockpick, goggles, then a third slot', () => {
    eq(kitOf(0), { gadgets: ['emp', 'smoke'], slots: 2 });
    eq(kitOf(2), { gadgets: ['emp', 'smoke', 'decoy', 'lockpick'], slots: 2 });
    eq(kitOf(4), { gadgets: ['emp', 'smoke', 'decoy', 'lockpick', 'goggles'], slots: 3 });
    eq(kitOf(9), kitOf(4));
  });

  test('a week of the season at 100 in «خانواده» (five days logged, the activity goal met) adds ten to the defence budget', () => {
    const week = span('2026-11-14', 5), active = [{ day: '2026-11-15', minutes: 160 }];
    const d = diet({ entries: meals(week), activity: active, profile: { phase: 'loss' } }, T, { season: '2026-11-10' });
    eq([d.weeksHit, d.budget], [1, BUDGET_BASE + 10]);
    eq(diet({ entries: meals(week), activity: [{ day: '2026-11-15', minutes: 60 }], profile: { phase: 'loss' } }, T, { season: '2026-11-10' }).budget, BUDGET_BASE, 'not enough activity');
  });

  test('coins: the full days of the last week since they began playing', () => {
    const since = addDays(T, -2);
    eq(diet({ entries: meals(span(addDays(T, -10), 11)) }, T, { since }).credit, span(since, 3));
  });

  test('never weight, waist or calories', () => {
    const a = diet({ entries: meals([T]) }, T), b = diet({ entries: meals([T]).map(e => ({ ...e, kcal: 9000 })), weights: [{ day: T, kg: 200 }] }, T);
    eq(a, b);
  });
});
