/*
  «سرزمین»: troops and training (GAME.md §6 army, §7). Pure logic.

  game.army: { troop: count } trained and waiting in the camps.
  game.queue: [{ t: troop, end: ms }] in training, one after another; more barracks train faster
  (the time is shared between them). A troop counts against the camps' room from the moment it is
  queued, as in the genre, so the queue can never overfill the camps.
*/
import { KINDS, level } from './game.js';

const SEC = 1000, MIN = 60 * SEC;

// Battle numbers are per second and in tiles. `aim`: what it walks to (any building, defences,
// resource buildings, walls). `air`: flies over walls and is hit only by what hits air.
export const TROOPS = {
  sword: { name: 'پیاده', room: 1, cost: 25, time: 20 * SEC, hp: 45, dps: 8, range: 0.6, speed: 2, aim: 'any', color: '#d9534f' },
  archer: { name: 'کماندار', room: 1, cost: 50, time: 25 * SEC, hp: 20, dps: 7, range: 3.5, speed: 2.4, aim: 'any', color: '#5cb85c' },
  mace: { name: 'پهلوان گرزدار', room: 5, cost: 250, time: 2 * MIN, hp: 300, dps: 11, range: 1, speed: 1.5, aim: 'def', color: '#8e6bbf' },
  ayyar: { name: 'عیار', room: 1, cost: 25, time: 30 * SEC, hp: 25, dps: 11, range: 0.6, speed: 3.2, aim: 'res', resX: 2, color: '#e8a33c' },
  sapper: { name: 'نقب‌زن', room: 2, cost: 1000, time: MIN, hp: 20, dps: 12, wallX: 40, splash: 1.2, range: 0.6, speed: 3, aim: 'wall', blast: true, color: '#7a7a7a' },
  simorgh: { name: 'سیمرغ‌سوار', room: 5, cost: 2000, time: 5 * MIN, hp: 150, dps: 25, splash: 1.2, range: 0.5, speed: 1.3, aim: 'def', air: true, color: '#3fa7c9' },
  magus: { name: 'مغ آتش‌افکن', room: 4, cost: 1500, time: 5 * MIN, hp: 75, dps: 50, splash: 0.6, range: 3, speed: 2, aim: 'any', color: '#ff7a2a' },
  healer: { name: 'درمانگر', room: 14, cost: 5000, time: 10 * MIN, hp: 500, heal: 35, range: 5, speed: 2, aim: 'heal', air: true, color: '#f4e27a' },
};
export const TROOP_ORDER = Object.keys(TROOPS);

const done = (game, kind) => game.items.filter(it => it.kind === kind && it.lv > 0);

// Room in all finished camps, and how much the trained and queued troops take.
export const armyRoom = (game) => done(game, 'camp').reduce((n, it) => n + level('camp', it.lv).room, 0);
export const armyUsed = (game) => Object.entries(game.army || {}).reduce((n, [t, k]) => n + TROOPS[t].room * k, 0)
  + (game.queue || []).reduce((n, q) => n + TROOPS[q.t].room, 0);
// The troops the best barracks has opened (each level opens the next, KINDS.barracks.levels[].opens).
export function opened(game) {
  const best = Math.max(0, ...done(game, 'barracks').map(it => it.lv));
  return TROOP_ORDER.filter((t, i) => i < best);
}
export const opensAt = (t) => TROOP_ORDER.indexOf(t) + 1; // the barracks level that opens it

export function whyNotTrain(game, t) {
  if (!opened(game).includes(t)) return 'locked';
  if (armyUsed(game) + TROOPS[t].room > armyRoom(game)) return 'room';
  if ((game.res.water || 0) < TROOPS[t].cost) return 'cost';
  return null;
}

// Queues one troop; it is ready after the ones before it.
export function train(game, t, now) {
  if (whyNotTrain(game, t)) return null;
  const n = Math.max(1, done(game, 'barracks').length);
  const q = game.queue || [];
  const from = Math.max(now, q.length ? q[q.length - 1].end : now);
  return { ...game, res: { ...game.res, water: game.res.water - TROOPS[t].cost }, queue: [...q, { t, end: from + TROOPS[t].time / n }] };
}

// Takes the last queued troop of a kind back out, with its water.
export function untrain(game, t, now) {
  const q = game.queue || [];
  const i = q.map(x => x.t).lastIndexOf(t);
  if (i < 0) return null;
  const n = Math.max(1, done(game, 'barracks').length), dt = TROOPS[t].time / n;
  const queue = q.filter((_, j) => j !== i).map((x, j) => j >= i ? { ...x, end: Math.max(now, x.end - dt) } : x);
  // the water comes back whole, even over the cap (it was taken from this store a moment ago)
  return { ...game, queue, res: { ...game.res, water: game.res.water + TROOPS[t].cost } };
}

// Moves finished troops from the queue into the camps.
export function settleArmy(game, now) {
  const q = game.queue || [];
  const ready = q.filter(x => x.end <= now);
  if (!ready.length) return { game, ready: 0 };
  const army = { ...(game.army || {}) };
  for (const x of ready) army[x.t] = (army[x.t] || 0) + 1;
  return { game: { ...game, army, queue: q.filter(x => x.end > now) }, ready: ready.length };
}

// The troops used in a battle leave the camps.
export function spend(game, used) {
  const army = { ...(game.army || {}) };
  for (const [t, n] of Object.entries(used)) army[t] = Math.max(0, (army[t] || 0) - n);
  return { ...game, army };
}

export const armyCount = (game) => Object.values(game.army || {}).reduce((a, b) => a + b, 0);
// The battle numbers of a building kind at a level (KINDS levels carry hp, dps, range…).
export const stats = (kind, lv) => level(kind, Math.min(lv, KINDS[kind].levels.length));
