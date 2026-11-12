import { suite, test, eq } from './harness.js';
import { baseMeal, mealLabel, meal5, meal5ForNow, MEALS5 } from '../js/domain/meals.js';
import { mealStanding, MEAL_SHARES5, mealShares5From } from '../js/domain/portion.js';
import { frequentFoods } from '../js/domain/stats.js';
import { slotExtras } from '../js/domain/plan.js';

// a local time on a day, as an ISO string (meal5 reads the hour in local time)
const at = (day, h) => new Date(`${day}T${String(h).padStart(2, '0')}:30:00`).toISOString();

suite('meals', () => {
  test('five meals in eating order, the afternoon snack named apart', () => {
    eq(Object.keys(MEALS5), ['breakfast', 'snack', 'lunch', 'snack2', 'dinner']);
    eq(mealLabel('snack2'), 'میان‌وعده‌ی عصر');
    eq(mealLabel('snack'), 'میان‌وعده');
    eq(baseMeal('snack2'), 'snack');
    eq(baseMeal('lunch'), 'lunch');
  });

  test('an old snack goes by the hour it was logged; a new one by its meal', () => {
    const old = '2026-11-10', from = '2026-11-13';
    eq(meal5({ day: old, meal: 'snack', created_at: at(old, 10) }, from), 'snack');
    eq(meal5({ day: old, meal: 'snack', created_at: at(old, 17) }, from), 'snack2');
    eq(meal5({ day: from, meal: 'snack', created_at: at(from, 17) }, from), 'snack', 'once they have five meals, «snack» is the morning one');
    eq(meal5({ day: from, meal: 'snack2', created_at: at(from, 9) }, from), 'snack2');
    eq(meal5({ day: old, meal: 'lunch', created_at: at(old, 17) }, from), 'lunch');
  });

  test('the snack for now splits at three in the afternoon', () => {
    eq(meal5ForNow('snack', 10), 'snack');
    eq(meal5ForNow('snack', 17), 'snack2');
    eq(meal5ForNow('dinner', 20), 'dinner');
  });

  test('each snack has its own share of the day', () => {
    const day = '2026-11-14';
    const es = [{ day, meal: 'snack', kcal: 150 }];
    eq(mealStanding(es, day, 'snack', 2000, MEAL_SHARES5), { eaten: 150, share: 200, over: false });
    eq(mealStanding(es, day, 'snack2', 2000, MEAL_SHARES5).eaten, 0);
    eq(mealShares5From({ breakfast: 0.3, snack1: 0.08, lunch: 0.3, snack2: 0.07, dinner: 0.25 }), { breakfast: 0.3, snack: 0.08, lunch: 0.3, snack2: 0.07, dinner: 0.25 });
  });

  test('views with four meals count the afternoon snack as the snack', () => {
    const food = { id: 'f1', name: 'سیب', unit: 'عدد' };
    const es = [{ day: '2026-11-14', meal: 'snack2', food_id: 'f1', name: 'سیب', unit: 'عدد', qty: 1, created_at: '1' }];
    eq(frequentFoods(es, [food], '2026-11-14', 'snack').map(x => x.food.id), ['f1']);
  });

  test('the diet plan puts an afternoon snack in the afternoon slot', () => {
    const day = '2026-11-14';
    const es = [{ id: 'a', day, meal: 'snack2', kcal: 100, created_at: at(day, 9) }];
    const x = slotExtras(es, {}, {}, day);
    eq([x.snack1.length, x.snack2.length], [0, 1]);
  });
});
