/*
  «سرقت بزرگ», phase 3 (briefs/heist-3.md): the vault editor's rules, pure and without DOM.

  `edit(vault, tool, cell, sel)` is one tap of a tool on a cell: it returns { vault, sel, changed }, where `vault` is a new object (the
  scene and the solver cache by object, so an edited vault is never the same object) and `sel` is the guard being drawn (an index into
  `defenses`, or -1). Nothing here decides whether the vault is acceptable: `check` asks `validate` in domain/heist.js, the same rules the
  game and (later) the server use.

  A guard is drawn as a line of neighbouring cells. The loop he walks is the line and back the same way, or the line itself when its last
  cell touches its first and it has at least four cells (a ring).
*/
import { W, H, BUDGET, BANDS, validate, difficulty } from './heist.js';

export const TOOLS = ['wall', 'door', 'safe', 'entry', 'exit', 'erase', 'guard', 'cam', 'laser', 'plate', 'mark'];
const LASER_CYCLE = [['h', 'blink'], ['h', 'on'], ['v', 'blink'], ['v', 'on']];
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];

const xy = i => [i % W, i / W | 0];
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const near = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
const onEdge = (x, y) => x === 0 || y === 0 || x === W - 1 || y === H - 1;

export function copy(v) {
  return { v: 1, w: W, h: H, tiles: [...v.tiles], defenses: v.defenses.map(d => (d.path ? { ...d, path: d.path.map(p => [...p]) } : { ...d })) };
}

// The loop a guard walks for the line the owner drew, and back.
export function loopOf(line) {
  if (line.length >= 4 && near(line[line.length - 1], line[0])) return line.map(p => [...p]);
  return [...line, ...line.slice(1, -1).reverse()].map(p => [...p]);
}
export function lineOf(path) {
  const n = path.length;
  if (n > 2 && n % 2 === 0) {
    let back = true;
    for (let i = 1; i < n / 2; i++) if (!same(path[i], path[n - i])) back = false;
    if (back) return path.slice(0, n / 2 + 1).map(p => [...p]);
  }
  return path.map(p => [...p]);
}

const tile = (v, x, y) => (x < 0 || y < 0 || x >= W || y >= H ? '#' : v.tiles[y][x]);
function setTile(v, x, y, ch) { v.tiles[y] = v.tiles[y].slice(0, x) + ch + v.tiles[y].slice(x + 1); }
const count = (v, ch) => v.tiles.join('').split(ch).length - 1;
function find(v, ch) { const i = v.tiles.join('').indexOf(ch); return i < 0 ? null : xy(i); }
const at = (d, x, y) => d.x === x && d.y === y;
const walks = (d, x, y) => d.t === 'guard' && d.path.some(p => p[0] === x && p[1] === y);
// Whatever stands on a floor cell goes when the cell becomes something else: plates, marks, a laser's anchor, any guard who walks there.
function clearFloor(v, x, y) { v.defenses = v.defenses.filter(d => !(d.t !== 'cam' && d.t !== 'guard' && at(d, x, y)) && !walks(d, x, y)); }

export function edit(vault, tool, cell, sel = -1) {
  const v = copy(vault), [x, y] = xy(cell), t = tile(v, x, y);
  const out = (changed, s = sel) => ({ vault: changed ? v : vault, sel: s, changed });
  const free = t === '.';
  const keepSel = () => (sel >= 0 && v.defenses[sel]?.t === 'guard' ? sel : -1);

  if (tool === 'wall') {
    if (t === '#') { setTile(v, x, y, '.'); v.defenses = v.defenses.filter(d => !(d.t === 'cam' && at(d, x, y))); return out(true, keepSel()); }
    if (t !== '.' && t !== 'D') return out(false);
    clearFloor(v, x, y); setTile(v, x, y, '#'); return out(true, -1);
  }
  if (tool === 'door') {
    if (t === 'D') { setTile(v, x, y, '.'); return out(true); }
    if (!free) return out(false);
    clearFloor(v, x, y); setTile(v, x, y, 'D'); return out(true, -1);
  }
  if (tool === 'safe' || tool === 'entry') {
    const ch = tool === 'safe' ? 'V' : 'E';
    if (!free || (tool === 'entry' && !onEdge(x, y))) return out(false);
    const old = find(v, ch);
    if (old) setTile(v, old[0], old[1], '.');
    clearFloor(v, x, y); setTile(v, x, y, ch); return out(true, -1);
  }
  if (tool === 'exit') {
    if (t === 'X') { if (count(v, 'X') < 2) return out(false); setTile(v, x, y, '.'); return out(true); }
    if (!free || !onEdge(x, y) || count(v, 'X') >= 2) return out(false);
    clearFloor(v, x, y); setTile(v, x, y, 'X'); return out(true, -1);
  }
  if (tool === 'erase') {
    const i = v.defenses.findIndex(d => (d.t === 'guard' ? walks(d, x, y) : at(d, x, y)));
    if (i >= 0) { v.defenses.splice(i, 1); return out(true, -1); }
    if (t === '#' || t === 'D' || (t === 'X' && count(v, 'X') > 1)) { setTile(v, x, y, '.'); return out(true); }
    return out(false);
  }
  if (tool === 'guard') {
    const g = sel >= 0 && v.defenses[sel]?.t === 'guard' ? v.defenses[sel] : null;
    if (g) {
      const line = lineOf(g.path), last = line[line.length - 1];
      if (line.length === 1 && same(last, [x, y])) { g.dir = ((g.dir ?? 2) + 1) % 4; return out(true); }
      if (line.length > 1 && same(line[line.length - 2], [x, y])) { line.pop(); g.path = loopOf(line); return out(true); }
      if (free && near(last, [x, y]) && !line.some(p => same(p, [x, y]))) { line.push([x, y]); g.path = loopOf(line); delete g.dir; return out(true); }
    }
    const other = v.defenses.findIndex(d => walks(d, x, y));
    if (other >= 0) return { vault, sel: other, changed: false };   // pick another guard to draw
    if (!free) return out(false);
    v.defenses.push({ t: 'guard', path: [[x, y]], dir: 2 });
    return out(true, v.defenses.length - 1);
  }
  if (tool === 'cam') {
    if (t !== '#') return out(false);
    const c = v.defenses.find(d => d.t === 'cam' && at(d, x, y));
    if (c) { c.dir = (c.dir + 1) % 4; return out(true); }
    const open = [0, 1, 2, 3].filter(d => !'#'.includes(tile(v, x + DX[d], y + DY[d])));
    if (!open.length) return out(false);
    v.defenses.push({ t: 'cam', x, y, dir: open[0], ph: 0 });
    return out(true, -1);
  }
  if (tool === 'laser') {
    if (!free) return out(false);
    const l = v.defenses.find(d => d.t === 'laser' && at(d, x, y));
    if (l) {
      const k = LASER_CYCLE.findIndex(([a, m]) => a === l.axis && m === l.mode);
      [l.axis, l.mode] = LASER_CYCLE[(k + 1) % LASER_CYCLE.length];
      return out(true);
    }
    // the axis that ends on walls on both sides, if one does
    const ends = axis => [axis === 'h' ? 1 : 0, axis === 'h' ? 3 : 2].every(d => {
      let a = x, b = y;
      do { a += DX[d]; b += DY[d]; } while (tile(v, a, b) === '.');
      return a < 0 || b < 0 || a >= W || b >= H || tile(v, a, b) === '#';
    });
    v.defenses.push({ t: 'laser', x, y, axis: ends('h') || !ends('v') ? 'h' : 'v', mode: 'blink', phase: 0 });
    return out(true, -1);
  }
  if (tool === 'plate' || tool === 'mark') {
    if (!free) return out(false);
    const i = v.defenses.findIndex(d => (d.t === 'plate' || d.t === 'mark') && at(d, x, y));
    if (i >= 0) { const was = v.defenses[i].t; v.defenses.splice(i, 1); if (was === tool) return out(true); }
    v.defenses.push({ t: tool, x, y });
    return out(true, -1);
  }
  return out(false);
}

// The cells a tool can do something on (for the cyan marks on the floor).
export function targets(vault, tool, sel = -1) {
  const out = [];
  for (let i = 0; i < W * H; i++) if (edit(vault, tool, i, sel).changed) out.push(i);
  return out;
}

// Is the vault acceptable, what does it cost, and how hard is it (1 to 5, by the generator's bands)?
export function check(vault, budget = BUDGET) {
  const r = validate(vault, { budget });
  if (!r.ok) return { ok: false, errors: r.errors, cost: r.cost, budget, grade: 0 };
  const score = difficulty(vault).score;
  let grade = BANDS.findIndex(([lo, hi]) => score >= lo && score < hi) + 1;
  if (!grade) grade = score >= BANDS[BANDS.length - 1][0] ? BANDS.length : 1;
  return { ok: true, errors: [], cost: r.cost, budget, grade, score };
}
