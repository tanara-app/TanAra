import { suite, test, eq } from './harness.js';
import { words, foodKey, similar, similarIn, missingFor, everyoneHas, groupSimilar } from '../js/domain/foodMatch.js';

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
    eq(similar(f('قورمه سبزی'), f('قورمه‌سبزی')), true);
  });

  test('a short common word or a different food is not', () => {
    eq(similar(f('نان'), f('نان سنگک')), false);
    eq(similar(f('مربا هویج'), f('مربا آلبالو')), false);
    eq(similar(f('قیمه با روغن زیتون'), f('قیمه (بدون روغن رو)')), false);
    eq(similar(f('صمون'), f('صمون عراقی')), false);
    eq(similar(f('مربا'), f('مربا آلبالو')), false);
    eq(similar(f('بادام'), f('بادام زمینی')), false);
    eq(similar(f('بادام'), f('نان بادام کریسپی')), false);
    eq(similar(f('بادام زمینی'), f('کره بادام‌زمینی')), false);
    eq(similar(f('سس مایونز'), f('سس مایونز تیفانی')), true);
  });

  test('the same barcode is similar whatever the name', () => {
    eq(similar(f('پپسی', { barcode: '6260000000001' }), f('نوشابه', { barcode: '6260000000001' })), true);
  });

  test('a food is not similar to itself in its own bank', () => {
    const a = f('نان سنگک');
    eq(similarIn(a, [a, f('نان سنگک کنجدی'), f('گردو')]).map(x => x.name), ['نان سنگک کنجدی']);
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
    eq(missingFor({ id: 'dad', joined: '2026-11-07T00:00:00Z', skip: ['گلابی'] }, all), []);
  });

  test('a food every other member already has is nothing to send', () => {
    const all = [
      { ...f('دوغ عالیس'), id: '1', user_id: 'me' }, { ...f('دوغ عالیس'), id: '2', user_id: 'mom' },
      { ...f('دوغ عالیس'), id: '3', user_id: 'dad' }, { ...f('نان جو'), id: '4', user_id: 'me' },
      { ...f('نان جو'), id: '5', user_id: 'mom' },
    ];
    eq(everyoneHas(all[0], all, ['me', 'mom', 'dad']), true);
    eq(everyoneHas(all[3], all, ['me', 'mom', 'dad']), false);
  });

  test('the same food added by several members shows once, under the first one added', () => {
    const list = [
      { ...f('نان جو'), id: 'mom', created_at: '2026-11-03' },
      { ...f('گلابی'), id: 'pear', created_at: '2026-11-02' },
      { ...f('نان  جو'), id: 'me', created_at: '2026-11-01' },
    ];
    eq(groupSimilar(list.map((x, i) => ({ ...x, user_id: ['mom', 'me', 'me'][i] }))).map(g => [g.food.id, g.also.map(x => x.id)]),
      [['me', ['mom']], ['pear', []]]);
  });

  test('two similar foods in one bank stay two', () => {
    const list = [
      { ...f('مربای آلبالو ( مجید )'), id: 'b', user_id: 'me', created_at: '2026-11-02' },
      { ...f('مربا آلبالو'), id: 'a', user_id: 'me', created_at: '2026-11-01' },
    ];
    eq(groupSimilar(list).map(g => g.food.id), ['b', 'a']);
  });
});
