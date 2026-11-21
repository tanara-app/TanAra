import { suite, test, eq, ok } from './harness.js';
import { dayEnds, usualLogTime, autoTime, logTimeFor, USUAL_MIN } from '../js/domain/timing.js';
import { addDays } from '../js/lib/dates.js';

const D0 = '2027-02-01';
// an entry of day `i` logged at hh:mm on day `i + next` (the zone is plain: the iso is 'day|min')
const at = (i, hh, mm = 0, next = 0) => ({ day: addDays(D0, i), created_at: `${addDays(D0, i + next)}|${hh * 60 + mm}` });
const local = iso => { const [day, min] = iso.split('|'); return { day, min: Number(min) }; };

suite('timing (BAZGASHT.md phase 8)', () => {
  test("each day's last entry, from that day's midnight; 1 am counts for the evening before", () => {
    eq(dayEnds([at(0, 9), at(0, 21, 30), at(1, 1, 0, 1)], local), [21 * 60 + 30, 25 * 60]);
  });

  test('a day filled in later says nothing about the hour', () => {
    eq(dayEnds([at(0, 10, 0, 1), at(1, 20)], local), [20 * 60]);
  });

  test('half an hour after the usual end, rounded to a quarter', () => {
    const ends = Array.from({ length: 9 }, (_, i) => 19 * 60 + 20 + i); // 19:20 to 19:28, median 19:24
    eq(usualLogTime(ends), '20:00');
  });

  test('kept between 19:00 and 23:00', () => {
    eq(usualLogTime(Array(10).fill(14 * 60)), '19:00');
    eq(usualLogTime(Array(10).fill(25 * 60)), '23:00');
  });

  test('too few days: no time of its own', () => {
    eq(usualLogTime(Array(USUAL_MIN - 1).fill(20 * 60)), null);
    ok(usualLogTime(Array(USUAL_MIN).fill(20 * 60)));
  });

  test('the last 28 logged days only', () => {
    eq(usualLogTime([...Array(40).fill(22 * 60), ...Array(28).fill(19 * 60 + 30)]), '20:00');
  });

  test('only for a time they never set themselves', () => {
    ok(autoTime({ on: true, at: '21:00' }));          // the old default, from before «خودکار»
    ok(autoTime({}));
    ok(!autoTime({ on: true, at: '18:00' }));         // chosen
    ok(!autoTime({ at: '21:00', auto: false }));      // 21:00 picked on purpose
    ok(autoTime({ at: '18:00', auto: true }));
    const ends = Array(10).fill(19 * 60 + 30);
    eq(logTimeFor({ at: '21:00' }, ends), '20:00');
    eq(logTimeFor({ at: '18:00' }, ends), '18:00');
    eq(logTimeFor({ at: '21:00' }, []), '21:00');
  });
});
