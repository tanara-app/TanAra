/*
  «سهم وعده», version 2 (SAHM.md, phase 3): the best plate, found by one search, in place of fitMeal's
  rules taken one after another. Pure — no DOM, no storage, no AI.

  Each food keeps fitMeal's bounds (foodBounds) and its ideal amount `t`: its usual helping scaled with
  the whole plate to the meal's calories (STRETCH, SHRINK), before rounding. A plate is judged by one
  cost (WEIGHTS):
    safety: protein past the kidney limit, carbohydrate past the diabetes limit; nothing buys it (the
      user, 2026-11-20: the protein limit comes before the meal's calories)
    calories: off the meal's band (15 over, the larger of 20 and 5% under), and lightly off the budget
      inside it, over three times under
    shape: per food, how far it is from its ideal, relatively ((ln(q/t))², a spoon and a bowl alike), and
      more past 10% of it: a natural plate a little off the calories beats an odd one on them (half a
      کفگیر of rice under three of stew); but a meal far under its share costs a great deal (calFar,
      the clinical review of 2026-11-20: meals that shrank to half)
    protein of a main meal short of its share (at most a quarter of the meal's calories, and pressed for
      only while within reach); carbohydrate inside the diabetes slack; sodium past the meal's share
  The weights were set on the golden plates (SAHM.md phases 3 and 7) and checked on held-out random
  plates. The plate of least cost is found by branch and bound over every
  measurable amount of every food: the foods that move the calories most first, each one's amounts from
  its ideal outwards, and a branch is cut when even the best the foods left can do cannot beat the best
  plate found.
*/
import { foodBounds, STRETCH, SHRINK, DROP_ORDER } from './portion.js';

export const FIT_V2 = 2;
const EPS = 1e-9;
const OVER = 15;                                   // calories over the budget a plate may go (fitMeal's TOL)
export const underBand = b => Math.max(20, 0.05 * b);
const carbSlack = c => Math.max(4, c * 0.1);       // a little past the carbohydrate share is let be (as fitMeal)
const pos = x => (x > 0 ? x : 0);
const roundTo = (x, step) => Math.round(x / step) * step;
const r2 = x => Math.round(x * 100) / 100;

export const WEIGHTS = {
  safety: 1e4,      // per gram past a limit
  outside: 0.02,    // per calorie outside the band
  calFar: 50,       // per (calories short beyond the band ÷ the budget)²: a meal must not shrink far below its share
  inside: 0.002,    // per calorie off the budget inside it (×3 over)
  protein: 0.1,     // per gram short of the meal's protein, the first 5…
  proteinFar: 0.2,  // …per gram beyond them…
  proteinFarCap: 2, // …for 2 grams: past them the goal is out of reach, and pressing on only makes plates jump
  carb: 0.03,       // per gram past the carbohydrate share, inside the slack
  sodium: 0.0014,   // per milligram past the meal's sodium
  shape: 1,         // per (ln(q/t))²
  hinge: 2.3,       // and per (|ln(q/t)| - hingeAt)² beyond hingeAt: far from its place costs much more
  hingeAt: 0.1,
  proteinPart: 0.25, // the meal's protein goal is at most this part of its calories (4 kcal a gram)
};
const CANDIDATES = 25;    // amounts tried for a food with many steps (grams), besides its least and most
const MAX_NODES = 50000;  // the search stops there with the best plate so far (about 2.5 ms on a Mac for 8 foods weighed in grams)

/*
  fitMeal's arguments and result (portion.js), and `sodiumMax` with `sodiumOf(food)` (mg in one unit):
  the meal's part of the day's sodium. Also returns `sodium` and `nodes` (how far the search went).
*/
export function fitPlate(foods, kcal, locked = {}, { proteinMax = null, proteinMin = null, usual = null, carbMax = null, carbsOf = null, sodiumMax = null, sodiumOf = null, weights = WEIGHTS, maxNodes = MAX_NODES } = {}) {
  const W = weights;
  const B = Math.max(0, Number(kcal) || 0);
  const info = foods.map((f, i) => {
    const per = Number(f.kcal) || 0;
    const { role, step, min, max, base } = foodBounds(f, usual);
    const isLocked = locked[i] != null;
    const free = per <= 0;
    const fixed = isLocked || free || role === 'drink';
    return {
      f, role, step, min, max, base, per, isLocked, free, fixed,
      p: Number(f.protein) || 0, c: carbsOf ? Number(carbsOf(f)) || 0 : 0, na: sodiumOf ? Number(sodiumOf(f)) || 0 : 0,
      e: STRETCH[role], eDown: SHRINK[role], qty: isLocked ? Number(locked[i]) : fixed ? base : 0,
    };
  });
  // beside a food that carries the meal, a vegetable keeps its usual helping; a meal of vegetables only scales them
  const carried = info.some(x => !x.fixed && x.e > 0);
  for (const x of info) {
    if (x.fixed || x.e > 0) continue;
    if (carried) { x.qty = Math.min(x.max, Math.max(x.min, roundTo(x.base, x.step))); x.fixed = true; } else { x.e = 1; x.eDown = 1; }
  }
  const flex = info.filter(x => !x.fixed);
  const fixedSum = key => info.filter(x => x.fixed).reduce((t, x) => t + x.qty * x[key], 0);
  const K0 = fixedSum('per'), P0 = fixedSum('p'), C0 = fixedSum('c'), N0 = fixedSum('na');

  // the ideal plate: fitMeal's scale, found by halving
  const clampQ = (x, q) => Math.min(x.max, Math.max(x.min, q));
  const grow = (x, s) => x.base * s ** (s >= 1 ? x.e : x.eDown);
  const room = B - K0;
  const at = s => flex.reduce((t, x) => t + clampQ(x, grow(x, s)) * x.per, 0);
  let lo = 0.02, hi = 50;
  for (let n = 0; n < 60; n++) { const mid = Math.sqrt(lo * hi); if (at(mid) > room) hi = mid; else lo = mid; }
  const s = Math.sqrt(lo * hi);
  for (const x of flex) x.t = clampQ(x, grow(x, s));

  const shapeCost = (q, t) => { const l = Math.abs(Math.log(q / t)); return W.shape * l * l + W.hinge * pos(l - W.hingeAt) ** 2; };
  // each food's amounts, nearest its ideal first
  for (const x of flex) {
    const all = [];
    for (let q = x.min; q <= x.max + EPS; q = r2(q + x.step)) all.push(r2(q));
    const dist = q => Math.abs(Math.log(q / x.t));
    all.sort((a, b) => dist(a) - dist(b) || a - b);
    // a food weighed in grams has many: the nearest CANDIDATES, and its least and most, which a limit may need
    let cands = all;
    if (all.length > CANDIDATES + 2) {
      cands = all.slice(0, CANDIDATES);
      for (const q of [x.min, x.max].map(r2)) if (!cands.includes(q)) cands.push(q);
    }
    x.cands = cands;
    x.costs = cands.map(q => shapeCost(q, x.t));
    x.qLo = Math.min(...cands); x.qHi = Math.max(...cands);
  }

  const pCap = proteinMax != null ? proteinMax + 0.5 : Infinity;
  const capCarbs = carbMax != null && !!carbsOf;
  const cCap = capCarbs ? carbMax + carbSlack(carbMax) : Infinity;
  const pGoal = proteinMin != null && proteinMax == null ? Math.min(proteinMin, W.proteinPart * B / 4) - 0.5 : null;
  const capNa = sodiumMax != null && !!sodiumOf;
  const band = underBand(B);

  // the cost of the calories, protein, carbohydrate and sodium of a plate (all but its shape)
  const calCost = d => W.outside * (d > OVER ? d - OVER : d < -band ? -band - d : 0) + W.inside * (d > 0 ? 3 * Math.min(d, OVER) : Math.min(-d, band))
    + (B > 0 && d < -band ? W.calFar * ((-band - d) / B) ** 2 : 0);
  const protCost = sh => W.protein * Math.min(sh, 5) + W.proteinFar * Math.min(pos(sh - 5), W.proteinFarCap);
  const sums = (k, p, c, na) => {
    let cost = W.safety * (pos(p - pCap) + pos(c - cCap)) + calCost(k - B);
    if (pGoal != null) cost += protCost(pos(pGoal - p));
    if (capCarbs) cost += W.carb * pos(c - carbMax);
    if (capNa) cost += W.sodium * pos(na - sodiumMax);
    return cost;
  };
  // the least that cost can be with the calories in [kLo, kHi], protein in [pLo, pHi], carbohydrate from cLo, sodium from naLo
  const bound = (kLo, kHi, pLo, pHi, cLo, naLo) => {
    const d = kLo > B ? kLo - B : kHi < B ? kHi - B : 0;
    let cost = W.safety * (pos(pLo - pCap) + pos(cLo - cCap)) + calCost(d);
    if (pGoal != null) cost += protCost(pos(pGoal - pHi));
    if (capCarbs) cost += W.carb * pos(cLo - carbMax);
    if (capNa) cost += W.sodium * pos(naLo - sodiumMax);
    return cost;
  };

  // the foods that move the calories most go first
  const order = [...flex].sort((a, b) => (b.qHi - b.qLo) * b.per - (a.qHi - a.qLo) * a.per);
  const n = order.length;
  const suffix = g => { const out = new Array(n + 1).fill(0); for (let j = n - 1; j >= 0; j--) out[j] = out[j + 1] + g(order[j]); return out; };
  const kLo = suffix(x => x.qLo * x.per), kHi = suffix(x => x.qHi * x.per);
  const pLo = suffix(x => x.qLo * x.p), pHi = suffix(x => x.qHi * x.p);
  const cLo = suffix(x => x.qLo * x.c), naLo = suffix(x => x.qLo * x.na);

  // start from the ideal rounded to each food's nearest amount
  const qs = order.map(x => x.cands[0]);
  const plateCost = q => sums(...['per', 'p', 'c', 'na'].map((key, m) => [K0, P0, C0, N0][m] + order.reduce((t, x, j) => t + q[j] * x[key], 0)))
    + order.reduce((t, x, j) => t + shapeCost(q[j], x.t), 0);
  let best = n ? plateCost(qs) : 0, bestQ = qs.slice(), nodes = 0;
  const cur = qs.slice();
  const go = (j, k, p, c, na, sh) => {
    if (++nodes > maxNodes) return;
    const lb = sh + bound(k + kLo[j], k + kHi[j], p + pLo[j], p + pHi[j], c + cLo[j], na + naLo[j]);
    if (lb >= best - 1e-12) return;
    if (j === n) { best = lb; bestQ = cur.slice(); return; }
    const x = order[j];
    for (let m = 0; m < x.cands.length; m++) {
      const v = x.cands[m];
      cur[j] = v;
      go(j + 1, k + v * x.per, p + v * x.p, c + v * x.c, na + v * x.na, sh + x.costs[m]);
    }
  };
  if (n) go(0, K0, P0, C0, N0, 0);
  order.forEach((x, j) => { x.qty = bestQ[j]; });

  // the result, as fitMeal gives it
  const sum = key => info.reduce((t, x) => t + x.qty * x[key], 0);
  const total = sum('per'), prot = sum('p'), carbs = sum('c'), sodium = sum('na');
  const over = total - B > OVER ? Math.round(total - B) : 0;
  const spare = flex.length && flex.every(x => x.qty >= x.max - EPS) ? Math.max(0, Math.round(B - total)) : 0;
  const rank = x => DROP_ORDER.indexOf(x.role);
  const cand = info.map((x, i) => ({ x, i })).filter(({ x }) => !x.free && x.per > 0 && !x.isLocked)
    .sort((a, b) => rank(a.x) - rank(b.x) || b.x.qty * b.x.per - a.x.qty * a.x.per);
  return {
    items: info.map(x => ({
      qty: x.qty, kcal: x.qty * x.per, protein: x.qty * x.p, role: x.role, free: x.free, locked: x.isLocked, step: x.step,
      atMax: !x.fixed && x.qty >= x.max - EPS, atMin: !x.fixed && x.qty <= x.min + EPS,
    })),
    total, protein: prot, carbs, sodium,
    carbOver: capCarbs && carbs > carbMax + 4.5 ? Math.round(carbs - carbMax) : 0,
    proteinShort: pGoal != null && prot < proteinMin - 4.5 ? Math.round(proteinMin - prot) : 0,
    over, spare, drop: over > 0 && foods.length > 1 ? cand.find(({ x }) => x.qty * x.per >= over - OVER)?.i ?? null : null,
    nodes,
  };
}
