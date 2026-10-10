import { suite, test, eq, ok } from './harness.js';
import { rapidLoss, underEating } from '../js/domain/safety.js';
import { addDays } from '../js/lib/dates.js';

const START = '2026-01-03'; // a Saturday
// three weigh-ins in each week from the start, following `kgs` (one figure per week)
const weeks = kgs => kgs.flatMap((kg, i) => [0, 2, 4].map(d => ({ day: addDays(START, i * 7 + d), kg })));
const day = (d, meals, kcalEach) => meals.map(meal => ({ day: d, meal, kcal: kcalEach }));

suite('safety', () => {
  test('rapid loss: more than 1.5 kg a week, three weeks in a row, after the first three weeks', () => {
    const r = rapidLoss(weeks([110, 108, 106, 104, 102, 100]), START, addDays(START, 39));
    ok(r);
    eq(r.drops, [2, 2, 2]);
  });

  test('fast early loss (mostly water) does not trigger it', () => {
    eq(rapidLoss(weeks([110, 107, 104, 101, 100.5, 100]), START, addDays(START, 39)), null);
  });

  test('a healthy pace never triggers it', () => {
    eq(rapidLoss(weeks([110, 109.2, 108.4, 107.6, 106.8, 106, 105.2]), START, addDays(START, 46)), null);
  });

  test('exactly 1.5 kg a week is not "more than"', () => {
    eq(rapidLoss(weeks([110, 108.5, 107, 105.5, 104, 102.5]), START, addDays(START, 39)), null);
  });

  test('a week without a weigh-in breaks the chain', () => {
    const w = weeks([110, 108, 106, 104, 102, 100]).filter(x => x.day < addDays(START, 28) || x.day >= addDays(START, 35));
    eq(rapidLoss(w, START, addDays(START, 39)), null);
  });

  test('the running week only counts once it has three weigh-ins', () => {
    const w = [...weeks([110, 108, 106, 104, 102]), { day: addDays(START, 35), kg: 90 }];
    // the single low reading in week 6 is ignored; weeks 3–5 still show three 2 kg drops
    eq(rapidLoss(w, START, addDays(START, 35)), null); // i = 4 < 5: not enough weeks past the exempt ones
  });

  test('under-eating: three full days in a row under the floor', () => {
    const t = '2026-02-10';
    const low = [1, 2, 3].flatMap(n => day(addDays(t, -n), ['lunch', 'dinner'], 500));
    eq(underEating(low, 1500, t).days, [addDays(t, -1), addDays(t, -2), addDays(t, -3)]);
  });

  test('a day with one meal logged is not a full day, so no alarm', () => {
    const t = '2026-02-10';
    const e = [...day(addDays(t, -1), ['lunch', 'dinner'], 500), ...day(addDays(t, -2), ['lunch'], 300), ...day(addDays(t, -3), ['lunch', 'dinner'], 500)];
    eq(underEating(e, 1500, t), null);
  });

  test('one day at the floor clears it; today itself is not judged', () => {
    const t = '2026-02-10';
    const e = [...day(addDays(t, -1), ['lunch', 'dinner'], 750), ...day(addDays(t, -2), ['lunch', 'dinner'], 500), ...day(addDays(t, -3), ['lunch', 'dinner'], 500), ...day(t, ['lunch', 'dinner'], 100)];
    eq(underEating(e, 1500, t), null);
  });
});
