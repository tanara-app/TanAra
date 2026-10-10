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
