// Target calculation. Pure functions — no DOM, no storage.
import { round50 } from '../lib/fa.js';
import { today, diffDays } from '../lib/dates.js';

export const DEFICIT = 500; // kcal below what the body uses, while losing weight
export const RAMP_STEP = 150; // kcal added each week while climbing from the deficit to maintenance
export const CORRECT_KCAL = 300; // kcal below maintenance during a short correction (see phase.js)

export const ACTIVITY = {
  sedentary: { label: 'کم‌تحرک', factor: 1.2, hint: 'بیشتر روز نشسته، ورزش منظم ندارم' },
  light: { label: 'کمی فعال', factor: 1.375, hint: 'پیاده‌روی یا ورزش سبک ۱ تا ۳ روز در هفته' },
  active: { label: 'فعال', factor: 1.55, hint: 'ورزش متوسط ۳ تا ۵ روز در هفته' },
};

export const CONDITIONS = {
  diabetes: 'دیابت',
  kidney: 'بیماری کلیه',
  heart: 'بیماری قلبی',
  liver: 'بیماری کبد',
  gout: 'نقرس',
  gallstone: 'سنگ صفرا',
  bp: 'فشار خون',
};

export const safeFloor = sex => (sex === 'male' ? 1500 : 1200);

// Weight at which BMI = 25 for this height.
export const refWeight = heightCm => 25 * (heightCm / 100) ** 2;

// measuredTdee: what the body really used, worked out from the log (see energy.js). When
// given, it replaces the formula's estimate.
export function computeTargets({ sex, age, heightCm, weightKg, activity, measuredTdee }) {
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
  const formula = bmr * (ACTIVITY[activity]?.factor ?? 1.2);
  const measured = Number(measuredTdee) > 0;
  const tdee = measured ? Number(measuredTdee) : formula;
  const floor = safeFloor(sex);
  const raw = round50(tdee - DEFICIT);
  return {
    bmr: Math.round(bmr),
    tdee: round50(tdee),
    formulaTdee: round50(formula),
    measured,
    kcal: Math.max(floor, raw),
    hitFloor: raw < floor,
    protein: Math.round(1.4 * refWeight(heightCm)),
    refWeight: Math.round(refWeight(heightCm) * 10) / 10,
    floor,
    weightKg,
  };
}

/*
  Where the person is: losing weight ('loss', the default), holding it ('maintain'), or on a
  diet break ('break': two weeks at maintenance in the middle of losing, see phase.js).
*/
export function phaseOn(p, day = today()) {
  if (p?.phase === 'maintain') return 'maintain';
  if (p?.breakUntil && day <= p.breakUntil && (!p.breakFrom || day >= p.breakFrom)) return 'break';
  return 'loss';
}

// Calories that hold the weight steady: the stored figure, or the formula for older profiles.
export function maintenanceKcal(p) {
  const t = p?.targets || {};
  if (Number(t.tdee) > 0) return Number(t.tdee);
  const f = computeTargets({ ...p, weightKg: t.baseWeight }).tdee;
  return Number.isFinite(f) ? f : 0;
}

// A short correction in maintenance: the weight crept above the band, so two weeks a little
// under maintenance bring it back (see phase.js).
export const correcting = (p, day = today()) =>
  phaseOn(p, day) === 'maintain' && !!p?.correctUntil && day <= p.correctUntil && (!p.correctFrom || day >= p.correctFrom);

/*
  The climb into maintenance: the target does not jump from the deficit to the full figure on
  the first day, it goes up RAMP_STEP a week from where losing ended (maintainFrom.kcal). The
  weight then shows where maintenance really is, before the full figure is reached.
  null when there is no climb (finished, or nothing to climb from).
*/
export function rampKcal(p, day = today()) {
  if (phaseOn(p, day) !== 'maintain') return null;
  const from = Number(p?.maintainFrom?.kcal), full = round50(maintenanceKcal(p));
  if (!(from > 0) || !p.maintainFrom.day || from >= full) return null;
  const k = from + RAMP_STEP * (Math.floor(Math.max(0, diffDays(day, p.maintainFrom.day)) / 7) + 1);
  return k < full ? round50(k) : null;
}

// What the app actually uses on a given day. A manual calorie target never goes below the
// floor; outside the loss phase the target is maintenance (or the climb to it), not the deficit.
export function effectiveTargets(p, day = today()) {
  if (!p) return { kcal: 0, protein: 0, floor: 1200, phase: 'loss' };
  const floor = safeFloor(p.sex);
  const t = p.targets || {};
  const phase = phaseOn(p, day);
  const loss = Math.max(floor, Number(t.manualKcal) || t.kcal || floor);
  const full = Math.max(loss, round50(maintenanceKcal(p)));
  const kcal = phase === 'loss' ? loss
    : correcting(p, day) ? Math.max(floor, round50(maintenanceKcal(p) - CORRECT_KCAL))
    : rampKcal(p, day) ?? full;
  const protein = Number(t.manualProtein) || t.protein || 0;
  return { kcal, protein, floor, phase, manual: !!(t.manualKcal || t.manualProtein) };
}

export const clampKcal = (sex, kcal) => Math.max(safeFloor(sex), Math.round(kcal));

export function hasMedicalFlag(p) {
  return (p.conditions?.length > 0) || !!(p.medications || '').trim() || p.edHistory === 'yes' || p.edHistory === 'unsure';
}

// Suggest recalculating after every 5 kg lost since targets were last set.
export function shouldSuggestRecalc(p, latestKg) {
  if (!p?.targets?.baseWeight || !latestKg) return false;
  return p.targets.baseWeight - latestKg >= 5;
}
