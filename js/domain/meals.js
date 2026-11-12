/*
  The meals an entry is logged in. Pure, with no imports, so any module can use it.

  The four everyone sees: صبحانه، ناهار، شام، میان‌وعده ('snack'). The rebuilt «امروز» (REDESIGN.md, beta
  `eat`) shows five, each snack with its own name in the database (from 2026-11-12): 'snack1' (میان‌وعده‌ی
  صبح, between breakfast and lunch) and 'snack2' (میان‌وعده‌ی عصر, between lunch and dinner). A plain
  'snack' (logged with four meals) is placed in one of them by the hour it was logged. Every view that
  knows four meals counts 'snack1' and 'snack2' as the snack (baseMeal).
*/
export const MEALS = {
  breakfast: 'صبحانه',
  lunch: 'ناهار',
  dinner: 'شام',
  snack: 'میان‌وعده',
};

export const MEALS5 = {
  breakfast: 'صبحانه',
  snack1: 'میان‌وعده‌ی صبح',
  lunch: 'ناهار',
  snack2: 'میان‌وعده‌ی عصر',
  dinner: 'شام',
};

// a plain snack logged from this hour on was the afternoon one
export const SNACK2_HOUR = 15;

export const isSnack = m => m === 'snack' || m === 'snack1' || m === 'snack2';
export const baseMeal = m => (isSnack(m) ? 'snack' : m);
export const mealLabel = m => MEALS5[m] || MEALS[m];

// Which of the five an entry belongs to: a plain snack by the hour it was logged.
export function meal5(e) {
  if (e.meal !== 'snack') return e.meal;
  const at = new Date(e.created_at);
  return !Number.isNaN(at.getTime()) && at.getHours() >= SNACK2_HOUR ? 'snack2' : 'snack1';
}

// The meal for now, of the five: like mealForNow, with the snack split at SNACK2_HOUR.
export function meal5ForNow(meal4, hour = new Date().getHours()) {
  if (meal4 !== 'snack') return meal4;
  return hour >= SNACK2_HOUR ? 'snack2' : 'snack1';
}
