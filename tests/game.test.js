import { suite, test, eq, ok } from './harness.js';
import {
  newGame, load, claimAll, unclaimedMeals, unclaimedWeeks, fits, place, settle, collect, stored, freeSpot, move,
  KINDS, ROCKS, SIZE, MEAL_COINS, MOVE_WATER, WEEK_GEMS, START, fmtLeft, cap, give, palaceLv, builders, busy,
  whyNot, upgrade, whyNotUp, clearRock, speedUp, speedCost, maxCount, priceOf, itemAt, rockAt,
} from '../js/domain/game.js';

const MIN = 60000, HOUR = 60 * MIN;
const e = (day, meal) => ({ day, meal });
const D = '2026-11-11';
// A game with no obstacles and plenty of everything, for the rules that aren't about money.
const rich = () => ({ ...newGame(D), rocks: [], res: { coin: 99999, water: 99999, gem: 999 } });
const big = (g) => ({ ...g, items: g.items.map(i => i.kind === 'palace' ? { ...i, lv: 5 } : i) });
const byKind = (g, kind) => g.items.filter(i => i.kind === kind);

suite('game', () => {
  test('a new game has the palace in the middle, one builder, the starting resources and obstacles round the edge', () => {
    const g = newGame(D);
    eq(g.res, START);
    eq(byKind(g, 'palace').length, 1);
    eq(builders(g), 1);
    const p = byKind(g, 'palace')[0];
    eq([p.x, p.y, p.lv], [7, 7, 1]);
    ok(g.rocks.length > 10, 'obstacles');
    for (const r of g.rocks) ok(fits({ ...g, rocks: g.rocks.filter(o => o.id !== r.id) }, r.kind, r.x, r.y), 'no obstacle on another thing');
    eq(newGame(D).rocks.map(r => [r.kind, r.x, r.y]), g.rocks.map(r => [r.kind, r.x, r.y])); // the same day makes the same land
  });

  test('a version-1 save moves to the bigger land, keeps its coins and buildings, and gets a builder', () => {
    const old = { v: 1, started: '2026-11-11', coins: 140, claimed: ['2026-11-11|lunch'], items: [
      { id: 'p', kind: 'palace', x: 4, y: 4, done: 0, at: 0 },
      { id: 'c', kind: 'caravan', x: 0, y: 0, done: 0, at: 500 },
      { id: 'g', kind: 'garden', x: 8, y: 8, done: 9000, at: 9000 },
    ] };
    const g = load(old, '2026-11-13');
    eq(g.v, 2);
    eq(g.res.coin, 140);
    eq(g.claimed, ['2026-11-11|lunch']);
    eq(g.items.find(i => i.id === 'c').x, 3);
    eq(g.items.find(i => i.id === 'c').lv, 1);
    eq(g.items.find(i => i.id === 'g').lv, 0);
    eq(g.items.find(i => i.id === 'g').job.end, 9000);
    eq(builders(g), 1);
    eq(load(g, '2026-11-13'), g);
  });

  test('each logged meal gives coins once; activity days give water; claims stay within the caps', () => {
    const g = newGame(D);
    const data = { entries: [e(D, 'lunch'), e(D, 'lunch'), e(D, 'breakfast')], activity: [{ day: D, minutes: 30 }, { day: '2026-11-10', minutes: 5 }] };
    const a = claimAll(g, data, D);
    eq(a.gained, { coin: 2 * MEAL_COINS, water: MOVE_WATER, gem: 0 });
    eq(a.game.res.coin, START.coin + 2 * MEAL_COINS);
    eq(claimAll(a.game, data, D).gained, { coin: 0, water: 0, gem: 0 });
    const full = claimAll({ ...g, res: { ...g.res, coin: cap(g, 'coin') - 5 } }, data, D);
    eq(full.gained.coin, 5);
  });

  test('meals from two days before the start count, older ones and future ones do not', () => {
    eq(unclaimedMeals(newGame(D), [e('2026-11-09', 'dinner'), e('2026-11-08', 'dinner'), e('2026-11-12', 'lunch')], D), ['2026-11-09|dinner']);
  });

  test('a finished week with five logged days gives gems once', () => {
    const g = newGame(D);
    const five = ['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-15', '2026-11-17'].map(d => e(d, 'lunch'));
    eq(unclaimedWeeks(g, five, '2026-11-17'), []); // the week isn't over
    eq(unclaimedWeeks(g, five, '2026-11-18'), [0]);
    eq(unclaimedWeeks(g, five.slice(1), '2026-11-18'), []);
    const a = claimAll(g, { entries: five, activity: [] }, '2026-11-18');
    eq(a.gained.gem, WEEK_GEMS);
    eq(claimAll(a.game, { entries: five, activity: [] }, '2026-11-18').gained.gem, 0);
  });

  test('the caps are the palace plus finished storages', () => {
    let g = rich();
    eq(cap(g, 'coin'), KINDS.palace.store.coin[0]);
    g = place(g, 'treasury', 0, 0, 0);
    eq(cap(g, 'coin'), KINDS.palace.store.coin[0]); // still being built
    g = settle(g, HOUR).game;
    eq(cap(g, 'coin'), KINDS.palace.store.coin[0] + KINDS.treasury.levels[0].store);
    eq(give({ ...g, res: { coin: 0, water: 0, gem: 0 } }, { coin: 1e6, gem: 7 }).got, { coin: cap(g, 'coin'), water: 0, gem: 7 });
  });

  test('building takes the builder; a second job must wait for it', () => {
    let g = rich();
    g = place(g, 'caravan', 0, 0, 0);
    eq(busy(g), 1);
    eq(whyNot(g, 'qanat'), 'builder');
    eq(place(g, 'qanat', 4, 0, 0), null);
    g = settle(g, KINDS.caravan.levels[0].time).game;
    eq(busy(g), 0);
    eq(byKind(g, 'caravan')[0].lv, 1);
    ok(place(g, 'qanat', 4, 0, 0), 'the builder is free again');
  });

  test('how many of a kind may stand, and how high it may go, follow the palace level', () => {
    let g = rich();
    eq(maxCount(g, 'tower'), 0);
    eq(whyNot(g, 'tower'), 'palace');
    g = place(g, 'caravan', 0, 0, 0); g = settle(g, HOUR).game;
    eq(whyNot(g, 'caravan'), 'count');
    const id = byKind(g, 'caravan')[0].id;
    eq(whyNotUp(g, id), 'palace');
    g = big(g);
    eq(whyNotUp(g, id), null);
    eq(maxCount(g, 'tower'), 3);
  });

  test('upgrading costs the next level, takes time, then the level rises; the palace level opens more', () => {
    let g = rich();
    const pid = byKind(g, 'palace')[0].id;
    const before = g.res.coin;
    g = upgrade(g, pid, 1000);
    eq(g.res.coin, before - KINDS.palace.levels[1].cost.coin);
    eq(palaceLv(g), 1);
    eq(settle(g, 1000 + KINDS.palace.levels[1].time - 1).done, []);
    g = settle(g, 1000 + KINDS.palace.levels[1].time).game;
    eq(palaceLv(g), 2);
    eq(maxCount(g, 'tower'), 1);
    eq(cap(g, 'coin'), KINDS.palace.store.coin[1]);
  });

  test('a producer fills up to its store, stops while upgrading, and collecting keeps the part already made', () => {
    let g = place(rich(), 'caravan', 0, 0, 0);
    const t = KINDS.caravan.levels[0].time, id = byKind(g, 'caravan')[0].id;
    g = settle(g, t).game;
    g = { ...g, res: { ...g.res, coin: 0 } }; // room in the store
    const it = () => g.items.find(i => i.id === id);
    eq(stored(it(), t + 90 * MIN), 3); // 2 an hour
    const c = collect(g, id, t + 90 * MIN);
    eq(c.gained, 3);
    eq(stored(c.game.items.find(i => i.id === id), t + 120 * MIN), 1);
    eq(stored(it(), t + 1000 * HOUR), KINDS.caravan.levels[0].cap);
    const up = upgrade(big({ ...g, res: { ...g.res, coin: 1000 } }), id, t + 2 * HOUR);
    eq(up.res.coin, 1000 + 4 - KINDS.caravan.levels[1].cost.coin); // what it held went in first
    eq(stored(up.items.find(i => i.id === id), t + 3 * HOUR), 0);
  });

  test('collecting into a full store takes only what fits and leaves the rest inside', () => {
    let g = place(rich(), 'caravan', 0, 0, 0);
    const id = byKind(g, 'caravan')[0].id;
    g = settle(g, HOUR).game;
    g = { ...g, res: { ...g.res, coin: cap(g, 'coin') - 2 } };
    const c = collect(g, id, HOUR + 10 * HOUR);
    eq(c.gained, 2);
    ok(stored(c.game.items.find(i => i.id === id), HOUR + 10 * HOUR) > 0, 'the rest stays');
  });

  test('clearing an obstacle costs coins and a builder, then frees its place and maybe gives a gem', () => {
    const g0 = newGame(D);
    const r = g0.rocks.find(o => o.gem) || g0.rocks[0];
    let g = clearRock(g0, r.id, 0);
    eq(g.res.coin, START.coin - ROCKS[r.kind].cost);
    eq(busy(g), 1);
    eq(rockAt(g, r.x, r.y).id, r.id);
    const s = settle(g, ROCKS[r.kind].time);
    eq(rockAt(s.game, r.x, r.y), null);
    eq(s.gems, r.gem);
    eq(s.game.res.gem, START.gem + r.gem);
  });

  test('gems finish a job at once: one for each hour left', () => {
    let g = rich();
    const pid = byKind(g, 'palace')[0].id;
    g = upgrade(g, pid, 0);
    const job = byKind(g, 'palace')[0].job;
    eq(speedCost(job, 0), 1); // 30 minutes
    const s = speedUp(g, pid, 0);
    eq(palaceLv(s), 2);
    eq(s.res.gem, g.res.gem - 1);
    eq(speedUp({ ...g, res: { ...g.res, gem: 0 } }, pid, 0), null);
  });

  test('builder huts: the second costs gems and needs palace level 2, and adds a builder', () => {
    let g = rich();
    eq(whyNot(g, 'builder'), 'count');
    g = big(g);
    eq(priceOf(g, 'builder'), { gem: KINDS.builder.gems[1] });
    const spot = freeSpot(g, 'builder');
    g = place(g, 'builder', spot.x, spot.y, 0);
    eq(builders(g), 2);
    eq(g.res.gem, 999 - KINDS.builder.gems[1]);
  });

  test('buildings fit only inside the land and not on another thing; moving checks the place', () => {
    const g = newGame(D);
    const p = byKind(g, 'palace')[0];
    eq(fits(g, 'caravan', SIZE - 1, 0), false);
    eq(fits(g, 'caravan', p.x, p.y), false);
    const s = freeSpot(g, 'badgir');
    eq(fits(g, 'badgir', s.x, s.y), true);
    eq(itemAt(g, p.x + 1, p.y + 1).id, p.id);
    eq(move(g, p.id, -1, 0), null);
  });

  test('time left reads as minutes and seconds, hours, or days', () => {
    eq(fmtLeft(65000), '1:05');
    eq(fmtLeft(2 * HOUR + 5 * MIN), '2:05:00');
    eq(fmtLeft(26 * HOUR), '1 روز 2 ساعت');
  });
});
