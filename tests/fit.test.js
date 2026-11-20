// fitPlate, version 2 of the amounts (SAHM.md phase 3). The behaviour both versions share is in
// portion.test.js (fitBehaviour); here what only version 2 does, and the user's decisions it carries.
import { suite, test, eq, ok } from './harness.js';
import { fitPlate } from '../js/domain/fit.js';
import { SEED_FOODS, GRAM } from '../js/data/seedFoods.js';
import { NUTR } from '../js/data/nutrients.js';

const seed = name => {
  const f = SEED_FOODS.find(x => x.name === name);
  if (!f) throw new Error(`no seed food ${name}`);
  return { ...f, id: name };
};
const carbsOf = f => (NUTR[f.name] || [0, 0])[0];

suite('fit v2', () => {
  test('kidney: the protein limit comes before the calories (the user, 2026-11-20)', () => {
    const r = fitPlate([seed('نیمرو'), seed('نان بربری')], 590, {}, { proteinMax: 13 });
    ok(r.protein <= 13.5, `protein ${r.protein}`);
    ok(r.total < 590 - 100, `fewer calories, ${r.total}`);
    eq(r.over, 0);
  });

  test('kidney: the protein of bread and rice counts too', () => {
    const foods = [seed('برنج سفید (کته یا چلو)'), seed('قورمه‌سبزی (بدون روغن رو)'), seed('ماست‌وخیار'), seed('سالاد شیرازی (بدون روغن)')];
    for (const k of [450, 600, 750]) ok(fitPlate(foods, k, {}, { proteinMax: 16 }).protein <= 16.5, `${k}`);
  });

  test('diabetes: the carbohydrate of every food counts, the stew\'s too', () => {
    const foods = [seed('برنج سفید (کته یا چلو)'), seed('قیمه (بدون روغن رو)'), seed('سالاد شیرازی (بدون روغن)')];
    for (const k of [400, 550, 700]) {
      const cap = Math.round(k * 0.4 / 4);
      const r = fitPlate(foods, k, {}, { carbMax: cap, carbsOf });
      ok(r.carbs <= cap + Math.max(4, cap * 0.1) + 1e-9, `${k}: ${r.carbs} of ${cap}`);
    }
  });

  test('the plate that fits is found: a lunch of 700 and a dinner of 400', () => {
    const lunch = fitPlate([seed('برنج سفید (کته یا چلو)'), seed('قورمه‌سبزی (بدون روغن رو)'), seed('ماست‌وخیار')], 700, {}, { proteinMin: 30 });
    ok(lunch.total >= 665 && lunch.total <= 715, `lunch ${lunch.total}`);
    ok(lunch.protein >= 27, `lunch protein ${lunch.protein}`);
    const dinner = fitPlate([seed('تخم‌مرغ آب‌پز'), seed('نان سنگک'), seed('خیار')], 400, {}, { proteinMin: 25 });
    ok(dinner.protein >= 20, `dinner protein ${dinner.protein}`);
  });

  test('the same answer every time', () => {
    const foods = [seed('نان سنگک'), seed('پنیر سفید'), seed('گردو (مغز کامل)')];
    eq(fitPlate(foods, 430, {}, { proteinMin: 23 }).items.map(it => it.qty), fitPlate(foods, 430, {}, { proteinMin: 23 }).items.map(it => it.qty));
  });

  test('eight foods weighed in grams: still quick, and every amount a step of 5 g', () => {
    const own = (name, cat, kcal100, p100) => ({ id: name, name, category: cat, unit: GRAM, grams: 1, kcal: kcal100 / 100, protein: p100 / 100 });
    const foods = [own('مرغ', 'protein', 165, 31), own('برنج', 'grain', 130, 2.7), own('خورش', 'stew', 110, 7), own('ماست', 'dairy', 60, 3.5),
      own('پنیر', 'other', 260, 17), own('نان', 'grain', 270, 9), own('میوه', 'fruit', 50, 0.5), own('شیرینی', 'sweet', 450, 5)];
    const t = Date.now();
    const r = fitPlate(foods, 900, {}, { proteinMin: 35 });
    ok(Date.now() - t < 200, `${Date.now() - t} ms`);
    for (const it of r.items) eq(it.qty % 5, 0);
  });
});
