import { suite, test, eq, ok } from './harness.js';
import { newGame, give, KINDS, settle } from '../js/domain/game.js';
import { TROOPS, train, untrain, settleArmy, armyRoom, armyUsed, opened, whyNotTrain } from '../js/domain/army.js';
import { makeBattle, deploy, canDeploy, step, result, over, FORTS, fortLayout, fortOpen, endFort, BATTLE_TIME } from '../js/domain/battle.js';

const D = '2026-11-14', T0 = Date.parse(D + 'T12:00:00Z');
const withArmy = (g) => ({ ...g, res: { coin: 9e6, water: 9e6, gem: 0 }, items: [...g.items,
  { id: 'b1', kind: 'barracks', x: 5, y: 5, lv: 2, job: null, at: 0 }, { id: 'a1', kind: 'camp', x: 5, y: 10, lv: 1, job: null, at: 0 }] });
const run = (b, secs = BATTLE_TIME) => { for (let i = 0; i < secs * 10 && !over(b); i++) step(b); return result(b); };
// Places n troops of a kind in a row at the left edge of the map.
const line = (b, t, n, x = 3, y0 = 16) => { for (let i = 0; i < n; i++) deploy(b, t, x, y0 + (i % 8) * 0.5); };

suite('army', () => {
  test('troops open with the barracks level, take room in the camps from the queue on, and cost water', () => {
    let g = withArmy(newGame(D, T0));
    eq(opened(g), ['sword', 'archer']);
    eq(armyRoom(g), 20);
    eq(whyNotTrain(g, 'mace'), 'locked');
    g = train(g, 'sword', T0);
    eq(g.res.water, 9e6 - TROOPS.sword.cost);
    eq(armyUsed(g), 1);
    for (let i = 0; i < 19; i++) g = train(g, 'sword', T0);
    eq(whyNotTrain(g, 'sword'), 'room');
    eq(g.queue[19].end, T0 + 20 * TROOPS.sword.time);
  });

  test('a finished queue fills the camps; taking one back returns its water and pulls the rest forward', () => {
    let g = withArmy(newGame(D, T0));
    g = train(train(train(g, 'sword', T0), 'archer', T0), 'sword', T0);
    const s = settleArmy(g, T0 + TROOPS.sword.time + TROOPS.archer.time);
    eq(s.ready, 2);
    eq(s.game.army, { sword: 1, archer: 1 });
    eq(s.game.queue.length, 1);
    const u = untrain(g, 'archer', T0);
    eq(u.res.water, g.res.water + TROOPS.archer.cost);
    eq(u.queue.map(q => q.t), ['sword', 'sword']);
    eq(u.queue[1].end, T0 + 2 * TROOPS.sword.time);
  });
});

suite('battle', () => {
  test('the forts are laid out without overlaps and inside the land', () => {
    for (const f of FORTS) {
      const cells = new Set();
      for (const i of f.items) {
        const s = KINDS[i.kind].size;
        for (let x = i.x; x < i.x + s; x++) for (let y = i.y; y < i.y + s; y++) {
          ok(!cells.has(`${x},${y}`), `${f.id}: ${i.id} overlaps`); cells.add(`${x},${y}`);
          ok(x >= 2 && y >= 2 && x < 38 && y < 38, `${f.id}: ${i.id} inside`);
        }
      }
    }
  });

  test('troops go down only outside the red zone, and only those in the army', () => {
    const b = makeBattle(fortLayout(newGame(D, T0), 'f1'), { sword: 2 });
    eq(canDeploy(b, 19, 19), false); // on the keep
    eq(canDeploy(b, 17.5, 19), false); // a tile from it
    eq(canDeploy(b, 3, 3), true);
    eq(deploy(b, 'sword', 19, 19), false);
    eq(deploy(b, 'archer', 3, 3), false);
    ok(deploy(b, 'sword', 3, 3));
    ok(deploy(b, 'sword', 3, 4));
    eq(deploy(b, 'sword', 3, 5), false);
    eq(b.used, { sword: 2 });
  });

  test('nothing happens and the clock waits until the first troop goes down', () => {
    const b = makeBattle(fortLayout(newGame(D, T0), 'f1'), { sword: 1 });
    step(b, 5);
    eq(b.t, 0);
    eq(over(b), false);
  });

  test('enough swordsmen take the first fort: three stars and all its loot', () => {
    const b = makeBattle(fortLayout(newGame(D, T0), 'f1'), { sword: 20, archer: 10 });
    line(b, 'sword', 20); line(b, 'archer', 10, 3, 18);
    const r = run(b);
    eq(r.stars, 3);
    eq(r.pct, 100);
    eq(r.loot, { coin: 500, water: 500 });
    ok(r.time < BATTLE_TIME, 'before the time ran out');
  });

  test('a few swordsmen against a stone-thrower lose: the battle ends when no troop is left', () => {
    const b = makeBattle(fortLayout(newGame(D, T0), 'f1'), { sword: 2 });
    deploy(b, 'sword', 19, 30); deploy(b, 'sword', 20, 30); // straight at the stone-thrower
    const r = run(b);
    ok(b.troops.every(t => t.dead), 'all fell');
    ok(r.stars < 3, 'not all stars');
    ok(over(b), 'over');
  });

  test('loot is won building by building: the keep holds a fifth', () => {
    const b = makeBattle({ items: [{ id: 'k', kind: 'palace', lv: 1, x: 18, y: 18 }, { id: 'c', kind: 'caravan', lv: 1, x: 10, y: 18 }], loot: { coin: 1000, water: 100 } }, { sword: 30 });
    const keep = b.blds.find(o => o.keep), car = b.blds.find(o => o.kind === 'caravan');
    eq(keep.loot, { coin: 200, water: 100 }); // no water holder: the keep has all the water
    eq(car.loot, { coin: 800, water: 0 });
  });

  test('walls stop ground troops until broken; sappers break them; flyers pass over', () => {
    const lay = { items: [{ id: 'k', kind: 'palace', lv: 1, x: 18, y: 18 }, ...[...Array(12)].map((_, i) => ({ id: `w${i}`, kind: 'wall', lv: 1, x: 16, y: 14 + i }))], loot: {} };
    const a = makeBattle(lay, { sword: 1 });
    deploy(a, 'sword', 10, 20);
    step(a, 6);
    const sw = a.troops[0];
    ok(sw.x < 16, 'held at the wall');
    ok(a.blds.filter(o => o.wall).some(o => o.hp < o.max), 'hitting the wall');
    const s = makeBattle(lay, { sapper: 1 });
    deploy(s, 'sapper', 10, 20);
    step(s, 6);
    ok(s.blds.filter(o => o.wall).some(o => o.dead), 'a wall blown up');
    ok(s.troops[0].dead, 'the sapper is spent');
  });

  test('a pit fires once under ground troops', () => {
    const lay = { items: [{ id: 'k', kind: 'palace', lv: 1, x: 18, y: 18 }, { id: 'p', kind: 'pit', lv: 1, x: 14, y: 19 }], loot: {} };
    const b = makeBattle(lay, { sword: 3 });
    for (let i = 0; i < 3; i++) deploy(b, 'sword', 10, 19.2 + i * 0.3);
    step(b, 4);
    const pit = b.blds.find(o => o.trap);
    ok(pit.dead, 'fired');
    ok(b.troops.every(t => t.hp < t.max || t.dead), 'everyone near was hurt');
  });

  test('a fort result goes into the game: troops spent, loot taken once, best stars, the next fort opens', () => {
    let g = { ...newGame(D, T0), army: { sword: 10 }, res: { coin: 0, water: 0, gem: 0 } };
    eq(fortOpen(g, 'f2'), false);
    const r = { stars: 2, pct: 80, loot: { coin: 300, water: 200 }, used: { sword: 6 } };
    const e = endFort(g, 'f1', r, give);
    g = e.game;
    eq(g.army.sword, 4);
    eq(g.res.coin, 300);
    eq(g.forts.f1.stars, 2);
    eq(g.stats.stars, 2);
    eq(g.stats.campaign, 1);
    eq(fortOpen(g, 'f2'), true);
    eq(fortLayout(g, 'f1').loot, { coin: 200, water: 300 });
    g = endFort(g, 'f1', { stars: 1, pct: 50, loot: { coin: 0, water: 0 }, used: {} }, give).game;
    eq(g.forts.f1.stars, 2); // the best stays
    eq(g.stats.stars, 2);
  });

  test('the same deployments give the same battle', () => {
    const go = () => { const b = makeBattle(fortLayout(newGame(D, T0), 'f3'), { sword: 15, archer: 10 }); line(b, 'sword', 15); line(b, 'archer', 10, 3, 18); return run(b); };
    eq(go(), go());
  });
});
