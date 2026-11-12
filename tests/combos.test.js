import { suite, test, eq, ok } from './harness.js';
import { comboFoods, dislikeTest, mealCombos, searchCombos, shortName, mealRows, libKey, freeFoods } from '../js/domain/combos.js';
import { fitMeal, packKey } from '../js/domain/portion.js';
import { COMBOS } from '../js/data/combos.js';
import { SEED_FOODS } from '../js/data/seedFoods.js';
import { SEED_TAGS } from '../js/domain/health.js';

const BANK = SEED_FOODS.map(f => ({ ...f, id: `id:${f.name}` }));
const id = name => `id:${name}`;
const byKind = (list, kind) => list.filter(c => c.kind === kind);

suite('combos', () => {
  test('every starter combo uses starter foods only, with unique ids and a known meal', () => {
    const ids = new Set();
    for (const c of COMBOS) {
      ok(comboFoods(c, BANK), `${c.id}: a food is not in the starter bank`);
      ok(!ids.has(c.id), `${c.id}: id twice`);
      ids.add(c.id);
      ok(c.meals.length && c.meals.every(m => ['breakfast', 'lunch', 'dinner', 'snack'].includes(m)), `${c.id}: meals`);
    }
  });

  test('every meal has a good number of starter combos', () => {
    for (const m of ['breakfast', 'lunch', 'dinner', 'snack']) {
      const n = mealCombos({ meal: m, foods: BANK, starters: COMBOS }).length;
      ok(n >= 12, `${m}: only ${n}`);
    }
  });

  test('every starter combo fits a usual meal budget without going far over', () => {
    const budget = { breakfast: 450, lunch: 600, dinner: 500, snack: 200 };
    for (const c of COMBOS) for (const m of c.meals) {
      const foods = comboFoods(c, BANK);
      const r = fitMeal(foods, budget[m]);
      ok(r.over <= 120, `${c.id} in ${m}: ${r.over} over`);
    }
  });

  test('a combo with a food missing from the bank is skipped', () => {
    const bank = BANK.filter(f => f.name !== 'فسنجان');
    const names = mealCombos({ meal: 'lunch', foods: bank, starters: COMBOS }).map(c => c.name);
    ok(!names.includes('چلو فسنجان'));
    ok(names.includes('چلو قیمه'));
  });

  test('own first, then usual, then starters; nothing twice', () => {
    const pack = { id: 'p1', name: 'صبحانه‌ی من', meal: 'breakfast', ids: [id('نان سنگک'), id('پنیر سفید')] };
    const usual = [
      { ids: [id('نان سنگک'), id('پنیر سفید')].sort(), meals: { breakfast: 5 } }, // the same as the pack
      { ids: [id('نیمرو'), id('نان سنگک')].sort(), meals: { breakfast: 3 } },
      { ids: [id('سیب'), id('بادام')].sort(), meals: { snack: 4, breakfast: 1 } }, // not in this meal
    ];
    const list = mealCombos({ meal: 'breakfast', foods: BANK, packs: [pack], usual, starters: COMBOS });
    eq(list[0].kind, 'own');
    eq(list[1].kind, 'usual');
    eq(byKind(list, 'usual').length, 1);
    eq(list[2].kind, 'starter');
    eq(new Set(list.map(c => packKey(c.ids))).size, list.length);
  });

  test('a starter combo they changed and saved is replaced by theirs; a hidden one is gone', () => {
    const pack = { id: 'p2', name: 'چلو قیمه', meal: 'lunch', ids: [id('برنج سفید (کته یا چلو)'), id('قیمه (بدون روغن رو)'), id('ماست کم‌چرب')], from: 'l-gheymeh' };
    const list = mealCombos({ meal: 'lunch', foods: BANK, packs: [pack], starters: COMBOS, hidden: [libKey('l-ghormeh')] });
    eq(list.filter(c => c.name === 'چلو قیمه').map(c => c.kind), ['own']);
    ok(!list.some(c => c.lib?.id === 'l-ghormeh'));
  });

  test('a turned-down usual combo stays hidden', () => {
    const ids = [id('نیمرو'), id('نان سنگک')].sort();
    const list = mealCombos({ meal: 'breakfast', foods: BANK, usual: [{ ids, meals: { breakfast: 3 } }], hidden: [packKey(ids)] });
    eq(list.length, 0);
  });

  test('conditions keep out combos with a food they avoid', () => {
    const avoid = fid => (SEED_TAGS[fid.slice(3)] || []).find(t => t === 'sugary') || null; // diabetes
    const names = mealCombos({ meal: 'breakfast', foods: BANK, starters: COMBOS, avoid }).map(c => c.name);
    ok(!names.includes('نان و کره و عسل'));
    ok(!names.includes('حلیم'));
    ok(names.includes('نان و پنیر و گوجه'));
  });

  test('foods they don\'t eat: whole words only', () => {
    const t = dislikeTest('ماهی، شیر و بادمجان');
    ok(t({ name: 'تن ماهی (روغن آبکش‌شده)' }));
    ok(t({ name: 'ماهی قزل‌آلا گریل' }));
    ok(t({ name: 'شیر کم‌چرب' }));
    ok(!t({ name: 'شیرینی خشک' }));
    ok(t({ name: 'خورش بادمجان (بدون روغن رو)' }));
    ok(!dislikeTest('')({ name: 'سیب' }));
    const names = mealCombos({ meal: 'dinner', foods: BANK, starters: COMBOS, dislikes: 'ماهی' }).map(c => c.name);
    ok(!names.includes('تن ماهی و سالاد'));
    ok(names.includes('کتلت و نان'));
  });

  test('search by combo name or a food in it', () => {
    const list = mealCombos({ meal: 'lunch', foods: BANK, starters: COMBOS });
    ok(searchCombos(list, 'قیمه').some(c => c.name === 'چلو قیمه'));
    ok(searchCombos(list, 'ماست').length >= 3);
    eq(searchCombos(list, '').length, list.length);
  });

  test('free foods: low-calorie vegetables and near-nothing drinks, the usual ones first, none their illness keeps out', () => {
    const list = freeFoods(BANK, [], '2026-11-14', 'dinner', { limit: 50 }).map(f => f.name);
    ok(list.includes('خیار') && list.includes('چای بدون قند'));
    ok(!list.includes('سالاد فصل با سس مایونز'), 'a salad with mayonnaise is not free');
    ok(!list.includes('خرما') && !list.includes('گردو (مغز کامل)'), 'small but not free');
    const es = [{ day: '2026-11-13', meal: 'dinner', food_id: id('سبزی خوردن'), created_at: '1' }, { day: '2026-11-12', meal: 'dinner', food_id: id('سبزی خوردن'), created_at: '2' }];
    eq(freeFoods(BANK, es, '2026-11-14', 'dinner')[0].name, 'سبزی خوردن');
    const avoid = fid => (fid === id('خیار') ? 'salty' : null);
    ok(!freeFoods(BANK, [], '2026-11-14', 'dinner', { avoid, limit: 50 }).some(f => f.name === 'خیار'));
  });

  test('short names drop the bracketed note', () => {
    eq(shortName('قیمه (بدون روغن رو)'), 'قیمه');
    eq(shortName('سیب'), 'سیب');
    eq(shortName('روغن خورش / غذا'), 'روغن خورش');
  });

  test('meal rows: eaten kcal and names, the budget only for an empty meal', () => {
    const entries = [
      { day: '2026-11-12', meal: 'breakfast', name: 'نان سنگک', kcal: 220, created_at: '1' },
      { day: '2026-11-12', meal: 'breakfast', name: 'پنیر سفید', kcal: 80, created_at: '2' },
      { day: '2026-11-11', meal: 'lunch', name: 'قیمه', kcal: 400, created_at: '3' },
    ];
    const rows = mealRows(entries, '2026-11-12', { breakfast: 'صبحانه', lunch: 'ناهار' }, () => 500);
    eq(rows.map(r => [r.meal, r.kcal, r.names, r.budget]), [['breakfast', 300, ['نان سنگک', 'پنیر سفید'], null], ['lunch', 0, [], 500]]);
  });
});
