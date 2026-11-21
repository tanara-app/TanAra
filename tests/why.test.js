import { suite, test, eq, ok } from './harness.js';
import { REASONS, reasonLabel, quietEnd, quietOn, whyKey, answered, QUIET_DAYS } from '../js/domain/why.js';
import { addDays } from '../js/lib/dates.js';

const D = '2027-03-01';

suite('why (BAZGASHT.md phase 7)', () => {
  test('six reasons, each with its words', () => {
    eq(REASONS.map(([k]) => k), ['time', 'hard', 'results', 'mood', 'forgot', 'notnow']);
    eq(reasonLabel('forgot'), 'فقط یادم رفت');
    eq(reasonLabel('nope'), '');
  });

  test('a month of quiet: its last day included, then over', () => {
    const until = quietEnd(D);
    eq(until, addDays(D, QUIET_DAYS - 1));
    ok(quietOn({ quietUntil: until }, D));
    ok(quietOn({ quietUntil: until }, until));
    ok(!quietOn({ quietUntil: until }, addDays(until, 1)));
    ok(!quietOn({}, D));
    ok(!quietOn(null, D));
  });

  test('asked once per absence', () => {
    const notes = [{ key: whyKey('2027-02-20'), kind: 'why', data: { reason: 'time' } }];
    ok(answered(notes, '2027-02-20'));
    ok(!answered(notes, '2027-02-25'));
    ok(!answered(undefined, '2027-02-20'));
  });
});
