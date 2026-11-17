/*
  «سرقت بزرگ» (briefs/heist.md, DESIGN-heist.md): the rules of one raid, pure and without DOM.

  A vault is a small JSON: { v: 1, w: 7, h: 9, tiles: [h strings of w chars], defenses: [...] }.
  Tiles: '.' floor, '#' wall, 'D' locked door, 'V' the safe (one, solid: the thief opens it by moving into it),
  'E' the entry (one, on the edge), 'X' an exit (one or two, on the edge).
  Defenses:
    { t: 'guard', path: [[x, y], ...], dir? }       a loop of up to 8 floor cells, one cell a turn (dir: facing, if he stands still)
    { t: 'cam', x, y, dir, ph? }                    on a wall; looks 4 cells along dir, turns 90° clockwise every 2 turns
    { t: 'laser', x, y, axis: 'h'|'v', mode: 'on'|'blink', phase? }   a beam through (x, y) from wall to wall; blink: 2 turns on, 2 off
    { t: 'plate', x, y }                            a pressure plate
    { t: 'mark', x, y }                             a scuff that looks like a plate from far away and does nothing
  Directions: 0 up, 1 right, 2 down, 3 left. A cell's index is y * w + x.

  A turn: the thief acts (a move 'U' 'R' 'D' 'L', a wait 'W', or a gadget: 'E' the pulse where he stands,
  'Sx,y' smoke on a cell, 'Bx,y' the bait on a cell), then every defense takes one step, then the guards, cameras,
  lasers and plates are checked against where everything is now. Nothing is random: a raid is its list of moves.

  A compiled vault is cached on the vault object, so a vault that is edited must be a new object.
*/
export const W = 7, H = 9;
export const MAX_TURNS = 30;
export const ALARM_TURNS = 4;
export const BUDGET = 100;
export const COST = { guard: 25, cam: 15, laser: 10, plate: 8, door: 12, mark: 3 };
export const GADGETS = ['emp', 'smoke', 'lockpick', 'goggles', 'decoy'];
export const EMP_RADIUS = 2, EMP_TURNS = 3, SMOKE_RADIUS = 1, SMOKE_TURNS = 3, SMOKE_RANGE = 2;
export const BAIT_RANGE = 3, BAIT_TURNS = 2, BAIT_HEARING = 6;
export const GUARD_SIGHT = 3, CAM_SIGHT = 4, GUARD_PATH_MAX = 8;
export const LOOT_SHARE = 0.2, LOOT_CAP = 200, SHIELD_HOURS = 12;

const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const DIR = { U: 0, R: 1, D: 2, L: 3 };
const OPEN = 9;
const NONE = Object.freeze([]);
const G = 6; // numbers kept for each guard: cell, facing, index on his path, mode, turns of bait left, the bait's cell
const PATROL = 0, LURED = 1, RETURNING = 2, CHASING = 3;

// ---------- the compiled vault ----------

const cache = new WeakMap();
function compile(v) {
  let c = cache.get(v);
  if (c) return c;
  const w = v.w, h = v.h, tiles = v.tiles.join('');
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? '#' : tiles[y * w + x]);
  c = { w, h, n: w * h, tiles, doors: [], doorAt: new Int8Array(w * h).fill(-1), exits: [], entry: -1, safe: -1,
    guards: [], cams: [], lasers: [], plate: new Uint8Array(w * h), g0: [], period: 1 };
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (t === 'D') { c.doorAt[i] = c.doors.length; c.doors.push(i); }
    else if (t === 'E') c.entry = i;
    else if (t === 'X') c.exits.push(i);
    else if (t === 'V') c.safe = i;
  }
  for (const d of v.defenses || []) {
    if (d.t === 'guard') {
      const path = d.path.map(([x, y]) => y * w + x), n = path.length;
      const f = n > 1 ? facing(w, path[n - 1], path[0]) : (d.dir ?? 2);
      c.guards.push({ path });
      c.g0.push(path[0], f, 0, PATROL, 0, -1);
    } else if (d.t === 'cam') {
      c.cams.push({ at: d.y * w + d.x, x: d.x, y: d.y, dir: d.dir || 0, ph: d.ph || 0 });
      c.period = 8;
    } else if (d.t === 'laser') {
      const k = d.axis === 'v' ? 2 : 1, cells = [d.y * w + d.x];
      for (const s of [k, (k + 2) % 4]) {
        for (let x = d.x + DX[s], y = d.y + DY[s]; at(x, y) === '.'; x += DX[s], y += DY[s]) cells.push(y * w + x);
      }
      c.lasers.push({ cells: cells.sort((a, b) => a - b), blink: d.mode === 'blink', phase: d.phase || 0 });
      if (d.mode === 'blink' && c.period < 4) c.period = 4;
    } else if (d.t === 'plate') c.plate[d.y * w + d.x] = 1;
    else if (d.t === 'mark') c.plate[d.y * w + d.x] = 2;
  }
  cache.set(v, c);
  return c;
}

function facing(w, a, b) {
  const d = b - a;
  return d === -w ? 0 : d === 1 ? 1 : d === w ? 2 : d === -1 ? 3 : 2;
}
const cheb = (w, a, b) => Math.max(Math.abs(a % w - b % w), Math.abs((a / w | 0) - (b / w | 0)));
const manh = (w, a, b) => Math.abs(a % w - b % w) + Math.abs((a / w | 0) - (b / w | 0));
function neighbor(c, i, d) {
  const x = i % c.w + DX[d], y = (i / c.w | 0) + DY[d];
  return x < 0 || y < 0 || x >= c.w || y >= c.h ? -1 : y * c.w + x;
}
const opaque = (c, doors, i) => { const t = c.tiles[i]; return t === '#' || t === 'V' || (t === 'D' && doors[c.doorAt[i]] !== OPEN); };
const walkable = (c, doors, i) => { const t = c.tiles[i]; return t === '.' || t === 'E' || t === 'X' || (t === 'D' && doors[c.doorAt[i]] === OPEN); };
const within = (w, list, i, r) => { for (const e of list) if (cheb(w, e[0], i) <= r) return true; return false; };

// How many steps each cell is from `from`, for someone who walks like a guard (-1: can't get there).
function field(c, doors, from) {
  const dist = new Int8Array(c.n).fill(-1), q = [from];
  dist[from] = 0;
  for (let k = 0; k < q.length; k++) {
    const i = q[k];
    for (let d = 0; d < 4; d++) {
      const j = neighbor(c, i, d);
      if (j >= 0 && dist[j] < 0 && walkable(c, doors, j)) { dist[j] = dist[i] + 1; q.push(j); }
    }
  }
  return dist;
}
// One step down the field from cell i: [cell, facing], or null if there is nowhere closer.
function downhill(c, f, i) {
  let best = -1, dir = 0;
  for (let d = 0; d < 4; d++) {
    const j = neighbor(c, i, d);
    if (j >= 0 && f[j] >= 0 && (f[i] < 0 || f[j] < f[i]) && (best < 0 || f[j] < f[best])) { best = j; dir = d; }
  }
  return best < 0 ? null : [best, dir];
}

const camDir = (cam, t) => (cam.dir + ((t + cam.ph) >> 1)) % 4;
const laserOn = (l, t) => !l.blink || ((t + l.phase) % 4) < 2;
const laserDead = (c, l, emp) => { for (const i of l.cells) if (within(c.w, emp, i, EMP_RADIUS)) return true; return false; };

// The cells a guard at `pos` facing `f` can see: 3 ahead and 1 to each side, stopped by walls, closed doors and smoke.
function guardSees(c, s, pos, f, out) {
  if (within(c.w, s.smoke, pos, SMOKE_RADIUS)) return;
  for (let k = 1, i = pos; k <= GUARD_SIGHT; k++) {
    i = neighbor(c, i, f);
    if (i < 0 || opaque(c, s.doors, i) || within(c.w, s.smoke, i, SMOKE_RADIUS)) break;
    out.push(i);
  }
  for (const d of [(f + 1) % 4, (f + 3) % 4]) {
    const i = neighbor(c, pos, d);
    if (i >= 0 && !opaque(c, s.doors, i) && !within(c.w, s.smoke, i, SMOKE_RADIUS)) out.push(i);
  }
}
function camSees(c, s, cam, out) {
  if (within(c.w, s.emp, cam.at, EMP_RADIUS) || within(c.w, s.smoke, cam.at, SMOKE_RADIUS)) return;
  const d = camDir(cam, s.t);
  for (let k = 1, i = cam.at; k <= CAM_SIGHT; k++) {
    i = neighbor(c, i, d);
    if (i < 0 || opaque(c, s.doors, i) || within(c.w, s.smoke, i, SMOKE_RADIUS)) break;
    out.push(i);
  }
}

// ---------- one turn ----------

export function initial(vault) {
  const c = compile(vault);
  return { t: 0, p: c.entry, loot: 0, alarm: 0, status: 'play', doors: c.doors.map(() => 0), used: 0, emp: NONE, smoke: NONE, g: c.g0 };
}

function slot(gadgets, used, name) {
  for (let i = 0; i < gadgets.length; i++) if (gadgets[i] === name && !(used & (1 << i))) return i;
  return -1;
}
function target(c, mv) {
  const m = /^[SB](\d{1,2}),(\d{1,2})$/.exec(mv);
  return !m || +m[1] >= c.w || +m[2] >= c.h ? -1 : +m[2] * c.w + +m[1];
}
// What a thief may carry: known gadgets, one of each, three at most (a raid's record comes from a phone, so it is checked).
export const MAX_GADGETS = 3;
function loadout(gadgets, max = MAX_GADGETS) {
  return Array.isArray(gadgets) && gadgets.length <= max && gadgets.every((g, i) => GADGETS.includes(g) && gadgets.indexOf(g) === i);
}

// The state after the thief's move `mv`, or null if the move isn't allowed. Events of the turn are pushed to `ev`.
function step(c, s, mv, gadgets, ev) {
  if (s.status !== 'play' || typeof mv !== 'string' || !mv) return null;
  const n = { t: s.t + 1, p: s.p, loot: s.loot, alarm: s.alarm, status: 'play', doors: s.doors, used: s.used, emp: s.emp, smoke: s.smoke, g: s.g };
  const k = mv[0];
  if (k === 'W' && mv.length === 1) ev?.push({ e: 'wait' });
  else if (mv.length === 1 && k in DIR) {
    const q = neighbor(c, s.p, DIR[k]);
    if (q < 0) return null;
    const t = c.tiles[q];
    if (t === '#') return null;
    if (t === 'V') {
      if (s.loot) return null;
      n.loot = 1;
      ev?.push({ e: 'loot', at: q });
    } else if (t === 'D' && s.doors[c.doorAt[q]] !== OPEN) {
      const j = c.doorAt[q], done = s.doors[j] + 1, need = gadgets.includes('lockpick') ? 1 : 2;
      n.doors = s.doors.slice();
      n.doors[j] = done >= need ? OPEN : done;
      ev?.push(done >= need ? { e: 'open', at: q } : { e: 'pick', at: q });
    } else {
      n.p = q;
      ev?.push({ e: 'move', to: q, dir: DIR[k] });
    }
  } else if (k === 'E' && mv.length === 1) {
    const i = slot(gadgets, s.used, 'emp');
    if (i < 0) return null;
    n.used |= 1 << i;
    n.emp = [...s.emp, [s.p, EMP_TURNS]];
    ev?.push({ e: 'emp', at: s.p });
  } else if (k === 'S') {
    const i = slot(gadgets, s.used, 'smoke'), q = target(c, mv);
    if (i < 0 || q < 0 || c.tiles[q] === '#' || manh(c.w, s.p, q) > SMOKE_RANGE) return null;
    n.used |= 1 << i;
    n.smoke = [...s.smoke, [q, SMOKE_TURNS]];
    ev?.push({ e: 'smoke', at: q });
  } else if (k === 'B') {
    const i = slot(gadgets, s.used, 'decoy'), q = target(c, mv);
    if (i < 0 || q < 0 || q === s.p || !walkable(c, s.doors, q) || manh(c.w, s.p, q) > BAIT_RANGE) return null;
    n.used |= 1 << i;
    // The nearest guard on patrol who can walk there in a few steps goes to look.
    const f = field(c, s.doors, q);
    let who = -1;
    for (let j = 0; j < c.guards.length; j++) {
      const d = f[s.g[j * G]];
      if (s.g[j * G + 3] === PATROL && d >= 0 && d <= BAIT_HEARING && (who < 0 || d < f[s.g[who * G]])) who = j;
    }
    if (who >= 0) { n.g = s.g.slice(); n.g[who * G + 3] = LURED; n.g[who * G + 4] = BAIT_TURNS; n.g[who * G + 5] = q; }
    ev?.push({ e: 'bait', at: q, guard: who });
  } else return null;

  if (n.p !== s.p && c.tiles[n.p] === 'X') {
    n.status = !n.loot ? 'fled' : n.alarm ? 'escaped_alarm' : 'escaped';
    ev?.push({ e: n.loot ? 'escape' : 'fled', alarm: n.alarm > 0 });
    return n;
  }
  advance(c, n, s.alarm > 0, ev);
  detect(c, s, n, ev);
  return n;
}

// Every defense takes its step for turn n.t (the guards; cameras and lasers follow the clock).
function advance(c, n, chase, ev) {
  if (c.guards.length) {
    const g = n.g.slice();
    let toThief = null;
    for (let j = 0; j < c.guards.length; j++) {
      const o = j * G, path = c.guards[j].path, from = g[o];
      if (chase) {
        toThief ??= field(c, n.doors, n.p);
        g[o + 3] = CHASING;
        for (let k = 0; k < 2 && toThief[g[o]] !== 1 && toThief[g[o]] !== 0; k++) {
          const m = downhill(c, toThief, g[o]);
          if (!m) break;
          g[o] = m[0]; g[o + 1] = m[1];
        }
      } else if (g[o + 3] === LURED) {
        const m = g[o] === g[o + 5] ? null : downhill(c, field(c, n.doors, g[o + 5]), g[o]);
        if (m) { g[o] = m[0]; g[o + 1] = m[1]; }
        if (--g[o + 4] === 0) { g[o + 3] = RETURNING; g[o + 5] = -1; }
      } else {
        if (g[o + 3] === RETURNING && g[o] === path[g[o + 2]]) g[o + 3] = PATROL;
        if (g[o + 3] === RETURNING) {
          const m = downhill(c, field(c, n.doors, path[g[o + 2]]), g[o]);
          if (m) { g[o] = m[0]; g[o + 1] = m[1]; } else g[o + 3] = PATROL;
        } else if (path.length > 1) {
          const i = (g[o + 2] + 1) % path.length;
          g[o + 1] = facing(c.w, g[o], path[i]);
          g[o] = path[i]; g[o + 2] = i;
        }
      }
      if (ev && (g[o] !== from || g[o + 1] !== n.g[o + 1] || g[o + 3] !== n.g[o + 3])) ev.push({ e: 'guard', i: j, from, to: g[o], dir: g[o + 1], mode: g[o + 3] });
    }
    n.g = g;
  }
  if (ev) {
    c.cams.forEach((cam, i) => { const d = camDir(cam, n.t); if (d !== camDir(cam, n.t - 1)) ev.push({ e: 'cam', i, dir: d }); });
    c.lasers.forEach((l, i) => { const on = laserOn(l, n.t); if (on !== laserOn(l, n.t - 1)) ev.push({ e: 'laser', i, on }); });
  }
}

// Who sees the thief now: a guard catches him, anything else sets off the alarm.
function detect(c, s, n, ev) {
  const seen = [];
  for (let j = 0; j < c.guards.length && n.status === 'play'; j++) {
    const pos = n.g[j * G];
    let how = manh(c.w, pos, n.p) <= 1 ? 'near' : '';
    if (!how) { seen.length = 0; guardSees(c, n, pos, n.g[j * G + 1], seen); if (seen.includes(n.p)) how = 'seen'; }
    if (how) { n.status = 'caught'; ev?.push({ e: 'caught', by: how, i: j }); }
  }
  if (n.status === 'play') {
    if (s.alarm > 0) {
      if (--n.alarm === 0) { n.status = 'caught'; ev?.push({ e: 'caught', by: 'cornered', i: -1 }); }
    } else {
      let by = '', i = -1;
      if (c.plate[n.p] === 1 && n.p !== s.p) by = 'plate';
      for (let j = 0; !by && j < c.lasers.length; j++) {
        const l = c.lasers[j];
        if (laserOn(l, n.t) && l.cells.includes(n.p) && !laserDead(c, l, n.emp)) { by = 'laser'; i = j; }
      }
      for (let j = 0; !by && j < c.cams.length; j++) {
        seen.length = 0; camSees(c, n, c.cams[j], seen);
        if (seen.includes(n.p)) { by = 'cam'; i = j; }
      }
      if (by) { n.alarm = ALARM_TURNS; ev?.push({ e: 'alarm', by, i, at: n.p }); }
    }
  }
  if (n.emp.length) n.emp = fade(n.emp, 'emp', ev);
  if (n.smoke.length) n.smoke = fade(n.smoke, 'smoke', ev);
  if (n.status === 'play' && n.t >= MAX_TURNS) { n.status = 'timeout'; ev?.push({ e: 'timeout' }); }
}
function fade(list, name, ev) {
  const out = [];
  for (const [at, left] of list) { if (left > 1) out.push([at, left - 1]); else ev?.push({ e: name + '_end', at }); }
  return out.length ? out : NONE;
}

// For the screen: one move of a raid in play. Returns { state, events } or null if the move isn't allowed.
export function play(vault, state, move, gadgets = []) {
  if (!loadout(gadgets)) return null;
  const events = [], next = step(compile(vault), state, move, gadgets, events);
  return next && { state: next, events };
}

// What is dangerous in `state`: cells the guards see, cells next to a guard, cells the cameras see, and lit laser cells.
export function threats(vault, state) {
  const c = compile(vault), out = { seen: [], near: [], cam: [], laser: [] };
  for (let j = 0; j < c.guards.length; j++) {
    const pos = state.g[j * G];
    guardSees(c, state, pos, state.g[j * G + 1], out.seen);
    for (let d = 0; d < 4; d++) { const i = neighbor(c, pos, d); if (i >= 0 && c.tiles[i] !== '#') out.near.push(i); }
    out.near.push(pos);
  }
  for (const cam of c.cams) camSees(c, state, cam, out.cam);
  for (const l of c.lasers) if (laserOn(l, state.t) && !laserDead(c, l, state.emp)) out.laser.push(...l.cells);
  return out;
}
// The same, one turn from now (if the thief stays where he is): what the board shows faintly before each move.
export function nextThreats(vault, state) {
  const c = compile(vault);
  const n = { ...state, t: state.t + 1 }; // a pulse or smoke with a turn left still covers the next check
  advance(c, n, state.alarm > 0, null);
  return threats(vault, n);
}

// Which plates and marks the thief can tell apart: all with the goggles, else those within one cell of him.
export function revealed(vault, state, gadgets = []) {
  const c = compile(vault), all = gadgets.includes('goggles'), out = [];
  for (let i = 0; i < c.n; i++) if (c.plate[i] && (all || cheb(c.w, i, state.p) <= 1)) out.push({ at: i, real: c.plate[i] === 1 });
  return out;
}

// ---------- simulate ----------

// Replays a raid. result: 'escaped' | 'escaped_alarm' | 'fled' (left with nothing) | 'caught' | 'timeout' |
// 'invalid' (a move that isn't allowed, at index `at`) | 'unfinished' (the moves ran out).
export function simulate(vault, moves, gadgets = []) {
  const c = compile(vault), events = [];
  let s = initial(vault), alarm = false;
  if (!loadout(gadgets) || !Array.isArray(moves)) return { result: 'invalid', at: -1, turns: 0, alarm, loot: false, events, state: s };
  for (let i = 0; i < moves.length && s.status === 'play'; i++) {
    const ev = [], n = step(c, s, moves[i], gadgets, ev);
    if (!n) return { result: 'invalid', at: i, turns: s.t, alarm, loot: !!s.loot, events, state: s };
    events.push(ev);
    alarm ||= n.alarm > 0;
    s = n;
  }
  return { result: s.status === 'play' ? 'unfinished' : s.status, turns: s.t, alarm, loot: !!s.loot, events, state: s };
}

// ---------- solve ----------

/*
  Everything that changes what can still happen is in the key: where the thief is, the clock of the cameras and
  lasers (turn modulo their period), each guard (cell, facing, place on his path, mode, bait), each door, the gadgets
  used and the turns left of each pulse and smoke, the loot, and the alarm's countdown. Only the number of turns
  played is left out: the search goes turn by turn, so a state is first reached at its earliest turn, and being there
  earlier is never worse (tests/heist.test.js checks that the answer is the same with the turn in the key).
*/
function keyOf(c, s, exact) {
  let k = s.p + (s.loot ? 'L' : 'l') + s.alarm + '|' + (exact ? s.t : s.t % c.period) + '|' + s.used;
  if (s.doors.length) k += '|' + s.doors.join('');
  if (s.emp.length) k += '|e' + s.emp.join(';');
  if (s.smoke.length) k += '|s' + s.smoke.join(';');
  if (c.guards.length) k += '|' + s.g.join(',');
  return k;
}

function movesFor(c, s, gadgets) {
  const out = ['U', 'R', 'D', 'L', 'W'];
  if (!gadgets.length) return out;
  const x0 = s.p % c.w, y0 = s.p / c.w | 0;
  if (slot(gadgets, s.used, 'emp') >= 0) {
    let any = c.cams.some(cam => cheb(c.w, cam.at, s.p) <= EMP_RADIUS);
    for (const l of c.lasers) any ||= l.cells.some(i => cheb(c.w, i, s.p) <= EMP_RADIUS);
    if (any) out.push('E');
  }
  const cells = (r, ok) => {
    const list = [];
    for (let y = Math.max(0, y0 - r); y <= Math.min(c.h - 1, y0 + r); y++) {
      for (let x = Math.max(0, x0 - r); x <= Math.min(c.w - 1, x0 + r); x++) {
        if (Math.abs(x - x0) + Math.abs(y - y0) <= r && ok(y * c.w + x)) list.push(x + ',' + y);
      }
    }
    return list;
  };
  if ((c.guards.length || c.cams.length) && slot(gadgets, s.used, 'smoke') >= 0) for (const t of cells(SMOKE_RANGE, i => c.tiles[i] !== '#')) out.push('S' + t);
  if (c.guards.length && slot(gadgets, s.used, 'decoy') >= 0) for (const t of cells(BAIT_RANGE, i => i !== s.p && walkable(c, s.doors, i))) out.push('B' + t);
  return out;
}

/*
  The shortest raid that gets away with the loot: { moves, turns, alarm, routes } or null.
  opts.alarm: also accept getting away with the alarm on (the search then follows the alarm and the chase).
  Without the goggles a careful thief can't tell a plate from a mark until he is next to it, so the search
  never steps on a mark: what it finds works whatever the marks turn out to be.
  `routes` is how many different raids of that same length there are (capped at 9999).
*/
export function solve(vault, gadgets = [], opts = {}) {
  const c = compile(vault), max = Math.min(opts.maxTurns ?? MAX_TURNS, MAX_TURNS);
  const blind = !gadgets.includes('goggles'), exact = !!opts.exact;
  if (c.entry < 0 || !loadout(gadgets, GADGETS.length)) return null;
  const start = initial(vault), k0 = keyOf(c, start, exact);
  const seen = new Map([[k0, { from: null, mv: '', depth: 0, count: 1 }]]);
  let frontier = [[start, k0]], win = null, routes = 0;
  for (let depth = 0; depth < max && frontier.length && !win; depth++) {
    const next = [];
    for (const [s, key] of frontier) {
      const count = seen.get(key).count;
      for (const mv of movesFor(c, s, gadgets)) {
        const n = step(c, s, mv, gadgets, null);
        if (!n) continue;
        if (blind && n.p !== s.p && c.plate[n.p] === 2) continue;
        if (n.status === 'escaped' || (opts.alarm && n.status === 'escaped_alarm')) {
          win ??= { key, mv, alarm: n.status === 'escaped_alarm' };
          routes = Math.min(9999, routes + count);
          continue;
        }
        if (n.status !== 'play' || (n.alarm && !opts.alarm)) continue;
        const k = keyOf(c, n, exact), old = seen.get(k);
        if (!old) { seen.set(k, { from: key, mv, depth: depth + 1, count }); next.push([n, k]); }
        else if (old.depth === depth + 1) old.count = Math.min(9999, old.count + count);
      }
    }
    frontier = next;
  }
  if (!win) return null;
  const moves = [win.mv];
  for (let e = seen.get(win.key); e.from !== null; e = seen.get(e.from)) moves.push(e.mv);
  moves.reverse();
  return { moves, turns: moves.length, alarm: win.alarm, routes };
}

// ---------- validate ----------

export function cost(vault) {
  let sum = 0;
  for (const d of vault.defenses || []) sum += COST[d.t] || 0;
  for (const row of vault.tiles || []) for (const ch of row) if (ch === 'D') sum += COST.door;
  return sum;
}

/*
  A vault the game accepts: well formed, within budget, and a careful thief with no gadget can get the loot out
  without setting off the alarm (and without stepping on anything that might be a plate).
  Returns { ok, errors, cost, solution }.
*/
export function validate(vault, opts = {}) {
  const errors = [], budget = opts.budget ?? BUDGET;
  const bad = e => { if (!errors.includes(e)) errors.push(e); };
  if (!vault || vault.v !== 1 || vault.w !== W || vault.h !== H || !Array.isArray(vault.tiles) || vault.tiles.length !== H
    || vault.tiles.some(r => typeof r !== 'string' || r.length !== W || /[^.#DVEX]/.test(r)) || !Array.isArray(vault.defenses)) {
    return { ok: false, errors: ['shape'], cost: 0, solution: null };
  }
  const t = vault.tiles.join(''), at = (x, y) => (Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < W && y < H ? t[y * W + x] : '');
  const edge = i => i % W === 0 || i % W === W - 1 || i < W || i >= W * (H - 1);
  const count = ch => t.split(ch).length - 1;
  if (count('V') !== 1) bad('safe');
  if (count('E') !== 1 || !edge(t.indexOf('E'))) bad('entry');
  if (count('X') < 1 || count('X') > 2 || [...t].some((ch, i) => ch === 'X' && !edge(i))) bad('exit');
  const taken = new Set();
  for (const d of vault.defenses) {
    if (d.t === 'guard') {
      const p = d.path, n = Array.isArray(p) ? p.length : 0;
      if (n < 1 || n > GUARD_PATH_MAX || p.some(q => !Array.isArray(q) || at(q[0], q[1]) !== '.')) { bad('guard'); continue; }
      for (let i = 0; n > 1 && i < n; i++) {
        const a = p[i], b = p[(i + 1) % n];
        if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) !== 1) bad('guard');
      }
      if (n === 1 && d.dir != null && ![0, 1, 2, 3].includes(d.dir)) bad('guard');
    } else if (d.t === 'cam') {
      if (at(d.x, d.y) !== '#' || ![0, 1, 2, 3].includes(d.dir) || ![undefined, 0, 1].includes(d.ph)) bad('cam');
    } else if (d.t === 'laser') {
      if (at(d.x, d.y) !== '.' || !['h', 'v'].includes(d.axis) || !['on', 'blink'].includes(d.mode) || ![undefined, 0, 1, 2, 3].includes(d.phase)) { bad('laser'); continue; }
      const k = d.axis === 'v' ? 2 : 1;
      for (const s of [k, (k + 2) % 4]) {
        let x = d.x, y = d.y;
        do { x += DX[s]; y += DY[s]; } while (at(x, y) === '.');
        if (at(x, y) !== '' && at(x, y) !== '#') bad('laser'); // a beam runs from wall to wall (or to the edge)
      }
    } else if (d.t === 'plate' || d.t === 'mark') {
      // Every plate is drawn with a faint cue, so a plate can't hide under something else.
      if (at(d.x, d.y) !== '.' || taken.has(d.y * W + d.x)) bad(d.t);
      taken.add(d.y * W + d.x);
    } else bad('defense');
  }
  const sum = cost(vault);
  if (sum > budget) bad('budget');
  let solution = null;
  if (!errors.length) { solution = solve(vault, []); if (!solution) bad('unsolvable'); }
  return { ok: !errors.length, errors, cost: sum, solution };
}

// ---------- difficulty ----------

// The fewest gadgets that make a vault solvable without the alarm: [] if none is needed, null if two aren't enough.
export function gadgetsNeeded(vault) {
  if (solve(vault, [])) return [];
  for (const a of GADGETS) if (solve(vault, [a])) return [a];
  for (let i = 0; i < GADGETS.length; i++) for (let j = i + 1; j < GADGETS.length; j++) if (solve(vault, [GADGETS[i], GADGETS[j]])) return [GADGETS[i], GADGETS[j]];
  return null;
}

/*
  How hard a vault is, from its shortest clean raid: its length, how much longer the defenses make it than the bare
  walls would (waiting and going round), how few raids of that length there are, how much shorter a raid gets if
  the thief accepts the alarm, and the gadgets it can't be done without.
  Returns { score, length, bare, routes, alarmLength, needs, cost }; score is Infinity if it can't be done at all.
*/
export function difficulty(vault) {
  const needs = gadgetsNeeded(vault), sum = cost(vault);
  if (!needs) return { score: Infinity, length: 0, bare: 0, routes: 0, alarmLength: 0, needs: null, cost: sum };
  const sol = solve(vault, needs);
  const bare = solve({ ...vault, defenses: [] }, needs)?.turns ?? sol.turns;
  const loud = solve(vault, needs, { alarm: true });
  const scarce = Math.max(0, 10 - 3 * Math.log2(sol.routes));
  const score = sol.turns + 3 * (sol.turns - bare) + scarce + sum / 10 - Math.min(5, sol.turns - loud.turns) + 30 * needs.length;
  return { score: Math.round(score * 10) / 10, length: sol.turns, bare, routes: sol.routes, alarmLength: loud.turns, needs, cost: sum };
}

// What the thief takes from an owner who has `coins`.
export function lootOf(result, coins) {
  const full = Math.min(LOOT_CAP, Math.floor(Math.max(0, coins) * LOOT_SHARE));
  return result === 'escaped' ? full : result === 'escaped_alarm' ? Math.floor(full / 2) : 0;
}

// ---------- generate ----------

export const LEVELS = 5;
// The band of difficulty each level's vaults fall in.
export const BANDS = [[0, 26], [26, 34], [34, 43], [43, 54], [54, 200]];
const RECIPES = [
  { guard: 1, laser: 1 },
  { guard: 1, cam: 1, laser: 1, plate: 1 },
  { guard: 2, cam: 1, laser: 1, plate: 2 },
  { guard: 2, cam: 1, laser: 1, plate: 1, door: 1 },
  { guard: 2, cam: 1, laser: 1, plate: 1, door: 1, mark: 1 },
];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// A made-up vault of a level (1 to 5): the same seed and level always give the same vault.
export function generate(seed, level = 1) {
  const lv = Math.max(1, Math.min(LEVELS, level | 0)), [lo, hi] = BANDS[lv - 1];
  let best = null, gap = Infinity;
  for (let k = 0; k < 600; k++) {
    const v = candidate(rng(((seed | 0) * 7919 + lv * 104729 + k * 15485863) | 0), RECIPES[lv - 1]);
    if (!v || !validate(v).ok) continue;
    const d = difficulty(v).score;
    if (d >= lo && d < hi) return v;
    const off = d < lo ? lo - d : d - hi;
    if (off < gap) { gap = off; best = v; }
  }
  return best;
}

function candidate(r, recipe) {
  const int = n => Math.floor(r() * n), pick = list => list[int(list.length)];
  const t = Array(W * H).fill('.');
  const I = (x, y) => y * W + x;
  for (let k = 6 + int(4); k > 0; k--) {
    const hor = r() < 0.5, len = 2 + int(3), x = int(hor ? W - len + 1 : W), y = int(hor ? H : H - len + 1);
    for (let j = 0; j < len; j++) t[hor ? I(x + j, y) : I(x, y + j)] = '#';
  }
  const entry = I(1 + int(5), H - 1);
  t[entry] = 'E';
  const exits = [I(int(W), 0)];
  if (r() < 0.5) exits.push(I(r() < 0.5 ? 0 : W - 1, 1 + int(4)));
  for (const e of exits) t[e] = 'X';
  const near = (i, d) => { const out = i % W + DX[d] < 0 || i % W + DX[d] >= W ? -1 : i + DX[d] + DY[d] * W; return out < 0 || out >= W * H ? -1 : out; };
  const flood = from => {
    const dist = new Int8Array(W * H).fill(-1), q = [from];
    dist[from] = 0;
    for (let k = 0; k < q.length; k++) for (let d = 0; d < 4; d++) {
      const j = near(q[k], d);
      if (j >= 0 && dist[j] < 0 && t[j] !== '#' && t[j] !== 'V') { dist[j] = dist[q[k]] + 1; q.push(j); }
    }
    return dist;
  };
  let dist = flood(entry);
  const safes = [];
  for (let i = 0; i < W * (H - 3); i++) if (t[i] === '.' && dist[i] >= 6) safes.push(i);
  if (!safes.length) return null;
  t[pick(safes)] = 'V';
  dist = flood(entry);
  for (let i = 0; i < t.length; i++) if (t[i] === '.' && dist[i] < 0) t[i] = '#';
  if (exits.some(e => dist[e] < 0)) return null;

  const far = i => manh(W, i, entry) > 2;
  const floor = [];
  for (let i = 0; i < t.length; i++) if (t[i] === '.' && far(i)) floor.push(i);
  if (floor.length < 12) return null;
  const xy = i => [i % W, i / W | 0];
  const defenses = [], busy = new Set();

  // The way a thief would go if nothing stood in it: plates and doors are worth more on it.
  const bare = solve({ v: 1, w: W, h: H, tiles: rows(t), defenses: [] }, []);
  if (!bare) return null;
  const way = [];
  for (let p = entry, k = 0; k < bare.moves.length; k++) {
    const q = near(p, DIR[bare.moves[k]]);
    if (q >= 0 && t[q] === '.') { p = q; if (far(p)) way.push(p); } else if (q >= 0 && t[q] !== 'V') p = q;
  }

  for (let k = recipe.door || 0; k > 0; k--) {
    const blocked = (i, d) => { const j = near(i, d); return j < 0 || t[j] === '#'; };
    const fits = i => (blocked(i, 1) && blocked(i, 3) && !blocked(i, 0) && !blocked(i, 2)) || (blocked(i, 0) && blocked(i, 2) && !blocked(i, 1) && !blocked(i, 3));
    const spots = (way.some(fits) && r() < 0.8 ? way : floor).filter(i => t[i] === '.' && fits(i));
    if (!spots.length) return null;
    t[pick(spots)] = 'D';
  }
  const free = i => t[i] === '.' && far(i);

  for (let k = recipe.guard || 0; k > 0; k--) {
    const loops = [];
    for (const a of floor) {
      if (!free(a) || busy.has(a)) continue;
      for (const d of [1, 2]) {
        const line = [a];
        for (let j = near(a, d); j >= 0 && free(j) && !busy.has(j) && line.length < 4; j = near(j, d)) {
          line.push(j);
          loops.push([...line, ...line.slice(1, -1).reverse()]);
        }
      }
      const b = near(a, 1), cc = near(a, 2), dd = b >= 0 ? near(b, 2) : -1;
      if ([b, cc, dd].every(j => j >= 0 && free(j) && !busy.has(j))) loops.push(r() < 0.5 ? [a, b, dd, cc] : [a, cc, dd, b]);
    }
    if (!loops.length) return null;
    const path = pick(loops), turn = int(path.length);
    for (const i of path) busy.add(i);
    defenses.push({ t: 'guard', path: [...path.slice(turn), ...path.slice(0, turn)].map(xy) });
  }
  for (let k = recipe.cam || 0; k > 0; k--) {
    const spots = [];
    for (let i = 0; i < t.length; i++) if (t[i] === '#') for (let d = 0; d < 4; d++) { const j = near(i, d); if (j >= 0 && free(j)) spots.push([i, d]); }
    if (!spots.length) return null;
    const [i, d] = pick(spots);
    defenses.push({ t: 'cam', x: i % W, y: i / W | 0, dir: (d + int(4)) % 4, ph: int(2) });
  }
  for (let k = recipe.laser || 0; k > 0; k--) {
    const spots = [];
    for (const i of floor) for (const axis of ['h', 'v']) {
      if (!free(i)) continue;
      const dirs = axis === 'h' ? [1, 3] : [0, 2];
      let len = 1, ok = true;
      for (const d of dirs) {
        let j = near(i, d);
        while (j >= 0 && t[j] === '.') { len++; if (!far(j)) ok = false; j = near(j, d); }
        if (j >= 0 && t[j] !== '#') ok = false;
      }
      if (ok && len <= 3) spots.push([i, axis]);
    }
    if (!spots.length) return null;
    const [i, axis] = pick(spots);
    defenses.push({ t: 'laser', x: i % W, y: i / W | 0, axis, mode: r() < 0.8 ? 'blink' : 'on', phase: int(4) });
  }
  const used = new Set();
  for (const kind of ['plate', 'mark']) for (let k = recipe[kind] || 0; k > 0; k--) {
    const spots = (way.length && r() < 0.6 ? way : floor).filter(i => free(i) && !used.has(i));
    if (!spots.length) return null;
    const i = pick(spots);
    used.add(i);
    defenses.push({ t: kind, x: i % W, y: i / W | 0 });
  }
  return { v: 1, w: W, h: H, tiles: rows(t), defenses };
}
function rows(t) {
  const out = [];
  for (let y = 0; y < H; y++) out.push(t.slice(y * W, y * W + W).join(''));
  return out;
}
