import { suite, test, eq, ok } from './harness.js';
import {
  dayTotals, underFloor, rapidPace, lowBmi, largeDays, afterLarge, nightEating, lossOfControl, lowMood,
  lowProtein, lowProduce, plateau, logGap, weighGap, weekendGap, lowActivity, onFloor, manualLow, observe,
} from '../js/domain/signals.js';
import { computeTargets } from '../js/domain/targets.js';
import { addDays, parse } from '../js/lib/dates.js';

const D = '2026-03-01';
const back = n => addDays(D, -n);
const base = { onboarded: true, sex: 'female', age: 50, heightCm: 160, activity: 'sedentary', startDate: back(120) };
const P = (extra = {}) => {
  const t = computeTargets({ ...base, weightKg: 80 });
  return { ...base, targets: { kcal: t.kcal, tdee: t.tdee, protein: t.protein, baseWeight: 80 }, ...extra };
};
// a full day (two meals) of `kcal`, `protein` g
const day = (d, kcal, protein = 60, extra = {}) => [
  { day: d, meal: 'lunch', kcal: kcal / 2, protein: protein / 2, ...extra },
  { day: d, meal: 'dinner', kcal: kcal / 2, protein: protein / 2, ...extra },
];
const days = (n, kcal, protein) => Array.from({ length: n }, (_, i) => day(back(i + 1), kcal, protein)).flat();
const by = entries => dayTotals(entries, [], back(42), back(1));
// weigh-ins every `step` days over the last `span`, changing `perWeek` kg a week
const weigh = (kg, perWeek, span = 28, step = 3) => {
  const out = [];
  for (let i = span; i >= 1; i -= step) out.push({ day: back(i), kg: kg - perWeek * (span - i) / 7 });
  return out;
};

suite('signals', () => {
  test('the woman in the fixture: formula target under the floor, maintenance 1650', () => {
    const p = P();
    eq(p.targets.tdee, 1650);
    eq(onFloor(p, D), { kcal: 1200, floor: 1200, worked: 1200 });
    eq(onFloor(P({ targets: { kcal: 1500, tdee: 2000, baseWeight: 80 } }), D), null);
  });

  test('under the floor: three full days of the last seven', () => {
    const r = underFloor(by([...day(back(1), 900), ...day(back(3), 700), ...day(back(5), 1000), ...day(back(6), 1500)]), P(), D);
    eq(r, { days: 3, of: 4, avg: 867, floor: 1200, under800: 1 });
    eq(underFloor(by([...day(back(1), 900), ...day(back(3), 700), ...day(back(9), 1000)]), P(), D), null); // one is too old
    eq(underFloor(by([{ day: back(1), meal: 'lunch', kcal: 300 }, { day: back(2), meal: 'lunch', kcal: 300 }, { day: back(3), meal: 'lunch', kcal: 300 }]), P(), D), null); // not full days
  });

  test('rapid loss: faster than 1 % of body weight a week, once past the first weeks', () => {
    const r = rapidPace(weigh(80, 1, 21), P(), D);
    ok(r && r.pct > 1);
    eq(rapidPace(weigh(80, 0.5, 21), P(), D), null);
    eq(rapidPace(weigh(80, 1, 21), P({ startDate: back(30) }), D), null); // still early: water
    eq(rapidPace(weigh(80, 1, 21), P({ phase: 'maintain' }), D), null);
  });

  test('BMI under 18.5, adults only', () => {
    eq(lowBmi([{ day: back(2), kg: 46 }, { day: back(1), kg: 46 }], P(), D), { bmi: 18, kg: 46, phase: 'loss' });
    eq(lowBmi([{ day: back(1), kg: 55 }], P(), D), null);
    eq(lowBmi([{ day: back(1), kg: 46 }], P({ age: 16, startDate: back(10) }), D), null);
  });

  test('large days: four at 1.5× maintenance in four weeks', () => {
    const big = [2, 9, 16, 23].flatMap(n => day(back(n), 2600));
    eq(largeDays(by(big), P(), D)?.count, 4);
    eq(largeDays(by(big.slice(0, 6)), P(), D), null);
    eq(largeDays(by([2, 9, 16, 23].flatMap(n => day(back(n), 2300))), P(), D), null); // under 1.5 × 1650
  });

  test('after a large day: restriction, or silence', () => {
    const restrict = [...day(back(10), 2600), ...day(back(9), 700), ...day(back(20), 2700), ...day(back(18), 600)];
    eq(afterLarge(by(restrict), P(), D).restrict, { count: 2, days: [back(10), back(20)] });
    eq(afterLarge(by(restrict), P(), D).silent, null);
    const silent = [...day(back(10), 2600), ...day(back(7), 1400), ...day(back(20), 2700), ...day(back(17), 1400)];
    eq(afterLarge(by(silent), P(), D).silent, { count: 2, days: [back(10), back(20)] });
    eq(afterLarge(by(silent.slice(0, 4)), P(), D).silent, null); // once is not a pattern
  });

  test('night eating: a quarter of the day in snacks logged after dinner, four days of fourteen', () => {
    const at = (d, h) => { const t = parse(d); t.setHours(h); return t.toISOString(); };
    const night = d => [
      { day: d, meal: 'lunch', kcal: 700, created_at: at(d, 13) },
      { day: d, meal: 'dinner', kcal: 500, created_at: at(d, 20) },
      { day: d, meal: 'snack', kcal: 500, created_at: at(d, 23) },
    ];
    const r = nightEating(by([1, 3, 5, 7].flatMap(n => night(back(n)))), D);
    eq(r, { days: 4, of: 4, share: 0.29 });
    eq(nightEating(by([1, 3, 5].flatMap(n => night(back(n)))), D), null);
    // logged the next morning from memory: no clock to go by
    const later = d => night(d).map(e => ({ ...e, created_at: at(addDays(d, 1), 9) }));
    eq(nightEating(by([1, 3, 5, 7].flatMap(n => later(back(n)))), D), null);
  });

  test('what they said in a check-in: loss of control, low mood', () => {
    const notes = [
      { kind: 'checkin', key: `checkin:${back(5)}`, data: { mood: 2, causes: ['پرخوری بی‌اختیار', 'استرس'] } },
      { kind: 'checkin', key: `checkin:${back(40)}`, data: { mood: 1, causes: ['پرخوری بی‌اختیار'] } },
    ];
    eq(lossOfControl(notes, D), { count: 1, days: [back(5)] });
    eq(lowMood(notes, D), { count: 1, mood: 2, causes: ['پرخوری بی‌اختیار', 'استرس'] });
    eq(lowMood([{ kind: 'checkin', key: `checkin:${back(5)}`, data: { mood: 4 } }], D), null);
  });

  test('protein under the RDA, per kg at BMI 25; 1.0 g/kg from 65', () => {
    const w = [{ day: back(1), kg: 80 }]; // reference weight 64 kg
    eq(lowProtein(by(days(10, 1400, 45)), w, P(), D), { avg: 45, need: 51, perKg: 0.8, days: 10 });
    eq(lowProtein(by(days(10, 1400, 60)), w, P(), D), null);
    eq(lowProtein(by(days(10, 1400, 60)), w, P({ age: 68 }), D)?.need, 64);
    eq(lowProtein(by(days(5, 1400, 30)), w, P(), D), null); // too few days to say
  });

  test('fruit and vegetables under 5 portions', () => {
    const foods = [{ id: 'apple', category: 'fruit' }];
    const e = Array.from({ length: 8 }, (_, i) => [
      ...day(back(i + 1), 1400),
      { day: back(i + 1), meal: 'snack', kcal: 80, food_id: 'apple', qty: 1, unit: 'عدد' },
      { day: back(i + 1), meal: 'lunch', kcal: 30, is_veg: true, qty: 160, unit: 'گرم' },
    ]).flat();
    eq(lowProduce(dayTotals(e, foods, back(42), back(1)), D), { servings: 3, veg: 2, fruit: 1, days: 8 });
  });

  test('plateau: the log says it should be coming off, the scale says no', () => {
    const p = P({ startDate: back(90) });
    ok(plateau(by(days(20, 1100)), weigh(80, 0, 28, 3), p, D));
    eq(plateau(by(days(20, 1100)), weigh(80, 0.5, 28, 3), p, D), null); // losing as the log predicts
    eq(plateau(by(days(20, 1600)), weigh(80, 0, 28, 3), p, D), null);   // eating at maintenance: flat is right
  });

  test('gaps: nothing logged for three days, no weigh-in for two weeks', () => {
    eq(logGap(day(back(4), 1400), [], P(), D), { days: 3 });
    eq(logGap(day(back(2), 1400), [], P(), D), null);
    eq(logGap([], [], P(), D), null); // never logged: not a lapse
    eq(weighGap([{ day: back(14), kg: 80 }], P(), D), { days: 14 });
    eq(weighGap([{ day: back(10), kg: 80 }], P({ phase: 'maintain' }), D), { days: 10 });
    eq(weighGap([{ day: back(10), kg: 80 }], P(), D), null);
  });

  test('weekend: Thursday and Friday 300 kcal or more above the other days', () => {
    const e = Array.from({ length: 28 }, (_, i) => back(i + 1)).flatMap(d => day(d, [4, 5].includes(parse(d).getDay()) ? 2000 : 1400));
    eq(weekendGap(by(e), D), { weekend: 2000, other: 1400, diff: 600 });
    eq(weekendGap(by(days(28, 1400)), D), null);
  });

  test('activity under 150 minutes a week, only when they log it', () => {
    const a = Array.from({ length: 28 }, (_, i) => ({ day: back(i + 1), minutes: 10 }));
    ok(lowActivity(a, P(), D)?.avg < 150);
    eq(lowActivity([], P(), D), null);
    eq(lowActivity(a.map(x => ({ ...x, minutes: 40 })), P(), D), null);
  });

  test('a hand-set target well under the worked-out one', () => {
    eq(manualLow(P({ targets: { kcal: 1600, manualKcal: 1300 } })), { manual: 1300, worked: 1600 });
    eq(manualLow(P({ targets: { kcal: 1600, manualKcal: 1500 } })), null);
  });

  test('observe: every kind found, none when not onboarded', () => {
    const p = P();
    const kinds = observe({ p, entries: days(10, 900, 30), weights: [{ day: back(1), kg: 80 }] }, D).map(r => r.kind);
    ok(kinds.includes('under_floor') && kinds.includes('low_protein') && kinds.includes('on_floor'), kinds.join());
    eq(observe({ p: { ...p, onboarded: false }, entries: days(10, 900) }, D), []);
    eq(observe({ p }, D).map(r => r.kind), ['on_floor']);
  });
});
