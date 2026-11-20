// The app's clinical numbers against the published guidance they rest on (SAHM.md phase 7; the sources
// and the review are in research/clinical-review.md). A change that takes a number outside what the
// guidelines say fails here.
import { suite, test, eq, ok } from './harness.js';
import { mealLimits, carbLimit, SALT_MAX_G, CARB_SHARE } from '../js/domain/nutrients.js';
import { MEAL_SHARES5 } from '../js/domain/portion.js';
import { proteinFor, refWeight, PROTEIN_PER_KG, KIDNEY_PROTEIN_PER_KG } from '../js/domain/targets.js';
import { fitPlate, WEIGHTS } from '../js/domain/fit.js';
import { SEED_TAGS, AVOID } from '../js/domain/health.js';

const MAIN = new Set(['breakfast', 'lunch', 'dinner']);
const limitsOn = (dayKcal, protein, conditions, proteinIsLimit = false) => Object.fromEntries(Object.keys(MEAL_SHARES5).map(m =>
  [m, mealLimits({ meal: m, budget: dayKcal * MEAL_SHARES5[m], shares: MEAL_SHARES5, protein, proteinIsLimit, conditions, main: MAIN.has(m) })]));

suite('clinical', () => {
  test('diabetes: each meal\'s carbohydrate falls in the carb-counting ranges (30–75 g a meal, 15–30 g a snack)', () => {
    // diabetes education (carb counting): 30–60 g a meal for women, 45–75 g for men, 15–30 g a snack
    for (const day of [1600, 1800, 2000, 2200, 2400]) {
      const l = limitsOn(day, 80, ['diabetes']);
      for (const m of MAIN) ok(l[m].carbMax >= 40 && l[m].carbMax <= 75, `${day}: ${m} ${l[m].carbMax} g`);
      for (const m of ['snack1', 'snack2']) ok(l[m].carbMax >= 15 && l[m].carbMax <= 30, `${day}: ${m} ${l[m].carbMax} g`);
    }
    // ADA: no ideal share; less carbohydrate has the most evidence for blood sugar. 40% stays moderate
    // (not the under-26% of very low carbohydrate, which needs the doctor with glucose-lowering drugs)
    ok(CARB_SHARE >= 0.26 && CARB_SHARE <= 0.45, `${CARB_SHARE}`);
    eq(carbLimit(500), 50);
  });

  test('kidney: the day\'s protein limit is 0.8 g/kg (KDIGO 2024, 2022), never above 1.3 g/kg of their own weight from BMI 16', () => {
    eq(KIDNEY_PROTEIN_PER_KG, 0.8);
    for (const h of [150, 160, 170, 180, 190]) {
      const limit = proteinFor({ heightCm: h, conditions: ['kidney'] });
      eq(limit, Math.round(0.8 * refWeight(h)), `${h} cm`);
      for (const bmi of [16, 18.5, 22, 25, 30, 40]) {
        const kg = bmi * (h / 100) ** 2;
        ok(limit / kg <= 1.3, `${h} cm, BMI ${bmi}: ${(limit / kg).toFixed(2)} g/kg`);
      }
    }
  });

  test('kidney: the meals\' parts of the protein limit add up to it, and a main meal has no protein goal', () => {
    const l = limitsOn(2000, 58, ['kidney'], true);
    const sum = Object.values(l).reduce((t, x) => t + x.proteinMax, 0);
    ok(Math.abs(sum - 58) <= 2, `${sum}`);
    for (const m of MAIN) eq(l[m].proteinMin, null);
  });

  test('salt: the meals\' parts of sodium add up to 2000 mg, 5 g of salt (WHO, KDIGO)', () => {
    eq(SALT_MAX_G, 5);
    for (const c of ['bp', 'heart', 'kidney', 'stones']) {
      const l = limitsOn(2000, 80, [c]);
      const sum = Object.values(l).reduce((t, x) => t + x.sodiumMax, 0);
      ok(Math.abs(sum - 2000) <= 5, `${c}: ${sum}`);
    }
    eq(limitsOn(2000, 80, ['diabetes']).lunch.sodiumMax, null);
  });

  test('protein: 1.4 g/kg a day while losing (over 1.3 keeps muscle), a main meal 15–40 g (ISSN: 20–40 g), at most a quarter of its calories (inside the AMDR\'s 10–35%)', () => {
    ok(PROTEIN_PER_KG >= 1.2 && PROTEIN_PER_KG <= 1.6, `${PROTEIN_PER_KG}`);
    for (const p of [60, 80, 100, 130]) {
      const l = limitsOn(2000, p, []);
      for (const m of MAIN) ok(l[m].proteinMin >= 15 && l[m].proteinMin <= 40, `${p}: ${m} ${l[m].proteinMin}`);
      eq(l.snack1.proteinMin, null);
    }
    ok(WEIGHTS.proteinPart >= 0.1 && WEIGHTS.proteinPart <= 0.35, `${WEIGHTS.proteinPart}`);
    // a small meal is not asked for more protein than a quarter of its calories
    const egg = { id: 'e', name: 'تخم‌مرغ', category: 'breakfast', unit: 'عدد', grams: 50, kcal: 75, protein: 6 };
    const bread = { id: 'b', name: 'نان', category: 'grain', unit: 'کف‌دست', grams: 40, kcal: 110, protein: 4 };
    const r = fitPlate([egg, bread], 200, {}, { proteinMin: 25 });
    ok(r.protein * 4 <= 0.35 * Math.max(200, r.total) + 1e-9, `${r.protein} g in ${r.total} kcal`);
  });

  test('the independent review (2026-11-20): carbohydrate stays at the meal\'s share of the day, a small meal\'s protein goal within a quarter of it, cheese and دوغ salty', () => {
    // a lunch with calories carried over from a skipped breakfast does not get more carbohydrate (ADA: steady from meal to meal)
    const big = mealLimits({ meal: 'lunch', budget: 1000, shares: MEAL_SHARES5, dayKcal: 2000, protein: 90, conditions: ['diabetes'], main: true });
    eq(big.carbMax, carbLimit(600));
    // a lunch smaller than its share keeps 40% of its own calories
    eq(mealLimits({ meal: 'lunch', budget: 400, shares: MEAL_SHARES5, dayKcal: 2000, protein: 90, conditions: ['diabetes'], main: true }).carbMax, carbLimit(400));
    // 192 kcal: at most 12 g of protein asked (a quarter of it), not the 15–40 of a full meal; under 5 g, none
    eq(mealLimits({ meal: 'dinner', budget: 192, shares: MEAL_SHARES5, protein: 90, main: true }).proteinMin, 12);
    eq(mealLimits({ meal: 'dinner', budget: 60, shares: MEAL_SHARES5, protein: 90, main: true }).proteinMin, null);
    for (const f of ['پنیر سفید', 'دوغ', 'کشک']) ok(SEED_TAGS[f].includes('salty'), f);
    for (const c of ['bp', 'heart', 'kidney', 'stones']) ok(AVOID[c].includes('salty'), c);
  });
});
