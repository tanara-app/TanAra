import { suite, test, eq, ok } from './harness.js';
import { pauseOn, pausedDays, startPause, endPause, lastPauseEnd, PAUSE_MAX } from '../js/domain/pause.js';
import { progress, REWARDS } from '../js/domain/rewards.js';
import { drift } from '../js/domain/drift.js';
import { addDays } from '../js/lib/dates.js';

const D = '2027-03-01';
const full = d => [{ day: d, meal: 'lunch' }, { day: d, meal: 'dinner' }];
const run = (from, n) => Array.from({ length: n }, (_, i) => full(addDays(from, i))).flat();
const ALL = REWARDS.map(r => ({ key: r.key, from: '2026-01-01', to: null }));

suite('pause', () => {
  test('a pause from today, at most two weeks', () => {
    eq(startPause([], D, 3), [{ from: D, to: '2027-03-03' }]);
    eq(startPause([], D, 99), [{ from: D, to: addDays(D, PAUSE_MAX - 1) }]);
    eq(startPause(null, D, 0), [{ from: D, to: D }]);
  });

  test('on, off, and the days of past pauses', () => {
    const p = [{ from: '2027-02-10', to: '2027-02-12' }, { from: D, to: '2027-03-05' }];
    ok(pauseOn(p, '2027-03-03'));
    ok(!pauseOn(p, '2027-02-20'));
    eq([...pausedDays(p, '2027-03-02')], ['2027-02-10', '2027-02-11', '2027-02-12', D, '2027-03-02']);
    eq(lastPauseEnd(p, D), '2027-02-12');
    eq(lastPauseEnd(p, '2027-03-09'), '2027-03-05');
    eq(lastPauseEnd([], D), null);
  });

  test('ending: gone if it began today, else it ends yesterday; a new one replaces it', () => {
    eq(endPause([{ from: D, to: '2027-03-05' }], D), []);
    eq(endPause([{ from: '2027-02-27', to: '2027-03-05' }], D), [{ from: '2027-02-27', to: '2027-02-28' }]);
    eq(endPause([{ from: '2027-02-10', to: '2027-02-12' }], D), [{ from: '2027-02-10', to: '2027-02-12' }]);
    eq(startPause([{ from: '2027-02-27', to: '2027-03-05' }], D, 1), [{ from: '2027-02-27', to: '2027-02-28' }, { from: D, to: D }]);
  });

  test('a paused day does not break a run of full days; a full one still counts', () => {
    const e = [...run('2027-02-15', 5), ...run('2027-02-23', 6)]; // 2027-02-20 to 22 empty
    const parniyan = paused => progress({ plan: ALL, entries: e, paused }, D).find(x => x.reward.key === 'parniyan');
    eq(parniyan(new Set()).now, 6);
    const three = pausedDays([{ from: '2027-02-20', to: '2027-02-22' }], D);
    eq(parniyan(three).now, 11);
    eq(parniyan(pausedDays([{ from: '2027-02-20', to: '2027-02-21' }], D)).now, 11); // one empty day left unpaused: «ققنوس» brings it back
    eq(parniyan(pausedDays([{ from: '2027-02-20', to: '2027-02-20' }], D)).now, 6);  // two: it breaks for good
    const inside = [...run('2027-02-15', 5), ...full('2027-02-21'), ...run('2027-02-23', 6)];
    eq(progress({ plan: ALL, entries: inside, paused: three }, D).find(x => x.reward.key === 'parniyan').now, 12);
  });

  test('no drift signs during a pause or in the week after it', () => {
    const weights = [{ day: addDays(D, -30), kg: 80 }, { day: addDays(D, -5), kg: 81 }];
    ok(drift({ weights }, D));
    eq(drift({ weights, paused: pausedDays([{ from: addDays(D, -7), to: addDays(D, -6) }], D) }, D), null);
    ok(drift({ weights, paused: pausedDays([{ from: addDays(D, -12), to: addDays(D, -9) }], D) }, D));
  });
});
