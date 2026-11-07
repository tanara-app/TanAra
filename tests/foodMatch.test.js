import { suite, test, eq } from './harness.js';
import { words, foodKey, similar, similarIn, missingFor } from '../js/domain/foodMatch.js';

const f = (name, o = {}) => ({ id: name, name, barcode: null, ...o });

suite('food match', () => {
  test('names are split into plain Persian words', () => {
    eq(words('قورمه‌سبزی (بدون روغن رو)'), ['قورمه', 'سبزی', 'بدون', 'روغن', 'رو']);
    eq(words('مربای آلبالو ( مجید )'), ['مربا', 'البالو', 'مجید']);
    eq(words('كيك'), ['کیک']);
    eq(words('چای'), ['چای']);
  });

  test('word order and spacing do not change the key', () => {
    eq(foodKey('نان بادام کریسپی'), foodKey('نان  کریسپی‌بادام'));
  });

  test('the same food under another spelling is similar', () => {
    eq(similar(f('نان بادام کریسپی'), f('نان کریسپی بادام (Crispy almond bread)')), true);
    eq(similar(f('مربا آلبالو'), f('مربای آلبالو ( مجید )')), true);
    eq(similar(f('صمون'), f('صمون عراقی')), true);
    eq(similar(f('قورمه سبزی'), f('قورمه‌سبزی')), true);
  });

  test('a short common word or a different food is not', () => {
    eq(similar(f('نان'), f('نان سنگک')), false);
    eq(similar(f('مربا هویج'), f('مربا آلبالو')), false);
    eq(similar(f('قیمه با روغن زیتون'), f('قیمه (بدون روغن رو)')), false);
    eq(similar(f('صمون'), f('صمون عراقی کنجدی تازه')), false);
  });

  test('the same barcode is similar whatever the name', () => {
    eq(similar(f('پپسی', { barcode: '6260000000001' }), f('نوشابه', { barcode: '6260000000001' })), true);
  });

  test('a food is not similar to itself in its own bank', () => {
    const a = f('زیتون');
    eq(similarIn(a, [a, f('زیتون پرورده'), f('گردو')]).map(x => x.name), ['زیتون پرورده']);
  });

  test('a member who joined later misses the foods shared before, unless they have one like it', () => {
    const at = (d, o) => ({ ...f(o.name), user_id: o.user_id, decision: o.decision, decided_at: d });
    const all = [
      at('2026-11-01T10:00:00Z', { name: 'گلابی', user_id: 'mom', decision: 'shared' }),
      at('2026-11-01T10:00:00Z', { name: 'مربای آلبالو', user_id: 'mom', decision: 'shared' }),
      at('2026-11-01T10:00:00Z', { name: 'زیتون', user_id: 'mom', decision: 'declined' }),
      at('2026-11-09T10:00:00Z', { name: 'صمون', user_id: 'mom', decision: 'shared' }),
      at(null, { name: 'مربا آلبالو', user_id: 'dad', decision: null }),
    ];
    eq(missingFor({ id: 'dad', joined: '2026-11-07T00:00:00Z' }, all).map(x => x.name), ['گلابی']);
    eq(missingFor({ id: 'mom', joined: '2026-10-01T00:00:00Z' }, all), []);
  });
});
