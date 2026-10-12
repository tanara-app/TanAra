/*
  Recipes: a home-cooked dish written down as its ingredients by weight, so the calories of
  one کفگیر of *their* pot are computed instead of taken from an average. Pure functions.

  Same rule as the diet plan and the photos: Hooshvareh only says which ingredients and how
  many grams; every total is computed here. An ingredient that is a bank food takes its
  numbers from the bank; the model's per-100 g values are used only for the rest.

  A recipe: { name, items: [{ name, grams, kcal100, protein100, food_id }], steps: [text],
  unit, servings, cookedGrams, category, is_veg, note, minutes }. `servings` is how many of `unit`
  the whole pot gives; `cookedGrams` the weight of the finished dish (an estimate until they
  weigh it), which is what makes logging by grams exact.
*/
const GRAM = 'گرم';
const CATEGORIES = ['grain', 'stew', 'protein', 'legume', 'breakfast', 'dairy', 'fruit', 'veg', 'nuts', 'drink', 'sweet', 'other'];
const r1 = x => Math.round(x * 10) / 10;
const between = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;

// What 100 g of a bank food holds, when the bank knows the weight of its unit.
export function per100(food) {
  const g = food?.unit === GRAM ? 1 : Number(food?.grams);
  return g > 0 ? { kcal100: food.kcal / g * 100, protein100: food.protein / g * 100 } : null;
}

// Ingredients as they arrive (from Hooshvareh or the form) → clean items. Nonsense is dropped.
export function recipeItems(raw, foods = []) {
  const byId = new Map(foods.map(f => [f.id, f]));
  const out = [];
  for (const i of raw || []) {
    const name = String(i?.name || '').trim();
    const grams = Number(i?.grams);
    if (!name || !between(grams, 0.1, 20000)) continue;
    const food = i.food_id ? byId.get(i.food_id) : null;
    const bank = food && per100(food);
    const kcal100 = bank ? bank.kcal100 : Number(i.kcal100);
    const protein100 = bank ? bank.protein100 : Number(i.protein100) || 0;
    // pure fat is ~900 kcal per 100 g; nothing edible is denser
    if (!between(kcal100, 0, 900) || !between(protein100, 0, 100)) continue;
    out.push({ name: bank ? food.name : name, grams: r1(grams), kcal100: r1(kcal100), protein100: r1(protein100), food_id: bank ? food.id : null });
  }
  return out;
}

// A whole recipe as it arrives → a clean one (null when nothing usable is left).
export function recipeFrom(raw, foods = []) {
  const items = recipeItems(raw?.items, foods);
  const name = String(raw?.name || '').trim();
  if (!name || !items.length) return null;
  const unit = String(raw.unit || '').trim();
  const servings = Number(raw.servings);
  const cooked = Number(raw.cookedGrams ?? raw.cooked_grams);
  return {
    name, items,
    steps: (Array.isArray(raw.steps) ? raw.steps : []).map(s => String(s || '').trim()).filter(Boolean).slice(0, 15),
    unit: unit && unit !== GRAM ? unit : 'پرس',
    servings: between(servings, 0.5, 200) ? r1(servings) : 1,
    cookedGrams: between(cooked, 1, 50000) ? Math.round(cooked) : null,
    category: CATEGORIES.includes(raw.category) ? raw.category : 'stew',
    is_veg: !!raw.is_veg,
    note: String(raw.note || '').trim(),
    minutes: between(Number(raw.minutes), 1, 600) ? Math.round(Number(raw.minutes)) : null,
  };
}

const itemKcal = i => i.grams * i.kcal100 / 100;
const itemProtein = i => i.grams * i.protein100 / 100;

// The whole pot: calories, protein, and the weight of what went in.
export function recipeTotals(r) {
  const items = r?.items || [];
  return {
    kcal: Math.round(items.reduce((s, i) => s + itemKcal(i), 0)),
    protein: r1(items.reduce((s, i) => s + itemProtein(i), 0)),
    grams: Math.round(items.reduce((s, i) => s + i.grams, 0)),
  };
}

export const itemTotals = i => ({ kcal: Math.round(itemKcal(i)), protein: r1(itemProtein(i)) });

// One unit of the finished dish, in the shape of a bank food: { unit, grams, kcal, protein }.
export function perUnit(r) {
  const t = recipeTotals(r);
  const n = Number(r.servings) > 0 ? Number(r.servings) : 1;
  return { unit: r.unit, grams: Number(r.cookedGrams) > 0 ? r1(r.cookedGrams / n) : null, kcal: Math.round(t.kcal / n), protein: r1(t.protein / n) };
}

// The recipe as a food for the bank.
export const recipeFood = r => ({ name: r.name, ...perUnit(r), category: r.category || 'stew', is_veg: !!r.is_veg });
