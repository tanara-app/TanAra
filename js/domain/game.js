/*
  «سرزمین» (beta, `game` in profile.beta): a city-builder in the genre of Clash of Clans, with a
  Middle Eastern / Iranian mythology theme, tied to the diet app. Pure logic, no drawing.
  The rules are GAME.md «قوانین کامل بازی، نسخه‌ی ۲» (approved 2026-11-14); each section number
  below (§n) points there. Mechanics follow the genre; names, art and numbers are the game's own.

  State (profile.game), version 3:
    { v: 3, started: 'YYYY-MM-DD', res: { coin, water, gem }, xp,
      claimed: ['day|meal', …], moved: ['day', …], weeks: [n, …], chest: 'YYYY-MM-DD' (last opened),
      stats: { cleared, logDays, stars, defends, campaign, donated }, ach: { id: tiers claimed },
      spawnAt: ms (last new obstacle),
      items: [{ id, kind, x, y, lv, job, at }], rocks: [{ id, kind, x, y, gem, job }] }
  `lv`: the level built (0 while the first construction runs). `job`: { lv, start, end } while a
  builder works on it (ms). `at`: last time its production was collected (ms). `rocks` are the
  obstacles; clearing one takes a builder and some time, and a new one grows every 8 hours (§12).

  Rewards from the app come only from logging (never from eating less or more, never from the
  scale): meals give coins, active days give water, full days open the daily chest, weeks with
  five logged days give gems (§3). Each resource has a cap (the palace plus the storages).
*/

export const SIZE = 40;            // the land is SIZE × SIZE tiles (§12)
export const EDGE = 2;             // the outer ring is only for placing troops: nothing is built on it
export const MOVE_MIN = 10;        // minutes of activity that make an active day
export const WEEK_GEMS = 5;        // a week (from the start day) with WEEK_DAYS days that have entries
export const WEEK_DAYS = 5;
export const MAIN_MEALS = ['breakfast', 'lunch', 'dinner']; // all three logged today open the chest
export const START = { coin: 500, water: 500, gem: 10 };
export const PALACE_MAX = 8;
export const ROCK_EVERY = 8 * 60 * 60 * 1000, ROCK_MAX = 45, ROCK_START = 40;
const BACK_DAYS = 2;               // logs from the two days before the game started count too
const KEEP_DAYS = 8;               // claims older than this can't be claimed again anyway

const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
// Rewards per logged meal / active day, by palace level (§3): about an hour or two of production.
export const MEAL_COINS = [100, 200, 400, 800, 1500, 3000, 5000, 8000];
export const MOVE_WATER = [100, 200, 400, 800, 1500, 3000, 5000, 8000];

// Two significant digits, so prices read well (1234 → 1200).
const nice = (n) => { if (n < 100) return Math.round(n); const p = 10 ** (Math.floor(Math.log10(n)) - 1); return Math.round(n / p) * p; };
const geo = (base, f, n) => Array.from({ length: n }, (_, i) => nice(base * f ** i));
// Build times by level: minutes at first, hours in the middle, a day at the top (§5).
const T = [MIN, 5 * MIN, 15 * MIN, 30 * MIN, HOUR, 2 * HOUR, 4 * HOUR, 6 * HOUR, 8 * HOUR, 12 * HOUR, 16 * HOUR, DAY];

/*
  Every kind: size (tiles), group (shop tab), count[palace level − 1] (how many may stand), maxLv[palace
  level − 1] (how high they may go), levels[lv − 1] = { cost, time, …what that level gives }.
  `makes`/`keeps`: the resource a producer makes or a storage keeps. Defences carry their battle numbers
  (dps, range, minRange, splash, hits: 'ground' | 'air' | 'both'); the battle itself is the next step (§8).
*/
function kind(def, { pay, costs, times = T, ...per }) {
  const levels = costs.map((c, i) => {
    const L = { cost: typeof c === 'object' ? c : { [pay]: c }, time: times[i] ?? times[times.length - 1] };
    for (const [k, arr] of Object.entries(per)) L[k] = arr[i];
    return L;
  });
  return { ...def, levels };
}
const RATE = [200, 400, 600, 800, 1000, 1300, 1600, 1900, 2200, 2800, 3500, 4200];
const STORE = [1500, 3000, 6000, 12000, 25000, 45000, 100000, 225000, 450000, 850000, 1750000];
const hp = (base, n) => geo(base, 1.22, n);

export const KINDS = {
  // §4: the palace. Its level is the cap on every other count and level; it keeps some of each resource.
  palace: kind({ name: 'کاخ', size: 4, group: null, count: [1, 1, 1, 1, 1, 1, 1, 1], maxLv: [8, 8, 8, 8, 8, 8, 8, 8],
    store: { coin: [1000, 2500, 10000, 50000, 100000, 300000, 500000, 750000], water: [1000, 2500, 10000, 50000, 100000, 300000, 500000, 750000] } },
    { pay: 'coin', costs: [0, 1000, 4000, 25000, 150000, 500000, 1000000, 2000000], times: [0, 10 * MIN, HOUR, 4 * HOUR, 12 * HOUR, DAY, 2 * DAY, 3 * DAY], hp: hp(1500, 8) }),
  // §5: one builder per hut; the first two are free, then 50, 200 and 500 gems.
  builder: kind({ name: 'خانه‌ی معمار', size: 2, group: 'res', count: [2, 3, 3, 4, 4, 5, 5, 5], maxLv: [1, 1, 1, 1, 1, 1, 1, 1], gems: [0, 0, 50, 200, 500] },
    { pay: 'gem', costs: [0], times: [0], hp: [250] }),
  // §6, resources. The coin maker is paid in water and the water maker in coins, as in the genre.
  caravan: kind({ name: 'کاروانسرا', size: 3, group: 'res', makes: 'coin', count: [1, 2, 3, 4, 5, 6, 6, 7], maxLv: [2, 4, 6, 8, 10, 10, 11, 12] },
    { pay: 'water', costs: geo(150, 2, 12), rate: RATE, cap: RATE.map(r => r * 5), hp: hp(400, 12) }),
  qanat: kind({ name: 'قنات', size: 3, group: 'res', makes: 'water', count: [1, 2, 3, 4, 5, 6, 6, 7], maxLv: [2, 4, 6, 8, 10, 10, 11, 12] },
    { pay: 'coin', costs: geo(150, 2, 12), rate: RATE, cap: RATE.map(r => r * 5), hp: hp(400, 12) }),
  treasury: kind({ name: 'خزانه', size: 3, group: 'res', keeps: 'coin', count: [1, 1, 2, 2, 2, 3, 3, 4], maxLv: [1, 3, 6, 8, 9, 10, 11, 11] },
    { pay: 'water', costs: geo(300, 2.2, 11), store: STORE, hp: hp(400, 11) }),
  cistern: kind({ name: 'آب‌انبار', size: 3, group: 'res', keeps: 'water', count: [1, 1, 2, 2, 2, 3, 3, 4], maxLv: [1, 3, 6, 8, 9, 10, 11, 11] },
    { pay: 'coin', costs: geo(300, 2.2, 11), store: STORE, hp: hp(400, 11) }),
  // §6, army. Each barracks level opens one more troop (§7); camps hold the trained troops.
  barracks: kind({ name: 'سربازخانه', size: 3, group: 'army', count: [1, 2, 2, 3, 3, 3, 4, 4], maxLv: [2, 3, 4, 5, 6, 7, 8, 8] },
    { pay: 'water', costs: geo(200, 2.5, 8), opens: ['sword', 'archer', 'mace', 'ayyar', 'sapper', 'simorgh', 'magus', 'healer'], hp: hp(250, 8) }),
  camp: kind({ name: 'اردوگاه', size: 4, group: 'army', count: [1, 1, 2, 2, 3, 3, 4, 4], maxLv: [1, 2, 3, 4, 5, 6, 7, 8] },
    { pay: 'water', costs: geo(250, 2.6, 8), room: [20, 30, 35, 40, 45, 50, 55, 60], hp: hp(250, 8) }),
  lab: kind({ name: 'رصدخانه', size: 4, group: 'army', count: [0, 0, 1, 1, 1, 1, 1, 1], maxLv: [0, 0, 1, 2, 3, 4, 5, 6] },
    { pay: 'water', costs: geo(5000, 2.4, 6), times: T.slice(4), hp: hp(500, 6) }),
  castle: kind({ name: 'دژ خاندان', size: 3, group: 'army', count: [0, 0, 1, 1, 1, 1, 1, 1], maxLv: [0, 0, 1, 2, 3, 4, 5, 5] },
    { pay: 'coin', costs: [10000, 100000, 800000, 1200000, 2000000], times: [0, ...T.slice(7)], room: [10, 15, 20, 25, 30], hp: hp(1000, 5) }),
  hero: kind({ name: 'آرامگاه پهلوان', size: 3, group: 'army', count: [0, 0, 0, 0, 0, 0, 1, 1], maxLv: [0, 0, 0, 0, 0, 0, 1, 1] },
    { pay: 'water', costs: [10000], times: [0], hp: [250] }),
  // §6, defence.
  cannon: kind({ name: 'سنگ‌انداز', size: 3, group: 'def', count: [1, 2, 2, 2, 3, 3, 5, 5], maxLv: [2, 3, 4, 5, 6, 7, 8, 9] },
    { pay: 'coin', costs: geo(250, 2.4, 9), dps: [9, 11, 15, 19, 25, 31, 40, 48, 56], range: Array(9).fill(9), hits: Array(9).fill('ground'), hp: hp(420, 9) }),
  tower: kind({ name: 'برج کمان‌دار', size: 3, group: 'def', count: [0, 1, 1, 2, 3, 3, 4, 5], maxLv: [0, 2, 3, 4, 5, 6, 7, 8] },
    { pay: 'coin', costs: geo(1000, 2.3, 8), dps: [11, 15, 19, 25, 30, 35, 42, 48], range: Array(8).fill(10), hits: Array(8).fill('both'), hp: hp(380, 8) }),
  catapult: kind({ name: 'منجنیق', size: 3, group: 'def', count: [0, 0, 1, 1, 1, 2, 3, 3], maxLv: [0, 0, 1, 2, 3, 4, 5, 6] },
    { pay: 'coin', costs: geo(8000, 2.2, 6), dps: [4, 5, 6, 7, 9, 11], range: Array(6).fill(11), minRange: Array(6).fill(4), splash: Array(6).fill(1.5), hits: Array(6).fill('ground'), hp: hp(400, 6) }),
  airtower: kind({ name: 'برج تیر هوایی', size: 3, group: 'def', count: [0, 0, 0, 1, 1, 2, 2, 3], maxLv: [0, 0, 0, 2, 3, 4, 5, 6] },
    { pay: 'coin', costs: geo(22500, 2, 6), dps: [80, 110, 140, 160, 190, 230], range: Array(6).fill(10), hits: Array(6).fill('air'), hp: hp(800, 6) }),
  fire: kind({ name: 'آتشکده', size: 3, group: 'def', count: [0, 0, 0, 0, 1, 2, 2, 3], maxLv: [0, 0, 0, 0, 2, 3, 4, 5] },
    { pay: 'coin', costs: geo(120000, 1.8, 5), dps: [11, 13, 16, 20, 24], range: Array(5).fill(7), splash: Array(5).fill(1), hits: Array(5).fill('both'), hp: hp(620, 5) }),
  wall: kind({ name: 'بارو', size: 1, group: 'def', count: [0, 25, 50, 75, 100, 125, 175, 225], maxLv: [0, 2, 3, 4, 5, 6, 7, 8] },
    { pay: 'coin', costs: [50, 1000, 5000, 10000, 20000, 30000, 50000, 75000], times: Array(8).fill(0), hp: [300, 500, 700, 900, 1400, 2000, 2500, 3000] }),
  pit: kind({ name: 'چاله‌ی پنهان', size: 1, group: 'def', trap: true, count: [0, 0, 2, 2, 4, 4, 6, 6], maxLv: [0, 0, 2, 2, 3, 3, 4, 4] },
    { pay: 'coin', costs: geo(400, 3, 4), damage: [24, 28, 32, 38], splash: Array(4).fill(3), hits: Array(4).fill('ground') }),
  sling: kind({ name: 'تله‌ی فلاخن', size: 1, group: 'def', trap: true, count: [0, 0, 0, 2, 2, 4, 4, 6], maxLv: [0, 0, 0, 1, 1, 2, 2, 3] },
    { pay: 'coin', costs: geo(2000, 2, 3), throws: [10, 12, 14], hits: Array(3).fill('ground') }),
  // §6, decoration: no part in battle.
  garden: kind({ name: 'باغ ایرانی', size: 2, group: 'decor', count: [1, 2, 3, 4, 5, 6, 7, 8], maxLv: [1, 1, 1, 1, 1, 1, 1, 1] },
    { pay: 'coin', costs: [500], times: [0] }),
  badgir: kind({ name: 'بادگیر', size: 1, group: 'decor', count: [2, 4, 6, 8, 10, 12, 14, 16], maxLv: [1, 1, 1, 1, 1, 1, 1, 1] },
    { pay: 'coin', costs: [200], times: [0] }),
};
export const GROUPS = { res: 'منابع', army: 'ارتش', def: 'دفاع', decor: 'تزئین' };
export const SHOP = Object.keys(KINDS).filter(k => KINDS[k].group);

// Obstacles (§12): clearing costs coins and a builder's short time; gives experience and 0–6 gems.
export const ROCKS = {
  rock: { name: 'سنگ', size: 2, cost: 250, time: 10 * MIN, xp: 10 },
  tree: { name: 'درخت', size: 2, cost: 150, time: 5 * MIN, xp: 8 },
  stump: { name: 'کنده', size: 1, cost: 80, time: 2 * MIN, xp: 6 },
  bush: { name: 'بوته', size: 1, cost: 50, time: MIN, xp: 4 },
  dune: { name: 'تپه‌ی شن', size: 2, cost: 60, time: 6 * MIN, xp: 5 }, // only in old saves
};
const GROW = ['rock', 'tree', 'tree', 'stump', 'bush', 'bush'];
const GEMS = [0, 0, 0, 1, 1, 2, 2, 3, 4, 6];

const uid = () => Math.random().toString(36).slice(2, 10);
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);

// A small seeded random, so the same seed always makes the same land.
function rng(seed) {
  let s = 0; for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const sizeOf = (it) => (KINDS[it.kind] || ROCKS[it.kind]).size;
const overlaps = (a, ax, ay, b) => { const s = sizeOf(a), t = sizeOf(b); return ax < b.x + t && b.x < ax + s && ay < b.y + t && b.y < ay + s; };

// New obstacles on free places, away from the palace (seeded, so a seed always gives the same ones).
function growRocks(game, n, seed) {
  const r = rng(seed), rocks = [...game.rocks];
  const p = game.items.find(i => i.kind === 'palace'), pc = p ? [p.x + 2, p.y + 2] : [SIZE / 2, SIZE / 2];
  for (let tries = 0; n > 0 && tries < 600; tries++) {
    const kind = GROW[Math.floor(r() * GROW.length)], s = ROCKS[kind].size;
    const x = EDGE + Math.floor(r() * (SIZE - 2 * EDGE - s + 1)), y = EDGE + Math.floor(r() * (SIZE - 2 * EDGE - s + 1));
    if (Math.abs(x + s / 2 - pc[0]) < 5 && Math.abs(y + s / 2 - pc[1]) < 5) continue;
    const rock = { id: uid(), kind, x, y, gem: GEMS[Math.floor(r() * GEMS.length)], job: null };
    if ([...game.items, ...rocks].some(o => overlaps(rock, x, y, o))) continue;
    rocks.push(rock); n--;
  }
  return rocks;
}

const STATS = { cleared: 0, logDays: 0, stars: 0, defends: 0, campaign: 0, donated: 0 };

// §12: the palace in the middle with two builder huts, a caravanserai, a qanat and a stone-thrower ready.
export function newGame(today, now = Date.now()) {
  const c = SIZE / 2 - 2;
  const at = (kind, x, y) => ({ id: uid(), kind, x, y, lv: 1, job: null, at: now });
  const game = { v: 3, started: today, res: { ...START }, xp: 0, claimed: [], moved: [], weeks: [], chest: '',
    stats: { ...STATS }, ach: {}, spawnAt: now, items: [
      at('palace', c, c), at('builder', c + 5, c), at('builder', c + 5, c + 2),
      at('caravan', c - 4, c), at('qanat', c - 4, c + 3), at('cannon', c, c + 5),
    ], rocks: [] };
  game.rocks = growRocks(game, ROCK_START, today);
  return game;
}

// A saved game of any version, as version 3. Version 2 had an 18 × 18 land and smaller buildings;
// version 1 only coins and a 12 × 12 land.
export function load(saved, today) {
  if (!saved?.v) return newGame(today);
  if (saved.v === 3) return saved;
  if (saved.v === 1) return load(fromV1(saved, today), today);
  // v2 → v3: the land grows round the old one; buildings keep their levels (within the new tables)
  // and move to a free place if their new size no longer fits; obstacles grow afresh.
  const off = Math.floor((SIZE - 18) / 2), now = Date.now();
  const g = { ...newGame(saved.started || today, now), res: { ...START, ...saved.res }, claimed: saved.claimed || [],
    moved: saved.moved || [], weeks: saved.weeks || [], items: [], rocks: [] };
  const old = (saved.items || []).filter(it => KINDS[it.kind]).sort((a, b) => (a.kind === 'palace' ? -1 : 0) - (b.kind === 'palace' ? -1 : 0));
  for (const it of old) {
    const K = KINDS[it.kind];
    const lv = Math.min(it.lv, K.levels.length);
    const job = it.job && it.job.lv <= K.levels.length ? it.job : null;
    const o = { id: it.id, kind: it.kind, x: it.x + off, y: it.y + off, lv: it.kind === 'palace' ? Math.max(1, lv) : (lv || (job ? 0 : 1)), job, at: it.at || now };
    const spot = fits(g, o.kind, o.x, o.y) ? { x: o.x, y: o.y } : freeSpot(g, o.kind);
    if (spot) g.items.push({ ...o, ...spot });
  }
  // a second builder hut, as every game now starts with two
  while (countOf(g, 'builder') < 2) { const s = freeSpot(g, 'builder'); if (!s) break; g.items.push({ id: uid(), kind: 'builder', ...s, lv: 1, job: null, at: now }); }
  g.rocks = growRocks(g, ROCK_START, g.started);
  return g;
}

function fromV1(saved, today) {
  const off = (18 - 12) / 2;
  const items = (saved.items || []).filter(it => KINDS[it.kind]).map(it => {
    const job = it.done ? { lv: 1, start: it.done - KINDS[it.kind].levels[0].time, end: it.done } : null;
    return { id: it.id, kind: it.kind, x: it.x + off, y: it.y + off, lv: it.kind === 'palace' ? 1 : (job ? 0 : 1), job, at: it.at || 0 };
  });
  return { v: 2, started: saved.started || today, res: { coin: saved.coins || 0 }, claimed: saved.claimed || [], items };
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

// Experience for finishing a job: the square root of its seconds, as in the genre (§5).
const jobXp = (job) => Math.floor(Math.sqrt(Math.max(0, job.end - job.start) / 1000));

// Finishes every job whose time has come (producers start making from the moment they finish), and
// grows a new obstacle for every ROCK_EVERY that passed, up to ROCK_MAX (§12).
export function settle(game, now) {
  const grow = Math.floor((now - (game.spawnAt ?? now)) / ROCK_EVERY);
  if (!grow && !game.items.some(it => it.job && it.job.end <= now) && !game.rocks.some(r => r.job && r.job.end <= now)) return { game, done: [], gems: 0, grown: [] };
  const done = [];
  let xp = 0, cleared = 0, gems = 0;
  const items = game.items.map(it => {
    if (!it.job || it.job.end > now) return it;
    done.push(it.id); xp += jobXp(it.job);
    return { ...it, lv: it.job.lv, job: null, at: it.job.end };
  });
  const rocks = game.rocks.filter(r => {
    if (!r.job || r.job.end > now) return true;
    done.push(r.id); gems += r.gem; xp += ROCKS[r.kind].xp; cleared++; return false;
  });
  let g = { ...game, items, rocks, xp: (game.xp || 0) + xp, stats: { ...STATS, ...game.stats, cleared: (game.stats?.cleared || 0) + cleared } };
  let grown = [];
  if (grow) {
    const room = Math.max(0, ROCK_MAX - rocks.length);
    const more = growRocks(g, Math.min(grow, room), `${game.started}|${game.spawnAt}`);
    grown = more.slice(rocks.length);
    g = { ...g, rocks: more, spawnAt: game.spawnAt + grow * ROCK_EVERY };
  }
  if (gems) g = give(g, { gem: gems }).game;
  return { game: g, done, gems, grown };
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
  if (x < EDGE || y < EDGE || x + s > SIZE - EDGE || y + s > SIZE - EDGE) return false;
  return ![...game.items, ...game.rocks].some(o => o.id !== ignore && overlaps(me, x, y, o));
}

// The first free place for a new building, nearest the middle of the land.
export function freeSpot(game, kind) {
  const s = KINDS[kind].size, mid = (SIZE - s) / 2;
  let best = null;
  for (let y = EDGE; y <= SIZE - EDGE - s; y++) for (let x = EDGE; x <= SIZE - EDGE - s; x++) {
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

// Gems to finish a job now (§5): one for every 10 minutes up to an hour, then one for every 30 minutes.
export function speedCost(job, now) {
  const m = Math.max(0, job.end - now) / MIN;
  return Math.max(1, m <= 60 ? Math.ceil(m / 10) : 6 + Math.ceil((m - 60) / 30));
}
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
  const had = new Set(game.claimed.map(k => k.slice(0, 10)));
  const newDays = new Set(meals.map(k => k.slice(0, 10)).filter(d => !had.has(d))).size;
  const P = palaceLv(game) - 1;
  const g = {
    ...game,
    claimed: [...game.claimed.filter(k => k.slice(0, 10) >= cut), ...meals],
    moved: [...(game.moved || []).filter(d => d >= cut), ...moves],
    weeks: [...(game.weeks || []), ...weeks],
    stats: { ...STATS, ...game.stats, logDays: (game.stats?.logDays || 0) + newDays },
  };
  const { game: out, got } = give(g, { coin: meals.length * MEAL_COINS[P], water: moves.length * MOVE_WATER[P], gem: weeks.length * WEEK_GEMS });
  return { game: out, gained: got };
}

/* ---------------- the daily chest (§3) ---------------- */

// Ready when the three main meals of today are logged and it hasn't been opened today.
export function chestReady(game, entries, today) {
  if (game.chest === today) return false;
  const got = new Set((entries || []).filter(e => e?.day === today).map(e => e.meal));
  return MAIN_MEALS.every(m => got.has(m));
}
// Two hours of every finished producer (at least 200 of each), and one gem one day in five.
export function chestPrize(game, today) {
  const prize = { coin: 0, water: 0, gem: 0 };
  for (const it of game.items) { const K = KINDS[it.kind]; if (K.makes && it.lv > 0) prize[K.makes] += 2 * level(it.kind, it.lv).rate; }
  prize.coin = Math.max(200, prize.coin); prize.water = Math.max(200, prize.water);
  prize.gem = rng(`chest|${today}|${game.started}`)() < 0.2 ? 1 : 0;
  return prize;
}
export function openChest(game, entries, today) {
  if (!chestReady(game, entries, today)) return null;
  const { game: g, got } = give({ ...game, chest: today }, chestPrize(game, today));
  return { game: g, got };
}

/* ---------------- experience (§5) ---------------- */

// Level n needs 50·n more experience than level n − 1 (level 1 at 0).
export function xpLevel(xp = 0) {
  let lv = 1, need = 50, left = xp;
  while (left >= need) { left -= need; lv++; need = 50 * lv; }
  return { lv, into: left, need };
}

/* ---------------- achievements (§10) ---------------- */

export const ACH = [
  { id: 'clear', name: 'سنگ‌شکن', of: g => g.stats?.cleared || 0, tiers: [5, 50, 500], gems: [5, 10, 20] },
  { id: 'palace', name: 'سازنده', of: g => palaceLv(g), tiers: [3, 5, 8], gems: [10, 20, 50] },
  { id: 'stars', name: 'سپهسالار', of: g => g.stats?.stars || 0, tiers: [10, 100, 1000], gems: [5, 20, 50] },
  { id: 'defend', name: 'دژبان', of: g => g.stats?.defends || 0, tiers: [10, 250, 2500], gems: [5, 20, 50] },
  { id: 'divs', name: 'دیوکش', of: g => g.stats?.campaign || 0, tiers: [10, 20, 30], gems: [10, 20, 50] },
  { id: 'gift', name: 'یار خاندان', of: g => g.stats?.donated || 0, tiers: [100, 5000, 25000], gems: [5, 20, 50] },
  { id: 'days', name: 'پیوسته', of: g => g.stats?.logDays || 0, tiers: [7, 30, 100], gems: [10, 20, 50] },
];
// Each achievement: how far along, how many tiers reached and claimed, and whether a reward waits.
export function achievements(game) {
  return ACH.map(a => {
    const n = a.of(game), reached = a.tiers.filter(t => n >= t).length, claimed = game.ach?.[a.id] || 0;
    return { id: a.id, name: a.name, n, next: a.tiers[claimed] ?? null, reached, claimed, ready: reached > claimed, gems: a.gems[claimed] ?? 0 };
  });
}
export function claimAch(game, id) {
  const a = achievements(game).find(x => x.id === id);
  if (!a?.ready) return null;
  return { ...give(game, { gem: a.gems }).game, ach: { ...game.ach, [id]: a.claimed + 1 } };
}

export function fmtLeft(ms) {
  const s = Math.ceil(ms / 1000);
  if (s >= 86400) return `${Math.floor(s / 86400)} روز ${Math.floor(s % 86400 / 3600)} ساعت`;
  if (s >= 3600) return `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
