/*
  The quality of a day's eating, beside its calories (the rebuilt «امروز», REDESIGN.md). Pure.

  - Vegetables and fruit: servings of about 80 g (vegServings in stats.js), five a day, the WHO's
    «at least 400 g of fruit and vegetables». A vegetable is a food logged as one (is_veg); a fruit
    is a food of the fruit category (dates and raisins are not: they are in «آجیل و خرما»).
  - Sweets: the calories of foods tagged as sugary or a sweet drink (health.js), against 10% of
    the day's target, the WHO's limit for free sugars. The bank has no grams of sugar, so this
    counts the whole food (honey, jam, pastries, soft drinks): a little more than the sugar in it,
    the safe side for a warning.
*/
import { vegServings } from './stats.js';

export const VEG_FRUIT_GOAL = 5;
export const SWEET_SHARE = 0.1;

// `tagsOf(food)`: its health tags (foodTags in ai/foodTags.js), or null when not known.
export function dayQuality(entries, foods, day, kcalTarget, tagsOf = () => null) {
  const byId = new Map(foods.map(f => [f.id, f]));
  let veg = 0, sweet = 0;
  for (const e of entries) {
    if (e.day !== day) continue;
    const f = e.food_id ? byId.get(e.food_id) : null;
    if (e.is_veg || f?.category === 'fruit') veg += vegServings(e);
    const tags = (f && tagsOf(f)) || [];
    if (tags.includes('sugary') || tags.includes('sweetDrink')) sweet += Number(e.kcal) || 0;
  }
  return {
    veg: Math.round(veg * 2) / 2, vegGoal: VEG_FRUIT_GOAL,
    sweet: Math.round(sweet), sweetMax: Math.round((Number(kcalTarget) || 0) * SWEET_SHARE),
  };
}

// Whether a meal's foods have a vegetable in them (its leaf on «امروز»).
export const hasVeg = items => items.some(e => e.is_veg);
