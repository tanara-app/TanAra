import { suite, test, eq, ok, near } from './harness.js';
import { measuredTdee, nextTargets, ENERGY } from '../js/domain/energy.js';
import { addDays } from '../js/lib/dates.js';

const DAY = '2026-03-01';
// n fully logged days ending yesterday, each `kcal` over two meals
const eat = (n, kcal, { every = 1 } = {}) => {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const day = addDays(DAY, -i * every);
    out.push({ day, meal: 'lunch', kcal: kcal * 0.6 }, { day, meal: 'dinner', kcal: kcal * 0.4 });
  }
  return out;
};
// a weigh-in every `step` days over the last 28, losing `perWeek` kg a week from `kg`
const weigh = (kg, perWeek, step = 3) => {
  const out = [];
  for (let i = 28; i >= 1; i -= step) out.push({ day: addDays(DAY, -i), kg: kg - perWeek * (28 - i) / 7 });
  return out;
};

suite('energy', () => {
  test('eaten 2000 a day and losing 0.5 kg a week → the body uses 2550', () => {
    const m = measuredTdee(eat(28, 2000), weigh(100, 0.5), { day: DAY });
    ok(m.ready);
    eq(m.tdee, 2550);             // 2000 + 0.5 × 7700 / 7
    eq(m.intake, 2000);
    near(m.perWeek, -0.5, 1e-9);
    eq(m.days, 28);
  });

  test('steady weight → energy use equals what was eaten', () => {
    eq(measuredTdee(eat(28, 2300), weigh(80, 0), { day: DAY }).tdee, 2300);
  });

  test('gaining weight → the body uses less than was eaten', () => {
    eq(measuredTdee(eat(28, 3000), weigh(80, -0.5), { day: DAY }).tdee, 2450); // 3000 − 550
  });

  test('days with a single meal logged do not count', () => {
    const half = eat(28, 2000).filter(e => e.meal === 'lunch');
    const m = measuredTdee(half, weigh(100, 0.5), { day: DAY });
    eq(m.ready, false);
    eq(m.days, 0);
    eq(m.needDays, ENERGY.MIN_DAYS);
  });

  test('today is never part of the window', () => {
    const today = [{ day: DAY, meal: 'lunch', kcal: 9000 }, { day: DAY, meal: 'dinner', kcal: 9000 }];
    eq(measuredTdee([...eat(28, 2000), ...today], weigh(100, 0.5), { day: DAY }).tdee, 2550);
  });

  test('not ready with too few logged days or weigh-ins, and says what is missing', () => {
    const m = measuredTdee(eat(10, 2000), weigh(100, 0.5), { day: DAY });
    eq([m.ready, m.needDays, m.needWeighs], [false, 4, 0]);
    const w = measuredTdee(eat(28, 2000), weigh(100, 0.5).slice(0, 3), { day: DAY });
    eq([w.ready, w.needWeighs], [false, 3]);
  });

  test('weigh-ins bunched into a few days are not a trend', () => {
    const bunched = [1, 2, 3, 4, 5, 6].map(i => ({ day: addDays(DAY, -i), kg: 100 - i * 0.1 }));
    const m = measuredTdee(eat(28, 2000), bunched, { day: DAY });
    eq([m.ready, m.needSpan], [false, true]);
  });

  test('the first week after starting is skipped, so it takes four weeks to be ready', () => {
    const early = measuredTdee(eat(20, 2000), weigh(100, 0.5), { day: DAY, startDate: addDays(DAY, -20) });
    eq([early.ready, early.needSpan], [false, true]);
    const later = measuredTdee(eat(28, 2000), weigh(100, 0.5), { day: DAY, startDate: addDays(DAY, -28) });
    ok(later.ready);
    eq(later.from, addDays(DAY, -21));
    eq(later.days, 21);
  });

  test('a result far from the formula is held within 25% of it', () => {
    const m = measuredTdee(eat(28, 1000), weigh(100, 0), { day: DAY, formula: 2400 });
    eq([m.tdee, m.clamped], [1800, true]);
    const fine = measuredTdee(eat(28, 2000), weigh(100, 0.5), { day: DAY, formula: 2400 });
    eq([fine.tdee, fine.clamped], [2550, false]);
  });

  test('nextTargets uses the measurement when there is one, the formula otherwise', () => {
    const p = { sex: 'male', age: 35, heightCm: 180, activity: 'sedentary', startDate: addDays(DAY, -60) };
    const a = nextTargets(p, eat(28, 2000), weigh(100, 0.5), 98, DAY);
    eq([a.m.ready, a.t.measured, a.t.tdee, a.t.kcal], [true, true, 2550, 2050]);
    const b = nextTargets(p, [], [], 98, DAY);
    eq([b.m.ready, b.t.measured, b.t.kcal], [false, false, 1800]); // bmr 1935 × 1.2 = 2322 → 2300 − 500
  });
});
