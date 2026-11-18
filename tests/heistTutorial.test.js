import { suite, test, eq, ok } from './harness.js';
import { LESSONS, stepOf } from '../js/domain/heistTutorial.js';
import { solve, simulate, initial, play, validate, nextThreats, W } from '../js/domain/heist.js';

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

  // A player who only follows what the board shows: step toward the goal unless the cell is red, else wait (2026-11-18: the guard
  // lesson felt impossible, because the old red for «seen now» stopped the player at the wrong moment).
  function obey(L) {
    const t = L.vault.tiles.join(''), walls = new Set([...t].map((c, i) => (c === '#' ? i : -1)).filter(i => i >= 0));
    const far = goal => { const d = new Map([[goal, 0]]), q = [goal]; while (q.length) { const c = q.shift(); for (const n of [c - W, c + 1, c + W, c - 1]) if (n >= 0 && n < t.length && Math.abs(n % W - c % W) + Math.abs((n / W | 0) - (c / W | 0)) === 1 && !walls.has(n) && !d.has(n)) { d.set(n, d.get(c) + 1); q.push(n); } } return d; };
    const safe = t.indexOf('V'), exit = t.indexOf('X');
    let s = initial(L.vault);
    for (let k = 0; k < 40 && s.status === 'play'; k++) {
      const n = nextThreats(L.vault, s), red = new Set([...n.seen, ...n.near, ...n.cam, ...n.laser]);
      const goal = s.loot ? exit : safe, d = far(goal);
      const moves = ['U', 'R', 'D', 'L'].map((m, i) => [m, s.p + [-W, 1, W, -1][i]]).filter(([, to]) => d.has(to) || to === goal)
        .sort((a, b) => (a[1] === goal ? -1 : d.get(a[1])) - (b[1] === goal ? -1 : d.get(b[1])));
      const better = moves.find(([, to]) => (to === goal || d.get(to) < (d.get(s.p) ?? 99)) && !red.has(to));
      const mv = better ? better[0] : 'W';
      s = play(L.vault, s, mv, L.kit).state;
    }
    return s.status;
  }

  test('a player who never steps on red and waits otherwise gets through the lessons without gadgets', () => {
    for (const L of LESSONS.slice(0, 3)) eq(obey(L), 'escaped', L.key);
  });

  test('every line is short', () => {
    for (const L of LESSONS) for (const s of L.steps) ok(s.text.split(' ').length <= 10, s.text);
  });
});
