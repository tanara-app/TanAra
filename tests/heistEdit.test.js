import { suite, test, eq, ok } from './harness.js';
import { edit, targets, check, loopOf, lineOf, copy } from '../js/domain/heistEdit.js';
import { validate, generate, W } from '../js/domain/heist.js';

const at = (x, y) => y * W + x;
const ROOM = ['###X###', '#.....#', '#..V..#', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '###E###'];
const room = () => ({ v: 1, w: 7, h: 9, tiles: [...ROOM], defenses: [] });
// several taps in a row, carrying the selection
function taps(v, tool, cells, sel = -1) {
  for (const c of cells) ({ vault: v, sel } = edit(v, tool, c, sel));
  return { vault: v, sel };
}

suite('heist editor', () => {
  test('a guard drawn as a line walks it and back; a ring is walked round', () => {
    eq(loopOf([[1, 1]]), [[1, 1]]);
    eq(loopOf([[1, 1], [2, 1], [3, 1]]), [[1, 1], [2, 1], [3, 1], [2, 1]]);
    eq(loopOf([[1, 1], [2, 1], [2, 2], [1, 2]]), [[1, 1], [2, 1], [2, 2], [1, 2]]);
    for (const line of [[[1, 1]], [[1, 1], [2, 1]], [[1, 1], [2, 1], [3, 1]], [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1]], [[1, 1], [2, 1], [2, 2], [1, 2]]]) eq(lineOf(loopOf(line)), line);
  });

  test('drawing a guard: a new guard, his line, a step back, a turn on the spot', () => {
    let { vault, sel } = edit(room(), 'guard', at(1, 4));
    eq([sel, vault.defenses[0]], [0, { t: 'guard', path: [[1, 4]], dir: 2 }]);
    ({ vault, sel } = edit(vault, 'guard', at(1, 4), sel));
    eq(vault.defenses[0].dir, 3, 'a guard on one cell turns');
    ({ vault, sel } = taps(vault, 'guard', [at(2, 4), at(3, 4)], sel));
    eq(vault.defenses[0].path, [[1, 4], [2, 4], [3, 4], [2, 4]]);
    ok(validate(vault).ok);
    ({ vault, sel } = edit(vault, 'guard', at(2, 4), sel));
    eq(vault.defenses[0].path, [[1, 4], [2, 4]], 'the cell before the last takes a step back');
    ({ vault, sel } = taps(vault, 'guard', [at(2, 5), at(1, 5)], sel));
    eq(vault.defenses[0].path, [[1, 4], [2, 4], [2, 5], [1, 5]], 'closes into a ring');
    eq(edit(vault, 'guard', at(4, 4), sel).changed, true, 'a cell away from his line is a new guard');
    eq(edit(vault, 'guard', at(4, 4), sel).sel, 1);
  });

  test('a tap on another guard picks him to draw; the editor never changes the vault it was given', () => {
    const start = room();
    let { vault } = taps(start, 'guard', [at(1, 4), at(5, 6)]);
    eq(vault.defenses.length, 2);
    const r = edit(vault, 'guard', at(1, 4), 1);
    eq([r.sel, r.changed, r.vault === vault], [0, false, true]);
    eq(start, room());
  });

  test('walls, doors and the floor', () => {
    let v = taps(room(), 'plate', [at(2, 5)]).vault;
    v = taps(v, 'guard', [at(2, 6), at(2, 5)]).vault;
    v = edit(v, 'wall', at(2, 5)).vault;
    eq([v.tiles[5], v.defenses], ['#.#...#', []], 'a wall takes the plate and the guard who walked there');
    v = edit(v, 'cam', at(2, 5)).vault;
    eq(v.defenses.length, 1);
    v = edit(v, 'wall', at(2, 5)).vault;
    eq([v.tiles[5], v.defenses], ['#.....#', []], 'and back to floor, without its camera');
    v = edit(v, 'door', at(3, 6)).vault;
    eq(v.tiles[6], '#..D..#');
    eq(edit(v, 'door', at(3, 6)).vault.tiles[6], '#.....#');
    eq(edit(v, 'wall', at(3, 2)).changed, false, 'the safe is not a wall');
  });

  test('one safe, one entry on the edge, one or two exits on the edge', () => {
    let v = edit(room(), 'safe', at(5, 1)).vault;
    eq([v.tiles[1], v.tiles[2]], ['#....V#', '#.....#']);
    eq(edit(v, 'entry', at(3, 4)).changed, false, 'not inside the vault');
    eq(edit(v, 'entry', at(0, 4)).changed, false, 'a wall first has to be floor');
    v = edit(edit(v, 'wall', at(0, 4)).vault, 'entry', at(0, 4)).vault;
    eq([v.tiles[4][0], v.tiles[8]], ['E', '###.###']);
    v = edit(v, 'exit', at(3, 8)).vault;
    eq(v.tiles[8], '###X###');
    eq(edit(v, 'exit', at(6, 1)).changed, false, 'two exits at most');
    v = edit(v, 'exit', at(3, 0)).vault;
    eq(v.tiles[0], '###.###');
    eq(edit(v, 'exit', at(3, 8)).changed, false, 'one exit at least');
  });

  test('a camera on a wall turns; a laser cycles its axis and its blinking; plates and marks swap', () => {
    let v = edit(room(), 'cam', at(0, 4)).vault;
    eq(v.defenses[0], { t: 'cam', x: 0, y: 4, dir: 1, ph: 0 }, 'facing the open side');
    v = edit(v, 'cam', at(0, 4)).vault;
    eq(v.defenses[0].dir, 2);
    eq(edit(v, 'cam', at(2, 4)).changed, false, 'not on the floor');
    v = edit(room(), 'laser', at(3, 5)).vault;
    eq(v.defenses[0], { t: 'laser', x: 3, y: 5, axis: 'h', mode: 'blink', phase: 0 });
    const seen = [];
    for (let k = 0; k < 4; k++) { v = edit(v, 'laser', at(3, 5)).vault; seen.push(v.defenses[0].axis + v.defenses[0].mode); }
    eq(seen, ['hon', 'vblink', 'von', 'hblink']);
    v = edit(room(), 'plate', at(1, 1)).vault;
    v = edit(v, 'mark', at(1, 1)).vault;
    eq(v.defenses, [{ t: 'mark', x: 1, y: 1 }]);
    eq(edit(v, 'mark', at(1, 1)).vault.defenses, []);
  });

  test('the eraser takes a defence first, then a wall, a door or a second exit', () => {
    let v = taps(room(), 'guard', [at(1, 3), at(2, 3), at(3, 3)]).vault;
    v = edit(v, 'erase', at(3, 3)).vault;
    eq(v.defenses, []);
    v = edit(v, 'erase', at(0, 3)).vault;
    eq(v.tiles[3], '......#');
    eq(edit(v, 'erase', at(3, 3)).changed, false);
  });

  test('where a tool can go', () => {
    eq(targets(room(), 'entry'), [], 'the room has no free floor on its edge');
    const opened = edit(room(), 'wall', at(0, 4)).vault;
    eq(targets(opened, 'entry'), [at(0, 4)]);
    eq(targets(room(), 'cam').length, 22, 'every wall cell beside the floor (corners see none)');
  });

  test('check: accepted or not, the cost, and a grade from 1 to 5', () => {
    const c = check(room());
    eq([c.ok, c.cost, c.grade >= 1], [true, 0, true]);
    let v = room();
    for (const x of [1, 2, 3, 4, 5]) v = edit(v, 'laser', at(x, 6)).vault;
    v = edit(v, 'laser', at(3, 6)).vault;
    const blocked = { ...copy(v), defenses: [{ t: 'laser', x: 3, y: 6, axis: 'h', mode: 'on' }] };
    eq(check(blocked).errors, ['unsolvable']);
    const rich = taps(room(), 'guard', [at(1, 1), at(5, 1), at(1, 7), at(5, 7), at(1, 4)]).vault;
    eq(check(rich).errors.includes('budget'), true);
    eq(check(rich, 130).errors.includes('budget'), false);
    const lv5 = check(generate(3, 5));
    ok(lv5.ok && lv5.grade >= 4, 'a level-5 vault grades high');
  });
});
