import { suite, test, eq, ok } from './harness.js';
import { fullRuns, progress, earnedFinishes, rewardOf, REWARDS } from '../js/domain/rewards.js';
import { addDays } from '../js/lib/dates.js';

// after every reward's `since`, so the goals below count all their days
const DAY = '2027-03-01';
// a full day: two meals
const full = d => [{ day: d, meal: 'lunch' }, { day: d, meal: 'dinner' }];
const run = (from, n) => Array.from({ length: n }, (_, i) => full(addDays(from, i))).flat();

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
    const at = n => progress({ entries: run(addDays(DAY, -n), n) }, DAY).find(x => x.reward.key === 'parniyan');
    eq([at(of - 1).earned, at(of - 1).now, at(of - 1).of], [false, of - 1, of]);
    eq([at(of).earned, at(of + 3).now], [true, of]);
    ok(progress({ earned: { parniyan: '2026-01-01' } }, DAY)[0].earned);
  });

  test('«شب‌پر»: full days in all, in a row or not', () => {
    const of = rewardOf('shab').goal.of;
    const at = e => progress({ entries: e }, DAY).find(x => x.reward.key === 'shab');
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
    const at = e => progress({ entries: e, foods }, DAY).find(x => x.reward.key === 'tangatang');
    const days = n => Array.from({ length: n }, (_, i) => good(addDays('2026-12-01', i * 3))).flat();
    eq([at(days(of - 1)).earned, at(days(of - 1)).now], [false, of - 1]);
    eq([at(days(of)).earned, at(days(of + 2)).now], [true, of]);
    eq(at(thin(DAY)).now, 0);
    // 240 g of a vegetable logged by weight = 3 servings
    eq(at([{ day: DAY, is_veg: true, unit: 'گرم', qty: 240 }, { day: DAY, food_id: 'apple', qty: 2 }]).now, 1);
    // a day after `day` does not count yet
    eq(at(good(addDays(DAY, 1))).now, 0);
  });

  test('only days from the day a reward was added count, never the days before it (2026-11-19)', () => {
    for (const r of REWARDS) ok(/^\d{4}-\d{2}-\d{2}$/.test(r.since || ''), `${r.key} has no since`);
    const shab = rewardOf('shab'), at = (e, d) => progress({ entries: e }, d).find(x => x.reward.key === 'shab');
    // 39 full days just before «شب‌پر» was added, then 3 after it: 3, not 42
    const e = [...run(addDays(shab.since, -39), 39), ...run(shab.since, 3)];
    eq([at(e, addDays(shab.since, 3)).now, at(e, addDays(shab.since, 3)).earned], [3, false]);
    // a run of «پرنیان» that started before it existed counts from its first day
    const pn = rewardOf('parniyan');
    eq(progress({ entries: run(addDays(pn.since, -10), 15) }, addDays(pn.since, 5)).find(x => x.reward.key === 'parniyan').now, 5);
    // earned before, stays earned
    ok(progress({ entries: [], earned: { shab: '2026-11-17' } }, DAY).find(x => x.reward.key === 'shab').earned);
  });

  test('only earned finishes can be worn', () => {
    eq(earnedFinishes({}).length, 0);
    eq(earnedFinishes({ parniyan: '2026-01-01' }).map(r => r.key), ['parniyan']);
    eq(earnedFinishes({ shab: '2026-01-01', parniyan: '2026-01-01' }).map(r => r.key), ['parniyan', 'shab']);
  });
});
