/*
  The scorecard of «سهم وعده» (SAHM.md, phase 0's measures, phase 2's tool). Pure: give it a fitting
  function with fitMeal's shape, `fit(foods, kcal, locked, options)`, and it returns one number per
  measure, plus the failing cases for each.

  Every golden plate (plates.js) is fitted at five sizes of its usual plate (SIZES) under four
  conditions (CONDITIONS), with the options the app would give that meal on a reference day
  (optionsFor, as in today.js budgetFor). An exhaustive search (`exists`) tells whether a plate that
  meets a measure was possible at all, inside each food's own bounds (foodBounds) and in measurable
  steps: a measure is only held against the answer when it was. A measure gives way to the ones above
  it (SAHM.md): the search for a good-protein plate also keeps to the calories and the safety limits
  when those were possible. Random plates add to the measures any plate must meet (steps, bounds,
  growing with the meal, calm under a few calories, speed).
*/
import { SEED_FOODS } from '../../js/data/seedFoods.js';
import { NUTR } from '../../js/data/nutrients.js';
import { foodBounds, MEAL_SHARES5 } from '../../js/domain/portion.js';
import { carbLimit } from '../../js/domain/nutrients.js';
import { PLATES, PERSONAL, plateFoods } from './plates.js';

const SEED = new Map(SEED_FOODS.map(f => [f.name, { ...f, id: f.name }]));
export function food(name) {
  const f = SEED.get(name);
  if (!f) throw new Error(`no starter food ${name}`);
  return f;
}
const carbsOf = f => (NUTR[f.name] || [0, 0])[0];
const sodiumOf = f => (NUTR[f.name] || [0, 0])[1];

// A reference day: an adult of a 65 kg reference weight (targets.js: 1.4 g/kg protein, 0.8 g/kg with
// reduced kidney function), 2000 mg of sodium (WHO).
export const DAY = { protein: 91, kidneyProtein: 52, sodium: 2000 };
const MAIN = new Set(['breakfast', 'lunch', 'dinner']);
export const SIZES = [0.6, 0.8, 1, 1.25, 1.6];
export const CONDITIONS = ['none', 'diabetes', 'kidney', 'bp'];
const EPS = 1e-6;

// The options the app gives a meal (today.js budgetFor); sodiumMax and sodiumOf for an algorithm that uses them.
export function optionsFor(meal, cond, budget) {
  const share = MEAL_SHARES5[meal] || 0.1;
  return {
    proteinMin: cond !== 'kidney' && MAIN.has(meal) ? Math.min(40, Math.max(15, Math.round(DAY.protein * share))) : null,
    proteinMax: cond === 'kidney' ? Math.round(DAY.kidneyProtein * share) : null,
    carbMax: cond === 'diabetes' ? carbLimit(budget) : null,
    carbsOf,
    sodiumMax: cond === 'bp' ? Math.round(DAY.sodium * share) : null,
    sodiumOf,
  };
}

const tolOf = budget => Math.max(20, 0.05 * budget);
const carbSlack = cMax => Math.max(4, cMax * 0.1);
const fixedOf = (f, b) => !(Number(f.kcal) > 0) || b.role === 'drink';
const dense = f => Number(f.kcal) > 0 && (Number(f.protein) || 0) * 4 / Number(f.kcal) >= 0.15;

/*
  Each food's bounds and the amounts it may take: one for a drink or a food with no calories, and one
  for a vegetable beside a food that carries the meal, which keeps its usual helping (the app's rule
  since the user's complaint of 2026-11-13: a salad never fills the calories left). `sane`: the
  plate's realistic ranges, kept too when a measure below realism is searched.
*/
function itemsOf(foods, usual = null, sane = null) {
  const bs = foods.map(f => foodBounds(f, usual));
  const carried = foods.some((f, i) => !fixedOf(f, bs[i]) && bs[i].role !== 'veg');
  return foods.map((f, i) => {
    const b = bs[i];
    let vals = [];
    if (fixedOf(f, b)) vals.push(b.base);
    else if (carried && b.role === 'veg') vals.push(Math.min(b.max, Math.max(b.min, Math.round(b.base / b.step) * b.step)));
    else for (let q = b.min; q <= b.max + EPS; q = Math.round((q + b.step) * 1000) / 1000) vals.push(q);
    const r = sane?.[f.name];
    if (r) { const kept = vals.filter(q => q >= r[0] - EPS && q <= r[1] + EPS); if (kept.length) vals = kept; }
    return { f, b, vals, k: Number(f.kcal) || 0, p: Number(f.protein) || 0, c: carbsOf(f), na: sodiumOf(f) };
  });
}

/*
  Is there a plate, each food at one of its amounts, with calories in [lo, hi], protein at most pMax
  and at least pMin, carbohydrate at most cMax and sodium at most naMax? Depth first, cut wherever
  what is left cannot reach or cannot help passing a limit.
*/
export function exists(items, { lo = -Infinity, hi = Infinity, pMax = null, pMin = null, cMax = null, naMax = null }) {
  const order = [...items].sort((a, b) => (b.vals.at(-1) - b.vals[0]) * b.k - (a.vals.at(-1) - a.vals[0]) * a.k);
  const n = order.length;
  const suffix = g => { const s = new Array(n + 1).fill(0); for (let i = n - 1; i >= 0; i--) s[i] = s[i + 1] + g(order[i]); return s; };
  const kLo = suffix(x => x.vals[0] * x.k), kHi = suffix(x => x.vals.at(-1) * x.k);
  const pLo = suffix(x => x.vals[0] * x.p), pHi = suffix(x => x.vals.at(-1) * x.p);
  const cLo = suffix(x => x.vals[0] * x.c), naLo = suffix(x => x.vals[0] * x.na);
  const go = (i, k, p, c, na) => {
    if (k + kLo[i] > hi + EPS || k + kHi[i] < lo - EPS) return false;
    if (pMax != null && p + pLo[i] > pMax + EPS) return false;
    if (pMin != null && p + pHi[i] < pMin - EPS) return false;
    if (cMax != null && c + cLo[i] > cMax + EPS) return false;
    if (naMax != null && na + naLo[i] > naMax + EPS) return false;
    if (i === n) return true;
    const x = order[i];
    for (const v of x.vals) if (go(i + 1, k + v * x.k, p + v * x.p, c + v * x.c, na + v * x.na)) return true;
    return false;
  };
  return go(0, 0, 0, 0, 0);
}

const sumOf = (items, qs, key) => items.reduce((t, x, i) => t + qs[i] * x[key], 0);
const fmt = (foods, qs) => foods.map((f, i) => `${f.name} ${qs[i]}`).join('، ');

// time a call, in milliseconds
const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
function timed(fit, times, ...args) {
  const t = clock();
  const r = fit(...args);
  times.push(clock() - t);
  return r;
}

// the golden cases: plate × size × condition
export function goldenCases() {
  const out = [];
  for (const p of PLATES) {
    const foods = plateFoods(p).map(food);
    const typical = itemsOf(foods).reduce((t, x) => t + x.b.base * x.k, 0);
    for (const size of SIZES) {
      const budget = Math.round(typical * size);
      for (const cond of CONDITIONS) out.push({ id: `${p.id}@${size}/${cond}`, plate: p, foods, meal: p.meal, budget, cond, opts: optionsFor(p.meal, cond, budget) });
    }
  }
  return out;
}

// random plates of starter foods, the same every run
export function randomCases(n = 300, seed = 42) {
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const all = [...SEED.values()];
  const meals = Object.keys(MEAL_SHARES5);
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = 2 + Math.floor(rnd() * 4);
    const foods = [];
    while (foods.length < k) { const f = all[Math.floor(rnd() * all.length)]; if (!foods.includes(f)) foods.push(f); }
    const meal = meals[Math.floor(rnd() * meals.length)];
    const cond = CONDITIONS[Math.floor(rnd() * CONDITIONS.length)];
    const budget = 150 + 10 * Math.floor(rnd() * 86);
    out.push({ id: `random${i}/${cond}`, foods, meal, budget, cond, opts: optionsFor(meal, cond, budget) });
  }
  return out;
}

const pct = (a, b) => (b ? Math.round(1000 * a / b) / 10 : null);
const tally = () => ({ n: 0, ok: 0, fails: [] });
const mark = (t, ok, why) => { t.n++; if (ok) t.ok++; else if (t.fails.length < 400) t.fails.push(why); };

/*
  The scorecard. `fit`: fitMeal or a newer one. Returns { measure: { n, ok, pct, fails } } for
  safety (n = cases with a limit that could be kept, ok = kept), calories, measurable, bounds,
  realism, pairs, protein, sodium, personal, monotonic, smooth; `calorieError` (mean % off the
  budget where it could be met), and `speed` (ms per plate here: median, p95, max).
*/
export function scorecard(fit, { random = 300 } = {}) {
  const m = {
    safety: tally(), calories: tally(), measurable: tally(), bounds: tally(), realism: tally(), pairs: tally(),
    protein: tally(), sodium: tally(), personal: tally(), monotonic: tally(), smooth: tally(),
  };
  const times = [];
  let errSum = 0, errN = 0;
  const qtys = (c, budget) => timed(fit, times, c.foods, budget, {}, { ...c.opts, ...(c.cond === 'diabetes' ? { carbMax: carbLimit(budget) } : {}) }).items.map(it => it.qty);

  // steps, bounds, growing with the meal, calm under a few calories: for every case
  const structural = (c, items, qs) => {
    items.forEach((x, i) => {
      const q = qs[i];
      const fixed = fixedOf(x.f, x.b);
      mark(m.measurable, fixed || Math.abs(q / x.b.step - Math.round(q / x.b.step)) < EPS, `${c.id}: ${x.f.name} ${q} (قدم ${x.b.step})`);
      mark(m.bounds, fixed ? Math.abs(q - x.b.base) < EPS : q >= x.b.min - EPS && q <= x.b.max + EPS, `${c.id}: ${x.f.name} ${q} (${x.b.min} تا ${x.b.max})`);
    });
    const up = qtys(c, c.budget + 50);
    items.forEach((x, i) => {
      if (!['main', 'starch', 'protein'].includes(x.b.role)) return;
      mark(m.monotonic, up[i] >= qs[i] - EPS, `${c.id}: ${x.f.name} ${qs[i]} → ${up[i]} با ۵۰ کالری بیشتر`);
    });
    for (const d of [-10, 10]) {
      const near = qtys(c, c.budget + d);
      mark(m.smooth, items.every((x, i) => Math.abs(near[i] - qs[i]) <= x.b.step + EPS), `${c.id}: ${d > 0 ? '+' : ''}${d} کالری: ${fmt(c.foods, qs)} → ${fmt(c.foods, near)}`);
    }
  };

  for (const c of goldenCases()) {
    const items = itemsOf(c.foods);
    const qs = qtys(c, c.budget);
    structural(c, items, qs);
    const o = c.opts;
    const kcal = sumOf(items, qs, 'k'), prot = sumOf(items, qs, 'p'), carbs = sumOf(items, qs, 'c'), na = sumOf(items, qs, 'na');
    const tol = tolOf(c.budget);
    const leastP = sumOf(items, items.map(x => x.vals[0]), 'p'), leastC = sumOf(items, items.map(x => x.vals[0]), 'c');

    // 1. safety: only where the least plate keeps the limit
    const lim = {};
    if (o.proteinMax != null && leastP <= o.proteinMax + 0.5 + EPS) lim.pMax = o.proteinMax + 0.5;
    if (o.carbMax != null && leastC <= o.carbMax + carbSlack(o.carbMax) + EPS) lim.cMax = o.carbMax + carbSlack(o.carbMax);
    if (lim.pMax != null) mark(m.safety, prot <= lim.pMax + EPS, `${c.id}: پروتئین ${prot.toFixed(1)} از سقف ${o.proteinMax} (${fmt(c.foods, qs)})`);
    if (lim.cMax != null) mark(m.safety, carbs <= lim.cMax + EPS, `${c.id}: کربوهیدرات ${carbs.toFixed(0)} از سقف ${o.carbMax} (${fmt(c.foods, qs)})`);

    // 2. calories, inside the safety limits
    const cal = { lo: c.budget - tol, hi: c.budget + tol };
    const calOk = exists(items, { ...lim, ...cal });
    if (calOk) {
      mark(m.calories, Math.abs(kcal - c.budget) <= tol + EPS, `${c.id}: ${Math.round(kcal)} از ${c.budget} کالری (${fmt(c.foods, qs)})`);
      errSum += Math.abs(kcal - c.budget) / c.budget; errN++;
    }
    const above = { ...lim, ...(calOk ? cal : {}) };

    // 5. realism: each food in its sane range, and the pairs in theirs (one condition is enough: 'none')
    if (c.cond === 'none') {
      const idx = new Map(c.foods.map((f, i) => [f.name, i]));
      for (const [name, [a, b]] of Object.entries(c.plate.sane)) {
        const q = qs[idx.get(name)];
        mark(m.realism, q >= a - EPS && q <= b + EPS, `${c.id}: ${name} ${q} (${a} تا ${b})`);
      }
      for (const [x, y, a, b] of c.plate.pairs) {
        const r = qs[idx.get(x)] / qs[idx.get(y)];
        mark(m.pairs, r >= a - EPS && r <= b + EPS, `${c.id}: ${x} ÷ ${y} = ${r.toFixed(2)} (${a} تا ${b})`);
      }
    }

    // 6. protein of a main meal with a protein-rich food
    // below realism: the search keeps to the plate's realistic ranges too
    const real = itemsOf(c.foods, null, c.plate.sane);
    let protAbove = above;
    if (o.proteinMin != null && c.foods.some(dense)) {
      const want = o.proteinMin - 5;
      if (exists(real, { ...above, pMin: want })) {
        mark(m.protein, prot >= want - EPS, `${c.id}: پروتئین ${prot.toFixed(1)} از ${o.proteinMin} (${fmt(c.foods, qs)})`);
        protAbove = { ...above, pMin: want };
      }
    }

    // 7. sodium with high blood pressure (heart, kidney)
    if (o.sodiumMax != null && exists(real, { ...protAbove, naMax: o.sodiumMax })) {
      mark(m.sodium, na <= o.sodiumMax + EPS, `${c.id}: سدیم ${Math.round(na)} از ${o.sodiumMax} میلی‌گرم (${fmt(c.foods, qs)})`);
    }
  }

  for (const c of randomCases(random)) structural(c, itemsOf(c.foods), qtys(c, c.budget));

  // 8. their own usual plate, at its own calories, comes back as it is
  for (const p of PERSONAL) {
    const foods = Object.keys(p.usual).map(food);
    const usual = new Map(Object.entries(p.usual));
    const items = itemsOf(foods, usual);
    const budget = Math.round(items.reduce((t, x) => t + x.b.base * x.k, 0));
    const qs = timed(fit, times, foods, budget, {}, { usual }).items.map(it => it.qty);
    foods.forEach((f, i) => mark(m.personal, Math.abs(qs[i] - p.usual[f.name]) < EPS, `${p.id}: ${f.name} ${qs[i]}، معمولش ${p.usual[f.name]}`));
  }

  for (const k of Object.keys(m)) m[k].pct = pct(m[k].ok, m[k].n);
  times.sort((a, b) => a - b);
  const at = q => Math.round(times[Math.min(times.length - 1, Math.floor(q * times.length))] * 100) / 100;
  return { ...m, calorieError: errN ? Math.round(1000 * errSum / errN) / 10 : null, speed: { median: at(0.5), p95: at(0.95), max: at(1), n: times.length } };
}
