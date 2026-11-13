/*
  «سرزمین»: the divs' raids on the player's land (GAME.md §9, approved 2026-11-13). Pure logic.

  Every 12 to 36 hours a div army raids the land, only while the game is closed: raids that came
  due are fought when the game opens (runRaids), with the same battle engine as the player's attacks
  (js/domain/battle.js), so they can be replayed. The divs' army grows with the palace level and they
  come in from one side of the map. Losing costs at most a tenth of what sits in the storages beyond
  the palace's own store (the palace's share is safe); no building stays destroyed. After a raid that
  took a star there is a 12-hour shield. A defence with no star lost gives coins and medals; stars
  lost cost medals (the genre's trophies, shown on the family board).

  game.raidAt: when the next raid comes (ms). game.shield: shielded until (ms). game.medals.
  game.raids: the last RAID_KEEP raids, newest first:
    { at, seen, stars, pct, lost: { coin, water }, won: { coin }, medals, army, plan, items }
  `items` is the land as it was, `plan` the deployments ({ s: seconds, t, x, y }): enough to replay.
*/
import { KINDS, palaceLv, give } from './game.js';
import { makeBattle, deploy, step, over, result, STEP, canDeploy } from './battle.js';
import { TROOPS } from './army.js';

const HOUR = 3600 * 1000;
export const RAID_MIN = 12 * HOUR, RAID_MAX = 36 * HOUR, SHIELD = 12 * HOUR, FIRST_RAID = 24 * HOUR;
export const RAID_KEEP = 5;
const ROOM = [12, 22, 32, 45, 60, 75, 95, 115]; // the divs' army room by palace level
const LOOT_PART = 0.1;

function rng(seed) {
  let s = 0; for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// The divs' army for a palace level: mostly swordsmen and archers, heavier troops as the palace grows.
export function divArmy(P, r) {
  const army = {}, add = (t, n) => { if (n > 0) army[t] = (army[t] || 0) + n; };
  let room = ROOM[P - 1];
  const heavy = [];
  if (P >= 2) heavy.push(['mace', 1 + Math.floor(P / 3)]);
  if (P >= 3) heavy.push(['sapper', 1 + Math.floor(P / 3)], ['ayyar', 2 + P]);
  if (P >= 4) heavy.push(['simorgh', Math.floor(P / 2) - 1]);
  if (P >= 5) heavy.push(['magus', P - 3]);
  for (const [t, n] of heavy) { const k = Math.min(n, Math.floor(room * 0.6 / TROOPS[t].room)); add(t, k); room -= k * TROOPS[t].room; }
  const archers = Math.floor(room * (0.3 + r() * 0.2));
  add('archer', archers); add('sword', room - archers);
  return army;
}

// Where and when the divs place their troops: heavy ones first along one side, the rest a few seconds later.
export function divPlan(army, side, r) {
  const plan = [], order = ['mace', 'simorgh', 'sapper', 'sword', 'ayyar', 'magus', 'archer', 'healer'];
  let i = 0;
  for (const t of order) for (let n = 0; n < (army[t] || 0); n++, i++) {
    const along = 8 + r() * 24, off = 0.6 + r() * 0.8;
    const [x, y] = side === 0 ? [along, off] : side === 1 ? [40 - off, along] : side === 2 ? [along, 40 - off] : [off, along];
    plan.push({ s: (['mace', 'simorgh'].includes(t) ? 0 : 3) + (i % 6) * 0.2, t, x: +x.toFixed(2), y: +y.toFixed(2) });
  }
  return plan.sort((a, b) => a.s - b.s);
}

// The land as the battle engine wants it (what is being built for the first time isn't there yet).
export const landItems = (game) => game.items.filter(it => it.lv > 0).map(({ id, kind, lv, x, y }) => ({ id, kind, lv, x, y }));

// What the divs can carry off: a tenth of what is beyond the palace's own store.
export function lootable(game) {
  const P = palaceLv(game), out = {};
  for (const r of ['coin', 'water']) out[r] = Math.floor(LOOT_PART * Math.max(0, (game.res[r] || 0) - KINDS.palace.store[r][P - 1]));
  return out;
}

// Runs a battle from a plan to its end (a raid now, or its replay later).
export function playRaid(items, army, plan, loot, onStep) {
  const b = makeBattle({ items, loot, keepShare: 0 }, army);
  let k = 0;
  while (true) {
    while (k < plan.length && plan[k].s <= b.clock + 1e-9) { const p = plan[k++]; deploy(b, p.t, p.x, p.y) || nudge(b, p); }
    if (over(b) && k >= plan.length) break;
    step(b, STEP); b.clock += STEP;
    onStep?.(b);
    if (b.clock > 400) break; // safety
  }
  return { b, res: result(b) };
}
// A troop whose spot is in the red zone goes down a little further out.
function nudge(b, p) {
  for (let d = 0.5; d < 3; d += 0.5) for (const [dx, dy] of [[0, -d], [d, 0], [0, d], [-d, 0]]) if (canDeploy(b, p.x + dx, p.y + dy)) { deploy(b, p.t, p.x + dx, p.y + dy); return; }
}

const medalsFor = (stars) => stars ? -5 * stars : 8;

// One raid at time `at`: fights it, takes the loss, sets the shield and the next raid.
export function raid(game, at) {
  const P = palaceLv(game), r = rng(`${game.started}|${at}`);
  const army = divArmy(P, r), plan = divPlan(army, Math.floor(r() * 4), r);
  const items = landItems(game), loot = lootable(game);
  const { res } = playRaid(items, army, plan, loot);
  const lost = { coin: Math.min(res.loot.coin, game.res.coin), water: Math.min(res.loot.water, game.res.water) };
  let g = { ...game, res: { ...game.res, coin: game.res.coin - lost.coin, water: game.res.water - lost.water } };
  const won = { coin: res.stars ? 0 : 50 * P * P };
  if (won.coin) g = give(g, won).game;
  const medals = medalsFor(res.stars);
  const entry = { at, seen: false, stars: res.stars, pct: res.pct, lost, won, medals, army, plan, items, loot };
  const shield = res.stars ? at + SHIELD : 0;
  return { ...g, medals: Math.max(0, (g.medals || 0) + medals), shield: Math.max(g.shield || 0, shield),
    raidAt: Math.max(at, shield) + RAID_MIN + Math.floor(r() * (RAID_MAX - RAID_MIN)),
    raids: [entry, ...(g.raids || [])].slice(0, RAID_KEEP),
    stats: { ...g.stats, defends: (g.stats?.defends || 0) + (res.stars ? 0 : 1) } };
}

// Every raid that came due while the game was closed (at most three at a time).
export function runRaids(game, now) {
  let g = game.raidAt ? game : { ...game, raidAt: now + FIRST_RAID };
  for (let n = 0; n < 3 && g.raidAt <= now; n++) {
    if ((g.shield || 0) > g.raidAt) { g = { ...g, raidAt: g.shield }; continue; }
    g = raid(g, g.raidAt);
  }
  return g;
}

export const unseen = (game) => (game.raids || []).filter(x => !x.seen);
export const markSeen = (game) => ({ ...game, raids: (game.raids || []).map(x => ({ ...x, seen: true })) });
export const shieldLeft = (game, now) => Math.max(0, (game.shield || 0) - now);
