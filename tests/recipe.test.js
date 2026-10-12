import { suite, test, eq } from './harness.js';
import { per100, recipeItems, recipeFrom, recipeTotals, perUnit, recipeFood } from '../js/domain/recipe.js';

const FOODS = [
  { id: 'bread', name: 'نان سنگک', unit: 'کف‌دست', grams: 40, kcal: 110, protein: 4 },
  { id: 'cheese', name: 'پنیر', unit: 'گرم', grams: 1, kcal: 2.5, protein: 0.2 },
  { id: 'egg', name: 'تخم‌مرغ', unit: 'عدد', grams: null, kcal: 75, protein: 6 },
];
const it = o => ({ name: 'x', grams: 100, kcal100: 100, protein100: 5, food_id: '', ...o });
const POT = {
  name: ' قورمه‌سبزی ', unit: 'کفگیر', servings: 6, cooked_grams: 1500, category: 'stew', is_veg: false, note: 'n',
  steps: [' سرخ کن ', '', 'بپز'],
  items: [it({ name: 'گوشت خام', grams: 400, kcal100: 200, protein100: 20 }), it({ name: 'روغن', grams: 50, kcal100: 884, protein100: 0 })],
};

suite('recipe', () => {
  test('per 100 g of a bank food comes from the weight of its unit', () => {
    eq(per100(FOODS[0]), { kcal100: 275, protein100: 10 });
    eq(per100(FOODS[1]), { kcal100: 250, protein100: 20 });
    eq(per100(FOODS[2]), null);
  });

  test('a bank ingredient takes its numbers from the bank, whatever the model said', () => {
    eq(recipeItems([it({ name: 'سنگک', food_id: 'bread', grams: 80, kcal100: 999, protein100: 99 })], FOODS),
      [{ name: 'نان سنگک', grams: 80, kcal100: 275, protein100: 10, food_id: 'bread' }]);
  });

  test('when the bank cannot say (no weight, unknown id) the given numbers stand, unlinked', () => {
    eq(recipeItems([it({ name: 'تخم‌مرغ', food_id: 'egg', grams: 50, kcal100: 143, protein100: 12.6 })], FOODS)[0], { name: 'تخم‌مرغ', grams: 50, kcal100: 143, protein100: 12.6, food_id: null });
    eq(recipeItems([it({ food_id: 'ghost' })], FOODS)[0].food_id, null);
  });

  test('nonsense ingredients are dropped', () => {
    eq(recipeItems([it({ name: ' ' }), it({ grams: 0 }), it({ grams: 99999 }), it({ kcal100: 1200 }), it({ kcal100: -1 }), it({ protein100: 150 }), it({})], FOODS).length, 1);
    eq(recipeItems(null), []);
  });

  test('the pot is the sum of its ingredients, and one unit is its share', () => {
    const r = recipeFrom(POT, FOODS);
    eq(recipeTotals(r), { kcal: 1242, protein: 80, grams: 450 });
    eq(perUnit(r), { unit: 'کفگیر', grams: 250, kcal: 207, protein: 13.3 });
    eq(recipeFood(r), { name: 'قورمه‌سبزی', unit: 'کفگیر', grams: 250, kcal: 207, protein: 13.3, category: 'stew', is_veg: false });
  });

  test('calories per gram of the cooked dish do not depend on how many units it is cut into', () => {
    const a = perUnit({ ...recipeFrom(POT), servings: 6 }), b = perUnit({ ...recipeFrom(POT), servings: 10 });
    eq(Math.round(a.kcal / a.grams * 100), Math.round(b.kcal / b.grams * 100));
  });

  test('without a cooked weight a unit has no weight', () => {
    eq(perUnit(recipeFrom({ ...POT, cooked_grams: 0 })).grams, null);
  });

  test('a recipe is cleaned up, with safe defaults', () => {
    const r = recipeFrom({ ...POT, unit: 'گرم', servings: 0, category: 'nope' });
    eq([r.name, r.steps, r.unit, r.servings, r.cookedGrams, r.category, r.minutes], ['قورمه‌سبزی', ['سرخ کن', 'بپز'], 'پرس', 1, 1500, 'stew', null]);
    eq(recipeFrom({ ...POT, minutes: 20.4 }).minutes, 20);
    eq(recipeFrom({ ...POT, items: [] }), null);
    eq(recipeFrom({ ...POT, name: '' }), null);
    eq(recipeFrom(null), null);
  });
});
