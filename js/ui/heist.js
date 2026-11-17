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
import { edit as editVault, targets, check, lineOf } from '../domain/heistEdit.js';

// The five gadgets in their order on the menu. A raid takes two (DESIGN-heist.md); the lockpick and the goggles just work while carried,
// the others are used with a tap and then (smoke, decoy) a tap on a cell.
const ALL = ['emp', 'smoke', 'decoy', 'lockpick', 'goggles'];
const TAPPED = new Set(['emp', 'smoke', 'decoy']);
const AIMED = { smoke: ['S', SMOKE_RANGE], decoy: ['B', BAIT_RANGE] };
const KIT_MAX = 2;
const NAMES = { emp: 'پالس', smoke: 'دود', decoy: 'طعمه', lockpick: 'قفل‌بازکن', goggles: 'عینک' };
// The editor (phase 3, briefs/heist-3.md): the building tools on the first row, the defences on the second.
const BUILD = ['wall', 'door', 'safe', 'entry', 'exit', 'erase'], DEFEND = ['guard', 'cam', 'laser', 'plate', 'mark'];
const TOOL_NAMES = { wall: 'دیوار', door: 'در قفل', safe: 'صندوق', entry: 'ورودی', exit: 'خروجی', erase: 'پاک کردن', guard: 'نگهبان', cam: 'دوربین', laser: 'لیزر', plate: 'صفحه‌ی فشاری', mark: 'نشانه‌ی قلابی' };
// why a vault is turned down: one short line, only while it is
const WHY = { unsolvable: 'راه بی‌آژیر ندارد', budget: 'از بودجه بیشتر است', guard: 'مسیر یک نگهبان درست نیست', laser: 'لیزر باید از دیوار تا دیوار برسد',
  cam: 'دوربین باید روی دیوار باشد', exit: 'یک یا دو خروجی روی لبه لازم است', entry: 'ورودی باید روی لبه باشد', safe: 'یک صندوق لازم است',
  plate: 'روی هر خانه یک صفحه', mark: 'روی هر خانه یک نشانه', defense: 'گاوصندوق خراب است', shape: 'گاوصندوق خراب است' };
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
  mine: svg('<rect x="3.5" y="4" width="17" height="15" rx="2"/><circle cx="12" cy="11.5" r="3.4"/><path d="M12 8.1v1.2M12 13.7v1.2M8.6 11.5h1.2M14.2 11.5h1.2M6.5 19v2M17.5 19v2"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  wall: svg('<path d="M3 6h18v12H3z"/><path d="M3 10h18M3 14h18M9 6v4M15 6v4M6 10v4M12 10v4M18 10v4M9 14v4M15 14v4"/>'),
  door: svg('<path d="M6 21V4h12v17"/><path d="M3 21h18"/><path d="M14.5 12.5v.5"/>'),
  safe: svg('<rect x="3.5" y="4" width="17" height="15" rx="2"/><circle cx="12" cy="11.5" r="3.4"/><path d="M12 8.1v1.2M12 13.7v1.2M8.6 11.5h1.2M14.2 11.5h1.2M6.5 19v2M17.5 19v2"/>'),
  entry: svg('<path d="M12 3v12"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M5 20h14"/>'),
  exit: svg('<path d="M10 4H5v16h5"/><path d="M14 8l4 4-4 4M18 12H9"/>'),
  erase: svg('<path d="M8.5 19l-5-5L13 4.5l6.5 6.5-8 8z"/><path d="M8.5 19H20M8 9.5l6.5 6.5"/>'),
  guard: svg('<circle cx="12" cy="8.5" r="3.2"/><path d="M7.5 5.6h9"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>'),
  cam: svg('<path d="M3 8.5l12-1.6 1 6-12 1.6z"/><path d="M16 9.8l4-1 .7 4-4 .8"/><path d="M9.5 15l.8 5M7 20h6"/>'),
  laser: svg('<path d="M3.5 7v10M20.5 7v10"/><path d="M3.5 12h17" stroke-dasharray="2.5 2"/>'),
  plate: svg('<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="8.5" y="8.5" width="7" height="7" rx="1"/>'),
  mark: svg('<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2.6"/>'),
  undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  eye: svg('<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  ok: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  bad: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.3v.4"/>'),
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
        <div class="heist-levels" role="group" aria-label="سطح">${Array.from({ length: LEVELS }, (_, i) => `<button data-level="${i + 1}">${fa(i + 1)}</button>`).join('')}<button data-level="mine" aria-label="گاوصندوق من">${ICON.mine}</button></div>
        <div class="heist-kit" role="group" aria-label="ابزار">${ALL.map(n => `<button data-kit="${n}" aria-label="${NAMES[n]}">${ICON[n]}</button>`).join('')}</div>
        <div class="heist-go-row">
          <button class="heist-btn" data-edit aria-label="چیدن گاوصندوق">${ICON.edit}</button>
          <button class="heist-btn heist-go" data-go aria-label="شروع">${ICON.go}</button>
        </div>
      </div>
      <div class="heist-edit">
        <div class="heist-edit-top">
          <button class="heist-btn" data-watch aria-label="کوتاه‌ترین راه">${ICON.eye}</button>
          <span class="heist-grade" aria-hidden="true">${'<i></i>'.repeat(LEVELS)}</span>
          <span class="heist-cost"><b></b><i></i></span>
          <span class="heist-verdict"></span>
        </div>
        <p class="heist-why"></p>
        <div class="heist-palette">
          <div>${BUILD.map(n => `<button data-tool="${n}" aria-label="${TOOL_NAMES[n]}">${ICON[n]}</button>`).join('')}</div>
          <div>${DEFEND.map(n => `<button data-tool="${n}" aria-label="${TOOL_NAMES[n]}">${ICON[n]}</button>`).join('')}<button data-undo aria-label="برگرداندن">${ICON.undo}</button></div>
        </div>
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
  try { const l = localStorage.getItem('tanara:heist:level'); level = l === 'mine' ? 'mine' : Math.max(1, Math.min(LEVELS, +l || 1)); } catch { /* private mode */ }
  // The member's own vault: on this phone for now (phase 4 puts it on the server). A first one comes from the generator to start from.
  let mineVault = null;
  try { const v = JSON.parse(localStorage.getItem('tanara:heist:mine') || 'null'); if (v && !check(v).errors.includes('shape')) mineVault = v; } catch { /* none yet */ }
  mineVault ||= generate(11, 2);
  let mineCheck = check(mineVault);
  const saveMine = () => { try { localStorage.setItem('tanara:heist:mine', JSON.stringify(mineVault)); } catch { /* private mode */ } };
  // the editor: the tool in hand, the guard being drawn, and the steps back
  let tool = 'wall', sel = -1, watching = false;
  const undo = [];
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
    for (const b of el.querySelectorAll('[data-level]')) b.classList.toggle('on', b.dataset.level === String(level));
    el.classList.toggle('mine', level === 'mine');
    $('[data-go]').disabled = level === 'mine' && !mineCheck.ok;
    for (const b of el.querySelectorAll('[data-kit]')) b.classList.toggle('on', kit.includes(b.dataset.kit));
  }
  bus.on('state', hud);
  // the scene acts the turn out; the raid waits for it
  bus.on('turn', t => scene?.playTurn(t.prev, t.next, t.events, t.kit, t.speed));
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
    const keep = scene?.release();
    scene = null;
    vault = level === 'mine' ? mineVault : generate(seed, level);
    doorCells.length = 0;
    [...vault.tiles.join('')].forEach((t, i) => { if (t === 'D') doorCells.push(i); });
    state = initial(vault);
    moves = [];
    armed = null;
    let made = null;
    try {
      made = await createScene($('.heist-stage'), vault, {
        padTop: pads.play[0], padBottom: pads.play[1], keep,
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

  async function act(mv, speed = 1, gadgets = kit) {
    if (mode !== 'play' && mode !== 'replay') return false;
    const r = play(vault, state, mv, gadgets);
    if (!r) { el.classList.remove('no'); void el.offsetWidth; el.classList.add('no'); return false; }
    const was = mode, prev = state;
    if (was === 'play') moves.push(mv);
    armed = null;
    setMode('busy');
    state = r.state;
    bus.emit('state');
    await bus.emit('turn', { prev, next: state, events: r.events, speed, kit: gadgets });
    if (live !== L) return false;
    for (const e of r.events) bus.emit('event', e);
    if (state.status !== 'play') {
      if (watching) return true;
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

  // ----- the editor -----
  const editPads = () => padFor('.heist-why', '.heist-palette');
  function editorView() {
    mineCheck = check(vault);
    const c = mineCheck;
    $('.heist-cost b').textContent = fa(c.cost);
    $('.heist-cost i').textContent = fa(c.budget);
    $('.heist-cost').classList.toggle('over', c.cost > c.budget);
    [...el.querySelectorAll('.heist-grade i')].forEach((b, k) => b.classList.toggle('on', k < c.grade));
    $('.heist-verdict').innerHTML = c.ok ? ICON.ok : ICON.bad;
    $('.heist-verdict').className = `heist-verdict ${c.ok ? 'ok' : 'bad'}`;
    $('.heist-why').textContent = c.ok ? '' : WHY[c.errors[0]] || '';
    for (const b of el.querySelectorAll('[data-tool]')) b.classList.toggle('on', b.dataset.tool === tool);
    $('[data-undo]').disabled = !undo.length;
    $('[data-watch]').disabled = !c.ok;
    // Cyan corners only where they say something: the cells the guard being drawn can step to next (his round filled in), and the
    // edge cells an entry or an exit can go to. (Most tools work on any floor cell, and corners everywhere are noise.)
    const g = tool === 'guard' && sel >= 0 ? vault.defenses[sel] : null, marks = [];
    if (g) {
      const end = lineOf(g.path).at(-1);
      for (const i of targets(vault, 'guard', sel)) { const d = Math.abs(i % W - end[0]) + Math.abs((i / W | 0) - end[1]); if (d === 1) marks.push([i, 1]); }
      for (const [x, y] of g.path) marks.push([y * W + x, 2]);
    } else if (tool === 'entry' || tool === 'exit') for (const i of targets(vault, tool)) marks.push([i, 1]);
    scene?.setHints(marks);
    hud();
  }
  // The scene is built again for every change (the renderer and the figures are handed on, so it is quick); taps that come
  // while it is building are already in `vault` and the next build shows them.
  let rebuilding = null, again = false;
  function rebuild() {
    if (rebuilding) { again = true; return rebuilding; }
    rebuilding = (async () => {
      do {
        again = false;
        const keep = scene?.release();
        scene = null;
        let made;
        try { made = await createScene($('.heist-stage'), vault, { padTop: editPads()[0], padBottom: editPads()[1], keep, onFx: name => bus.emit('fx', name), onStats: s => { if (debug) showDebug(s); } }); }
        catch (e) { console.error(e); break; }
        if (live !== L) { made.dispose(); return; }
        scene = made;
        state = initial(vault);
        scene.sync(state, ['goggles']);   // the owner knows which plates are real
        scene.showRoutes(true);
        scene.setQuiet('edit');
      } while (again);
      rebuilding = null;
      editorView();
    })();
    return rebuilding;
  }
  async function openEditor() {
    if (mode !== 'menu' || level !== 'mine' || !scene) return;
    setMode('edit');
    sel = -1;
    undo.length = 0;
    state = initial(vault);
    scene.sync(state, ['goggles']);
    scene.showRoutes(true);
    scene.setQuiet('edit');
    scene.setPads(...editPads());
    editorView();
  }
  async function closeEditor() {
    await rebuilding;
    if (!scene) return;
    scene.showRoutes(false);
    scene.setQuiet(true);
    state = initial(vault);
    scene.sync(state, []);
    setMode('menu');
    scene.setPads(...padFor('.heist-menu h1', '.heist-levels'));
    hud();
  }
  function shake(sel) { const b = $(sel); b?.classList.remove('no'); void b?.offsetWidth; b?.classList.add('no'); }
  function editAt(cell) {
    if (cell < 0) return;
    const r = editVault(vault, tool, cell, sel);
    if (!r.changed) { if (r.sel !== sel) { sel = r.sel; editorView(); } else shake('.heist-palette'); return; }
    undo.push({ vault, sel });
    if (undo.length > 60) undo.shift();
    vault = mineVault = r.vault;
    sel = r.sel;
    saveMine();
    editorView();
    rebuild();
  }
  function stepBack() {
    const u = undo.pop();
    if (!u) return;
    vault = mineVault = u.vault;
    sel = u.sel;
    saveMine();
    editorView();
    rebuild();
  }
  // The shortest raid a careful thief with no gadget makes on this vault, played out, then back to the editor.
  async function watch() {
    if (mode !== 'edit' || !scene) return;
    await rebuilding;
    const sol = solve(vault, []);
    if (!sol) { shake('[data-watch]'); return; }
    watching = true;
    setMode('busy');
    scene.showRoutes(false);
    state = initial(vault);
    await scene.intro(state, [], true);
    setMode('replay');
    for (const mv of sol.moves) { if (live !== L || !(await act(mv, 1.6, []))) break; }
    watching = false;
    if (live !== L || !scene) return;
    await new Promise(r => setTimeout(r, 500));
    state = initial(vault);
    scene.sync(state, ['goggles']);
    scene.showRoutes(true);
    scene.setQuiet('edit');
    setMode('edit');
    scene.setPads(...editPads());
    editorView();
  }

  // ----- controls -----
  function tap(cell) {
    if (mode === 'edit') { editAt(cell); return; }
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
    if (Math.hypot(dx, dy) > 34 && !armed && mode === 'play') act(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U'));
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
    if (b.dataset.back !== undefined) { if (mode === 'edit') closeEditor(); else location.replace('#/tools'); return; }
    if (b.dataset.tool) { if (mode === 'edit') { tool = b.dataset.tool; if (tool !== 'guard') sel = -1; editorView(); } return; }
    if (b.dataset.undo !== undefined) { if (mode === 'edit') stepBack(); return; }
    if (b.dataset.watch !== undefined) { watch(); return; }
    if (b.dataset.edit !== undefined) { openEditor(); return; }
    if (b.dataset.sound !== undefined) { el.classList.toggle('muted', !audio.toggle()); return; }
    if (b.dataset.level) {
      const l = b.dataset.level === 'mine' ? 'mine' : +b.dataset.level;
      if (mode === 'menu' && l !== level) { level = l; seed = 1; try { localStorage.setItem('tanara:heist:level', level); } catch { /* private mode */ } build(); }
      return;
    }
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
    get mine() { return mineVault; }, get editor() { return { tool, sel, check: mineCheck, undo: undo.length }; }, openEditor, closeEditor, watch,
    useTool(t) { tool = t; if (t !== 'guard') sel = -1; editorView(); }, editAt, stepBack, rebuilt: () => rebuilding,
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
