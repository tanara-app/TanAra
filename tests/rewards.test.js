import { suite, test, eq, ok } from './harness.js';
import { fullRuns, earnedNow, REWARDS } from '../js/domain/rewards.js';
import { addDays } from '../js/lib/dates.js';

const DAY = '2026-03-01';
// a full day: two meals
const full = d => [{ day: d, meal: 'lunch' }, { day: d, meal: 'dinner' }];
const run = (from, n) => Array.from({ length: n }, (_, i) => full(addDays(from, i))).flat();

suite('rewards', () => {
  test('the longest run of full days, and the one going on now', () => {
    const e = [...run('2026-01-01', 10), ...run('2026-02-20', 9)]; // up to 2026-02-28 = yesterday
    eq(fullRuns(e, [], DAY), { best: 10, now: 9 });
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

  test('earned at the full run, and stays earned', () => {
    const r = REWARDS.parniyan.run;
    ok(!earnedNow('parniyan', { best: r - 1, now: 0 }));
    ok(earnedNow('parniyan', { best: r, now: 0 }));
    ok(earnedNow('parniyan', { best: 0, now: 0 }, { parniyan: '2026-01-01' }));
  });
});
