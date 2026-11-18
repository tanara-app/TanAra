import { suite, test, eq, ok } from './harness.js';
import { LESSONS, stepOf } from '../js/domain/heistTutorial.js';
import { solve, simulate, initial, play, validate } from '../js/domain/heist.js';

suite('heist tutorial', () => {
  test('every lesson is a well-made vault the careful player can finish with its own gadgets', () => {
    for (const L of LESSONS) {
      eq(validate(L.vault, { budget: 999 }).errors.filter(e => e !== 'unsolvable'), [], L.key);
      ok(solve(L.vault, L.kit), `${L.key}: solvable`);
    }
  });

  test('what each lesson teaches can\'t be skipped: walk straight past the guard or the laser and you are caught; no pulse, no way', () => {
    const straight = 'UUUUUULUU'.split('');
    eq(simulate(LESSONS[1].vault, straight).result, 'caught');
    eq(simulate(LESSONS[2].vault, straight).result, 'caught');
    ok(solve(LESSONS[1].vault, []).moves.includes('W'), 'the guard lesson needs a wait');
    ok(solve(LESSONS[2].vault, []).moves.includes('W'), 'the laser lesson needs a wait');
    eq(solve(LESSONS[3].vault, []), null);
  });

  test('playing a lesson through, its lines come one after another and end on the last', () => {
    for (const L of LESSONS) {
      let s = initial(L.vault), at = stepOf(L, s), seen = [at];
      for (const mv of solve(L.vault, L.kit).moves) {
        s = play(L.vault, s, mv, L.kit).state;
        if (s.status !== 'play') break;
        const next = stepOf(L, s, at);
        ok(next >= at, `${L.key}: lines never go back`);
        if (next !== at) seen.push(next);
        at = next;
      }
      eq(seen, L.steps.map((_, i) => i), `${L.key}: every line shown, in order`);
    }
  });

  test('every line is short', () => {
    for (const L of LESSONS) for (const s of L.steps) ok(s.text.split(' ').length <= 10, s.text);
  });
});
