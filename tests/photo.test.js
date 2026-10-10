import { suite, test, eq } from './harness.js';
import { photoItems } from '../js/domain/photo.js';

const FOODS = [
  { id: 'rice', name: 'برنج', unit: 'کفگیر', grams: 80, kcal: 100, protein: 2, is_veg: false },
  { id: 'salad', name: 'سالاد', unit: 'کاسه', grams: null, kcal: 30, protein: 1, is_veg: true },
  { id: 'cheese', name: 'پنیر', unit: 'گرم', grams: 1, kcal: 2.5, protein: 0.2, is_veg: false },
];
const it = o => ({ name: 'x', food_id: '', qty: 1, unit: 'پرس', kcal: 100, protein: 5, is_veg: false, ...o });

suite('photo', () => {
  test('a bank food takes its calories from the bank, whatever the model said', () => {
    const [a] = photoItems({ items: [it({ name: 'برنج سفید', food_id: 'rice', qty: 2.5, unit: 'کفگیر', kcal: 999, protein: 99 })] }, FOODS);
    eq(a, { food_id: 'rice', name: 'برنج', unit: 'کفگیر', qty: 2.5, kcal: 250, protein: 5, is_veg: false, bank: true });
  });

  test('a bank food given in grams is converted through the weight of its unit', () => {
    eq(photoItems({ items: [it({ food_id: 'rice', qty: 200, unit: 'گرم' })] }, FOODS)[0].kcal, 250);
    eq(photoItems({ items: [it({ food_id: 'cheese', qty: 40, unit: 'گرم' })] }, FOODS)[0], { food_id: 'cheese', name: 'پنیر', unit: 'گرم', qty: 40, kcal: 100, protein: 8, is_veg: false, bank: true });
  });

  test('when the bank cannot say (no weight, or another unit) the estimate stands, unlinked', () => {
    const [a] = photoItems({ items: [it({ name: 'سالاد', food_id: 'salad', qty: 150, unit: 'گرم', kcal: 40, protein: 1.26, is_veg: true })] }, FOODS);
    eq(a, { food_id: null, name: 'سالاد', unit: 'گرم', qty: 150, kcal: 40, protein: 1.3, is_veg: true, bank: false });
  });

  test('foods not in the bank keep the model\'s numbers', () => {
    const [a] = photoItems({ items: [it({ name: 'کوکو سبزی', qty: 2, unit: 'برش', kcal: 310.4, protein: 12 })] }, FOODS);
    eq([a.food_id, a.kcal, a.protein, a.bank], [null, 310, 12, false]);
  });

  test('nonsense is dropped', () => {
    eq(photoItems({ items: [it({ qty: 0 }), it({ name: ' ' }), it({ kcal: 50000 }), it({ kcal: -5 }), it({ qty: 500 }), it({ food_id: 'ghost', qty: 1 })] }, FOODS).length, 1);
    eq(photoItems(null, FOODS), []);
    eq(photoItems({ items: [] }, FOODS), []);
  });
});
