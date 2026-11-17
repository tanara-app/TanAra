/*
  «سرقت بزرگ» (beta, from 2026-11-17): the game's screen, opened from «بیشتر» (#/heist). Full screen, no bottom bar.
  The build brief is briefs/heist.md and the rules and look are in DESIGN-heist.md.

  This file is the flow and the controls: loading → menu → a raid → the result (and its replay). The rules are in
  domain/heist.js and the picture is ui/heistScene.js. Phase 2 is one raid on a made-up vault with two gadgets, the
  pulse and the smoke; nothing is saved and nothing is tied to the diet yet.

  Everything that happens goes through one small event bus (`bus`): the scene, the top bar, the phone's buzz (and
  later the sound) all listen to it. A raid is its list of moves, so the replay is the same moves played again.

  Controls: tap a cell next to the thief to move there, hold a finger down (or the hourglass) to wait, tap a gadget
  and then a lit cell to use it. Arrow keys and space work too. `?debug` shows the frame rate, the quality step and
  the narrowest cell; `window.__heist` gives the state to the console. The sound is in ui/heistAudio.js.
*/
import { icon } from './dom.js';
import { fa } from '../lib/fa.js';
import { generate, initial, play, solve, MAX_TURNS, ALARM_TURNS, LEVELS, W, H, EMP_RADIUS, SMOKE_RANGE, BAIT_RANGE } from '../domain/heist.js';
import { createScene } from './heistScene.js';
import { createAudio } from './heistAudio.js';

// The five gadgets in their order on the menu. A raid takes two (DESIGN-heist.md); the lockpick and the goggles just work while carried,
// the others are used with a tap and then (smoke, decoy) a tap on a cell.
const ALL = ['emp', 'smoke', 'decoy', 'lockpick', 'goggles'];
const TAPPED = new Set(['emp', 'smoke', 'decoy']);
const AIMED = { smoke: ['S', SMOKE_RANGE], decoy: ['B', BAIT_RANGE] };
const KIT_MAX = 2;
const NAMES = { emp: 'پالس', smoke: 'دود', decoy: 'طعمه', lockpick: 'قفل‌بازکن', goggles: 'عینک' };
const DIRS = ['U', 'R', 'D', 'L'], DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const TITLES = { escaped: 'فرار بی‌صدا', escaped_alarm: 'فرار با آژیر', caught: 'گیر افتادی', timeout: 'وقت تمام شد', fled: 'دست خالی' };

const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;
const ICON = {
  emp: svg('<path d="M13 2.5L6 13h5l-1 8.5L18 10h-5.2z"/>'),
  smoke: svg('<path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 9.2 4.4 4.4 0 0 1 17.5 18z"/><path d="M9 21.5h7"/>'),
  decoy: svg('<ellipse cx="12" cy="17" rx="4.5" ry="2.2"/><path d="M12 14.8v-2"/><path d="M8.2 9.6a5.4 5.4 0 0 1 7.6 0M5.6 6.9a9.2 9.2 0 0 1 12.8 0"/>'),
  lockpick: svg('<path d="M3.5 20.5l9.8-9.8"/><circle cx="16.6" cy="7.4" r="3.6"/><path d="M6.4 17.6l2 2M9.2 14.8l1.6 1.6"/>'),
  goggles: svg('<path d="M3 9.6a1.8 1.8 0 0 1 1.8-1.8h14.4A1.8 1.8 0 0 1 21 9.6v3a3.4 3.4 0 0 1-3.4 3.4h-1.8a2.6 2.6 0 0 1-2.3-1.4l-.5-1h-2l-.5 1a2.6 2.6 0 0 1-2.3 1.4H6.4A3.4 3.4 0 0 1 3 12.6z"/><path d="M6.5 11h3M14.5 11h3"/>'),
  wait: svg('<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>'),
  go: svg('<path d="M8 5l11 7-11 7z" fill="currentColor"/>'),
  again: svg('<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v5h5"/>'),
  replay: svg('<path d="M11 6l-7 6 7 6z" fill="currentColor"/><path d="M20 6l-7 6 7 6z" fill="currentColor"/>'),
  next: svg('<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>'),
  sound: svg('<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path class="wave" d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/><path class="mute" d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  loot: svg('<path d="M6 4h12l3.5 5L12 21 2.5 9z"/><path d="M2.5 9h19M9 4l-2 5 5 12 5-12-2-5"/>'),
};

function makeBus() {
  const map = new Map();
  return {
    on(type, fn) { (map.get(type) || map.set(type, []).get(type)).push(fn); },
    emit(type, data) { return Promise.all((map.get(type) || []).map(fn => fn(data))); },
  };
}

let live = null;

export function renderHeist(root) {
  if (live && root.contains(live.el)) return;
  stop();
  document.body.classList.add('heist-mode');
  const debug = /[?&]debug\b/.test(location.search + location.hash);
  root.innerHTML = `
    <section class="heist" data-state="loading">
      <div class="heist-stage"></div>
      <div class="heist-glow" aria-hidden="true"></div>
      <button class="heist-btn heist-back" data-back aria-label="برگشت">${icon.chevR}</button>
      <button class="heist-btn heist-sound" data-sound aria-label="صدا">${ICON.sound}</button>
      <div class="heist-top">
        <span class="heist-alarm" aria-hidden="true">${'<i></i>'.repeat(ALARM_TURNS)}</span>
        <span class="heist-loot" aria-hidden="true">${ICON.loot}</span>
        <span class="heist-turn"><b>${fa(0)}</b><i>${fa(MAX_TURNS)}</i></span>
      </div>
      <div class="heist-tools"></div>
      <div class="heist-menu">
        <h1>سرقت بزرگ</h1>
        <div class="heist-levels" role="group" aria-label="سطح">${Array.from({ length: LEVELS }, (_, i) => `<button data-level="${i + 1}">${fa(i + 1)}</button>`).join('')}</div>
        <div class="heist-kit" role="group" aria-label="ابزار">${ALL.map(n => `<button data-kit="${n}" aria-label="${NAMES[n]}">${ICON[n]}</button>`).join('')}</div>
        <button class="heist-btn heist-go" data-go aria-label="شروع">${ICON.go}</button>
      </div>
      <div class="heist-result">
        <h2></h2>
        <p></p>
        <div>
          <button class="heist-btn" data-replay aria-label="بازپخش">${ICON.replay}</button>
          <button class="heist-btn heist-go" data-again aria-label="دوباره">${ICON.again}</button>
          <button class="heist-btn" data-next aria-label="گاوصندوق بعدی">${ICON.next}</button>
        </div>
      </div>
      <div class="heist-load"><i></i></div>
      ${debug ? '<pre class="heist-debug" dir="ltr"></pre>' : ''}
    </section>`;
  const el = root.querySelector('.heist');
  const onHash = () => { if (!location.hash.startsWith('#/heist')) stop(); };
  window.addEventListener('hashchange', onHash);
  const L = live = { el, onHash, dispose: null };
  start(el, L, debug);
}

function stop() {
  if (!live) return;
  window.removeEventListener('hashchange', live.onHash);
  live.dispose?.();
  live = null;
  document.body.classList.remove('heist-mode');
  delete window.__heist;
}

function start(el, L, debug) {
  const $ = s => el.querySelector(s);
  const bus = makeBus();
  let level = 1, seed = 1, vault = null, scene = null, state = null, moves = [], mode = 'loading', armed = null, building = 0;
  try { level = Math.max(1, Math.min(LEVELS, +localStorage.getItem('tanara:heist:level') || 1)); } catch { /* private mode */ }
  // the gadgets this member takes into a raid (kept on the device; two at most, no repeats)
  let kit = ['emp', 'smoke'];
  try { const k = (localStorage.getItem('tanara:heist:kit') ?? '').split(',').filter((n, i, a) => ALL.includes(n) && a.indexOf(n) === i).slice(0, KIT_MAX); if (localStorage.getItem('tanara:heist:kit') !== null) kit = k; } catch { /* private mode */ }
  const doorCells = [];

  const setMode = m => { mode = m; el.dataset.state = m; };
  const safeArea = side => { const p = document.createElement('i'); p.style.cssText = `position:fixed;visibility:hidden;padding-${side}:env(safe-area-inset-${side})`; el.appendChild(p); const v = parseFloat(getComputedStyle(p)[`padding-${side[0].toUpperCase()}${side.slice(1)}`]) || 0; p.remove(); return v; };

  // ----- what listens to the bus -----
  // the top bar and the tools
  function hud() {
    $('.heist-turn b').textContent = fa(state?.t || 0);
    el.classList.toggle('has-loot', !!state?.loot);
    el.classList.toggle('alarm', !!state && state.alarm > 0 && state.status === 'play');
    [...el.querySelectorAll('.heist-alarm i')].forEach((p, k) => p.classList.toggle('on', !!state && k < state.alarm));
    for (const b of el.querySelectorAll('[data-g]')) {
      const k = kit.indexOf(b.dataset.g);
      b.disabled = !state || k < 0 || !!(state.used & (1 << k));
      b.classList.toggle('armed', armed === b.dataset.g);
    }
    // the lockpick lights up next to a locked door
    const pick = $('[data-p="lockpick"]');
    if (pick) pick.classList.toggle('ready', !!state && state.status === 'play' && doorCells.some((c, j) => state.doors[j] !== 9 && Math.abs(c % W - state.p % W) + Math.abs((c / W | 0) - (state.p / W | 0)) === 1));
    for (const b of el.querySelectorAll('[data-level]')) b.classList.toggle('on', +b.dataset.level === level);
    for (const b of el.querySelectorAll('[data-kit]')) b.classList.toggle('on', kit.includes(b.dataset.kit));
  }
  bus.on('state', hud);
  // the scene acts the turn out; the raid waits for it
  bus.on('turn', t => scene?.playTurn(t.prev, t.next, t.events, kit, t.speed));
  // the sound (nothing plays before the first tap)
  const audio = createAudio(bus);
  el.classList.toggle('muted', !audio.on);
  el.addEventListener('pointerdown', () => audio.unlock(), { passive: true });
  // the phone's buzz
  const buzz = p => { try { navigator.vibrate?.(p); } catch { /* not allowed */ } };
  bus.on('fx', name => {
    if (name === 'alarm') buzz([60, 40, 60, 40, 140]);
    else if (name === 'caught') buzz(260);
    else if (name === 'land' || name === 'safe' || name === 'decoy') buzz(25);
    if (name === 'slow') { el.classList.add('slow'); setTimeout(() => el.classList.remove('slow'), 700); }
  });
  bus.on('result', r => {
    const win = r.status === 'escaped' || r.status === 'escaped_alarm';
    el.classList.toggle('won', win);
    $('.heist-result h2').textContent = TITLES[r.status] || '';
    $('.heist-result p').innerHTML = `<b>${fa(r.turns)}</b> نوبت`;
  });

  // The tools bar: the first gadget, wait, the second. A gadget used with a tap is a button; one that just works is a lit badge.
  function tools() {
    const g = n => !n ? '<i class="heist-slot"></i>' : TAPPED.has(n)
      ? `<button class="heist-btn" data-g="${n}" aria-label="${NAMES[n]}">${ICON[n]}</button>`
      : `<span class="heist-btn heist-passive" data-p="${n}" role="img" aria-label="${NAMES[n]}">${ICON[n]}</span>`;
    $('.heist-tools').innerHTML = `${g(kit[0])}<button class="heist-btn" data-wait aria-label="صبر">${ICON.wait}</button>${g(kit[1])}`;
  }
  function toggleKit(n) {
    kit = kit.includes(n) ? kit.filter(x => x !== n) : [...kit, n].slice(-KIT_MAX);
    try { localStorage.setItem('tanara:heist:kit', kit.join(',')); } catch { /* private mode */ }
    hud();
  }

  // The free space above and below the board: in a raid only the top bar and the tools; on the menu and the result, the title above and
  // everything from their first row of buttons down, so nothing sits on the board.
  const pads = { play: [70 + safeArea('top'), 112 + safeArea('bottom')] };
  const padFor = (title, row) => [Math.max(pads.play[0], $(title).getBoundingClientRect().bottom + 6),
    Math.max(pads.play[1], el.clientHeight - $(row).getBoundingClientRect().top + 12)];

  // ----- a vault and its scene -----
  async function build() {
    const mine = ++building;
    setMode('loading');
    $('.heist-load i').style.width = '8%';
    scene?.dispose();
    scene = null;
    vault = generate(seed, level);
    doorCells.length = 0;
    [...vault.tiles.join('')].forEach((t, i) => { if (t === 'D') doorCells.push(i); });
    state = initial(vault);
    moves = [];
    armed = null;
    let made = null;
    try {
      made = await createScene($('.heist-stage'), vault, {
        padTop: pads.play[0], padBottom: pads.play[1],
        onProgress: p => { if (mine === building) $('.heist-load i').style.width = `${Math.round(8 + p * 92)}%`; },
        onFx: name => bus.emit('fx', name),
        onStats: s => { if (debug) showDebug(s); },
      });
    } catch (e) {
      if (mine === building && live === L) { $('.heist-load').classList.add('failed'); console.error(e); }
      return;
    }
    if (mine !== building || live !== L) { made.dispose(); return; }
    scene = made;
    scene.setQuiet(true);
    scene.sync(state, []);
    bus.emit('state');
    setMode('menu');
    scene.setPads(...padFor('.heist-menu h1', '.heist-levels'));
    if (debug) showDebug({ fps: scene.fps, tier: scene.tier });
  }

  function hints() {
    if (mode !== 'play') return [];
    const x = state.p % W, y = state.p / W | 0, out = [];
    if (armed === 'emp') {
      for (let j = -EMP_RADIUS; j <= EMP_RADIUS; j++) for (let i = -EMP_RADIUS; i <= EMP_RADIUS; i++) if (x + i >= 0 && y + j >= 0 && x + i < W && y + j < H) out.push([(y + j) * W + x + i, 2]);
    } else if (AIMED[armed]) {
      const [k, r] = AIMED[armed];
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        if (Math.abs(i) + Math.abs(j) <= r && play(vault, state, `${k}${x + i},${y + j}`, kit)) out.push([(y + j) * W + x + i, 2]);
      }
    } else for (let d = 0; d < 4; d++) if (play(vault, state, DIRS[d], kit)) out.push([(y + DY[d]) * W + x + DX[d], 1]);
    return out;
  }
  const refresh = () => { bus.emit('state'); scene?.setHints(hints()); };

  async function act(mv, speed = 1) {
    if (mode !== 'play' && mode !== 'replay') return false;
    const r = play(vault, state, mv, kit);
    if (!r) { el.classList.remove('no'); void el.offsetWidth; el.classList.add('no'); return false; }
    const was = mode, prev = state;
    if (was === 'play') moves.push(mv);
    armed = null;
    setMode('busy');
    state = r.state;
    bus.emit('state');
    await bus.emit('turn', { prev, next: state, events: r.events, speed, kit });
    if (live !== L) return false;
    for (const e of r.events) bus.emit('event', e);
    if (state.status !== 'play') {
      await bus.emit('result', { status: state.status, turns: state.t, alarm: state.alarm > 0 });
      setMode('result');
      scene?.setPads(...padFor('.heist-result h2', '.heist-result p'));
      return true;
    }
    setMode(was);
    if (was === 'play') refresh();
    return true;
  }

  async function begin(fast) {
    if (!scene) return;
    state = initial(vault);
    moves = [];
    armed = null;
    tools();
    scene.setPads(...pads.play, fast);
    setMode('busy');
    el.classList.remove('won');
    bus.emit('state');
    await scene.intro(state, kit, fast);
    if (live !== L) return;
    scene.setQuiet(false);
    setMode('play');
    refresh();
  }

  async function replay() {
    if (!scene || !moves.length) return;
    const list = moves.slice();
    state = initial(vault);
    setMode('busy');
    bus.emit('state');
    await scene.intro(state, kit, true);
    scene.setQuiet(false);
    setMode('replay');
    for (const mv of list) { if (live !== L || !(await act(mv, 1.6))) break; }
    moves = list;
  }

  // ----- controls -----
  function tap(cell) {
    if (mode !== 'play' || cell < 0) return;
    const x = cell % W, y = cell / W | 0, tx = state.p % W, ty = state.p / W | 0;
    if (armed === 'emp') { if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) <= EMP_RADIUS) act('E'); else { armed = null; refresh(); } return; }
    if (AIMED[armed]) { const mv = `${AIMED[armed][0]}${x},${y}`; if (!play(vault, state, mv, kit)) { armed = null; refresh(); } else act(mv); return; }
    const d = DX.findIndex((dx, k) => tx + dx === x && ty + DY[k] === y);
    if (d >= 0) act(DIRS[d]);
  }
  const stage = $('.heist-stage');
  let down = null, holdTimer = 0;
  stage.addEventListener('pointerdown', e => {
    down = { x: e.clientX, y: e.clientY, held: false };
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => { if (down && mode === 'play' && !armed) { down.held = true; act('W'); } }, 480);
  });
  stage.addEventListener('pointermove', e => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 14) { clearTimeout(holdTimer); down.moved = true; } });
  stage.addEventListener('pointerup', e => {
    clearTimeout(holdTimer);
    const d = down;
    down = null;
    if (!d || d.held || !scene) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    // a swipe moves the thief that way; a tap picks the cell under the finger
    if (Math.hypot(dx, dy) > 34 && !armed) act(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U'));
    else if (!d.moved) tap(scene.pick(e.clientX, e.clientY));
  });
  stage.addEventListener('pointercancel', () => { clearTimeout(holdTimer); down = null; });
  stage.addEventListener('contextmenu', e => e.preventDefault());
  const onKey = e => {
    if (mode !== 'play') return;
    const k = { ArrowUp: 'U', ArrowRight: 'R', ArrowDown: 'D', ArrowLeft: 'L', ' ': 'W' }[e.key];
    if (k) { e.preventDefault(); act(k); }
  };
  window.addEventListener('keydown', onKey);

  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.back !== undefined) { location.replace('#/tools'); return; }
    if (b.dataset.sound !== undefined) { el.classList.toggle('muted', !audio.toggle()); return; }
    if (b.dataset.level) { if (mode === 'menu' && +b.dataset.level !== level) { level = +b.dataset.level; seed = 1; try { localStorage.setItem('tanara:heist:level', level); } catch { /* private mode */ } build(); } return; }
    if (b.dataset.go !== undefined) { if (mode === 'menu') begin(false); return; }
    if (b.dataset.kit) { if (mode === 'menu') toggleKit(b.dataset.kit); return; }
    if (b.dataset.wait !== undefined) { armed = null; act('W'); return; }
    if (b.dataset.g) { if (mode === 'play') { armed = armed === b.dataset.g ? null : b.dataset.g; refresh(); } return; }
    if (b.dataset.again !== undefined) { if (mode === 'result') begin(true); return; }
    if (b.dataset.replay !== undefined) { if (mode === 'result') replay(); return; }
    if (b.dataset.next !== undefined) { if (mode === 'result') { seed++; build(); } }
  });

  // ----- ?debug -----
  function showDebug(s) {
    const box = $('.heist-debug');
    if (!box || !scene) return;
    let narrow = Infinity;
    for (let i = 0; i < W * H; i++) narrow = Math.min(narrow, scene.cellRect(i).w);
    const info = scene.info();
    box.textContent = `fps ${s.fps}  quality ${s.tier}  cell ${Math.round(narrow)}px\ncalls ${info.calls}  tris ${info.triangles}  geo ${info.geometries}  tex ${info.textures}\nL${level} seed ${seed}  turn ${state?.t}  ${mode}`;
  }
  window.__heist = {
    bus, audio, get kit() { return kit; }, setKit(k) { kit = k; hud(); }, get state() { return state; }, get vault() { return vault; }, get moves() { return moves; }, get mode() { return mode; }, get scene() { return scene; },
    act, begin, replay, solve: (alarm = false) => solve(vault, kit, { alarm })?.moves,
    load(l, s) { level = l; seed = s; return build(); },
  };

  L.dispose = () => {
    building++;
    clearTimeout(holdTimer);
    window.removeEventListener('keydown', onKey);
    scene?.dispose();
    scene = null;
    audio.dispose();
  };
  build();
}
