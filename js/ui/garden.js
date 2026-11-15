/*
  «باغ» (beta, 2026-11-15): a small Persian garden (چهارباغ) as a living 3D model, opened from
  «بیشتر» (#/garden). Full screen, no bottom bar. Design and plan in GARDEN.md.

  The garden is an oasis («واحه»): a walled چهارباغ in the desert, mountains all round the horizon,
  and a qanat that brings its water from them. It lives on the phone's clock («باغ زنده»): the sky,
  the light and the shadows follow the real hour (domain/garden.js), and at night the lanterns are
  lit, fireflies come out, and there are stars and a moon. (`?hour=19.5` in the address shows any hour.)

  Everything is built in code with three.js (loaded from the CDN only when this page opens): no
  pictures, so the light, colours and style are the same for every part, and anything can move.
  This first screen only answers "does it feel good?": one pomegranate tree that grows a step each
  time the water button is tapped (six steps, sapling to fruit), water running in the four
  channels, a fountain in the pool, leaves in the breeze. Drag turns the garden, pinch (or the
  wheel) zooms. Nothing is saved yet and nothing is tied to logging yet.
*/
import { icon } from './dom.js';
import { fa } from '../lib/fa.js';
import { today } from '../lib/dates.js';
import * as store from '../data/store.js';
import { daylight, CELL, TREE_STEPS, SHAFTS, cellKey, dropsByDay, earned, spent, canWater, frontier, nextCell } from '../domain/garden.js';
import { makeLand } from './gardenLand.js';

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';

let live = null;

export function renderGarden(root) {
  if (live && root.contains(live.el)) { live.refresh?.(); return; }
  stop();
  document.body.classList.add('garden-mode');
  root.innerHTML = `
    <section class="garden">
      <div class="garden-stage"></div>
      <button class="garden-back" data-back aria-label="برگشت">${icon.chevR}</button>
      <div class="garden-today" aria-hidden="true">${SMALL_DROP.repeat(3)}${SMALL_DROP.replace('<i>', '<i class="move">')}</div>
      <button class="garden-water" data-water aria-label="آب بده">${DROP}<b class="garden-count"></b></button>
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

const SMALL_DROP = '<i><svg viewBox="0 0 14 18" width="14" height="18"><path d="M7 1.5C4.6 5 2 7.8 2 11a5 5 0 0 0 10 0c0-3.2-2.6-6-5-9.5z"/></svg></i>';

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
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 420);
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });
  const shadowy = m => { m.castShadow = true; m.receiveShadow = true; return m; };

  // ---- light: the sun (the moon at night) and a sky-and-ground fill; both follow the hour, below ----
  const hemi = new THREE.HemisphereLight(0xfff1dc, 0x5d7f3e, 1.3);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe2b8, 2.4);
  sun.position.set(-7, 12, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 90 });
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  // ---- the garden: grass beds on a stone floor, inside the wall ----
  const S = 10;                       // width of the garden
  const garden = new THREE.Group();
  scene.add(garden);
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

  // ---- the world round the garden: the desert and the mountains (gardenLand.js), the wall, and the qanat ----
  scene.fog = new THREE.Fog(0xf2dcb6, 70, 260);
  const uTime = { value: 0 };
  const land = makeLand(THREE, scene, uTime);
  const rw = rng(21);
  // the mud-brick wall, open where the qanat comes in, with a turquoise dome on each corner
  const brick = mat(0xd9b27d), cope = mat(0xecd3a4), tile = mat(0x2fb5b2, { roughness: 0.4 });
  const E = S / 2 - 0.15, WH = 0.6;   // where the wall stands, and its height
  const wallPiece = (ax, pos, mid, len) => {
    const w = shadowy(new THREE.Mesh(new THREE.BoxGeometry(ax === 'x' ? 0.3 : len, WH, ax === 'x' ? len : 0.3), brick));
    w.position.set(ax === 'x' ? pos : mid, WH / 2, ax === 'x' ? mid : pos); garden.add(w);
    const c = shadowy(new THREE.Mesh(new THREE.BoxGeometry(ax === 'x' ? 0.42 : len, 0.1, ax === 'x' ? len : 0.42), cope));
    c.position.set(w.position.x, WH + 0.05, w.position.z); garden.add(c);
  };
  wallPiece('x', E, 0, 9.4); wallPiece('z', E, 0, 9.4); wallPiece('z', -E, 0, 9.4);
  wallPiece('x', -E, 2.6, 4.2); wallPiece('x', -E, -2.6, 4.2);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const t = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 1, 8), brick));
    t.position.set(x * E, 0.5, z * E); garden.add(t);
    const d = shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), tile));
    d.position.set(x * E, 1, z * E); garden.add(d);
  }
  {
    const len = 11.4, mid = -S / 2 - len / 2;
    const tex = waterTex.clone(); tex.needsUpdate = true; tex.repeat.set(1, len / 1.4);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, len), waterMat.clone());
    m.material.map = tex; m.rotation.x = -Math.PI / 2; m.rotation.z = Math.PI / 2; m.position.set(mid, -0.12, 0);
    scene.add(m); channels.push(tex);
    for (const side of [-1, 1]) {
      const e = shadowy(new THREE.Mesh(new THREE.BoxGeometry(len, 0.18, 0.14), stone));
      e.position.set(mid, -0.11, side * 0.37); scene.add(e);
    }
    const mound = mat(0xd6b077), hole = mat(0x4a3524);
    for (const [x, z] of SHAFTS) {
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.2, 0.5, 8), mound); a.position.set(x, 0.05, z); a.receiveShadow = true; scene.add(a);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 8), hole); b.position.set(x, 0.31, z); scene.add(b);
    }
  }

  // ---- the sky: a dome that follows the camera, with stars and a moon for the night ----
  const skyU = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(380, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 d; void main(){ vec3 n = normalize(d); float s = max(dot(n, sunDir), 0.0); vec3 c = mix(hor, top, pow(clamp(n.y, 0.0, 1.0), 0.3)) + sunCol * (pow(s, 1400.0) * 4.0 + pow(s, 60.0) * 0.4 + pow(s, 7.0) * 0.16); gl_FragColor = vec4(c, 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  }));
  sky.renderOrder = -1; sky.frustumCulled = false; scene.add(sky);
  const starPos = new Float32Array(280 * 3);
  for (let i = 0; i < 280; i++) { // more of them low in the sky, where the camera looks
    const a = rw() * Math.PI * 2, y = 0.03 + rw() * rw() * 0.92, rr = Math.sqrt(1 - y * y);
    starPos.set([Math.cos(a) * rr * 370, y * 370, Math.sin(a) * rr * 370], i * 3);
  }
  const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  stars.frustumCulled = false; sky.add(stars);
  const moon = new THREE.Mesh(new THREE.CircleGeometry(10, 24), new THREE.MeshBasicMaterial({ color: 0xfff4d6, transparent: true, opacity: 0, fog: false, depthWrite: false, toneMapped: false }));
  sky.add(moon);

  // ---- lanterns along the water and fireflies over the beds: both only show at night ----
  const lampGlow = new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xffb04a, emissiveIntensity: 0 });
  const lampLights = [], lampPost = mat(0x5a4632);
  [[2.3, 0.78], [3.9, -0.78], [-2.3, 0.78], [-3.9, -0.78], [0.78, -2.3], [-0.78, -3.9], [0.78, 3.9], [-0.78, 2.3]].forEach(([x, z], i) => {
    const post = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.5, 5), lampPost)); post.position.set(x, 0.4, z); garden.add(post);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16), lampGlow); lamp.position.set(x, 0.75, z); garden.add(lamp);
    const hat = shadowy(new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.1, 4), tile)); hat.position.set(x, 0.9, z); hat.rotation.y = Math.PI / 4; garden.add(hat);
    if (i % 2 === 0) { const pl = new THREE.PointLight(0xffb45a, 0, 5.5, 1.6); pl.position.set(x, 0.95, z); pl.visible = false; garden.add(pl); lampLights.push(pl); }
  });
  const FLIES = 40, flyPos = new Float32Array(FLIES * 3), flyBase = [];
  for (let i = 0; i < FLIES; i++) flyBase.push([(rw() - 0.5) * 9, 0.5 + rw() * 1.5, (rw() - 0.5) * 9, rw() * 6]);
  const flyGeo = new THREE.BufferGeometry(); flyGeo.setAttribute('position', new THREE.BufferAttribute(flyPos, 3));
  const flies = new THREE.Points(flyGeo, new THREE.PointsMaterial({ color: 0xfff3a0, size: 0.13, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  flies.visible = false; garden.add(flies);

  // ---- the hour: the colours of the sky and the light at four heights of the sun, blended between ----
  const C = h => new THREE.Color(h);
  const HOURS = [
    { e: -0.3, top: C(0x0a0f2c), hor: C(0x232b58), hs: C(0x7088f8), hg: C(0x2c3a66), hi: 0.95, sc: C(0x9db2ff), si: 0.8 },  // night
    { e: 0, top: C(0x353b82), hor: C(0xee9068), hs: C(0xe0b4c4), hg: C(0x6a5a4a), hi: 1.05, sc: C(0xff9457), si: 1.7 },      // sunrise, sunset
    { e: 0.28, top: C(0x62a9e4), hor: C(0xf6d6a4), hs: C(0xffe9cf), hg: C(0x9a8458), hi: 1.1, sc: C(0xffc890), si: 2.2 },   // the golden hour
    { e: 0.65, top: C(0x4fa6ea), hor: C(0xc4e2f2), hs: C(0xfff1dc), hg: C(0xa8935f), hi: 1.3, sc: C(0xffe2b8), si: 2.4 },   // day
  ];
  const fixedHour = parseFloat(new URLSearchParams(location.search).get('hour'));
  let night = 0, hourAt = -9;
  function setHour() {
    const now = new Date();
    if (fixedHour >= 0 && fixedHour < 24) now.setHours(Math.floor(fixedHour), (fixedHour % 1) * 60, 0);
    const { day, p, e } = daylight(now);
    let i = 1; while (i < HOURS.length - 1 && e > HOURS[i].e) i++;
    const a = HOURS[i - 1], b = HOURS[i], k = Math.min(1, Math.max(0, (e - a.e) / (b.e - a.e)));
    skyU.top.value.copy(a.top).lerp(b.top, k); skyU.hor.value.copy(a.hor).lerp(b.hor, k);
    scene.fog.color.copy(skyU.hor.value);
    hemi.color.copy(a.hs).lerp(b.hs, k); hemi.groundColor.copy(a.hg).lerp(b.hg, k); hemi.intensity = a.hi + (b.hi - a.hi) * k;
    sun.color.copy(a.sc).lerp(b.sc, k);
    const si = a.si + (b.si - a.si) * k;
    if (e > -0.12) { // the sun; just after it sets (or before it rises) its glow still comes from where it was
      const th = Math.PI * (day ? p : p < 0.5 ? 1 : 0);
      sun.position.set(-15 * Math.cos(th), Math.max(6, 15 * Math.sin(th)), 6);
      sun.intensity = si * (1 - 0.85 * smooth(0, -0.12, e));
    } else {         // the moon
      const th = Math.PI * p;
      sun.position.set(12 * Math.cos(th), 4 + 9 * Math.sin(th), -7);
      sun.intensity = si * (0.15 + 0.85 * smooth(-0.12, -0.3, e));
    }
    const up = Math.PI * (day ? p : p < 0.5 ? 1 : 0); // where the sun's disc is in the sky; it sinks below the land at night
    skyU.sunDir.value.set(-15 * Math.cos(up), day ? 15 * Math.sin(up) : -3, 6).normalize();
    skyU.sunCol.value.copy(sun.color).multiplyScalar(smooth(-0.14, 0.04, e));
    night = smooth(0.06, -0.2, e);
    stars.material.opacity = night; stars.visible = night > 0.01;
    const th = Math.PI * (day ? 0.5 : p);
    moon.position.set(12 * Math.cos(th), 4 + 9 * Math.sin(th), -7).normalize().multiplyScalar(350);
    moon.material.opacity = smooth(-0.1, -0.28, e); moon.visible = moon.material.opacity > 0.01;
    lampGlow.emissiveIntensity = 0.15 + night * 2.4;
    for (const pl of lampLights) { pl.intensity = night * 6; pl.visible = night > 0.02; }
    flies.material.opacity = night * 0.95; flies.visible = night > 0.02;
  }

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
  const view = { yaw: Math.PI / 4, pitch: 0.33, zoom: 1.08, target: new THREE.Vector3(0, 3.8, 0) };
  const R = S * 0.78;
  let idle = 0; // the camera drifts a little when nobody is turning it
  function look() {
    const halfV = THREE.MathUtils.degToRad(camera.fov / 2), halfH = Math.atan(Math.tan(halfV) * camera.aspect);
    const dist = R / Math.sin(Math.min(halfV, halfH)) / view.zoom, yaw = view.yaw + idle;
    camera.position.set(
      view.target.x + dist * Math.cos(view.pitch) * Math.sin(yaw),
      view.target.y + dist * Math.sin(view.pitch),
      view.target.z + dist * Math.cos(view.pitch) * Math.cos(yaw));
    camera.lookAt(view.target);
  }
  function place() {
    const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    look();
  }
  place();
  const ro = new ResizeObserver(place); ro.observe(stage);

  const pts = new Map();
  let pinch0 = null;
  const cv = renderer.domElement;
  let press = null; // a short press that does not move is a tap: it chooses where the water goes
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    press = pts.size === 1 ? { x: e.clientX, y: e.clientY, at: performance.now() } : null;
  });
  cv.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) press = null;
    if (pts.size === 1) {
      view.yaw -= (e.clientX - p.x) * 0.008;
      view.pitch = Math.min(1.25, Math.max(0.22, view.pitch + (e.clientY - p.y) * 0.005));
    }
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0) view.zoom = Math.min(2.6, Math.max(0.5, pinch0.z * d / pinch0.d)); else pinch0 = { d, z: view.zoom };
    }
    look();
  });
  const up = e => {
    pts.delete(e.pointerId); if (pts.size < 2) pinch0 = null;
    if (press && e.type === 'pointerup' && performance.now() - press.at < 400) pick(e.clientX, e.clientY);
    press = null;
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); view.zoom = Math.min(2.6, Math.max(0.5, view.zoom * (e.deltaY < 0 ? 1.08 : 0.93))); look(); }, { passive: false });

  // ---- the game (rules in domain/garden.js): water earned by logging is poured on the pomegranate and the desert ----
  const kept = store.profile()?.garden;
  const G = { tree: Math.min(TREE_STEPS, Math.max(1, kept?.tree || 1)), cells: { ...(kept?.cells || {}) } };
  for (const [k, lv] of Object.entries(G.cells)) { const [i, j] = k.split(',').map(Number); land.setCell(i, j, lv); }
  let water = 0, chosen = null, step = G.tree, grow = step / TREE_STEPS, wetUntil = 0, saving = 0;
  const btn = el.querySelector('[data-water]'), countEl = el.querySelector('.garden-count'), todayEl = el.querySelector('.garden-today');
  const TREE_AT = new THREE.Vector3(tree.position.x, 0.15, tree.position.z);
  // where the next drop goes: what was tapped, while it can still take water; else the pomegranate, then the nearest land
  function target() {
    if (chosen === 'tree' && G.tree < TREE_STEPS) return 'tree';
    if (Array.isArray(chosen) && canWater(G.cells, chosen[0], chosen[1])) return chosen;
    chosen = null;
    return G.tree < TREE_STEPS ? 'tree' : nextCell(G.cells);
  }
  // a white ring on the target, and a faint damp spot on every piece of dry land the water can reach
  const mark = new THREE.Mesh(new THREE.TorusGeometry(1, 0.045, 6, 44), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false, fog: false }));
  mark.rotation.x = Math.PI / 2; mark.renderOrder = 5; mark.visible = false; scene.add(mark);
  const spotGeo = new THREE.CircleGeometry(0.4, 12); spotGeo.rotateX(-Math.PI / 2);
  const spots = new THREE.InstancedMesh(spotGeo, new THREE.MeshBasicMaterial({ color: 0x7a5a30, transparent: true, opacity: 0.2, depthWrite: false }), 600);
  spots.count = 0; spots.frustumCulled = false; scene.add(spots);
  const spotM = new THREE.Matrix4();
  function aim() {
    const tg = water > 0 ? target() : null;
    mark.visible = !!tg;
    if (tg === 'tree') { mark.position.set(TREE_AT.x, 0.32, TREE_AT.z); mark.userData.r = 0.95; }
    else if (tg) { mark.position.set(tg[0] * CELL, land.cellTop(tg[0], tg[1]) + 0.12, tg[1] * CELL); mark.userData.r = 1.15; }
    let n = 0;
    if (water > 0) for (const [i, j] of frontier(G.cells)) {
      if (G.cells[cellKey(i, j)] || n >= 600) continue;
      spots.setMatrixAt(n++, spotM.makeTranslation(i * CELL, land.cellTop(i, j) + 0.05, j * CELL));
    }
    spots.count = n; spots.instanceMatrix.needsUpdate = true;
  }
  function tally() {
    const st = store.get(), day = today();
    water = Math.max(0, earned(st.entries, st.activity, day) - spent(G));
    countEl.textContent = fa(water); btn.classList.toggle('empty', !water);
    const d = dropsByDay(st.entries, st.activity).get(day) || { meals: 0, move: 0 };
    [...todayEl.children].forEach((c, k) => c.classList.toggle('on', k < 3 ? k < d.meals : d.move > 0));
    aim();
  }
  const ray = new THREE.Raycaster(), floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.2), hit = new THREE.Vector3(), ndc = new THREE.Vector2();
  function pick(x, y) {
    const r = cv.getBoundingClientRect();
    ray.setFromCamera(ndc.set((x - r.left) / r.width * 2 - 1, -(y - r.top) / r.height * 2 + 1), camera);
    if (!ray.ray.intersectPlane(floor, hit)) return;
    if (hit.x > 0.5 && hit.z > 0.5 && hit.x < 4.7 && hit.z < 4.7) { if (G.tree >= TREE_STEPS) return; chosen = 'tree'; }
    else {
      const i = Math.round(hit.x / CELL), j = Math.round(hit.z / CELL);
      if (!canWater(G.cells, i, j)) return;
      chosen = [i, j];
    }
    aim();
  }
  const rain = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0x7fd6ff, size: 0.12, transparent: true, opacity: 0.95, fog: false }));
  const rainPos = new Float32Array(40 * 3), rainV = [];
  rain.geometry.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  rain.visible = false; rain.frustumCulled = false; scene.add(rain);
  function save() {
    clearTimeout(saving);
    saving = setTimeout(() => { saving = 0; store.saveProfile({ ...store.profile(), garden: { tree: G.tree, cells: { ...G.cells } } }); }, 700);
  }
  function pour() {
    const tg = water > 0 ? target() : null;
    if (!tg) { btn.classList.remove('no'); void btn.offsetWidth; btn.classList.add('no'); return; }
    const now = clock.elapsedTime, rr = rng((now * 1000) | 0);
    if (tg === 'tree') { G.tree++; step = G.tree; wetUntil = now + 2.2; rain.position.copy(TREE_AT); }
    else {
      const [i, j] = tg, k = cellKey(i, j);
      G.cells[k] = (G.cells[k] || 0) + 1;
      land.setCell(i, j, G.cells[k], now + 0.3);
      rain.position.set(i * CELL, land.cellTop(i, j), j * CELL);
    }
    for (let i = 0; i < 40; i++) rainV[i] = { x: (rr() - 0.5) * 1.6, z: (rr() - 0.5) * 1.6, t0: now + rr() * 0.5 };
    rain.visible = true;
    btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
    save(); tally();
  }
  // one press pours one drop; holding keeps pouring
  let hold = 0, again = 0;
  const release = () => { clearTimeout(hold); clearInterval(again); hold = again = 0; };
  btn.addEventListener('pointerdown', e => { e.preventDefault(); release(); pour(); hold = setTimeout(() => { again = setInterval(pour, 210); }, 420); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, release);
  btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pour(); } });
  L.refresh = tally; // the app calls this when its data changes (a meal logged on another device, say)

  // ---- each frame ----
  const clock = new THREE.Clock();
  let raf = 0;
  const soilDry = new THREE.Color(0x6e4a2c), soilWet = new THREE.Color(0x3e2816);
  function frame() {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    if (t - hourAt > 1) { hourAt = t; setHour(); }
    uTime.value = t;
    land.update(t, dt);
    if (!pts.size) { idle = Math.sin(t * 0.12) * 0.05; look(); }
    if (mark.visible) { const k = mark.userData.r * (1 + Math.sin(t * 3.2) * 0.07); mark.scale.set(k, k, 1); mark.material.opacity = 0.75 + Math.sin(t * 3.2) * 0.2; }
    sky.position.copy(camera.position);
    moon.lookAt(camera.position);
    if (flies.visible) {
      flyBase.forEach(([x, y, z, ph], i) => {
        flyPos[i * 3] = x + Math.sin(t * 0.7 + ph) * 0.4; flyPos[i * 3 + 1] = y + Math.sin(t * 1.1 + ph * 2) * 0.25; flyPos[i * 3 + 2] = z + Math.cos(t * 0.6 + ph) * 0.4;
      });
      flyGeo.attributes.position.needsUpdate = true;
    }
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

    const goal = step / TREE_STEPS; // the tree eases towards its step
    grow += (goal - grow) * Math.min(1, dt * 1.8);
    const g = grow;
    tree.scale.setScalar(0.34 + 0.36 * smooth(0, 1, g));
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
  tally();
  frame();
  el.querySelector('.garden-wait').remove();

  L.dispose = () => {
    cancelAnimationFrame(raf);
    ro.disconnect(); release();
    if (saving) { clearTimeout(saving); store.saveProfile({ ...store.profile(), garden: { tree: G.tree, cells: { ...G.cells } } }); }
    scene.traverse(o => { o.geometry?.dispose(); [].concat(o.material || []).forEach(m => { m.map?.dispose(); m.dispose(); }); });
    renderer.dispose();
    renderer.domElement.remove();
  };
}
