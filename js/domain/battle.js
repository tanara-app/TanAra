/*
  «سرزمین»: the battle (GAME.md §8). One engine for attacking a div fort and, later, for the divs'
  raids on a player's land (§9). Pure and deterministic: the same layout, army and deployments always
  give the same battle, so a replay is just the list of deployments run again.

  A battle is a mutable object (it lives only while the battle screen is open):
    makeBattle(layout, army) → b;  deploy(b, troop, x, y);  step(b, dt) many times;  result(b).
  layout: { items: [{ id, kind, lv, x, y }], loot: { coin, water }, keepShare (the keep's part of the loot, 0.2) }.
  Positions are in tiles (floats); a building covers [x, x + size) × [y, y + size).

  Rules, after the genre: troops are placed only outside the red zone (a tile round every building);
  each walks to the nearest building of its kind of target (§7) and hits it; ground troops that walk
  into a wall break it first; defences hit the nearest troop in range that they can hit; traps fire once.
  Stars: ★ half the buildings destroyed, ★ the keep (palace) destroyed, ★ all destroyed (walls, traps
  and decoration don't count). Loot sits in the keep and the resource buildings and is won as each falls.
*/
import { KINDS, SIZE, level } from './game.js';
import { TROOPS } from './army.js';

export const BATTLE_TIME = 180;    // seconds
export const STEP = 0.1;           // seconds per step(); the screen runs several per frame when sped up
const ZONE = 1;                    // the red zone: tiles round every building where troops can't go down

const counts = (K) => K.group !== 'decor' && !K.trap && K !== KINDS.wall;

function lootShares(items, loot, keepShare = 0.2) {
  const share = new Map(items.map(i => [i.id, { coin: 0, water: 0 }]));
  for (const res of ['coin', 'water']) {
    const total = loot?.[res] || 0;
    if (!total) continue;
    const keep = items.find(i => i.kind === 'palace');
    const holders = items.filter(i => KINDS[i.kind].makes === res || KINDS[i.kind].keeps === res);
    const toKeep = holders.length ? (keep ? Math.round(total * keepShare) : 0) : (keep ? total : 0);
    if (keep) share.get(keep.id)[res] += toKeep;
    const each = holders.length ? Math.floor((total - toKeep) / holders.length) : 0;
    holders.forEach((h, n) => { share.get(h.id)[res] += each + (n === 0 ? total - toKeep - each * holders.length : 0); });
  }
  return share;
}

export function makeBattle(layout, army) {
  const items = layout.items.filter(i => KINDS[i.kind] && i.lv > 0 && (KINDS[i.kind].levels[0].hp || KINDS[i.kind].trap));
  const loot = lootShares(items, layout.loot, layout.keepShare ?? 0.2);
  const blds = items.map(i => {
    const K = KINDS[i.kind], L = level(i.kind, Math.min(i.lv, K.levels.length));
    return { id: i.id, kind: i.kind, x: i.x, y: i.y, s: K.size, hp: L.hp || 1, max: L.hp || 1, dead: false,
      wall: i.kind === 'wall', trap: !!K.trap, counts: counts(K), keep: i.kind === 'palace',
      res: !!(K.makes || K.keeps || i.kind === 'palace'), def: L.dps ? L : null, trapL: K.trap ? L : null,
      loot: loot.get(i.id), lock: null };
  });
  const walls = new Map(blds.filter(b => b.wall).map(b => [`${b.x},${b.y}`, b]));
  return { t: 0, clock: 0, blds, walls, troops: [], left: { ...army }, used: {}, got: { coin: 0, water: 0 }, shots: [], booms: [], next: 1, deployed: false };
}

const cx = (b) => b.x + b.s / 2, cy = (b) => b.y + b.s / 2;
// Distance from a point to a building's footprint (0 inside it).
function dist(b, x, y) {
  const dx = Math.max(b.x - x, 0, x - (b.x + b.s)), dy = Math.max(b.y - y, 0, y - (b.y + b.s));
  return Math.hypot(dx, dy);
}

export function canDeploy(b, x, y) {
  if (x < 0 || y < 0 || x > SIZE || y > SIZE) return false;
  return !b.blds.some(o => !o.trap && x > o.x - ZONE && x < o.x + o.s + ZONE && y > o.y - ZONE && y < o.y + o.s + ZONE);
}

export function deploy(b, t, x, y) {
  if (!(b.left[t] > 0) || !canDeploy(b, x, y) || over(b)) return false;
  const T = TROOPS[t];
  b.troops.push({ id: b.next++, t, x, y, hp: T.hp, max: T.hp, air: !!T.air, target: null, dead: false, hit: null });
  b.left[t]--; b.used[t] = (b.used[t] || 0) + 1; b.deployed = true;
  return true;
}

function pick(b, tr) {
  const T = TROOPS[tr.t], alive = b.blds.filter(o => !o.dead && !o.trap);
  const any = alive.filter(o => !o.wall);
  const want = T.aim === 'def' ? any.filter(o => o.def) : T.aim === 'res' ? any.filter(o => o.res) : T.aim === 'wall' ? alive.filter(o => o.wall) : any;
  const list = want.length ? want : any;
  let best = null, bd = Infinity;
  for (const o of list) { const d = dist(o, tr.x, tr.y); if (d < bd) { bd = d; best = o; } }
  return best;
}

function hurt(b, o, dmg) {
  if (o.dead) return;
  o.hp -= dmg;
  if (o.hp <= 0) {
    o.hp = 0; o.dead = true;
    if (o.loot) { b.got.coin += o.loot.coin; b.got.water += o.loot.water; }
    if (o.wall) b.walls.delete(`${o.x},${o.y}`);
  }
}

function troopStep(b, tr, dt) {
  const T = TROOPS[tr.t];
  tr.hit = null;
  if (T.aim === 'heal') { // follows the nearest ground troop and heals everyone round it
    const g = b.troops.filter(o => !o.dead && !o.air);
    if (!g.length) return;
    const near = g.reduce((a, o) => Math.hypot(o.x - tr.x, o.y - tr.y) < Math.hypot(a.x - tr.x, a.y - tr.y) ? o : a);
    const d = Math.hypot(near.x - tr.x, near.y - tr.y);
    if (d > T.range * 0.6) { tr.x += (near.x - tr.x) / d * T.speed * dt; tr.y += (near.y - tr.y) / d * T.speed * dt; }
    for (const o of g) if (Math.hypot(o.x - near.x, o.y - near.y) <= 2) o.hp = Math.min(o.max, o.hp + T.heal * dt);
    return;
  }
  if (!tr.target || tr.target.dead) tr.target = pick(b, tr);
  const o = tr.target;
  if (!o) return;
  if (dist(o, tr.x, tr.y) <= T.range) { attack(b, tr, o, dt); return; }
  // walk straight to the nearest point of the target
  const px = Math.max(o.x, Math.min(tr.x, o.x + o.s)), py = Math.max(o.y, Math.min(tr.y, o.y + o.s));
  const d = Math.hypot(px - tr.x, py - tr.y) || 1, step = Math.min(d, T.speed * dt);
  const nx = tr.x + (px - tr.x) / d * step, ny = tr.y + (py - tr.y) / d * step;
  const w = !tr.air && b.walls.get(`${Math.floor(nx)},${Math.floor(ny)}`);
  if (w && w !== o) { attack(b, tr, w, dt); return; } // a wall in the way: break it first
  tr.x = nx; tr.y = ny;
}

function attack(b, tr, o, dt) {
  const T = TROOPS[tr.t];
  tr.hit = o.id;
  if (T.blast) { // the sapper blows up once: walls take many times the damage
    for (const w of b.blds) if (!w.dead && !w.trap && dist(w, tr.x, tr.y) <= T.splash) hurt(b, w, T.dps * (w.wall ? T.wallX : 1));
    b.booms.push({ x: tr.x, y: tr.y, r: T.splash });
    tr.dead = true; tr.hp = 0;
    return;
  }
  hurt(b, o, T.dps * dt * (T.resX && o.res ? T.resX : 1));
}

function defenceStep(b, o, dt) {
  const L = o.def, hits = L.hits;
  const ok = (tr) => !tr.dead && (hits === 'both' || (hits === 'air') === tr.air);
  const inRange = (tr) => { const d = Math.hypot(tr.x - cx(o), tr.y - cy(o)) - o.s / 2; return d <= L.range && d >= (L.minRange || 0); };
  if (!o.lock || !ok(o.lock) || !inRange(o.lock)) {
    o.lock = null; let bd = Infinity;
    for (const tr of b.troops) { if (!ok(tr) || !inRange(tr)) continue; const d = Math.hypot(tr.x - cx(o), tr.y - cy(o)); if (d < bd) { bd = d; o.lock = tr; } }
  }
  const tr = o.lock;
  if (!tr) return;
  b.shots.push({ from: o.id, x: tr.x, y: tr.y, air: tr.air });
  const dmg = L.dps * dt;
  if (L.splash) { for (const t2 of b.troops) if (ok(t2) && Math.hypot(t2.x - tr.x, t2.y - tr.y) <= L.splash) damageTroop(t2, dmg); }
  else damageTroop(tr, dmg);
}
function damageTroop(tr, dmg) { tr.hp -= dmg; if (tr.hp <= 0) { tr.hp = 0; tr.dead = true; } }

function trapStep(b, o) {
  const L = o.trapL, mx = cx(o), my = cy(o);
  const ground = b.troops.filter(t => !t.dead && !t.air);
  if (!ground.some(t => Math.hypot(t.x - mx, t.y - my) <= 1)) return;
  o.dead = true; // fired (it isn't counted, and the loot is none)
  if (L.damage) { for (const t of ground) if (Math.hypot(t.x - mx, t.y - my) <= L.splash) damageTroop(t, L.damage); b.booms.push({ x: mx, y: my, r: L.splash }); }
  if (L.throws) { let room = L.throws; for (const t of ground) if (room >= TROOPS[t.t].room && Math.hypot(t.x - mx, t.y - my) <= 1.5) { room -= TROOPS[t.t].room; t.dead = true; t.hp = 0; t.thrown = true; } }
}

// Advances the battle by dt seconds (in steps of STEP).
export function step(b, dt = STEP) {
  b.shots = []; b.booms = [];
  for (let left = dt; left > 1e-9 && !over(b); left -= STEP) {
    const d = Math.min(STEP, left);
    if (b.deployed) b.t += d;
    for (const tr of b.troops) if (!tr.dead) troopStep(b, tr, d);
    for (const o of b.blds) if (!o.dead && o.def) defenceStep(b, o, d);
    for (const o of b.blds) if (!o.dead && o.trap) trapStep(b, o);
  }
  return b;
}

export function result(b) {
  const counted = b.blds.filter(o => o.counts);
  const down = counted.filter(o => o.dead).length;
  const pct = counted.length ? Math.floor(100 * down / counted.length) : 100;
  const keep = b.blds.find(o => o.keep);
  const stars = (pct >= 50 ? 1 : 0) + (keep?.dead ? 1 : 0) + (pct === 100 ? 1 : 0);
  return { pct, stars, loot: { ...b.got }, used: { ...b.used }, time: b.t };
}

// Over when time runs out, everything is down, or no troop is left on the field or to place.
export function over(b) {
  if (b.t >= BATTLE_TIME) return true;
  if (b.blds.filter(o => o.counts).every(o => o.dead)) return true;
  const waiting = Object.values(b.left).some(n => n > 0);
  return b.deployed && !waiting && b.troops.every(t => t.dead);
}

/* ---------------- the div forts (§9, the campaign) ---------------- */

const ring = (x0, y0, x1, y1) => {
  const w = [];
  for (let x = x0; x <= x1; x++) w.push([x, y0], [x, y1]);
  for (let y = y0 + 1; y < y1; y++) w.push([x0, y], [x1, y]);
  return w.map(([x, y], i) => ({ id: `w${i}`, kind: 'wall', lv: 1, x, y }));
};
const at = (id, kind, lv, x, y) => ({ id, kind, lv, x, y });

// The first five of the thirty forts on the road to the White Div; the rest come later.
export const FORTS = [
  { id: 'f1', name: 'پاسگاه دیوان', loot: { coin: 500, water: 500 }, items: [
    at('k', 'palace', 1, 18, 18), at('c1', 'caravan', 1, 13, 18), at('q1', 'qanat', 1, 23, 18), at('d1', 'cannon', 1, 18, 23)] },
  { id: 'f2', name: 'برج ارژنگ', loot: { coin: 1000, water: 1000 }, items: [
    at('k', 'palace', 1, 18, 18), at('d1', 'cannon', 1, 14, 14), at('d2', 'cannon', 1, 23, 23), at('s1', 'treasury', 1, 23, 14), at('s2', 'cistern', 1, 14, 23),
    at('c1', 'caravan', 1, 18, 13), at('q1', 'qanat', 1, 18, 23)] },
  { id: 'f3', name: 'دژ اولاد', loot: { coin: 2000, water: 2000 }, items: [
    at('k', 'palace', 2, 18, 18), ...ring(16, 16, 23, 23), at('d1', 'cannon', 2, 12, 18), at('t1', 'tower', 1, 25, 18),
    at('s1', 'treasury', 1, 18, 12), at('s2', 'cistern', 1, 18, 25), at('c1', 'caravan', 2, 12, 13), at('q1', 'qanat', 2, 25, 24)] },
  { id: 'f4', name: 'قلعه‌ی سنجه', loot: { coin: 3500, water: 3500 }, items: [
    at('k', 'palace', 2, 18, 18), at('d1', 'cannon', 2, 17, 13), at('d2', 'cannon', 2, 17, 24), ...ring(12, 11, 27, 28),
    at('t1', 'tower', 2, 22, 18), at('t2', 'tower', 2, 13, 18), at('p1', 'pit', 1, 20, 23), at('p2', 'pit', 1, 16, 15),
    at('s1', 'treasury', 2, 23, 13), at('s2', 'cistern', 2, 23, 24), at('c1', 'caravan', 2, 7, 16), at('q1', 'qanat', 2, 30, 18)] },
  { id: 'f5', name: 'دژ دیو سپید (پیشانی)', loot: { coin: 5000, water: 5000 }, items: [
    at('k', 'palace', 3, 18, 18), ...ring(15, 15, 24, 24), at('m1', 'catapult', 1, 18, 11), at('d1', 'cannon', 3, 12, 15), at('d2', 'cannon', 3, 26, 21),
    at('t1', 'tower', 2, 12, 21), at('t2', 'tower', 2, 26, 15), at('p1', 'pit', 1, 19, 25), at('p2', 'pit', 1, 14, 19), at('g1', 'sling', 1, 25, 19),
    at('s1', 'treasury', 2, 22, 11), at('s2', 'cistern', 2, 14, 11), at('c1', 'caravan', 3, 18, 27), at('q1', 'qanat', 3, 22, 27)] },
];
export const fort = (id) => FORTS.find(f => f.id === id);

// What is left to win in a fort (the genre: a fort's loot is taken once; stars can be raised later).
export function fortLayout(game, id) {
  const f = fort(id), took = game.forts?.[id]?.took || { coin: 0, water: 0 };
  return { items: f.items, loot: { coin: Math.max(0, f.loot.coin - took.coin), water: Math.max(0, f.loot.water - took.water) } };
}
// A fort is open when the one before it has a star.
export const fortOpen = (game, id) => { const i = FORTS.findIndex(f => f.id === id); return i === 0 || (game.forts?.[FORTS[i - 1].id]?.stars || 0) > 0; };

// Applies a finished fort battle to the game: troops spent, loot (within the caps), best stars, counts.
export function endFort(game, id, res, give) {
  const prev = game.forts?.[id] || { stars: 0, took: { coin: 0, water: 0 } };
  const army = { ...(game.army || {}) };
  for (const [t, n] of Object.entries(res.used)) army[t] = Math.max(0, (army[t] || 0) - n);
  const { game: g, got } = give({ ...game, army }, { coin: res.loot.coin, water: res.loot.water });
  const best = Math.max(prev.stars, res.stars);
  const forts = { ...game.forts, [id]: { stars: best, took: { coin: prev.took.coin + res.loot.coin, water: prev.took.water + res.loot.water } } };
  const campaign = Object.values(forts).filter(f => f.stars > 0).length;
  return { game: { ...g, forts, stats: { ...g.stats, stars: (g.stats?.stars || 0) + Math.max(0, best - prev.stars), campaign } }, got };
}
