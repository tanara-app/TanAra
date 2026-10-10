import { suite, test, eq, ok } from './harness.js';
import { computeTargets, effectiveTargets, safeFloor, clampKcal, phaseOn, maintenanceKcal, shouldSuggestRecalc, hasMedicalFlag } from '../js/domain/targets.js';

const man = { sex: 'male', age: 35, heightCm: 180, weightKg: 100, activity: 'sedentary' };

suite('targets', () => {
  test('Mifflin-St Jeor, activity factor, 500 kcal deficit', () => {
    const t = computeTargets(man);
    eq(t.bmr, 1955);            // 10×100 + 6.25×180 − 5×35 + 5
    eq(t.tdee, 2350);           // 1955 × 1.2 = 2346 → nearest 50
    eq(t.kcal, 1850);
    eq(t.hitFloor, false);
    eq(t.measured, false);
  });

  test('protein is 1.4 g per kg of the BMI-25 weight, not of the current weight', () => {
    eq(computeTargets(man).protein, 113); // 25 × 1.8² = 81 kg → 113.4
  });

  test('the target never goes under the safety floor', () => {
    const t = computeTargets({ sex: 'female', age: 60, heightCm: 150, weightKg: 50, activity: 'sedentary' });
    eq(t.kcal, 1200);
    eq(t.hitFloor, true);
    eq(safeFloor('male'), 1500);
    eq(clampKcal('female', 900), 1200);
    eq(clampKcal('male', 1730.4), 1730);
  });

  test('a measured energy use replaces the formula', () => {
    const t = computeTargets({ ...man, measuredTdee: 2700 });
    eq(t.tdee, 2700);
    eq(t.kcal, 2200);
    eq(t.formulaTdee, 2350);
    eq(t.measured, true);
  });

  test('effective target: manual wins, but not under the floor', () => {
    const p = { sex: 'male', targets: { kcal: 1850, protein: 113, manualKcal: 1300 } };
    eq(effectiveTargets(p, '2026-01-10').kcal, 1500);
    eq(effectiveTargets({ sex: 'male', targets: { kcal: 1850, protein: 113, manualKcal: 2000, manualProtein: 120 } }, '2026-01-10'), { kcal: 2000, protein: 120, floor: 1500, phase: 'loss', manual: true });
    eq(effectiveTargets(null).kcal, 0);
  });

  test('phase: maintenance and a diet break lift the target to maintenance', () => {
    const base = { ...man, weightKg: undefined, targets: { kcal: 1850, protein: 113, baseWeight: 100, tdee: 2350 } };
    eq(phaseOn(base, '2026-01-10'), 'loss');
    eq(effectiveTargets({ ...base, phase: 'maintain' }, '2026-01-10').kcal, 2350);
    const onBreak = { ...base, breakFrom: '2026-01-05', breakUntil: '2026-01-18' };
    eq(phaseOn(onBreak, '2026-01-04'), 'loss');
    eq(phaseOn(onBreak, '2026-01-05'), 'break');
    eq(phaseOn(onBreak, '2026-01-18'), 'break');
    eq(phaseOn(onBreak, '2026-01-19'), 'loss');
    eq(effectiveTargets(onBreak, '2026-01-10').kcal, 2350);
    eq(effectiveTargets(onBreak, '2026-01-19').kcal, 1850);
  });

  test('maintenance for a profile saved before energy use was stored comes from the formula', () => {
    const old = { sex: 'male', age: 35, heightCm: 180, activity: 'sedentary', targets: { kcal: 1850, baseWeight: 100 } };
    eq(maintenanceKcal(old), 2350);
    eq(maintenanceKcal({ sex: 'male', targets: {} }), 0);
    // with nothing to go on, the loss target stands rather than a made-up number
    eq(effectiveTargets({ sex: 'male', phase: 'maintain', targets: { kcal: 1850 } }, '2026-01-10').kcal, 1850);
  });

  test('recalculation is suggested after 5 kg', () => {
    ok(shouldSuggestRecalc({ targets: { baseWeight: 100 } }, 95));
    ok(!shouldSuggestRecalc({ targets: { baseWeight: 100 } }, 95.1));
    ok(!shouldSuggestRecalc({ targets: {} }, 90));
  });

  test('medical flag', () => {
    ok(!hasMedicalFlag({ conditions: [], medications: '  ', edHistory: 'no' }));
    ok(hasMedicalFlag({ conditions: ['diabetes'] }));
    ok(hasMedicalFlag({ conditions: [], medications: 'متفورمین' }));
    ok(hasMedicalFlag({ edHistory: 'unsure' }));
  });
});
