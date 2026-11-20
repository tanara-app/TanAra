import { suite, test, eq, ok } from './harness.js';
import { weightSign, waistSign, loggingSign, scaleSign, overSign, planSign, drift, checkinState } from '../js/domain/drift.js';
import { addDays } from '../js/lib/dates.js';

const D = '2026-03-01';
const back = n => addDays(D, -n);
const e = (day, meal, kcal) => ({ day, meal, kcal });

suite('drift', () => {
  test('weight: the last two weeks against the four before', () => {
    eq(weightSign([{ day: back(30), kg: 80 }, { day: back(20), kg: 80.2 }, { day: back(5), kg: 81 }], D), { from: 80.1, to: 81, gain: 0.9 });
    eq(weightSign([{ day: back(30), kg: 80 }, { day: back(5), kg: 80.5 }], D), null); // within the noise
    eq(weightSign([{ day: back(5), kg: 85 }], D), null);                              // nothing to compare with
  });

  test('waist: a recent measurement up 1.5 cm or more', () => {
    eq(waistSign([{ day: back(20), cm: 90 }, { day: back(3), cm: 92 }], D), { from: 90, to: 92, gain: 2, since: back(20) });
    eq(waistSign([{ day: back(20), cm: 90 }, { day: back(3), cm: 91 }], D), null);
    eq(waistSign([{ day: back(60), cm: 90 }, { day: back(30), cm: 93 }], D), null);  // the latest is stale
  });

  test('logging: fewer logged days than usual', () => {
    const usual = Array.from({ length: 21 }, (_, i) => e(back(8 + i), 'lunch', 500));
    eq(loggingSign([...usual, e(back(2), 'lunch', 500), e(back(4), 'lunch', 500)], D), { before: 7, now: 2 });
    eq(loggingSign([...usual, ...[1, 2, 3, 4, 5].map(n => e(back(n), 'lunch', 500))], D), null);
    eq(loggingSign([e(back(2), 'lunch', 500)], D), null); // never logged much: nothing has dropped
  });

  test('logging: three days a week counts too (BAZGASHT.md phase 4)', () => {
    const three = [8, 10, 12, 15, 17, 19, 22, 24, 26].map(n => e(back(n), 'lunch', 500)); // 3 a week
    eq(loggingSign([...three, e(back(3), 'lunch', 500)], D), { before: 3, now: 1 });
    eq(loggingSign([...three, e(back(3), 'lunch', 500), e(back(5), 'lunch', 500)], D), null); // 2 of 3: not a drop yet
    const four = [8, 9, 11, 13, 15, 16, 18, 20, 22, 23, 25, 27].map(n => e(back(n), 'lunch', 500)); // 4 a week
    eq(loggingSign([...four, e(back(2), 'lunch', 500), e(back(5), 'lunch', 500)], D), { before: 4, now: 2 });
  });

  test('scale: weighed regularly, then not for two weeks', () => {
    const w = n => ({ day: back(n), kg: 80 });
    eq(scaleSign([w(40), w(30), w(20)], D), { days: 20, last: back(20) });
    eq(scaleSign([w(40), w(20)], D), null);               // was not weighing regularly
    eq(scaleSign([w(40), w(30), w(20), w(10)], D), null); // weighed ten days ago
    eq(Object.keys(drift({ weights: [w(40), w(30), w(20)] }, D)), ['scale']);
    eq(drift({ weights: [w(40), w(30), w(20)], care: true }, D), null);       // never with a possible eating-disorder history
    eq(drift({ weights: [w(40), w(30), w(20)], phase: 'maintain' }, D), null); // maintenance has its own note
  });

  test('over: three well-logged days well over target', () => {
    const day = (n, kcal) => [e(back(n), 'lunch', kcal / 2), e(back(n), 'dinner', kcal / 2)];
    eq(overSign([...day(1, 2400), ...day(2, 2300), ...day(3, 2500), ...day(4, 1800)], D, () => 1800), { days: 3, by: 600 });
    eq(overSign([...day(1, 2400), ...day(2, 2300), e(back(3), 'dinner', 3000)], D, () => 1800), null); // one meal: not a full day
  });

  test('plan: kept to it, then dropped under half', () => {
    const adh = (from, to) => (to === back(1) ? { done: 12, of: 35 } : { done: 60, of: 70 });
    eq(planSign(adh, D), { before: 86, now: 34 });
    eq(planSign(() => ({ done: 10, of: 35 }), D), null); // never kept to it: a different problem
  });

  test('drift gathers the signs, none on a diet break, no weight sign in maintenance', () => {
    const weights = [{ day: back(30), kg: 80 }, { day: back(5), kg: 81 }];
    eq(Object.keys(drift({ weights }, D)), ['weight']);
    eq(drift({ weights, phase: 'maintain' }, D), null);
    eq(drift({ weights, phase: 'break' }, D), null);
    eq(drift({}, D), null);
  });

  test('check-in state: quiet for a week, then ask how it went', () => {
    eq(checkinState({ key: `checkin:${back(3)}`, data: {} }, D), 'quiet');
    eq(checkinState({ key: `checkin:${back(8)}`, data: {} }, D), 'follow');
    eq(checkinState({ key: `checkin:${back(8)}`, data: { outcome: 'good' } }, D), null);
    eq(checkinState({ key: `checkin:${back(30)}`, data: {} }, D), null);
    ok(checkinState(null, D) === null);
  });
});
