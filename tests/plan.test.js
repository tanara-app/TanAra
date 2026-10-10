import { suite, test, eq, ok, near } from './harness.js';
import { budgets, fitOption, buildPlan, optionBudget, planOn, previousPlan, planEnd, planDayNo, planOver, picksOn, dayAdherence, adherence, newFoods, optionText, SLOTS } from '../js/domain/plan.js';

const food = (id, unit, kcal, protein = 0, extra = {}) => ({ id, name: id, unit, kcal, protein, grams: 100, is_veg: false, created_at: '2026-01-01T00:00:00Z', ...extra });
const FOODS = [
  food('rice', 'کفگیر', 100, 2), food('stew', 'کفگیر', 150, 10), food('bread', 'کف‌دست', 80, 3),
  food('cheese', 'گرم', 2.5, 0.2, { grams: 1 }), food('egg', 'عدد', 75, 6), food('apple', 'عدد', 80, 0),
  food('yogurt', 'کاسه', 100, 6), food('salad', 'کاسه', 30, 1, { is_veg: true }), food('cake', 'برش', 300, 3),
];
const byId = new Map(FOODS.map(f => [f.id, f]));
const opt = (...items) => ({ title: 'x', items: items.map(([food_id, qty]) => ({ food_id, qty })) });

suite('plan', () => {
  test('the day is split 25 / 10 / 30 / 10 / 25', () => {
    eq(budgets(2000), { breakfast: 500, snack1: 200, lunch: 600, snack2: 200, dinner: 500 });
    near(Object.values(SLOTS).reduce((s, x) => s + x.share, 0), 1, 1e-9);
  });

  test('calories come from the bank, not from the model', () => {
    const o = fitOption({ title: ' ناهار ', items: [{ food_id: 'rice', qty: 3, kcal: 9999 }, { food_id: 'stew', qty: 2 }] }, byId, 600, 'lunch-1');
    eq([o.kcal, o.protein, o.title, o.id], [600, 26, 'ناهار', 'lunch-1']);
    eq(o.items.map(i => [i.name, i.qty, i.kcal, i.grams]), [['rice', 3, 300, 300], ['stew', 2, 300, 200]]);
  });

  test('an option off its budget is scaled in measurable steps and lands within 15%', () => {
    const o = fitOption(opt(['rice', 6], ['stew', 4]), byId, 600, 'a'); // 1200 kcal as given
    ok(Math.abs(o.kcal / 600 - 1) <= 0.15, `kcal ${o.kcal}`);
    ok(o.items.every(i => (i.qty * 2) % 1 === 0), 'half-unit steps');
  });

  test('weighed foods move in 5 g steps', () => {
    const o = fitOption(opt(['bread', 2], ['cheese', 33]), byId, 250, 'a');
    eq(o.items[1].qty % 5, 0);
    eq(o.items[1].grams, null); // already in grams
  });

  test('unknown foods are dropped; an option that cannot fit is refused', () => {
    eq(fitOption(opt(['ghost', 1]), byId, 500, 'a'), null);
    eq(fitOption(opt(['ghost', 1], ['egg', 2]), byId, 150, 'a').items.length, 1);
    eq(fitOption(opt(['cake', 1]), byId, 100, 'a'), null); // half a slice is still 150
    eq(fitOption({ items: [] }, byId, 100, 'a'), null);
  });

  test('salad is left as the model gave it', () => {
    const o = fitOption(opt(['rice', 8], ['salad', 1]), byId, 430, 'a');
    eq(o.items.find(i => i.name === 'salad').qty, 1);
  });

  const raw = () => ({
    note: 'n',
    slots: {
      breakfast: { pick: 1, options: [opt(['bread', 3], ['egg', 2], ['cheese', 40]), opt(['bread', 4], ['yogurt', 2])] },
      snack1: { pick: 2, options: [opt(['apple', 1]), opt(['yogurt', 1]), opt(['egg', 1])] },
      lunch: { pick: 1, options: [opt(['rice', 3], ['stew', 2]), opt(['rice', 4], ['egg', 2], ['salad', 1])] },
      snack2: { pick: 1, options: [opt(['apple', 2.5]), opt(['yogurt', 2])] },
      dinner: { pick: 1, options: [opt(['bread', 2], ['stew', 2]), opt(['rice', 2], ['stew', 2])] },
    },
    free: [{ food_id: 'salad' }, { food_id: 'cake' }, { food_id: 'salad' }, { food_id: 'ghost' }],
  });

  test('a whole plan: every slot fitted, pick 2 halves the budget, «free» only keeps what is nearly free', () => {
    const plan = buildPlan(raw(), FOODS, 2000, '2026-02-01');
    ok(plan);
    eq(plan.slots.snack1.pick, 2);
    eq(optionBudget(plan, 'snack1'), 100);
    eq(optionBudget(plan, 'lunch'), 600);
    for (const k of Object.keys(SLOTS)) {
      for (const o of plan.slots[k].options) ok(Math.abs(o.kcal / optionBudget(plan, k) - 1) <= 0.15, `${k} ${o.kcal}`);
    }
    eq(plan.free, [{ food_id: 'salad', name: 'salad' }]);
    eq([plan.start, plan.days, plan.kcal], ['2026-02-01', 14, 2000]);
  });

  test('a slot left with fewer than two options means no plan', () => {
    const r = raw();
    r.slots.dinner.options = [opt(['bread', 2], ['stew', 2]), opt(['ghost', 1])];
    eq(buildPlan(r, FOODS, 2000, '2026-02-01'), null);
  });

  const plan = buildPlan(raw(), FOODS, 2000, '2026-02-01');
  const notes = [
    { key: 'plan:2026-01-10', kind: 'plan', text: 'old', data: { ...plan, start: '2026-01-10' } },
    { key: 'plan:2026-02-01', kind: 'plan', text: 'new', data: plan },
    { key: 'pick:2026-02-02', kind: 'pick', data: { slots: { lunch: [{ o: 'lunch-1', e: ['e1', 'e2'] }], snack1: [{ o: 'snack1-1', e: ['e3'] }], dinner: [{ o: 'dinner-1', e: ['gone'] }] } } },
  ];
  const entries = [{ id: 'e1', day: '2026-02-02' }, { id: 'e2', day: '2026-02-02' }, { id: 'e3', day: '2026-02-02' }];

  test('the plan in force is the latest one started, and it stays after its two weeks', () => {
    eq(planOn(notes, '2026-01-09'), null);
    eq(planOn(notes, '2026-01-31').note, 'old');
    eq([planOn(notes, '2026-03-30').note, planOn(notes, '2026-03-30').key], ['new', 'plan:2026-02-01']);
    eq(previousPlan(notes, plan).start, '2026-01-10');
    eq([planEnd(plan), planDayNo(plan, '2026-02-03'), planOver(plan, '2026-02-14'), planOver(plan, '2026-02-15')], ['2026-02-14', 3, false, true]);
  });

  test('a pick counts only while one of its entries exists; pick-2 slots need both', () => {
    const picks = picksOn(notes, entries, '2026-02-02');
    eq(Object.keys(picks).sort(), ['lunch', 'snack1']);
    eq(dayAdherence(plan, picks), { done: 1, of: 5 }); // lunch yes; snack1 has one of its two
    const a = adherence(notes, entries, '2026-02-01', '2026-02-02');
    eq([a.done, a.of, a.days.length], [1, 10, 2]);
    eq(adherence(notes, entries, '2026-01-01', '2026-01-05').of, 0);
  });

  test('new bank foods are noticed once', () => {
    const fresh = food('kiwi', 'عدد', 40, 1, { created_at: '2999-01-01T00:00:00Z' });
    const used = food('rice', 'کفگیر', 100, 2, { created_at: '2999-01-01T00:00:00Z' });
    eq(newFoods(plan, [...FOODS, fresh, used]).map(f => f.id), ['kiwi']);
    eq(newFoods({ ...plan, seenFoods: ['kiwi'] }, [...FOODS, fresh]), []);
  });

  test('plain text of an option', () => {
    eq(optionText(plan.slots.lunch.options[0]), '3 کفگیر rice + 2 کفگیر stew');
  });
});
