/*
  How they really eat, worked out from the log so a diet plan can fit their life: how the day's
  calories spread over the meals, what they usually have at each one, and which options of the
  plan they actually pick. Pure functions; no AI, so it costs nothing.

  Only days they chose for themselves count for the spread: a day with a ticked plan option shows
  the plan's shares, not their habit. And only full days (at least two different meals, the rule
  used everywhere), since a day with just breakfast logged says nothing about the rest of it.

  The total stays the target, whatever the habit: this moves calories between meals, nothing else.
*/
import { addDays } from '../lib/dates.js';
import { SLOTS, planOn, picksOn, planEnd, fastOn } from './plan.js';

export const PATTERN = {
  WINDOW: 60,    // days looked at, ending yesterday
  MIN_DAYS: 14,  // full days of their own choosing it needs
  MAIN: [0.15, 0.45],  // limits of one of the three meals, so none stops being a meal
  SNACK: [0.07, 0.15], // limits of one snack: below this, half-unit steps can't land on the budget
  USUAL: 6,      // foods listed per meal
};

const clamp = (x, [lo, hi]) => Math.min(hi, Math.max(lo, x));

// From calories per meal to a share per occasion, inside the limits and adding up to 1.
export function sharesFrom(byMeal) {
  const total = Object.values(byMeal).reduce((a, b) => a + b, 0);
  const keys = Object.keys(SLOTS);
  const limit = k => (SLOTS[k].meal === 'snack' ? PATTERN.SNACK : PATTERN.MAIN);
  // both snacks log as «میان‌وعده», so its calories are shared between them
  const raw = Object.fromEntries(keys.map(k => [k, (byMeal[SLOTS[k].meal] || 0) / total / (SLOTS[k].meal === 'snack' ? 2 : 1)]));
  let s = Object.fromEntries(keys.map(k => [k, clamp(raw[k], limit(k))]));
  // what the limits added or took is shared by the occasions still free to move
  for (let i = 0; i < 6; i++) {
    const gap = 1 - keys.reduce((t, k) => t + s[k], 0);
    if (Math.abs(gap) < 1e-6) break;
    const free = keys.filter(k => (gap > 0 ? s[k] < limit(k)[1] : s[k] > limit(k)[0]));
    const base = free.reduce((t, k) => t + s[k], 0);
    s = Object.fromEntries(keys.map(k => [k, free.includes(k) ? clamp(s[k] + gap * s[k] / base, limit(k)) : s[k]]));
  }
  const out = Object.fromEntries(keys.map(k => [k, Math.round(s[k] * 100) / 100]));
  // rounding must not change the day's total
  out.lunch = Math.round((out.lunch + 1 - keys.reduce((t, k) => t + out[k], 0)) * 100) / 100;
  return out;
}

const median = list => [...list].sort((a, b) => a - b)[Math.floor((list.length - 1) / 2)];

/*
  { ready, days, need } while there is too little to go on, and once there is also { shares, eaten
  (per meal, of the whole day's calories), usual: { meal: [{ name, unit, qty, n }] }, foods (ids
  and names logged) }. `need`: the full days of their own still missing.
*/
export function eatingPattern(entries, notes, day) {
  const to = addDays(day, -1);
  const from = addDays(day, -PATTERN.WINDOW);
  const list = entries.filter(e => e.day >= from && e.day <= to);
  const byDay = new Map();
  for (const e of list) (byDay.get(e.day) || byDay.set(e.day, []).get(e.day)).push(e);
  const byMeal = {};
  let days = 0;
  for (const [d, es] of byDay) {
    if (new Set(es.map(e => e.meal)).size < 2) continue;
    if (Object.keys(picksOn(notes, es, d)).length) continue;
    if (fastOn(notes, d)) continue; // a fasting day says nothing about their usual meals
    days++;
    for (const e of es) byMeal[e.meal] = (byMeal[e.meal] || 0) + (Number(e.kcal) || 0);
  }
  const total = Object.values(byMeal).reduce((a, b) => a + b, 0);
  if (days < PATTERN.MIN_DAYS || !(total > 0)) return { ready: false, days, need: Math.max(1, PATTERN.MIN_DAYS - days) };

  const count = new Map();
  for (const e of list) {
    const key = `${e.meal}|${e.food_id || e.name}`;
    const c = count.get(key) || { meal: e.meal, name: e.name, unit: e.unit, qtys: [] };
    if (c.unit === e.unit) c.qtys.push(Number(e.qty) || 0);
    count.set(key, c);
  }
  const usual = {};
  for (const c of count.values()) (usual[c.meal] || (usual[c.meal] = [])).push({ name: c.name, unit: c.unit, qty: median(c.qtys), n: c.qtys.length });
  for (const m of Object.keys(usual)) usual[m] = usual[m].filter(u => u.n >= 2).sort((a, b) => b.n - a.n).slice(0, PATTERN.USUAL);

  return {
    ready: true, days, from, to, shares: sharesFrom(byMeal),
    eaten: Object.fromEntries(Object.entries(byMeal).map(([m, k]) => [m, Math.round(k / total * 100)])),
    usual,
    foods: new Set(list.flatMap(e => [e.food_id, e.name]).filter(Boolean)),
  };
}

// How often each option of the plan in force was picked: { days (with any tick), options: [{ slot, title, n }] }.
export function optionUse(notes, entries, day) {
  const plan = planOn(notes, day);
  if (!plan) return null;
  const n = new Map();
  let days = 0;
  const end = planEnd(plan) < day ? planEnd(plan) : day;
  for (let d = plan.start; d <= end; d = addDays(d, 1)) {
    const picks = picksOn(notes, entries, d);
    const ids = Object.values(picks).flatMap(l => l.map(p => p.o));
    if (ids.length) days++;
    ids.forEach(id => n.set(id, (n.get(id) || 0) + 1));
  }
  return {
    days,
    options: Object.entries(plan.slots).flatMap(([k, s]) => s.options.filter(o => !o.slot).map(o => ({ slot: SLOTS[k].label, title: o.title || o.items.map(i => i.name).join(' + '), n: n.get(o.id) || 0 }))),
  };
}

// Marks the options built on a food they have not been eating, so the plan can say so.
export function markFresh(plan, pattern) {
  if (!pattern?.ready) return plan;
  const eaten = o => o.items.every(i => i.is_veg || pattern.foods.has(i.food_id) || pattern.foods.has(i.name));
  for (const s of Object.values(plan.slots)) s.options = s.options.map(o => (eaten(o) ? o : { ...o, fresh: true }));
  return plan;
}
