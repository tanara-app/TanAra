/*
  «باغ» (beta, first prototype, 2026-11-15): a small Persian garden (چهارباغ) as a living 3D model,
  opened from «بیشتر» (#/garden). Full screen, no bottom bar. Design and plan in GARDEN.md.

  Everything is built in code with three.js (loaded from the CDN only when this page opens): no
  pictures, so the light, colours and style are the same for every part, and anything can move.
  This first screen only answers "does it feel good?": one pomegranate tree that grows a step each
  time the water button is tapped (six steps, sapling to fruit), water running in the four
  channels, a fountain in the pool, leaves in the breeze. Drag turns the garden, pinch (or the
  wheel) zooms. Nothing is saved yet and nothing is tied to logging yet.
*/
import { icon } from './dom.js';

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';
const STEPS = 6; // waterings from a sapling to a tree with fruit

let live = null;

export function renderGarden(root) {
  if (live && root.contains(live.el)) return;
  stop();
  document.body.classList.add('garden-mode');
  root.innerHTML = `
    <section class="garden">
      <div class="garden-stage"></div>
      <button class="garden-back" data-back aria-label="برگشت">${icon.chevR}</button>
      <button class="garden-water" data-water aria-label="آب بده">${DROP}</button>
      <p class="garden-wait">در حال بارگذاری…</p>
    </section>`;
  const el = root.querySelector('.garden');
  el.querySelector('[data-back]').onclick = () => location.replace('#/tools');
  const onHash = () => { if (location.hash !== '#/garden') stop(); };
  window.addEventListener('hashchange', onHash);
  const mine = live = { el, onHash, dispose: null };
  import(THREE_URL).then(THREE => { if (live === mine) start(THREE, el, mine); })
    .catch(() => { el.querySelector('.garden-wait').textContent = 'بارگذاری نشد؛ اینترنت را بررسی کن.'; });
}

function stop() {
  if (!live) return;
  window.removeEventListener('hashchange', live.onHash);
  live.dispose?.();
  live = null;
  document.body.classList.remove('garden-mode');
}

const DROP = '<svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true"><path d="M24 6C18 15 11 22 11 30a13 13 0 0 0 26 0c0-8-7-15-13-24z" fill="#5cc8f0" stroke="#1d6f99" stroke-width="2.5" stroke-linejoin="round"/><path d="M18 30a6 6 0 0 0 5 6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/></svg>';

// a small seeded random, so the tree and the flowers are the same every time
function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function start(THREE, el, L) {
  const stage = el.querySelector('.garden-stage');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 200);
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });
  const shadowy = m => { m.castShadow = true; m.receiveShadow = true; return m; };

  // ---- light: warm sun from the upper left, a sky-and-grass fill ----
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x5d7f3e, 1.3));
  const sun = new THREE.DirectionalLight(0xffe2b8, 2.4);
  sun.position.set(-7, 12, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  // ---- the garden: a floating block of earth, grass on top, a stone path round the edge ----
  const S = 10, H = 1.6;              // width of the garden, depth of the earth under it
  const garden = new THREE.Group();
  scene.add(garden);
  const earth = new THREE.Mesh(new THREE.BoxGeometry(S, H, S), mat(0x9a6a43));
  earth.position.y = -H / 2 - 0.2;
  earth.receiveShadow = true;
  garden.add(earth);
  const rim = shadowy(new THREE.Mesh(new THREE.BoxGeometry(S, 0.24, S), mat(0xe8d2a6)));
  rim.position.y = -0.08;
  garden.add(rim);
  const W = 0.7;                       // width of a water channel
  const lawn = (x, z, w, d) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), mat(0x7cc45a));
    m.position.set(x, 0, z); m.receiveShadow = true; garden.add(m);
  };
  const q = (S - 1.2 - W - 0.5) / 2;   // a quarter's side
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) lawn(sx * (q / 2 + W / 2 + 0.25), sz * (q / 2 + W / 2 + 0.25), q, q);

  // the four channels and the pool where they meet, with running water
  const waterTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#3fb4dd'; g.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 18; i++) {
      g.fillStyle = `rgba(255,255,255,${0.18 + (i % 3) * 0.08})`;
      const y = (i * 61) % 256, x = (i * 23) % 50;
      g.beginPath(); g.ellipse(x + 7, y, 6, 2 + (i % 2) * 2, 0, 0, Math.PI * 2); g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const waterMat = new THREE.MeshStandardMaterial({ map: waterTex, roughness: 0.15, metalness: 0.05, emissive: 0x0a3d55, emissiveIntensity: 0.25 });
  const channels = [];
  const stone = mat(0xe3c99a);
  const half = S / 2 - 0.6;
  for (const [ax, dir] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]]) {
    const len = half - 1.15;
    const tex = waterTex.clone(); tex.needsUpdate = true; tex.repeat.set(1, len / 1.4);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, len), waterMat.clone());
    m.material.map = tex;
    m.rotation.x = -Math.PI / 2;
    const mid = dir * (1.15 + len / 2);
    if (ax === 'x') { m.rotation.z = Math.PI / 2 * dir; m.position.set(mid, 0.06, 0); }
    else { m.rotation.z = dir > 0 ? Math.PI : 0; m.position.set(0, 0.06, mid); }
    m.receiveShadow = true;
    garden.add(m);
    channels.push(tex);
    for (const side of [-1, 1]) { // a stone edge on each side of the channel
      const e = shadowy(new THREE.Mesh(new THREE.BoxGeometry(ax === 'x' ? len : 0.16, 0.22, ax === 'x' ? 0.16 : len), stone));
      if (ax === 'x') e.position.set(mid, 0.1, side * (W / 2 + 0.08)); else e.position.set(side * (W / 2 + 0.08), 0.1, mid);
      garden.add(e);
    }
  }
  const poolRim = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.45, 0.42, 8), stone));
  poolRim.position.y = 0.12; poolRim.rotation.y = Math.PI / 8;
  garden.add(poolRim);
  const poolTex = waterTex.clone(); poolTex.needsUpdate = true; poolTex.repeat.set(2, 2);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1.16, 8), waterMat.clone());
  pool.material.map = poolTex;
  pool.rotation.x = -Math.PI / 2; pool.rotation.z = Math.PI / 8; pool.position.y = 0.3;
  garden.add(pool);
  const spout = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.5, 8), stone));
  spout.position.y = 0.5; garden.add(spout);

  // the fountain: drops that rise from the spout and fall back into the pool
  const N = 70, drops = new Float32Array(N * 3), vel = [];
  const r0 = rng(7);
  const resetDrop = (i, t) => {
    const a = r0() * Math.PI * 2, s = 0.35 + r0() * 0.35;
    vel[i] = { vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 2.3 + r0() * 0.8, t0: t - r0() * 1.2 };
  };
  for (let i = 0; i < N; i++) resetDrop(i, 0);
  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute('position', new THREE.BufferAttribute(drops, 3));
  const fountain = new THREE.Points(dropGeo, new THREE.PointsMaterial({ color: 0xd9f4ff, size: 0.09, transparent: true, opacity: 0.9 }));
  garden.add(fountain);

  // cypresses in the four far corners, low hedges along the edge, and flowers in the beds
  const cypress = (x, z, h) => {
    const g = new THREE.Group();
    const trunk = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.4, 6), mat(0x7a4a2a)));
    trunk.position.y = 0.3; g.add(trunk);
    const top = shadowy(new THREE.Mesh(new THREE.ConeGeometry(0.42, h, 7), mat(0x2f7a3c)));
    top.position.y = 0.45 + h / 2; g.add(top);
    g.position.set(x, 0, z); garden.add(g); return top;
  };
  const cypresses = [];
  const c = S / 2 - 1;
  for (const [x, z] of [[-c, -c], [c, -c], [-c, c]]) cypresses.push(cypress(x, z, 2.4)); // not the near corner: the tree is there
  const r = rng(11);
  const petals = [0xf26d8a, 0xffd04d, 0xffffff, 0xb784f0, 0xff8b4d];
  const flowerGeo = new THREE.IcosahedronGeometry(0.11, 0);
  const stemGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.22, 4);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1]]) {
    const cx = sx * (q / 2 + W / 2 + 0.25), cz = sz * (q / 2 + W / 2 + 0.25);
    for (let i = 0; i < 26; i++) {
      const x = cx + (r() - 0.5) * (q - 0.6), z = cz + (r() - 0.5) * (q - 0.6);
      const stem = new THREE.Mesh(stemGeo, mat(0x3f8a34)); stem.position.set(x, 0.26, z); garden.add(stem);
      const f = new THREE.Mesh(flowerGeo, mat(petals[i % petals.length])); f.position.set(x, 0.39, z); f.castShadow = true; garden.add(f);
    }
  }

  // ---- the pomegranate tree, in the near bed; built full size once, shown as much as it has grown ----
  const tree = new THREE.Group();
  tree.position.set(q / 2 + W / 2 + 0.25, 0.15, q / 2 + W / 2 + 0.25);
  garden.add(tree);
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.08, 10), mat(0x6e4a2c));
  soil.position.y = 0.04; soil.receiveShadow = true; tree.add(soil);
  const bark = mat(0x8a5a33), leafMats = [0x4f9a3e, 0x5fb04a, 0x6cbd52, 0x478c38].map(c2 => mat(c2));
  const fruitMat = mat(0xd8443a, { roughness: 0.5 }), blossomMat = mat(0xff7a59);
  const parts = []; // { obj, from, to } shown between two growth values
  const rt = rng(3);
  const leafGeo = new THREE.IcosahedronGeometry(1, 0);
  function branch(parent, len, rad, depth, from) {
    const span = 0.16;
    const g = new THREE.Group(); parent.add(g);
    const wood = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.68, rad, len, 6), bark));
    wood.position.y = len / 2; g.add(wood);
    parts.push({ obj: g, from, to: from + span, kind: 'wood' });
    const tip = new THREE.Group(); tip.position.y = len; g.add(tip);
    if (depth === 0) {
      const n = 3;
      for (let i = 0; i < n; i++) {
        const leaf = shadowy(new THREE.Mesh(leafGeo, leafMats[(rt() * leafMats.length) | 0]));
        const s = 0.42 + rt() * 0.25;
        leaf.position.set((rt() - 0.5) * 0.5, rt() * 0.3, (rt() - 0.5) * 0.5);
        leaf.userData.s = s;
        const holder = new THREE.Group(); holder.add(leaf); tip.add(holder);
        parts.push({ obj: holder, from: from + 0.08 + rt() * 0.12, to: from + 0.3 + rt() * 0.1, kind: 'leaf', phase: rt() * 6 });
      }
      if (rt() < 0.8) { // blossom at step 4, fruit from step 5
        const a = rt() * Math.PI * 2; // hanging at the crown's edge, where it shows
        const p = new THREE.Vector3(Math.cos(a) * 0.95, -0.45 + rt() * 0.2, Math.sin(a) * 0.95);
        const bl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), blossomMat); bl.position.copy(p); tip.add(bl);
        parts.push({ obj: bl, from: 0.6, to: 0.68, until: 0.82, kind: 'blossom' });
        const fr = shadowy(new THREE.Mesh(new THREE.IcosahedronGeometry(0.21, 1), fruitMat)); fr.position.copy(p); tip.add(fr);
        parts.push({ obj: fr, from: 0.8, to: 0.97, kind: 'fruit' });
      }
      return;
    }
    const kids = depth >= 3 ? 2 : 3;
    for (let i = 0; i < kids; i++) {
      const k = new THREE.Group(); tip.add(k);
      k.rotation.y = (i / kids) * Math.PI * 2 + rt() * 0.8;
      k.rotation.z = 0.45 + rt() * 0.35;
      branch(k, len * (0.66 + rt() * 0.1), rad * 0.62, depth - 1, from + span * 0.8);
    }
  }
  branch(tree, 1.25, 0.2, 3, 0);
  // a sapling's few leaves on top of the young trunk, gone once the crown has grown
  for (let i = 0; i < 4; i++) {
    const leaf = shadowy(new THREE.Mesh(leafGeo, leafMats[i % leafMats.length]));
    leaf.userData.s = 0.42;
    leaf.position.set(Math.cos(i * 1.7) * 0.22, 1.2 + (i % 2) * 0.18, Math.sin(i * 1.7) * 0.22);
    const holder = new THREE.Group(); holder.add(leaf); tree.add(holder);
    parts.push({ obj: holder, from: 0.02, to: 0.14, until: 0.62, kind: 'leaf', phase: i });
  }
  tree.userData.parts = parts;

  // ---- camera: turns round the garden, keeps it in view on any screen ----
  const view = { yaw: Math.PI / 4, pitch: 0.62, zoom: 1.12, target: new THREE.Vector3(0.9, 0.2, 0.9) };
  const R = S * 0.78;
  function place() {
    const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const halfV = THREE.MathUtils.degToRad(camera.fov / 2), halfH = Math.atan(Math.tan(halfV) * camera.aspect);
    const dist = R / Math.sin(Math.min(halfV, halfH)) / view.zoom;
    camera.position.set(
      view.target.x + dist * Math.cos(view.pitch) * Math.sin(view.yaw),
      view.target.y + dist * Math.sin(view.pitch),
      view.target.z + dist * Math.cos(view.pitch) * Math.cos(view.yaw));
    camera.lookAt(view.target);
    camera.updateProjectionMatrix();
  }
  place();
  const ro = new ResizeObserver(place); ro.observe(stage);

  const pts = new Map();
  let pinch0 = null;
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
  cv.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    if (pts.size === 1) {
      view.yaw -= (e.clientX - p.x) * 0.008;
      view.pitch = Math.min(1.25, Math.max(0.3, view.pitch + (e.clientY - p.y) * 0.005));
    }
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0) view.zoom = Math.min(2.6, Math.max(0.8, pinch0.z * d / pinch0.d)); else pinch0 = { d, z: view.zoom };
    }
    place();
  });
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); view.zoom = Math.min(2.6, Math.max(0.8, view.zoom * (e.deltaY < 0 ? 1.08 : 0.93))); place(); }, { passive: false });

  // ---- watering: drops fall on the tree, the soil darkens, the tree grows one step ----
  let step = 1, grow = 0.05, wetUntil = 0;
  const rain = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0x7fd6ff, size: 0.12, transparent: true, opacity: 0.95 }));
  const rainPos = new Float32Array(40 * 3), rainV = [];
  rain.geometry.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  rain.visible = false; tree.add(rain);
  const btn = el.querySelector('[data-water]');
  btn.onclick = () => {
    const now = clock.elapsedTime;
    wetUntil = now + 2.2;
    const rr = rng((now * 1000) | 0);
    for (let i = 0; i < 40; i++) {
      rainV[i] = { x: (rr() - 0.5) * 1.2, z: (rr() - 0.5) * 1.2, t0: now + rr() * 0.6 };
    }
    rain.visible = true;
    step = step >= STEPS ? 1 : step + 1; // the prototype starts over after the last step
    btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
  };

  // ---- each frame ----
  const clock = new THREE.Clock();
  let raf = 0;
  const soilDry = new THREE.Color(0x6e4a2c), soilWet = new THREE.Color(0x3e2816);
  function frame() {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    for (const tx of channels) tx.offset.y -= 0.25 * dt;
    poolTex.offset.x += 0.12 * dt; poolTex.offset.y += 0.09 * dt;

    for (let i = 0; i < N; i++) { // fountain
      const v = vel[i], a = t - v.t0;
      if (a > 1.25) { resetDrop(i, t); continue; }
      const y = 0.75 + v.vy * a - 2.6 * a * a;
      if (a < 0) { drops[i * 3 + 1] = -5; continue; }
      drops[i * 3] = v.vx * a; drops[i * 3 + 1] = Math.max(0.3, y); drops[i * 3 + 2] = v.vz * a;
    }
    dropGeo.attributes.position.needsUpdate = true;

    const goal = step / STEPS; // the tree eases towards its step
    grow += (goal - grow) * Math.min(1, dt * 1.8);
    if (goal < grow - 0.3) grow = goal; // started over
    const g = grow;
    tree.scale.setScalar(0.45 + 0.55 * smooth(0, 1, g));
    for (const p of parts) {
      let s = smooth(p.from, p.to, g);
      if (p.until) s *= 1 - smooth(p.until - 0.04, p.until, g);
      if (p.kind === 'wood') p.obj.scale.set(Math.max(0.001, s), Math.max(0.001, s), Math.max(0.001, s));
      else {
        const k = (p.obj.children[0]?.userData.s || 1) * s;
        const leaf = p.obj.children[0];
        if (leaf) leaf.scale.setScalar(Math.max(0.001, k)); else p.obj.scale.setScalar(Math.max(0.001, s));
        if (p.kind === 'leaf') p.obj.rotation.z = Math.sin(t * 1.4 + p.phase) * 0.07; // breeze
      }
      p.obj.visible = s > 0.002;
    }
    tree.rotation.z = Math.sin(t * 0.9) * 0.012;
    cypresses.forEach((cy, i) => { cy.rotation.z = Math.sin(t * 1.1 + i) * 0.03; });

    const wet = t < wetUntil ? 1 : Math.max(0, 1 - (t - wetUntil) / 3);
    soil.material.color.copy(soilDry).lerp(soilWet, wet);
    if (rain.visible) {
      let any = false;
      for (let i = 0; i < 40; i++) {
        const d = rainV[i], a = t - d.t0, y = 4.2 - 7 * a * a;
        if (a < 0 || y < 0.1) { rainPos[i * 3 + 1] = -9; if (a < 0) any = true; continue; }
        any = true;
        rainPos[i * 3] = d.x; rainPos[i * 3 + 1] = y; rainPos[i * 3 + 2] = d.z;
      }
      rain.geometry.attributes.position.needsUpdate = true;
      if (!any) rain.visible = false;
    }
    renderer.render(scene, camera);
  }
  frame();
  el.querySelector('.garden-wait').remove();

  L.dispose = () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    scene.traverse(o => { o.geometry?.dispose(); [].concat(o.material || []).forEach(m => { m.map?.dispose(); m.dispose(); }); });
    renderer.dispose();
    renderer.domElement.remove();
  };
}
