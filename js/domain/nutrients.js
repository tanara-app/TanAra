/*
  Carbohydrate and sodium (REDESIGN.md, the medical review's step 4). Pure.

  - A starter food's are in js/data/nutrients.js; the person's own foods get theirs from Hooshvareh,
    asked together with the health tags and kept beside them in the `food_tags` note
    ({ [food id]: { s: sig, t: [tags], c: carbs g, na: sodium mg } }, per unit of the food).
  - Diabetes and prediabetes (ADA Standards of Care): carbohydrate is what moves blood sugar, and
    spreading it evenly over the meals matters as much as the day's total. The day's limit is 40%
    of the target's calories (CARB_SHARE; ADA sets no one figure, and less carbohydrate has the best
    evidence for blood sugar), and each meal gets the same part of its own calories.
  - High blood pressure, heart and kidney disease, kidney stones (the conditions that keep salty
    food out, health.js): salt under 5 g a day (WHO; 2 g of sodium), shown as salt, the amount
    people know. Salt = sodium × 2.5.
*/
import { NUTR } from '../data/nutrients.js';
import { tagSig } from './health.js';

export const CARB_SHARE = 0.4;
export const SALT_MAX_G = 5;
export const CARB_CONDITIONS = ['diabetes', 'prediabetes'];
export const SALT_CONDITIONS = ['bp', 'heart', 'kidney', 'stones'];

export const countsCarbs = conditions => (conditions || []).some(c => CARB_CONDITIONS.includes(c));
export const countsSalt = conditions => (conditions || []).some(c => SALT_CONDITIONS.includes(c));

// grams of carbohydrate a budget of `kcal` calories may hold
export const carbLimit = kcal => Math.round((Number(kcal) || 0) * CARB_SHARE / 4);
export const saltOf = sodiumMg => sodiumMg * 2.5 / 1000;

// { c, na } in one unit of the food, or null when not known (yet)
export function nutrOf(food, saved = {}, seedNames = new Set(), recipeOf = () => null) {
  if (!food) return null;
  if (seedNames.has(food.name)) {
    const n = NUTR[food.name];
    return n ? { c: n[0], na: n[1] } : null;
  }
  const s = saved?.[food.id];
  return s && s.c != null && s.s === tagSig(food, recipeOf(food)) ? { c: Number(s.c) || 0, na: Number(s.na) || 0 } : null;
}

// how many units of its food an entry is: from the calories (right in grams or units alike), else the amount
function unitsOf(e, food) {
  const per = Number(food.kcal) || 0;
  if (per > 0 && e.kcal != null) return (Number(e.kcal) || 0) / per;
  return e.unit === food.unit ? Number(e.qty) || 0 : null;
}

/*
  The carbohydrate and sodium in a list of entries. `foodOf(e)`: the entry's food (by id, else a food
  of the same name), `nutr(food)`: nutrOf. Entries with nothing known are counted in `unknown`.
*/
export function nutrTotals(entries, foodOf, nutr) {
  let carbs = 0, sodium = 0, unknown = 0;
  for (const e of entries) {
    const f = foodOf(e);
    const n = f && nutr(f);
    const u = n && unitsOf(e, f);
    if (u == null || !n) { if ((Number(e.kcal) || 0) > 0) unknown++; continue; }
    carbs += u * n.c;
    sodium += u * n.na;
  }
  return { carbs: Math.round(carbs), sodium: Math.round(sodium), salt: Math.round(saltOf(sodium) * 10) / 10, unknown };
}

/*
  A meal's limits and goals for the amounts (fitPlate; SAHM.md phase 7 checks them against the
  guidelines in tests/clinical.test.js and research/clinical-review.md). `shares`: each meal's part
  of the day; `budget`: the meal's calories now; `dayKcal`: the day's target; `protein`: the day's
  protein, a goal or, with reduced kidney function (`proteinIsLimit`), a limit; `main`: a main meal
  (breakfast, lunch, dinner; سحری, افطار, شام).
  - carbMax: with diabetes or prediabetes, 40% of the meal's calories, but never more than the
    meal's share of the day's carbohydrate: a meal that has more calories because an earlier one was
    skipped does not get more carbohydrate (ADA: carbohydrate kept steady from meal to meal; the
    carb-counting ranges for one meal; the independent review of 2026-11-20);
  - proteinMax: with the kidney limit, the meal's part of it;
  - proteinMin: otherwise a main meal's part of the day's protein, 15–40 g (ISSN: 20–40 g a meal),
    and never more than a quarter of the meal's calories (AMDR 10–35%); none under 5 g;
  - sodiumMax: with high blood pressure, heart or kidney disease or stones, the meal's part of
    2000 mg (WHO, KDIGO).
*/
export const PROTEIN_PART = 0.25;
export function mealLimits({ meal, budget, shares, dayKcal = null, protein, proteinIsLimit = false, conditions = [], main = false }) {
  const all = Object.values(shares).reduce((a, b) => a + b, 0);
  const part = all ? (shares[meal] || 0) / all : 0;
  const kcal = Math.max(0, Number(budget) || 0);
  const carbKcal = Number(dayKcal) > 0 ? Math.min(kcal, dayKcal * part) : kcal;
  const goal = !proteinIsLimit && all && main ? Math.min(Math.min(40, Math.max(15, Math.round(protein * part))), Math.floor(PROTEIN_PART * kcal / 4)) : null;
  return {
    carbMax: countsCarbs(conditions) ? carbLimit(carbKcal) : null,
    proteinMax: proteinIsLimit && all ? Math.round(protein * part) : null,
    proteinMin: goal != null && goal >= 5 ? goal : null,
    sodiumMax: countsSalt(conditions) && all ? Math.round(SALT_MAX_G * 1000 / 2.5 * part) : null,
  };
}
