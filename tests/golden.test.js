// The golden set and scorecard of «سهم وعده» (SAHM.md, phases 2 and 3): the judge is checked, and neither
// version may score below its own scorecard of 2026-11-20 on any measure; version 2 never below version 1.
import { suite, test, eq, ok } from './harness.js';
import { fitMeal, foodBounds } from '../js/domain/portion.js';
import { fitPlate } from '../js/domain/fit.js';
import { scorecard, exists, food } from './golden/score.js';
import { PLATES, PERSONAL, plateFoods } from './golden/plates.js';

// fitMeal's scorecard on 2026-11-20, in percent (node tools/sahm-eval.mjs). Raise a number when the
// algorithm gets better; never lower one to let a change through.
const FLOOR = {
  safety: 81.5, calories: 78.7, measurable: 100, bounds: 99.4, realism: 94.9, pairs: 97.9,
  protein: 79.1, sodium: 93.2, personal: 85.2, monotonic: 96.1, smooth: 99.8,
};
// fitPlate's (version 2) on the same day, after its weights were set (SAHM.md phase 3).
const FLOOR_V2 = {
  safety: 100, calories: 79.2, measurable: 100, bounds: 100, realism: 95.6, pairs: 100,
  protein: 81.6, sodium: 93.2, personal: 85.2, monotonic: 96.9, smooth: 99.8,
};

suite('golden', () => {
  test('golden plates: starter foods, and each usual helping inside its realistic range', () => {
    const ids = new Set();
    for (const p of PLATES) {
      ok(!ids.has(p.id), `two plates called ${p.id}`);
      ids.add(p.id);
      for (const f of plateFoods(p).map(food)) {
        const r = p.sane[f.name];
        if (!r) continue;
        const { base } = foodBounds(f);
        ok(r[0] <= base && base <= r[1], `${p.id}: ${f.name} usually ${base}, range ${r}`);
      }
      for (const [a, b] of p.pairs) ok(p.sane[a] && p.sane[b], `${p.id}: pair ${a} / ${b}`);
    }
    for (const p of PERSONAL) Object.keys(p.usual).forEach(food);
  });

  test('the search finds a plate when there is one, and only then', () => {
    const items = [
      { vals: [1, 2], k: 100, p: 4, c: 20, na: 200 },
      { vals: [1, 2, 3], k: 50, p: 6, c: 0, na: 100 },
    ];
    // sums of calories: 150, 200, 250 (twice), 300, 350
    eq(exists(items, { lo: 240, hi: 260 }), true);
    eq(exists(items, { lo: 320, hi: 340 }), false);
    eq(exists(items, { lo: 240, hi: 260, pMax: 15 }), true);   // 2 + 1: 14 g
    eq(exists(items, { lo: 240, hi: 260, pMin: 15 }), true);   // 1 + 3: 22 g
    eq(exists(items, { lo: 290, hi: 310, cMax: 30 }), false);  // 300 is 2 + 2: 40 g
    eq(exists(items, { naMax: 299 }), false);                  // the least is 300 mg
  });

  const atLeast = (s, floors) => { for (const [k, floor] of Object.entries(floors)) ok(s[k].pct >= floor, `${k}: ${s[k].pct}% < ${floor}%\n      ${s[k].fails.slice(0, 3).join('\n      ')}`); };

  test('fitMeal never scores below its baseline (2026-11-20)', () => atLeast(scorecard(fitMeal), FLOOR));

  test('fitPlate never scores below its own scorecard, nor below fitMeal\'s', () => {
    const s = scorecard(fitPlate);
    atLeast(s, FLOOR_V2);
    atLeast(s, FLOOR);
  });
});
