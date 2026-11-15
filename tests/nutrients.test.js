import { suite, test, eq, ok } from './harness.js';
import { nutrOf, nutrTotals, carbLimit, countsCarbs, countsSalt } from '../js/domain/nutrients.js';
import { tagSig, untagged } from '../js/domain/health.js';
import { fitMeal } from '../js/domain/portion.js';
import { SEED_FOODS } from '../js/data/seedFoods.js';
import { NUTR } from '../js/data/nutrients.js';

const seedNames = new Set(SEED_FOODS.map(f => f.name));
const seed = n => SEED_FOODS.find(f => f.name === n);
const own = { id: 'k1', name: 'کوفته تبریزی', unit: 'عدد', kcal: 400, protein: 25 };

suite('nutrients', () => {
  test('every starter food has its carbohydrate and sodium', () => {
    eq(SEED_FOODS.filter(f => !NUTR[f.name]).map(f => f.name), []);
  });

  test('a starter food from the table, an own food from the saved answer while it still matches', () => {
    eq(nutrOf(seed('نان سنگک'), {}, seedNames), { c: 22, na: 200 });
    const saved = { k1: { s: tagSig(own), t: [], c: 30, na: 900 } };
    eq(nutrOf(own, saved, seedNames), { c: 30, na: 900 });
    eq(nutrOf({ ...own, kcal: 450 }, saved, seedNames), null);
    eq(nutrOf(own, { k1: { s: tagSig(own), t: [] } }, seedNames), null);
  });

  test('own foods tagged before carbohydrate was asked are asked again, once', () => {
    const tagsOnly = { k1: { s: tagSig(own), t: [] } };
    eq(untagged([own], tagsOnly, seedNames, () => null).length, 0);
    eq(untagged([own], tagsOnly, seedNames, () => null, true).length, 1);
    eq(untagged([own], { k1: { ...tagsOnly.k1, c: null, na: null } }, seedNames, () => null, true).length, 0);
  });

  test('entries count by their calories, in units or grams; unknown ones are counted apart', () => {
    const bread = { ...seed('نان سنگک'), id: 'b' };
    const es = [
      { food_id: 'b', qty: 2, unit: 'کف‌دست', kcal: 220 },
      { food_id: 'b', qty: 20, unit: 'گرم', kcal: 55 },
      { name: 'غذای عکس', kcal: 300 },
    ];
    const n = nutrTotals(es, e => (e.food_id === 'b' ? bread : null), f => nutrOf(f, {}, seedNames));
    eq([n.carbs, n.sodium, n.salt, n.unknown], [55, 500, 1.3, 1]);
  });

  test('which conditions count what; the limit is 40% of the calories', () => {
    eq([countsCarbs(['prediabetes']), countsCarbs(['bp']), countsSalt(['kidney']), countsSalt(['diabetes'])], [true, false, true, false]);
    eq(carbLimit(1800), 180);
  });

  test('a carbohydrate limit takes rice off before the stew, and the calories stay with the stew', () => {
    const rice = seed('برنج سفید (کته یا چلو)'), stew = seed('قیمه (بدون روغن رو)');
    const carbsOf = f => NUTR[f.name][0];
    const free = fitMeal([rice, stew], 600, {});
    const cap = fitMeal([rice, stew], 600, {}, { carbMax: 60, carbsOf });
    ok(free.carbs == null || free.carbOver === 0);
    ok(cap.carbs <= 60.5, `${cap.carbs}`);
    ok(cap.items[0].qty < free.items[0].qty, `${cap.items[0].qty} < ${free.items[0].qty}`);
    ok(cap.items[1].qty >= free.items[1].qty, `${cap.items[1].qty} >= ${free.items[1].qty}`);
  });

  test('jam goes before bread, and ارده does not grow on less bread', () => {
    const arde = fitMeal([seed('ارده'), seed('نان سنگک'), seed('مربا')], 384, {}, { carbMax: 38, carbsOf: f => NUTR[f.name][0] });
    eq(arde.items.map(i => i.qty), [1.5, 1, 0.5]);
    const bread = seed('نان بربری'), jam = seed('مربا'), cheese = seed('پنیر سفید');
    const carbsOf = f => NUTR[f.name][0];
    const free = fitMeal([bread, cheese, jam], 450, {});
    const cap = fitMeal([bread, cheese, jam], 450, {}, { carbMax: 45, carbsOf });
    eq([cap.items[0].qty, cap.items[2].qty], [1.5, 0.5]); // half a spoon of jam, a palm and a half of bread
    ok(cap.items[1].qty > free.items[1].qty, 'the cheese takes the calories');
    ok(cap.carbs <= 45.5 || cap.carbOver > 0, `${cap.carbs}`);
  });
});
