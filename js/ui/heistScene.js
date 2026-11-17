/*
  «سرقت بزرگ»: the three.js scene of one vault (DESIGN-heist.md, «Art bible»). It only draws: the rules are in
  domain/heist.js, and ui/heist.js tells this file what happened (`sync` to show a state as it is, `playTurn` to act
  out a turn's events). three.js 0.170.0 comes from the CDN through the import map in index.html, only when the
  game opens.

  One style, one light: a night model of a vault on a dark table. Navy structure, cyan for the thief and everything
  that is his, red only for danger, gold only for the loot. The two figures are Meshy models (assets/heist/); the
  board, the safe, the lasers and the effects are built here so they share the scene's light.
*/
import { W, H, threats, nextThreats, revealed } from '../domain/heist.js';

export const COLORS = { bg: 0x070b1a, floor: 0x0f1736, floor2: 0x131d42, wall: 0x1f2848, cap: 0x2a3763, deep: 0x0e1736, edge: 0x2b3f7a, cyan: 0x3de0ff, red: 0xff2e4d, gold: 0xffc94a };
const ROT = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const WALL_H = 0.56;
// The clips inside the Meshy files, by what the game calls them.
const CLIPS = {
  thief: { idle: /^idle$/i, sneak: /sneak/i, run: /sprint|run/i, rope: /rope/i, win: /victory/i, caught: /pain|head/i },
  guard: { idle: /^idle$/i, walk: /walk/i, run: /charge|run/i, catch: /wag|finger/i },
};
const easeInOut = k => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const easeOut = k => 1 - (1 - k) ** 3;

export async function createScene(stage, vault, opts = {}) {
  const T = await import('three');
  const [{ GLTFLoader }, { EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }, Skel] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'), import('three/addons/postprocessing/EffectComposer.js'),
    import('three/addons/postprocessing/RenderPass.js'), import('three/addons/postprocessing/UnrealBloomPass.js'),
    import('three/addons/postprocessing/OutputPass.js'), import('three/addons/utils/SkeletonUtils.js'),
  ]);
  opts.onProgress?.(0.3);

  const tiles = vault.tiles.join('');
  const tileAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? '#' : tiles[y * W + x]);
  const pos = (i, y = 0) => new T.Vector3(i % W - (W - 1) / 2, y, (i / W | 0) - (H - 1) / 2);

  // ---------- renderer, camera, light ----------
  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  stage.appendChild(renderer.domElement);

  const scene = new T.Scene();
  scene.background = new T.Color(COLORS.bg);
  scene.fog = new T.Fog(COLORS.bg, 24, 44);
  const camera = new T.PerspectiveCamera(18, 1, 1, 200);

  const hemi = new T.HemisphereLight(0xc4cffa, 0x141a38, 0.8);
  scene.add(hemi);
  const moon = new T.DirectionalLight(0xdbe5ff, 3.1);
  moon.position.set(-5, 11, 5);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  Object.assign(moon.shadow.camera, { left: -6.5, right: 6.5, top: 7, bottom: -7, near: 1, far: 30 });
  moon.shadow.bias = -0.0015;
  moon.shadow.radius = 4;
  scene.add(moon);
  const siren = new T.PointLight(COLORS.red, 0, 14, 1.6);
  siren.position.set(0, 3.2, 0);
  scene.add(siren);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new T.Vector2(256, 256), 0.6, 0.55, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ---------- helpers ----------
  const std = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, ...extra });
  const glow = (color, k = 2.4) => new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(k), toneMapped: false });
  const shadowy = m => { m.castShadow = true; m.receiveShadow = true; return m; };
  // A flat box with rounded corners and soft edges, standing on y = 0.
  function slab(w, d, h, r = 0.07, b = 0.025) {
    const s = new T.Shape(), a = w / 2 - b, c = d / 2 - b;
    s.moveTo(-a + r, -c); s.lineTo(a - r, -c); s.quadraticCurveTo(a, -c, a, -c + r); s.lineTo(a, c - r); s.quadraticCurveTo(a, c, a - r, c);
    s.lineTo(-a + r, c); s.quadraticCurveTo(-a, c, -a, c - r); s.lineTo(-a, -c + r); s.quadraticCurveTo(-a, -c, -a + r, -c);
    const g = new T.ExtrudeGeometry(s, { depth: h - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 3 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, b, 0);
    return g;
  }
  function canvasTex(size, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    return t;
  }
  function instanced(geo, mat, cells, place) {
    const m = new T.InstancedMesh(geo, mat, cells.length), o = new T.Object3D();
    cells.forEach((i, k) => { o.position.copy(pos(i)); o.rotation.set(0, 0, 0); o.scale.setScalar(1); place?.(o, i, k, m); o.updateMatrix(); m.setMatrixAt(k, o.matrix); });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    return shadowy(m);
  }

  // ---------- the board ----------
  const board = new T.Group();
  scene.add(board);
  const table = new T.Mesh(new T.PlaneGeometry(90, 90), new T.MeshBasicMaterial({ map: canvasTex(256, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, '#131d44'); r.addColorStop(0.22, '#0c1330'); r.addColorStop(0.5, '#070b1a');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  }), fog: true }));
  table.rotation.x = -Math.PI / 2;
  table.position.y = -0.52;
  board.add(table);
  const plinth = shadowy(new T.Mesh(slab(W + 0.44, H + 0.44, 0.42, 0.12, 0.04), std(COLORS.deep)));
  plinth.position.y = -0.5;
  board.add(plinth);
  const rimMat = std(COLORS.edge, { roughness: 0.7 });
  for (const [w, d, x, z] of [[W + 0.3, 0.1, 0, -(H / 2 + 0.1)], [W + 0.3, 0.1, 0, H / 2 + 0.1], [0.1, H + 0.3, -(W / 2 + 0.1), 0], [0.1, H + 0.3, W / 2 + 0.1, 0]]) {
    const m = shadowy(new T.Mesh(slab(w, d, 0.2, 0.05, 0.02), rimMat));
    m.position.set(x, -0.08, z);
    board.add(m);
  }

  const cellsOf = test => [...tiles].map((t, i) => (test(t) ? i : -1)).filter(i => i >= 0);
  const floorMesh = instanced(slab(0.95, 0.95, 0.09, 0.09, 0.02), std(0xffffff), cellsOf(t => t !== '#'), (o, i, k, m) => {
    o.position.y = -0.09;
    m.setColorAt(k, new T.Color(((i % W) + (i / W | 0)) % 2 ? COLORS.floor : COLORS.floor2));
  });
  floorMesh.castShadow = false;
  board.add(floorMesh);
  const walls = cellsOf(t => t === '#');
  if (walls.length) {
    const wallMesh = instanced(slab(1, 1, WALL_H, 0.05, 0.03), std(COLORS.wall, { roughness: 0.8 }), walls, o => { o.position.y = -0.09; });
    board.add(wallMesh);
    const cap = instanced(slab(0.84, 0.84, 0.03, 0.06, 0.01), std(COLORS.cap, { roughness: 0.6 }), walls, o => { o.position.y = WALL_H - 0.09; });
    cap.castShadow = false;
    board.add(cap);
  }

  // The entry: a faint ring; the exits: a lit gate on the edge and arrows on the floor.
  const ringTex = canvasTex(128, (g, s) => { g.strokeStyle = '#fff'; g.lineWidth = 7; g.beginPath(); g.arc(s / 2, s / 2, s * 0.34, 0, 7); g.stroke(); });
  const flat = (tex, color, size, opacity = 1, k = 1) => {
    const m = new T.Mesh(new T.PlaneGeometry(size, size), new T.MeshBasicMaterial({ map: tex, color: new T.Color(color).multiplyScalar(k), transparent: true, opacity, depthWrite: false, toneMapped: false }));
    m.rotation.x = -Math.PI / 2;
    return m;
  };
  const entry = tiles.indexOf('E');
  const entryRing = flat(ringTex, 0x8c9ac8, 0.9, 0.35);
  entryRing.position.copy(pos(entry, 0.012));
  board.add(entryRing);
  const arrowTex = canvasTex(128, (g, s) => {
    g.strokeStyle = '#fff'; g.lineWidth = 11; g.lineCap = g.lineJoin = 'round';
    for (const y of [0.62, 0.38]) { g.beginPath(); g.moveTo(s * 0.3, s * y + 14); g.lineTo(s * 0.5, s * y - 12); g.lineTo(s * 0.7, s * y + 14); g.stroke(); }
  });
  const exitMarks = [];
  cellsOf(t => t === 'X').forEach(i => {
    const x = i % W, y = i / W | 0;
    const out = y === 0 ? 0 : y === H - 1 ? 2 : x === 0 ? 3 : 1;
    const a = flat(arrowTex, COLORS.cyan, 0.8, 0.9, 1.6);
    a.position.copy(pos(i, 0.012));
    a.rotation.z = -ROT[out] + Math.PI;
    board.add(a);
    exitMarks.push(a);
    const gate = new T.Group(), bar = glow(COLORS.cyan, 2.2);
    for (const sx of [-0.46, 0.46]) { const p = new T.Mesh(new T.BoxGeometry(0.05, 0.7, 0.05), bar); p.position.set(sx, 0.3, 0); gate.add(p); }
    const top = new T.Mesh(new T.BoxGeometry(0.97, 0.05, 0.05), bar);
    top.position.y = 0.66;
    gate.add(top);
    gate.position.copy(pos(i)).add(new T.Vector3(DX[out] * 0.56, 0, DY[out] * 0.56));
    gate.rotation.y = out % 2 ? Math.PI / 2 : 0;
    board.add(gate);
  });

  // The safe: a heavy box with a gold-rimmed round door that swings open on the side the thief can reach.
  const safeCell = tiles.indexOf('V');
  const safe = new T.Group();
  let safeDoor = null, safeLight = null, safeFace = 2;
  if (safeCell >= 0) {
    for (const d of [2, 3, 1, 0]) { const t = tileAt(safeCell % W + DX[d], (safeCell / W | 0) + DY[d]); if (t !== '#' && t !== 'V') { safeFace = d; break; } }
    const steel = std(0x31447f, { roughness: 0.45, metalness: 0.55 });
    const gold = std(COLORS.gold, { roughness: 0.3, metalness: 0.85, emissive: COLORS.gold, emissiveIntensity: 0.22 });
    safe.add(shadowy(new T.Mesh(slab(0.84, 0.84, 0.86, 0.08, 0.035), steel)));
    const inside = new T.Mesh(new T.CircleGeometry(0.27, 28), glow(COLORS.gold, 0.0));
    inside.position.set(0, 0.44, 0.424);
    safe.add(inside);
    safeDoor = new T.Group();
    safeDoor.position.set(-0.29, 0.44, 0.43);
    const leaf = new T.Group();
    leaf.position.x = 0.29;
    const disc = shadowy(new T.Mesh(new T.CylinderGeometry(0.29, 0.29, 0.07, 32), steel));
    disc.rotation.x = Math.PI / 2;
    leaf.add(disc);
    const rim = new T.Mesh(new T.TorusGeometry(0.29, 0.028, 10, 36), gold);
    rim.position.z = 0.035;
    leaf.add(rim);
    const dial = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 0.05, 20), gold);
    dial.rotation.x = Math.PI / 2;
    dial.position.z = 0.06;
    leaf.add(dial);
    for (let k = 0; k < 3; k++) { const spoke = new T.Mesh(new T.BoxGeometry(0.34, 0.03, 0.03), gold); spoke.rotation.z = k * Math.PI / 3; spoke.position.z = 0.075; leaf.add(spoke); }
    safeDoor.add(leaf);
    safe.add(safeDoor);
    safeLight = new T.PointLight(COLORS.gold, 1.2, 4, 1.8);
    safeLight.position.set(0, 0.5, 0.8);
    safe.add(safeLight);
    safe.userData.inside = inside;
    safe.position.copy(pos(safeCell, -0.0));
    safe.rotation.y = ROT[safeFace];
    board.add(safe);
  }

  // Locked doors: a panel across the passage that sinks into the floor when the lock gives.
  const doorCells = cellsOf(t => t === 'D');
  const doors = doorCells.map(i => {
    const x = i % W, y = i / W | 0, across = tileAt(x - 1, y) === '#' && tileAt(x + 1, y) === '#';
    const g = new T.Group();
    const panel = shadowy(new T.Mesh(slab(0.98, 0.16, WALL_H - 0.04, 0.03, 0.02), std(COLORS.edge, { roughness: 0.55, metalness: 0.3 })));
    const lamp = new T.Mesh(new T.SphereGeometry(0.05, 12, 10), glow(0x8c9ac8, 1.3));
    lamp.position.set(0, WALL_H * 0.62, 0.1);
    const lamp2 = lamp.clone();
    lamp2.position.z = -0.1;
    g.add(panel, lamp, lamp2);
    g.position.copy(pos(i, -0.02));
    g.rotation.y = across ? 0 : Math.PI / 2;
    board.add(g);
    return { g, lamp, lamp2, open: false };
  });

  // Plates and marks: the same faint cue from far away; next to the thief a plate shows itself and a mark fades.
  const cueTex = canvasTex(128, (g, s) => {
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(s * 0.2, s * 0.2, s * 0.6, s * 0.6);
    g.lineWidth = 2; g.beginPath(); g.moveTo(s * 0.3, s * 0.36); g.lineTo(s * 0.46, s * 0.3); g.moveTo(s * 0.58, s * 0.7); g.lineTo(s * 0.72, s * 0.6); g.stroke();
  });
  const plateTex = canvasTex(128, (g, s) => {
    g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(s * 0.17, s * 0.17, s * 0.66, s * 0.66);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(s * 0.3, s * 0.3, s * 0.4, s * 0.4);
  });
  const plates = (vault.defenses || []).filter(d => d.t === 'plate' || d.t === 'mark').map(d => {
    const m = flat(cueTex, 0xa9b6e0, 0.92, 0.3);
    m.position.copy(pos(d.y * W + d.x, 0.014));
    board.add(m);
    return { at: d.y * W + d.x, m, shown: '' };
  });

  // Lasers: an emitter on each wall and the beam between them.
  const lasers = (vault.defenses || []).filter(d => d.t === 'laser').map(d => {
    const k = d.axis === 'v' ? 2 : 1, cells = [d.y * W + d.x];
    for (const s of [k, (k + 2) % 4]) for (let x = d.x + DX[s], y = d.y + DY[s]; tileAt(x, y) === '.'; x += DX[s], y += DY[s]) cells.push(y * W + x);
    cells.sort((a, b) => a - b);
    const a = pos(cells[0]), b = pos(cells.at(-1)), mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b) + 1;
    const g = new T.Group();
    g.position.copy(mid).setY(0.3);
    g.rotation.y = d.axis === 'v' ? Math.PI / 2 : 0;
    const beam = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, len, 8), glow(COLORS.red, 3.2));
    beam.rotation.z = Math.PI / 2;
    const halo = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, len, 8), new T.MeshBasicMaterial({ color: COLORS.red, transparent: true, opacity: 0.16, depthWrite: false, blending: T.AdditiveBlending }));
    halo.rotation.z = Math.PI / 2;
    const ghost = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, len, 6), new T.MeshBasicMaterial({ color: 0x7a2038, transparent: true, opacity: 0.55 }));
    ghost.rotation.z = Math.PI / 2;
    const dots = [-1, 1].map(sx => {
      const box = shadowy(new T.Mesh(new T.BoxGeometry(0.1, 0.16, 0.16), std(COLORS.deep, { roughness: 0.5 })));
      box.position.x = sx * (len / 2 - 0.04);
      const dot = new T.Mesh(new T.SphereGeometry(0.035, 10, 8), glow(COLORS.red, 2.5));
      dot.position.x = sx * (len / 2 - 0.1);
      g.add(box, dot);
      return dot;
    });
    g.add(beam, halo, ghost);
    board.add(g);
    return { cells, beam, halo, ghost, dots, blink: d.mode === 'blink', phase: d.phase || 0, on: null };
  });
  const laserCells = new Set(lasers.flatMap(l => l.cells));

  // Cameras: a head on the wall that turns, with a red lens.
  const cams = (vault.defenses || []).filter(d => d.t === 'cam').map(d => {
    const g = new T.Group();
    g.position.copy(pos(d.y * W + d.x, WALL_H - 0.06));
    const post = shadowy(new T.Mesh(new T.CylinderGeometry(0.05, 0.07, 0.2, 10), std(COLORS.deep, { roughness: 0.5 })));
    post.position.y = 0.1;
    const head = new T.Group();
    head.position.y = 0.26;
    const body = shadowy(new T.Mesh(slab(0.24, 0.42, 0.2, 0.05, 0.02), std(0x3a4f93, { roughness: 0.4, metalness: 0.4 })));
    body.position.y = -0.1;
    const lens = new T.Mesh(new T.SphereGeometry(0.07, 14, 10), glow(COLORS.red, 2.6));
    lens.position.set(0, 0, 0.2);
    head.add(body, lens);
    head.rotation.x = 0.32;
    const yaw = new T.Group();
    yaw.add(head);
    g.add(post, yaw);
    board.add(g);
    return { at: d.y * W + d.x, yaw, lens, dir: d.dir || 0, ph: d.ph || 0, angle: null };
  });
  const camDir = (c, t) => (c.dir + ((t + c.ph) >> 1)) % 4;

  // The floor overlay: what is dangerous now (red fill), what will be next turn (red frame), and where the thief can go (cyan).
  const overlayGeo = new T.PlaneGeometry(0.95, 0.95);
  overlayGeo.rotateX(-Math.PI / 2);
  const aCur = new T.InstancedBufferAttribute(new Float32Array(W * H), 1), aNext = new T.InstancedBufferAttribute(new Float32Array(W * H), 1), aHint = new T.InstancedBufferAttribute(new Float32Array(W * H), 1);
  overlayGeo.setAttribute('aCur', aCur); overlayGeo.setAttribute('aNext', aNext); overlayGeo.setAttribute('aHint', aHint);
  const overlayMat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 } },
    vertexShader: `attribute float aCur; attribute float aNext; attribute float aHint; varying vec2 vUv; varying vec3 vK;
      void main() { vUv = uv; vK = vec3(aCur, aNext, aHint); gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying vec3 vK;
      void main() {
        vec2 q = abs(vUv - 0.5) * 2.0; float edge = max(q.x, q.y);
        float frame = smoothstep(0.8, 0.85, edge) * (1.0 - smoothstep(0.93, 0.98, edge));
        float corner = frame * step(0.45, min(q.x, q.y));
        float stripes = 0.5 + 0.5 * sin((vUv.x + vUv.y) * 22.0 - uTime * 2.4);
        float pulse = 0.5 + 0.5 * sin(uTime * 3.0);
        vec3 red = vec3(1.0, 0.1, 0.2), cyan = vec3(0.24, 0.88, 1.0);
        float aRed = vK.x * (0.07 + 0.11 * stripes) * (1.0 - smoothstep(0.9, 1.0, edge)) + vK.y * (frame * (0.42 + 0.3 * pulse) + 0.03);
        float aCy = step(0.5, vK.z) * (step(1.5, vK.z) * (0.16 + frame * 0.5) + (1.0 - step(1.5, vK.z)) * (corner * (0.65 + 0.35 * pulse) + 0.035));
        float a = max(aRed, aCy);
        if (a < 0.01) discard;
        vec3 col = aRed >= aCy ? red : cyan;
        gl_FragColor = vec4(col * (aRed >= aCy ? 0.95 : 1.0 + 0.5 * a), min(a, 0.9));
      }`,
  });
  const overlay = new T.InstancedMesh(overlayGeo, overlayMat, W * H);
  { const o = new T.Object3D(); for (let i = 0; i < W * H; i++) { o.position.copy(pos(i, 0.02)); o.updateMatrix(); overlay.setMatrixAt(i, o.matrix); } }
  overlay.frustumCulled = false;
  overlay.renderOrder = 2;
  board.add(overlay);

  // ---------- the figures ----------
  opts.onProgress?.(0.45);
  const loader = new GLTFLoader();
  const load = url => new Promise(res => loader.load(url, res, undefined, () => res(null)));
  const [thiefFile, guardFile] = await Promise.all([load('assets/heist/thief.glb'), load('assets/heist/guard.glb')]);
  opts.onProgress?.(0.9);

  // If a model is missing the game still works: a simple figure in the same colours stands in.
  function standIn(color, accent, wide) {
    const g = new T.Group();
    const body = new T.Mesh(new T.CapsuleGeometry(wide ? 0.2 : 0.15, 0.28, 6, 14), std(color));
    body.position.y = 0.34;
    const head = new T.Mesh(new T.SphereGeometry(wide ? 0.19 : 0.2, 18, 14), std(0xf0c9a4));
    head.position.y = 0.72;
    const hat = new T.Mesh(new T.SphereGeometry(wide ? 0.2 : 0.21, 18, 10, 0, 7, 0, 1.5), std(color));
    hat.position.y = 0.75;
    const band = new T.Mesh(new T.TorusGeometry(wide ? 0.2 : 0.155, 0.02, 8, 24), glow(accent, 1.6));
    band.rotation.x = Math.PI / 2;
    band.position.y = wide ? 0.78 : 0.4;
    g.add(body, head, hat, band);
    return { scene: g, animations: [] };
  }
  function actor(file, height, names, ringColor, lit = 0.6) {
    const root = new T.Group(), model = Skel.clone(file.scene);
    model.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(model), k = height / Math.max(0.001, box.max.y - box.min.y);
    model.scale.setScalar(k);
    model.position.y = -box.min.y * k;
    model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.frustumCulled = false;
      const m = o.material;
      // The models are toys under a night light: a little of their own colour as glow keeps them readable.
      if (m?.map && !m.emissiveMap) { m.emissiveMap = m.map; m.emissive = new T.Color(0xffffff); m.emissiveIntensity = lit; m.roughness = 0.75; m.metalness = 0; }
    });
    root.add(model);
    const ring = flat(ringTex, ringColor, 0.86, 0.85, 1.7);
    ring.position.y = 0.016;
    root.add(ring);
    const mixer = new T.AnimationMixer(model), actions = {};
    for (const [name, re] of Object.entries(names)) { const clip = file.animations.find(c => re.test(c.name)); if (clip) actions[name] = mixer.clipAction(clip); }
    let now = null;
    const a = { root, model, mixer, ring, cell: -1, dir: 2,
      play(name, { once = false, fade = 0.16, speed = 1 } = {}) {
        const next = actions[name] || actions.idle;
        if (!next || (next === now && !once)) return;
        next.reset(); next.timeScale = speed;
        next.setLoop(once ? T.LoopOnce : T.LoopRepeat, Infinity); next.clampWhenFinished = once;
        if (now && now !== next) next.crossFadeFrom(now, fade, false);
        next.play(); now = next;
      },
      place(cell, dir) { a.cell = cell; a.dir = dir; root.position.copy(pos(cell)); root.rotation.y = ROT[dir]; },
    };
    board.add(root);
    return a;
  }
  const thief = actor(thiefFile || standIn(0x16224a, COLORS.cyan, false), 1.34, CLIPS.thief, COLORS.cyan, 0.95);
  const thiefLight = new T.PointLight(COLORS.cyan, 1.6, 3.4, 1.8);
  thiefLight.position.set(0, 0.7, 0.6);
  thief.root.add(thiefLight);
  const guards = (vault.defenses || []).filter(d => d.t === 'guard').map(() => actor(guardFile || standIn(0x1c2a5c, COLORS.red, true), 1.3, CLIPS.guard, COLORS.red));
  thief.play('idle');
  guards.forEach(g => g.play('idle'));

  // A sign over a guard's head: «؟» while the bait pulls him, a red «!» while he chases the thief.
  function badgeTex(glyph, fg, bg) {
    return canvasTex(128, (g, s) => {
      g.fillStyle = bg; g.beginPath(); g.arc(s / 2, s / 2, s * 0.4, 0, 7); g.fill();
      g.lineWidth = 7; g.strokeStyle = fg; g.stroke();
      g.fillStyle = fg; g.font = `800 ${Math.round(s * 0.52)}px Vazirmatn, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(glyph, s / 2, s / 2 + s * 0.03);
    });
  }
  const askTex = badgeTex('؟', '#e8eeff', '#1b2752'), alertTex = badgeTex('!', '#ffffff', '#ff2e4d');
  for (const g of guards) {
    g.badge = new T.Sprite(new T.SpriteMaterial({ map: askTex, transparent: true, depthTest: false, toneMapped: false }));
    g.badge.position.y = 1.82;
    g.badge.scale.setScalar(0.001);
    g.badge.renderOrder = 6;
    g.badge.kind = '';
    g.root.add(g.badge);
  }
  const modeBadge = m => (m === 1 ? '؟' : m === 3 ? '!' : '');
  function setBadge(g, kind) {
    if (!g?.badge || g.badge.kind === kind) return;
    g.badge.kind = kind;
    const b = g.badge, s0 = b.scale.x;
    if (kind) { b.material.map = kind === '!' ? alertTex : askTex; tween(0.3, k => b.scale.setScalar(0.001 + 0.66 * (k < 0.65 ? (k / 0.65) * 1.2 : 1.2 - 0.2 * (k - 0.65) / 0.35)), k => k); }
    else tween(0.2, k => b.scale.setScalar(Math.max(0.001, s0 * (1 - k))));
  }

  // ---------- effects ----------
  const rope = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 1, 6), std(0xc9d3f5, { roughness: 0.6 }));
  rope.visible = false;
  board.add(rope);
  const ring = new T.Mesh(new T.RingGeometry(0.93, 1, 56), new T.MeshBasicMaterial({ color: new T.Color(COLORS.cyan).multiplyScalar(2.5), transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  board.add(ring);
  const COINS = 40;
  const coins = new T.InstancedMesh(new T.CylinderGeometry(0.055, 0.055, 0.018, 10), std(COLORS.gold, { roughness: 0.3, metalness: 0.9, emissive: COLORS.gold, emissiveIntensity: 0.5 }), COINS);
  const coin = Array.from({ length: COINS }, () => ({ p: new T.Vector3(), v: new T.Vector3(), r: new T.Vector3(), life: 0 }));
  coins.frustumCulled = false;
  board.add(coins);
  const puffTex = canvasTex(128, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,.95)'); r.addColorStop(0.5, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  });
  const puffs = [];   // { sprite, at, seed, k }
  let smokeKey = '';
  function setSmoke(list) {
    const key = list.map(s => s[0]).join(',');
    if (key === smokeKey) return;
    smokeKey = key;
    const want = new Set();
    for (const [at] of list) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = at % W + dx, y = (at / W | 0) + dy;
      if (x >= 0 && y >= 0 && x < W && y < H) want.add(y * W + x);
    }
    for (const p of puffs) p.gone = !want.has(p.at);
    for (const at of want) {
      if (puffs.some(p => p.at === at && !p.gone)) continue;
      for (let n = 0; n < 2; n++) {
        const sprite = new T.Sprite(new T.SpriteMaterial({ map: puffTex, color: 0x8e9bcb, transparent: true, opacity: 0, depthWrite: false }));
        board.add(sprite);
        puffs.push({ sprite, at, seed: Math.random() * 9, k: 0, n, gone: false });
      }
    }
  }
  // The decoy: a small puck that blinks and sends out rings while a guard is on his way to it.
  const puckGeo = new T.CylinderGeometry(0.17, 0.21, 0.12, 24), puckLampGeo = new T.SphereGeometry(0.065, 12, 10), puckRimGeo = new T.TorusGeometry(0.18, 0.022, 8, 28);
  const puckMat = std(0x2b3f7a, { roughness: 0.35, metalness: 0.6 }), puckLamp = glow(COLORS.cyan, 2.8), puckDead = glow(0x39456f, 1);
  const decoys = [];
  function makePuck(at) {
    const g = new T.Group();
    const body = new T.Mesh(puckGeo, puckMat);
    body.castShadow = true;
    body.position.y = 0.06;
    const lamp = new T.Mesh(puckLampGeo, puckLamp);
    lamp.position.y = 0.14;
    const rim = new T.Mesh(puckRimGeo, puckLamp);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.11;
    g.add(rim);
    const waves = [0, 1, 2].map(() => { const w = flat(ringTex, COLORS.cyan, 1, 0, 1.8); w.position.y = 0.02; g.add(w); return w; });
    g.add(body, lamp);
    board.add(g);
    const p = { g, lamp, waves, at, t0: clock, k: 1, dying: false, landed: false };
    decoys.push(p);
    return p;
  }
  // Sparks: the lockpick at a lock, the pulse round the thief.
  const SPARKS = 30;
  const sparkMesh = new T.InstancedMesh(new T.BoxGeometry(0.022, 0.022, 0.11), glow(COLORS.cyan, 3.2), SPARKS);
  const spark = Array.from({ length: SPARKS }, () => ({ p: new T.Vector3(), v: new T.Vector3(), life: 0 }));
  sparkMesh.frustumCulled = false;
  board.add(sparkMesh);
  function burstSparks(at, power = 1) {
    for (const s of spark) {
      s.life = 0.3 + Math.random() * 0.35;
      s.p.copy(at);
      s.v.set((Math.random() - 0.5) * 3.4 * power, (0.5 + Math.random() * 2.2) * power, (Math.random() - 0.5) * 3.4 * power);
    }
  }
  // The goggles: a curtain of light sweeps the floor from south to north and shows every plate for what it is.
  const scanTex = canvasTex(64, (g, s) => {
    const r = g.createLinearGradient(0, 0, 0, s);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.07, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  });
  const curtainTex = canvasTex(64, (g, s) => {
    const r = g.createLinearGradient(0, 0, 0, s);
    r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.8, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = r; g.fillRect(0, 0, s, s);
  });
  const scanMat = tex => new T.MeshBasicMaterial({ map: tex, color: new T.Color(COLORS.cyan).multiplyScalar(1.5), transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, side: T.DoubleSide });
  const scanFloor = new T.Mesh(new T.PlaneGeometry(W + 0.2, 1.8), scanMat(scanTex));
  scanFloor.rotation.x = -Math.PI / 2;
  const scanWall = new T.Mesh(new T.PlaneGeometry(W + 0.2, 0.9), scanMat(curtainTex));
  for (const m of [scanFloor, scanWall]) { m.visible = false; m.renderOrder = 3; board.add(m); }

  function burstCoins(from, dir) {
    for (const c of coin) {
      c.life = 1.1 + Math.random() * 0.5;
      c.p.copy(from);
      c.v.set(DX[dir] * (0.6 + Math.random() * 1.4) + (Math.random() - 0.5) * 1.3, 2 + Math.random() * 2.2, DY[dir] * (0.6 + Math.random() * 1.4) + (Math.random() - 0.5) * 1.3);
      c.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    }
  }

  // ---------- time ----------
  const tweens = [];
  let scale = 1, disposed = false, alarm = false, shake = 0, clock = 0;
  const tween = (dur, fn, ease = easeInOut) => new Promise(res => { if (disposed) return res(); tweens.push({ t: 0, dur: Math.max(dur, 0.001), fn, ease, res }); });
  const wait = dur => tween(dur, () => {});

  // ---------- the camera ----------
  const dirToCam = new T.Vector3(0, Math.sin(0.84), Math.cos(0.84)).normalize();   // from the south, 48° up: a model seen from a chair
  const base = { target: new T.Vector3(0, 0.15, 0), dist: 30 }, view = { target: base.target.clone(), dist: 30 };
  function aim() {
    camera.position.copy(view.target).addScaledVector(dirToCam, view.dist);
    if (shake > 0.001) camera.position.add(new T.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
    camera.lookAt(view.target);
  }
  function camTo(target, zoom, dur) {
    const from = view.target.clone(), d0 = view.dist, to = target ? base.target.clone().lerp(target, 0.75) : base.target.clone(), d1 = base.dist * zoom;
    return tween(dur, k => { view.target.lerpVectors(from, to, k); view.dist = d0 + (d1 - d0) * k; });
  }
  let tier = 0, size = { w: 1, h: 1 };
  function resize() {
    const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
    size = { w, h };
    const top = opts.padTop ?? 84, bottom = opts.padBottom ?? 132;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, [2, 2, 1.25, 0.85][tier]));
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.setViewOffset(w, h, 0, (bottom - top) / 2, w, h);
    camera.updateProjectionMatrix();
    // The whole board in view, between the top bar and the tools: find the distance that just fits.
    const corners = [];
    for (const x of [-W / 2 - 0.2, W / 2 + 0.2]) for (const z of [-H / 2 - 0.2, H / 2 + 0.2]) for (const y of [-0.1, 1.0]) corners.push(new T.Vector3(x, y, z));
    const my = 1 - (top + bottom) / h - 0.02, mx = 0.99;
    let lo = 6, hi = 160;
    const keepT = view.target.clone(), keepD = view.dist;
    view.target.copy(base.target);
    for (let k = 0; k < 22; k++) {
      view.dist = (lo + hi) / 2;
      const off = shake; shake = 0; aim(); shake = off;
      camera.clearViewOffset(); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
      const fits = corners.every(c => { const p = c.clone().project(camera); return Math.abs(p.x) <= mx && Math.abs(p.y) <= my; });
      if (fits) hi = view.dist; else lo = view.dist;
    }
    camera.setViewOffset(w, h, 0, (bottom - top) / 2, w, h);
    camera.updateProjectionMatrix();
    const zoom = keepD / base.dist;
    base.dist = hi;
    scene.fog.near = hi + 8; scene.fog.far = hi + 34;   // the fog is for the table's far edge, never the board
    view.target.copy(keepT);
    view.dist = Number.isFinite(zoom) && tweens.length ? hi * zoom : hi;
    if (!tweens.length) view.target.copy(base.target);
  }
  function setTier(n) {
    tier = Math.max(0, Math.min(3, n));
    bloom.enabled = tier < 1;
    renderer.shadowMap.enabled = tier < 2;
    moon.castShadow = tier < 2;
    scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); });
    resize();
    opts.onStats?.({ fps: Math.round(fps), tier });
  }

  // ---------- showing a state ----------
  let shown = null;
  let quiet = true;   // no danger or hints on the floor until a raid is on
  function setOverlay(state, hints) {
    aCur.array.fill(0); aNext.array.fill(0); aHint.array.fill(0);
    if (state && state.status === 'play' && !quiet) {
      const now = threats(vault, state), next = nextThreats(vault, state);
      for (const i of [...now.seen, ...now.cam]) aCur.array[i] = 1;
      for (const i of [...next.seen, ...next.near, ...next.cam, ...next.laser]) aNext.array[i] = 1;
    }
    if (!quiet) for (const [i, kind] of hints || []) aHint.array[i] = kind;
    aCur.needsUpdate = aNext.needsUpdate = aHint.needsUpdate = true;
  }
  function setLaser(l, on, dead) {
    const lit = on && !dead;
    l.beam.visible = l.halo.visible = lit;
    l.ghost.visible = !lit;
    for (const d of l.dots) d.material = dead ? deadDot : lit ? litDot : dimDot;
    l.on = lit;
  }
  const litDot = glow(COLORS.red, 2.5), dimDot = glow(COLORS.red, 0.5), deadDot = glow(0x39456f, 1);
  const litLens = glow(COLORS.red, 2.6), deadLens = glow(0x39456f, 1);
  const cheb = (a, b) => Math.max(Math.abs(a % W - b % W), Math.abs((a / W | 0) - (b / W | 0)));
  const empHits = (state, i) => state.emp.some(e => cheb(e[0], i) <= 2);

  // Everything exactly as `state` says, with no animation.
  function sync(state, gadgets = [], hints = null) {
    shown = state;
    thief.place(state.p, thief.dir);
    thief.root.visible = true;
    guards.forEach((g, j) => g.place(state.g[j * 6], state.g[j * 6 + 1]));
    cams.forEach(c => { c.angle = ROT[camDir(c, state.t)]; c.yaw.rotation.y = c.angle; c.lens.material = empHits(state, c.at) ? deadLens : litLens; });
    lasers.forEach(l => setLaser(l, !l.blink || ((state.t + l.phase) % 4) < 2, l.cells.some(i => empHits(state, i))));
    doors.forEach((d, j) => { d.open = state.doors[j] === 9; d.g.position.y = d.open ? -(WALL_H + 0.02) : -0.02; d.lamp.material = d.lamp2.material = d.open ? openLamp : shutLamp; });
    if (safeDoor) { safeDoor.rotation.y = state.loot ? -2.1 : 0; safe.userData.inside.material.color.set(COLORS.gold).multiplyScalar(state.loot ? 2.6 : 0); safeLight.intensity = state.loot ? 3.5 : 1.2; }
    const seen = new Map(revealed(vault, state, gadgets).map(r => [r.at, r.real]));
    for (const p of plates) stylePlate(p, !seen.has(p.at) ? 'cue' : seen.get(p.at) ? 'real' : 'fake');
    // the decoy stays while a guard is on his way to it, then goes dark
    const baits = new Set();
    guards.forEach((g, j) => { setBadge(g, state.status === 'play' ? modeBadge(state.g[j * 6 + 3]) : g.badge.kind); if (state.g[j * 6 + 3] === 1) baits.add(state.g[j * 6 + 5]); });
    for (const p of decoys) if (!p.dying && (p.landed || state.t === 0) && !baits.has(p.at)) { p.dying = true; p.lamp.material = puckDead; }
    setSmoke(state.smoke);
    setAlarm(state.alarm > 0 && state.status === 'play');
    setOverlay(state, hints);
  }
  const shutLamp = glow(0x8c9ac8, 1.3), openLamp = glow(COLORS.cyan, 2.2);
  function stylePlate(p, kind, pop = false) {
    if (kind === p.shown) return;
    p.shown = kind;
    p.m.material.map = kind === 'real' ? plateTex : cueTex;
    p.m.material.color.set(kind === 'real' ? COLORS.red : kind === 'fake' ? COLORS.cyan : 0xa9b6e0).multiplyScalar(kind === 'real' ? 1.8 : 1);
    p.m.material.opacity = kind === 'real' ? 0.95 : kind === 'fake' ? 0.2 : 0.3;
    if (pop) tween(0.4, k => p.m.scale.setScalar(1 + 0.4 * Math.sin(Math.PI * k)));
  }
  function setAlarm(on) {
    if (on === alarm) return;
    alarm = on;
    opts.onFx?.(on ? 'alarm' : 'calm');
  }

  // ---------- acting out a turn ----------
  function walk(a, to, dir, dur, clip, hop = 0.05) {
    const from = a.root.position.clone(), end = pos(to);
    // Two cells at once (a guard running): go round the corner, not through it.
    const fx = Math.round(from.x + (W - 1) / 2), fy = Math.round(from.z + (H - 1) / 2), tx = to % W, ty = to / W | 0;
    let via = null;
    if (fx !== tx && fy !== ty) via = tileAt(tx, fy) !== '#' ? pos(fy * W + tx) : pos(ty * W + fx);
    const r0 = a.root.rotation.y, r1 = r0 + Math.atan2(Math.sin(ROT[dir] - r0), Math.cos(ROT[dir] - r0));
    a.play(clip);
    a.cell = to; a.dir = dir;
    return tween(dur, k => {
      if (via) { if (k < 0.5) a.root.position.lerpVectors(from, via, k * 2); else a.root.position.lerpVectors(via, end, k * 2 - 1); }
      else a.root.position.lerpVectors(from, end, k);
      a.root.position.y = Math.sin(Math.PI * k) * hop;
      a.root.rotation.y = r0 + (r1 - r0) * Math.min(1, k * 2.2);
    }).then(() => { a.root.position.copy(end); a.root.rotation.y = ROT[dir]; });
  }
  const turnTo = (a, dir, dur = 0.14) => { const r0 = a.root.rotation.y, d = Math.atan2(Math.sin(ROT[dir] - r0), Math.cos(ROT[dir] - r0)); a.dir = dir; return tween(dur, k => { a.root.rotation.y = r0 + d * k; }); };
  const dirTo = (from, to) => { const dx = to % W - from % W, dy = (to / W | 0) - (from / W | 0); return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0); };

  async function act(e, prev, next, d, speed, gadgets = []) {
    if (e.e === 'move') {
      const slow = speed <= 1 && laserCells.has(e.to);
      if (slow) { scale = 0.3; camTo(pos(e.to), 0.62, 0.12); opts.onFx?.('slow'); }
      await walk(thief, e.to, e.dir, slow ? d * 1.5 : d, next.alarm || prev.alarm ? 'run' : 'sneak');
      if (slow) { scale = 1; camTo(null, 1, 0.3); }
      thief.play('idle');
    } else if (e.e === 'wait') {
      await tween(d * 0.8, k => { thief.model.scale.y = thief.model.scale.x * (1 - 0.07 * Math.sin(Math.PI * k)); });
    } else if (e.e === 'pick' || e.e === 'open') {
      const door = doors[doorCells.indexOf(e.at)];
      await turnTo(thief, dirTo(prev.p, e.at), 0.1);
      if (e.e === 'pick') await tween(d, k => { door.g.position.x = pos(e.at).x + Math.sin(k * 25) * 0.025 * (1 - k); });
      else {
        if (gadgets.includes('lockpick') && prev.doors[doorCells.indexOf(e.at)] === 0) {
          // the lockpick: one quick twist, sparks at the lock, and the door drops
          opts.onFx?.('lockpick');
          const lock = pos(e.at, 0.38).lerp(pos(prev.p, 0.38), 0.42);
          burstSparks(lock);
          await tween(0.16 / speed, k => { door.g.rotation.z = Math.sin(k * Math.PI * 3) * 0.04 * (1 - k); });
          door.g.rotation.z = 0;
        }
        door.lamp.material = door.lamp2.material = openLamp;
        await tween(Math.max(d, 0.4 / speed), k => { door.g.position.y = -0.02 - (WALL_H) * k; }, easeInOut);
        door.open = true;
      }
    } else if (e.e === 'loot') {
      await turnTo(thief, dirTo(prev.p, e.at), 0.12);
      const f = 1 / Math.max(1, speed);
      camTo(pos(e.at), 0.6, 0.4 * f);
      await wait(0.25 * f);
      opts.onFx?.('safe');
      safe.userData.inside.material.color.set(COLORS.gold).multiplyScalar(2.6);
      const from = pos(e.at, 0.45).add(new T.Vector3(DX[safeFace] * 0.5, 0, DY[safeFace] * 0.5));
      tween(0.7 * f, k => { safeDoor.rotation.y = -2.1 * k; safeLight.intensity = 1.2 + 9 * Math.sin(Math.PI * Math.min(1, k * 1.1)) + 2.3 * k; }, easeOut);
      await wait(0.22 * f);
      burstCoins(from, safeFace);
      thief.play('win', { once: true });
      await wait(0.95 * f);
      thief.play('idle');
      await camTo(null, 1, 0.4 * f);
    } else if (e.e === 'emp') {
      opts.onFx?.('emp');
      burstSparks(pos(e.at, 0.55), 0.8);
      ring.position.copy(pos(e.at, 0.06));
      await tween(0.45 / speed, k => { ring.scale.setScalar(0.2 + 2.6 * k); ring.material.opacity = 1 - k; thiefLight.intensity = 1.6 + 8 * (1 - k); }, easeOut);
      thiefLight.intensity = 1.6;
    } else if (e.e === 'bait') {
      // the thief tosses the decoy in an arc; it lands, blinks and calls the nearest guard
      await turnTo(thief, dirTo(prev.p, e.at), 0.1);
      const p = makePuck(e.at), from = thief.root.position.clone().setY(0.95), to = pos(e.at), f = 1 / Math.max(1, speed);
      p.g.position.copy(from);
      await tween(0.45 * f, k => { p.g.position.lerpVectors(from, to, k); p.g.position.y = from.y * (1 - k) + Math.sin(Math.PI * k) * 1.2; p.g.rotation.x = k * 7; }, k => k);
      p.g.position.copy(to);
      p.g.rotation.x = 0;
      p.landed = true;
      p.t0 = clock;
      opts.onFx?.('decoy');
      shake = Math.max(shake, 0.06);
      if (e.guard >= 0) setBadge(guards[e.guard], '؟');
      await wait(0.15 * f);
    } else if (e.e === 'smoke') {
      opts.onFx?.('smoke');
      setSmoke(next.smoke);
      await wait(0.3 / speed);
    } else if (e.e === 'guard') {
      const g = guards[e.i];
      setBadge(g, modeBadge(e.mode));
      if (e.to !== e.from) await walk(g, e.to, e.dir, d, e.mode === 3 ? 'run' : 'walk', 0.03);
      else await turnTo(g, e.dir, d * 0.6);
      if (e.mode !== 3) g.play(vaultGuardMoves[e.i] ? 'walk' : 'idle');
    } else if (e.e === 'cam') {
      const c = cams[e.i], r0 = c.yaw.rotation.y, r1 = r0 + Math.atan2(Math.sin(ROT[e.dir] - r0), Math.cos(ROT[e.dir] - r0));
      await tween(d, k => { c.yaw.rotation.y = r0 + (r1 - r0) * k; });
    } else if (e.e === 'laser') {
      const l = lasers[e.i];
      setLaser(l, e.on, l.cells.some(i => empHits(next, i)));
    }
  }
  // Guards who patrol keep their walking clip between steps, so a patrol doesn't stutter.
  const vaultGuardMoves = (vault.defenses || []).filter(d => d.t === 'guard').map(d => d.path.length > 1);
  guards.forEach((g, j) => { if (vaultGuardMoves[j]) g.play('walk', { speed: 0.9 }); });

  async function finale(e, next, speed) {
    const f = 1 / Math.max(1, speed);
    if (e.e === 'alarm') {
      setAlarm(true);
      guards.forEach(g => setBadge(g, '!'));
      shake = 0.5;
      thief.play('run');
      await wait(0.45 * f);
    } else if (e.e === 'caught' || e.e === 'timeout') {
      opts.onFx?.('caught');
      setOverlay(null);
      let g = guards[e.i];
      if (!g && guards.length) g = guards.reduce((a, b) => (a.root.position.distanceTo(thief.root.position) < b.root.position.distanceTo(thief.root.position) ? a : b));
      const focus = thief.root.position.clone();
      if (g) { focus.lerp(g.root.position, 0.5); turnTo(g, dirTo(g.cell, thief.cell), 0.15); g.play('catch'); if (g.cell !== thief.cell) turnTo(thief, dirTo(thief.cell, g.cell), 0.2); }
      shake = 0.35;
      thief.play('caught');
      camTo(focus, 0.5, 0.6 * f);
      await wait(1.5 * f);
    } else if (e.e === 'escape' || e.e === 'fled') {
      opts.onFx?.(e.e);
      setOverlay(null);
      if (e.e === 'escape') { burstCoins(thief.root.position.clone().setY(0.6), 0); thief.play('win', { once: true }); camTo(thief.root.position, 0.62, 0.5 * f); await wait(1.3 * f); }
      await tween(0.35 * f, k => { thief.root.scale.setScalar(1 - k); });
      thief.root.visible = false;
      thief.root.scale.setScalar(1);
    }
    if (e.e !== 'alarm') await camTo(null, 1, 0.7 * f);
  }

  async function playTurn(prev, next, events, gadgets = [], speed = 1) {
    const a = [], b = [], end = [];
    for (const e of events) (['guard', 'cam', 'laser', 'emp_end', 'smoke_end'].includes(e.e) ? b : ['alarm', 'caught', 'escape', 'fled', 'timeout'].includes(e.e) ? end : a).push(e);
    const d = 0.24 / speed;
    setOverlay(null);
    await Promise.all(a.map(e => act(e, prev, next, d, speed, gadgets)));
    if (b.length) await Promise.all(b.map(e => act(e, prev, next, d * 0.85, speed, gadgets)));
    if (disposed) return;
    const out = next.status === 'escaped' || next.status === 'escaped_alarm' || next.status === 'fled';
    if (!end.some(e => e.e === 'caught' || e.e === 'timeout') && !out) sync(next, gadgets);
    for (const e of end) await finale(e, next, speed);
    if (next.status !== 'play') setAlarm(false);
  }

  // The thief comes down a rope from the ceiling onto the entry.
  async function scan(state, gadgets, dur) {
    const seen = new Map(revealed(vault, state, gadgets).map(r => [r.at, r.real]));
    const z0 = H / 2 + 0.25, z1 = -H / 2 - 0.25, done = new Set();
    scanFloor.visible = scanWall.visible = true;
    opts.onFx?.('scan');
    await tween(dur, k => {
      const edge = z0 + (z1 - z0) * k, a = Math.min(1, k * 8, (1 - k) * 8);
      scanFloor.position.set(0, 0.03, edge + 0.9);
      scanWall.position.set(0, 0.45, edge);
      scanFloor.material.opacity = 0.75 * a;
      scanWall.material.opacity = 0.85 * a;
      for (const p of plates) if (!done.has(p) && pos(p.at).z >= edge) { done.add(p); stylePlate(p, seen.get(p.at) ? 'real' : 'fake', true); }
    }, k => k);
    scanFloor.visible = scanWall.visible = false;
  }

  async function intro(state, gadgets, fast) {
    const goggles = gadgets.includes('goggles'), bare = gadgets.filter(g => g !== 'goggles');
    sync(state, bare);
    setOverlay(null);
    const at = pos(state.p), top = 7.5;
    thief.dir = 0;
    thief.root.rotation.y = ROT[0];
    if (fast) { if (goggles) await scan(state, gadgets, 0.6); sync(state, gadgets); return; }
    rope.visible = true;
    thief.play('rope');
    view.target.copy(base.target).lerp(at, 0.75);
    view.dist = base.dist * 0.55;
    thief.root.position.set(at.x, 4.2, at.z);
    const hang = y => { const hand = y + 1.42; rope.scale.y = top - hand; rope.position.set(at.x, (top + hand) / 2, at.z); };
    hang(4.2);
    await wait(0.25);
    camTo(null, 1, 1.5);
    await tween(1.25, k => { const y = 4.2 * (1 - k); thief.root.position.y = y; hang(y); }, k => 1 - (1 - k) ** 2);
    thief.root.position.y = 0;
    thief.play('idle', { fade: 0.25 });
    shake = 0.12;
    opts.onFx?.('land');
    await tween(0.35, k => { rope.scale.y = Math.max(0.01, (top - 1) * (1 - k)); rope.position.y = top - rope.scale.y / 2; });
    rope.visible = false;
    await wait(0.15);
    if (goggles) await scan(state, gadgets, 1.1);
    sync(state, gadgets);
  }

  function pick(clientX, clientY) {
    const r = renderer.domElement.getBoundingClientRect();
    const ray = new T.Raycaster();
    ray.setFromCamera(new T.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), new T.Vector3());
    if (!hit) return -1;
    const x = Math.round(hit.x + (W - 1) / 2), y = Math.round(hit.z + (H - 1) / 2);
    return x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x;
  }
  // Where a cell is on the screen, and how wide it is there (for ?debug: every cell should be 44 points or more).
  function cellRect(i) {
    const p = pos(i).project(camera), q = pos(i).add(new T.Vector3(1, 0, 0)).project(camera);
    return { x: (p.x + 1) / 2 * size.w, y: (1 - p.y) / 2 * size.h, w: Math.abs(q.x - p.x) / 2 * size.w };
  }

  // ---------- the loop ----------
  const ZAXIS = new T.Vector3(0, 0, 1), v3 = new T.Vector3();
  let raf = 0, last = performance.now(), fps = 60, frames = 0, since = 0, warm = 0, drawn = { calls: 0, triangles: 0 };
  const o = new T.Object3D();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const real = Math.min(0.05, (now - last) / 1000), dt = real * scale;
    last = now;
    clock += dt;
    for (let k = tweens.length - 1; k >= 0; k--) {
      const t = tweens[k];
      t.t += dt;
      const p = Math.min(1, t.t / t.dur);
      t.fn(t.ease(p));
      if (p >= 1) { tweens.splice(k, 1); t.res(); }
    }
    thief.mixer.update(dt);
    for (const g of guards) g.mixer.update(dt);
    overlayMat.uniforms.uTime.value = clock;
    const beat = 0.5 + 0.5 * Math.sin(clock * 3);
    thief.ring.material.opacity = 0.55 + 0.35 * beat;
    for (const a of exitMarks) a.material.opacity = 0.5 + 0.45 * beat;
    for (const l of lasers) if (l.on) l.halo.material.opacity = 0.12 + 0.07 * Math.sin(clock * 9 + l.phase);
    for (const p of plates) if (p.shown === 'real') p.m.material.opacity = 0.7 + 0.25 * beat;
    siren.intensity += ((alarm ? 26 : 0) - siren.intensity) * Math.min(1, real * 8);
    if (alarm) siren.position.set(Math.cos(clock * 5) * 2.6, 3.2, Math.sin(clock * 5) * 3.4);
    hemi.intensity = alarm ? 0.6 + 0.2 * Math.sin(clock * 10) : 0.8;
    shake *= Math.max(0, 1 - real * 5);
    for (let k = 0; k < COINS; k++) {
      const c = coin[k];
      if (c.life > 0) {
        c.life -= dt;
        c.v.y -= 9 * dt;
        c.p.addScaledVector(c.v, dt);
        if (c.p.y < 0.03) { c.p.y = 0.03; c.v.y *= -0.42; c.v.x *= 0.7; c.v.z *= 0.7; }
        o.position.copy(c.p); o.rotation.set(c.r.x + clock * 9, c.r.y, c.r.z + clock * 7); o.scale.setScalar(Math.min(1, c.life * 3));
      } else o.scale.setScalar(0);
      o.updateMatrix();
      coins.setMatrixAt(k, o.matrix);
    }
    coins.instanceMatrix.needsUpdate = true;
    for (let k = 0; k < SPARKS; k++) {
      const s = spark[k];
      if (s.life > 0) {
        s.life -= dt;
        s.v.y -= 7 * dt;
        s.p.addScaledVector(s.v, dt);
        o.position.copy(s.p);
        o.quaternion.setFromUnitVectors(ZAXIS, v3.copy(s.v).normalize());
        o.scale.setScalar(Math.max(0, Math.min(1, s.life * 5)));
      } else o.scale.setScalar(0);
      o.updateMatrix();
      sparkMesh.setMatrixAt(k, o.matrix);
    }
    sparkMesh.instanceMatrix.needsUpdate = true;
    for (let k = decoys.length - 1; k >= 0; k--) {
      const p = decoys[k];
      if (p.dying) {
        p.k -= real * 2.2;
        if (p.k <= 0) { board.remove(p.g); p.waves.forEach(w => w.material.dispose()); decoys.splice(k, 1); continue; }
        p.g.scale.setScalar(p.k);
      }
      p.lamp.visible = p.dying || !p.landed || Math.sin(clock * 14) > -0.3;
      p.waves.forEach((w, n) => {
        const ph = ((clock - p.t0) * 0.85 + n / 3) % 1;
        w.scale.setScalar(0.6 + 5.4 * ph);
        w.material.opacity = p.landed && !p.dying ? (1 - ph) * 0.6 : 0;
      });
    }
    for (let k = puffs.length - 1; k >= 0; k--) {
      const p = puffs[k];
      p.k += ((p.gone ? 0 : 1) - p.k) * Math.min(1, real * 5);
      if (p.gone && p.k < 0.02) { board.remove(p.sprite); p.sprite.material.dispose(); puffs.splice(k, 1); continue; }
      const c = pos(p.at);
      p.sprite.position.set(c.x + Math.sin(clock * 0.7 + p.seed) * 0.12, 0.4 + p.n * 0.3 + Math.sin(clock + p.seed) * 0.05, c.z + Math.cos(clock * 0.6 + p.seed) * 0.12);
      p.sprite.scale.setScalar((1.25 + p.n * 0.2) * (0.6 + 0.4 * p.k));
      p.sprite.material.opacity = 0.8 * p.k;
      p.sprite.material.rotation = clock * 0.15 + p.seed;
    }
    aim();
    drawn = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    renderer.info.reset();
    composer.render();
    // Quality follows the frame rate: a few seconds under 40 and the next thing goes (bloom, then shadows, then sharpness).
    frames++; since += real; warm += real;
    if (since >= 2.5) {
      fps = frames / since; frames = 0; since = 0;
      if (warm > 5 && fps < 40 && tier < 3 && !document.hidden) setTier(tier + 1);
      opts.onStats?.({ fps: Math.round(fps), tier });
    }
  }
  resize();
  const onResize = () => resize();
  window.addEventListener('resize', onResize);
  raf = requestAnimationFrame(frame);
  opts.onProgress?.(1);

  return {
    setQuiet(q) { quiet = q; setOverlay(shown); },
    // The space kept free above and below the board (the menu and the result need more than a raid); the camera glides to the new fit.
    // (No glide when the intro is about to move the camera itself: two moves at once fight.)
    setPads(top, bottom, glide = true) {
      if (opts.padTop === top && opts.padBottom === bottom) return;
      opts.padTop = top; opts.padBottom = bottom;
      const t0 = view.target.clone(), d0 = view.dist;
      resize();
      if (!glide) return;
      view.target.copy(t0); view.dist = d0;
      camTo(null, 1, 0.45);
    },
    sync, playTurn, intro, pick, cellRect, setHints: hints => setOverlay(shown, hints), setTier, resize,
    get tier() { return tier; }, get fps() { return Math.round(fps); },
    three: { T, scene, camera, renderer },
    info: () => ({ ...renderer.info.memory, ...drawn }),
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      for (const t of tweens.splice(0)) t.res();
      const seen = new Set();
      const drop = m => { if (!m || seen.has(m)) return; seen.add(m); for (const v of Object.values(m)) if (v?.isTexture) v.dispose(); m.dispose(); };
      scene.traverse(obj => { obj.geometry?.dispose(); [].concat(obj.material || []).forEach(drop); });
      for (const f of [thiefFile, guardFile]) f?.scene.traverse(obj => { obj.geometry?.dispose(); [].concat(obj.material || []).forEach(drop); });
      [litDot, dimDot, deadDot, litLens, deadLens, shutLamp, openLamp, puckMat, puckLamp, puckDead].forEach(drop);
      [puckGeo, puckLampGeo, puckRimGeo].forEach(g => g.dispose());
      [ringTex, arrowTex, cueTex, plateTex, puffTex, askTex, alertTex, scanTex, curtainTex].forEach(t => t.dispose());
      bloom.dispose?.(); composer.dispose?.(); renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
