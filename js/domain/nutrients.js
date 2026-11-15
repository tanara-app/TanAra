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
