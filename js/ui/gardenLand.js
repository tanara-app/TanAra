/*
  «باغ»: the land round the garden (GARDEN.md). Everything here is built in code:

  - the desert: one low-poly sheet of sand with wind-blown dunes, flat near the garden and along the
    qanat. Each square of land («cell», domain/garden.js) that is watered turns its part of the sheet
    green and smooths it down, so the green spreads as soft-edged patches, not as tiles;
  - two rings of mountains on the horizon;
  - what grows on green land: grass, flowers, shrubs, five kinds of tree and two buildings. Each kind
    is one merged shape with its colours baked in and is drawn in bulk (InstancedMesh), so a thousand
    plants cost about as much as one. Plants sway in the wind in the vertex shader.

  makeLand(THREE, scene, uTime) returns { setCell, cellTop, update }.
*/
import { CELL, SHAFTS, cellKey, plantOf, hash } from '../domain/garden.js';

const BASE = -0.2;   // the height of flat ground
const STEP = CELL / 2; // the sand sheet has a point at every cell's centre, edge and corner
const N = 150;       // points along a side of the sheet, less one
const HALF = N / 2;

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const h2 = (x, z) => {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
function noise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = h2(xi, zi), b = h2(xi + 1, zi), c = h2(xi, zi + 1), d = h2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// long crests lying one way, like sand the wind has combed, with smaller ripples on them
const dune = (x, z) => Math.pow(noise(x * 0.04 + 3, z * 0.085 + 7), 1.7) * 5 + noise(x * 0.1, z * 0.19 + 20) * 1.2 + noise(x * 0.42, z * 0.42) * 0.16;
// 0 where the ground must stay flat (the garden, the channel, the line of shafts), 1 in open desert
const PATH = [[-5, 0], [-16.4, 0], ...SHAFTS];
function dry(x, z) {
  let dm = 1e9;
  for (let k = 0; k < PATH.length - 1; k++) {
    const [ax, az] = PATH[k], [bx, bz] = PATH[k + 1], vx = bx - ax, vz = bz - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    dm = Math.min(dm, Math.hypot(x - ax - vx * t, z - az - vz * t));
  }
  return smooth(9, 30, Math.hypot(x, z)) * smooth(2.6, 8, dm);
}

export function makeLand(THREE, scene, uTime) {
  const col = h => new THREE.Color(h);
  const tmp = new THREE.Color(), tmp2 = new THREE.Color();

  /* ---------------- the sand sheet ---------------- */
  const P = N + 1, pos = new Float32Array(P * P * 3), colr = new Float32Array(P * P * 3);
  const flat = new Float32Array(P * P), tone = new Float32Array(P * P); // how free each point is to rise, and its shade of sand
  const idx = [];
  for (let b = 0; b < P; b++) for (let a = 0; a < P; a++) {
    const v = b * P + a, edge = a === 0 || b === 0 || a === N || b === N;
    const x = (a - HALF) * STEP + (edge ? 0 : (h2(a, b) - 0.5) * 0.62), z = (b - HALF) * STEP + (edge ? 0 : (h2(b + 91, a + 17) - 0.5) * 0.62);
    pos[v * 3] = x; pos[v * 3 + 2] = z;
    flat[v] = dry((a - HALF) * STEP, (b - HALF) * STEP);
    tone[v] = h2(a + 5, b + 9);
    if (a < N && b < N) { const w = v + P; (a + b) % 2 ? idx.push(v, w, v + 1, v + 1, w, w + 1) : idx.push(v, w, w + 1, v, w + 1, v + 1); }
  }
  const SAND_LOW = col(0xdcb679), SAND_HIGH = col(0xf3d9a4), GREEN_NEW = col(0xa6d36c), GREEN_OLD = col(0x6fbd55), DAMP = col(0xc79f62);
  const amount = new Map(); // cell → { now, to }: its level as drawn, easing towards its level
  const level = (i, j) => amount.get(cellKey(i, j))?.now || 0;
  function point(a, b) {
    const v = b * P + a, x = pos[v * 3], z = pos[v * 3 + 2];
    // the cells this point belongs to: one at a cell's centre, two on an edge, four at a corner
    const ia = a - HALF, jb = b - HALF;
    const is = ia % 2 === 0 ? [ia / 2] : [Math.floor(ia / 2), Math.ceil(ia / 2)], js = jb % 2 === 0 ? [jb / 2] : [Math.floor(jb / 2), Math.ceil(jb / 2)];
    let lv = 0;
    for (const i of is) for (const j of js) lv += level(i, j);
    lv /= is.length * js.length;
    const g = Math.min(1, lv), d = dune(x, z) * flat[v];
    pos[v * 3 + 1] = BASE + d * (1 - g * 0.94) + g * 0.035 + (g > 0 ? (tone[v] - 0.5) * 0.07 * g : 0);
    tmp.copy(SAND_LOW).lerp(SAND_HIGH, Math.min(1, d / 3.2) * 0.75 + tone[v] * 0.25);
    if (g > 0) {
      tmp2.copy(GREEN_NEW).lerp(GREEN_OLD, Math.min(1, Math.max(0, lv - 1) / 2) * 0.8 + tone[v] * 0.2);
      tmp.lerp(DAMP, Math.min(1, g * 2.5) * 0.9).lerp(tmp2, smooth(0.25, 0.8, g));
    }
    colr[v * 3] = tmp.r; colr[v * 3 + 1] = tmp.g; colr[v * 3 + 2] = tmp.b;
  }
  for (let b = 0; b < P; b++) for (let a = 0; a < P; a++) point(a, b);
  const sandGeo = new THREE.BufferGeometry();
  sandGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sandGeo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  sandGeo.setIndex(idx);
  const sand = new THREE.Mesh(sandGeo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
  sand.receiveShadow = true; sand.frustumCulled = false; scene.add(sand);
  const under = new THREE.Mesh(new THREE.CircleGeometry(320, 40), new THREE.MeshStandardMaterial({ color: 0xe2bf84, roughness: 1 }));
  under.rotation.x = -Math.PI / 2; under.position.y = BASE - 0.5; scene.add(under);
  function redraw(i, j) { // the nine points of a cell
    for (let b = j * 2 + HALF - 1; b <= j * 2 + HALF + 1; b++) for (let a = i * 2 + HALF - 1; a <= i * 2 + HALF + 1; a++) if (a >= 0 && b >= 0 && a <= N && b <= N) point(a, b);
    sandGeo.attributes.position.needsUpdate = true; sandGeo.attributes.color.needsUpdate = true;
  }

  /* ---------------- the mountains: a near range and a paler one behind it ---------------- */
  function range(r0, r1, high, seed, low, mid, snowAt) {
    const A = 132, rows = [0, 0.16, 0.38, 0.58, 0.78, 1], prof = [0, 0.3, 0.8, 1, 0.55, 0];
    const p = [], c = [], ix = [], cLow = col(low), cMid = col(mid), cSnow = col(0xf7f1ea);
    for (let a = 0; a < A; a++) for (let k = 0; k < rows.length; k++) {
      const th = a / A * Math.PI * 2, cx = Math.cos(th), sz = Math.sin(th);
      const ridge = Math.pow(noise(cx * 3.1 + seed, sz * 3.1 + seed), 1.5) * 1.5 + noise(cx * 9 + seed, sz * 9) * 0.5 + h2(a + seed, k) * 0.22;
      const r = r0 + (r1 - r0) * rows[k] + (h2(a, k + seed) - 0.5) * 5, h = prof[k] * high * (0.25 + ridge);
      p.push(cx * r, BASE - 0.4 + h, sz * r);
      const f = h / high;
      tmp.copy(cLow).lerp(cMid, smooth(0.05, 0.6, f)).lerp(cSnow, smooth(snowAt, snowAt + 0.25, f));
      c.push(tmp.r, tmp.g, tmp.b);
      if (k < rows.length - 1) {
        const v = a * rows.length + k, w = ((a + 1) % A) * rows.length + k;
        ix.push(v, v + 1, w, w, v + 1, w + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.setIndex(ix);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
    m.frustumCulled = false; scene.add(m);
  }
  range(96, 150, 4.2, 11, 0xe6c596, 0xc79c84, 1.3);
  range(140, 215, 8.5, 47, 0xcaa99c, 0x9c8db4, 0.8);

  /* ---------------- shapes: many parts merged into one, colours baked in ---------------- */
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3();
  // part: [geometry, colour, [x, y, z], scale (number or [x, y, z]), [rx, ry, rz]]
  function merge(parts) {
    const p = [], c = [];
    for (const [geo, colour, at = [0, 0, 0], sc = 1, rot = [0, 0, 0]] of parts) {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      M.compose(V.set(...at), Q.setFromEuler(E.set(...rot)), typeof sc === 'number' ? S.setScalar(sc) : S.set(...sc));
      g.applyMatrix4(M);
      const a = g.attributes.position.array;
      tmp.set(colour);
      for (let k = 0; k < a.length; k += 3) { p.push(a[k], a[k + 1], a[k + 2]); c.push(tmp.r, tmp.g, tmp.b); }
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    out.computeVertexNormals();
    return out;
  }
  const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d), cyl = (a, b, h, s = 6) => new THREE.CylinderGeometry(a, b, h, s);
  const cone = (r, h, s = 5) => new THREE.ConeGeometry(r, h, s), box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
  const ring = (n, f) => Array.from({ length: n }, (_, k) => f(k / n * Math.PI * 2, k));
  const BARK = 0x8a5a33, MUD = 0xd9b27d, MUD_D = 0xc39c66, PALE = 0xecd3a4, TILE = 0x2fb5b2, DARK = 0x4a3524;
  const PETAL = [0xf26d8a, 0xffd04d, 0xffffff, 0xb784f0, 0xff8b4d];

  const grass = merge(ring(7, (a, k) => [cone(0.045, 0.24 + (k % 3) * 0.09, 3), k % 2 ? 0x7fc259 : 0x5fae48, [Math.cos(a) * 0.13, 0.13 + (k % 3) * 0.04, Math.sin(a) * 0.13], 1, [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35]]));
  const flower = c => merge([
    ...ring(3, (a, k) => [cyl(0.014, 0.018, 0.3 + k * 0.07, 4), 0x3f8a34, [Math.cos(a) * 0.16, 0.15 + k * 0.035, Math.sin(a) * 0.16]]),
    ...ring(3, (a, k) => [ico(0.085), PETAL[(c + (k === 2 ? 1 : 0)) % 5], [Math.cos(a) * 0.16, 0.34 + k * 0.07, Math.sin(a) * 0.16]]),
    ...ring(3, (a, k) => [ico(0.038), 0xffd04d, [Math.cos(a) * 0.16, 0.41 + k * 0.07, Math.sin(a) * 0.16]]),
    ...ring(4, a => [cone(0.04, 0.2, 3), 0x6cbd52, [Math.cos(a + 0.6) * 0.07, 0.1, Math.sin(a + 0.6) * 0.07]]),
  ]);
  const shrub = c => merge([
    [ico(0.34), 0x4f9a3e, [0, 0.24, 0], [1, 0.78, 1]], [ico(0.25), 0x62b34c, [0.2, 0.36, 0.08]], [ico(0.2), 0x478c38, [-0.18, 0.3, -0.12]],
    ...ring(5, (a, k) => [ico(0.06), PETAL[(c + k % 2) % 5], [Math.cos(a) * 0.27, 0.36 + (k % 2) * 0.13, Math.sin(a) * 0.27]]),
  ]);
  const palm = merge([
    [cyl(0.13, 0.19, 0.9), 0x9a7248, [0, 0.45, 0]], [cyl(0.115, 0.14, 0.9), 0x8a6238, [0.05, 1.3, 0.02], 1, [0, 0.5, -0.07]], [cyl(0.1, 0.12, 0.8), 0x9a7248, [0.13, 2.1, 0.03], 1, [0, 1, -0.1]],
    ...ring(9, (a, k) => [cone(0.2, 1.7, 4), k % 2 ? 0x3f9a45 : 0x58b052, [0.17 + Math.cos(a) * 0.62, 2.42 - (k % 3) * 0.11, 0.03 + Math.sin(a) * 0.62], [1, 1, 0.3], [0, -a, -(1.72 + (k % 3) * 0.17)]]),
    [cone(0.11, 0.8, 4), 0x6cbd52, [0.17, 2.85, 0.03]],
    ...ring(3, a => [ico(0.13), 0xc9772e, [0.17 + Math.cos(a) * 0.17, 2.3, 0.03 + Math.sin(a) * 0.17], [1, 1.3, 1]]),
  ]);
  const anar = merge([
    [cyl(0.07, 0.12, 0.8), BARK, [0, 0.4, 0]], [cyl(0.05, 0.07, 0.5), BARK, [0.14, 0.92, 0], 1, [0, 0, -0.6]], [cyl(0.05, 0.07, 0.5), BARK, [-0.13, 0.92, 0.05], 1, [0.2, 0, 0.6]],
    [ico(0.56), 0x4f9a3e, [0, 1.42, 0]], [ico(0.44), 0x62b34c, [0.42, 1.2, 0.12]], [ico(0.42), 0x478c38, [-0.4, 1.22, -0.08]], [ico(0.36), 0x6cbd52, [0.05, 1.82, 0.1]],
    ...ring(7, (a, k) => [ico(0.115, 1), 0xd8443a, [Math.cos(a) * (0.62 + (k % 2) * 0.12), 1.05 + (k % 3) * 0.3, Math.sin(a) * (0.62 + (k % 2) * 0.12)]]),
  ]);
  const narenj = merge([
    [cyl(0.08, 0.11, 0.75), 0x7a5230, [0, 0.37, 0]],
    [ico(0.72, 1), 0x2f7d3a, [0, 1.3, 0], [1, 0.92, 1]], [ico(0.4, 1), 0x3a8f45, [0.25, 1.78, 0.1]],
    ...ring(9, (a, k) => [ico(0.1, 1), 0xff9a2e, [Math.cos(a) * 0.68, 0.98 + (k % 3) * 0.3, Math.sin(a) * 0.68]]),
  ]);
  const toot = merge([
    [cyl(0.11, 0.17, 0.95), 0x7d5733, [0, 0.47, 0]], [cyl(0.07, 0.1, 0.7), 0x7d5733, [0.25, 1.1, 0], 1, [0, 0, -0.8]], [cyl(0.07, 0.1, 0.7), 0x7d5733, [-0.25, 1.1, 0.06], 1, [0, 0, 0.8]],
    [ico(0.7), 0x79b84f, [0, 1.75, 0], [1.1, 0.8, 1.1]], [ico(0.58), 0x8cc65a, [0.72, 1.45, 0.1], [1, 0.8, 1]], [ico(0.56), 0x6aab45, [-0.7, 1.48, -0.1], [1, 0.8, 1]],
    [ico(0.5), 0x8cc65a, [0.1, 1.5, 0.62], [1, 0.8, 1]], [ico(0.46), 0x79b84f, [-0.1, 1.55, -0.6], [1, 0.8, 1]],
    ...ring(8, (a, k) => [ico(0.055), k % 2 ? 0x6a2c70 : 0xb0355a, [Math.cos(a) * 0.95, 1.25 + (k % 3) * 0.18, Math.sin(a) * 0.95]]),
  ]);
  const sarv = merge([
    [cyl(0.08, 0.12, 0.4), 0x7a4a2a, [0, 0.2, 0]],
    [cone(0.4, 2.7, 7), 0x2f7a3c, [0, 1.7, 0]], [cone(0.3, 1.5, 7), 0x2a6e37, [0, 1.15, 0], [1.25, 1, 1.25], [0, 0.45, 0]],
  ]);
  const slot = (x, z, w, d) => [box(w, 0.62, d), DARK, [x, 3.02, z]];
  const badgir = merge([
    [box(2.2, 1, 1.6), MUD, [0.2, 0.5, 0]], [box(2.34, 0.1, 1.74), PALE, [0.2, 1.05, 0]],
    [new THREE.SphereGeometry(0.56, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), TILE, [0.75, 1.08, 0]],
    [box(0.36, 0.6, 0.06), DARK, [0.5, 0.3, 0.81]], [cyl(0.18, 0.18, 0.06, 8), DARK, [0.5, 0.6, 0.81], 1, [Math.PI / 2, 0, 0]],
    [box(0.9, 2.6, 0.9), MUD_D, [-0.45, 1.3, 0]], [box(1.02, 0.86, 1.02), MUD, [-0.45, 3.02, 0]],
    ...[-0.3, 0, 0.3].flatMap(o => [slot(-0.45 + o, 0.5, 0.16, 0.06), slot(-0.45 + o, -0.5, 0.16, 0.06), slot(0.055, o, 0.06, 0.16), slot(-0.955, o, 0.06, 0.16)]),
    [box(1.14, 0.1, 1.14), PALE, [-0.45, 3.5, 0]], [box(1.14, 0.08, 1.14), PALE, [-0.45, 2.58, 0]],
  ]);
  const kabootar = merge([
    [cyl(0.95, 1.08, 2, 12), MUD, [0, 1, 0]], [cyl(1.04, 1.04, 0.14, 12), PALE, [0, 2.07, 0]],
    [cyl(0.5, 0.58, 0.7, 10), MUD_D, [0, 2.45, 0]], [cyl(0.56, 0.56, 0.1, 10), PALE, [0, 2.85, 0]],
    ...ring(6, a => [cyl(0.13, 0.15, 0.4, 6), MUD, [Math.cos(a) * 0.82, 2.3, Math.sin(a) * 0.82]]),
    ...ring(6, a => [cone(0.15, 0.16, 6), 0xf7f1ea, [Math.cos(a) * 0.82, 2.58, Math.sin(a) * 0.82]]),
    [cone(0.2, 0.22, 6), 0xf7f1ea, [0, 3.01, 0]],
    ...ring(12, (a, k) => [box(0.1, 0.1, 0.06), DARK, [Math.cos(a) * 1.0, 1.25 + (k % 2) * 0.35, Math.sin(a) * 1.0], 1, [0, -a + Math.PI / 2, 0]]),
    [box(0.34, 0.56, 0.08), DARK, [0, 0.28, 1.05]],
  ]);

  /* ---------------- drawing in bulk ---------------- */
  // plants bend with the wind, more the higher up: a slow wave that crosses the land
  const sway = k => sh => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec4 wp = instanceMatrix * vec4(position, 1.0);
        float bend = (sin(uTime * 1.3 + wp.x * 0.45 + wp.z * 0.3) + 0.5 * sin(uTime * 2.9 + wp.x * 1.3)) * ${k.toFixed(3)} * position.y * position.y;
        transformed.x += bend; transformed.z += bend * 0.6;
      #endif`);
  };
  const leafy = k => { const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 }); m.onBeforeCompile = sway(k); m.customProgramCacheKey = () => 'sway' + k; return m; };
  const still = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
  function pool(geo, material, cap, shadow = true) {
    let mesh;
    const make = n => {
      const m = new THREE.InstancedMesh(geo, material, n);
      m.count = 0; m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); return m;
    };
    mesh = make(cap);
    return {
      add() {
        if (mesh.count === cap) { // full: move to one twice the size
          const old = mesh; cap *= 2; mesh = make(cap);
          mesh.instanceMatrix.array.set(old.instanceMatrix.array); mesh.count = old.count;
          scene.remove(old); old.dispose();
        }
        return mesh.count++;
      },
      set(i, m) { mesh.setMatrixAt(i, m); mesh.instanceMatrix.needsUpdate = true; },
    };
  }
  const POOLS = {
    grass: pool(grass, leafy(0.9), 1024, false),
    flower: [0, 1, 2, 3, 4].map(c => pool(flower(c), leafy(0.5), 256, false)),
    shrub: [0, 2, 3].map(c => pool(shrub(c), leafy(0.12), 256)),
    palm: pool(palm, leafy(0.012), 128), anar: pool(anar, leafy(0.03), 64), narenj: pool(narenj, leafy(0.03), 64),
    toot: pool(toot, leafy(0.022), 64), sarv: pool(sarv, leafy(0.012), 64),
    badgir: pool(badgir, still, 16), kabootar: pool(kabootar, still, 16),
  };

  // one thing standing on the land; `born` makes it rise out of the ground
  const growing = [];
  function put(p, x, z, size, turn, born) {
    const it = { p, i: p.add(), x, z, size, turn, born };
    if (born == null) place(it, 1); else { place(it, 0); growing.push(it); }
  }
  function place(it, k) {
    M.compose(V.set(it.x, BASE + 0.03, it.z), Q.setFromEuler(E.set(0, it.turn, 0)), S.setScalar(Math.max(0.0001, it.size * k)));
    it.p.set(it.i, M);
  }
  function dress(i, j, lv, born) { // what a cell gains when it reaches level lv
    let s = hash(i, j) + lv * 7919;
    const r = () => { s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9 | 0; return ((s ^ (s >>> 13)) >>> 0) / 4294967296; };
    const cx = i * CELL, cz = j * CELL, at = spread => [cx + (r() - 0.5) * spread, cz + (r() - 0.5) * spread];
    const delay = () => (born == null ? null : born + r() * 0.5);
    if (lv === 1) for (let k = 0; k < 6; k++) put(POOLS.grass, ...at(2.4), 0.8 + r() * 0.7, r() * 6, delay());
    if (lv === 2) {
      for (let k = 0; k < 3; k++) put(POOLS.flower[(r() * 5) | 0], ...at(2.2), 0.9 + r() * 0.5, r() * 6, delay());
      for (let k = 0; k < 2; k++) put(POOLS.shrub[(r() * 3) | 0], ...at(2.1), 0.8 + r() * 0.5, r() * 6, delay());
      for (let k = 0; k < 3; k++) put(POOLS.grass, ...at(2.4), 0.8 + r() * 0.6, r() * 6, delay());
    }
    if (lv === 3) {
      const kind = plantOf(i, j), build = kind === 'badgir' || kind === 'kabootar';
      put(POOLS[kind], cx + (build ? 0 : (r() - 0.5) * 0.7), cz + (build ? 0 : (r() - 0.5) * 0.7), build ? 0.82 : 0.85 + r() * 0.35, build ? Math.floor(r() * 4) * Math.PI / 2 : r() * 6, born == null ? null : born + 0.25);
    }
  }

  /* ---------------- what the game calls ---------------- */
  const moving = new Set();
  return {
    // a cell's level: straight away when the garden opens (`born` empty), or as it is watered
    setCell(i, j, lv, born) {
      const k = cellKey(i, j), was = amount.get(k)?.to || 0;
      if (born == null) amount.set(k, { now: lv, to: lv, i, j });
      else { amount.set(k, { now: amount.get(k)?.now || 0, to: lv, i, j }); moving.add(k); }
      for (let n = was + 1; n <= lv; n++) dress(i, j, n, born);
      if (born == null) redraw(i, j);
    },
    // the height of the ground in the middle of a cell
    cellTop(i, j) {
      const v = (j * 2 + HALF) * P + i * 2 + HALF;
      return pos[v * 3 + 1] ?? BASE;
    },
    update(t, dt) {
      for (const k of moving) {
        const c = amount.get(k);
        c.now = Math.min(c.to, c.now + dt * 1.1);
        redraw(c.i, c.j);
        if (c.now >= c.to) moving.delete(k);
      }
      for (let n = growing.length - 1; n >= 0; n--) {
        const it = growing[n], a = (t - it.born) / 0.9;
        if (a <= 0) continue;
        if (a >= 1) { place(it, 1); growing.splice(n, 1); continue; }
        const b = a - 1; place(it, 1 + 2.4 * b * b * b + 1.4 * b * b); // rises a little too far, then settles
      }
    },
  };
}
