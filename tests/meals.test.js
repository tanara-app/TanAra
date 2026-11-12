import { suite, test, eq } from './harness.js';
import { baseMeal, mealLabel, meal5, meal5ForNow, MEALS5 } from '../js/domain/meals.js';
import { mealStanding, MEAL_SHARES5, mealShares5From } from '../js/domain/portion.js';
import { frequentFoods } from '../js/domain/stats.js';
import { slotExtras } from '../js/domain/plan.js';

// a local time on a day, as an ISO string (meal5 reads the hour in local time)
const at = (day, h) => new Date(`${day}T${String(h).padStart(2, '0')}:30:00`).toISOString();

suite('meals', () => {
  test('five meals in eating order, each snack with its own name', () => {
    eq(Object.keys(MEALS5), ['breakfast', 'snack1', 'lunch', 'snack2', 'dinner']);
    eq([mealLabel('snack1'), mealLabel('snack2'), mealLabel('snack')], ['میان‌وعده‌ی صبح', 'میان‌وعده‌ی عصر', 'میان‌وعده']);
    eq(['snack1', 'snack2', 'snack', 'lunch'].map(baseMeal), ['snack', 'snack', 'snack', 'lunch']);
  });

  test('a plain snack goes by the hour it was logged; a named one stays', () => {
    const day = '2026-11-10';
    eq(meal5({ day, meal: 'snack', created_at: at(day, 10) }), 'snack1');
    eq(meal5({ day, meal: 'snack', created_at: at(day, 17) }), 'snack2');
    eq(meal5({ day, meal: 'snack1', created_at: at(day, 21) }), 'snack1', 'the morning snack logged at night');
    eq(meal5({ day, meal: 'snack2', created_at: at(day, 9) }), 'snack2');
    eq(meal5({ day, meal: 'lunch', created_at: at(day, 17) }), 'lunch');
  });

  test('the snack for now splits at three in the afternoon', () => {
    eq(meal5ForNow('snack', 10), 'snack1');
    eq(meal5ForNow('snack', 17), 'snack2');
    eq(meal5ForNow('dinner', 20), 'dinner');
  });

  test('each snack has its own share of the day', () => {
    const day = '2026-11-14';
    const es = [{ day, meal: 'snack1', kcal: 150 }];
    eq(mealStanding(es, day, 'snack1', 2000, MEAL_SHARES5), { eaten: 150, share: 200, over: false });
    eq(mealStanding(es, day, 'snack2', 2000, MEAL_SHARES5).eaten, 0);
    eq(mealShares5From({ breakfast: 0.3, snack1: 0.08, lunch: 0.3, snack2: 0.07, dinner: 0.25 }), { breakfast: 0.3, snack1: 0.08, lunch: 0.3, snack2: 0.07, dinner: 0.25 });
  });

  test('views with four meals count both snacks as the snack', () => {
    const food = { id: 'f1', name: 'سیب', unit: 'عدد' };
    const es = [{ day: '2026-11-14', meal: 'snack2', food_id: 'f1', name: 'سیب', unit: 'عدد', qty: 1, created_at: '1' }];
    eq(frequentFoods(es, [food], '2026-11-14', 'snack').map(x => x.food.id), ['f1']);
    eq(frequentFoods(es, [food], '2026-11-14', 'snack1').map(x => x.food.id), ['f1']);
  });

  test('the diet plan puts a named snack in its own slot', () => {
    const day = '2026-11-14';
    const es = [{ id: 'a', day, meal: 'snack2', kcal: 100, created_at: at(day, 9) }, { id: 'b', day, meal: 'snack1', kcal: 50, created_at: at(day, 20) }];
    const x = slotExtras(es, {}, {}, day);
    eq([x.snack1.map(e => e.id), x.snack2.map(e => e.id)], [['b'], ['a']]);
  });
});
