#!/usr/bin/env node
/*
  The scorecard of «مصرف واقعی بدن» (js/domain/energy.js) on simulated people whose real energy
  use is known (tests/energy-sim.js says how they are made). For each way of living with the app:
  how far the formula, the old measurement (7700 kcal a kg, no weighting) and the current one land
  from the truth (median and 90th percentile of the error, kcal a day; bias = the mean signed error),
  and how often the truth is inside the ± the card shows (it should be about 95%).

    node tools/energy-eval.mjs          the scorecard (2000 people a case)
    node tools/energy-eval.mjs 500      fewer people, quicker
*/
import { evaluate } from '../tests/energy-sim.js';

const n = Number(process.argv[2]) || 2000;
const CASES = [
  ['weighs every 7–9 days, logs 75% of days', {}],
  ['weighs every 2–3 days', { every: [2, 3] }],
  ['logs only half the days', { logged: 0.5 }],
  ['a fifth of the logged days miss a meal', { partial: 0.2 }],
  ['the formula is further off (±20%)', { spread: 0.2 }],
  ['weighs weekly, six weeks after starting', { days: 43 }],
];
const row = s => `${String(s.median).padStart(5)} ${String(s.p90).padStart(5)} ${String(s.bias).padStart(5)}`;
console.log(`${'case'.padEnd(42)} ready | formula: med  p90 bias |    old: med  p90 bias |    now: med  p90 bias | in ±  mean ±`);
for (const [name, opts] of CASES) {
  const s = evaluate(n, opts);
  console.log(`${name.padEnd(42)} ${String(Math.round(s.ready * 100)).padStart(4)}% |       ${row(s.formula)} |       ${row(s.old)} |       ${row(s.now)} | ${String(Math.round(s.coverage * 100)).padStart(3)}% ${String(s.range).padStart(6)}`);
}
