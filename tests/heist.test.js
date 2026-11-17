import { suite, test, eq, ok } from './harness.js';
import { simulate, solve, validate, difficulty, generate, gadgetsNeeded, cost, lootOf, initial, play, threats, nextThreats, revealed,
  BANDS, LEVELS, GADGETS, MAX_TURNS, W, H } from '../js/domain/heist.js';

const vault = (tiles, defenses = []) => ({ v: 1, w: W, h: H, tiles, defenses });
const at = (x, y) => y * W + x;

// One corridor up the middle: the entry at the bottom, the safe to the left of (3,2), the exit at the top.
const CORRIDOR = ['###X###', '###.###', '##V.###', '###.###', '###.###', '###.###', '###.###', '###.###', '###E###'];
const plain = vault(CORRIDOR);

// A vault that can't be done without the gadget and can with it, for each of the five.
const NEEDS = {
  // A laser that never blinks across the only way.
  emp: vault(CORRIDOR, [{ t: 'laser', x: 3, y: 4, axis: 'h', mode: 'on' }]),
  // A guard at the end of a side passage who looks down it, across the only way.
  smoke: vault(['###X###', '###.###', '##V.###', '###.###', '###....', '###.###', '###.###', '###.###', '###E###'],
    [{ t: 'guard', path: [[6, 4]], dir: 3 }]),
  // A snake of 28 steps with a door on it: 28 + 1 for the safe + 2 for the door is one turn too many.
  lockpick: vault(['X......', '.######', '.......', '###V##.', '.......', '.######', '...D...', '######.', '....E..']),
  // Two ways round: one over a real plate, one over a mark that only looks like one.
  goggles: vault(['###X###', '##...##', '##.#.##', '##.#.##', '##.#.##', '##.#V##', '##...##', '###.###', '###E###'],
    [{ t: 'plate', x: 4, y: 3 }, { t: 'mark', x: 2, y: 3 }]),
  // A guard in an alcove right beside the only way; a passage behind him to throw the bait into.
  decoy: vault(['###X###', '###.###', '##V.###', '###.###', '###....', '###.###', '###.###', '###.###', '###E###'],
    [{ t: 'guard', path: [[4, 4]], dir: 3 }]),
};

suite('heist: one raid', () => {
  test('in an empty vault the thief takes the loot and walks out', () => {
    const r = simulate(plain, [...'UUUUUU', 'L', 'U', 'U']);
    eq([r.result, r.turns, r.alarm, r.loot], ['escaped', 9, false, true]);
    eq(r.events[6], [{ e: 'loot', at: at(2, 2) }]);
    eq(r.events[8], [{ e: 'move', to: at(3, 0), dir: 0 }, { e: 'escape', alarm: false }]);
  });

  test('walking into a wall is not a move, leaving with nothing is fleeing, and moves that run out leave it unfinished', () => {
    eq(simulate(plain, ['L']).result, 'invalid');
    eq(simulate(plain, ['U', 'L']).at, 1);
    eq(simulate(plain, [...'UUUUUUUU']).result, 'fled');
    eq(simulate(plain, ['U', 'W']).result, 'unfinished');
    eq(simulate(plain, ['E']).result, 'invalid', 'a gadget he did not bring');
    for (const bag of [['emp', 'emp'], ['emp', 'smoke', 'decoy', 'goggles'], ['bomb'], 'emp']) eq(simulate(plain, ['U'], bag).at, -1, 'a bag the game does not allow');
    for (const mv of ['S3,7.0', 'S3.0,7', 'S 3,7', 'S3,7,1', 'S-0,7', 'S3,70', 'B03,7x', 'UU', '']) eq(simulate(NEEDS.smoke, [mv], ['smoke', 'decoy']).result, 'invalid', mv);
    eq(simulate(NEEDS.smoke, ['S3,7'], ['smoke']).result, 'unfinished');
  });

  test('the same vault and moves always give the same raid', () => {
    const v = generate(7, 4), moves = solve(v).moves;
    eq(simulate(v, moves), simulate(JSON.parse(JSON.stringify(v)), [...moves]));
    eq(generate(7, 4), generate(7, 4));
  });

  test('thirty turns and no more', () => {
    const r = simulate(plain, Array(40).fill('W'));
    eq([r.result, r.turns], ['timeout', MAX_TURNS]);
  });

  test('a guard catches a thief he sees ahead, at his side, or next to him; a wall hides the thief', () => {
    const room = ['###X###', '##V..##', '.......', '.......', '.......', '.......', '.......', '.......', '...E...'];
    const facing = dir => vault(room, [{ t: 'guard', path: [[3, 4]], dir }]);
    eq(simulate(facing(2), ['U']).events[0], [{ e: 'move', to: at(3, 7), dir: 0 }, { e: 'caught', by: 'seen', i: 0 }], 'three cells ahead');
    eq(simulate(facing(0), ['U', 'U']).result, 'unfinished', 'behind him, two cells away');
    eq(simulate(facing(0), ['U', 'U', 'U']).events[2][1], { e: 'caught', by: 'near', i: 0 });
    eq(simulate(facing(0), ['R', 'U', 'U', 'U']).result, 'unfinished', 'a corner away from him');
    eq(simulate(facing(0), ['R', 'U', 'U', 'U', 'U']).events[4][1], { e: 'caught', by: 'near', i: 0 }, 'at his side');
    const walled = vault(['###X###', '##V..##', '.......', '.......', '.......', '.......', '..###..', '.......', '...E...'], [{ t: 'guard', path: [[3, 4]], dir: 2 }]);
    eq(simulate(walled, ['U']).result, 'unfinished');
  });

  test('a guard walks his loop one cell a turn and looks where he walks', () => {
    const v = vault(['###X###', '##V..##', '.......', '.......', '.......', '.......', '.......', '.......', 'E......'],
      [{ t: 'guard', path: [[4, 2], [5, 2], [6, 2], [5, 2]] }]);
    const r = simulate(v, ['W', 'W', 'W', 'W']);
    eq(r.events.map(e => e.find(x => x.e === 'guard').to), [at(5, 2), at(6, 2), at(5, 2), at(4, 2)]);
    eq(r.events.map(e => e.find(x => x.e === 'guard').dir), [1, 1, 3, 3]);
  });

  test('a camera turns every two turns and its look sets off the alarm, not the handcuffs', () => {
    const v = vault(['###X###', '###.###', '##V.###', '###.###', '###.###', '###.###', '###.###', '###.###', '###E###'], [{ t: 'cam', x: 3, y: 0, dir: 0 }]);
    // It can't be on the exit: put it on the wall beside the corridor instead, looking along the top row.
    const side = vault(['###X###', '#...###', '##V.###', '###.###', '###.###', '###.###', '###.###', '###.###', '###E###'], [{ t: 'cam', x: 0, y: 1, dir: 1 }]);
    ok(!validate(v).ok);
    // Clock 0-1 right, 2-3 down, 4-5 left, 6-7 up, 8-9 right again: the thief reaches (3,1) at turn 8.
    const r = simulate(side, [...'UUUUUU', 'L', 'U', 'U']);
    eq(r.result, 'escaped_alarm');
    eq(r.events[7].at(-1), { e: 'alarm', by: 'cam', i: 0, at: at(3, 1) });
    eq(simulate(side, [...'UUUUUU', 'L', 'W', 'W', 'U', 'U']).result, 'escaped', 'two turns later it looks away');
  });

  test('a blinking laser is two turns on and two off', () => {
    const v = vault(CORRIDOR, [{ t: 'laser', x: 3, y: 5, axis: 'h', mode: 'blink', phase: 0 }]);
    // On at clocks 0, 1, 4, 5...: stepping onto it at turn 3 (clock 3) is safe, at turn 5 it is not.
    eq(simulate(v, ['U', 'U', 'U', 'U']).alarm, false);
    eq(simulate(v, ['U', 'U', 'W', 'W', 'U']).events[4].at(-1).by, 'laser');
  });

  test('after the alarm the thief has four turns, and the guards run two cells a turn', () => {
    const near = vault(['###.###', '###.###', '##V.###', '###.###', '###.###', '###.###', 'X...###', '###.###', '###E###'], [{ t: 'plate', x: 3, y: 3 }]);
    // Up to the safe over the plate (turn 5), the loot, then four turns to an exit four steps away.
    const r = simulate(near, [...'UUUUU', 'U', 'L', 'D', 'D', 'D', 'D']);
    eq(r.events[4].at(-1), { e: 'alarm', by: 'plate', i: -1, at: at(3, 3) });
    eq(r.events.at(-1).at(-1), { e: 'caught', by: 'cornered', i: -1 });
    const chased = vault(['###.###', '###.###', '##V.###', '###.###', '###.###', '###.###', 'X......', '###.###', '###E###'],
      [{ t: 'plate', x: 3, y: 7 }, { t: 'guard', path: [[6, 6]], dir: 0 }]);
    const c = simulate(chased, ['U', 'W', 'W']);
    eq(c.events[1].find(e => e.e === 'guard'), { e: 'guard', i: 0, from: at(6, 6), to: at(4, 6), dir: 3, mode: 3 });
    eq(c.result, 'caught');
  });

  test('a locked door takes two turns, one with the lockpick', () => {
    const v = vault(['###X###', '###.###', '##V.###', '###.###', '###D###', '###.###', '###.###', '###.###', '###E###']);
    eq(solve(v).turns, 11);
    eq(solve(v, ['lockpick']).turns, 10);
    eq(simulate(v, [...'UUUU']).events[3], [{ e: 'pick', at: at(3, 4) }]);
    eq(simulate(v, [...'UUUUU']).events[4], [{ e: 'open', at: at(3, 4) }]);
  });

  test('the pulse and the smoke last three checks: the turn they are used and the two after', () => {
    const r = simulate(NEEDS.emp, ['U', 'U', 'U', 'E', 'U', 'U', 'W'], ['emp']);
    eq(r.alarm, false);
    eq(r.events[5].at(-1), { e: 'emp_end', at: at(3, 5) });
    eq(simulate(NEEDS.emp, ['U', 'U', 'E', 'W', 'U', 'U'], ['emp']).alarm, true, 'used a turn too early');
    eq(simulate(NEEDS.emp, ['U', 'U', 'U', 'E', 'E'], ['emp']).result, 'invalid', 'one pulse, one use');
  });

  test('the bait pulls the nearest guard off his post for two turns, then he walks back', () => {
    const r = simulate(NEEDS.decoy, ['U', 'U', 'U', 'B5,4', 'W', 'W', 'W'], ['decoy']);
    eq(r.events[3], [{ e: 'bait', at: at(5, 4), guard: 0 }, { e: 'guard', i: 0, from: at(4, 4), to: at(5, 4), dir: 1, mode: 1 }]);
    eq(r.events[4], [{ e: 'wait' }, { e: 'guard', i: 0, from: at(5, 4), to: at(5, 4), dir: 1, mode: 2 }]);
    eq(r.events[5][1], { e: 'guard', i: 0, from: at(5, 4), to: at(4, 4), dir: 3, mode: 2 });
    eq(r.events[6][1], { e: 'guard', i: 0, from: at(4, 4), to: at(4, 4), dir: 3, mode: 0 });
  });

  test('what the board shows: danger now and next turn, and which plates the thief can tell', () => {
    const v = vault(['###X###', '##V..##', '.......', '.......', '.......', '.......', '.......', '.......', '...E...'],
      [{ t: 'guard', path: [[1, 4], [1, 3]] }, { t: 'plate', x: 3, y: 6 }, { t: 'mark', x: 5, y: 2 }]);
    const s = initial(v);
    eq(threats(v, s).seen, [at(1, 5), at(1, 6), at(1, 7), at(0, 4), at(2, 4)]);
    eq(nextThreats(v, s).seen, [at(1, 2), at(2, 3), at(0, 3)], 'the wall above him stops his look');
    eq(revealed(v, s), []);
    eq(revealed(v, play(v, s, 'U').state), [{ at: at(3, 6), real: true }]);
    eq(revealed(v, s, ['goggles']), [{ at: at(5, 2), real: false }, { at: at(3, 6), real: true }]);
  });

  test('the loot: a fifth of the owner\'s coins up to the cap, half with the alarm, nothing if caught', () => {
    eq([lootOf('escaped', 500), lootOf('escaped_alarm', 500), lootOf('caught', 500), lootOf('escaped', 5000)], [100, 50, 0, 200]);
  });
});

suite('heist: the solver', () => {
  test('what the solver finds, the simulator agrees with', () => {
    const cases = Object.entries(NEEDS).map(([g, v]) => [v, [g]]);
    for (let seed = 1; seed <= 10; seed++) for (let level = 1; level <= LEVELS; level++) cases.push([generate(seed, level), []]);
    for (const [v, gadgets] of cases) {
      for (const alarm of [false, true]) {
        const s = solve(v, gadgets, { alarm });
        ok(s, 'solvable');
        const r = simulate(v, s.moves, gadgets);
        eq([r.result, r.turns, r.alarm], [s.alarm ? 'escaped_alarm' : 'escaped', s.turns, s.alarm]);
      }
    }
  });

  test('each of the five gadgets has a vault that can\'t be done without it', () => {
    for (const g of GADGETS) {
      ok(!solve(NEEDS[g]), `${g}: no way without it`);
      ok(!solve(NEEDS[g], GADGETS.filter(x => x !== g && !(g === 'smoke' && x === 'decoy'))), `${g}: the others don't help`);
      const s = solve(NEEDS[g], [g]);
      ok(s, `${g}: a way with it`);
      eq(simulate(NEEDS[g], s.moves, [g]).result, 'escaped');
      eq(gadgetsNeeded(NEEDS[g]), [g]);
      ok(!validate(NEEDS[g]).ok, `${g}: not a vault the game accepts`);
    }
  });

  test('the search also follows the alarm: a vault that can only be left with the sirens on', () => {
    // The safe is low on the corridor and a plate lies between it and the exit, four steps from the exit.
    const low = ['###X###', '###.###', '###.###', '###.###', '###.###', '###.###', '##V.###', '###.###', '###E###'];
    const v = vault(low, [{ t: 'plate', x: 3, y: 4 }]);
    eq(solve(v), null);
    const s = solve(v, [], { alarm: true });
    eq([s.turns, s.alarm], [9, true]);
    eq(simulate(v, s.moves).result, 'escaped_alarm');
    // One step further from the exit and four turns are not enough.
    const far = vault(low, [{ t: 'plate', x: 3, y: 5 }]);
    eq(solve(far, [], { alarm: true }), null);
  });

  test('leaving the turn count out of the search key doesn\'t change the answer', () => {
    const cases = [...Object.entries(NEEDS).map(([g, v]) => [v, [g]]), [NEEDS.smoke, ['decoy', 'emp']]];
    for (let seed = 1; seed <= 6; seed++) cases.push([generate(seed, 1 + seed % LEVELS), []]);
    for (const [v, gadgets] of cases) for (const alarm of [false, true]) {
      const a = solve(v, gadgets, { alarm }), b = solve(v, gadgets, { alarm, exact: true });
      eq([a?.turns, a?.alarm], [b?.turns, b?.alarm]);
    }
  });

  test('without the goggles the solver never steps on a mark', () => {
    const s = solve(NEEDS.goggles, ['goggles']);
    ok(simulate(NEEDS.goggles, s.moves).events.some(ev => ev.some(e => e.e === 'move' && e.to === at(2, 3))));
  });
});

suite('heist: vaults', () => {
  test('fifty made-up vaults are all accepted, and they get harder with the level', () => {
    const mean = [];
    for (let level = 1; level <= LEVELS; level++) {
      let sum = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const v = generate(seed, level), check = validate(v), d = difficulty(v);
        eq(check.errors, [], `seed ${seed}, level ${level}`);
        ok(check.cost <= 100);
        ok(d.score >= BANDS[level - 1][0] && d.score < BANDS[level - 1][1], `seed ${seed}, level ${level}: ${d.score}`);
        eq(d.needs, []);
        sum += d.score;
      }
      mean.push(sum / 10);
    }
    for (let i = 1; i < mean.length; i++) ok(mean[i] > mean[i - 1], `level ${i + 1} harder than level ${i}`);
  });

  test('a vault with no way through is turned down', () => {
    eq(validate(NEEDS.emp).errors, ['unsolvable']);
    const sealed = vault(['###X###', '###.###', '##V.###', '#######', '###.###', '###.###', '###.###', '###.###', '###E###']);
    eq(validate(sealed).errors, ['unsolvable']);
    eq(difficulty(sealed).score, Infinity);
  });

  test('a vault over budget or badly made is turned down', () => {
    const room = ['###X###', '##V..##', '.......', '.......', '.......', '.......', '.......', '.......', '...E...'];
    const five = [0, 1, 2, 3, 4].map(i => ({ t: 'guard', path: [[6, 2 + i]], dir: 1 }));
    eq(cost(vault(room, five)), 125);
    eq(validate(vault(room, five)).errors, ['budget']);
    ok(validate(vault(room, five), { budget: 130 }).ok, 'a bigger budget from the diet');
    eq(validate(vault(room, [{ t: 'guard', path: [[0, 2], [2, 2]] }])).errors, ['guard'], 'a path that jumps');
    eq(validate(vault(room, [{ t: 'guard', path: [[0, 2], [1, 2], [2, 2]] }])).errors, ['guard'], 'a loop that does not close');
    eq(validate(vault(room, [{ t: 'cam', x: 3, y: 4, dir: 0 }])).errors, ['cam'], 'a camera not on a wall');
    eq(validate(vault(room, [{ t: 'laser', x: 3, y: 8, axis: 'h', mode: 'on' }])).errors, ['laser'], 'a beam that ends on the entry');
    eq(validate(vault(room, [{ t: 'plate', x: 3, y: 4 }, { t: 'mark', x: 3, y: 4 }])).errors, ['mark'], 'two things on one cell');
    eq(validate(vault(room.map(r => r.replace('E', '.')))).errors, ['entry']);
    eq(validate(vault(room.slice(1))).errors, ['shape']);
    eq(cost(vault(['###X###', '###D###', '##V.###', '###.###', '###.###', '###.###', '###.###', '###.###', '###E###'], [{ t: 'plate', x: 3, y: 5 }])), 20);
  });

  test('difficulty counts the detour, the gadgets a vault needs, and the shortcut the alarm gives', () => {
    const easy = difficulty(plain);
    eq([easy.length, easy.bare, easy.needs, easy.routes], [9, 9, [], 1]);
    const d = difficulty(NEEDS.emp);
    eq(d.needs, ['emp']);
    ok(d.score > easy.score + 30);
    // A laser that is on when the thief gets to it, right before the exit: wait two turns, or run through it.
    const loud = difficulty(vault(CORRIDOR, [{ t: 'laser', x: 3, y: 1, axis: 'h', mode: 'blink', phase: 0 }]));
    eq([loud.length, loud.bare, loud.alarmLength], [11, 9, 9]);
  });
});
