import { suite, test, eq } from './harness.js';
import { dayQuality, hasVeg } from '../js/domain/quality.js';
import { SEED_TAGS } from '../js/domain/health.js';

const foods = [
  { id: 'apple', name: 'سیب', category: 'fruit' },
  { id: 'date', name: 'خرما', category: 'nuts' },
  { id: 'honey', name: 'عسل', category: 'breakfast' },
  { id: 'soda', name: 'نوشابه', category: 'drink' },
  { id: 'salad', name: 'سالاد', category: 'veg', is_veg: true },
];
const tagsOf = f => SEED_TAGS[f.name] || [];
const day = '2026-11-13';

suite('quality', () => {
  test('vegetables and fruit count in servings, dates do not', () => {
    const es = [
      { day, food_id: 'salad', is_veg: true, qty: 1, unit: 'کاسه' },
      { day, food_id: 'apple', qty: 2, unit: 'عدد' },
      { day, food_id: 'date', qty: 3, unit: 'عدد' },
      { day, name: 'خیار', is_veg: true, qty: 160, unit: 'گرم' },
      { day: '2026-11-12', food_id: 'apple', qty: 5, unit: 'عدد' },
    ];
    const q = dayQuality(es, foods, day, 1800, tagsOf);
    eq([q.veg, q.vegGoal], [5, 5]);
  });

  test('sweets: the calories of sugary foods and sweet drinks, against 10% of the target', () => {
    const es = [
      { day, food_id: 'honey', kcal: 65, qty: 1 },
      { day, food_id: 'soda', kcal: 140, qty: 1 },
      { day, food_id: 'apple', kcal: 80, qty: 1 },
    ];
    const q = dayQuality(es, foods, day, 1800, tagsOf);
    eq([q.sweet, q.sweetMax], [205, 180]);
  });

  test('a meal has a vegetable', () => {
    eq(hasVeg([{ is_veg: false }, { is_veg: true }]), true);
    eq(hasVeg([{ is_veg: false }]), false);
  });
});
