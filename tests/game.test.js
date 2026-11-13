import { suite, test, eq, ok } from './harness.js';
import {
  newGame, load, claimAll, unclaimedMeals, unclaimedWeeks, fits, place, settle, collect, stored, freeSpot, move,
  KINDS, ROCKS, SIZE, EDGE, MEAL_COINS, MOVE_WATER, WEEK_GEMS, START, ROCK_START, ROCK_MAX, ROCK_EVERY, fmtLeft, cap, give,
  palaceLv, builders, busy, whyNot, upgrade, whyNotUp, clearRock, speedUp, speedCost, maxCount, priceOf, itemAt, rockAt,
  chestReady, openChest, chestPrize, xpLevel, achievements, claimAch, SHOP,
} from '../js/domain/game.js';

const MIN = 60000, HOUR = 60 * MIN;
const e = (day, meal) => ({ day, meal });
const D = '2026-11-11', T0 = Date.parse(D + 'T12:00:00Z');
const fresh = () => newGame(D, T0);
// A game with no obstacles and plenty of everything, for the rules that aren't about money.
const rich = () => ({ ...fresh(), rocks: [], res: { coin: 9e6, water: 9e6, gem: 999 } });
const atPalace = (g, lv) => ({ ...g, items: g.items.map(i => i.kind === 'palace' ? { ...i, lv } : i) });
const byKind = (g, kind) => g.items.filter(i => i.kind === kind);
const spot = (g, kind) => freeSpot(g, kind);
const build = (g, kind, now = T0) => { const s = spot(g, kind); return place(g, kind, s.x, s.y, now); };

suite('game', () => {
  test('a new game: palace in the middle, two builders, a caravanserai, a qanat and a stone-thrower, 40 obstacles', () => {
    const g = fresh();
    eq(g.res, START);
    eq(g.v, 3);
    const p = byKind(g, 'palace')[0];
    eq([p.x, p.y, p.lv], [SIZE / 2 - 2, SIZE / 2 - 2, 1]);
    eq(builders(g), 2);
    for (const k of ['caravan', 'qanat', 'cannon']) eq(byKind(g, k).length, 1, k);
    eq(g.rocks.length, ROCK_START);
    for (const o of [...g.items, ...g.rocks]) {
      const rest = { ...g, items: g.items.filter(i => i.id !== o.id), rocks: g.rocks.filter(r => r.id !== o.id) };
      ok(fits(rest, o.kind, o.x, o.y), `${o.kind} stands on a free place inside the land`);
    }
    eq(newGame(D, T0).rocks.map(r => [r.kind, r.x, r.y]), g.rocks.map(r => [r.kind, r.x, r.y])); // the same day makes the same land
  });

  test('a version-2 save grows into the new land, keeps resources and levels, and gets a second builder', () => {
    const old = { v: 2, started: D, res: { coin: 700, water: 300, gem: 4 }, claimed: ['2026-11-11|lunch'], moved: [], weeks: [], items: [
      { id: 'p', kind: 'palace', x: 7, y: 7, lv: 2, job: null, at: 0 },
      { id: 'b', kind: 'builder', x: 11, y: 7, lv: 1, job: null, at: 0 },
      { id: 'c', kind: 'caravan', x: 2, y: 2, lv: 2, job: null, at: 500 },
      { id: 't', kind: 'tower', x: 7, y: 11, lv: 0, job: { lv: 1, start: 0, end: 9000 }, at: 0 },
      { id: 'x', kind: 'gone', x: 0, y: 0, lv: 1, job: null, at: 0 },
    ], rocks: [{ id: 'r', kind: 'dune', x: 0, y: 0, gem: 0, job: null }] };
    const g = load(old, '2026-11-14');
    eq(g.v, 3);
    eq(g.res, { coin: 700, water: 300, gem: 4 });
    eq(g.claimed, ['2026-11-11|lunch']);
    eq(palaceLv(g), 2);
    eq(byKind(g, 'caravan')[0].lv, 2);
    eq(byKind(g, 'tower')[0].job.end, 9000);
    eq(byKind(g, 'gone').length, 0);
    eq(builders(g), 2);
    eq(g.rocks.length, ROCK_START);
    for (const o of g.items) ok(fits({ ...g, items: g.items.filter(i => i.id !== o.id) }, o.kind, o.x, o.y), `${o.kind} fits`);
    eq(load(g, '2026-11-14'), g);
  });

  test('a version-1 save still loads', () => {
    const g = load({ v: 1, started: D, coins: 140, items: [{ id: 'p', kind: 'palace', x: 4, y: 4, done: 0, at: 0 }] }, D);
    eq(g.v, 3);
    eq(g.res.coin, 140);
    eq(palaceLv(g), 1);
  });

  test('meals give coins and active days water, by palace level, once each; logged days are counted', () => {
    const g = fresh();
    const data = { entries: [e(D, 'lunch'), e(D, 'lunch'), e(D, 'breakfast')], activity: [{ day: D, minutes: 30 }, { day: '2026-11-10', minutes: 5 }] };
    const a = claimAll(g, data, D);
    eq(a.gained, { coin: 2 * MEAL_COINS[0], water: MOVE_WATER[0], gem: 0 });
    eq(a.game.stats.logDays, 1);
    eq(claimAll(a.game, data, D).gained, { coin: 0, water: 0, gem: 0 });
    const later = claimAll(a.game, { entries: [...data.entries, e(D, 'dinner')], activity: [] }, D);
    eq(later.game.stats.logDays, 1); // the same day again
    const p3 = claimAll(atPalace({ ...g, res: { coin: 0, water: 0, gem: 0 } }, 3), { entries: [e(D, 'lunch')], activity: [] }, D);
    eq(p3.gained.coin, MEAL_COINS[2]);
    const full = claimAll({ ...g, res: { ...g.res, coin: cap(g, 'coin') - 5 } }, data, D);
    eq(full.gained.coin, 5);
  });

  test('meals from two days before the start count, older ones and future ones do not', () => {
    eq(unclaimedMeals(fresh(), [e('2026-11-09', 'dinner'), e('2026-11-08', 'dinner'), e('2026-11-12', 'lunch')], D), ['2026-11-09|dinner']);
  });

  test('a finished week with five logged days gives gems once', () => {
    const g = fresh();
    const five = ['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-15', '2026-11-17'].map(d => e(d, 'lunch'));
    eq(unclaimedWeeks(g, five, '2026-11-17'), []); // the week isn't over
    eq(unclaimedWeeks(g, five, '2026-11-18'), [0]);
    eq(unclaimedWeeks(g, five.slice(1), '2026-11-18'), []);
    const a = claimAll(g, { entries: five, activity: [] }, '2026-11-18');
    eq(a.gained.gem, WEEK_GEMS);
    eq(claimAll(a.game, { entries: five, activity: [] }, '2026-11-18').gained.gem, 0);
  });

  test('the daily chest opens once a day, only when breakfast, lunch and dinner are logged', () => {
    const g = fresh();
    const two = [e(D, 'breakfast'), e(D, 'lunch')], three = [...two, e(D, 'dinner')];
    eq(chestReady(g, two, D), false);
    eq(chestReady(g, three, D), true);
    eq(chestReady(g, three, '2026-11-12'), false); // yesterday's meals don't count today
    const prize = chestPrize(g, D);
    eq([prize.coin, prize.water], [400, 400]); // two hours of one caravanserai and one qanat
    const o = openChest({ ...g, res: { coin: 0, water: 0, gem: 0 } }, three, D);
    eq(o.got.coin, 400);
    eq(o.game.chest, D);
    eq(openChest(o.game, three, D), null);
  });

  test('the caps are the palace plus finished storages', () => {
    let g = rich();
    eq(cap(g, 'coin'), KINDS.palace.store.coin[0]);
    g = build(g, 'treasury');
    eq(cap(g, 'coin'), KINDS.palace.store.coin[0]); // still being built
    g = settle(g, T0 + HOUR).game;
    eq(cap(g, 'coin'), KINDS.palace.store.coin[0] + KINDS.treasury.levels[0].store);
    eq(give({ ...g, res: { coin: 0, water: 0, gem: 0 } }, { coin: 1e9, gem: 7 }).got, { coin: cap(g, 'coin'), water: 0, gem: 7 });
  });

  test('two builders work at once; a third job waits', () => {
    let g = rich();
    g = build(g, 'treasury'); g = build(g, 'cistern');
    eq(busy(g), 2);
    eq(whyNot(g, 'barracks'), 'builder');
    g = settle(g, T0 + HOUR).game;
    eq(busy(g), 0);
    ok(build(g, 'barracks'), 'free again');
  });

  test('the palace level sets how many of each kind and how high (the table in GAME.md §4)', () => {
    let g = rich();
    eq(maxCount(g, 'tower'), 0);
    eq(whyNot(g, 'tower'), 'palace');
    eq(whyNot(g, 'caravan'), 'count'); // the one a new game has
    const cid = byKind(g, 'caravan')[0].id;
    eq(whyNotUp(g, cid), null); // level 2 is open at palace 1
    g = settle(upgrade(g, cid, T0), T0 + DAYS(1)).game;
    eq(whyNotUp(g, cid), 'palace');
    const p8 = atPalace(g, 8);
    eq([maxCount(p8, 'cannon'), maxCount(p8, 'wall'), maxCount(p8, 'builder'), maxCount(p8, 'hero')], [5, 225, 5, 1]);
    eq(maxCount(atPalace(g, 3), 'lab'), 1);
    eq(maxCount(atPalace(g, 2), 'lab'), 0);
    for (const k of SHOP) eq(KINDS[k].count.length, 8, k), eq(KINDS[k].maxLv.length, 8, k);
    for (const k of SHOP) ok(Math.max(...KINDS[k].maxLv) <= KINDS[k].levels.length, `${k} has every level it may reach`);
  });

  test('upgrading the palace costs coins, takes time, and opens more', () => {
    let g = rich();
    const pid = byKind(g, 'palace')[0].id;
    const before = g.res.coin;
    g = upgrade(g, pid, T0);
    eq(g.res.coin, before - KINDS.palace.levels[1].cost.coin);
    eq(palaceLv(g), 1);
    eq(settle(g, T0 + KINDS.palace.levels[1].time - 1).done, []);
    g = settle(g, T0 + KINDS.palace.levels[1].time).game;
    eq(palaceLv(g), 2);
    eq(maxCount(g, 'tower'), 1);
    eq(cap(g, 'coin'), KINDS.palace.store.coin[1]);
  });

  test('finishing a job gives experience: the square root of its seconds', () => {
    let g = rich();
    const pid = byKind(g, 'palace')[0].id;
    g = settle(upgrade(g, pid, T0), T0 + DAYS(1)).game;
    eq(g.xp, Math.floor(Math.sqrt(KINDS.palace.levels[1].time / 1000)));
    eq(xpLevel(0), { lv: 1, into: 0, need: 50 });
    eq(xpLevel(60), { lv: 2, into: 10, need: 100 });
  });

  test('a producer fills up to its store, stops while upgrading, and collecting keeps the part already made', () => {
    let g = { ...rich(), res: { coin: 0, water: 9e6, gem: 0 } };
    const id = byKind(g, 'caravan')[0].id;
    const it = () => g.items.find(i => i.id === id);
    eq(stored(it(), T0 + 90 * MIN), 300); // 200 an hour
    const c = collect(g, id, T0 + 90 * MIN);
    eq(c.gained, 300);
    eq(stored(c.game.items.find(i => i.id === id), T0 + 120 * MIN), 100);
    eq(stored(it(), T0 + 1000 * HOUR), KINDS.caravan.levels[0].cap);
    const up = upgrade(g, id, T0 + 2 * HOUR);
    eq(up.res.coin, 400); // what it held went in first
    eq(up.res.water, 9e6 - KINDS.caravan.levels[1].cost.water);
    eq(stored(up.items.find(i => i.id === id), T0 + 3 * HOUR), 0);
  });

  test('collecting into a full store takes only what fits and leaves the rest inside', () => {
    let g = rich();
    const id = byKind(g, 'caravan')[0].id;
    g = { ...g, res: { ...g.res, coin: cap(g, 'coin') - 2 } };
    const c = collect(g, id, T0 + 10 * HOUR);
    eq(c.gained, 2);
    ok(stored(c.game.items.find(i => i.id === id), T0 + 10 * HOUR) > 0, 'the rest stays');
  });

  test('clearing an obstacle costs coins and a builder, then frees its place, counts, and gives its gems and experience', () => {
    const g0 = fresh();
    const r = g0.rocks.find(o => o.gem) || g0.rocks[0];
    let g = clearRock(g0, r.id, T0);
    eq(g.res.coin, START.coin - ROCKS[r.kind].cost);
    eq(busy(g), 1);
    eq(rockAt(g, r.x, r.y).id, r.id);
    const s = settle(g, T0 + ROCKS[r.kind].time);
    eq(rockAt(s.game, r.x, r.y), null);
    eq(s.gems, r.gem);
    eq(s.game.res.gem, START.gem + r.gem);
    eq(s.game.stats.cleared, 1);
    eq(s.game.xp, ROCKS[r.kind].xp);
  });

  test('a new obstacle grows every 8 hours, up to the most there may be', () => {
    const g = fresh();
    const s = settle(g, T0 + 3 * ROCK_EVERY + 1);
    eq(s.game.rocks.length, ROCK_START + 3);
    eq(s.grown.length, 3);
    eq(s.game.spawnAt, T0 + 3 * ROCK_EVERY);
    eq(settle(s.game, T0 + 3 * ROCK_EVERY + 2).grown, []);
    eq(settle(g, T0 + 100 * ROCK_EVERY).game.rocks.length, ROCK_MAX);
  });

  test('gems finish a job at once: one per 10 minutes up to an hour, then one per 30 minutes', () => {
    eq(speedCost({ end: 30 * MIN }, 0), 3);
    eq(speedCost({ end: HOUR }, 0), 6);
    eq(speedCost({ end: 2 * HOUR }, 0), 8);
    let g = rich();
    const pid = byKind(g, 'palace')[0].id;
    g = upgrade(g, pid, T0);
    const s = speedUp(g, pid, T0);
    eq(palaceLv(s), 2);
    eq(s.res.gem, g.res.gem - speedCost(byKind(g, 'palace')[0].job, T0));
    eq(speedUp({ ...g, res: { ...g.res, gem: 0 } }, pid, T0), null);
  });

  test('builder huts: two come free, the third costs gems at palace level 2', () => {
    let g = rich();
    eq(whyNot(g, 'builder'), 'count');
    g = atPalace(g, 2);
    eq(priceOf(g, 'builder'), { gem: KINDS.builder.gems[2] });
    g = build(g, 'builder');
    eq(builders(g), 3);
    eq(g.res.gem, 999 - KINDS.builder.gems[2]);
  });

  test('achievements: progress, reaching a tier, claiming its gems once', () => {
    let g = { ...fresh(), stats: { cleared: 6, logDays: 7 } };
    const a = achievements(g);
    eq(a.find(x => x.id === 'clear').ready, true);
    eq(a.find(x => x.id === 'clear').next, 5);
    eq(a.find(x => x.id === 'palace').ready, false);
    const before = g.res.gem;
    g = claimAch(g, 'clear');
    eq(g.res.gem, before + 5);
    eq(achievements(g).find(x => x.id === 'clear').next, 50);
    eq(claimAch(g, 'clear'), null);
    ok(claimAch(g, 'days'), 'seven logged days');
  });

  test('nothing is built on the outer ring, nor on another thing; moving checks the place', () => {
    const g = fresh();
    const p = byKind(g, 'palace')[0];
    eq(fits(g, 'badgir', EDGE - 1, 10), false);
    eq(fits(g, 'badgir', SIZE - EDGE, 10), false);
    eq(fits(g, 'caravan', p.x, p.y), false);
    const s = freeSpot(g, 'badgir');
    eq(fits(g, 'badgir', s.x, s.y), true);
    eq(itemAt(g, p.x + 3, p.y + 3).id, p.id);
    eq(move(g, p.id, 0, 0), null);
  });

  test('time left reads as minutes and seconds, hours, or days', () => {
    eq(fmtLeft(65000), '1:05');
    eq(fmtLeft(2 * HOUR + 5 * MIN), '2:05:00');
    eq(fmtLeft(26 * HOUR), '1 روز 2 ساعت');
  });
});

function DAYS(n) { return n * 24 * HOUR; }
