// The golden set and scorecard of «سهم وعده» (SAHM.md, phase 2): the judge is checked, and fitMeal may
// never score below its baseline of 2026-11-20 on any measure.
import { suite, test, eq, ok } from './harness.js';
import { fitMeal, foodBounds } from '../js/domain/portion.js';
import { scorecard, exists, food } from './golden/score.js';
import { PLATES, PERSONAL, plateFoods } from './golden/plates.js';

// fitMeal's scorecard on 2026-11-20, in percent (node tools/sahm-eval.mjs). Raise a number when the
// algorithm gets better; never lower one to let a change through.
const FLOOR = {
  safety: 81.5, calories: 78.7, measurable: 100, bounds: 99.4, realism: 94.9, pairs: 97.9,
  protein: 79.1, sodium: 93.2, personal: 85.2, monotonic: 96.1, smooth: 99.8,
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

  test('fitMeal never scores below its baseline (2026-11-20)', () => {
    const s = scorecard(fitMeal);
    for (const [k, floor] of Object.entries(FLOOR)) ok(s[k].pct >= floor, `${k}: ${s[k].pct}% < ${floor}%\n      ${s[k].fails.slice(0, 3).join('\n      ')}`);
  });
});
