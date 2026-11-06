import { suite, test, eq, ok, near } from './harness.js';
import { budgets, fitOption, buildPlan, optionBudget, planOn, previousPlan, planEnd, planDayNo, planOver, picksOn, dayAdherence, adherence, newFoods, goneFoods, optionText, swapItem, restoreItem, sameItems, swapSuggestions, swapsOn, dayPlan, offOn, slotExtras, slotRoom, dayRooms, shrinkOption, roomPlan, portionFor, portionsFor, SLOTS, maxKcal, maxQty, isFree, carriesOver, CARRY_MAX, avoidTest, optionAllowed, extraOption, rescalePlan, fastPlan, fastShape, fastOn } from '../js/domain/plan.js';

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
      for (const o of plan.slots[k].options) ok(o.kcal >= optionBudget(plan, k) * 0.85 && o.kcal <= maxKcal(optionBudget(plan, k)), `${k} ${o.kcal}`);
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
    eq([a.done, a.of, a.days.length], [1, 5, 1]); // 02-01 has nothing logged: not counted
    eq(adherence(notes, entries, '2026-01-01', '2026-01-05').of, 0);
  });

  test('new bank foods are noticed once', () => {
    const fresh = food('kiwi', 'عدد', 40, 1, { created_at: '2999-01-01T00:00:00Z' });
    const used = food('rice', 'کفگیر', 100, 2, { created_at: '2999-01-01T00:00:00Z' });
    eq(newFoods(plan, [...FOODS, fresh, used]).map(f => f.id), ['kiwi']);
    eq(newFoods({ ...plan, seenFoods: ['kiwi'] }, [...FOODS, fresh]), []);
  });

  test('foods deleted from the bank are noticed once', () => {
    eq(goneFoods(plan, FOODS), []);
    const left = FOODS.filter(f => f.id !== 'rice');
    eq(goneFoods(plan, left), [{ id: 'rice', name: 'rice' }]);
    eq(goneFoods({ ...plan, seenFoods: ['rice'] }, left), []);
  });

  test('plain text of an option', () => {
    eq(optionText(plan.slots.lunch.options[0]), '3 کفگیر rice + 2 کفگیر stew');
  });

  test('swapping one food keeps the rest and matches the calories in measurable steps', () => {
    const o = fitOption(opt(['bread', 3], ['egg', 2], ['salad', 1]), byId, 420, 'b');
    const barley = food('barley', 'برش', 60, 2);
    const n = swapItem(o, 0, barley); // 240 kcal of bread → 4 slices
    eq(n.items.map(i => [i.name, i.qty]), [['barley', 4], ['egg', 2], ['salad', 1]]);
    eq([n.id, n.kcal, n.protein, n.items[0].was], ['b', 420, 21, 'bread']);
    eq(o.items[0].name, 'bread'); // the original is not touched
    eq(swapItem(o, 0, food('odd', 'عدد', 70)).items[0].qty, 3.5); // 240 / 70 = 3.4 → nearest half
    eq(swapItem(o, 1, byId.get('cheese')).items[1].qty, 60); // weighed foods in 5 g steps
    eq(swapItem(o, 0, byId.get('cake')).items[0].qty, 1); // 240 / 300 → one slice (never below half)
    eq(swapItem(o, 5, barley), null);
  });

  test('a swap of a swap aims at the original calories and forgets itself when undone', () => {
    const o = fitOption(opt(['bread', 3], ['egg', 2]), byId, 390, 'b');
    const cake = swapItem(o, 0, byId.get('cake')); // 300 kcal now
    const rice = swapItem(cake, 0, byId.get('rice'), o.items[0].kcal);
    eq([rice.items[0].qty, rice.items[0].was], [2.5, 'bread']);
    const back = swapItem(rice, 0, byId.get('bread'), o.items[0].kcal);
    eq([back.items[0].qty, back.items[0].was, back.kcal], [3, undefined, o.kcal]);
    ok(sameItems(back, o) && !sameItems(rice, o));
    eq(restoreItem(rice, 0, o), o);
    eq(restoreItem(rice, 4, o), null);
  });

  test('greens get a plain serving, not their weight in calories; the title follows the food', () => {
    const o = { ...fitOption(opt(['bread', 3], ['salad', 2]), byId, 300, 'b'), title: 'bread و سالاد' };
    const leaf = food('leaf', 'گرم', 0.2, 0, { is_veg: true, grams: 1 });
    eq(swapItem(o, 0, leaf).items[0].qty, 100);
    eq(swapItem(o, 1, food('herbs', 'کاسه', 20, 1, { is_veg: true })).items[1].qty, 2);
    eq(swapItem(o, 0, byId.get('rice')).title, 'rice و سالاد');
  });

  test('suggestions: same category, not already in the option, most eaten first', () => {
    const bank = [
      food('sangak', 'کف‌دست', 80, 3, { category: 'grain' }), food('barley', 'برش', 60, 2, { category: 'grain' }),
      food('lavash', 'کف‌دست', 50, 2, { category: 'grain' }), food('rice', 'کفگیر', 100, 2, { category: 'grain' }),
      food('feta', 'گرم', 2.5, 0.2, { category: 'dairy' }),
    ];
    const o = fitOption(opt(['sangak', 2], ['feta', 40], ['rice', 1]), new Map(bank.map(f => [f.id, f])), 360, 'b');
    const log = [{ food_id: 'lavash' }, { food_id: 'lavash' }, { food_id: 'barley' }, { food_id: null }];
    eq(swapSuggestions(o, 0, bank, log).map(f => f.id), ['lavash', 'barley']);
    eq(swapSuggestions(o, 1, bank, log), []);
    eq(swapSuggestions(o, 0, bank.slice(1), log), []); // the food is no longer in the bank
    const breads = [food('نان سنگک', 'کف‌دست', 80, 3, { category: 'grain' }), food('برنج', 'کفگیر', 100, 2, { category: 'grain' }), food('نان جو', 'برش', 60, 2, { category: 'grain' })];
    const b = fitOption(opt(['نان سنگک', 2]), new Map(breads.map(f => [f.id, f])), 160, 'b');
    eq(swapSuggestions(b, 0, breads, [{ food_id: 'برنج' }]).map(f => f.id), ['نان جو', 'برنج']); // a namesake comes before a habit
  });

  test('a swap for one day changes that day only', () => {
    const o = plan.slots.lunch.options[0];
    const mine = swapItem(o, 0, byId.get('bread'));
    const day = [...notes, { key: 'pick:2026-02-03', kind: 'pick', data: { slots: {}, swaps: { [o.id]: mine, gone: mine } } }];
    eq(swapsOn(day, '2026-02-02'), {});
    eq(dayPlan(plan, swapsOn(day, '2026-02-02')), plan);
    const p = dayPlan(plan, swapsOn(day, '2026-02-03'));
    eq(p.slots.lunch.options[0].items[0].name, 'bread');
    eq(p.slots.lunch.options.length, plan.slots.lunch.options.length);
    eq(plan.slots.lunch.options[0].items[0].name, 'rice');
  });

  test('an option made for one day shows on that day only, after the plan\'s own', () => {
    const small = { ...plan.slots.lunch.options[0], id: 'lunch-x1', slot: 'lunch' };
    const p = dayPlan(plan, { 'lunch-x1': small });
    eq(p.slots.lunch.options.length, plan.slots.lunch.options.length + 1);
    eq(p.slots.lunch.options.at(-1).id, 'lunch-x1');
    eq(p.slots.dinner.options.length, plan.slots.dinner.options.length);
  });

  test('off-plan food counts against its occasion and locks it when nothing is left', () => {
    const e = (id, meal, kcal, created_at = id) => ({ id, day: '2026-02-03', meal, kcal, created_at });
    const entries = [e('a', 'snack', 50), e('b', 'snack', 70), e('c', 'lunch', 200), e('d', 'lunch', 300), e('z', 'lunch', 999)];
    entries[4].day = '2026-02-04';
    const picks = { lunch: [{ o: 'lunch-1', e: ['d'] }] };
    const day = [{ key: 'pick:2026-02-03', kind: 'pick', data: { slots: {}, off: { a: 'snack1', c: 'dinner' } } }];
    eq(offOn(day, '2026-02-02'), {});
    const x = slotExtras(entries, picks, offOn(day, '2026-02-03'), '2026-02-03');
    eq(x.snack1.map(i => i.id), ['a']);
    eq(x.snack2.map(i => i.id), ['b']);      // not placed: the last snack of the day
    eq(x.lunch.map(i => i.id), ['c']);       // placed at dinner but logged as lunch: its meal wins
    eq(x.dinner, []);

    const b = budgets(plan.kcal);
    const lunch = slotRoom(plan, 'lunch', picks, x.lunch, entries);
    eq([lunch.eaten, lunch.left, lunch.locked], [500, b.lunch - 500, false]); // already picked: nothing to lock
    const s1 = slotRoom(plan, 'snack1', {}, x.snack1, entries);
    eq([s1.left, s1.locked], [b.snack1 - 50, false]);
    eq(slotRoom(plan, 'snack1', {}, [e('q', 'snack', b.snack1 * 0.95)], entries).locked, true);
    eq(slotRoom(plan, 'snack1', {}, [e('q', 'snack', b.snack1 + 80)], entries).left, -80);
    eq(slotRoom(plan, 'dinner', {}, [], entries).locked, false);
  });

  test('after off-plan food the options still open are cut down to what is left', () => {
    const e = (id, meal, kcal) => ({ id, day: '2026-02-03', meal, kcal, created_at: id });
    const b = budgets(plan.kcal);
    const extras = [e('x', 'lunch', b.lunch * 0.4)];
    const rooms = { lunch: slotRoom(plan, 'lunch', {}, extras, extras), dinner: slotRoom(plan, 'dinner', {}, [], []) };
    const p = roomPlan(plan, {}, rooms, byId);
    eq(p.slots.dinner, plan.slots.dinner);
    p.slots.lunch.options.forEach((o, n) => {
      const full = plan.slots.lunch.options[n];
      if (o.over) return eq(shrinkOption(full, byId, rooms.lunch.left), null);
      ok(o.fit && o.kcal <= rooms.lunch.left * 1.15, `${o.id} ${o.kcal} of ${rooms.lunch.left}`);
      eq([o.id, o.items.map(i => i.food_id)], [full.id, full.items.map(i => i.food_id)]);
    });
    ok(p.slots.lunch.options.some(o => o.fit), 'at least one option fits');
    eq(plan.slots.lunch.options.some(o => o.fit || o.over), false); // the stored plan is untouched

    // an option already ticked stays as it was eaten
    const first = plan.slots.lunch.options[0];
    const picked = roomPlan(plan, { lunch: [{ o: first.id, e: ['x'] }] }, rooms, byId);
    eq(picked.slots.lunch, plan.slots.lunch);
    // a food that left the bank: the option can't be resized
    eq(shrinkOption(first, new Map(), 100), null);
  });

  test('calories eaten over an occasion are taken off the later ones still open', () => {
    const e = (id, meal, kcal) => ({ id, day: '2026-02-03', meal, kcal, created_at: id });
    const b = budgets(plan.kcal);
    const none = { breakfast: [], snack1: [], lunch: [], snack2: [], dinner: [] };
    const sumOf = (r, k) => Object.values(r).reduce((t, x) => t + x[k], 0);
    eq(sumOf(dayRooms(plan, {}, none, []), 'owed'), 0);

    // breakfast eaten off-plan, 200 over: shared by the size of the budgets
    const big = e('x', 'breakfast', b.breakfast + 200);
    let r = dayRooms(plan, {}, { ...none, breakfast: [big] }, [big]);
    eq([r.breakfast.owed, r.breakfast.left, r.breakfast.locked, r.breakfast.passed], [0, -200, true, 200]);
    near(sumOf(r, 'owed'), 200, 2);
    ok(r.lunch.owed > r.dinner.owed && r.dinner.owed > r.snack1.owed, 'the bigger the meal, the more it gives');
    eq(r.lunch.left, b.lunch - r.lunch.owed);
    eq(r.dinner.passed, 0);
    const cut = roomPlan(plan, {}, r, byId);
    ok(cut.slots.lunch.options.every(o => o.over || o.kcal <= r.lunch.left * 1.15), 'lunch options are cut down');

    // lunch then eaten as planned in full: it paid nothing, so the rest owes it all
    const l = e('l', 'lunch', b.lunch);
    const picks = { lunch: Array.from({ length: plan.slots.lunch.pick }, () => ({ o: 'lunch-1', e: ['l'] })) };
    r = dayRooms(plan, picks, { ...none, breakfast: [big] }, [big, l]);
    eq(r.lunch.owed, 0);
    near(r.snack1.owed + r.snack2.owed + r.dinner.owed, 200, 2);
    // eaten 120 under instead: that much of the debt is gone
    l.kcal = b.lunch - 120;
    r = dayRooms(plan, picks, { ...none, breakfast: [big] }, [big, l]);
    near(r.snack1.owed + r.snack2.owed + r.dinner.owed, 80, 2);

    // more than the rest of the day holds: each later meal gives up at most 30%, the rest is let go
    const huge = e('h', 'breakfast', plan.kcal);
    r = dayRooms(plan, {}, { ...none, breakfast: [huge] }, [huge]);
    ok(['snack1', 'lunch', 'snack2', 'dinner'].every(k => !r[k].locked && r[k].owed <= Math.round(b[k] * CARRY_MAX) && r[k].left >= b[k] * 0.69), 'none emptied');
    ok(r.breakfast.passed > 0 && r.breakfast.dropped > 0, 'part of it is dropped');

    // with an eating-disorder history (or a teen) nothing is carried at all
    r = dayRooms(plan, {}, { ...none, breakfast: [big] }, [big], { carry: false });
    eq([sumOf(r, 'owed'), r.breakfast.passed, r.breakfast.kept, r.breakfast.locked], [0, 0, true, true]);
    eq([carriesOver({ edHistory: 'no', age: 30 }), carriesOver({ edHistory: 'unsure', age: 30 }), carriesOver({ edHistory: 'no', age: 16 })], [true, false, false]);

    // over at dinner: nothing after it, so the earlier ones still open take it, by what they have left
    const late = e('d', 'dinner', b.dinner + 300);
    r = dayRooms(plan, {}, { ...none, dinner: [late] }, [late]);
    eq([r.dinner.owed, r.dinner.passed], [0, 300]);
    near(sumOf(r, 'owed'), 300, 2);
    ok(r.lunch.back > r.snack1.back, 'the more a meal has left, the more it takes back');
    // and with every earlier one picked in full, nobody is charged
    const full = Object.fromEntries(['breakfast', 'snack1', 'lunch', 'snack2'].map(k => [k, Array.from({ length: plan.slots[k].pick }, () => ({ o: `${k}-1`, e: [k] }))]));
    const ate = ['breakfast', 'snack1', 'lunch', 'snack2'].map(k => e(k, SLOTS[k].meal, b[k]));
    r = dayRooms(plan, full, { ...none, dinner: [late] }, [...ate, late]);
    eq([sumOf(r, 'owed'), r.dinner.passed], [0, 0]);
  });

  test('a portion is the most of a food that fits what is left, in measurable steps', () => {
    eq(portionFor(byId.get('rice'), 260), { qty: 2.5, free: false, capped: false });
    eq(portionFor(byId.get('cheese'), 99), { qty: 35, free: false, capped: false });
    eq(portionFor(byId.get('cake'), 100), { qty: 0.25, free: false, capped: false });
    eq(portionFor(byId.get('cake'), 60), null);
    eq(portionFor(byId.get('rice'), 0), null);
    eq(portionFor(byId.get('salad'), 900), { qty: 3, free: false, capped: true });
    eq(portionFor(byId.get('cheese'), 5000).qty, 400);
    eq(portionFor(food('water', 'لیوان', 0), 0), { qty: 1, free: true, capped: false });
  });

  test('foods eaten together share what is left, about equally by calories', () => {
    const qtys = (foods, kcal) => portionsFor(foods.map(f => byId.get(f)), kcal).map(p => p && p.qty);
    // 500 kcal: rice (100) and stew (150) — 250 each would be 2.5 and 1.67, steps make it 2.5 + 1.5
    eq(qtys(['rice', 'stew'], 500), [2.5, 1.5]);
    // never over what is left
    for (const k of [90, 230, 410, 777]) {
      const fs = ['rice', 'cheese', 'egg'].map(f => byId.get(f));
      const total = portionsFor(fs, k).reduce((t, p, i) => t + (p ? p.qty * fs[i].kcal : 0), 0);
      ok(total <= k, `${total} <= ${k}`);
    }
    // too little for both: the first one a step of which fits gets it, the other none
    eq(qtys(['cake', 'apple'], 90), [0.25, null]);
    // a free food takes nothing from the others
    eq(portionsFor([byId.get('rice'), food('tea', 'لیوان', 0)], 200), [{ qty: 2, free: false, capped: false }, { qty: 1, free: true, capped: false }]);
    // one food alone is the same as portionFor
    eq(portionsFor([byId.get('rice')], 260), [portionFor(byId.get('rice'), 260)]);
  });
});

suite('plan safeguards', () => {
  const f = (id, unit, kcal, protein, category, extra = {}) => ({ id, name: id, unit, kcal, protein, grams: 100, is_veg: false, category, ...extra });
  const BANK = [
    f('bread', 'کف‌دست', 110, 4, 'grain'), f('cheese', 'قوطی کبریت', 80, 5, 'breakfast'), f('chicken', 'کف‌دست', 165, 31, 'protein'),
    f('soup', 'لیوان', 150, 3, 'legume'), f('apple', 'عدد', 80, 0, 'fruit'), f('yogurt', 'لیوان', 110, 7, 'dairy'),
    f('sugar', 'عدد', 16, 0, 'sweet'), f('biscuit', 'عدد', 22, 0.5, 'sweet'), f('walnut', 'عدد', 30, 0.5, 'nuts'),
    f('melon', 'لیوان', 50, 1, 'fruit'), f('cucumber', 'عدد', 15, 0.5, 'veg', { is_veg: true }), f('tea', 'استکان', 2, 0, 'drink'),
    f('cake', 'عدد', 150, 2, 'sweet'),
  ];
  const by = new Map(BANK.map(x => [x.id, x]));
  const o = (...items) => ({ title: 't', items: items.map(([food_id, qty]) => ({ food_id, qty })) });

  test('«free» is only vegetables and drinks with next to no calories, not small sweet pieces', () => {
    eq(BANK.filter(isFree).map(x => x.id), ['cucumber', 'tea']);
  });

  test('fruit and sweets are not piled up to reach a budget', () => {
    eq([maxQty(by.get('apple')), maxQty(by.get('cake')), maxQty(by.get('bread'))], [2, 1.5, Infinity]);
    const a = fitOption(o(['apple', 1]), by, 200, 'a'); // would be 2.5 apples
    ok(!a || a.items[0].qty <= 2, 'at most two apples');
    eq(fitOption(o(['apple', 1], ['yogurt', 1]), by, 200, 'a').items.map(i => i.qty), [1, 1]);
  });

  const day = (protein) => ({
    slots: {
      breakfast: { pick: 1, options: [o(['bread', 2], ['cheese', 2]), o(['soup', 3]), o(['bread', 1], ['chicken', 1])] },
      snack1: { pick: 1, options: [o(['apple', 1], ['yogurt', 0.5]), o(['yogurt', 1.5])] },
      lunch: { pick: 1, options: [o(['bread', 2], ['chicken', 2]), o(['soup', 4]), o(['bread', 3], ['chicken', 1])] },
      snack2: { pick: 1, options: [o(['apple', 1], ['yogurt', 0.5]), o(['yogurt', 1.5])] },
      dinner: { pick: 1, options: [o(['bread', 2], ['chicken', 1.5]), o(['soup', 3]), o(['bread', 1], ['chicken', 2])] },
    },
    free: [{ food_id: 'sugar' }, { food_id: 'cucumber' }, { food_id: 'walnut' }],
  });

  test('main-meal options far below the others in protein are left out while enough remain', () => {
    const p = buildPlan(day(), BANK, 2000, '2026-02-01', null, { protein: 104 });
    for (const k of ['breakfast', 'lunch', 'dinner']) ok(p.slots[k].options.every(x => !x.items.some(i => i.food_id === 'soup')), `${k}: soup alone is gone`);
    eq(p.free.map(x => x.food_id), ['cucumber']);
    // without a protein figure (kidney disease) nothing is filtered
    const q = buildPlan(day(), BANK, 2000, '2026-02-01');
    ok(q.slots.lunch.options.some(x => x.items[0].food_id === 'soup'), 'kept');
  });

  test('option ids differ between two plans made the same day', async () => {
    const a = buildPlan(day(), BANK, 2000, '2026-02-01');
    await new Promise(r => setTimeout(r, 5));
    const b = buildPlan(day(), BANK, 2000, '2026-02-01');
    ok(a.slots.breakfast.options[0].id !== b.slots.breakfast.options[0].id, 'unique');
    ok(a.slots.breakfast.options[0].id.startsWith('breakfast-'), 'still names its slot');
  });

  test('a snack logged in the morning counts for the morning snack', () => {
    const at = (h) => { const d = new Date(2026, 1, 3, h); return d.toISOString(); };
    const es = [{ id: 'm', day: '2026-02-03', meal: 'snack', kcal: 100, created_at: at(10) }, { id: 'e', day: '2026-02-03', meal: 'snack', kcal: 100, created_at: at(18) },
      { id: 'later', day: '2026-02-03', meal: 'snack', kcal: 100, created_at: new Date(2026, 1, 5, 9).toISOString() }];
    const x = slotExtras(es, {}, {}, '2026-02-03');
    eq([x.snack1.map(i => i.id), x.snack2.map(i => i.id)], [['m'], ['e', 'later']]);
  });

  test('a swap never piles up fruit either', () => {
    const opt = fitOption(o(['bread', 2], ['cheese', 2]), by, 380, 'x');
    eq(swapItem(opt, 0, by.get('apple')).items[0].qty, 2);
  });
});

suite('plan round 2', () => {
  const f = (id, name, unit, kcal, protein, category) => ({ id, name, unit, kcal, protein, grams: 100, is_veg: false, category });
  const BANK = [
    f('b', 'نان سنگک', 'کف‌دست', 110, 4, 'grain'), f('c', 'پنیر سفید', 'قوطی کبریت', 80, 5, 'breakfast'), f('w', 'گردو (مغز کامل)', 'عدد', 30, 0.5, 'nuts'),
    f('m', 'شیر کم‌چرب', 'لیوان', 105, 8, 'dairy'), f('s', 'شیرینی تر (خامه‌ای)', 'عدد', 150, 2, 'sweet'), f('e', 'املت گوجه (۲ تخم‌مرغ)', 'پرس', 220, 13, 'breakfast'),
    f('ch', 'سینه مرغ', 'کف‌دست', 165, 31, 'protein'), f('r', 'برنج سفید', 'کفگیر', 180, 3, 'grain'), f('y', 'ماست کم‌چرب', 'لیوان', 110, 7, 'dairy'),
    f('a', 'سیب', 'عدد', 80, 0, 'fruit'),
  ];
  const by = new Map(BANK.map(x => [x.id, x]));
  const o = (...it) => ({ title: 't', items: it.map(([food_id, qty]) => ({ food_id, qty })) });

  test('allergies are matched on whole words and by group; dislikes as written', () => {
    const lact = avoidTest({ allergies: 'لاکتوز' });
    eq(BANK.filter(lact).map(x => x.id), ['c', 'm', 's', 'y']); // the cream pastry by «خامه»
    eq(BANK.filter(avoidTest({ dislikes: 'شیر' })).map(x => x.id), ['m']); // whole words: not «شیرینی»
    eq(BANK.filter(avoidTest({ allergies: 'تخم مرغ، گردو' })).map(x => x.id), ['w', 'e']);
    eq(BANK.filter(avoidTest({ dislikes: 'مرغ' })).map(x => x.id), ['e', 'ch']);
    eq(avoidTest({}), null);
  });

  const raw = () => ({ slots: {
    breakfast: { pick: 1, options: [o(['b', 2], ['c', 2], ['w', 3]), o(['e', 1], ['b', 2.5]), o(['b', 2], ['c', 3])] },
    snack1: { pick: 1, options: [o(['y', 1], ['a', 1]), o(['m', 2])] },
    lunch: { pick: 1, options: [o(['r', 2], ['ch', 1.5]), o(['r', 2.5], ['ch', 1]), o(['r', 2], ['ch', 2.5])] },
    snack2: { pick: 1, options: [o(['y', 1], ['a', 1]), o(['m', 2])] },
    dinner: { pick: 1, options: [o(['b', 2], ['ch', 1.5]), o(['b', 3], ['c', 2]), o(['r', 1.5], ['ch', 1.5])] },
  }, free: [] });

  test('a plan never keeps an option with a food they must avoid', () => {
    const p = buildPlan(raw(), BANK, 2000, '2026-02-01', null, { avoid: avoidTest({ allergies: 'گردو' }) });
    ok(p.slots.breakfast.options.every(x => !x.items.some(i => i.food_id === 'w')), 'no walnuts');
  });

  test('kidney disease: a main meal far above its share of the protein limit is left out', () => {
    const rules = { kcal: 2000, protein: 59, proteinMax: true };
    const p = buildPlan(raw(), BANK, 2000, '2026-02-01', null, { ...rules, partial: true });
    for (const k of ['lunch', 'dinner']) ok(p.slots[k].options.every(x => x.protein <= 1.5 * 59 * (k === 'lunch' ? 0.3 : 0.25)), k);
    ok(p.missing.includes('lunch'), 'lunch is short and asked for again');
    const low = extraOption(o(['r', 2.5], ['y', 1]), BANK, p, 'lunch', rules);
    ok(low && optionAllowed(low, 'lunch', 1, rules), 'a moderate one is taken');
    eq(extraOption(o(['ch', 3], ['r', 1]), BANK, p, 'lunch', rules), null);
  });

  test('the plan refitted to a new target keeps its options', () => {
    const p = buildPlan(raw(), BANK, 2000, '2026-02-01');
    const up = rescalePlan(p, 2300, by);
    eq(up.kcal, 2300);
    eq(up.slots.lunch.options[0].id, p.slots.lunch.options[0].id);
    ok(up.slots.lunch.options.every(x => x.kcal >= 690 * 0.85 && x.kcal <= maxKcal(690) && !x.fit), 'fitted to 690');
  });

  test('a fasting day: سحری from lunch, افطار from breakfast, شام from dinner, three to count', () => {
    const p = buildPlan(raw(), BANK, 2000, '2027-02-01');
    const fp = fastPlan(p, by);
    eq(Object.keys(fp.slots).filter(k => fp.slots[k].pick > 0), ['breakfast', 'snack2', 'dinner']);
    eq(fp.slots.breakfast.options[0].items.map(i => i.food_id), p.slots.lunch.options[0].items.map(i => i.food_id));
    ok(fp.slots.breakfast.options.every(x => x.kcal <= maxKcal(800) && x.kcal >= 680 && x.fast), 'سحری is 40%');
    eq([fp.labels.breakfast, fp.labels.snack2], ['سحری', 'افطار']);
    eq(dayAdherence(fastShape(p), { breakfast: [{}], dinner: [{}] }), { done: 2, of: 3 });
    // said once, it holds for the next days of Ramadan; never outside it
    const notes = [{ key: 'pick:2027-02-10', kind: 'pick', data: { slots: {}, fast: true } }, { key: 'pick:2027-02-13', kind: 'pick', data: { slots: {}, fast: false } }];
    eq(['2027-02-09', '2027-02-10', '2027-02-12', '2027-02-14', '2027-03-12'].map(d => fastOn(notes, d)), [false, true, true, false, false]);
  });

  test('eating well past a picked option counts as overeating; a little over does not', () => {
    const p = buildPlan(raw(), BANK, 2000, '2026-02-01');
    const opt = p.slots.lunch.options[0];
    const day = '2026-02-03';
    const es = [{ id: 'l', day, meal: 'lunch', kcal: opt.kcal + 400, created_at: 'x' }];
    const picks = { lunch: [{ o: opt.id, e: ['l'] }] };
    const none = { breakfast: [], snack1: [], lunch: [], snack2: [], dinner: [] };
    let r = dayRooms(p, picks, none, es);
    ok(r.lunch.passed > 0 && r.dinner.owed > 0, 'carried on');
    es[0].kcal = opt.kcal + 40;
    r = dayRooms(p, picks, none, es);
    eq(r.dinner.owed, 0);
  });
});
