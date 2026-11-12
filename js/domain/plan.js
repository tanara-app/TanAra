/*
  Diet-plan mode. Pure functions — no DOM, no storage.

  A plan is a fixed pattern for a two-week period: for each eating occasion (slot) a list of
  alternative options, each a small meal with set amounts, and a number to pick (1 or 2).
  Hooshvareh chooses the foods (only from the food bank) and rough amounts; the numbers are
  then computed here from the bank and each option is fitted to its calorie budget, so the
  plan never depends on the model's arithmetic.

  Stored as ai_notes: the plan under 'plan:<start day>' (kind 'plan'), and what was eaten
  from it each day under 'pick:<day>' (kind 'pick'). Eating an option writes ordinary
  entries, so calorie counting, the weekly review and the safety checks keep working.
*/
import { addDays, diffDays, iso } from '../lib/dates.js';
import { isTeen } from './targets.js';
import { isRamadan } from './occasions.js';
import { baseMeal } from './meals.js';

export const PLAN_DAYS = 14;

// share: part of the day's calories this occasion gets. meal: where its entries are logged.
export const SLOTS = {
  breakfast: { label: 'صبحانه', meal: 'breakfast', share: 0.25 },
  snack1: { label: 'میان‌وعده‌ی صبح', meal: 'snack', share: 0.10 },
  lunch: { label: 'ناهار', meal: 'lunch', share: 0.30 },
  snack2: { label: 'میان‌وعده‌ی عصر', meal: 'snack', share: 0.10 },
  dinner: { label: 'شام', meal: 'dinner', share: 0.25 },
};

// `shares`: a plan fitted to their own eating (see pattern.js) carries its own; otherwise SLOTS.
export const budgets = (kcal, shares) => Object.fromEntries(Object.entries(SLOTS).map(([k, s]) => [k, Math.round(kcal * (shares?.[k] ?? s.share))]));
const planBudgets = plan => budgets(plan.kcal, plan.shares);

const GRAM = 'گرم';
const r1 = x => Math.round(x * 10) / 10;
// Amounts people can actually measure: half units, or 5 g steps for weighed foods.
const roundQty = (qty, unit) => (unit === GRAM ? Math.max(5, Math.round(qty / 5) * 5) : Math.max(0.5, Math.round(qty * 2) / 2));

function item(food, qty) {
  const q = roundQty(qty, food.unit);
  return {
    food_id: food.id, name: food.name, unit: food.unit, qty: q,
    grams: food.unit !== GRAM && Number(food.grams) > 0 ? Math.round(q * food.grams) : null,
    kcal: Math.round(q * food.kcal), protein: r1(q * food.protein), is_veg: !!food.is_veg,
  };
}

const sum = (items, k) => items.reduce((s, i) => s + i[k], 0);
const step = unit => (unit === GRAM ? 10 : 0.5);
/*
  The most of one food an option may hold, whatever the budget: fruit up to 2 units (300 g) — two
  and a half apples at once is a lot of sugar, for a diabetic above all — and a sweet up to about
  250 kcal. Without a cap the fitting would reach a snack's budget with one food piled high.
*/
export function maxQty(food) {
  const g = food.unit === GRAM;
  if (food.category === 'fruit') return g ? 300 : 2;
  if (food.category === 'sweet' && Number(food.kcal) > 0) {
    const st = g ? 5 : 0.5;
    return Math.max(st, Math.floor(250 / food.kcal / st) * st);
  }
  return Infinity;
}
// Limits of an option's calories against its budget. Below, 85% is fine (a little less food);
// above, every occasion 15% over would eat most of the day's deficit, so the limit is 10% — or
// 25 kcal for a small snack, where one half-unit step is already more than 10%.
export const FIT_LOW = 0.85;
// The main meals, where every option must bring real protein.
const MAIN = ['breakfast', 'lunch', 'dinner'];
export const maxKcal = budget => Math.max(budget * 1.1, budget + 25);
/*
  With the target at (or near) the safety floor, 85% of every occasion's budget would be a day
  under the floor — someone eating exactly as the plan says would then get the app's own
  under-eating warning. So the main meals get a higher lower limit (`low`, per occasion), enough
  that even the smallest option of every occasion still adds up to the floor; the snacks keep
  theirs, since with half-unit steps (half a glass of milk) a small budget can't be hit closer.
  The upper limit moves up with it. Null when the floor is no question (the usual case).
  Stored with the plan as `low` (with the `floor` it came from).
*/
export function lowsFor(kcal, floor, shares) {
  if (!(Number(floor) > 0) || !(kcal > 0)) return null;
  const b = budgets(kcal, shares);
  const keys = Object.keys(b);
  const main = k => MAIN.includes(k);
  const snacks = keys.filter(k => !main(k)).reduce((t, k) => t + b[k] * FIT_LOW, 0);
  const mains = keys.filter(main).reduce((t, k) => t + b[k], 0);
  const low = mains > 0 ? (floor - snacks) / mains : 0;
  if (!(low > FIT_LOW)) return null;
  return Object.fromEntries(keys.map(k => [k, main(k) ? Math.min(1.1, low) : FIT_LOW]));
}
const lowOf = (lows, key) => lows?.[key] ?? FIT_LOW;
const highOf = (budget, low) => Math.max(maxKcal(budget), budget * (low + 0.2));
// where the fitting aims: the budget, or the middle of the band once its lower limit has risen
const aimOf = (budget, low) => (low > FIT_LOW ? (budget * low + highOf(budget, low)) / 2 : budget);
// Salad and greens barely count, so their amount is left as the model gave it.
const isFixed = food => food.is_veg && food.kcal * (food.unit === GRAM ? 100 : 1) <= 50;

/*
  One option from the model's { title, items: [{ food_id, qty }] }. Unknown foods are dropped.
  If the total is more than 10% off the budget, the amounts are scaled toward it and then
  nudged one measurable step at a time (half a unit, 10 g; or one food up and another down)
  while that gets closer — inside the limits first, then to the budget — each food
  staying between half and double its scaled share, so the meal keeps its shape. Returns null
  when it still can't get within 15% (`low`: the lower limit, see lowsFor).
*/
export function fitOption(raw, foodsById, budget, id, low = FIT_LOW) {
  const picked = (raw?.items || [])
    .map(i => ({ food: foodsById.get(i.food_id), qty: Number(i.qty) }))
    .filter(i => i.food && i.qty > 0)
    .map(i => ({ ...i, qty: Math.min(i.qty, maxQty(i.food)) }));
  if (!picked.length) return null;
  let items = picked.map(i => item(i.food, i.qty));
  let kcal = sum(items, 'kcal');
  if (!(kcal > 0)) return null;
  const aim = aimOf(budget, low);
  if (Math.abs(kcal / aim - 1) > 0.1 || kcal < budget * low || kcal > highOf(budget, low)) {
    const fixed = sum(items.filter((_, n) => isFixed(picked[n].food)), 'kcal');
    const factor = Math.max(0.1, (aim - fixed) / Math.max(1, kcal - fixed));
    const base = picked.map(i => (isFixed(i.food) ? i.qty : Math.min(i.qty * factor, maxQty(i.food))));
    const qty = base.map((q, n) => roundQty(q, picked[n].food.unit));
    const total = q => q.reduce((t, x, n) => t + x * picked[n].food.kcal, 0);
    // how bad a total is: outside the limits above all, then how far from the aim
    const lo = budget * low, hi = highOf(budget, low);
    const err = t => (t < lo ? lo - t : t > hi ? t - hi : 0) * 10 + Math.abs(t - aim);
    const can = (n, next) => {
      const f = picked[n].food;
      return !isFixed(f) && next >= step(f.unit) && next >= base[n] / 2 && next <= Math.min(Math.max(base[n] * 2, step(f.unit)), maxQty(f));
    };
    // one step of one food, or one food a step up and another a step down (coarse steps, like a
    // ladle of rice, can step right over the limits one at a time)
    const moves = [];
    qty.forEach((_, n) => { [1, -1].forEach(d => moves.push([[n, d]])); qty.forEach((__, m) => { if (m !== n) moves.push([[n, 1], [m, -1]]); }); });
    for (let guard = 0; guard < 40; guard++) {
      const now = total(qty);
      let best = null;
      for (const mv of moves) {
        const next = mv.map(([n, d]) => [n, qty[n] + d * step(picked[n].food.unit)]);
        if (!next.every(([n, q]) => can(n, q))) continue;
        const e = err(now + next.reduce((t, [n, q]) => t + (q - qty[n]) * picked[n].food.kcal, 0));
        if (!best || e < best.e) best = { next, e };
      }
      if (!best || best.e >= err(now) - 1e-9) break;
      best.next.forEach(([n, q]) => { qty[n] = q; });
    }
    items = picked.map((i, n) => item(i.food, qty[n]));
    kcal = sum(items, 'kcal');
  }
  if (kcal < budget * low || kcal > highOf(budget, low)) return null;
  return { id, title: String(raw.title || '').trim().slice(0, 60), items, kcal, protein: r1(sum(items, 'protein')) };
}

// Free to eat when hungry: a vegetable with at most 50 kcal a unit (100 g), or anything with
// next to none (unsweetened tea, water). A small unit doesn't make a food free: a sugar cube, a
// biscuit or a walnut is under 50 kcal a piece but nothing to eat freely.
export const isFree = f => {
  const per = Number(f.kcal) * (f.unit === GRAM ? 100 : 1);
  return per <= 5 || (!!f.is_veg && per <= 50);
};


/*
  Whether a fitted option may go into the plan (also used for options added later):
  - no food their medical conditions keep out (`avoid`: food id → tag or null, see
    avoidTest in health.js; it works on the foods' tags, so their own foods are checked too);
  - with kidney disease (`proteinMax`), a main meal at most 1.5 × its share of the protein limit.
  `rules`: { kcal, shares, protein, proteinMax, avoid }. (Allergies and dislikes are left to the model.)
*/
export function optionAllowed(o, key, pick, rules = {}) {
  if (rules.avoid && o.items.some(i => rules.avoid(i.food_id))) return false;
  if (rules.proteinMax && rules.protein > 0 && MAIN.includes(key)) {
    const share = budgets(rules.kcal, rules.shares)[key] / rules.kcal;
    if (o.protein > 1.5 * rules.protein * share / pick) return false;
  }
  return true;
}

export const needOf = pick => Math.max(2, pick);

/*
  The model's answer → the plan that is stored. Returns null when a slot ends up with fewer
  than two usable options (a plan without choice isn't worth saving; the caller asks again) —
  or, with `partial`, the plan anyway with those slots listed in `missing`, so only they need
  asking for again (see fillSlot).
  `protein` (the day's target): at the main meals, options with less than half of the meal's
  share of it are left out, as long as enough options remain — the options of a meal are meant
  to be interchangeable, and one with a third of the protein of the others isn't. With
  `proteinMax` (kidney disease) it is a limit instead (see optionAllowed).
  Option ids carry a mark of this plan, so a day's picks and swaps made on an earlier plan
  never land on an option of a new one made the same day.
  `floor`: the safety floor, which no day of the plan may go under (see lowsFor).
*/
export function buildPlan(raw, foods, kcal, start, shares = null, { protein = 0, proteinMax = false, partial = false, floor = 0, avoid = null } = {}) {
  const byId = new Map(foods.map(f => [f.id, f]));
  const b = budgets(kcal, shares);
  const lows = lowsFor(kcal, floor, shares);
  const rules = { kcal, shares, protein, proteinMax, avoid };
  const made = new Date().toISOString();
  const mark = Date.now().toString(36);
  const slots = {};
  const missing = [];
  for (const key of Object.keys(SLOTS)) {
    const s = raw?.slots?.[key];
    const pick = Number(s?.pick) === 2 ? 2 : 1;
    let options = (s?.options || []).map((o, i) => fitOption(o, byId, b[key] / pick, `${key}-${mark}-${i + 1}`, lowOf(lows, key)))
      .filter(o => o && optionAllowed(o, key, pick, rules));
    if (protein > 0 && !proteinMax && MAIN.includes(key)) {
      const min = 0.5 * protein * (b[key] / kcal) / pick;
      const enough = options.filter(o => o.protein >= min);
      if (enough.length >= needOf(pick)) options = enough;
    }
    if (options.length < needOf(pick)) {
      if (!partial) return null;
      missing.push(key);
    }
    slots[key] = { pick, options };
  }
  const seen = new Set();
  // «free» means free, whatever the model said
  const free = (raw?.free || []).map(f => byId.get(f.food_id))
    .filter(f => f && isFree(f) && !avoid?.(f.id) && !seen.has(f.id) && seen.add(f.id)).slice(0, 8)
    .map(f => ({ food_id: f.id, name: f.name }));
  return { start, days: PLAN_DAYS, kcal, made, slots, free, ...(lows ? { low: lows, floor } : {}), ...(shares ? { shares } : {}), ...(partial ? { missing } : {}) };
}

/*
  One more option for a slot of a plan being made (or the plan in force): the model's answer
  fitted and checked like the rest. Null when it doesn't make it.
*/
export function extraOption(raw, foods, plan, key, rules = {}, { id = `${key}-x${Date.now().toString(36)}`, budget = null } = {}) {
  const pick = plan.slots[key].pick;
  // sized to what off-plan food left (`budget`), the floor is no longer the question
  const o = fitOption(raw, new Map(foods.map(f => [f.id, f])), budget ?? planBudgets(plan)[key] / pick, id, budget == null ? lowOf(plan.low, key) : FIT_LOW);
  return o && optionAllowed(o, key, pick, { ...rules, kcal: plan.kcal, shares: plan.shares }) ? o : null;
}

/*
  The plan refitted to a new daily target without asking anyone: every option's amounts
  refitted to its new budget (same foods). Options that can't get there drop out; null when a
  slot is left without enough of them. Used when the target moves (the climb into maintenance,
  a correction, a recalculation). `rules` ({ protein, proteinMax, floor }): bigger amounts mean
  more protein, so with kidney disease the limit is checked again; and the floor sets the
  lower limits for the new target (lowsFor).
*/
export function rescalePlan(plan, kcal, foodsById, rules = {}) {
  const b = budgets(kcal, plan.shares);
  const lows = lowsFor(kcal, rules.floor, plan.shares);
  const check = { ...rules, kcal, shares: plan.shares };
  const slots = {};
  for (const [k, s] of Object.entries(plan.slots)) {
    const options = s.options.map(o => shrinkOption(o, foodsById, b[k] / s.pick, lowOf(lows, k))).filter(Boolean).map(({ fit, ...o }) => o)
      .filter(o => optionAllowed(o, k, s.pick, check));
    if (options.length < needOf(s.pick)) return null;
    slots[k] = { ...s, options };
  }
  const { low: _, floor: __, ...rest } = plan;
  return { ...rest, kcal, slots, ...(lows ? { low: lows, floor: rules.floor } : {}) };
}

// Whether an option with a food swapped in still keeps the plan's rules (conditions, the kidney protein limit).
export const swapAllowed = (option, key, plan, rules = {}) =>
  optionAllowed(option, key, plan.slots[key]?.pick || 1, { ...rules, kcal: plan.kcal, shares: plan.shares });

export const optionBudget = (plan, key) => planBudgets(plan)[key] / plan.slots[key].pick;

/* ---------------- swapping one food of an option ---------------- */

// The option with one item put in place of another: totals redone, the title following the food.
function withItem(option, index, it) {
  const old = option.items[index];
  const items = option.items.map((i, n) => (n === index ? it : i));
  const title = option.title?.includes(old.name) ? option.title.replace(old.name, it.name).slice(0, 60) : option.title;
  return { ...option, title, items, kcal: sum(items, 'kcal'), protein: r1(sum(items, 'protein')) };
}

/*
  The option with its food at `index` replaced by `food`, the rest untouched. The amount is
  worked out here: as many measurable steps of the new food as come closest to `kcal` (the
  calories of the food it replaces). Greens that barely count keep a plain serving instead.
  The replaced food's name stays on the item as `was`. Returns null when there is no such item.
*/
export function swapItem(option, index, food, kcal = option?.items?.[index]?.kcal) {
  const old = option?.items?.[index];
  if (!old || !food) return null;
  const per = Number(food.kcal);
  const plain = food.unit === old.unit ? old.qty : food.unit === GRAM ? 100 : 1;
  const qty = isFixed(food) || !(per > 0) || !(kcal > 0) ? plain : Math.min(kcal / per, food.unit === GRAM ? 1000 : 10, maxQty(food));
  const it = { ...item(food, qty), was: old.was || old.name };
  if (it.was === food.name) delete it.was;
  return withItem(option, index, it);
}

// Undoes a swap: the item at `index` as `original` (the stored option) has it.
export const restoreItem = (option, index, original) => (option?.items?.[index] && original?.items?.[index] ? withItem(option, index, original.items[index]) : null);

export const sameItems = (a, b) => a.items.length === b.items.length && a.items.every((i, n) => i.food_id === b.items[n].food_id && i.qty === b.items[n].qty);

/*
  Bank foods worth offering in place of the option's food at `index`, without asking
  Hooshvareh: same category and not already in the option; first the ones that share a word
  of the name («نان سنگک» → the other breads), then the ones logged most often.
*/
export function swapSuggestions(option, index, foods, entries, max = 5) {
  const old = foods.find(f => f.id === option?.items?.[index]?.food_id);
  if (!old) return [];
  const used = new Set(option.items.map(i => i.food_id));
  const count = new Map();
  for (const e of entries) if (e.food_id) count.set(e.food_id, (count.get(e.food_id) || 0) + 1);
  const words = f => String(f.name).split(/[\s\u200c()،]+/).filter(w => w.length > 1);
  const mine = new Set(words(old));
  const kin = f => (words(f).some(w => mine.has(w)) ? 1 : 0);
  return foods.filter(f => f.category === old.category && !used.has(f.id) && f.kcal > 0)
    .sort((a, b) => kin(b) - kin(a) || (count.get(b.id) || 0) - (count.get(a.id) || 0) || a.name.localeCompare(b.name, 'fa'))
    .slice(0, max);
}

// A day's own versions of options («فقط امروز» swaps), kept with that day's picks: { [option id]: option }.
export const swapsOn = (notes, day) => notes.find(n => n.key === `pick:${day}`)?.data?.swaps || {};

// The plan as it reads on a day: options swapped for that day only replace the stored ones.
export function dayPlan(plan, swaps) {
  if (!plan || !Object.keys(swaps || {}).length) return plan;
  const slots = Object.fromEntries(Object.entries(plan.slots).map(([k, s]) => {
    const ids = new Set(s.options.map(o => o.id));
    // options made for that day alone (fitted to what an off-plan food left) come last
    return [k, { ...s, options: [...s.options.map(o => swaps[o.id] || o), ...Object.values(swaps).filter(o => o.slot === k && !ids.has(o.id))] }];
  }));
  return { ...plan, slots };
}

/* ---------------- reading stored plans and picks ---------------- */

const plans = notes => notes.filter(n => n.kind === 'plan' && n.data?.slots).sort((a, b) => (a.data.start < b.data.start ? -1 : 1));

// The plan in force on a day: the latest one that had started by then. It stays in force
// after its two weeks until a new one is made, so nobody is left without a plan.
export function planOn(notes, day) {
  const list = plans(notes).filter(n => n.data.start <= day);
  const n = list[list.length - 1];
  return n ? { ...n.data, note: n.text, key: n.key } : null;
}
export const previousPlan = (notes, plan) => {
  const list = plans(notes).filter(n => n.data.start < plan.start);
  return list.length ? list[list.length - 1].data : null;
};

export const planEnd = plan => addDays(plan.start, plan.days - 1);
export const planDayNo = (plan, day) => diffDays(day, plan.start) + 1;
export const planOver = (plan, day) => day > planEnd(plan);

/*
  Picks of one day: { [slot]: [{ o: option id, e: [entry ids] }] }. A pick only counts
  while at least one of its entries still exists, so deleting the food from the meal list
  unticks the option.
*/
export function picksOn(notes, entries, day) {
  const data = notes.find(n => n.key === `pick:${day}`)?.data?.slots || {};
  const alive = new Set(entries.filter(e => e.day === day).map(e => e.id));
  const out = {};
  for (const [k, list] of Object.entries(data)) {
    const live = (list || []).filter(p => p.e?.some(id => alive.has(id)));
    if (live.length) out[k] = live;
  }
  return out;
}

export const plannedEntryIds = picks => new Set(Object.values(picks).flatMap(l => l.flatMap(p => p.e)));

/* ---------------- food eaten outside the plan ---------------- */

// Which occasion an off-plan entry was logged at: { [entry id]: slot }, kept with the day's picks.
export const offOn = (notes, day) => notes.find(n => n.key === `pick:${day}`)?.data?.off || {};

/*
  The day's entries that no ticked option accounts for, per occasion: { [slot]: [entries] }.
  An entry goes to the occasion whose «+» logged it (`off`) while it is still in that meal;
  otherwise to the last occasion of its meal — except a snack logged on its own day before
  3 pm, which is the morning one (both snacks log as «میان‌وعده»). On a fasting day (`fast`)
  there is no morning snack: one logged before noon was eaten at سحری, any later at افطار.
*/
const SNACK_SPLIT_HOUR = 15;
const FAST_SPLIT_HOUR = 12;
function snackSlot(e, fast) {
  const at = new Date(e.created_at);
  if (Number.isNaN(at.getTime()) || iso(at) !== e.day) return fast ? 'snack2' : null;
  if (fast) return at.getHours() < FAST_SPLIT_HOUR ? 'breakfast' : 'snack2';
  return at.getHours() < SNACK_SPLIT_HOUR ? 'snack1' : 'snack2';
}
export function slotExtras(entries, picks, off, day, { fast = false } = {}) {
  const planned = plannedEntryIds(picks);
  const keys = Object.keys(SLOTS);
  const lastOf = {};
  keys.forEach(k => { lastOf[SLOTS[k].meal] = k; });
  const out = Object.fromEntries(keys.map(k => [k, []]));
  // an afternoon snack logged as such ('snack2', meals.js) goes to the afternoon one
  entries.filter(e => e.day === day && !planned.has(e.id) && lastOf[baseMeal(e.meal)])
    .sort((x, y) => (x.created_at < y.created_at ? -1 : 1))
    .forEach(e => {
      const m = baseMeal(e.meal);
      out[SLOTS[off[e.id]]?.meal === m ? off[e.id] : e.meal === 'snack2' && !fast ? 'snack2' : (m === 'snack' && snackSlot(e, fast)) || lastOf[m]].push(e);
    });
  return out;
}

/*
  What is left of an occasion's calories once its off-plan food (`extras`), its ticked options
  and what it owes for earlier occasions (`owed`, see dayRooms) are counted. `locked`: those
  have used the occasion up (less than a tenth of its budget is left) while an option was
  still to be picked — nothing more fits there.
*/
export function slotRoom(plan, key, picks, extras, entries, owed = 0) {
  const budget = planBudgets(plan)[key];
  const mine = new Set((picks[key] || []).flatMap(p => p.e));
  const kcal = list => list.reduce((t, e) => t + (Number(e.kcal) || 0), 0);
  const eaten = Math.round(kcal(extras) + kcal(entries.filter(e => mine.has(e.id))));
  const open = (picks[key]?.length || 0) < plan.slots[key].pick;
  const left = budget - owed - eaten;
  return { budget, owed, eaten, left, extras: extras.length, locked: (extras.length > 0 || owed > 0) && open && left < budget * 0.1 };
}

// The most a later occasion gives up for food eaten over an earlier one: 30% of its budget.
// Cutting the next meals to nothing after overeating is the restrict-then-overeat cycle (and,
// on diabetes drugs like glibenclamide, a low-sugar risk); what doesn't fit is let go.
export const CARRY_MAX = 0.3;
// How far a fully picked occasion may go over its budget before the rest counts as overeating.
export const OVER_SLACK = 0.15;

// Whether overeating is taken off later occasions at all: not with a history (or doubt) of an
// eating disorder, where any making-up is advised against, and not for a teen.
export const carriesOver = (p, day) => !['yes', 'unsure'].includes(p?.edHistory) && !isTeen(p, day);

/*
  slotRoom for every occasion of a day, with what off-plan food took beyond an occasion's
  calories carried on to the ones after it: the excess is shared between the later occasions
  still to be picked, by the size of their budgets (`owed`), so no single meal pays for all of
  it, and none gives up more than CARRY_MAX of its budget. Before that, an earlier occasion
  still open (nothing or too little eaten there, and its time has gone, since a later one has
  food) takes what it has left: a skipped breakfast pays for an over-full lunch before dinner
  is cut, so the day doesn't end far under the target (`back`). An occasion eaten under its budget
  pays the debt off by that much; whatever an occasion can't absorb moves on; an occasion is
  never charged past what it has left. What the later occasions can't take falls back on
  earlier ones still to be picked (`back`), within the same limit; what is still left after
  that is dropped (`dropped`). `passed`: the calories this occasion handed on to other ones.
  With `carry` false nothing is handed on (`kept`: this occasion went over, the rest stay as they
  are). Nothing is carried to the next day.
*/
export function dayRooms(plan, picks, extras, entries, { carry = true } = {}) {
  const b = planBudgets(plan);
  const keys = Object.keys(SLOTS);
  const isOpen = k => (picks[k]?.length || 0) < plan.slots[k].pick;
  const cap = k => Math.round(b[k] * CARRY_MAX);
  const out = {};
  let debt = 0;
  keys.forEach((k, n) => {
    const open = isOpen(k);
    const share = open && debt > 0 ? Math.round(debt * b[k] / keys.slice(n).filter(isOpen).reduce((t, x) => t + b[x], 0)) : 0;
    const owed = Math.min(share, cap(k), Math.max(0, slotRoom(plan, k, picks, extras[k], entries).left));
    const r = out[k] = slotRoom(plan, k, picks, extras[k], entries, owed);
    const off = extras[k].reduce((t, e) => t + (Number(e.kcal) || 0), 0);
    // picked in full: what the off-plan food added counts, and what was eaten of the options beyond
    // OVER_SLACK of the budget (amounts changed in the log) — not an option a little over its budget
    const more = r.left >= 0 ? 0 : open ? -r.left : Math.max(Math.min(off, -r.left), -r.left - Math.round(b[k] * OVER_SLACK));
    // earlier occasions still open give what they have left first, each by how much that is
    let rest = carry ? more : 0;
    const before = keys.slice(0, n).filter(x => isOpen(x) && out[x].left > 0);
    const spare = before.reduce((t, x) => t + out[x].left, 0);
    if (rest > 0 && spare > 0) {
      const all = rest;
      before.forEach(x => {
        const take = Math.round(Math.min(out[x].left, all * out[x].left / spare));
        rest -= take;
        out[x] = { ...slotRoom(plan, x, picks, extras[x], entries, out[x].owed + take), passed: out[x].passed, kept: out[x].kept, back: (out[x].back || 0) + take };
      });
      rest = Math.max(0, rest);
    }
    debt = Math.max(0, debt - owed - (open ? 0 : Math.max(0, r.left))) + rest;
    const others = keys.some((x, m) => m !== n && isOpen(x));
    r.passed = carry && more > 0 && others ? Math.round(more) : 0;
    r.kept = !carry && more > 0 && others;
  });
  const back = keys.filter(k => isOpen(k) && out[k].left > 0 && out[k].owed < cap(k));
  const room = back.reduce((t, k) => t + Math.min(out[k].left, cap(k) - out[k].owed), 0);
  // (earlier occasions already gave all they had above; this is for later ones within the limit)
  let dropped = debt;
  if (debt > 0 && room > 0) back.forEach(k => {
    const can = Math.min(out[k].left, cap(k) - out[k].owed);
    const take = Math.round(Math.min(can, debt * can / room));
    dropped -= take;
    out[k] = { ...slotRoom(plan, k, picks, extras[k], entries, out[k].owed + take), passed: out[k].passed, kept: out[k].kept, back: (out[k].back || 0) + take };
  });
  if (dropped > 0) keys.forEach(k => { if (out[k].passed) out[k].dropped = Math.round(dropped); });
  return out;
}

/*
  The option cut down to about `kcal`: same foods, amounts refitted in measurable steps (see
  fitOption). Null when it can't get there, or a food of it has left the bank or changed unit.
*/
export function shrinkOption(option, foodsById, kcal, low = FIT_LOW) {
  if (option.items.some(i => foodsById.get(i.food_id)?.unit !== i.unit)) return null;
  const o = fitOption({ title: option.title, items: option.items.map(i => ({ food_id: i.food_id, qty: i.qty })) }, foodsById, kcal, option.id, low);
  if (!o) return null;
  o.items.forEach((i, n) => { if (option.items[n].was) i.was = option.items[n].was; });
  return { ...option, ...o, fit: true };
}

/*
  The plan as it is offered once off-plan food has taken part of an occasion, its own or an
  earlier one's excess (`rooms`: dayRooms): the options still to be picked are cut down to what
  is left, shared between the picks still open. One that can't be made that small is marked `over` — it no longer fits.
*/
export function roomPlan(plan, picks, rooms, foodsById) {
  const slots = Object.fromEntries(Object.entries(plan.slots).map(([k, s]) => {
    const r = rooms[k];
    const open = s.pick - (picks[k]?.length || 0);
    if (!(r?.extras || r?.owed) || r.locked || open <= 0) return [k, s];
    const each = r.left / open;
    const on = new Set(picks[k]?.map(p => p.o));
    return [k, { ...s, options: s.options.map(o => (on.has(o.id) || o.kcal <= maxKcal(each) ? o : shrinkOption(o, foodsById, each) || { ...o, over: true })) }];
  }));
  return { ...plan, slots };
}

// How many of the day's occasions were eaten as planned.
// (A fasting day has only its three occasions; see fastPlan.)
export function dayAdherence(plan, picks) {
  const keys = Object.keys(SLOTS).filter(k => plan.slots[k].pick > 0);
  return { done: keys.filter(k => (picks[k]?.length || 0) >= plan.slots[k].pick).length, of: keys.length };
}

/*
  Occasions eaten as planned over a range of days: only days a plan was in force and something
  was logged — a day with nothing at all (travel, a day off the app) says nothing about the plan.
*/
export function adherence(notes, entries, from, to) {
  let done = 0, of = 0;
  const days = [];
  const logged = new Set(entries.map(e => e.day));
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const plan = planOn(notes, d);
    if (!plan || !logged.has(d)) continue;
    const a = dayAdherence(fastOn(notes, d) ? fastShape(plan) : plan, picksOn(notes, entries, d));
    done += a.done; of += a.of;
    days.push({ day: d, done: a.done, of: a.of });
  }
  return { done, of, days };
}

// Bank foods added after the plan was made that it doesn't use yet.
export function newFoods(plan, foods) {
  const used = new Set(Object.values(plan.slots).flatMap(s => s.options.flatMap(o => o.items.map(i => i.food_id))));
  (plan.free || []).forEach(f => used.add(f.food_id));
  const seen = new Set(plan.seenFoods || []);
  return foods.filter(f => f.created_at > plan.made && !used.has(f.id) && !seen.has(f.id));
}

// The plan note's data with these food ids added to seenFoods (once each), so newFoods() no
// longer offers them: a «نه» on the card, or the owner sending one of their own bank foods to
// everyone's bank (it was theirs already, so it is nothing new for their plan).
export function withSeen(data, ids) {
  const seen = new Set(data.seenFoods || []);
  const add = [...new Set(ids)].filter(id => id && !seen.has(id));
  return add.length ? { ...data, seenFoods: [...seen, ...add] } : data;
}

// Foods the plan uses that have since been deleted from the bank, once each: [{ id, name }].
export function goneFoods(plan, foods) {
  const have = new Set(foods.map(f => f.id));
  const seen = new Set(plan.seenFoods || []);
  const gone = new Map();
  [...Object.values(plan.slots).flatMap(s => s.options.flatMap(o => o.items)), ...(plan.free || [])]
    .forEach(i => { if (i.food_id && !have.has(i.food_id) && !seen.has(i.food_id)) gone.set(i.food_id, i.name); });
  return [...gone].map(([id, name]) => ({ id, name }));
}

// «۲ کف‌دست نان سنگک، ۳۰ گرم پنیر» — plain text, for Hooshvareh.
/*
  How much of each food fits in `kcal` calories (what is left of an occasion) when they are
  eaten together: the calories are handed out one measurable step at a time (a quarter, then
  half units, or 5 g), always to the food with the fewest calories so far, until no step fits —
  so the foods end up with about equal calories. None goes past a sensible helping (3 units,
  400 g; `capped` when more would still have fitted). Null for a food not even a step of which
  fits. A food with no calories gets one unit (100 g), marked `free`.
*/
export function portionsFor(foods, kcal) {
  const per = foods.map(f => Number(f.kcal) || 0);
  const g = foods.map(f => f.unit === GRAM);
  const max = i => (g[i] ? 400 : 3);
  const next = i => (g[i] ? qty[i] + 5 : qty[i] < 0.5 ? qty[i] + 0.25 : qty[i] + 0.5);
  const qty = foods.map(() => 0);
  let left = kcal + 1e-9;
  const fits = i => per[i] > 0 && next(i) <= max(i) && (next(i) - qty[i]) * per[i] <= left;
  for (;;) {
    const i = foods.map((_, n) => n).filter(fits).sort((a, b) => qty[a] * per[a] - qty[b] * per[b])[0];
    if (i == null) break;
    left -= (next(i) - qty[i]) * per[i];
    qty[i] = next(i);
  }
  return foods.map((_, i) => (per[i] <= 0 ? { qty: g[i] ? 100 : 1, free: true, capped: false }
    : qty[i] > 0 ? { qty: qty[i], free: false, capped: qty[i] === max(i) && (g[i] ? 5 : 0.5) * per[i] <= left } : null));
}

export const portionFor = (food, kcal) => portionsFor([food], kcal)[0];

export const optionText = o => o.items.map(i => `${i.qty} ${i.unit} ${i.name}`).join(' + ');

/* ---------------- fasting days (Ramadan) ---------------- */

/*
  On a day they fast there are three occasions instead of five, made from the plan's own
  options with their amounts refitted: سحری from the lunch options (40% of the day, logged as
  breakfast), افطار from the breakfast options (30%, logged as a snack) and شام from the dinner
  ones (30%). The day's total stays the target. The model is told, so its breakfast options
  also work as an iftar and its lunch ones before a fast.
*/
export const FAST = {
  breakfast: { label: 'سحری', from: 'lunch', share: 0.4 },
  snack2: { label: 'افطار', from: 'breakfast', share: 0.3 },
  dinner: { label: 'شام', from: 'dinner', share: 0.3 },
};
const FAST_SHARES = Object.fromEntries(Object.keys(SLOTS).map(k => [k, FAST[k]?.share || 0]));

// The plan's slots as a fasting day counts them (no amounts), for adherence.
export function fastShape(plan) {
  const slots = Object.fromEntries(Object.keys(SLOTS).map(k => [k, FAST[k] ? { pick: plan.slots[FAST[k].from].pick, options: [] } : { pick: 0, options: [] }]));
  return { ...plan, slots, shares: FAST_SHARES, fast: true };
}

/*
  The plan as a fasting day offers it (see FAST). Options that can't be refitted drop out, and
  with kidney disease (`rules`: { protein, proteinMax }) so do those that a bigger share (سحری
  is 40% of the day, lunch 30%) takes past the protein limit for that share; and options with a
  food their conditions keep out (`rules.avoid`, a plan made before the condition was entered).
*/
export function fastPlan(plan, foodsById, rules = {}) {
  const b = budgets(plan.kcal, FAST_SHARES);
  // the plan's floor, if it had one, worked out again for three occasions
  const lows = plan.floor ? lowsFor(plan.kcal, plan.floor, FAST_SHARES) : null;
  const limit = (k, pick) => (rules.proteinMax && rules.protein > 0 ? 1.5 * rules.protein * FAST[k].share / pick : Infinity);
  const slots = Object.fromEntries(Object.keys(SLOTS).map(k => {
    const f = FAST[k];
    if (!f) return [k, { pick: 0, options: [] }];
    const from = plan.slots[f.from];
    const options = from.options.filter(o => !o.slot)
      .map(o => shrinkOption(o, foodsById, b[k] / from.pick, lowOf(lows, k))).filter(o => o && o.protein <= limit(k, from.pick) && !(rules.avoid && o.items.some(i => rules.avoid(i.food_id))))
      .map(({ fit, ...o }) => ({ ...o, fast: true }));
    return [k, { pick: from.pick, options }];
  }));
  return { ...plan, slots, shares: FAST_SHARES, fast: true, labels: Object.fromEntries(Object.entries(FAST).map(([k, f]) => [k, f.label])) };
}

// The name of an occasion on the plan as shown (a fasting day renames them).
export const slotLabel = (plan, key) => plan?.labels?.[key] || SLOTS[key].label;

/*
  Whether they fast on a day: what they said that day (kept with the day's picks as `fast`), or
  else what they last said on an earlier day of the same Ramadan. Never outside Ramadan.
*/
export function fastOn(notes, day) {
  if (!isRamadan(day)) return false;
  for (let d = day, n = 0; n < 31 && isRamadan(d); d = addDays(d, -1), n++) {
    const f = notes.find(x => x.key === `pick:${d}`)?.data?.fast;
    if (typeof f === 'boolean') return f;
  }
  return false;
}
