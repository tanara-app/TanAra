/*
  «سرزمین» (beta, `game` in profile.beta): a city-builder in the genre of Clash of Clans, with a
  Middle Eastern / Iranian mythology theme, tied to the diet app. Pure logic, no drawing.
  The design and the reasons behind the numbers are in GAME.md (phase 1: resources, storage,
  builders, levels and upgrades, the palace's level as the cap, obstacles).

  State (profile.game), version 2:
    { v: 2, started: 'YYYY-MM-DD', res: { coin, water, gem },
      claimed: ['day|meal', …], moved: ['day', …], weeks: [n, …],
      items: [{ id, kind, x, y, lv, job, at }], rocks: [{ id, kind, x, y, gem, job }] }
  `lv`: the level built (0 while the first construction runs). `job`: { lv, start, end } while a
  builder works on it (ms). `at`: last time its production was collected (ms). `rocks` are the
  obstacles on the land; clearing one takes a builder and some time.

  Rewards come only from logging (never from eating less or more, never from the scale):
  every meal logged gives coins, every day with some activity gives water, every week with five
  logged days gives gems. Producers make more slowly, up to their own store, so there is a reason
  to come back. Each resource has a cap (the palace plus the storages); what doesn't fit is lost.
*/

export const SIZE = 18;            // the land is SIZE × SIZE tiles
export const MEAL_COINS = 20;
export const MOVE_WATER = 40;      // a day with at least MOVE_MIN minutes of activity
export const MOVE_MIN = 10;
export const WEEK_GEMS = 5;        // a week (from the start day) with WEEK_DAYS days that have entries
export const WEEK_DAYS = 5;
export const START = { coin: 200, water: 100, gem: 5 };
const BACK_DAYS = 2;               // logs from the two days before the game started count too
const KEEP_DAYS = 8;               // claims older than this can't be claimed again anyway
export const PALACE_MAX = 5;

const MIN = 60 * 1000, HOUR = 60 * MIN;
const lvls = (rows) => rows.map(([cost, time, extra = {}]) => ({ cost, time, ...extra }));

/*
  Every kind: size (tiles), count[palace level − 1] (how many may stand), maxLv[palace level − 1]
  (how high they may go), levels[lv − 1] (what that level costs to reach, how long it takes, and
  what it gives: `rate`/`cap` for producers (per hour, held inside), `store` for storages).
*/
export const KINDS = {
  palace: { name: 'کاخ', size: 3, count: [1, 1, 1, 1, 1], maxLv: [5, 5, 5, 5, 5],
    store: { coin: [300, 600, 1200, 2000, 3000], water: [300, 600, 1200, 2000, 3000] },
    levels: lvls([[{}, 0], [{ coin: 300, water: 100 }, 30 * MIN], [{ coin: 1200, water: 400 }, 2 * HOUR], [{ coin: 3000, water: 1200 }, 6 * HOUR], [{ coin: 6000, water: 3000 }, 12 * HOUR]]) },
  builder: { name: 'خانه‌ی معمار', size: 2, count: [1, 2, 2, 3, 3], maxLv: [1, 1, 1, 1, 1],
    levels: lvls([[{ gem: 0 }, 0]]), gems: [0, 10, 25] }, // the 1st hut is free, then 10 and 25 gems
  caravan: { name: 'کاروانسرا', size: 2, count: [1, 2, 2, 3, 3], maxLv: [1, 2, 3, 4, 5], makes: 'coin',
    levels: lvls([[{ coin: 80 }, 5 * MIN, { rate: 2, cap: 30 }], [{ coin: 250 }, HOUR, { rate: 4, cap: 60 }], [{ coin: 700 }, 3 * HOUR, { rate: 7, cap: 120 }], [{ coin: 1500 }, 8 * HOUR, { rate: 11, cap: 200 }], [{ coin: 3000 }, 16 * HOUR, { rate: 16, cap: 300 }]]) },
  qanat: { name: 'قنات', size: 2, count: [1, 1, 2, 2, 3], maxLv: [1, 2, 3, 4, 5], makes: 'water',
    levels: lvls([[{ coin: 60 }, 3 * MIN, { rate: 2, cap: 30 }], [{ coin: 250 }, HOUR, { rate: 4, cap: 60 }], [{ coin: 700 }, 3 * HOUR, { rate: 7, cap: 120 }], [{ coin: 1500 }, 8 * HOUR, { rate: 11, cap: 200 }], [{ coin: 3000 }, 16 * HOUR, { rate: 16, cap: 300 }]]) },
  treasury: { name: 'خزانه', size: 2, count: [1, 1, 2, 2, 3], maxLv: [1, 2, 3, 4, 5], keeps: 'coin',
    levels: lvls([[{ water: 50 }, 3 * MIN, { store: 500 }], [{ water: 200 }, 45 * MIN, { store: 1000 }], [{ water: 600 }, 2 * HOUR, { store: 2000 }], [{ water: 1500 }, 6 * HOUR, { store: 3500 }], [{ water: 3000 }, 12 * HOUR, { store: 5000 }]]) },
  cistern: { name: 'آب‌انبار', size: 2, count: [1, 1, 2, 2, 3], maxLv: [1, 2, 3, 4, 5], keeps: 'water',
    levels: lvls([[{ coin: 50 }, 3 * MIN, { store: 500 }], [{ coin: 200 }, 45 * MIN, { store: 1000 }], [{ coin: 600 }, 2 * HOUR, { store: 2000 }], [{ coin: 1500 }, 6 * HOUR, { store: 3500 }], [{ coin: 3000 }, 12 * HOUR, { store: 5000 }]]) },
  garden: { name: 'باغ', size: 2, count: [1, 2, 3, 4, 5], maxLv: [1, 2, 3, 3, 3],
    levels: lvls([[{ coin: 60 }, 3 * MIN], [{ coin: 300 }, HOUR], [{ coin: 900 }, 4 * HOUR]]) },
  badgir: { name: 'بادگیر', size: 1, count: [2, 4, 6, 8, 10], maxLv: [1, 1, 1, 1, 1],
    levels: lvls([[{ coin: 30 }, MIN]]) },
  wall: { name: 'بارو', size: 1, count: [0, 20, 40, 60, 80], maxLv: [0, 1, 2, 3, 4],
    levels: lvls([[{ coin: 20 }, 0, { hp: 300 }], [{ coin: 80 }, 0, { hp: 600 }], [{ coin: 250 }, 0, { hp: 1200 }], [{ coin: 600 }, 0, { hp: 2000 }]]) },
  tower: { name: 'برج کمان‌دار', size: 2, count: [0, 1, 2, 2, 3], maxLv: [0, 1, 2, 3, 4],
    levels: lvls([[{ coin: 400 }, 30 * MIN, { dps: 10, range: 6 }], [{ coin: 1000 }, 2 * HOUR, { dps: 14, range: 6 }], [{ coin: 2500 }, 6 * HOUR, { dps: 19, range: 6.5 }], [{ coin: 5000 }, 12 * HOUR, { dps: 25, range: 7 }]]) },
};
export const SHOP = ['builder', 'caravan', 'qanat', 'treasury', 'cistern', 'garden', 'badgir', 'wall', 'tower'];

// Obstacles: clearing costs coins and a builder's time; some hide a gem (fixed when the land is made).
export const ROCKS = {
  rock: { name: 'سنگ', size: 2, cost: 100, time: 10 * MIN },
  dune: { name: 'تپه‌ی شن', size: 2, cost: 60, time: 6 * MIN },
  tree: { name: 'درخت خشک', size: 1, cost: 30, time: 3 * MIN },
  bush: { name: 'بوته‌ی خار', size: 1, cost: 15, time: MIN },
};

const uid = () => Math.random().toString(36).slice(2, 10);
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);

// A small seeded random, so the same start day always makes the same land.
function rng(seed) {
  let s = 0; for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const sizeOf = (it) => (KINDS[it.kind] || ROCKS[it.kind]).size;
const overlaps = (a, ax, ay, b) => { const s = sizeOf(a), t = sizeOf(b); return ax < b.x + t && b.x < ax + s && ay < b.y + t && b.y < ay + s; };

// Obstacles scattered round the land, keeping the middle clear.
function makeRocks(game, seed) {
  const r = rng(seed), rocks = [], kinds = ['rock', 'dune', 'tree', 'tree', 'bush', 'bush'];
  const mid = SIZE / 2;
  for (let tries = 0; rocks.length < 24 && tries < 400; tries++) {
    const kind = kinds[Math.floor(r() * kinds.length)], s = ROCKS[kind].size;
    const x = Math.floor(r() * (SIZE - s + 1)), y = Math.floor(r() * (SIZE - s + 1));
    if (Math.abs(x + s / 2 - mid) < 4.5 && Math.abs(y + s / 2 - mid) < 4.5) continue;
    const rock = { id: uid(), kind, x, y, gem: r() < 0.3 ? 1 : 0, job: null };
    if ([...game.items, ...rocks].some(o => overlaps(rock, x, y, o))) continue;
    rocks.push(rock);
  }
  return rocks;
}

export function newGame(today) {
  const c = Math.floor((SIZE - 3) / 2);
  const game = { v: 2, started: today, res: { ...START }, claimed: [], moved: [], weeks: [], items: [
    { id: uid(), kind: 'palace', x: c, y: c, lv: 1, job: null, at: 0 },
    { id: uid(), kind: 'builder', x: c + 4, y: c, lv: 1, job: null, at: 0 },
  ], rocks: [] };
  game.rocks = makeRocks(game, today);
  return game;
}

// A saved game of any version, as version 2. Version 1 had only coins, a 12 × 12 land and `done`.
export function load(saved, today) {
  if (!saved?.v) return newGame(today);
  if (saved.v === 2) return saved;
  const off = (SIZE - 12) / 2;
  const items = (saved.items || []).filter(it => KINDS[it.kind]).map(it => {
    const job = it.done ? { lv: 1, start: it.done - KINDS[it.kind].levels[0].time, end: it.done } : null;
    return { id: it.id, kind: it.kind, x: it.x + off, y: it.y + off, lv: it.kind === 'palace' ? 1 : (job ? 0 : 1), job, at: it.at || 0 };
  });
  const game = { v: 2, started: saved.started || today, res: { coin: saved.coins || 0, water: START.water, gem: START.gem }, claimed: saved.claimed || [], moved: [], weeks: [], items, rocks: [] };
  const spot = freeSpot(game, 'builder');
  if (spot) game.items.push({ id: uid(), kind: 'builder', ...spot, lv: 1, job: null, at: 0 });
  game.rocks = makeRocks(game, game.started);
  return game;
}

/* ---------------- levels, counts, caps ---------------- */

export const palaceLv = (game) => Math.max(1, game.items.find(it => it.kind === 'palace')?.lv || 1);
export const countOf = (game, kind) => game.items.filter(it => it.kind === kind).length;
export const maxCount = (game, kind) => KINDS[kind].count[palaceLv(game) - 1];
export const maxLv = (game, kind) => Math.min(KINDS[kind].levels.length, KINDS[kind].maxLv[palaceLv(game) - 1]);
export const level = (kind, lv) => KINDS[kind].levels[lv - 1] || null;

// What one resource can hold: the palace's own store plus every finished storage.
export function cap(game, res) {
  if (res === 'gem') return Infinity;
  let n = KINDS.palace.store[res][palaceLv(game) - 1];
  for (const it of game.items) if (KINDS[it.kind].keeps === res && it.lv > 0) n += level(it.kind, it.lv).store;
  return n;
}

// Adds resources up to the caps. Returns the game and what actually went in.
export function give(game, add) {
  const res = { ...game.res }, got = { coin: 0, water: 0, gem: 0 };
  for (const [k, v] of Object.entries(add)) {
    if (!v) continue;
    const room = Math.max(0, cap(game, k) - res[k]);
    got[k] = Math.min(v, room); res[k] += got[k];
  }
  return { game: { ...game, res }, got };
}

const affords = (game, cost) => Object.entries(cost).every(([k, v]) => (game.res[k] || 0) >= v);
const pay = (game, cost) => {
  const res = { ...game.res };
  for (const [k, v] of Object.entries(cost)) res[k] -= v;
  return { ...game, res };
};

// The price of the next building of a kind (builder huts cost gems by how many there are).
export function priceOf(game, kind) {
  const k = KINDS[kind];
  if (k.gems) return { gem: k.gems[countOf(game, kind)] ?? Infinity };
  return k.levels[0].cost;
}

/* ---------------- builders ---------------- */

export const builders = (game) => game.items.filter(it => it.kind === 'builder' && it.lv > 0).length;
export const busy = (game) => game.items.filter(it => it.job).length + game.rocks.filter(r => r.job).length;
export const freeBuilder = (game) => busy(game) < builders(game);

// Finishes every job whose time has come (producers start making from the moment they finish).
export function settle(game, now) {
  if (!game.items.some(it => it.job && it.job.end <= now) && !game.rocks.some(r => r.job && r.job.end <= now)) return { game, done: [], gems: 0 };
  const done = [];
  const items = game.items.map(it => {
    if (!it.job || it.job.end > now) return it;
    done.push(it.id);
    return { ...it, lv: it.job.lv, job: null, at: it.job.end };
  });
  let gems = 0;
  const rocks = game.rocks.filter(r => {
    if (!r.job || r.job.end > now) return true;
    done.push(r.id); gems += r.gem; return false;
  });
  let g = { ...game, items, rocks };
  if (gems) g = give(g, { gem: gems }).game;
  return { game: g, done, gems };
}

/* ---------------- building, upgrading, clearing ---------------- */

// Why a new building of `kind` can't be bought now: null if it can.
export function whyNot(game, kind) {
  const k = KINDS[kind];
  if (!k || !SHOP.includes(kind)) return 'none';
  if (maxCount(game, kind) === 0) return 'palace';
  if (countOf(game, kind) >= maxCount(game, kind)) return 'count';
  if (!affords(game, priceOf(game, kind))) return 'cost';
  if (kind !== 'builder' && level(kind, 1).time > 0 && !freeBuilder(game)) return 'builder';
  return null;
}

export function fits(game, kind, x, y, ignore = null) {
  const s = (KINDS[kind] || ROCKS[kind]).size, me = { kind, x, y };
  if (x < 0 || y < 0 || x + s > SIZE || y + s > SIZE) return false;
  return ![...game.items, ...game.rocks].some(o => o.id !== ignore && overlaps(me, x, y, o));
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

export function place(game, kind, x, y, now) {
  if (whyNot(game, kind) || !fits(game, kind, x, y)) return null;
  const L1 = level(kind, 1), instant = L1.time === 0;
  const item = { id: uid(), kind, x, y, lv: instant ? 1 : 0, job: instant ? null : { lv: 1, start: now, end: now + L1.time }, at: now };
  return { ...pay(game, priceOf(game, kind)), items: [...game.items, item] };
}

// Why this building can't go up a level now: null if it can.
export function whyNotUp(game, id) {
  const it = game.items.find(i => i.id === id);
  if (!it || it.job) return 'busy';
  const next = level(it.kind, it.lv + 1);
  if (!next) return 'max';
  if (it.lv + 1 > maxLv(game, it.kind)) return 'palace';
  if (!affords(game, next.cost)) return 'cost';
  if (next.time > 0 && !freeBuilder(game)) return 'builder';
  return null;
}

// Starts the next level (what a producer holds is collected first, as it stops while upgrading).
export function upgrade(game, id, now) {
  if (whyNotUp(game, id)) return null;
  let g = game;
  const c = collect(g, id, now); if (c) g = c.game;
  const it = g.items.find(i => i.id === id), next = level(it.kind, it.lv + 1);
  g = pay(g, next.cost);
  const items = g.items.map(i => i.id !== id ? i : next.time
    ? { ...i, job: { lv: i.lv + 1, start: now, end: now + next.time } }
    : { ...i, lv: i.lv + 1, at: now });
  return { ...g, items };
}

export function whyNotClear(game, id) {
  const r = game.rocks.find(o => o.id === id);
  if (!r || r.job) return 'busy';
  if ((game.res.coin || 0) < ROCKS[r.kind].cost) return 'cost';
  if (!freeBuilder(game)) return 'builder';
  return null;
}
export function clearRock(game, id, now) {
  if (whyNotClear(game, id)) return null;
  const r = game.rocks.find(o => o.id === id), R = ROCKS[r.kind];
  return { ...pay(game, { coin: R.cost }), rocks: game.rocks.map(o => o.id === id ? { ...o, job: { start: now, end: now + R.time } } : o) };
}

// Gems to finish a job now: one for every hour left (at least one).
export const speedCost = (job, now) => Math.max(1, Math.ceil((job.end - now) / HOUR));
export function speedUp(game, id, now) {
  const o = game.items.find(i => i.id === id) || game.rocks.find(r => r.id === id);
  if (!o?.job) return null;
  const gems = speedCost(o.job, now);
  if (game.res.gem < gems) return null;
  const end = (x) => x.id === id ? { ...x, job: { ...x.job, end: now } } : x;
  return settle({ ...pay(game, { gem: gems }), items: game.items.map(end), rocks: game.rocks.map(end) }, now).game;
}

export function move(game, id, x, y) {
  const it = game.items.find(i => i.id === id);
  if (!it || !fits(game, it.kind, x, y, id)) return null;
  return { ...game, items: game.items.map(i => i.id === id ? { ...i, x, y } : i) };
}

export const itemAt = (game, x, y) => game.items.find(it => x >= it.x && x < it.x + sizeOf(it) && y >= it.y && y < it.y + sizeOf(it)) || null;
export const rockAt = (game, x, y) => game.rocks.find(r => x >= r.x && x < r.x + sizeOf(r) && y >= r.y && y < r.y + sizeOf(r)) || null;
export const left = (o, now) => Math.max(0, (o.job?.end || 0) - now);

/* ---------------- production ---------------- */

// What a producer holds now (it makes nothing while a builder works on it).
export function stored(it, now) {
  const k = KINDS[it.kind];
  if (!k.makes || it.job || it.lv < 1) return 0;
  const L = level(it.kind, it.lv);
  return Math.min(L.cap, Math.floor(Math.max(0, now - it.at) * L.rate / HOUR));
}

// Moves what a producer holds into the store, as much as fits; the rest stays inside.
export function collect(game, id, now) {
  const it = game.items.find(i => i.id === id);
  const n = it ? stored(it, now) : 0;
  if (!n) return null;
  const k = KINDS[it.kind], L = level(it.kind, it.lv);
  const { game: g, got } = give(game, { [k.makes]: n });
  const took = got[k.makes];
  if (!took) return { game, gained: 0, full: true, res: k.makes };
  // keep the part of the next unit already made and whatever didn't fit, unless the store was full
  const at = n >= L.cap && took === n ? now : it.at + took * HOUR / L.rate;
  return { game: { ...g, items: g.items.map(i => i.id === id ? { ...i, at } : i) }, gained: took, res: k.makes };
}

/* ---------------- rewards from the app ---------------- */

const windowStart = (game, today) => [addDays(game.started, -BACK_DAYS), addDays(today, -(KEEP_DAYS - 1))].sort()[1];

// Meals logged that haven't given their coins yet: [key 'day|meal'].
export function unclaimedMeals(game, entries, today) {
  const from = windowStart(game, today), seen = new Set(game.claimed), keys = new Set();
  for (const e of entries || []) {
    if (!e?.day || !e.meal || e.day < from || e.day > today) continue;
    const key = `${e.day}|${e.meal}`;
    if (!seen.has(key)) keys.add(key);
  }
  return [...keys].sort();
}

// Days with enough activity that haven't given their water yet.
export function unclaimedMoves(game, activity, today) {
  const from = windowStart(game, today), seen = new Set(game.moved || []);
  return [...new Set((activity || []).filter(a => a?.day && a.day >= from && a.day <= today && (a.minutes || 0) >= MOVE_MIN && !seen.has(a.day)).map(a => a.day))].sort();
}

// Finished weeks (counted from the start day) with WEEK_DAYS logged days, not yet rewarded.
export function unclaimedWeeks(game, entries, today) {
  const days = new Set((entries || []).map(e => e?.day).filter(Boolean));
  const done = Math.floor(daysBetween(game.started, today) / 7), seen = new Set(game.weeks || []), out = [];
  for (let w = 0; w < done; w++) {
    if (seen.has(w)) continue;
    let n = 0; for (let d = 0; d < 7; d++) if (days.has(addDays(game.started, w * 7 + d))) n++;
    if (n >= WEEK_DAYS) out.push(w);
  }
  return out;
}

// Turns new logs into resources. `data`: { entries, activity }. Returns { game, gained: { coin, water, gem } }.
export function claimAll(game, data, today) {
  const meals = unclaimedMeals(game, data.entries, today);
  const moves = unclaimedMoves(game, data.activity, today);
  const weeks = unclaimedWeeks(game, data.entries, today);
  if (!meals.length && !moves.length && !weeks.length) return { game, gained: { coin: 0, water: 0, gem: 0 } };
  const cut = addDays(today, -KEEP_DAYS);
  const g = {
    ...game,
    claimed: [...game.claimed.filter(k => k.slice(0, 10) >= cut), ...meals],
    moved: [...(game.moved || []).filter(d => d >= cut), ...moves],
    weeks: [...(game.weeks || []), ...weeks],
  };
  const { game: out, got } = give(g, { coin: meals.length * MEAL_COINS, water: moves.length * MOVE_WATER, gem: weeks.length * WEEK_GEMS });
  return { game: out, gained: got };
}

export function fmtLeft(ms) {
  const s = Math.ceil(ms / 1000);
  if (s >= 86400) return `${Math.floor(s / 86400)} روز ${Math.floor(s % 86400 / 3600)} ساعت`;
  if (s >= 3600) return `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
