/*
  Simulated people whose real energy use is known, to judge «مصرف واقعی بدن» (energy.js).
  Used by tools/energy-eval.mjs (the scorecard) and tests/energy.test.js (its floors).

  Each person: a body (sex, age, height, BMI 22–42), an activity level, and a true daily energy use
  that is the formula's figure × (1 ± 12% as one SD, or `spread`). They eat their target with a 25% day-to-day
  swing, their weight follows the energy balance with a kg worth this body's figure ± 7%, and every
  weigh-in is off by a body's day-to-day swing (0.4–1% of the weight: water, food in the gut, the
  time of day). They log `logged` of the days fully, all of it a steady 85–100% of what they ate
  (what they log is what the target is in, so the right answer is the true use × that share).
  `partial` of the logged days miss a meal (60% of the day logged) but still count as full.
*/
import { measuredTdee, kcalPerKg } from '../js/domain/energy.js';
import { computeTargets } from '../js/domain/targets.js';
import { addDays } from '../js/lib/dates.js';

const START = '2026-01-05';
const ACTS = ['sedentary', 'light', 'moderate', 'active'];

// a small seeded generator, so every run gives the same people
export function rng(seed = 1) {
  let s = seed >>> 0;
  const u = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const n = () => Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
  return { u, n, between: (a, b) => a + (b - a) * u(), pick: a => a[Math.floor(u() * a.length)] };
}

export function person(r, { spread = 0.12, logged = 0.75, partial = 0, every = [7, 9], days = 49 } = {}) {
  const sex = r.u() < 0.5 ? 'male' : 'female';
  const age = Math.round(r.between(18, 65));
  const heightCm = Math.round(sex === 'male' ? 176 + 7 * r.n() : 162 + 6 * r.n());
  const kg0 = r.between(22, 42) * (heightCm / 100) ** 2;
  const activity = r.pick(ACTS);
  const p = { sex, age, heightCm, activity, startDate: START };
  const formula = computeTargets({ ...p, weightKg: kg0 }).tdee;
  const tdee = formula * (1 + spread * r.n());
  const eats = tdee - r.between(0, 800);              // their own target: maintenance down to a big deficit
  const perKg = kcalPerKg({ sex, age, heightCm, weightKg: kg0 }) * (1 + 0.07 * r.n());
  const noise = r.between(0.004, 0.01);
  const share = r.between(0.85, 1);                    // the part of what they eat that they log
  const entries = [], weights = [];
  let kg = kg0, next = 0;
  for (let i = 0; i < days; i++) {
    const day = addDays(START, i);
    if (i === next) { weights.push({ day, kg: Math.round((kg * (1 + noise * r.n())) * 10) / 10 }); next += Math.round(r.between(every[0], every[1])); }
    const ate = Math.max(300, eats * (1 + 0.25 * r.n()));
    kg += (ate - tdee) / perKg;
    if (r.u() < logged) {
      const k = ate * share * (r.u() < partial ? 0.6 : 1);
      entries.push({ day, meal: 'lunch', kcal: k * 0.55 }, { day, meal: 'dinner', kcal: k * 0.45 });
    }
  }
  const day = addDays(START, days);
  return { p, formula, truth: tdee * share, entries, weights, day, kg };
}

// The errors of the formula, the old way (7700 kcal a kg, no weighting) and the current one over `n` people.
export function evaluate(n, opts = {}, seed = 7) {
  const r = rng(seed);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const x = person(r, opts);
    const body = { sex: x.p.sex, age: x.p.age, heightCm: x.p.heightCm };
    const m = measuredTdee(x.entries, x.weights, { day: x.day, startDate: x.p.startDate, formula: x.formula, body });
    if (!m.ready) { rows.push({ ready: false }); continue; }
    const old = m.intake - (m.perWeek / 7) * 7700;
    const oldClamped = Math.min(x.formula * 1.25, Math.max(x.formula * 0.75, old)); // as it was before 2026-11-23
    rows.push({ ready: true, formula: x.formula - x.truth, old: oldClamped - x.truth, now: m.tdee - x.truth, inRange: Math.abs(m.tdee - x.truth) <= m.range + 25, range: m.range });
  }
  const ok = rows.filter(x => x.ready);
  const q = (k, p) => { const a = ok.map(x => Math.abs(x[k])).sort((a, b) => a - b); return Math.round(a[Math.min(a.length - 1, Math.floor(p * a.length))]); };
  const stat = k => ({ median: q(k, 0.5), p90: q(k, 0.9), bias: Math.round(ok.reduce((s, x) => s + x[k], 0) / ok.length) });
  return {
    n, ready: ok.length / n,
    formula: stat('formula'), old: stat('old'), now: stat('now'),
    coverage: ok.filter(x => x.inRange).length / ok.length,
    range: Math.round(ok.reduce((s, x) => s + x.range, 0) / ok.length),
  };
}
