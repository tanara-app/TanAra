import { suite, test, eq, near } from './harness.js';
import { totals, vegServings, daysLoggedInWeek, rollingAvg, weekAvg, rate4w, projectWeight, weekSummary, waistSeries, waistToHeight, measureDue, frequentFoods, lastAmountFor, activityWeek } from '../js/domain/stats.js';
import { upcoming } from '../js/domain/occasions.js';
import { weekStart, addDays, diffDays } from '../js/lib/dates.js';

const w = (day, kg) => ({ day, kg });

suite('stats', () => {
  test('weeks start on Saturday', () => {
    eq(weekStart('2026-10-10'), '2026-10-10'); // a Saturday
    eq(weekStart('2026-10-16'), '2026-10-10'); // the Friday after
    eq(weekStart('2026-10-09'), '2026-10-03');
    eq(diffDays(addDays('2026-03-20', 3), '2026-03-20'), 3); // across the Iranian new year / DST change elsewhere
  });

  test('totals; vegetables count by serving, weighed ones by 80 g', () => {
    const list = [
      { kcal: 300, protein: 20, is_veg: false, qty: 1, unit: 'پرس' },
      { kcal: 40, protein: 1, is_veg: true, qty: 2, unit: 'کاسه' },
      { kcal: 30, protein: 1, is_veg: true, qty: 120, unit: 'گرم' },
    ];
    eq(totals(list), { kcal: 370, protein: 22, veg: 3.5 });
    eq(vegServings({ qty: 40, unit: 'گرم' }), 0.5);
  });

  test('days logged in a week', () => {
    const e = [{ day: '2026-10-10' }, { day: '2026-10-10' }, { day: '2026-10-16' }, { day: '2026-10-17' }];
    eq(daysLoggedInWeek(e, '2026-10-10'), 2);
  });

  test('7-day rolling average and week average', () => {
    const s = [w('2026-01-01', 100), w('2026-01-05', 99), w('2026-01-07', 98)];
    eq(rollingAvg(s, '2026-01-07'), 99);
    eq(rollingAvg(s, '2026-01-08'), 98.5);  // the 1st has dropped out
    eq(rollingAvg(s, '2026-02-01'), null);
    eq(weekAvg([w('2026-10-10', 90), w('2026-10-12', 89)], '2026-10-10'), { avg: 89.5, n: 2 });
    eq(weekAvg([], '2026-10-10'), null);
  });

  test('4-week rate by least squares, in kg per week', () => {
    const s = [0, 7, 14, 21].map(i => w(addDays('2026-01-01', i), 100 - i / 7 * 0.5));
    near(rate4w(s, '2026-01-22'), -0.5, 1e-9);
    eq(rate4w([w('2026-01-01', 100), w('2026-01-04', 99)], '2026-01-10'), null); // under a week apart
    const p = projectWeight(s, '2026-01-22', '2026-02-05');
    near(p.kg, p.base - 1, 1e-9);
  });

  test('week summary', () => {
    const entries = [
      { day: '2026-10-10', kcal: 1800, protein: 90 }, { day: '2026-10-11', kcal: 2000, protein: 110 },
      { day: '2026-10-03', kcal: 5000, protein: 10 },
    ];
    const s = weekSummary(entries, [w('2026-10-04', 91), w('2026-10-11', 90)], '2026-10-10');
    eq([s.daysLogged, s.avgKcal, s.avgProtein, s.weightAvg, s.weightChange], [2, 1900, 100, 90, -1]);
  });

  test('waist: the questionnaire value is the first point unless that day was measured', () => {
    const p = { waistCm: 104, startDate: '2026-01-01' };
    eq(waistSeries([{ day: '2026-02-01', cm: '100.5' }], p), [{ day: '2026-01-01', cm: 104 }, { day: '2026-02-01', cm: 100.5 }]);
    eq(waistSeries([{ day: '2026-01-01', cm: 103 }], p), [{ day: '2026-01-01', cm: 103 }]);
    eq(waistSeries([], {}), []);
    near(waistToHeight(90, 180), 0.5);
    eq(waistToHeight(0, 180), null);
  });

  test('the check-in asks for weight on its interval and for the waist every two weeks', () => {
    const p = { startDate: '2026-10-01', waistCm: 100 };
    const pick = d => [d.weigh, d.waist, d.weighIn, d.waistIn];
    eq(pick(measureDue([], [], {}, '2026-10-10')), [true, true, 0, 0]);
    // the questionnaire's waist counts as the first measurement
    eq(pick(measureDue([w('2026-10-01', 90)], [], p, '2026-10-05')), [false, false, 3, 10]);
    eq(pick(measureDue([w('2026-10-01', 90)], [], p, '2026-10-08')), [true, false, 0, 7]);
    eq(pick(measureDue([w('2026-10-08', 89)], [], p, '2026-10-15')), [true, true, 0, 0]);
    eq(pick(measureDue([w('2026-10-15', 89)], [{ day: '2026-10-15', cm: 98 }], p, '2026-10-15')), [false, false, 7, 14]);
    // weighing every day: yesterday's weigh-in is already due again
    eq(pick(measureDue([w('2026-10-14', 89)], [], p, '2026-10-15', 1)).slice(0, 1), [true]);
    eq(pick(measureDue([w('2026-10-15', 89)], [], p, '2026-10-15', 1))[0], false);
  });

  test('frequent foods are per meal and remember the last amount', () => {
    const foods = [{ id: 'a', name: 'نان', unit: 'کف‌دست' }, { id: 'b', name: 'برنج', unit: 'کفگیر' }];
    const e = (day, meal, food_id, qty, unit, at) => ({ day, meal, food_id, qty, unit, created_at: at });
    const entries = [
      e('2026-10-01', 'breakfast', 'a', 1, 'کف‌دست', '1'), e('2026-10-02', 'breakfast', 'a', 2, 'کف‌دست', '2'),
      e('2026-10-02', 'lunch', 'b', 150, 'گرم', '3'), e('2026-10-02', 'lunch', 'gone', 1, 'x', '4'),
    ];
    const f = frequentFoods(entries, foods, '2026-10-03', 'breakfast');
    eq(f.map(x => [x.food.id, x.n, x.last]), [['a', 2, { qty: 2, grams: false }]]);
    eq(lastAmountFor(entries, foods[1], 'dinner'), { qty: 150, grams: true });
    eq(lastAmountFor(entries, { id: 'zzz', unit: 'عدد' }, 'dinner'), { qty: 1, grams: false });
  });
});


suite('occasions', () => {
  test('yalda, nowruz and saved events within a week', () => {
    eq(upcoming('2026-12-13').map(o => o.key), []);
    eq(upcoming('2026-12-15').map(o => [o.key, o.inDays]), [['yalda:2026-12-21', 6]]);      // 30 Azar 1405
    eq(upcoming('2027-03-15').map(o => o.key), ['nowruz:2027-03-21']);                       // 1 Farvardin 1406
    const ev = [{ id: 'a', kind: 'event', title: 'عروسی', day: '2026-11-02' }, { id: 'b', kind: 'quote', day: '2026-11-01' }];
    eq(upcoming('2026-10-30', ev).map(o => [o.name, o.inDays]), [['عروسی', 3]]);
  });

  test('a week of activity minutes', () => {
    eq(activityWeek([{ day: '2026-10-17', minutes: 30 }, { day: '2026-10-23', minutes: 45 }, { day: '2026-10-24', minutes: 60 }], '2026-10-17'), 75);
  });
});
