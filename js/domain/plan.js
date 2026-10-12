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
import { addDays, diffDays } from '../lib/dates.js';

export const PLAN_DAYS = 14;

// share: part of the day's calories this occasion gets. meal: where its entries are logged.
export const SLOTS = {
  breakfast: { label: 'صبحانه', meal: 'breakfast', share: 0.25 },
  snack1: { label: 'میان‌وعده‌ی صبح', meal: 'snack', share: 0.10 },
  lunch: { label: 'ناهار', meal: 'lunch', share: 0.30 },
  snack2: { label: 'میان‌وعده‌ی عصر', meal: 'snack', share: 0.10 },
  dinner: { label: 'شام', meal: 'dinner', share: 0.25 },
};

export const budgets = kcal => Object.fromEntries(Object.entries(SLOTS).map(([k, s]) => [k, Math.round(kcal * s.share)]));

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
// Salad and greens barely count, so their amount is left as the model gave it.
const isFixed = food => food.is_veg && food.kcal * (food.unit === GRAM ? 100 : 1) <= 50;

/*
  One option from the model's { title, items: [{ food_id, qty }] }. Unknown foods are dropped.
  If the total is more than 10% off the budget, the amounts are scaled toward it and then
  nudged one measurable step at a time (half a unit, 10 g) while that gets closer — each food
  staying between half and double its scaled share, so the meal keeps its shape. Returns null
  when it still can't get within 15%.
*/
export function fitOption(raw, foodsById, budget, id) {
  const picked = (raw?.items || [])
    .map(i => ({ food: foodsById.get(i.food_id), qty: Number(i.qty) }))
    .filter(i => i.food && i.qty > 0);
  if (!picked.length) return null;
  let items = picked.map(i => item(i.food, i.qty));
  let kcal = sum(items, 'kcal');
  if (!(kcal > 0)) return null;
  if (Math.abs(kcal / budget - 1) > 0.1) {
    const fixed = sum(items.filter((_, n) => isFixed(picked[n].food)), 'kcal');
    const factor = Math.max(0.1, (budget - fixed) / Math.max(1, kcal - fixed));
    const base = picked.map(i => (isFixed(i.food) ? i.qty : i.qty * factor));
    const qty = base.map((q, n) => roundQty(q, picked[n].food.unit));
    const total = q => q.reduce((t, x, n) => t + x * picked[n].food.kcal, 0);
    for (let guard = 0; guard < 40; guard++) {
      let best = null;
      qty.forEach((q, n) => {
        const f = picked[n].food;
        if (isFixed(f)) return;
        for (const d of [step(f.unit), -step(f.unit)]) {
          const next = q + d;
          if (next < step(f.unit) || next < base[n] / 2 || next > Math.max(base[n] * 2, step(f.unit))) continue;
          const err = Math.abs(total(qty) + d * f.kcal - budget);
          if (!best || err < best.err) best = { n, next, err };
        }
      });
      if (!best || best.err >= Math.abs(total(qty) - budget)) break;
      qty[best.n] = best.next;
    }
    items = picked.map((i, n) => item(i.food, qty[n]));
    kcal = sum(items, 'kcal');
  }
  if (kcal / budget < 0.85 || kcal / budget > 1.15) return null;
  return { id, title: String(raw.title || '').trim().slice(0, 60), items, kcal, protein: r1(sum(items, 'protein')) };
}

/*
  The model's answer → the plan that is stored. Returns null when a slot ends up with fewer
  than two usable options (a plan without choice isn't worth saving; the caller asks again).
*/
export function buildPlan(raw, foods, kcal, start) {
  const byId = new Map(foods.map(f => [f.id, f]));
  const b = budgets(kcal);
  const slots = {};
  for (const key of Object.keys(SLOTS)) {
    const s = raw?.slots?.[key];
    const pick = Number(s?.pick) === 2 ? 2 : 1;
    const options = (s?.options || []).map((o, i) => fitOption(o, byId, b[key] / pick, `${key}-${i + 1}`)).filter(Boolean);
    if (options.length < Math.max(2, pick)) return null;
    slots[key] = { pick, options };
  }
  const seen = new Set();
  // «free» means free: anything with real calories in a unit is left out, whatever the model said
  const free = (raw?.free || []).map(f => byId.get(f.food_id))
    .filter(f => f && f.kcal * (f.unit === GRAM ? 100 : 1) <= 50 && !seen.has(f.id) && seen.add(f.id)).slice(0, 8)
    .map(f => ({ food_id: f.id, name: f.name }));
  return { start, days: PLAN_DAYS, kcal, made: new Date().toISOString(), slots, free };
}

export const optionBudget = (plan, key) => budgets(plan.kcal)[key] / plan.slots[key].pick;

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
  const qty = isFixed(food) || !(per > 0) || !(kcal > 0) ? plain : Math.min(kcal / per, food.unit === GRAM ? 1000 : 10);
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
  otherwise to the last occasion of its meal (both snacks log as «میان‌وعده»).
*/
export function slotExtras(entries, picks, off, day) {
  const planned = plannedEntryIds(picks);
  const keys = Object.keys(SLOTS);
  const lastOf = {};
  keys.forEach(k => { lastOf[SLOTS[k].meal] = k; });
  const out = Object.fromEntries(keys.map(k => [k, []]));
  entries.filter(e => e.day === day && !planned.has(e.id) && lastOf[e.meal])
    .sort((x, y) => (x.created_at < y.created_at ? -1 : 1))
    .forEach(e => out[SLOTS[off[e.id]]?.meal === e.meal ? off[e.id] : lastOf[e.meal]].push(e));
  return out;
}

/*
  What is left of an occasion's calories once its off-plan food (`extras`) and its ticked
  options are counted. `locked`: off-plan food has used the occasion up (less than a tenth of
  its budget is left) while an option was still to be picked — nothing more fits there.
*/
export function slotRoom(plan, key, picks, extras, entries) {
  const budget = budgets(plan.kcal)[key];
  const mine = new Set((picks[key] || []).flatMap(p => p.e));
  const kcal = list => list.reduce((t, e) => t + (Number(e.kcal) || 0), 0);
  const eaten = Math.round(kcal(extras) + kcal(entries.filter(e => mine.has(e.id))));
  const open = (picks[key]?.length || 0) < plan.slots[key].pick;
  return { budget, eaten, left: budget - eaten, extras: extras.length, locked: extras.length > 0 && open && budget - eaten < budget * 0.1 };
}

/*
  The option cut down to about `kcal`: same foods, amounts refitted in measurable steps (see
  fitOption). Null when it can't get there, or a food of it has left the bank or changed unit.
*/
export function shrinkOption(option, foodsById, kcal) {
  if (option.items.some(i => foodsById.get(i.food_id)?.unit !== i.unit)) return null;
  const o = fitOption({ title: option.title, items: option.items.map(i => ({ food_id: i.food_id, qty: i.qty })) }, foodsById, kcal, option.id);
  if (!o) return null;
  o.items.forEach((i, n) => { if (option.items[n].was) i.was = option.items[n].was; });
  return { ...option, ...o, fit: true };
}

/*
  The plan as it is offered once off-plan food has taken part of an occasion (`rooms`: slotRoom
  per slot): the options still to be picked are cut down to what is left, shared between the
  picks still open. One that can't be made that small is marked `over` — it no longer fits.
*/
export function roomPlan(plan, picks, rooms, foodsById) {
  const slots = Object.fromEntries(Object.entries(plan.slots).map(([k, s]) => {
    const r = rooms[k];
    const open = s.pick - (picks[k]?.length || 0);
    if (!r?.extras || r.locked || open <= 0) return [k, s];
    const each = r.left / open;
    const on = new Set(picks[k]?.map(p => p.o));
    return [k, { ...s, options: s.options.map(o => (on.has(o.id) || o.kcal <= each * 1.15 ? o : shrinkOption(o, foodsById, each) || { ...o, over: true })) }];
  }));
  return { ...plan, slots };
}

// How many of the day's occasions were eaten as planned.
export function dayAdherence(plan, picks) {
  const keys = Object.keys(SLOTS);
  return { done: keys.filter(k => (picks[k]?.length || 0) >= plan.slots[k].pick).length, of: keys.length };
}

// Occasions eaten as planned over a range of days (only days a plan was in force).
export function adherence(notes, entries, from, to) {
  let done = 0, of = 0;
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const plan = planOn(notes, d);
    if (!plan) continue;
    const a = dayAdherence(plan, picksOn(notes, entries, d));
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

// «۲ کف‌دست نان سنگک، ۳۰ گرم پنیر» — plain text, for Hooshvareh.
export const optionText = o => o.items.map(i => `${i.qty} ${i.unit} ${i.name}`).join(' + ');
