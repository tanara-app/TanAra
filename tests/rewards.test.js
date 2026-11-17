import { suite, test, eq, ok } from './harness.js';
import { fullRuns, progress, earnedFinishes, rewardOf } from '../js/domain/rewards.js';
import { addDays } from '../js/lib/dates.js';

const DAY = '2026-03-01';
// a full day: two meals
const full = d => [{ day: d, meal: 'lunch' }, { day: d, meal: 'dinner' }];
const run = (from, n) => Array.from({ length: n }, (_, i) => full(addDays(from, i))).flat();

suite('rewards', () => {
  test('the longest run of full days, and the one going on now', () => {
    const e = [...run('2026-01-01', 10), ...run('2026-02-20', 9)]; // up to 2026-02-28 = yesterday
    eq(fullRuns(e, [], DAY), { best: 10, now: 9, total: 19 });
  });

  test('today counts once it is full; until then the run ends yesterday', () => {
    const e = run('2026-02-25', 4);
    eq(fullRuns(e, [], DAY).now, 4);
    eq(fullRuns([...e, ...full(DAY)], [], DAY).now, 5);
    eq(fullRuns([...e, { day: DAY, meal: 'breakfast' }], [], DAY).now, 4);
  });

  test('a day of one meal breaks the run, unless they said it was all they ate', () => {
    const e = [...run('2026-02-20', 3), { day: '2026-02-23', meal: 'lunch' }, ...run('2026-02-24', 5)];
    eq(fullRuns(e, [], DAY).best, 5);
    eq(fullRuns(e, [{ key: 'logday:2026-02-23', kind: 'logday', data: { full: true } }], DAY).best, 9);
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
    const gappy = n => Array.from({ length: n }, (_, i) => run(addDays('2025-01-01', i * 7), 5)).flat();
    eq([at(gappy(7)).earned, at(gappy(7)).now], [false, 35]);
    eq([at(gappy(8)).earned, at(gappy(8)).now], [true, of]);
    eq(at(gappy(8)).now <= of, true);
  });

  test('only earned finishes can be worn', () => {
    eq(earnedFinishes({}).length, 0);
    eq(earnedFinishes({ parniyan: '2026-01-01' }).map(r => r.key), ['parniyan']);
    eq(earnedFinishes({ shab: '2026-01-01', parniyan: '2026-01-01' }).map(r => r.key), ['parniyan', 'shab']);
  });
});
