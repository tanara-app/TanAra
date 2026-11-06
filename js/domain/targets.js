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

/*
  Teenagers (16 and 17; the app does not take anyone younger). A growing body needs more than
  an adult formula says, so for them:
  - energy use comes from the NASEM 2023 equations for ages 14 to 18 (they include the cost of
    growth), not Mifflin–St Jeor;
  - the safety floor is not a fixed 1200/1500 but what the body uses at the lowest activity
    level, minus the usual deficit. So the target never goes further below their needs than
    an adult's would.
  Only the age given at sign-up is stored, so the current age counts the years since then:
  on their 18th birthday (give or take) the adult rules apply again.
*/
export const ADULT_AGE = 18;

export function ageOn(p, day = today()) {
  const a = Number(p?.age);
  if (!(a > 0) || !p.startDate) return a;
  return a + Math.floor(Math.max(0, diffDays(day, p.startDate)) / 365.25);
}

export const isTeen = (p, day = today()) => ageOn(p, day) < ADULT_AGE;

// NASEM 2023, ages 14–<19: [constant, age, height cm, weight kg] per activity level; +20 kcal
// for growth. The app's three levels map to inactive, low active and active.
const EER_TEEN = {
  male: { sedentary: [-447.51, 3.68, 13.01, 13.15], light: [19.12, 3.68, 8.62, 20.28], active: [-388.19, 3.68, 12.66, 20.46] },
  female: { sedentary: [55.59, -22.25, 8.43, 17.07], light: [-297.54, -22.25, 12.77, 14.73], active: [-189.55, -22.25, 11.74, 18.34] },
};

export function teenEnergy(sex, age, heightCm, weightKg, activity = 'sedentary') {
  const set = EER_TEEN[sex === 'male' ? 'male' : 'female'];
  const [c, a, h, w] = set[activity] || set.sedentary;
  return c + a * age + h * heightCm + w * weightKg + 20;
}

// The floor for a teen: energy use at the lowest activity level, minus the deficit.
export const teenFloor = (sex, age, heightCm, weightKg) =>
  Math.max(safeFloor(sex), round50(teenEnergy(sex, age, heightCm, weightKg, 'sedentary') - DEFICIT));

// The safety floor for this person: the teen floor (from the weight the targets were set at)
// or the adult one.
export function floorFor(p, day = today()) {
  const kg = Number(p?.targets?.baseWeight);
  if (!isTeen(p, day) || !(kg > 0) || !(Number(p.heightCm) > 0)) return safeFloor(p?.sex);
  return teenFloor(p.sex, ageOn(p, day), Number(p.heightCm), kg);
}

// Weight at which BMI = 25 for this height.
export const refWeight = heightCm => 25 * (heightCm / 100) ** 2;

/*
  Protein a day, per kg of the reference weight: 1.4 keeps muscle while losing. With kidney
  disease a high protein intake loads the kidneys, so the target becomes a limit of 0.8 g/kg
  (the usual advice for chronic kidney disease without dialysis; their nephrologist may set
  another figure, which they can enter by hand).
*/
export const PROTEIN_PER_KG = 1.4;
export const KIDNEY_PROTEIN_PER_KG = 0.8;
export const kidney = p => (p?.conditions || []).includes('kidney');

// measuredTdee: what the body really used, worked out from the log (see energy.js). When
// given, it replaces the formula's estimate.
// For a teen (see above) the formula and the floor are the teen ones. startDate, when given,
// moves the age on from the one given at sign-up.
export function computeTargets({ sex, age: age0, heightCm, weightKg, activity, measuredTdee, startDate, conditions }) {
  const age = ageOn({ age: age0, startDate });
  const teen = age < ADULT_AGE;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
  const formula = teen ? teenEnergy(sex, age, heightCm, weightKg, activity) : bmr * (ACTIVITY[activity]?.factor ?? 1.2);
  const measured = Number(measuredTdee) > 0;
  const tdee = measured ? Number(measuredTdee) : formula;
  const floor = teen ? teenFloor(sex, age, heightCm, weightKg) : safeFloor(sex);
  const raw = round50(tdee - DEFICIT);
  return {
    bmr: Math.round(bmr),
    tdee: round50(tdee),
    formulaTdee: round50(formula),
    measured,
    kcal: Math.max(floor, raw),
    hitFloor: raw < floor,
    protein: Math.round((kidney({ conditions }) ? KIDNEY_PROTEIN_PER_KG : PROTEIN_PER_KG) * refWeight(heightCm)),
    proteinMax: kidney({ conditions }),
    refWeight: Math.round(refWeight(heightCm) * 10) / 10,
    floor,
    teen,
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
  const floor = floorFor(p, day);
  const t = p.targets || {};
  const phase = phaseOn(p, day);
  const loss = Math.max(floor, Number(t.manualKcal) || t.kcal || floor);
  const full = Math.max(loss, round50(maintenanceKcal(p)));
  const kcal = phase === 'loss' ? loss
    : correcting(p, day) ? Math.max(floor, round50(maintenanceKcal(p) - CORRECT_KCAL))
    : rampKcal(p, day) ?? full;
  const manualProtein = Number(t.manualProtein);
  // targets set before kidney disease was entered (or before this rule) still get the limit
  const limit = kidney(p) && Number(p.heightCm) > 0 ? Math.round(KIDNEY_PROTEIN_PER_KG * refWeight(Number(p.heightCm))) : 0;
  const protein = manualProtein || (limit ? Math.min(limit, t.protein || limit) : t.protein || 0);
  return { kcal, protein, proteinMax: !manualProtein && !!limit, floor, phase, teen: isTeen(p, day), manual: !!(t.manualKcal || t.manualProtein) };
}

export const clampKcal = (p, kcal) => Math.max(floorFor(p), Math.round(kcal));

export function hasMedicalFlag(p) {
  return (p.conditions?.length > 0) || !!(p.medications || '').trim() || p.edHistory === 'yes' || p.edHistory === 'unsure';
}

// Suggest recalculating after every 5 kg lost since targets were last set.
export function shouldSuggestRecalc(p, latestKg) {
  if (!p?.targets?.baseWeight || !latestKg) return false;
  return p.targets.baseWeight - latestKg >= 5;
}
