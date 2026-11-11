import { suite, test, eq } from './harness.js';
import { newGame, claimMeals, unclaimedMeals, fits, place, finish, collect, stored, freeSpot, move, KINDS, SIZE, MEAL_COINS, START_COINS, fmtLeft } from '../js/domain/game.js';

const MIN = 60000;
const e = (day, meal) => ({ day, meal });

suite('game', () => {
  test('a new game has the palace in the middle and the starting coins', () => {
    const g = newGame('2026-11-11');
    eq(g.coins, START_COINS);
    eq(g.items.length, 1);
    eq([g.items[0].kind, g.items[0].x, g.items[0].y], ['palace', 4, 4]);
  });

  test('each logged meal gives its coins once, however many foods it has', () => {
    const g = newGame('2026-11-11');
    const entries = [e('2026-11-11', 'lunch'), e('2026-11-11', 'lunch'), e('2026-11-11', 'breakfast')];
    const a = claimMeals(g, entries, '2026-11-11');
    eq(a.gained, 2 * MEAL_COINS);
    eq(a.game.coins, START_COINS + 2 * MEAL_COINS);
    eq(claimMeals(a.game, entries, '2026-11-11').gained, 0);
  });

  test('meals from two days before the start count, older ones and future ones do not', () => {
    const g = newGame('2026-11-11');
    eq(unclaimedMeals(g, [e('2026-11-09', 'dinner'), e('2026-11-08', 'dinner'), e('2026-11-12', 'lunch')], '2026-11-11'), ['2026-11-09|dinner']);
  });

  test('old claims are dropped, and those days cannot be claimed again', () => {
    let g = newGame('2026-11-01');
    g = claimMeals(g, [e('2026-11-01', 'lunch')], '2026-11-01').game;
    const later = claimMeals(g, [e('2026-11-01', 'lunch'), e('2026-11-20', 'lunch')], '2026-11-20');
    eq(later.gained, MEAL_COINS);
    eq(later.game.claimed, ['2026-11-20|lunch']);
  });

  test('a building fits only inside the land and not on another', () => {
    const g = newGame('2026-11-11');
    eq(fits(g, 'caravan', 0, 0), true);
    eq(fits(g, 'caravan', SIZE - 1, 0), false);
    eq(fits(g, 'caravan', 3, 3), false); // overlaps the palace at 4..6
    eq(fits(g, 'badgir', 7, 7), true);
  });

  test('placing costs coins and starts the construction; tapping it early does nothing', () => {
    const g = newGame('2026-11-11');
    const p = place(g, 'caravan', 0, 0, 1000);
    eq(p.coins, START_COINS - KINDS.caravan.cost);
    eq(p.items[1].done, 1000 + KINDS.caravan.time);
    eq(finish(p, p.items[1].id, 2000), null);
    eq(finish(p, p.items[1].id, 1000 + KINDS.caravan.time).items[1].done, 0);
  });

  test('cannot place without enough coins, or on another building', () => {
    const g = { ...newGame('2026-11-11'), coins: 10 };
    eq(place(g, 'garden', 0, 0, 0), null);
    eq(place(newGame('2026-11-11'), 'garden', 4, 4, 0), null);
  });

  test('the caravanserai makes coins up to its store, and collecting keeps the part already made', () => {
    let g = place(newGame('2026-11-11'), 'caravan', 0, 0, 0);
    const id = g.items[1].id, t = KINDS.caravan.time;
    g = finish(g, id, t);
    eq(stored(g.items[1], t + 5 * MIN), 2);
    const c = collect(g, id, t + 5 * MIN);
    eq(c.gained, 2);
    eq(stored(c.game.items[1], t + 6 * MIN), 1);
    eq(stored(g.items[1], t + 1000 * MIN), KINDS.caravan.cap);
  });

  test('a free spot is found near the middle, and moving checks the place', () => {
    const g = newGame('2026-11-11');
    const s = freeSpot(g, 'badgir');
    eq(fits(g, 'badgir', s.x, s.y), true);
    eq(move(g, g.items[0].id, 0, 0).items[0].x, 0);
    eq(move(g, g.items[0].id, SIZE - 1, 0), null);
  });

  test('time left reads as minutes and seconds', () => {
    eq(fmtLeft(65000), '1:05');
    eq(fmtLeft(3600000 + 61000), '1:01:01');
  });
});
