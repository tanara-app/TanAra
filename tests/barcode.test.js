import { suite, test, eq, near } from './harness.js';
import { validBarcode, labelFood, offFood } from '../js/domain/barcode.js';

suite('barcode', () => {
  test('check digits are verified', () => {
    eq(validBarcode('3017620422003'), true);
    eq(validBarcode('3017620422004'), false);
    eq(validBarcode('96385074'), true);
    eq(validBarcode('036000291452'), true);
    eq(validBarcode('12345'), false);
    eq(validBarcode('abc'), false);
    eq(validBarcode(null), false);
  });

  test('a small pack becomes one «بسته» of its weight', () => {
    const f = labelFood({ name: 'چیپس', kcal100: 540, protein100: 6, packG: 60 });
    eq([f.unit, f.grams], ['بسته', 60]);
    near(f.kcal, 324); near(f.protein, 3.6);
  });

  test('a big pack, or an unknown size, is a weighed food per gram', () => {
    const f = labelFood({ name: 'ماست', kcal100: 65, protein100: 3.5, packG: 900 });
    eq([f.unit, f.grams], ['گرم', 1]);
    near(f.kcal, 0.65); near(f.protein, 0.035);
    eq(labelFood({ kcal100: 100 }).unit, 'گرم');
  });

  test('impossible label numbers are refused', () => {
    eq(labelFood({ kcal100: 1200 }), null);
    eq(labelFood({ kcal100: -1 }), null);
    eq(labelFood({ kcal100: 'x' }), null);
    eq(labelFood({ kcal100: 100, protein100: 150 }), null);
  });

  test('an Open Food Facts product is read', () => {
    const f = offFood({
      product_name: 'Nutella', brands: 'Nutella, Ferrero', product_quantity: '400',
      categories_tags: ['en:breakfasts', 'en:spreads', 'en:sweet-spreads'],
      nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3 },
    });
    eq([f.name, f.unit, f.kcal100, f.protein100, f.category], ['Nutella', 'گرم', 539, 6.3, 'sweet']);
  });

  test('kJ only is converted; brand joins the name; no energy at all is nothing', () => {
    const f = offFood({ product_name: 'Doogh', brands: 'Kalleh', product_quantity: 300, categories_tags: ['en:beverages'], nutriments: { energy_100g: 125.52 } });
    eq([f.name, f.unit, f.kcal100, f.category], ['Doogh Kalleh', 'بسته', 30, 'drink']);
    eq(offFood({ product_name: 'x', nutriments: {} }), null);
    eq(offFood(null), null);
  });
});
