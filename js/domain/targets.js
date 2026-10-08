// Target calculation. Pure functions — no DOM, no storage.
import { round50 } from '../lib/fa.js';

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

export function computeTargets({ sex, age, heightCm, weightKg, activity }) {
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
  const tdee = bmr * (ACTIVITY[activity]?.factor ?? 1.2);
  const floor = safeFloor(sex);
  const raw = round50(tdee - 500);
  return {
    bmr: Math.round(bmr),
    tdee: round50(tdee),
    kcal: Math.max(floor, raw),
    hitFloor: raw < floor,
    protein: Math.round(1.4 * refWeight(heightCm)),
    refWeight: Math.round(refWeight(heightCm) * 10) / 10,
    floor,
    weightKg,
  };
}

// What the app actually uses. A manual calorie target never goes below the floor.
export function effectiveTargets(p) {
  if (!p) return { kcal: 0, protein: 0, floor: 1200 };
  const floor = safeFloor(p.sex);
  const t = p.targets || {};
  const kcal = Math.max(floor, Number(t.manualKcal) || t.kcal || floor);
  const protein = Number(t.manualProtein) || t.protein || 0;
  return { kcal, protein, floor, manual: !!(t.manualKcal || t.manualProtein) };
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
