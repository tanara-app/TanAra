/*
  The meals an entry is logged in. Pure, with no imports, so any module can use it.

  The four everyone sees: صبحانه، ناهار، شام، میان‌وعده ('snack'). The rebuilt «امروز» (REDESIGN.md, beta
  `eat`) shows five: the snack between breakfast and lunch stays 'snack' (میان‌وعده‌ی صبح) and the one
  between lunch and dinner is 'snack2' (میان‌وعده‌ی عصر, allowed in the database from 2026-11-12). Every
  view that knows four meals counts 'snack2' as the snack (baseMeal).
*/
export const MEALS = {
  breakfast: 'صبحانه',
  lunch: 'ناهار',
  dinner: 'شام',
  snack: 'میان‌وعده',
};

export const MEALS5 = {
  breakfast: 'صبحانه',
  snack: 'میان‌وعده‌ی صبح',
  lunch: 'ناهار',
  snack2: 'میان‌وعده‌ی عصر',
  dinner: 'شام',
};

// a snack logged from this hour on, before they had five meals, was the afternoon one
export const SNACK2_HOUR = 15;

export const baseMeal = m => (m === 'snack2' ? 'snack' : m);
export const mealLabel = m => (m === 'snack2' ? MEALS5.snack2 : MEALS[m]);

/*
  Which of the five an entry belongs to. `from`: the day they first had five meals (profile.fiveFrom);
  a snack from before it (when both snacks were 'snack') goes by the hour it was logged.
*/
export function meal5(e, from) {
  if (e.meal !== 'snack' || !(e.day < from)) return e.meal;
  const at = new Date(e.created_at);
  return !Number.isNaN(at.getTime()) && at.getHours() >= SNACK2_HOUR ? 'snack2' : 'snack';
}

// The meal for now, of the five: like mealForNow, with the snack split at SNACK2_HOUR.
export function meal5ForNow(meal4, hour = new Date().getHours()) {
  return meal4 === 'snack' && hour >= SNACK2_HOUR ? 'snack2' : meal4;
}
