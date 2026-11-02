import { suite, test, eq, ok, near } from './harness.js';
import { eatingPattern, sharesFrom, optionUse, markFresh, PATTERN } from '../js/domain/pattern.js';
import { budgets, buildPlan, optionBudget, dayRooms, slotExtras, SLOTS } from '../js/domain/plan.js';
import { addDays } from '../js/lib/dates.js';

const DAY = '2026-03-01';
const entry = (day, meal, kcal, name = meal) => ({ id: `${day}-${meal}-${name}`, day, meal, kcal, name, unit: 'واحد', qty: 1, food_id: null });
// n full days ending yesterday, the same meals each day
const log = (n, meals) => Array.from({ length: n }, (_, i) => Object.entries(meals).map(([m, k]) => entry(addDays(DAY, -1 - i), m, k))).flat();
const sumOf = s => Object.values(s).reduce((a, b) => a + b, 0);

const food = (id, unit, kcal) => ({ id, name: id, unit, kcal, protein: 5, grams: 100, is_veg: false, created_at: '2026-01-01T00:00:00Z' });
const FOODS = [food('rice', 'کفگیر', 100), food('stew', 'کفگیر', 150), food('apple', 'عدد', 80), food('egg', 'عدد', 75), food('bread', 'کف‌دست', 80), food('milk', 'لیوان', 100)];
const opts = (...qs) => ({ pick: 1, options: qs.map(q => ({ title: q[0], items: [{ food_id: q[0], qty: q[1] }] })) });

suite('pattern', () => {
  test('too few full days: not ready, and says how many are missing', () => {
    const m = eatingPattern(log(10, { lunch: 800, dinner: 600 }), [], DAY);
    eq([m.ready, m.days, m.need], [false, 10, PATTERN.MIN_DAYS - 10]);
  });

  test('days with one meal logged do not count', () => {
    const m = eatingPattern(log(30, { lunch: 800 }), [], DAY);
    eq([m.ready, m.days], [false, 0]);
  });

  test('shares follow their habit and add up to the whole day', () => {
    // the real shape that started this: a big lunch, hardly any snacks
    const m = eatingPattern(log(20, { breakfast: 520, lunch: 800, dinner: 540, snack: 140 }), [], DAY);
    ok(m.ready);
    eq(m.eaten, { breakfast: 26, lunch: 40, dinner: 27, snack: 7 });
    near(sumOf(m.shares), 1, 1e-9);
    ok(m.shares.lunch > SLOTS.lunch.share, `lunch ${m.shares.lunch}`);
    eq([m.shares.snack1, m.shares.snack2], [PATTERN.SNACK[0], PATTERN.SNACK[0]]); // held at the lowest a snack can be
  });

  test('no share runs past its limits, even for a very lopsided day', () => {
    const s = sharesFrom({ breakfast: 50, lunch: 1900, dinner: 50 });
    ok(s.lunch <= PATTERN.MAIN[1] + 0.011, `lunch ${s.lunch}`);
    ok(s.breakfast >= PATTERN.MAIN[0] - 0.001 && s.dinner >= PATTERN.MAIN[0] - 0.001);
    ok(s.snack1 >= PATTERN.SNACK[0] - 0.001);
    near(sumOf(s), 1, 1e-9);
  });

  test('a day with a ticked plan option shows the plan, not the habit, so it does not count', () => {
    const entries = log(20, { lunch: 800, dinner: 600 });
    const notes = Array.from({ length: 10 }, (_, i) => {
      const day = addDays(DAY, -1 - i);
      return { key: `pick:${day}`, kind: 'pick', data: { slots: { lunch: [{ o: 'lunch-1', e: [`${day}-lunch-lunch`] }] } } };
    });
    eq(eatingPattern(entries, notes, DAY).days, 10);
  });

  test('usual foods per meal, most logged first, with the usual amount; one-offs are left out', () => {
    const e = (i, meal, name, qty) => ({ ...entry(addDays(DAY, -1 - i), meal, 300, name), qty });
    const entries = [...log(20, { lunch: 800, dinner: 600 })];
    [1, 2, 3].forEach(i => entries.push(e(i, 'lunch', 'برنج', 2)));
    entries.push(e(4, 'lunch', 'برنج', 4), e(5, 'lunch', 'سوپ', 1));
    const m = eatingPattern(entries, [], DAY);
    const rice = m.usual.lunch.find(u => u.name === 'برنج');
    eq([rice.n, rice.qty], [4, 2]);
    ok(!m.usual.lunch.some(u => u.name === 'سوپ'));
    eq(m.usual.lunch[0].name, 'lunch'); // logged 20 times
  });

  test('a plan keeps its own shares: budgets, an option and what is left all follow them', () => {
    const shares = { breakfast: 0.25, snack1: 0.05, lunch: 0.4, snack2: 0.05, dinner: 0.25 };
    eq(budgets(2000, shares), { breakfast: 500, snack1: 100, lunch: 800, snack2: 100, dinner: 500 });
    eq(budgets(2000).lunch, 600); // a plan without them stays as it was
    const raw = { slots: {
      breakfast: opts(['egg', 6.5], ['bread', 6]), snack1: opts(['milk', 1], ['egg', 1.5]),
      lunch: opts(['rice', 8], ['stew', 5.5]), snack2: opts(['milk', 1], ['egg', 1.5]), dinner: opts(['rice', 5], ['stew', 3.5]),
    } };
    const plan = buildPlan(raw, FOODS, 2000, DAY, shares);
    ok(plan);
    eq(plan.shares, shares);
    eq(optionBudget(plan, 'lunch'), 800);
    const rooms = dayRooms(plan, {}, slotExtras([], {}, {}, DAY), []);
    eq(rooms.lunch.budget, 800);
  });

  test('how often each option was picked, in the plan in force', () => {
    const plan = { start: addDays(DAY, -5), days: 14, kcal: 2000, slots: { lunch: { pick: 1, options: [{ id: 'a', title: 'چلو', items: [] }, { id: 'b', title: 'خوراک', items: [] }] } } };
    const notes = [{ key: `plan:${plan.start}`, kind: 'plan', data: plan, text: '' }];
    const entries = [];
    for (const i of [1, 2]) {
      const d = addDays(DAY, -i);
      entries.push({ id: `e${i}`, day: d, meal: 'lunch', kcal: 500 });
      notes.push({ key: `pick:${d}`, kind: 'pick', data: { slots: { lunch: [{ o: 'a', e: [`e${i}`] }] } } });
    }
    const u = optionUse(notes, entries, DAY);
    eq(u.days, 2);
    eq(u.options.map(o => [o.title, o.n]), [['چلو', 2], ['خوراک', 0]]);
    eq(optionUse([], [], DAY), null);
  });

  test('an option with a food they have not been eating is marked; vegetables do not count', () => {
    const pattern = { ready: true, foods: new Set(['rice']) };
    const plan = { slots: { lunch: { options: [
      { id: 'a', items: [{ food_id: 'rice', name: 'rice' }, { food_id: 's', name: 'salad', is_veg: true }] },
      { id: 'b', items: [{ food_id: 'tofu', name: 'tofu' }] },
    ] } } };
    markFresh(plan, pattern);
    eq(plan.slots.lunch.options.map(o => !!o.fresh), [false, true]);
    const same = { slots: { lunch: { options: [{ id: 'c', items: [{ food_id: 'tofu', name: 'tofu' }] }] } } };
    eq(markFresh(same, { ready: false }).slots.lunch.options[0].fresh, undefined);
  });
});
