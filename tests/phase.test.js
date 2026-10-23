import { suite, test, eq, ok, near } from './harness.js';
import { goalReached, goalProgress, breakDue, regain, withPhase, lossStart, BREAK_DAYS, zone, correctionDue, lightDue, lightOn, lapse, milestone, maintainWeeks } from '../js/domain/phase.js';
import { phaseOn, correcting } from '../js/domain/targets.js';

const w = (day, kg) => ({ day, kg });

suite('phase', () => {
  test('goal reached needs the 7-day average of at least two weigh-ins at or under the goal', () => {
    const p = { goalKg: 80 };
    eq(goalReached(p, [w('2026-01-09', 79.5)], '2026-01-10'), null);                       // one reading
    eq(goalReached(p, [w('2026-01-08', 80.6), w('2026-01-10', 79.8)], '2026-01-10'), null); // average 80.2
    near(goalReached(p, [w('2026-01-08', 80.2), w('2026-01-10', 79.6)], '2026-01-10').avg, 79.9, 1e-9);
    eq(goalReached({}, [w('2026-01-08', 70), w('2026-01-10', 70)], '2026-01-10'), null);    // no goal set
    eq(goalReached({ goalKg: 80, phase: 'maintain' }, [w('2026-01-08', 79), w('2026-01-10', 79)], '2026-01-10'), null);
  });

  test('goal progress', () => {
    const g = goalProgress({ goalKg: 80 }, [w('2026-01-01', 100), w('2026-02-01', 90)], '2026-02-01');
    eq([g.left, g.done], [10, 0.5]);
    eq(goalProgress({}, [w('2026-01-01', 100)], '2026-01-01'), null);
    eq(goalProgress({ goalKg: 80 }, [w('2026-01-01', 100), w('2026-02-01', 78)], '2026-02-01'), { left: 0, done: 1 });
  });

  test('a diet break is offered after twelve weeks of losing in a row', () => {
    eq(breakDue({ startDate: '2026-01-01' }, '2026-03-25'), null);            // 11 weeks 6 days
    eq(breakDue({ startDate: '2026-01-01' }, '2026-03-26').weeks, 12);
    eq(breakDue({ startDate: '2026-01-01', phase: 'maintain' }, '2026-06-01'), null);
  });

  test('the count starts again after a break or a spell of maintenance', () => {
    const p = { startDate: '2026-01-01', breakFrom: '2026-03-27', breakUntil: '2026-04-09' };
    eq(lossStart(p), '2026-04-10');
    eq(breakDue(p, '2026-04-01'), null);                                     // on the break
    eq(breakDue(p, '2026-05-01'), null);                                     // 3 weeks since
    eq(lossStart({ startDate: '2026-01-01', lossSince: '2026-05-01' }), '2026-05-01');
  });

  test('regain in maintenance: 2 kg above where it began', () => {
    const p = { phase: 'maintain', maintainFrom: { day: '2026-01-01', kg: 80 } };
    eq(regain(p, [w('2026-02-01', 81.9)], '2026-02-01'), null);
    near(regain(p, [w('2026-02-01', 82.4)], '2026-02-01').gain, 2.4, 1e-9);
    eq(regain({ maintainFrom: { kg: 80 } }, [w('2026-02-01', 90)], '2026-02-01'), null);  // not in maintenance
  });

  test('changing phase', () => {
    const p = { startDate: '2026-01-01', goalKg: 80 };
    const m = withPhase(p, 'maintain', { day: '2026-04-01', kg: 79.8 });
    eq([phaseOn(m, '2026-04-02'), m.maintainFrom], ['maintain', { day: '2026-04-01', kg: 79.8 }]);
    const l = withPhase(m, 'loss', { day: '2026-05-01' });
    eq([phaseOn(l, '2026-05-01'), l.lossSince, l.maintainFrom], ['loss', '2026-05-01', null]);
    const b = withPhase(p, 'break', { day: '2026-04-01' });
    eq([b.breakFrom, b.breakUntil, phaseOn(b, '2026-04-14'), phaseOn(b, '2026-04-15')], ['2026-04-01', '2026-04-14', 'break', 'loss']);
    ok(BREAK_DAYS === 14);
  });

  test('ending a break early', () => {
    const b = withPhase({ startDate: '2026-01-01' }, 'break', { day: '2026-04-01' });
    const e = withPhase(b, 'endBreak', { day: '2026-04-05' });
    eq([e.breakUntil, phaseOn(e, '2026-04-05'), phaseOn(e, '2026-04-04'), e.lossSince], ['2026-04-04', 'loss', 'break', '2026-04-05']);
    const same = withPhase(b, 'endBreak', { day: '2026-04-01' });               // started and cancelled the same day
    eq([same.breakFrom, same.breakUntil, phaseOn(same, '2026-04-01')], [null, null, 'loss']);
  });

  test('the band around the weight being held', () => {
    const p = { phase: 'maintain', maintainFrom: { day: '2026-01-01', kg: 80 } };
    const at = kg => zone(p, [w('2026-02-01', kg)], '2026-02-01').zone;
    eq([at(80), at(80.9), at(81), at(81.9), at(82), at(78.1), at(78)], ['green', 'green', 'yellow', 'yellow', 'red', 'green', 'low']);
    eq(zone({ maintainFrom: { kg: 80 } }, [w('2026-02-01', 85)], '2026-02-01'), null);  // not in maintenance
    eq(zone(p, [], '2026-02-01'), null);                                               // no weigh-in this week
    eq([zone(p, [w('2026-02-01', 80)], '2026-02-01').lo, zone(p, [w('2026-02-01', 80)], '2026-02-01').hi], [79, 81]);
  });

  test('a correction: offered in yellow, two weeks, not while one runs', () => {
    const p = { phase: 'maintain', maintainFrom: { day: '2026-01-01', kg: 80 } };
    const yellow = [w('2026-02-01', 81.3)];
    ok(correctionDue(p, yellow, '2026-02-01'));
    eq(correctionDue(p, [w('2026-02-01', 80.3)], '2026-02-01'), null);
    const c = withPhase(p, 'correct', { day: '2026-02-01' });
    eq([c.correctFrom, c.correctUntil, correcting(c, '2026-02-14'), correcting(c, '2026-02-15')], ['2026-02-01', '2026-02-14', true, false]);
    eq(correctionDue(c, yellow, '2026-02-01'), null);
    eq(correcting(withPhase(c, 'endCorrect', {}), '2026-02-05'), false);
    eq(withPhase(c, 'loss', { day: '2026-02-05' }).correctUntil, null);
  });

  test('light logging: offered after six weeks in the band, suspended above it', () => {
    const p = { phase: 'maintain', maintainFrom: { day: '2026-01-01', kg: 80 } };
    const ok80 = [w('2026-02-12', 80.2)];
    eq(lightDue(p, ok80, '2026-02-11'), false);                // 5 weeks 6 days
    eq(lightDue(p, [w('2026-02-12', 80.2)], '2026-02-12'), true);
    eq(lightDue(p, [w('2026-02-12', 81.2)], '2026-02-12'), false);
    const l = withPhase(p, 'light', {});
    eq([lightOn(l, ok80, '2026-02-12'), lightOn(l, [w('2026-02-12', 81.2)], '2026-02-12'), lightOn(p, ok80, '2026-02-12')], [true, false, false]);
    eq(lightOn(withPhase(l, 'full', {}), ok80, '2026-02-12'), false);
    eq(maintainWeeks(p, '2026-01-15'), 2);
  });

  test('a lapse in weighing', () => {
    eq(lapse([w('2026-02-01', 80)], '2026-02-10'), null);
    eq(lapse([w('2026-02-01', 80)], '2026-02-11'), { days: 10, last: '2026-02-01' });
    eq(lapse([w('2026-02-01', 80)], '2026-02-15', 14), null);   // they weigh every two weeks
    eq(lapse([w('2026-02-01', 80)], '2026-02-18', 14).days, 17);
    eq(lapse([], '2026-02-18'), null);
  });

  test('milestones of maintenance, while fresh and in the band', () => {
    const p = { phase: 'maintain', maintainFrom: { day: '2026-01-31', kg: 80 } };
    const at = (day, kg = 80) => milestone(p, [w(day, kg)], day);
    eq(at('2026-02-27'), null);
    eq(at('2026-02-28'), { months: 1, day: '2026-02-28' });     // a month on, short February
    eq(at('2026-03-20'), { months: 1, day: '2026-02-28' });
    eq(at('2026-03-21'), null);                                // three weeks later: stale
    eq(at('2026-04-30'), { months: 3, day: '2026-04-30' });
    eq(at('2026-04-30', 81.5), null);                          // above the band
  });

  test('switching to maintenance remembers where losing ended', () => {
    const m = withPhase({ startDate: '2026-01-01' }, 'maintain', { day: '2026-04-01', kg: 79.8, kcal: 1850 });
    eq(m.maintainFrom, { day: '2026-04-01', kg: 79.8, kcal: 1850 });
  });
});
