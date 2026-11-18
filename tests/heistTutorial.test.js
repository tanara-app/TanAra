import { suite, test, eq, ok } from './harness.js';
import { LESSONS, stepOf, guide, isRed, firsts, FIRST, GUIDE, RULES, POWER, FAIL, WELCOME, canFinish, spots } from '../js/domain/heistTutorial.js';
import { solve, simulate, initial, play, validate, generate } from '../js/domain/heist.js';

// A player who does only what the pointing hand says, from the start of a lesson.
function followHand(L) {
  let s = initial(L.vault);
  for (let k = 0; k < 40 && s.status === 'play'; k++) {
    const g = guide(L.vault, s);
    if (!g) return 'stuck';
    s = play(L.vault, s, g.move, L.kit).state;
  }
  return s.status;
}

suite('heist tutorial', () => {
  test('five lessons, each a well-made vault the careful player can finish with its own gadgets', () => {
    eq(LESSONS.map(L => L.key), ['move', 'guard', 'laser', 'cam', 'emp']);
    for (const L of LESSONS) {
      eq(validate(L.vault, { budget: 999 }).errors.filter(e => e !== 'unsolvable'), [], L.key);
      ok(solve(L.vault, L.kit), `${L.key}: solvable`);
    }
  });

  test('what each lesson teaches can\'t be skipped: walk straight past the guard, the laser or the camera and it goes wrong; no pulse, no way', () => {
    const straight = 'UUUUUULUU'.split('');
    eq(simulate(LESSONS[1].vault, straight).result, 'caught');
    for (const i of [2, 3]) ok(simulate(LESSONS[i].vault, straight).alarm, `${LESSONS[i].key}: the alarm`);
    for (const i of [1, 2, 3]) ok(solve(LESSONS[i].vault, []).moves.includes('W'), `${LESSONS[i].key} needs a wait`);
    eq(solve(LESSONS[4].vault, []), null);
  });

  test('a player who only does what the hand shows gets through every lesson without gadgets but the last', () => {
    for (const L of LESSONS.slice(0, 4)) eq(followHand(L), 'escaped', L.key);
  });

  test('the hand never points at red', () => {
    for (const L of LESSONS.slice(0, 4)) {
      let s = initial(L.vault);
      for (let k = 0; k < 40 && s.status === 'play'; k++) {
        const g = guide(L.vault, s);
        if (g.cell >= 0 && g.cell !== L.vault.tiles.join('').indexOf('V')) ok(!isRed(s, L.vault, g.cell), `${L.key} turn ${s.t}`);
        s = play(L.vault, s, g.move, L.kit).state;
      }
    }
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

  test('the guard lesson says «wait» exactly while the cell ahead is red', () => {
    const L = LESSONS[1];
    let s = initial(L.vault);
    for (const mv of ['U', 'U']) s = play(L.vault, s, mv, []).state;
    eq([stepOf(L, s), isRed(s, L.vault, s.p - 7)], [1, true]);
    s = play(L.vault, s, 'W', []).state;
    eq([stepOf(L, s, 1), isRed(s, L.vault, s.p - 7)], [2, false]);
  });

  test('first-time lines: what a vault and the gadgets taken have, in order', () => {
    const v = { ...generate(1, 5) };
    v.defenses = [...v.defenses.filter(d => d.t !== 'plate' && d.t !== 'mark'), { t: 'mark', x: 0, y: 0 }];
    const f = firsts(v, ['decoy', 'emp']);
    ok(f.includes('plate') && f.includes('decoy') && !f.includes('emp'));
    for (const k of f) ok(FIRST[k], k);
    eq(firsts({ tiles: ['.......'], defenses: [] }), []);
  });

  test('every line is short, and every card has its words', () => {
    const lines = [...LESSONS.flatMap(L => [L.goal, ...L.rows.map(r => r[1]), ...L.steps.flatMap(s => [s.text, s.armed].filter(Boolean))]),
      ...RULES.rows.map(r => r[1]), ...POWER.rows.map(r => r[1]), ...Object.values(FIRST), WELCOME.text];
    for (const t of lines) ok(t.split(/\s+/).length <= 12, t);
    for (const k of ['seen', 'near', 'laser', 'cam', 'plate', 'cornered', 'timeout', 'fled', 'stuck']) eq(FAIL[k].length, 2, k);
    ok(GUIDE.rows.length >= 15);
  });

  test('«can it still be won» from here: yes at the start, no once the pulse is wasted or the guard is upon you', () => {
    for (const L of LESSONS) ok(canFinish(L, initial(L.vault)), L.key);
    const emp = LESSONS[4];
    let s = initial(emp.vault);
    for (const mv of ['U', 'U', 'E', 'W', 'W', 'W']) s = play(emp.vault, s, mv, emp.kit).state;
    eq([s.status, !!(s.used & 1), canFinish(emp, s)], ['play', true, false]);
    // the guard lesson: walk straight up and the step before the capture can't be won either; two steps back can
    const g = LESSONS[1], hist = [];
    s = initial(g.vault);
    for (const mv of 'UUUUUU') { hist.push(s); const n = play(g.vault, s, mv, []).state; s = n; if (s.status !== 'play') break; }
    eq(s.status, 'caught');
    ok(hist.some(h => canFinish(g, h)) && canFinish(g, hist[0]));
  });

  test('each lesson card rings what is new: the gold and the way out, then the guard, the laser, the camera, the laser', () => {
    eq(spots(LESSONS[0]).map(s => s.kind), ['safe', 'exit']);
    eq(spots(LESSONS[1]), [{ cell: 4 * 7 + 4, kind: 'danger' }]);
    eq(spots(LESSONS[3]), [{ cell: 4 * 7 + 2, kind: 'danger' }]);
  });
});
