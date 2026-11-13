import { suite, test, eq, ok } from './harness.js';
import { computeTargets, effectiveTargets, safeFloor, clampKcal, ageOn, isTeen, teenEnergy, floorFor, phaseOn, maintenanceKcal, shouldSuggestRecalc, hasMedicalFlag, rampKcal } from '../js/domain/targets.js';

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
    eq(clampKcal({ sex: 'female' }, 900), 1200);
    eq(clampKcal({ sex: 'male' }, 1730.4), 1730);
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
    eq(effectiveTargets({ sex: 'male', targets: { kcal: 1850, protein: 113, manualKcal: 2000, manualProtein: 120 } }, '2026-01-10'), { kcal: 2000, protein: 120, proteinMax: false, floor: 1500, phase: 'loss', teen: false, manual: true, hold: null, nursing: false });
    eq(effectiveTargets(null).kcal, 0);
  });

  test('pregnancy: no deficit, the target is what the body uses, even over a target set by hand', () => {
    const w = { sex: 'female', age: 30, heightCm: 165, weightKg: 85, activity: 'light' };
    const t = computeTargets({ ...w, pregnancy: 'pregnant' });
    eq([t.hold, t.deficit, t.kcal], ['pregnant', 0, t.tdee]);
    const p = { ...w, pregnancy: 'pregnant', targets: { kcal: 1500, tdee: t.tdee, baseWeight: 85, manualKcal: 1300 } };
    eq(effectiveTargets(p, '2026-11-13').kcal, t.tdee);
    eq(effectiveTargets(p, '2026-11-13').hold, 'pregnant');
  });

  test('breastfeeding: a gentle deficit and never under 1800', () => {
    const w = { sex: 'female', age: 30, heightCm: 165, weightKg: 85, activity: 'light' };
    const t = computeTargets({ ...w, pregnancy: 'breastfeeding' });
    eq([t.nursing, t.deficit], [true, 300]);
    ok(t.kcal >= 1800 && t.kcal >= t.tdee - 300, `${t.kcal}`);
    const small = computeTargets({ ...w, weightKg: 60, heightCm: 155, activity: 'sedentary', pregnancy: 'breastfeeding' });
    ok(small.kcal >= 1800, `${small.kcal}`);
    const p = { ...w, pregnancy: 'breastfeeding', targets: { kcal: 1400, tdee: 2300, baseWeight: 85, manualKcal: 1300 } };
    eq(effectiveTargets(p, '2026-11-13').kcal, 2000);
  });

  test('underweight: no deficit', () => {
    const t = computeTargets({ sex: 'female', age: 25, heightCm: 170, weightKg: 52, activity: 'light' }); // BMI 18.0
    eq([t.hold, t.deficit, t.kcal], ['underweight', 0, t.tdee]);
    const ok19 = computeTargets({ sex: 'female', age: 25, heightCm: 170, weightKg: 56, activity: 'light' }); // BMI 19.4
    eq(ok19.hold, null);
    const p = { sex: 'female', heightCm: 170, targets: { kcal: 1500, tdee: 2000, baseWeight: 52 } };
    eq(effectiveTargets(p, '2026-11-13').kcal, 2000);
  });

  test('kidney disease: protein becomes a limit of 0.8 g per kg of the reference weight', () => {
    const k = { sex: 'male', age: 50, heightCm: 172, weightKg: 118, activity: 'sedentary' };
    const plain = computeTargets(k);
    const kid = computeTargets({ ...k, conditions: ['kidney'] });
    eq([plain.protein, plain.proteinMax, kid.protein, kid.proteinMax], [104, false, 59, true]);
    // targets saved before the condition was entered still get the limit; a hand-set figure wins
    const old = { sex: 'male', heightCm: 172, conditions: ['kidney'], targets: { kcal: 2000, protein: 104 } };
    eq([effectiveTargets(old).protein, effectiveTargets(old).proteinMax], [59, true]);
    eq(effectiveTargets({ ...old, targets: { ...old.targets, manualProtein: 70 } }).protein, 70);
    eq(effectiveTargets({ ...old, conditions: [] }).protein, 104);
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

  test('the climb into maintenance: 150 kcal a week from where losing ended', () => {
    const p = { sex: 'male', phase: 'maintain', maintainFrom: { day: '2026-01-01', kg: 80, kcal: 1850 }, targets: { kcal: 1850, protein: 113, tdee: 2350 } };
    eq(['2026-01-01', '2026-01-07', '2026-01-08', '2026-01-15', '2026-01-22', '2026-01-29'].map(d => effectiveTargets(p, d).kcal), [2000, 2000, 2150, 2300, 2350, 2350]);
    eq(rampKcal(p, '2026-01-22'), null);
    eq(effectiveTargets({ ...p, maintainFrom: { day: '2026-01-01', kg: 80 } }, '2026-01-01').kcal, 2350); // switched before the climb existed
    eq(effectiveTargets({ ...p, maintainFrom: { day: '2026-01-01', kg: 80, kcal: 2400 } }, '2026-01-01').kcal, 2350);
  });

  test('a correction is maintenance minus 300, never under the floor', () => {
    const p = { sex: 'male', phase: 'maintain', maintainFrom: { day: '2026-01-01', kg: 80, kcal: 1850 }, targets: { kcal: 1850, protein: 113, tdee: 2350 }, correctFrom: '2026-03-01', correctUntil: '2026-03-14' };
    eq([effectiveTargets(p, '2026-03-01').kcal, effectiveTargets(p, '2026-03-15').kcal], [2050, 2350]);
    eq(effectiveTargets({ ...p, targets: { kcal: 1500, tdee: 1700 } }, '2026-03-02').kcal, 1500);
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

  test('a teen gets the NASEM 2023 equation and a floor from their own needs', () => {
    const girl = { sex: 'female', age: 16, heightCm: 170, weightKg: 120, activity: 'sedentary' };
    const t = computeTargets(girl);
    eq(t.teen, true);
    eq(t.tdee, 3200);            // 55.59 − 22.25×16 + 8.43×170 + 17.07×120 + 20 = 3201
    eq(t.floor, 2700);           // the same at the lowest activity, minus 500
    eq(t.kcal, 2700);
    const boy = computeTargets({ sex: 'male', age: 17, heightCm: 175, weightKg: 70, activity: 'light' });
    eq(boy.tdee, 3050);          // 19.12 + 3.68×17 + 8.62×175 + 20.28×70 + 20 = 3030
    eq(boy.kcal, 2550);
    eq(boy.floor, 2350);         // inactive: 2832 − 500
    eq(Math.round(teenEnergy('female', 16, 170, 60)), 2177);
    eq(computeTargets({ ...girl, age: 18 }).teen, false);
  });

  test('the age moves on from sign-up, and at 18 the adult rules come back', () => {
    const p = { sex: 'female', age: 16, heightCm: 170, startDate: '2026-01-01', targets: { baseWeight: 120 } };
    eq(ageOn(p, '2027-06-01'), 17);
    eq(isTeen(p, '2027-06-01'), true);
    eq(floorFor(p, '2027-06-01'), 2700); // 17: 3201 − 22 − 500 = 2679
    eq(isTeen(p, '2028-01-02'), false);
    eq(floorFor(p, '2028-01-02'), 1200);
    eq(clampKcal(p, 1500) >= 2700, true);
  });
});
