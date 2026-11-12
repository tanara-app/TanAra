import { suite, test, eq, ok } from './harness.js';
import { roleOf, fitMeal, mealBudget, mealStanding, usualCombos, mealPacks, packKey, MEAL_SHARES } from '../js/domain/portion.js';
import { SEED_FOODS } from '../js/data/seedFoods.js';

const seed = name => {
  const f = SEED_FOODS.find(x => x.name === name);
  if (!f) throw new Error(`no seed food ${name}`);
  return { ...f, id: name };
};
const BREAD = seed('نان سنگک'), CHEESE = seed('پنیر سفید'), MELON = seed('هندوانه (خردشده)');
const kcalOf = (foods, r) => r.items.reduce((t, it, i) => t + it.qty * foods[i].kcal, 0);
const grams = (f, it) => it.qty * f.grams;

suite('portion', () => {
  test('roles of starter foods', () => {
    const roles = Object.fromEntries(['نان سنگک', 'پنیر سفید', 'هندوانه (خردشده)', 'تخم‌مرغ آب‌پز', 'کره', 'مربا', 'گردو (مغز کامل)',
      'قیمه (بدون روغن رو)', 'برنج سفید (کته یا چلو)', 'لوبیاپلو', 'سس مایونز', 'سالاد شیرازی (بدون روغن)', 'شیر کم‌چرب', 'روغن خورش / غذا', 'دوغ', 'جوجه‌کباب']
      .map(n => [n, roleOf(seed(n))]));
    eq(roles, {
      'نان سنگک': 'starch', 'پنیر سفید': 'rich', 'هندوانه (خردشده)': 'fruit', 'تخم‌مرغ آب‌پز': 'protein', 'کره': 'fat', 'مربا': 'fat',
      'گردو (مغز کامل)': 'fat', 'قیمه (بدون روغن رو)': 'main', 'برنج سفید (کته یا چلو)': 'starch', 'لوبیاپلو': 'main', 'سس مایونز': 'fat',
      'سالاد شیرازی (بدون روغن)': 'veg', 'شیر کم‌چرب': 'dairy', 'روغن خورش / غذا': 'fat', 'دوغ': 'drink', 'جوجه‌کباب': 'protein',
    });
  });

  test('a user food by weight gets a role from its numbers', () => {
    eq(roleOf({ name: 'پنیر کم چرب', category: 'other', unit: 'گرم', grams: 1, kcal: 2.6, protein: 0.2 }), 'rich');
    eq(roleOf({ name: 'پرو ماست', category: 'other', unit: 'گرم', grams: 1, kcal: 0.6, protein: 0.1 }), 'dairy');
  });

  test('bread, cheese and watermelon: less cheese than watermelon, about the budget', () => {
    const foods = [BREAD, CHEESE, MELON];
    const r = fitMeal(foods, 450);
    const [b, c, m] = r.items;
    ok(grams(CHEESE, c) <= 60, `cheese ${grams(CHEESE, c)} g`);
    ok(grams(MELON, m) > 2 * grams(CHEESE, c), `melon ${grams(MELON, m)} g vs cheese ${grams(CHEESE, c)} g`);
    ok(b.kcal > c.kcal, 'bread carries more of the meal than cheese');
    ok(Math.abs(kcalOf(foods, r) - 450) <= 60, `total ${kcalOf(foods, r)}`);
    eq(r.over, 0);
  });

  test('vegetables grow and spreads stay small in a big meal', () => {
    const foods = [seed('برنج سفید (کته یا چلو)'), seed('قیمه (بدون روغن رو)'), seed('سالاد شیرازی (بدون روغن)'), seed('کره')];
    const r = fitMeal(foods, 900);
    ok(r.items[3].qty * foods[3].grams <= 30, 'butter at most 30 g');
    ok(r.items[1].kcal >= r.items[0].kcal, 'the stew is the main part');
  });

  test('amounts are in measurable steps and inside the limits', () => {
    const foods = [BREAD, CHEESE, MELON, seed('گردو (مغز کامل)')];
    const r = fitMeal(foods, 500);
    r.items.forEach((it, i) => ok(Math.abs(it.qty / it.step - Math.round(it.qty / it.step)) < 1e-9, `${foods[i].name} ${it.qty}`));
    eq(Number.isInteger(r.items[3].qty), true, 'walnuts are whole');
  });

  test('a locked amount stays, the others share what is left', () => {
    const foods = [BREAD, CHEESE, MELON];
    const free = fitMeal(foods, 450);
    const r = fitMeal(foods, 450, { 0: 3 });
    eq(r.items[0].qty, 3);
    eq(r.items[0].locked, true);
    ok(r.items[1].qty <= free.items[1].qty && r.items[2].qty <= free.items[2].qty, 'the rest got less');
  });

  test('a meal that does not fit even at the least: says by how much and what to drop', () => {
    const foods = [seed('قیمه (بدون روغن رو)'), seed('شیرینی تر (خامه‌ای)')];
    const r = fitMeal(foods, 200);
    ok(r.over > 0);
    eq(r.drop, 1);
    // nothing to suggest when going without any one of them still does not fit
    eq(fitMeal(foods, 0).drop, null);
    // and never the one they set by hand
    eq(fitMeal(foods, 200, { 1: 1 }).drop === 1, false);
  });

  test('a food with no calories and a drink are not shared out', () => {
    const tea = { id: 'water', name: 'آب', category: 'drink', unit: 'لیوان', grams: 240, kcal: 0, protein: 0 }, doogh = seed('دوغ');
    const r = fitMeal([BREAD, doogh, tea], 300);
    eq([r.items[1].qty, r.items[2].qty, r.items[2].free], [1, 1, true]);
    ok(Math.abs(kcalOf([BREAD, doogh, tea], r) - 300) <= 60);
  });

  test('every food at its most: the calories left are reported', () => {
    const r = fitMeal([seed('خیار')], 600);
    ok(r.spare > 0);
    eq(r.items[0].atMax, true);
  });

  test('meal budget: what is left of the day, shared by the meals not eaten yet', () => {
    const day = '2026-11-09';
    eq(mealBudget([], day, 'breakfast', 2000), 500);
    const lunch = [{ day, meal: 'breakfast', kcal: 500 }, { day, meal: 'lunch', kcal: 900 }];
    // 600 left for dinner and snack: dinner 0.25 / 0.45 of it
    eq(mealBudget(lunch, day, 'dinner', 2000), Math.round(600 * MEAL_SHARES.dinner / 0.45));
    eq(mealBudget([{ day, meal: 'lunch', kcal: 2500 }], day, 'dinner', 2000), 0);
  });

  test('meal standing: an eaten meal keeps its part of the day, an open one gets what is left', () => {
    const day = '2026-11-12';
    const entries = [{ day, meal: 'breakfast', kcal: 370 }, { day, meal: 'lunch', kcal: 900 }];
    eq(mealStanding(entries, day, 'breakfast', 2000), { eaten: 370, share: 500, over: false });
    eq(mealStanding(entries, day, 'lunch', 2000), { eaten: 900, share: 600, over: true });
    // 730 left for dinner and snack: dinner 0.25 / 0.45 of it
    eq(mealStanding(entries, day, 'dinner', 2000), { eaten: 0, share: Math.round(730 * 0.25 / 0.45), over: false });
    eq(mealStanding([{ day, meal: 'breakfast', kcal: 510 }], day, 'breakfast', 2000).over, false, 'within the rounding');
  });

  test('usual combos: the same foods together on two days or more', () => {
    const foods = [BREAD, CHEESE, MELON, seed('سیب')];
    const e = (day, meal, id) => ({ day, meal, food_id: id, kcal: 1 });
    const entries = [
      e('2026-11-01', 'breakfast', BREAD.id), e('2026-11-01', 'breakfast', CHEESE.id),
      e('2026-11-03', 'breakfast', CHEESE.id), e('2026-11-03', 'breakfast', BREAD.id),
      e('2026-11-04', 'breakfast', BREAD.id), e('2026-11-04', 'breakfast', MELON.id),
      e('2026-11-05', 'snack', 'سیب'),
    ];
    const c = usualCombos(entries, foods, '2026-11-09', 'breakfast');
    eq(c.length, 1);
    eq([c[0].n, c[0].last, c[0].meal, [...c[0].names].sort()], [2, '2026-11-03', 'breakfast', [BREAD.name, CHEESE.name].sort()]);
  });

  test('packs: the meal\'s own, then combos that are not a pack or turned down', () => {
    const combo = (ids, meals) => ({ ids, meals, names: ids });
    const combos = [combo(['a', 'b'], { breakfast: 3 }), combo(['c', 'd'], { breakfast: 2 }), combo(['e', 'f'], { breakfast: 2 }), combo(['g', 'h'], { breakfast: 1, lunch: 2 })];
    const packs = [{ id: 'p1', name: 'صبحانه', meal: 'breakfast', ids: ['b', 'a'] }, { id: 'p2', name: 'ناهار', meal: 'lunch', ids: ['x', 'y'] }];
    const r = mealPacks(packs, combos, ['c,d'], 'breakfast');
    eq(r.own.map(p => p.id), ['p1']);
    eq(r.sug.map(c => packKey(c.ids)), ['e,f']);
    eq(mealPacks([], combos, [], 'breakfast', 2).sug.length, 2);
  });
});
