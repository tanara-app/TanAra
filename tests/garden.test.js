import { suite, test, ok } from './harness.js';
import { daylight } from '../js/domain/garden.js';

const at = (m, d, h) => daylight(new Date(2026, m - 1, d, Math.floor(h), (h % 1) * 60));

suite('garden', () => {
  test('noon is the top of the day, midnight the bottom of the night', () => {
    const noon = at(11, 15, 12), mid = at(11, 15, 0);
    ok(noon.day && noon.e > 0.99);
    ok(!mid.day && mid.e < -0.99);
  });

  test('the sun is at the horizon at sunrise and sunset, and the night starts where the day ends', () => {
    ok(Math.abs(at(11, 15, 17).e) < 0.1);   // mid-November: sunset about five
    ok(!at(11, 15, 17.5).day);
    ok(at(6, 21, 18.5).day);                // the start of summer: still light
    ok(!at(12, 21, 7).day && at(6, 21, 5.5).day); // Yalda's long night, summer's early dawn
  });

  test('how far through the day or the night stays between 0 and 1', () => {
    for (let h = 0; h < 24; h += 0.5) { const { p } = at(3, 20, h); ok(p >= 0 && p <= 1); }
  });
});

import { eq } from './harness.js';
import { earned, spent, dropsByDay, isLand, canWater, frontier, nextCell, plantOf, guests, cellKey } from '../js/domain/garden.js';

suite('garden water', () => {
  const e = (day, meal) => ({ day, meal });
  test('a drop for each meal logged, three at most, and one for a day with activity', () => {
    const entries = [e('2026-03-01', 'breakfast'), e('2026-03-01', 'breakfast'), e('2026-03-01', 'snack1'), e('2026-03-01', 'snack2'),
      e('2026-03-02', 'breakfast'), e('2026-03-02', 'lunch'), e('2026-03-02', 'dinner'), e('2026-03-02', 'snack')];
    const activity = [{ day: '2026-03-02', minutes: 30 }, { day: '2026-03-03', minutes: 20 }, { day: '2026-03-04', minutes: 0 }];
    eq(dropsByDay(entries, activity).get('2026-03-01'), { meals: 2, move: 0 });
    eq(earned(entries, activity, '2026-03-01'), 2);
    eq(earned(entries, activity, '2026-03-02'), 2 + 4);
    eq(earned(entries, activity, '2026-03-09'), 2 + 4 + 1);
  });

  test('what was spent: the steps of the pomegranate and every level of every cell', () => {
    eq(spent(null), 0);
    eq(spent({ tree: 4, cells: { '3,0': 3, '3,1': 1 } }), 3 + 4);
  });

  test('water reaches only land next to the garden, the channel or green land', () => {
    ok(!isLand(0, 0) && !isLand(2, -2) && !isLand(-4, 0)); // the garden and the channel
    ok(isLand(3, 0) && isLand(-4, 1));
    ok(canWater({}, 3, 0) && canWater({}, -4, 1));
    ok(!canWater({}, 4, 0));
    ok(canWater({ [cellKey(3, 0)]: 1 }, 4, 0));
    ok(canWater({ [cellKey(3, 0)]: 2 }, 3, 0) && !canWater({ [cellKey(3, 0)]: 3 }, 3, 0));
  });

  test('the next drop finishes what is started, then goes to the nearest dry land', () => {
    const first = nextCell({});
    eq(Math.max(Math.abs(first[0]), Math.abs(first[1])), 3);
    eq(nextCell({ [cellKey(3, 2)]: 1 }), [3, 2]);
    ok(frontier({}).length >= 20);
    // watering the suggestion over and over never gets stuck and never repeats a full cell
    const cells = {};
    for (let n = 0; n < 400; n++) { const [i, j] = nextCell(cells); const k = cellKey(i, j); cells[k] = (cells[k] || 0) + 1; ok(cells[k] <= 3); }
    eq(spent({ cells }), 400);
  });

  test('a cell always grows the same thing; buildings only away from the wall', () => {
    eq(plantOf(5, -3), plantOf(5, -3));
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) ok(!['badgir', 'kabootar'].includes(plantOf(i, j)));
    const kinds = new Set();
    for (let i = -12; i <= 12; i++) for (let j = -12; j <= 12; j++) kinds.add(plantOf(i, j));
    eq(kinds.size, 7);
  });

  test('guests come as more water is given', () => {
    eq(guests(0), []);
    eq(guests(14), ['fish', 'butterfly']);
    eq(guests(500).length, 5);
  });
});
