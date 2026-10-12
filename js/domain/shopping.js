/*
  «لیست خرید»: foods to buy. Pure functions — no DOM, no storage.

  An item is an ai_note with key `shop:<id>` (kind 'shop'):
  { id, name, amount, food_id, done, at }. `amount` is free text as it would be said in a
  shop («۲ بسته», «نیم کیلو»). `food_id` links it to the bank food of the same name, so the
  diet plan can show which of its foods are waiting to be bought. `at` orders the list.
*/
import { norm } from '../lib/fa.js';

export const shopList = notes => notes.filter(n => n.kind === 'shop' && n.data?.name).map(n => n.data)
  .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

export const toBuy = list => list.filter(i => !i.done);
export const bought = list => list.filter(i => i.done);

const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const same = (i, name, foodId) => norm(i.name) === norm(name) || (!!foodId && i.food_id === foodId);

/*
  What adding `incoming` ([{ name, amount, food_id }]) to `list` has to write: new items
  (without an id yet), and items already there that change — one bought earlier comes back,
  one still waiting takes a newly given amount. Anything already waiting as it is, is left
  out, so nothing is ever on the list twice.
*/
export function shopAdd(list, incoming, foods = [], at = new Date().toISOString()) {
  const out = [];
  for (const raw of incoming || []) {
    const name = clean(raw?.name).slice(0, 80);
    if (!name) continue;
    const amount = clean(raw?.amount).slice(0, 40);
    const food = foods.find(f => f.id === raw?.food_id) || foods.find(f => norm(f.name) === norm(name));
    if (out.some(i => same(i, name, food?.id))) continue;
    const old = list.find(i => same(i, name, food?.id));
    if (!old) out.push({ name, amount, food_id: food?.id || null, done: false, at });
    else if (old.done) out.push({ ...old, amount, done: false, at });
    else if (amount && amount !== old.amount) out.push({ ...old, amount });
  }
  return out;
}

// The items still to buy that `names` point at (for «خریدم» said in the chat).
export function shopMatch(list, names) {
  const want = (names || []).map(norm).filter(Boolean);
  return toBuy(list).filter(i => want.some(w => norm(i.name) === w || norm(i.name).includes(w) || w.includes(norm(i.name))));
}

// Bank foods waiting to be bought, by id.
export const neededFoods = list => new Set(toBuy(list).map(i => i.food_id).filter(Boolean));

// «شیر (۲ بطری)» lines, for sharing the list with someone.
export const shopText = list => toBuy(list).map(i => `▫️ ${i.name}${i.amount ? ` (${i.amount})` : ''}`).join('\n');
