#!/usr/bin/env node
/*
  The scorecard of «سهم وعده» (SAHM.md, phase 2): every golden plate at five sizes and four
  conditions, plus random plates, judged by phase 0's measures.

    node tools/sahm-eval.mjs                 the scorecard of fitPlate (version 2)
    node tools/sahm-eval.mjs --why calories  and the cases that failed one measure
    node tools/sahm-eval.mjs --json          the numbers as JSON (to compare two versions)
    node tools/sahm-eval.mjs --v1            fitMeal (version 1) instead of fitPlate (version 2)
*/
import { fitMeal } from '../js/domain/portion.js';
import { fitPlate } from '../js/domain/fit.js';
import { scorecard } from '../tests/golden/score.js';

const args = process.argv.slice(2);
const fit = args.includes('--v1') ? fitMeal : fitPlate;
const why = args.includes('--why') ? args[args.indexOf('--why') + 1] : null;
const t = Date.now();
const s = scorecard(fit);

if (args.includes('--json')) {
  console.log(JSON.stringify(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.fails ? { n: v.n, ok: v.ok, pct: v.pct } : v])), null, 2));
} else {
  const NAMES = {
    safety: ['۱', 'ایمنی (سقف‌ها رعایت شد)', 'سخت'],
    calories: ['۲', 'دقت کالری (±۵٪، کمینه ۲۰)', 'نرم'],
    measurable: ['۳', 'اندازه‌گرفتنی', 'سخت'],
    bounds: ['۴', 'در حد', 'سخت'],
    realism: ['۵', 'واقعی: هر خوراکی', 'نرم'],
    pairs: ['۵', 'واقعی: نسبت جفت‌ها', 'نرم'],
    protein: ['۶', 'پروتئین وعده‌ی اصلی', 'نرم'],
    sodium: ['۷', 'نمک (فشار خون)', 'نرم'],
    personal: ['۸', 'شخصی', 'نرم'],
    monotonic: ['۹', 'یکنواخت (+۵۰ کالری)', 'سخت'],
    smooth: ['۱۰', 'آرام (±۱۰ کالری)', 'نرم'],
  };
  console.log(fit === fitMeal ? 'fitMeal (v1)' : 'fitPlate (v2)');
  console.log('measure                          kind   ok / n        %');
  for (const [k, [no, name, kind]] of Object.entries(NAMES)) {
    const v = s[k];
    console.log(`${no.padEnd(3)}${name.padEnd(30)} ${kind.padEnd(5)} ${String(v.ok).padStart(5)} / ${String(v.n).padEnd(6)} ${v.pct ?? '-'}`);
  }
  console.log(`mean calorie error where it could be met: ${s.calorieError}%`);
  console.log(`speed here (ms per plate): median ${s.speed.median}, p95 ${s.speed.p95}, max ${s.speed.max} (${s.speed.n} fits)`);
  console.log(`(${((Date.now() - t) / 1000).toFixed(1)} s)`);
}
if (why) {
  const v = s[why];
  if (!v?.fails) console.log(`no measure «${why}»`);
  else { console.log(`\n${why}: ${v.n - v.ok} failed${v.fails.length < v.n - v.ok ? ` (first ${v.fails.length})` : ''}`); v.fails.forEach(f => console.log(`  ${f}`)); }
}
