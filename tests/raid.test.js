import { suite, test, eq, ok } from './harness.js';
import { newGame, KINDS } from '../js/domain/game.js';
import { TROOPS } from '../js/domain/army.js';
import { divArmy, divPlan, lootable, raid, runRaids, playRaid, landItems, unseen, markSeen, shieldLeft, RAID_MIN, RAID_MAX, SHIELD, FIRST_RAID } from '../js/domain/raid.js';

const D = '2026-11-14', T0 = Date.parse(D + 'T12:00:00Z'), HOUR = 3600e3;
const room = (army) => Object.entries(army).reduce((n, [t, k]) => n + TROOPS[t].room * k, 0);
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };
// A land with a full treasury beyond the palace's store, so there is something to lose.
const rich = () => { const g = newGame(D, T0); return { ...g, res: { coin: 3000, water: 2500, gem: 0 }, items: [...g.items,
  { id: 'tr', kind: 'treasury', x: 8, y: 8, lv: 3, job: null, at: 0 }, { id: 'ci', kind: 'cistern', x: 28, y: 28, lv: 3, job: null, at: 0 }] }; };

suite('raid', () => {
  test('the divs bring an army that fills their room and grows with the palace', () => {
    for (let P = 1; P <= 8; P++) eq(room(divArmy(P, seq([0.5]))), [12, 22, 32, 45, 60, 75, 95, 115][P - 1], `palace ${P}`);
    eq(Object.keys(divArmy(1, seq([0.5]))).sort(), ['archer', 'sword']);
    ok(divArmy(4, seq([0.5])).simorgh > 0, 'flyers from palace 4');
  });

  test('they come in from one side, the heavy troops first', () => {
    const plan = divPlan({ mace: 1, sword: 3 }, 3, seq([0.5]));
    eq(plan.length, 4);
    eq(plan[0].t, 'mace');
    ok(plan.every(p => p.x < 2), 'all on the left side');
    ok(plan.slice(1).every(p => p.s >= 3), 'the rest a few seconds later');
  });

  test('only a tenth of what is beyond the palace store can be lost', () => {
    const g = rich();
    eq(lootable(g), { coin: Math.floor((3000 - KINDS.palace.store.coin[0]) / 10), water: Math.floor((2500 - KINDS.palace.store.water[0]) / 10) });
    eq(lootable({ ...g, res: { coin: 500, water: 0, gem: 0 } }), { coin: 0, water: 0 });
  });

  test('a raid is fought, logged for replay, costs at most the lootable part, and sets the next one', () => {
    const g = rich(), at = T0 + FIRST_RAID;
    const r = raid(g, at);
    const x = r.raids[0];
    eq(x.at, at);
    eq(x.seen, false);
    ok(x.lost.coin <= lootable(g).coin && x.lost.water <= lootable(g).water, 'within the lootable part');
    eq(r.res.coin, g.res.coin - x.lost.coin + x.won.coin);
    ok(r.raidAt >= at + RAID_MIN && r.raidAt < Math.max(at, r.shield) + RAID_MAX, 'next raid 12 to 36 hours on');
    if (x.stars) { eq(r.shield, at + SHIELD); ok(r.raidAt >= r.shield, 'not while shielded'); eq(r.medals, 0); }
    else { eq(r.stats.defends, 1); ok(x.won.coin > 0, 'a defence pays'); eq(r.medals, 8); }
    // the replay gives the same battle
    const again = playRaid(x.items, x.army, x.plan, x.loot).res;
    eq([again.stars, again.pct], [x.stars, x.pct]);
  });

  test('no defences: the divs win and take what they can; the land stays as it was', () => {
    const g = { ...rich(), items: rich().items.filter(i => i.kind !== 'cannon') };
    const r = raid(g, T0 + FIRST_RAID);
    ok(r.raids[0].stars >= 1, 'a star');
    ok(r.raids[0].lost.coin > 0 || r.raids[0].lost.water > 0, 'something lost');
    eq(r.items, g.items);
  });

  test('raids come only when due; a new game is safe for a day; at most three at once', () => {
    const g = newGame(D, T0);
    const a = runRaids(g, T0);
    eq(a.raidAt, T0 + FIRST_RAID);
    eq(a.raids, undefined);
    const b = runRaids(a, T0 + FIRST_RAID + 1);
    eq(b.raids.length, 1);
    const c = runRaids(a, T0 + 100 * 24 * HOUR);
    eq(c.raids.length, 3);
    eq(unseen(c).length, 3);
    eq(unseen(markSeen(c)).length, 0);
    eq(shieldLeft({ shield: T0 + 10 }, T0), 10);
  });

  test('a shield pushes the raid past its end', () => {
    const g = { ...newGame(D, T0), raidAt: T0 + HOUR, shield: T0 + 5 * HOUR };
    const r = runRaids(g, T0 + 2 * HOUR);
    eq(r.raids, undefined);
    eq(r.raidAt, T0 + 5 * HOUR);
  });

  test('the land for a raid leaves out what is still being built for the first time', () => {
    const g = newGame(D, T0);
    const items = landItems({ ...g, items: [...g.items, { id: 'n', kind: 'tower', x: 5, y: 5, lv: 0, job: { lv: 1 }, at: 0 }] });
    eq(items.length, g.items.length);
  });
});
