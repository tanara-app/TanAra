/*
  «سرزمین» (beta, `game` in profile.beta): a city-builder in the genre of Clash of Clans, with a
  Middle Eastern / Iranian mythology theme, tied to the diet app. Pure logic, no drawing.

  State (profile.game):
    { v: 1, started: 'YYYY-MM-DD', coins, claimed: ['day|meal', …], items: [{ id, kind, x, y, done, at }] }
  `done`: when its construction ends (ms); `at`: last time its production was collected (ms).

  Coins come from real habits: every meal logged (a day and a meal with at least one entry) gives
  MEAL_COINS once. The caravanserai also makes coins slowly, up to its store, so there is a
  reason to come back and collect.
*/

export const SIZE = 12;           // the land is SIZE × SIZE tiles
export const MEAL_COINS = 20;
export const START_COINS = 100;
const BACK_DAYS = 2;              // meals from the two days before the game started count too
const KEEP_DAYS = 8;              // claims older than this can't be claimed again anyway

const MIN = 60 * 1000;
// Times are short while the prototype is being tried out.
export const KINDS = {
  palace: { name: 'کاخ', size: 3, cost: 0, time: 0, unique: true },
  caravan: { name: 'کاروانسرا', size: 2, cost: 80, time: 5 * MIN, rate: 1 / (2 * MIN), cap: 30 },
  garden: { name: 'باغ', size: 2, cost: 60, time: 3 * MIN },
  badgir: { name: 'بادگیر', size: 1, cost: 30, time: 1 * MIN },
};
export const SHOP = ['caravan', 'garden', 'badgir'];

const uid = () => Math.random().toString(36).slice(2, 10);
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function newGame(today) {
  const c = Math.floor((SIZE - KINDS.palace.size) / 2);
  return { v: 1, started: today, coins: START_COINS, claimed: [], items: [{ id: uid(), kind: 'palace', x: c, y: c, done: 0, at: 0 }] };
}

// Meals logged that haven't given their coins yet: [{ key, day, meal }].
export function unclaimedMeals(game, entries, today) {
  const from = [addDays(game.started, -BACK_DAYS), addDays(today, -(KEEP_DAYS - 1))].sort()[1];
  const seen = new Set(game.claimed);
  const keys = new Set();
  for (const e of entries || []) {
    if (!e?.day || !e.meal || e.day < from || e.day > today) continue;
    const key = `${e.day}|${e.meal}`;
    if (!seen.has(key)) keys.add(key);
  }
  return [...keys].sort();
}

// Gives the coins for those meals. Returns { game, gained }.
export function claimMeals(game, entries, today) {
  const keys = unclaimedMeals(game, entries, today);
  if (!keys.length) return { game, gained: 0 };
  const cut = addDays(today, -KEEP_DAYS);
  const claimed = [...game.claimed.filter(k => k.slice(0, 10) >= cut), ...keys];
  const gained = keys.length * MEAL_COINS;
  return { game: { ...game, coins: game.coins + gained, claimed }, gained };
}

const covers = (it, x, y) => {
  const s = KINDS[it.kind].size;
  return x >= it.x && x < it.x + s && y >= it.y && y < it.y + s;
};
export const itemAt = (game, x, y) => game.items.find(it => covers(it, x, y)) || null;

// Whether a building of `kind` fits with its corner at (x, y). `ignore`: an item being moved.
export function fits(game, kind, x, y, ignore = null) {
  const s = KINDS[kind].size;
  if (x < 0 || y < 0 || x + s > SIZE || y + s > SIZE) return false;
  return !game.items.some(it => {
    if (it.id === ignore) return false;
    const t = KINDS[it.kind].size;
    return x < it.x + t && it.x < x + s && y < it.y + t && it.y < y + s;
  });
}

// The first free place for a new building, nearest the middle of the land.
export function freeSpot(game, kind) {
  const s = KINDS[kind].size, mid = (SIZE - s) / 2;
  let best = null;
  for (let y = 0; y <= SIZE - s; y++) for (let x = 0; x <= SIZE - s; x++) {
    if (!fits(game, kind, x, y)) continue;
    const d = (x - mid) ** 2 + (y - mid) ** 2;
    if (!best || d < best.d) best = { x, y, d };
  }
  return best && { x: best.x, y: best.y };
}

export const building = (game) => game.items.filter(it => it.done > 0).length; // under construction (or ready to finish)

export function canBuy(game, kind) {
  const k = KINDS[kind];
  if (!k || !SHOP.includes(kind)) return false;
  return game.coins >= k.cost;
}

export function place(game, kind, x, y, now) {
  const k = KINDS[kind];
  if (!canBuy(game, kind) || !fits(game, kind, x, y)) return null;
  const item = { id: uid(), kind, x, y, done: now + k.time, at: now + k.time };
  return { ...game, coins: game.coins - k.cost, items: [...game.items, item] };
}

export function move(game, id, x, y) {
  const it = game.items.find(i => i.id === id);
  if (!it || !fits(game, it.kind, x, y, id)) return null;
  return { ...game, items: game.items.map(i => i.id === id ? { ...i, x, y } : i) };
}

export const left = (it, now) => Math.max(0, (it.done || 0) - now);

// A finished construction becomes a normal building (done: 0) when it is tapped.
export function finish(game, id, now) {
  const it = game.items.find(i => i.id === id);
  if (!it || !it.done || it.done > now) return null;
  return { ...game, items: game.items.map(i => i.id === id ? { ...i, done: 0, at: now } : i) };
}

// Coins waiting in a building that makes them.
export function stored(it, now) {
  const k = KINDS[it.kind];
  if (!k.rate || it.done) return 0;
  return Math.min(k.cap, Math.floor((now - it.at) * k.rate));
}

export function collect(game, id, now) {
  const it = game.items.find(i => i.id === id);
  const n = it ? stored(it, now) : 0;
  if (!n) return null;
  const k = KINDS[it.kind];
  // keep the part of the next coin already made, unless the store was full
  const at = n >= k.cap ? now : it.at + n / k.rate;
  return { game: { ...game, coins: game.coins + n, items: game.items.map(i => i.id === id ? { ...i, at } : i) }, gained: n };
}

export function fmtLeft(ms) {
  const s = Math.ceil(ms / 1000);
  if (s >= 3600) return `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
