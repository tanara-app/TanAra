/*
  The single meal screen (beta «یکی»): the combinations offered for one meal. Pure functions —
  no DOM, no storage, no AI.

  Three sources, in this order:
  - own: their saved combos for this meal (the «بسته‌ها» packs: { id, name, meal, ids, from? });
  - usual: the same foods eaten together in this meal on two days or more (usualCombos);
  - starter: the app's combos (data/combos.js), with foods matched to their bank by name.
  A starter combo they changed and saved is replaced by their own (`from`: its id); one they
  turned down is in `hidden` as `lib:<id>`, a usual one as its foods' key. Combos with a food their
  conditions keep out (`avoid`: food id → tag or null) or a food they said they don't eat are left
  out. Amounts are never stored: fitMeal (portion.js) gives them from what the meal has left.
*/
import { norm } from '../lib/fa.js';
import { packKey, roleOf } from './portion.js';
import { isFree } from './plan.js';
import { frequentFoods } from './stats.js';

export const libKey = id => `lib:${id}`;

// A short name for a food in a one-line list: without the bracketed note («قیمه (بدون روغن رو)» → «قیمه»)
// or the second name after a slash («روغن خورش / غذا» → «روغن خورش»).
export const shortName = name => String(name).replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s*\/.*$/, '').trim();

// the order foods are named in: the dish first, bread or rice, then what goes beside them
const ORDER = ['main', 'protein', 'starch', 'dairy', 'rich', 'fat', 'fruit', 'veg', 'treat', 'drink'];
const byRole = list => [...list].sort((a, b) => ORDER.indexOf(roleOf(a)) - ORDER.indexOf(roleOf(b)));

// The bank foods of a starter combo, matched by exact (normalised) name; null if one is missing.
export function comboFoods(combo, foods) {
  const byName = new Map(foods.map(f => [norm(f.name), f]));
  const out = combo.foods.map(n => byName.get(norm(n)));
  return out.every(Boolean) ? out : null;
}

/*
  «چه چیزهایی نمی‌خوری؟» is free text («ماهی، بادمجان، شیر»). A food is out when a phrase of it
  is one of its whole words (or runs of words): «ماهی» takes out «تن ماهی» but «شیر» keeps
  «شیرینی خشک».
*/
// like norm(), but the spaces between words stay (one each)
const words = s => norm(String(s || '').replace(/[()\/،,]/g, ' ').trim().split(/\s+/).join('\u0001')).split('\u0001');
export function dislikeTest(text) {
  const parts = String(text || '').split(/[،,؛;\n]|\s+و\s+/).map(s => words(s).join(' ')).filter(s => s.length >= 2);
  if (!parts.length) return () => false;
  return food => {
    const w = ` ${words(food.name).join(' ')} `;
    return parts.some(p => w.includes(` ${p} `));
  };
}

/*
  The combos for `meal`, each { key, name, foods, ids, kind: 'own' | 'usual' | 'starter', pack?, lib? }.
  `usual`: from usualCombos (portion.js). `starters`: data/combos.js.
*/
export function mealCombos({ meal, foods, packs = [], usual = [], starters = [], hidden = [], avoid = null, dislikes = '' }) {
  const byId = new Map(foods.map(f => [f.id, f]));
  const hide = new Set(hidden);
  const disliked = dislikeTest(dislikes);
  const ok = list => list.every(f => !(avoid && f.id && avoid(f.id)) && !disliked(f));
  const seen = new Set();
  const out = [];
  const add = c => {
    const k = packKey(c.ids);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(c);
  };

  for (const p of packs) {
    if (p.meal !== meal) continue;
    const list = p.ids.map(id => byId.get(id)).filter(Boolean);
    if (list.length) add({ key: `p:${p.id}`, name: p.name, foods: list, ids: list.map(f => f.id), kind: 'own', pack: p });
  }
  // a pack in any meal already stands for those foods
  for (const p of packs) seen.add(packKey(p.ids));
  const replaced = new Set(packs.map(p => p.from).filter(Boolean));

  for (const c of usual) {
    if ((c.meals?.[meal] || 0) < 2) continue;
    const k = packKey(c.ids);
    if (hide.has(k)) continue;
    const list = byRole(c.ids.map(id => byId.get(id)).filter(Boolean));
    if (list.length < 2 || !ok(list)) continue;
    add({ key: `u:${k}`, name: list.map(f => shortName(f.name)).join(' و '), foods: list, ids: list.map(f => f.id), kind: 'usual' });
  }

  for (const c of starters) {
    if (!c.meals.includes(meal) || hide.has(libKey(c.id)) || replaced.has(c.id)) continue;
    const list = comboFoods(c, foods);
    if (!list || !ok(list)) continue;
    add({ key: `s:${c.id}`, name: c.name, foods: list, ids: list.map(f => f.id), kind: 'starter', lib: c });
  }
  return out;
}

/*
  «هر وقت گرسنه شدی»: foods free to eat whenever (isFree: a vegetable with at most 50 kcal a unit, or
  next to nothing like unsweetened tea), from their own bank, without one their illness keeps out
  (`avoid`). The ones they eat most in this meal first, then the ones they eat at all, then by name.
*/
export function freeFoods(foods, entries, day, meal, { avoid = null, limit = 6 } = {}) {
  const inMeal = new Map(frequentFoods(entries, foods, day, meal, 60).map((x, n) => [x.food.id, n]));
  const used = new Set(entries.map(e => e.food_id).filter(Boolean));
  return foods.filter(f => isFree(f) && !(avoid && avoid(f.id)))
    .sort((a, b) => (inMeal.get(a.id) ?? 99) - (inMeal.get(b.id) ?? 99) || (used.has(b.id) ? 1 : 0) - (used.has(a.id) ? 1 : 0) || a.name.localeCompare(b.name, 'fa'))
    .slice(0, limit);
}

// Combos whose name or a food's name has `q` in it.
export function searchCombos(combos, q) {
  const n = norm(q).trim();
  if (!n) return combos;
  return combos.filter(c => norm(c.name).includes(n) || c.foods.some(f => norm(f.name).includes(n)));
}


/*
  The meals as rows on the today screen: what was eaten (kcal and the foods' short names) and,
  for a meal with nothing yet, the calories it has (`budgetFor(meal)`).
*/
export function mealRows(entries, day, meals, budgetFor) {
  const list = entries.filter(e => e.day === day);
  return Object.entries(meals).map(([k, label]) => {
    const items = list.filter(e => e.meal === k).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    const kcal = items.reduce((t, e) => t + (Number(e.kcal) || 0), 0);
    return { meal: k, label, items, kcal, names: [...new Set(items.map(e => shortName(e.name)))], budget: items.length ? null : budgetFor(k) };
  });
}
