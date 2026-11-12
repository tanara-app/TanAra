/*
  «سهم وعده» (beta): they eat what they like; they pick the foods of a meal and the app says how
  much of each fits. Pure functions — no DOM, no storage, no AI, so it costs nothing.

  Sharing the calories out equally (portionsFor in plan.js) gives as many calories of cheese as of
  watermelon, so more cheese than a meal wants and a sliver of fruit. Here every food has a role on
  the plate (roleOf), worked out from its category and its own numbers, so the user's own foods
  get one too. A role has a weight (its part of the meal when present) and a sensible helping in
  grams: vegetables and fruit may grow big (much food for few calories), protein keeps its part,
  and spreads, nuts, sweets and rich foods like cheese stay small whatever is left.
*/
import { addDays } from '../lib/dates.js';
import { GRAM } from '../data/seedFoods.js';

// w: part of the meal. g: [least, most] grams in one meal. units: the same when a unit's weight
// is unknown. step: rounding, in units (a small one, like a walnut, is counted whole).
export const ROLES = {
  main: { label: 'غذای اصلی', w: 4, g: [150, 450], units: [0.5, 3] },
  protein: { label: 'پروتئین', w: 3, g: [50, 250], units: [0.5, 3] },
  starch: { label: 'نان و برنج', w: 3, g: [30, 300], units: [0.5, 3] },
  dairy: { label: 'شیر و ماست', w: 2, g: [100, 300], units: [0.5, 2] },
  rich: { label: 'پرکالری', w: 1.2, g: [15, 60], units: [0.5, 1.5] },
  fruit: { label: 'میوه', w: 1.5, g: [80, 300], units: [0.5, 2] }, // at most two pieces: the diet plan's cap too (maxQty)
  veg: { label: 'سبزی', w: 1, g: [50, 400], units: [0.5, 3] },
  fat: { label: 'چربی و شیرینی کم', w: 0.6, g: [5, 30], units: [0.5, 1.5] },
  treat: { label: 'تنقلات', w: 0.6, g: [10, 120], units: [0.5, 1.5] },
  drink: { label: 'نوشیدنی', w: 0, g: [0, 0], units: [1, 1] },
};
// When the meal does not fit, these are the first to go: the order to suggest dropping.
export const DROP_ORDER = ['treat', 'fat', 'rich', 'drink', 'starch', 'dairy', 'fruit', 'main', 'protein', 'veg'];

const gramsOf = f => (f.unit === GRAM ? 1 : Number(f.grams) > 0 ? Number(f.grams) : null);

// The food's role on the plate, from its category, calories per gram and protein's part.
export function roleOf(f) {
  const kcal = Number(f.kcal) || 0;
  const g = gramsOf(f);
  const d = g ? kcal / g : null;               // calories per gram
  const ps = kcal > 0 ? (Number(f.protein) || 0) * 4 / kcal : 0; // part of calories from protein
  switch (f.category) {
    case 'veg': return d != null && d > 2.5 ? 'fat' : 'veg'; // mayonnaise is a sauce, not a salad
    case 'fruit': return 'fruit';
    case 'grain': return ps >= 0.1 && (d == null || d < 2.2) ? 'main' : 'starch'; // لوبیاپلو is a meal; rice and bread are not
    case 'stew': return d != null && d > 4 ? 'fat' : 'main'; // روغن خورش
    case 'legume': return 'main';
    case 'protein': return 'protein';
    case 'drink': return 'drink';
    case 'sweet': return 'treat';
    case 'nuts': return 'fat';
  }
  // breakfast, dairy, other and the user's own foods: from the numbers
  if (kcal <= 0) return 'veg';
  if (d == null) return ps >= 0.2 ? 'protein' : 'main';
  if (ps >= 0.2 && d <= 2.3) return d < 0.9 ? 'dairy' : 'protein'; // egg, omelette, Greek yoghurt
  if (ps >= 0.15 && d > 2.3) return 'rich';                         // cheese, peanut butter
  if (d > 2) return 'fat';                                           // butter, cream, honey, jam, ارده
  if (d < 1 && f.category === 'dairy') return 'dairy';               // milk, yoghurt
  return 'main';
}

// One food's limits and step, in its own unit.
function limits(f, role) {
  const R = ROLES[role];
  const g = gramsOf(f);
  if (f.unit === GRAM) return { min: R.g[0], max: R.g[1], step: 5 };
  if (!g) return { min: R.units[0], max: R.units[1], step: 0.5 };
  const step = g <= 15 && f.unit === 'عدد' ? 1 : 0.5; // a walnut or a date: whole ones; half a spoon is fine
  const min = Math.max(step, Math.round(R.g[0] / g / step) * step);
  const max = Math.max(min, Math.floor(R.g[1] / g / step) * step);
  return { min, max, step };
}

const roundTo = (x, step) => Math.round(x / step) * step;
const TOL = 15; // calories
const VEG_G = 100; // a usual helping of a vegetable beside a meal: a tomato, a cucumber, half a bowl of salad

/*
  How much of each food to eat, together, in `kcal` calories.
  `locked` ({ index: qty }): amounts the user set with + / −; the rest is shared out around them.
  Returns { items: [{ qty, kcal, protein, role, free, locked, atMax, atMin }], total, protein,
  over (calories past the budget even at the least of each), spare (calories left because every
  food reached its most), drop (index of the food to suggest taking off when over, or null) }.
*/
export function fitMeal(foods, kcal, locked = {}) {
  const budget = Math.max(0, Number(kcal) || 0);
  const info = foods.map((f, i) => {
    const role = roleOf(f);
    const per = Number(f.kcal) || 0;
    const lim = limits(f, role);
    const isLocked = locked[i] != null;
    const free = per <= 0;
    const fixed = isLocked || free || role === 'drink';
    const qty = isLocked ? Number(locked[i]) : free ? (f.unit === GRAM ? 100 : 1) : role === 'drink' ? (f.unit === GRAM ? 200 : 1) : 0;
    return { f, role, per, ...lim, fixed, free, isLocked, qty };
  });
  /*
    Beside a food that carries the meal, a vegetable gets a usual helping (VEG_G) and the
    calories go to the rest: shared by calories, a salad or herbs took what the stew left and
    grew to four tomatoes or nine handfuls of herbs. A meal of vegetables only still fills up.
  */
  if (info.some(x => !x.fixed && x.role !== 'veg')) {
    for (const x of info) {
      if (x.fixed || x.role !== 'veg') continue;
      const g = gramsOf(x.f);
      const want = g ? VEG_G / g : 1;
      x.qty = Math.min(x.max, Math.max(x.min, roundTo(want, x.step)));
      x.fixed = true;
    }
  }
  const flex = info.filter(x => !x.fixed);
  let room = budget - info.filter(x => x.fixed).reduce((t, x) => t + x.qty * x.per, 0);

  // shares by weight; a food that hits a limit keeps it and the rest is shared again
  const clampQ = (x, q) => Math.min(x.max, Math.max(x.min, q));
  let open = [...flex];
  let left = room;
  for (let n = 0; n < 12 && open.length; n++) {
    const W = open.reduce((t, x) => t + ROLES[x.role].w, 0);
    let moved = false;
    for (const x of open) x.qty = (left * ROLES[x.role].w / W) / x.per;
    const out = open.filter(x => x.qty < x.min || x.qty > x.max);
    if (!out.length) break;
    for (const x of out) { x.qty = clampQ(x, x.qty); moved = true; }
    open = open.filter(x => !out.includes(x));
    left = room - flex.filter(x => !open.includes(x)).reduce((t, x) => t + x.qty * x.per, 0);
    if (!moved) break;
  }
  for (const x of flex) { x.want = x.qty * x.per; x.qty = clampQ(x, roundTo(x.qty, x.step)); }

  // rounding up may have gone past the budget: take a step off the least needed, while it can
  const sum = () => info.reduce((t, x) => t + x.qty * x.per, 0);
  const rank = x => DROP_ORDER.indexOf(x.role);
  for (let n = 0; n < 50 && sum() > budget + TOL; n++) {
    const x = flex.filter(y => y.qty - y.step >= y.min - 1e-9).sort((a, b) => rank(a) - rank(b) || b.per - a.per)[0];
    if (!x) break;
    x.qty = Math.round((x.qty - x.step) * 100) / 100;
  }
  // and rounding down may have left a step that fits: give it to the food furthest below its part
  for (let n = 0; n < 50; n++) {
    const gap = budget - sum();
    const x = flex.filter(y => y.qty + y.step <= y.max + 1e-9 && y.step * y.per <= gap + TOL)
      .sort((a, b) => (b.want - b.qty * b.per) - (a.want - a.qty * a.per))[0];
    if (!x) break;
    x.qty = Math.round((x.qty + x.step) * 100) / 100;
  }

  const total = sum();
  // within TOL of the budget is on it: half-unit steps can't land closer
  const over = total - budget > TOL ? Math.round(total - budget) : 0;
  const spare = flex.length && flex.every(x => x.qty >= x.max - 1e-9) ? Math.max(0, Math.round(budget - total)) : 0;
  const cand = info.map((x, i) => ({ x, i })).filter(({ x }) => !x.free && x.per > 0)
    .sort((a, b) => rank(a.x) - rank(b.x) || b.x.qty * b.x.per - a.x.qty * a.x.per);
  return {
    items: info.map(x => ({
      qty: x.qty, kcal: x.qty * x.per, protein: x.qty * (Number(x.f.protein) || 0), role: x.role,
      free: x.free, locked: x.isLocked, step: x.step,
      atMax: !x.fixed && x.qty >= x.max - 1e-9, atMin: !x.fixed && x.qty <= x.min + 1e-9,
    })),
    total, protein: info.reduce((t, x) => t + x.qty * (Number(x.f.protein) || 0), 0),
    // only a food whose going makes the meal fit: «بدون نان جا می‌شود» must be true
    over, spare, drop: over > 0 && foods.length > 1 ? cand.find(({ x }) => x.qty * x.per >= over - TOL)?.i ?? null : null,
  };
}

// Each meal's part of the day, from the plan's occasions (both snacks are «میان‌وعده»).
export const MEAL_SHARES = { breakfast: 0.25, lunch: 0.3, dinner: 0.25, snack: 0.2 };

/*
  The calories a meal has today: what is left of the day's target, shared by the meals not
  eaten yet (this one counted with them). So a big lunch leaves a smaller dinner, and nothing
  is taken out of a meal already eaten. `shares`: per meal, e.g. from their own eating pattern.
*/
export function mealBudget(entries, day, meal, target, shares = MEAL_SHARES) {
  const list = entries.filter(e => e.day === day);
  const eaten = list.reduce((t, e) => t + (Number(e.kcal) || 0), 0);
  const had = new Set(list.map(e => e.meal));
  const open = Object.keys(shares).filter(m => m === meal || !had.has(m));
  const all = open.reduce((t, m) => t + shares[m], 0);
  return Math.max(0, Math.round((target - eaten) * (all ? shares[meal] / all : 1)));
}

/*
  How a meal stands, for its card on the today screen (the rebuild in REDESIGN.md): what was eaten,
  and its share of the day. A meal eaten from keeps its own part of the target; a meal not eaten
  yet gets what is left of the day (mealBudget), so a big lunch shows a smaller dinner. `over`:
  past the share by more than the rounding of half-unit steps.
*/
export function mealStanding(entries, day, meal, target, shares = MEAL_SHARES) {
  const eaten = Math.round(entries.filter(e => e.day === day && e.meal === meal).reduce((t, e) => t + (Number(e.kcal) || 0), 0));
  const share = eaten > 0 ? Math.round(target * (shares[meal] || 0)) : mealBudget(entries, day, meal, target, shares);
  return { eaten, share, over: eaten > share + TOL };
}

// Plan occasions' shares (pattern.js) per meal.
export const mealSharesFrom = s => (s ? { breakfast: s.breakfast, lunch: s.lunch, dinner: s.dinner, snack: (s.snack1 || 0) + (s.snack2 || 0) } : MEAL_SHARES);

/*
  Combinations eaten again and again: the same two or more bank foods together in one meal, on
  at least two days of the last `days`. This meal's first, most often, then most recent.
  [{ ids, names, n, last, meal }].
*/
export function usualCombos(entries, foods, day, meal, { days = 60, limit = 6 } = {}) {
  const from = addDays(day, -days);
  const have = new Map(foods.map(f => [f.id, f]));
  const groups = new Map();
  for (const e of entries) {
    if (e.day < from || e.day > day || !e.food_id || !have.has(e.food_id)) continue;
    const k = `${e.day}|${e.meal}`;
    (groups.get(k) || groups.set(k, new Set()).get(k)).add(e.food_id);
  }
  const combos = new Map();
  for (const [k, ids] of groups) {
    if (ids.size < 2 || ids.size > 6) continue;
    const [d, m] = k.split('|');
    const key = [...ids].sort().join(',');
    const c = combos.get(key) || { ids: [...ids].sort(), n: 0, last: d, meals: {} };
    c.n++;
    if (d > c.last) c.last = d;
    c.meals[m] = (c.meals[m] || 0) + 1;
    combos.set(key, c);
  }
  return [...combos.values()].filter(c => c.n >= 2)
    .map(c => ({ ...c, meal: Object.entries(c.meals).sort((a, b) => b[1] - a[1])[0][0], names: c.ids.map(id => have.get(id).name) }))
    .sort((a, b) => (b.meals[meal] ? 1 : 0) - (a.meals[meal] ? 1 : 0) || b.n - a.n || (a.last < b.last ? 1 : -1))
    .slice(0, limit);
}

/*
  «بسته‌ها»: the meal's own packs (saved by the user: { id, name, meal, ids }), then up to `max`
  suggestions: combos eaten in this meal on two days or more that are neither a pack already
  (in any meal) nor turned down («پیشنهاد نکن»; `hidden` holds their sorted ids joined by ',').
*/
export const packKey = ids => [...ids].sort().join(',');
export function mealPacks(packs, combos, hidden, meal, max = 2) {
  const own = packs.filter(p => p.meal === meal);
  const taken = new Set([...packs.map(p => packKey(p.ids)), ...hidden]);
  const sug = combos.filter(c => (c.meals[meal] || 0) >= 2 && !taken.has(packKey(c.ids))).slice(0, max);
  return { own, sug };
}
