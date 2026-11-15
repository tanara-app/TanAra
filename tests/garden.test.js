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
