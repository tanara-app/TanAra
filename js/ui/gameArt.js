/*
  Placeholder art for «سرزمین»: every building as a few shaded isometric blocks, until the real
  pre-rendered 3D images arrive (then `polys` is replaced by an image per kind and level).
  Everything is a list of filled polygons, so the same shapes draw in the game (Phaser) and in
  a small <canvas> (the shop cards).

  Isometric 2:1: tile (x, y) at z height sits at ((x − y)·TW/2, (x + y)·TH/2 − z).
*/
export const TW = 64, TH = 32;
export const iso = (x, y, z = 0) => [(x - y) * TW / 2, (x + y) * TH / 2 - z];

export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = s => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `#${((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1)}`;
}

// A block on tiles x0..x0+w, y0..y0+d, from height z up by h: the two visible sides and the top.
function block(x0, y0, w, d, z, h, color) {
  const P = (x, y, zz) => iso(x, y, zz);
  const [A, B, C, D] = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + d], [x0, y0 + d]];
  const top = [A, B, C, D].flatMap(([x, y]) => P(x, y, z + h));
  const l = [...P(...D, z), ...P(...C, z), ...P(...C, z + h), ...P(...D, z + h)];
  const r = [...P(...C, z), ...P(...B, z), ...P(...B, z + h), ...P(...C, z + h)];
  return { depth: x0 + w / 2 + y0 + d / 2, z, polys: [{ pts: l, fill: shade(color, 0.78) }, { pts: r, fill: shade(color, 0.6) }, { pts: top, fill: color }] };
}

// A cypress (cone) standing at tile point (x, y).
function cone(x, y, z, r, h, color) {
  const [px, py] = iso(x, y, z);
  return { depth: x + y, z, polys: [
    { pts: [px - r, py, px, py - h, px, py + r / 2], fill: shade(color, 1.1) },
    { pts: [px, py + r / 2, px, py - h, px + r, py], fill: shade(color, 0.75) },
  ] };
}

// A small dome on a tile point.
function dome(x, y, z, r, color) {
  const [px, py] = iso(x, y, z);
  const arc = (a0, a1) => { const p = []; for (let i = 0; i <= 8; i++) { const a = a0 + (a1 - a0) * i / 8; p.push(px + Math.cos(a) * r, py - Math.sin(a) * r * 1.1); } return p; };
  return { depth: x + y, z, polys: [
    { pts: [...arc(Math.PI, Math.PI / 2), px, py], fill: shade(color, 1.05) },
    { pts: [px, py, ...arc(Math.PI / 2, 0)], fill: shade(color, 0.75) },
  ] };
}

const SAND = '#d9b27a', STONE = '#efdcb5', CLAY = '#cf9f66', DARK = '#5b4330';

const PARTS = {
  // A hall of columns on a stepped terrace, after the Apadana of Persepolis.
  palace: () => {
    const p = [block(0.1, 0.1, 2.8, 2.8, 0, 8, SAND), block(0.35, 0.35, 2.3, 2.3, 8, 4, shade(SAND, 1.06))];
    const at = [0.65, 1.2, 1.75, 2.3];
    for (const i of at) for (const j of at) {
      p.push(block(i - 0.07, j - 0.07, 0.14, 0.14, 12, 40, STONE));
      p.push(block(i - 0.13, j - 0.13, 0.26, 0.26, 52, 5, shade(SAND, 0.92)));
    }
    return p;
  },
  // Walls round a courtyard, a tall gate (pishtaq) in front, domed towers at the corners.
  caravan: () => {
    const t = 0.22, h = 20, p = [block(0.1, 0.1, 1.8, 1.8, 0, 2, shade(CLAY, 0.85))];
    p.push(block(0.1, 0.1, 1.8, t, 2, h, CLAY), block(0.1, 0.1, t, 1.8, 2, h, CLAY));
    p.push(block(1.9 - t, 0.1, t, 1.8, 2, h, CLAY));
    p.push(block(0.1, 1.9 - t, 0.65, t, 2, h, CLAY), block(1.25, 1.9 - t, 0.65, t, 2, h, CLAY));
    p.push(block(0.62, 1.86 - t, 0.16, t + 0.06, 2, 30, shade(CLAY, 1.08)), block(1.22, 1.86 - t, 0.16, t + 0.06, 2, 30, shade(CLAY, 1.08)));
    p.push(block(0.62, 1.86 - t, 0.76, t + 0.06, 26, 6, shade(CLAY, 1.08)));
    for (const [x, y] of [[0.1, 0.1], [1.58, 0.1], [0.1, 1.58], [1.58, 1.58]]) {
      p.push(block(x, y, 0.32, 0.32, 2, 24, shade(CLAY, 1.04)));
      p.push(dome(x + 0.16, y + 0.16, 26, 7, '#7fb6c9'));
    }
    return p;
  },
  // A walled Persian garden: four quarters, crossing paths, a pool and cypresses.
  garden: () => {
    const p = [block(0.05, 0.05, 1.9, 1.9, 0, 3, '#7fae5c')];
    p.push(block(0.9, 0.05, 0.2, 1.9, 3, 0.6, '#e5d3a4'), block(0.05, 0.9, 1.9, 0.2, 3, 0.6, '#e5d3a4'));
    p.push(block(0.7, 0.7, 0.6, 0.6, 3, 1.4, '#3d8fc4'));
    for (const [x, y] of [[0.45, 0.45], [1.55, 0.45], [0.45, 1.55], [1.55, 1.55]]) p.push(cone(x, y, 3, 7, 30, '#2f6b3a'));
    return p;
  },
  // A windcatcher of Yazd: a tower with dark vents between its corner posts.
  badgir: () => {
    const p = [block(0.12, 0.12, 0.76, 0.76, 0, 12, shade(SAND, 0.95))];
    p.push(block(0.3, 0.3, 0.4, 0.4, 12, 34, DARK));
    for (const [x, y] of [[0.28, 0.28], [0.62, 0.28], [0.28, 0.62], [0.62, 0.62]]) p.push(block(x, y, 0.1, 0.1, 12, 34, shade(SAND, 1.05)));
    p.push(block(0.25, 0.25, 0.5, 0.5, 46, 4, shade(SAND, 0.9)));
    return p;
  },
};

// Scaffolding while it is being built: wooden poles at the corners and a plank between them.
function scaffold(size) {
  const W = '#8a5a2b', s = size - 0.2, p = [];
  for (const [x, y] of [[0.1, 0.1], [s, 0.1], [0.1, s], [s, s]]) p.push(block(x, y, 0.1, 0.1, 0, 26 + size * 4, W));
  p.push(block(0.1, s, size - 0.1, 0.08, 14, 3, shade(W, 1.15)), block(s, 0.1, 0.08, size - 0.1, 14, 3, shade(W, 1.15)));
  return p;
}

// Polygons of one building, in pixels relative to the middle of its footprint.
export function polys(kind, size, { building = false } = {}) {
  const parts = [...PARTS[kind](), ...(building ? scaffold(size) : [])];
  parts.sort((a, b) => a.depth - b.depth || a.z - b.z);
  const [cx, cy] = iso(size / 2, size / 2);
  return parts.flatMap(p => p.polys.map(q => ({ ...q, pts: q.pts.map((v, i) => v - (i % 2 ? cy : cx)) })));
}

// Draws a building into a 2D canvas, fitted and centred (shop cards, the tools tile).
export function drawPreview(canvas, kind, size) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const list = polys(kind, size);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of list) for (let i = 0; i < q.pts.length; i += 2) { x0 = Math.min(x0, q.pts[i]); x1 = Math.max(x1, q.pts[i]); y0 = Math.min(y0, q.pts[i + 1]); y1 = Math.max(y1, q.pts[i + 1]); }
  const k = Math.min(w / (x1 - x0), h / (y1 - y0)) * 0.9 * dpr;
  ctx.setTransform(k, 0, 0, k, (w * dpr - (x1 + x0) * k) / 2, (h * dpr - (y1 + y0) * k) / 2);
  ctx.clearRect(x0 - 10, y0 - 10, x1 - x0 + 20, y1 - y0 + 20);
  for (const q of list) {
    ctx.beginPath();
    for (let i = 0; i < q.pts.length; i += 2) ctx[i ? 'lineTo' : 'moveTo'](q.pts[i], q.pts[i + 1]);
    ctx.closePath(); ctx.fillStyle = q.fill; ctx.fill();
  }
}
