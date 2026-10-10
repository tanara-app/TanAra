// Aggregations over entries and weights. Pure functions.
import { addDays, weekStart, diffDays, range, parse } from '../lib/dates.js';

export const MEALS = {
  breakfast: 'صبحانه',
  lunch: 'ناهار',
  dinner: 'شام',
  snack: 'میان‌وعده',
};

export function entriesOn(entries, day) {
  return entries.filter(e => e.day === day);
}

export function totals(list) {
  let kcal = 0, protein = 0, veg = 0;
  for (const e of list) {
    kcal += Number(e.kcal) || 0;
    protein += Number(e.protein) || 0;
    if (e.is_veg) veg += vegServings(e);
  }
  return { kcal, protein, veg };
}

// One vegetable serving is ~80 g (the WHO / «5 a day» portion), so weighed entries count by weight.
export const VEG_SERVING_G = 80;
export const vegServings = e => (e.unit === 'گرم' ? (Number(e.qty) || 0) / VEG_SERVING_G : Number(e.qty) || 1);

export function daysLoggedInWeek(entries, ws) {
  const end = addDays(ws, 6);
  return new Set(entries.filter(e => e.day >= ws && e.day <= end).map(e => e.day)).size;
}

export const sortedWeights = weights => [...weights].sort((a, b) => (a.day < b.day ? -1 : 1));

// Trailing 7-day mean of whatever weigh-ins exist in [day-6, day].
export function rollingAvg(sorted, day, span = 7) {
  const from = addDays(day, -(span - 1));
  const w = sorted.filter(x => x.day >= from && x.day <= day);
  if (!w.length) return null;
  return w.reduce((s, x) => s + Number(x.kg), 0) / w.length;
}

export function weekAvg(sorted, ws) {
  const end = addDays(ws, 6);
  const w = sorted.filter(x => x.day >= ws && x.day <= end);
  if (!w.length) return null;
  return { avg: w.reduce((s, x) => s + Number(x.kg), 0) / w.length, n: w.length };
}

// kg per week over the last 28 days, by least squares. Needs ≥2 weigh-ins spanning ≥7 days.
export function rate4w(sorted, day) {
  const from = addDays(day, -27);
  const w = sorted.filter(x => x.day >= from && x.day <= day);
  if (w.length < 2 || diffDays(w[w.length - 1].day, w[0].day) < 7) return null;
  const xs = w.map(x => diffDays(x.day, from));
  const ys = w.map(x => Number(x.kg));
  const mx = xs.reduce((a, b) => a + b) / xs.length;
  const my = ys.reduce((a, b) => a + b) / ys.length;
  let num = 0, den = 0;
  xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
  return den ? (num / den) * 7 : null;
}

// Where the weight trend lands on a future day: the 7-day average (or last weigh-in)
// carried forward at the 4-week rate. kg is missing when there isn't enough data.
export function projectWeight(sorted, from, to) {
  const base = rollingAvg(sorted, from) ?? (sorted.length ? Number(sorted[sorted.length - 1].kg) : null);
  if (base === null) return { base: null, rate: null };
  const rate = rate4w(sorted, from);
  if (rate === null) return { base, rate: null };
  return { base, rate, kg: base + rate * diffDays(to, from) / 7 };
}

export function weekSummary(entries, weights, ws) {
  const end = addDays(ws, 6);
  const inWeek = entries.filter(e => e.day >= ws && e.day <= end);
  const days = [...new Set(inWeek.map(e => e.day))];
  const t = totals(inWeek);
  const sorted = sortedWeights(weights);
  const cur = weekAvg(sorted, ws);
  const prev = weekAvg(sorted, addDays(ws, -7));
  return {
    daysLogged: days.length,
    avgKcal: days.length ? t.kcal / days.length : null,
    avgProtein: days.length ? t.protein / days.length : null,
    weightAvg: cur?.avg ?? null,
    weightChange: cur && prev ? cur.avg - prev.avg : null,
  };
}

/*
  Waist: measured now and then (every week or two), in cm at the level of the navel. The
  value from the questionnaire counts as the first point, on the start day, unless that day
  was measured again. Weight can stand still for weeks while the waist keeps shrinking.
*/
export function waistSeries(waists, p) {
  const list = [...(waists || [])].map(w => ({ day: w.day, cm: Number(w.cm) }));
  if (Number(p?.waistCm) > 0 && p.startDate && !list.some(w => w.day === p.startDate)) list.push({ day: p.startDate, cm: Number(p.waistCm) });
  return list.sort((a, b) => (a.day < b.day ? -1 : 1));
}

// Waist ÷ height. Under 0.5 is the widely used healthy mark (e.g. NICE, 2022).
export const WHTR_GOAL = 0.5;
export const waistToHeight = (cm, heightCm) => (cm > 0 && heightCm > 0 ? cm / heightCm : null);

// Most-logged foods of one meal in the last 60 days, with the amount used last time in that meal.
export function frequentFoods(entries, foods, day, meal, limit = 6) {
  const from = addDays(day, -60);
  const byId = new Map(foods.map(f => [f.id, f]));
  const stats = new Map();
  for (const e of entries) {
    if (!e.food_id || e.meal !== meal || e.day < from || !byId.has(e.food_id)) continue;
    const s = stats.get(e.food_id) || { n: 0, last: null };
    s.n++;
    if (!s.last || e.created_at >= s.last.created_at) s.last = e;
    stats.set(e.food_id, s);
  }
  return [...stats.entries()]
    .sort((a, b) => b[1].n - a[1].n || (a[1].last.created_at < b[1].last.created_at ? 1 : -1))
    .slice(0, limit)
    .map(([id, s]) => ({ food: byId.get(id), last: amountOf(s.last, byId.get(id)), n: s.n }));
}

// The amount to start from: { qty, grams } — grams true when it was weighed. Only amounts in
// the food's current unit (or grams) carry over; after a unit change it starts at 1.
function amountOf(e, food) {
  if (!e) return { qty: 1, grams: false };
  if (e.unit === 'گرم' && food.unit !== 'گرم') return { qty: Number(e.qty), grams: true };
  if (e.unit === food.unit) return { qty: Number(e.qty), grams: false };
  return { qty: 1, grams: false };
}

export function lastAmountFor(entries, food, meal) {
  let best = null, bestMeal = null;
  for (const e of entries) {
    if (e.food_id !== food.id) continue;
    if (!best || e.created_at > best.created_at) best = e;
    if (e.meal === meal && (!bestMeal || e.created_at > bestMeal.created_at)) bestMeal = e;
  }
  return amountOf(bestMeal || best, food);
}

export { weekStart, range, parse };
