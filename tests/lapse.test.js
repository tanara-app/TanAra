import { suite, test, eq, ok } from './harness.js';
import { awayDays, stateOf, lapsePush, freshDay, freshSoon, returnedAfter } from '../js/domain/lapse.js';
import { addDays } from '../js/lib/dates.js';

// 2026-11-10 is 19 Aban 1405; 2026-11-22 is 1 Azar (a fresh start); 2026-12-22 is 1 Dey.
const D = '2026-11-10';
const back = n => addDays(D, -n);

suite('lapse', () => {
  test('away: days since anything was recorded, of any kind', () => {
    eq(awayDays({ entries: [{ day: back(4) }], weights: [{ day: back(2) }] }, D), 2);
    eq(awayDays({ waists: [{ day: D }] }, D), 0);
    eq(awayDays({ activity: [{ day: back(9) }], entries: [{ day: addDays(D, 1) }] }, D), 9); // the future does not count
    eq(awayDays({}, D), null);
  });

  test('back after a month or more: the day before the return', () => {
    eq(returnedAfter({ entries: [{ day: back(40) }], weights: [{ day: D }] }, D), back(40));
    eq(returnedAfter({ entries: [{ day: back(20) }], weights: [{ day: D }] }, D), null);  // under a month
    eq(returnedAfter({ entries: [{ day: back(40) }] }, D), null);                         // nothing yet today
    eq(returnedAfter({ weights: [{ day: D }] }, D), null);                                // a first day, not a return
  });

  test('states', () => {
    eq([null, 0, 2, 3, 6, 7, 29, 30].map(stateOf), ['new', 'current', 'current', 'lapsed', 'lapsed', 'away', 'away', 'gone']);
  });

  test('fresh starts: the first of a Persian month', () => {
    ok(freshDay('2026-11-22'));
    ok(!freshDay('2026-11-21'));
    ok(freshDay('2027-03-21')); // Nowruz 1406
    ok(freshSoon('2026-11-20'));
    ok(!freshSoon('2026-11-15'));
  });

  test('the usual reminder while under three days away', () => {
    eq(lapsePush(null, [], D), null);
    eq(lapsePush(2, [], D), null);
  });

  test('day 3, nothing on day 4, day 5, nothing on day 6', () => {
    eq(lapsePush(3, [], D), 'back3');
    eq(lapsePush(4, [{ kind: 'back3', day: back(1) }], D), null);
    eq(lapsePush(4, [], D), 'back3'); // day 3 was missed: it goes a day late
    eq(lapsePush(5, [{ kind: 'back3', day: back(2) }], D), 'back5');
    eq(lapsePush(5, [{ kind: 'back3', day: back(1) }], D), null); // a day late, so the next waits
    eq(lapsePush(6, [{ kind: 'back3', day: back(3) }, { kind: 'back5', day: back(1) }], D), null);
  });

  test('the last push once, then quiet', () => {
    const before = [{ kind: 'back3', day: back(4) }, { kind: 'back5', day: back(2) }];
    eq(lapsePush(7, before, D), 'last');
    eq(lapsePush(8, [...before, { kind: 'last', day: back(1) }], D), null);
    eq(lapsePush(20, [...before, { kind: 'last', day: back(13) }], D), null);
    eq(lapsePush(13, [], D), 'last'); // away already when this began
  });

  test('the last push waits for a fresh start a few days off', () => {
    eq(lapsePush(13, [], '2026-11-20'), null);           // 1 Azar is in two days
    eq(lapsePush(15, [], '2026-11-22'), 'fresh');
    eq(lapsePush(16, [{ kind: 'fresh', day: '2026-11-22' }], '2026-11-23'), null);
    eq(lapsePush(18, [{ kind: 'fresh', day: '2026-11-22' }], '2026-11-25'), 'last');
  });

  test('fresh starts: away three days or more, rested, three at most', () => {
    eq(lapsePush(2, [], '2026-11-22'), null);
    eq(lapsePush(3, [], '2026-11-22'), 'fresh');
    eq(lapsePush(9, [{ kind: 'back5', day: '2026-11-21' }, { kind: 'last', day: '2026-11-20' }], '2026-11-22'), null); // too soon after a push
    const three = ['2026-09-23', '2026-10-23', '2026-11-22'].map(day => ({ kind: 'fresh', day }));
    eq(lapsePush(100, three.slice(0, 2), '2026-11-22'), 'fresh');
    eq(lapsePush(130, [...three, { kind: 'last', day: '2026-08-30' }], '2026-12-22'), null);
    eq(lapsePush(4, [{ kind: 'fresh', day: '2026-11-22' }], '2026-11-23'), null); // a fresh start stands for day 3
  });
});
