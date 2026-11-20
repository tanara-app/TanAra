import { suite, test, eq, ok } from './harness.js';
import { fullRuns, progress, earnedFinishes, rewardOf, REWARDS, recipeDays, goalText, goalRules, pick, activeKey, turnDays } from '../js/domain/rewards.js';
import { addDays } from '../js/lib/dates.js';

// after every reward's `since`, so the goals below count all their days
const DAY = '2027-03-01';
// a full day: two meals
const full = d => [{ day: d, meal: 'lunch' }, { day: d, meal: 'dinner' }];
const run = (from, n) => Array.from({ length: n }, (_, i) => full(addDays(from, i))).flat();
// For the goal tests below: every reward has a turn from long ago (each still starts at its `since`).
// In the app only one is picked at a time (pick); the counting itself is per reward.
const ALL = REWARDS.map(r => ({ key: r.key, from: '2026-01-01', to: null }));

suite('rewards', () => {
  test('the longest run of full days, and the one going on now', () => {
    const e = [...run('2027-01-01', 10), ...run('2027-02-20', 9)]; // up to 2027-02-28 = yesterday
    eq(fullRuns(e, [], DAY), { best: 10, now: 9, total: 19 });
  });

  test('today counts once it is full; until then the run ends yesterday', () => {
    const e = run('2027-02-25', 4);
    eq(fullRuns(e, [], DAY).now, 4);
    eq(fullRuns([...e, ...full(DAY)], [], DAY).now, 5);
    eq(fullRuns([...e, { day: DAY, meal: 'breakfast' }], [], DAY).now, 4);
  });

  test('a day of one meal breaks the run, unless they said it was all they ate', () => {
    const e = [...run('2027-02-20', 3), { day: '2027-02-23', meal: 'lunch' }, ...run('2027-02-24', 5)];
    eq(fullRuns(e, [], DAY).best, 5);
    eq(fullRuns(e, [{ key: 'logday:2027-02-23', kind: 'logday', data: { full: true } }], DAY).best, 9);
  });

  test('earned at the full run, and stays earned; progress stops at the goal', () => {
    const of = rewardOf('parniyan').goal.of;
    const at = n => progress({ plan: ALL, entries: run(addDays(DAY, -n), n) }, DAY).find(x => x.reward.key === 'parniyan');
    eq([at(of - 1).earned, at(of - 1).now, at(of - 1).of], [false, of - 1, of]);
    eq([at(of).earned, at(of + 3).now], [true, of]);
    ok(progress({ plan: ALL, earned: { parniyan: '2026-01-01' } }, DAY)[0].earned);
  });

  test('«شب‌پر»: full days in all, in a row or not', () => {
    const of = rewardOf('shab').goal.of;
    const at = e => progress({ plan: ALL, entries: e }, DAY).find(x => x.reward.key === 'shab');
    // runs of 5 with a gap between, all before today
    const gappy = n => Array.from({ length: n }, (_, i) => run(addDays('2026-12-01', i * 7), 5)).flat();
    eq([at(gappy(7)).earned, at(gappy(7)).now], [false, 35]);
    eq([at(gappy(8)).earned, at(gappy(8)).now], [true, of]);
    eq(at(gappy(8)).now <= of, true);
  });

  test('«تنگاتنگ»: days with 5 servings of vegetables and fruit, in a row or not', () => {
    const of = rewardOf('tangatang').goal.of;
    const foods = [{ id: 'apple', category: 'fruit' }, { id: 'rice', category: 'grain' }];
    // 3 servings of salad (is_veg) and 2 apples (a fruit of the bank) = 5; rice never counts
    const good = d => [{ day: d, is_veg: true, qty: 3 }, { day: d, food_id: 'apple', qty: 2 }, { day: d, food_id: 'rice', qty: 4 }];
    const thin = d => [{ day: d, is_veg: true, qty: 2 }, { day: d, food_id: 'apple', qty: 2 }];
    const at = e => progress({ plan: ALL, entries: e, foods }, DAY).find(x => x.reward.key === 'tangatang');
    const days = n => Array.from({ length: n }, (_, i) => good(addDays('2026-12-01', i * 3))).flat();
    eq([at(days(of - 1)).earned, at(days(of - 1)).now], [false, of - 1]);
    eq([at(days(of)).earned, at(days(of + 2)).now], [true, of]);
    eq(at(thin(DAY)).now, 0);
    // 240 g of a vegetable logged by weight = 3 servings
    eq(at([{ day: DAY, is_veg: true, unit: 'گرم', qty: 240 }, { day: DAY, food_id: 'apple', qty: 2 }]).now, 1);
    // a day after `day` does not count yet
    eq(at(good(addDays(DAY, 1))).now, 0);
  });

  test('«پِفِردینگر»: days with something from their own recipes, in a row or not', () => {
    const r = rewardOf('pfeffer');
    eq([r.kind, r.goal.type], ['buddy', 'recipeDays']);
    eq(goalText(r), `${r.goal.of} روز غذا از رسپی‌های خودت`);
    // one recipe in the bank (food 'ash'), one only as a recipe (logged by its name)
    const notes = [
      { key: 'recipe:1', kind: 'recipe', data: { name: 'آش رشته', food_id: 'ash', items: [{}] } },
      { key: 'recipe:2', kind: 'recipe', data: { name: 'کوکو سبزی', food_id: null, items: [{}] } },
    ];
    const e = [
      { day: '2027-02-01', food_id: 'ash' }, { day: '2027-02-01', name: 'کوکو سبزی' }, // the same day twice: one day
      { day: '2027-02-03', name: ' کوکو سبزی ' },
      { day: '2027-02-04', food_id: 'rice', name: 'آش رشته' }, // another bank food that happens to share the name: no
      { day: '2027-02-05', name: 'نان' },
      { day: '2027-03-02', food_id: 'ash' }, // after `day`: not yet
    ];
    eq(recipeDays(e, notes, DAY), 2);
    const at = n => progress({ plan: ALL, entries: Array.from({ length: n }, (_, i) => ({ day: addDays('2027-01-01', i * 2), food_id: 'ash' })), notes }, DAY).find(x => x.reward.key === 'pfeffer');
    eq([at(r.goal.of - 1).earned, at(r.goal.of - 1).now], [false, r.goal.of - 1]);
    eq([at(r.goal.of).earned, at(r.goal.of + 4).now], [true, r.goal.of]);
    // without recipes nothing counts
    eq(recipeDays(e, [], DAY), 0);
  });

  test('only days from the day a reward was added count, never the days before it (2026-11-19)', () => {
    for (const r of REWARDS) ok(/^\d{4}-\d{2}-\d{2}$/.test(r.since || ''), `${r.key} has no since`);
    const shab = rewardOf('shab'), at = (e, d) => progress({ plan: ALL, entries: e }, d).find(x => x.reward.key === 'shab');
    // 39 full days just before «شب‌پر» was added, then 3 after it: 3, not 42
    const e = [...run(addDays(shab.since, -39), 39), ...run(shab.since, 3)];
    eq([at(e, addDays(shab.since, 3)).now, at(e, addDays(shab.since, 3)).earned], [3, false]);
    // a run of «پرنیان» that started before it existed counts from its first day
    const pn = rewardOf('parniyan');
    eq(progress({ plan: ALL, entries: run(addDays(pn.since, -10), 15) }, addDays(pn.since, 5)).find(x => x.reward.key === 'parniyan').now, 5);
    // earned before, stays earned
    ok(progress({ plan: ALL, entries: [], earned: { shab: '2026-11-17' } }, DAY).find(x => x.reward.key === 'shab').earned);
  });

  test('every reward explains its goal: what counts, that only the picked one counts, and where it is used', () => {
    for (const r of REWARDS) {
      const rules = goalRules(r, String);
      ok(rules.length >= 3, `${r.key}: too few rules`);
      ok(rules.some(t => t.includes('انتخابش کرده‌ای')), `${r.key}: no word on picking`);
      ok(rules.every(t => t && !t.includes('undefined')), `${r.key}: an empty line`);
    }
    // what a full day is, for both kinds of full-day goal; a run says it must be in a row, the total says not
    const run = goalRules(rewardOf('parniyan')).join(' '), all = goalRules(rewardOf('shab')).join(' ');
    ok(run.includes('دو وعده') && all.includes('دو وعده'));
    ok(run.includes('پشت‌سرهم باشد') && all.includes('لازم نیست پشت‌سرهم'));
    ok(goalRules(rewardOf('tangatang')).join(' ').includes('80 گرم'));
    ok(goalRules(rewardOf('pfeffer')).join(' ').includes('«رسپی‌ها»'));
  });

  test('one reward at a time: only the picked one counts, from the day it is picked (2026-11-20)', () => {
    const e = run('2027-02-01', 28); // every day of February full
    // nothing picked: nothing counts
    ok(progress({ entries: e }, DAY).every(x => x.now === 0 && !x.earned && !x.active));
    // «شب‌پر» picked on the 10th: 19 days (10th to 28th), and «پرنیان», never picked, none
    const plan = pick([], 'shab', '2027-02-10');
    const at = (p, k) => progress({ entries: e, plan: p }, DAY).find(x => x.reward.key === k);
    eq([at(plan, 'shab').now, at(plan, 'shab').active, at(plan, 'parniyan').now], [19, true, 0]);
    eq(activeKey(plan), 'shab');
  });

  test('switching keeps what the left reward had; it goes on from there when picked again', () => {
    const e = run('2027-02-01', 28);
    let plan = pick([], 'shab', '2027-02-01');        // 1st to 9th: «شب‌پر»
    plan = pick(plan, 'parniyan', '2027-02-10');       // 10th to 19th: «پرنیان»
    plan = pick(plan, 'shab', '2027-02-20');           // 20th on: «شب‌پر» again
    const at = k => progress({ entries: e, plan }, DAY).find(x => x.reward.key === k);
    eq([at('shab').now, at('parniyan').now, at('parniyan').active], [9 + 9, 10, false]);
    // switching twice on one day leaves no empty turn
    eq(pick(pick([], 'shab', DAY), 'parniyan', DAY), [{ key: 'parniyan', from: DAY, to: null }]);
    // picking the one already picked changes nothing; null ends the turn with today in it
    eq(pick(plan, 'shab', DAY), plan);
    eq(activeKey(pick(plan, null, DAY)), null);
    eq(turnDays(pick(plan, null, DAY), 'shab', DAY).includes(DAY), true);
  });

  test('a run goes on across the days another reward had; a partial day of its own breaks it', () => {
    let plan = pick([], 'parniyan', '2027-02-05');     // 5th to 9th
    plan = pick(plan, 'shab', '2027-02-10');            // 10th to 14th: not «پرنیان»'s
    plan = pick(plan, 'parniyan', '2027-02-15');        // 15th to 28th (under its goal of 21 in all)
    const e = run('2027-02-01', 28).filter(x => x.day < '2027-02-10' || x.day > '2027-02-14'); // nothing logged 10th–14th
    const at = es => progress({ entries: es, plan }, DAY).find(x => x.reward.key === 'parniyan');
    eq(at(e).now, 5 + 14);
    // a day of one meal on the 20th (its own day) breaks it
    const broken = e.filter(x => !(x.day === '2027-02-20' && x.meal === 'dinner'));
    eq(at(broken).now, 8);
    // today (1 March, its own day) not full yet: the run up to yesterday stands
    eq(progress({ entries: [...e, { day: DAY, meal: 'lunch' }], plan }, DAY).find(x => x.reward.key === 'parniyan').now, 19);
  });

  test('only earned finishes can be worn', () => {
    eq(earnedFinishes({}).length, 0);
    eq(earnedFinishes({ parniyan: '2026-01-01' }).map(r => r.key), ['parniyan']);
    eq(earnedFinishes({ shab: '2026-01-01', parniyan: '2026-01-01' }).map(r => r.key), ['parniyan', 'shab']);
  });
});
