import { suite, test, eq } from './harness.js';
import { shopList, toBuy, shopAdd, shopMatch, neededFoods, shopText } from '../js/domain/shopping.js';

const FOODS = [{ id: 'milk', name: 'شیر کم‌چرب' }, { id: 'egg', name: 'تخم‌مرغ' }];
const item = o => ({ id: 'x', name: 'x', amount: '', food_id: null, done: false, at: '2026-10-01', ...o });
const LIST = [
  item({ id: 'a', name: 'تخم‌مرغ', amount: '۶ عدد', food_id: 'egg' }),
  item({ id: 'b', name: 'ماست', done: true }),
];

suite('shopping', () => {
  test('the list is the shop notes, oldest first', () => {
    const notes = [
      { kind: 'shop', data: item({ id: '2', name: 'نان', at: '2026-10-02' }) },
      { kind: 'recipe', data: { name: 'قیمه' } },
      { kind: 'shop', data: item({ id: '1', name: 'پنیر', at: '2026-10-01' }) },
    ];
    eq(shopList(notes).map(i => i.name), ['پنیر', 'نان']);
  });

  test('a new item is cleaned up and linked to the bank food of the same name', () => {
    eq(shopAdd([], [{ name: '  شیر  کم چرب ', amount: ' ۲ بطری ' }], FOODS, 'T'),
      [{ name: 'شیر کم چرب', amount: '۲ بطری', food_id: 'milk', done: false, at: 'T' }]);
  });

  test('what is already waiting is not added twice, in the list or in one batch', () => {
    eq(shopAdd(LIST, [{ name: 'تخم مرغ' }, { name: '' }], FOODS), []);
    eq(shopAdd([], [{ name: 'سیب' }, { name: 'سيب' }], FOODS).length, 1);
  });

  test('a new amount updates the waiting item; a bought one comes back', () => {
    eq(shopAdd(LIST, [{ name: 'تخم‌مرغ', amount: '۱۲ عدد' }], FOODS)[0], { ...LIST[0], amount: '۱۲ عدد' });
    eq(shopAdd(LIST, [{ name: 'ماست', amount: '۱ سطل' }], FOODS, 'T')[0], { ...LIST[1], amount: '۱ سطل', done: false, at: 'T' });
  });

  test('bought items are matched by name, loosely, among those still to buy', () => {
    eq(shopMatch(LIST, ['تخم مرغ', 'ماست']).map(i => i.id), ['a']);
    eq(shopMatch([item({ id: 'c', name: 'شیر کم‌چرب' })], ['شیر']).map(i => i.id), ['c']);
  });

  test('needed foods and the shared text only count what is still to buy', () => {
    eq(toBuy(LIST).length, 1);
    eq(neededFoods(LIST), new Set(['egg']));
    eq(shopText(LIST), '▫️ تخم‌مرغ (۶ عدد)');
  });
});
