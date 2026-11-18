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
import { icon, toast } from './dom.js';
import { fa } from '../lib/fa.js';
import { generate, initial, play, solve, nextThreats, MAX_TURNS, ALARM_TURNS, LEVELS, W, H, EMP_RADIUS, SMOKE_RANGE, BAIT_RANGE } from '../domain/heist.js';
import { createScene } from './heistScene.js';
import { createAudio } from './heistAudio.js';
import { edit as editVault, targets, check, lineOf } from '../domain/heistEdit.js';
import * as net from '../data/heistNet.js';
import { LESSONS, stepOf, guide, isRed, canFinish, spots, firsts, FIRST, GUIDE, RULES, POWER, FAIL, WELCOME, START, NO_RED, DONE } from '../domain/heistTutorial.js';

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
// a raid on my vault, as I watch it later: what the thief did
const DID = { escaped: 'دستبرد زد', escaped_alarm: 'با آژیر فرار کرد', caught: 'گیر افتاد', timeout: 'گیر افتاد', fled: 'دست خالی رفت' };
// why the server would not let a raid begin
// The walk through the menu after the lessons: what each thing is, in a line (shown only for what is on the screen).
const COACH = [
  ['.heist-wallet > b', 'سکه: از دستبرد، و هر روز ثبت کامل ۱۰۰ تا'],
  ['.heist-left', 'دستبردهای امروز؛ ثبت کامل و تحرک بیشترش می‌کنند'],
  ['[data-diamond]', 'اولین کسی که الماس را بخرد برنده‌ی فصل است'],
  ['.heist-targets', 'به گاوصندوق اعضا دستبرد بزن و سکه‌شان را ببر'],
  ['.heist-levels [data-level="1"]', 'تمرین؛ در روز ثبت کامل سکه هم می‌دهد'],
  ['.heist-kit', 'ابزارها؛ هر ۷ روز پشت‌سرهم ثبت کامل، یکی تازه'],
  ['[data-level="mine"]', 'گاوصندوق خودت؛ بچینش تا بقیه به آن بزنند'],
];
const REFUSED = { shield: 'این گاوصندوق سپر دارد', limit: 'دستبردهای امروز تمام شد', coins: 'سکه‌ی کافی نداری' };

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
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2-2.4 3.6M12 17v.4"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  bad: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.3v.4"/>'),
  coin: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#ffc94a"/><circle cx="12" cy="12" r="6.2" fill="none" stroke="#b8861f" stroke-width="1.6"/><path d="M12 8.6v6.8" stroke="#b8861f" stroke-width="1.8" stroke-linecap="round"/></svg>',
  shield: svg('<path d="M12 3l7 3v5.5c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5V6z"/>'),
  // the tutorial's cards and guide: a red cell as the board draws it, the lit corners, the alarm, the gadgets, activity
  red: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="currentColor" fill-opacity=".2" stroke="currentColor" stroke-width="1.9"/><path d="M7 17L17 7M3.9 13.1l9.2-9.2M10.9 20.1l9.2-9.2" stroke="currentColor" stroke-opacity=".55" stroke-width="1.4"/></svg>',
  corners: svg('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
  alarm: svg('<path d="M6.5 18v-5.5a5.5 5.5 0 0 1 11 0V18"/><path d="M4 18h16v3H4z"/><path d="M12 2.5v2M4.2 5.7l1.5 1.5M19.8 5.7l-1.5 1.5"/>'),
  kit: svg('<rect x="3" y="7.5" width="18" height="12.5" rx="2"/><path d="M9 7.5v-2A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5v2M3 13h18M10.5 13v2h3v-2"/>'),
  move: svg('<path d="M8.5 3.5c1.7 0 2.6 2 2.4 4.4-.2 2.1-1 3.6-2.6 3.6S5.8 9.9 5.9 7.6C6 5.3 6.9 3.5 8.5 3.5z"/><path d="M6.4 14.2l4.3.4-.3 2.4a2.2 2.2 0 0 1-4.3-.4z"/><path d="M15.5 7.5c-1.7 0-2.6 2-2.4 4.4.2 2.1 1 3.6 2.6 3.6s2.5-1.6 2.4-3.9c-.1-2.3-1-4.1-2.6-4.1z"/><path d="M17.6 18.2l-4.3.4.3 2.4a2.2 2.2 0 0 0 4.3-.4z"/>'),
};
ICON.diamond = ICON.loot;
// The tutorial's pointing hand (its fingertip, at 22.5,3.5 of 48, is what it points with).
const HAND = '<svg viewBox="0 0 48 48" width="52" height="52" aria-hidden="true"><path d="M19 30V7a3.5 3.5 0 0 1 7 0v11a3.25 3.25 0 0 1 6.5 0v2a3 3 0 0 1 6 0v2.5a2.75 2.75 0 0 1 5.5 0V33c0 7.5-5.5 12.5-12.5 12.5H27c-4.5 0-7.5-2-10-5.5l-6.8-9.4a3.2 3.2 0 0 1 4.9-4.1z" fill="#f4f7ff" stroke="#071022" stroke-width="2.2" stroke-linejoin="round"/><path d="M26 18v6M32.5 20v5M38.5 22.5v4" stroke="#071022" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>';

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
      <div class="heist-tip" hidden aria-live="polite"><p></p><button data-tipx aria-label="بستن">${ICON.close}</button></div>
      <div class="heist-spots" aria-hidden="true"></div>
      <div class="heist-hand" hidden aria-hidden="true"><div>${HAND}</div></div>
      <div class="heist-praise" hidden aria-live="polite"><span>${ICON.ok}</span><b></b></div>
      <div class="heist-card" hidden role="dialog" aria-modal="true"></div>
      <div class="heist-coach" hidden><i></i><p></p></div>
      <div class="heist-wallet">${ICON.coin}<b></b><span class="heist-left" aria-hidden="true"></span><span class="heist-trophies" aria-label="فصل‌های برده"></span>
        <button class="heist-diamond" data-diamond aria-label="الماس فصل">${ICON.loot}<small dir="rtl"></small></button></div>
      <div class="heist-top">
        <span class="heist-alarm" aria-hidden="true">${'<i></i>'.repeat(ALARM_TURNS)}</span>
        <span class="heist-loot" aria-hidden="true">${ICON.loot}</span>
        <span class="heist-turn"><b>${fa(0)}</b><i>${fa(MAX_TURNS)}</i></span>
        <span class="heist-dots">${'<i></i>'.repeat(LESSONS.length)}</span>
      </div>
      <div class="heist-tools"></div>
      <div class="heist-menu">
        <h1>سرقت بزرگ</h1>
        <div class="heist-targets" role="group" aria-label="اعضا"></div>
        <div class="heist-levels" role="group" aria-label="سطح">${Array.from({ length: LEVELS }, (_, i) => `<button data-level="${i + 1}">${fa(i + 1)}</button>`).join('')}<button data-level="mine" aria-label="گاوصندوق من">${ICON.mine}</button></div>
        <div class="heist-kit" role="group" aria-label="ابزار">${ALL.map(n => `<button data-kit="${n}" aria-label="${NAMES[n]}">${ICON[n]}</button>`).join('')}</div>
        <div class="heist-go-row">
          <button class="heist-btn" data-inbox aria-label="دستبردهای تازه">${ICON.eye}<b class="heist-badge"></b></button>
          <button class="heist-btn" data-edit aria-label="چیدن گاوصندوق">${ICON.edit}</button>
          <button class="heist-btn heist-go" data-go aria-label="شروع">${ICON.go}</button>
          <button class="heist-btn heist-help" data-help aria-label="آموزش">${ICON.help}</button>
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
        <p><span class="heist-turns"></span><span class="heist-gain"></span></p>
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
  let mineVault = null, drafted = false;
  try { const v = JSON.parse(localStorage.getItem('tanara:heist:mine') || 'null'); if (v && !check(v).errors.includes('shape')) { mineVault = v; drafted = true; } } catch { /* none yet */ }
  mineVault ||= generate(11, 2);
  // Online (phase 4): my coins and raids left, the other members' vaults, the raids on my vault I haven't watched, the raid under way
  // on the server, and the one from my inbox being watched.
  let online = false, wallet = null, members = [], inbox = [], raid = null, viewing = null;
  const member = () => (typeof level === 'string' && level.startsWith('u:') ? members.find(m => m.id === level.slice(2)) || null : null);
  const shielded = m => !!m?.shield_until && Date.parse(m.shield_until) > Date.now();
  // Phase 5: what the member's diet habits give (from the server), the gadgets they own and their slots, the season and its diamond.
  let habit = null, owned = ALL.slice(), slots = KIT_MAX, season = null, trophies = 0, armedBuy = 0;
  const budget = () => habit?.budget ?? 100;
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
      // (in a lesson a gadget waits for the line about it, so it isn't spent before it can work)
      b.disabled = !state || k < 0 || !!(state.used & (1 << k)) || !gadgetOpen(b.dataset.g);
      b.classList.toggle('armed', armed === b.dataset.g);
    }
    // the lockpick lights up next to a locked door
    const pick = $('[data-p="lockpick"]');
    if (pick) pick.classList.toggle('ready', !!state && state.status === 'play' && doorCells.some((c, j) => state.doors[j] !== 9 && Math.abs(c % W - state.p % W) + Math.abs((c / W | 0) - (state.p / W | 0)) === 1));
    for (const b of el.querySelectorAll('[data-level]')) b.classList.toggle('on', b.dataset.level === String(level));
    el.classList.toggle('mine', level === 'mine');
    el.classList.toggle('member', !!member());
    el.classList.toggle('online', online);
    const m = member();
    $('.heist-menu h1').textContent = level === 'mine' ? 'گاوصندوق من' : m ? m.name : 'سرقت بزرگ';
    el.classList.toggle('learning', lesson >= 0);
    $('[data-go]').disabled = (level === 'mine' && !mineCheck.ok) || (!!m && (shielded(m) || !wallet || wallet.raidsLeft <= 0 || wallet.coins < wallet.fee));
    if (wallet) {
      $('.heist-wallet b').textContent = fa(wallet.coins);
      // a dot for each raid on members today: lit while left, dim once used, hollow while still to earn (a full-log day, some activity)
      const earned = habit ? habit.raids : wallet.perDay;
      $('.heist-left').innerHTML = Array.from({ length: wallet.perDay }, (_, k) => `<i class="${k < wallet.raidsLeft ? 'on' : k < earned ? '' : 'todo'}"></i>`).join('');
      $('.heist-trophies').innerHTML = trophies ? `${ICON.loot}<b>${fa(trophies)}</b>` : '';
      if (season) {
        const left = Math.max(0, Math.round((Date.parse(season.ends) - Date.parse(season.today)) / 864e5) + 1), d = $('[data-diamond]');
        d.style.setProperty('--p', Math.min(1, wallet.coins / season.diamond).toFixed(3));
        d.classList.toggle('ready', wallet.coins >= season.diamond);
        d.classList.toggle('armed', !!armedBuy);
        d.querySelector('small').textContent = `${fa(left)} روز`;
      }
      for (const b of el.querySelectorAll('.heist-levels [data-level]')) b.classList.toggle('pays', /^\d$/.test(b.dataset.level) && !wallet.practicePaid.includes(+b.dataset.level));
    }
    const mineBtn = $('[data-level="mine"]');
    mineBtn.classList.toggle('news', inbox.length > 0);
    $('[data-inbox]').hidden = !(level === 'mine' && inbox.length);
    $('.heist-badge').textContent = inbox.length ? fa(inbox.length) : '';
    // gadgets not earned yet are locked; the next one shows how far the run of full-log days has come
    const next = ['decoy', 'lockpick', 'goggles'].find(g => !owned.includes(g));
    for (const b of el.querySelectorAll('[data-kit]')) {
      const n = b.dataset.kit, mine = owned.includes(n);
      b.classList.toggle('on', kit.includes(n));
      b.classList.toggle('locked', !mine);
      b.classList.toggle('next', !mine && n === next && !!habit);
      if (n === next && habit) b.style.setProperty('--p', ((7 - habit.toNext) / 7).toFixed(3));
    }
    $('.heist-kit').classList.toggle('three', slots > 2);
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
    // a raid on my vault I am watching: told from my side (the thief caught is my win)
    el.classList.toggle('won', viewing ? !win && r.status !== 'fled' : win);
    el.classList.toggle('viewing', !!viewing);
    $('.heist-result h2').textContent = viewing ? `${viewing.thief_name} ${DID[r.status] || ''}` : TITLES[r.status] || '';
    $('.heist-turns').innerHTML = `<b>${fa(r.turns)}</b> نوبت`;
    gain(viewing ? (win ? -viewing.loot : r.status === 'fled' ? 0 : viewing.fee) : null);
  });
  // the coins a raid made or cost, under the result (filled in when the server answers)
  function gain(n) {
    const g = $('.heist-gain');
    g.className = `heist-gain${n > 0 ? ' up' : n < 0 ? ' down' : ''}`;
    g.innerHTML = n ? `${ICON.coin}<b dir="ltr">${n > 0 ? '+' : '−'}${fa(Math.abs(n))}</b>` : '';
  }

  // The tools bar: the first gadget, wait, the second. A gadget used with a tap is a button; one that just works is a lit badge.
  function tools() {
    const g = n => !n ? '<i class="heist-slot"></i>' : TAPPED.has(n)
      ? `<button class="heist-btn" data-g="${n}" aria-label="${NAMES[n]}">${ICON[n]}</button>`
      : `<span class="heist-btn heist-passive" data-p="${n}" role="img" aria-label="${NAMES[n]}">${ICON[n]}</span>`;
    $('.heist-tools').innerHTML = `${g(kit[0])}<button class="heist-btn" data-wait aria-label="صبر">${ICON.wait}</button>${g(kit[1])}${kit[2] ? g(kit[2]) : ''}`;
  }
  function toggleKit(n) {
    if (!owned.includes(n)) { toast('با ۷ روز پشت‌سرهم ثبت کامل باز می‌شود'); return; }
    kit = kit.includes(n) ? kit.filter(x => x !== n) : [...kit, n].slice(-slots);
    try { localStorage.setItem('tanara:heist:kit', kit.join(',')); } catch { /* private mode */ }
    hud();
  }

  // The free space above and below the board: in a raid only the top bar and the tools; on the menu and the result, the title above and
  // everything from their first row of buttons down, so nothing sits on the board.
  const pads = { play: [70 + safeArea('top'), 112 + safeArea('bottom')] };
  pads.learn = [pads.play[0] + 52, pads.play[1]];   // room for the lesson's line above the board
  const padFor = (title, row) => [Math.max(pads.play[0], $(title).getBoundingClientRect().bottom + 6),
    Math.max(pads.play[1], el.clientHeight - $(row).getBoundingClientRect().top + 12)];

  // ----- a vault and its scene -----
  async function build(given = null) {
    const mine = ++building;
    setMode('loading');
    $('.heist-load i').style.width = '8%';
    const keep = scene?.release();
    scene = null;
    vault = given || (level === 'mine' ? mineVault : member() ? member().vault : generate(seed, level));
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
    } else {
      // only the moves that are safe next turn are lit (red is drawn by the scene)
      const n = nextThreats(vault, state), red = new Set([...n.seen, ...n.near, ...n.cam, ...n.laser]);
      for (let d = 0; d < 4; d++) {
        const to = (y + DY[d]) * W + x + DX[d];
        if (play(vault, state, DIRS[d], kit) && !red.has(to)) out.push([to, 1]);
      }
    }
    return out;
  }
  const refresh = () => { bus.emit('state'); scene?.setHints(hints()); };

  // One turn. Lessons go a little slower.
  async function act(mv, speed = lesson >= 0 ? 0.8 : 1, gadgets = kit) {
    if (mode !== 'play' && mode !== 'replay') return false;
    const r = play(vault, state, mv, gadgets);
    if (!r) { el.classList.remove('no'); void el.offsetWidth; el.classList.add('no'); return false; }
    const was = mode, prev = state, sc = scene;
    // The guard lesson won't let the thief step on red while there is a safe way: it says why and shows where.
    if (lesson >= 0 && was === 'play' && LESSONS[lesson].protect && guide(vault, state) && (isRed(state, vault, r.state.p) || r.state.status === 'caught')) { warn(); return false; }
    hideHand();
    if (lesson >= 0 && was === 'play') hist.push({ state: prev, moves: moves.length });
    if (was === 'play') moves.push(mv);
    armed = null;
    setMode('busy');
    state = r.state;
    bus.emit('state');
    await bus.emit('turn', { prev, next: state, events: r.events, speed, kit: gadgets });
    if (live !== L || scene !== sc) return false;
    for (const e of r.events) bus.emit('event', e);
    if (lesson >= 0 && was === 'play' && lessonTurn(r.events)) return true;
    if (state.status !== 'play') {
      hideTip();
      if (watching) return true;
      if (raid && !viewing) finishRaid();
      await bus.emit('result', { status: state.status, turns: state.t, alarm: state.alarm > 0 });
      setMode('result');
      scene?.setPads(...padFor('.heist-result h2', '.heist-result p'));
      return true;
    }
    setMode(was);
    if (was === 'play') {
      refresh();
      if (lesson >= 0) { teach(); nudge(); }
      // a real raid: the first alarm ever gets its line at once; a first-time line stays four turns, then the next one
      else if (r.events.some(e => e.e === 'alarm') && !tipsSeen.has('alarm')) nextTip('alarm');
      else if (tipLeft && --tipLeft === 0) nextTip();
    }
    return true;
  }

  // The raid is over: the server replays it and moves the coins; the result screen shows what it made.
  function finishRaid() {
    const id = raid, sent = moves.slice();
    raid = null;
    return net.call('finish', { raid: id, moves: sent }).then(r => {
      if (wallet) wallet.coins = r.coins;
      gain(r.loot > 0 ? r.loot : r.fee && (r.status === 'caught' || r.status === 'timeout') ? -r.fee : 0);
      if (typeof level === 'number' && r.loot > 0 && wallet && !wallet.practicePaid.includes(level)) wallet.practicePaid.push(level);
      hud();
    }).catch(() => {});
  }
  async function begin(fast) {
    if (!scene) return;
    // A raid on a member or a practice vault begins on the server (the fee, the daily limit, the shield); raiding my own vault is a test.
    raid = null;
    if (online && (member() || typeof level === 'number')) {
      const m = member();
      try {
        const r = await net.call('start', m ? { target: m.id, gadgets: kit } : { practice: { level, seed }, gadgets: kit });
        raid = r.raid;
        if (live !== L) { finishRaid(); return; }   // the page was left while the server answered: the raid ends at once
        if (m && wallet) { wallet.coins -= r.fee; wallet.raidsLeft = Math.max(0, wallet.raidsLeft - 1); }
      } catch (e) {
        toast(REFUSED[e.code] || 'اینترنت را بررسی کن.');
        refreshOnline();
        return;
      }
    }
    state = initial(vault);
    moves = [];
    armed = null;
    hist = [];
    hideTip();
    tools();
    scene.setPads(...(lesson >= 0 ? pads.learn : pads.play), fast);
    setMode('busy');
    if (lesson >= 0) { step = 0; teach(); }
    el.classList.remove('won');
    bus.emit('state');
    const sc = scene;
    await scene.intro(state, kit, fast);
    if (live !== L || scene !== sc) return;
    scene.setQuiet(false);
    setMode('play');
    refresh();
    if (lesson >= 0) { teach(); nudge(); } else firstTips();
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

  // ----- the tutorial (2026-11-18; DESIGN-heist.md «آموزش») -----
  // The first open shows a welcome card with a choice, never a jump into a lesson. Five lessons, each a small vault played for real after a
  // card that says what it teaches; one line at a time, a pointing hand when the player hesitates, and when it goes wrong a card that says
  // why and offers to go back to just before the mistake. Then the three rules, what the diet gives, and a walk through the menu. «?» on
  // the menu opens the guide (every sign), which can start the lessons again. Real raids get one line the first time something new shows.
  const TUTORIAL = 'tanara:heist:tutorial';   // 'done' once finished or skipped
  let lesson = -1, step = 0, before = null, hist = [], learned = false, later = '';
  try { learned = localStorage.getItem(TUTORIAL) === 'done'; later = localStorage.getItem('tanara:heist:later') || ''; } catch { /* private mode */ }
  const today = () => new Date().toDateString();
  const setLearned = () => { learned = true; try { localStorage.setItem(TUTORIAL, 'done'); } catch { /* private mode */ } };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const kicker = i => `درس ${fa(i + 1)} از ${fa(LESSONS.length)}`;
  const flash = (sel, ms) => { const b = $(sel); b?.classList.add('hint'); setTimeout(() => b?.classList.remove('hint'), ms); };
  // in a lesson a gadget opens with the line about it
  const gadgetOpen = g => { if (lesson < 0) return true; const k = LESSONS[lesson].steps.findIndex(s => s.ui === `[data-g="${g}"]`); return k < 0 || k <= step; };

  // A card at the bottom, over the board (which moves up to stay in view). It resolves with the button pressed: its key, 'back' for the
  // back button, 'replaced' when something else took its place.
  let cardDone = null, cardSeq = 0;
  function showCard(o) {
    const c = $('.heist-card'), seq = ++cardSeq;
    cardDone?.('replaced');
    cardDone = null;
    hideHand(); hideTip();
    $('.heist-praise').hidden = true;
    const pips = o.dots >= 0 ? `<span class="heist-pips">${LESSONS.map((_, k) => `<i class="${k < o.dots ? 'done' : k === o.dots ? 'on' : ''}"></i>`).join('')}</span>` : '';
    c.className = `heist-card${o.tone ? ` ${o.tone}` : ''}`;
    c.innerHTML = `${o.close ? `<button class="heist-x" data-card="close" aria-label="${o.close}">${ICON.close}</button>` : ''}
      ${o.kicker ? `<p class="heist-kicker"><span>${o.kicker}</span>${pips}</p>` : ''}
      <h2>${o.title}</h2>
      ${o.text ? `<p class="heist-card-text">${o.text}</p>` : ''}
      ${o.rows?.length ? `<ul>${o.rows.map(([k, t]) => `<li><span class="heist-ic" data-i="${k}">${ICON[k] || ''}</span><span>${t}</span></li>`).join('')}</ul>` : ''}
      <div class="heist-card-btns">${o.buttons.map(([key, label, ic, main]) => `<button data-card="${key}"${main ? ' class="main"' : ''}>${ic ? ICON[ic] : ''}<span>${label}</span></button>`).join('')}</div>`;
    c.hidden = false;
    setMode('card');
    // (offsetTop: where the card rests, not where its slide-in starts)
    if (o.lift !== false && scene) scene.setPads(pads.play[0], Math.max(pads.play[1], el.clientHeight - c.offsetTop + 14));
    if (o.spots) setTimeout(() => { if (seq === cardSeq && !c.hidden) ring(o.spots); }, 560);
    return new Promise(res => { cardDone = res; });
  }
  function closeCard(action) {
    const c = $('.heist-card'), done = cardDone;
    cardDone = null;
    ring(null);
    if (c.hidden) return;
    c.hidden = true;
    done?.(action);
  }
  // rings round cells on the board (what a lesson's card is about)
  function ring(list) {
    $('.heist-spots').innerHTML = !list || !scene ? '' : list.map(({ cell, kind }) => {
      const r = scene.cellRect(cell), d = Math.max(46, r.w * 1.3);
      return `<i class="${kind}" style="left:${r.x.toFixed(1)}px;top:${r.y.toFixed(1)}px;width:${d.toFixed(1)}px;height:${d.toFixed(1)}px"></i>`;
    }).join('');
  }
  function toMenu() {
    closeCard('replaced');
    if (!scene) return;
    setMode('menu');
    scene.setPads(...padFor('.heist-menu h1', '.heist-levels'));
    hud();
  }

  // The line above the board (a lesson's line, a warning, or a real raid's first-time line).
  function showTip(text, warn = false) {
    const tip = $('.heist-tip'), p = tip.querySelector('p');
    tip.classList.toggle('warn', warn);
    tip.querySelector('[data-tipx]').hidden = lesson >= 0;
    if (!tip.hidden && p.textContent === text) return;
    p.textContent = text;
    tip.hidden = false;
    tip.classList.remove('pop'); void tip.offsetWidth; tip.classList.add('pop');
  }
  function hideTip() { $('.heist-tip').hidden = true; tipLeft = 0; }

  // the lesson's line for where the raid stands, and the button it is about lit up
  let warned = 0;
  function teach() {
    const Ls = LESSONS[lesson];
    if (!Ls || !state || mode === 'card') return;
    if (state.status === 'play') step = stepOf(Ls, state, step);
    const s = Ls.steps[step];
    if (!warned) showTip(armed && s.armed ? s.armed : s.text);
    for (const b of el.querySelectorAll('.heist-tools .hint')) b.classList.remove('hint');
    if (s.ui && !armed) $(s.ui)?.classList.add('hint');
    [...el.querySelectorAll('.heist-dots i')].forEach((d, k) => { d.className = k < lesson ? 'done' : k === lesson ? 'on' : ''; });
    hud();
  }
  // a tap toward red in the guard lesson: why not, and where instead
  function warn() {
    clearTimeout(warned);
    showTip(NO_RED, true);
    buzz(40);
    warned = setTimeout(() => { warned = 0; if (lesson >= 0 && mode === 'play') teach(); }, 1800);
    nudge(0);
  }

  // The pointing hand: after a moment of doing nothing (at once in the first lesson), at the next safe tap; for a gadget's line, at its
  // button and then (armed) at the thief. It comes from the side, so it never covers what is ahead.
  let handTimer = 0;
  function hideHand() { clearTimeout(handTimer); $('.heist-hand').hidden = true; }
  function nudge(delay) {
    hideHand();
    if (lesson < 0 || mode !== 'play') return;
    handTimer = setTimeout(showHand, delay ?? Math.max(700, LESSONS[lesson].hand));
  }
  const centre = sel => { const r = $(sel)?.getBoundingClientRect(); return r?.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; };
  function showHand() {
    if (lesson < 0 || mode !== 'play' || !scene || state.status !== 'play') return;
    const s = LESSONS[lesson].steps[step], g = s.ui?.match(/data-g="(\w+)"/)?.[1];
    let at = null, turn = 0;
    if (g && kit.includes(g) && !(state.used & (1 << kit.indexOf(g)))) {
      if (armed === g) { at = scene.cellRect(state.p); turn = -90; } else { at = centre(s.ui); turn = 180; }
    } else {
      const next = guide(vault, state);
      if (!next) return;
      if (next.move === 'W') { at = centre('[data-wait]'); turn = 180; }
      else { at = scene.cellRect(next.cell); turn = next.move === 'U' || next.move === 'D' ? -90 : at.y + 60 > el.clientHeight - pads.play[1] ? 180 : 0; }
    }
    if (!at) return;
    const h = $('.heist-hand');
    h.style.translate = `${(at.x - 24.4).toFixed(1)}px ${(at.y - 3.8).toFixed(1)}px`;
    h.style.rotate = `${turn}deg`;
    h.hidden = false;
  }

  // ----- the lessons -----
  async function learn(i) {
    if (lesson < 0) before = { level, kit };
    lesson = i;
    step = 0;
    hist = [];
    level = 'learn';
    kit = LESSONS[i].kit.slice();
    hideTip(); hideHand();
    closeCard('replaced');
    await build(LESSONS[i].vault);
    if (live !== L || lesson !== i || !scene) return;
    const Ls = LESSONS[i];
    const a = await showCard({ kicker: kicker(i), dots: i, title: Ls.title, text: Ls.goal, rows: Ls.rows, close: 'رد کردن آموزش',
      buttons: [['go', START, 'go', true]], spots: spots(Ls) });
    if (lesson !== i) return;
    if (a === 'go') begin(i > 0);
    else if (a === 'close' || a === 'back') leaveLesson(true);
  }
  // After a lesson's turn: won, gone wrong (caught, the alarm, out with nothing, the pulse wasted), or on. True when it is over.
  function lessonTurn(events) {
    const Ls = LESSONS[lesson];
    if (state.status === 'escaped') { passLesson(); return true; }
    const alarm = events.find(e => e.e === 'alarm'), caught = events.find(e => e.e === 'caught');
    if (state.status !== 'play' || alarm) { failLesson(caught?.by || alarm?.by || state.status); return true; }
    if (Ls.kit.length && Ls.kit.every((_, k) => state.used & (1 << k)) && !canFinish(Ls, state)) { failLesson('stuck'); return true; }
    return false;
  }
  async function passLesson() {
    const i = lesson, p = $('.heist-praise');
    hideTip(); hideHand();
    p.querySelector('b').textContent = DONE;
    p.hidden = false;
    buzz([30, 50, 30]);
    await sleep(1100);
    if (lesson !== i || live !== L) return;
    if (i + 1 < LESSONS.length) learn(i + 1);
    else leaveLesson(false);
  }
  // Why it went wrong; back to the last moment the lesson could still be won from (one step, mostly), or from the start.
  async function failLesson(by) {
    const i = lesson;
    hideTip(); hideHand();
    if (state.alarm) { bus.emit('fx', 'calm'); el.classList.remove('alarm'); }
    let back = -1;
    for (let k = hist.length - 1; k >= 0 && back < 0; k--) if (canFinish(LESSONS[i], hist[k].state)) back = k;
    const [title, text] = FAIL[by] || FAIL.seen;
    const a = await showCard({ kicker: kicker(i), dots: i, title, text, tone: 'fail', close: 'رد کردن آموزش',
      buttons: back >= 0 ? [['undo', FAIL.back, 'undo', true], ['again', FAIL.restart, 'again']] : [['again', FAIL.restart, 'again', true]] });
    if (lesson !== i || !scene) return;
    if (a === 'undo') { const h = hist[back]; hist.length = back; undoTo(h); }
    else if (a === 'again') { scene.rest(initial(vault), kit); begin(true); }
    else if (a === 'close' || a === 'back') leaveLesson(true);
  }
  function undoTo(h) {
    state = h.state;
    moves.length = h.moves;
    armed = null;
    scene.rest(state, kit);
    scene.setPads(...pads.learn);
    setMode('play');
    step = stepOf(LESSONS[lesson], state, 0);
    refresh();
    teach();
    nudge(500);
  }
  // Out of the lessons: done (the rules, what the diet gives, then the menu's walk-through) or skipped (straight to the menu).
  async function leaveLesson(skipped) {
    lesson = -1;
    hist = [];
    hideTip(); hideHand();
    closeCard('replaced');
    $('.heist-praise').hidden = skipped || $('.heist-praise').hidden;
    for (const b of el.querySelectorAll('.hint')) b.classList.remove('hint');
    if (before) { level = before.level; kit = before.kit; before = null; }
    setLearned();
    await build();
    if (live !== L || lesson >= 0 || !scene) return;
    if (!skipped) {
      for (const c of [RULES, POWER]) {
        const a = await showCard({ title: c.title, rows: c.rows, tone: c === RULES ? 'ready' : 'power', buttons: [['next', c.button, c === POWER ? 'go' : null, true]] });
        if (a !== 'next') { if (a === 'back') toMenu(); return; }
      }
    }
    toMenu();
    if (!skipped) setTimeout(coach, 450);
  }

  // The first open: what the game is, and a choice. «بعداً» waits till tomorrow, and «?» glows to say where the lessons are.
  async function welcome() {
    const a = await showCard({ kicker: WELCOME.length, title: WELCOME.title, text: WELCOME.text, tone: 'welcome',
      buttons: [['start', WELCOME.start, 'go', true], ['later', WELCOME.later]] });
    if (a === 'start') learn(0);
    else if (a === 'later' || a === 'back') {
      later = today();
      try { localStorage.setItem('tanara:heist:later', later); } catch { /* private mode */ }
      toMenu();
      flash('[data-help]', 4500);
    }
  }
  // «?»: every sign of the game, and the lessons again
  async function openGuide() {
    if (mode !== 'menu') return;
    const a = await showCard({ title: GUIDE.title, rows: GUIDE.rows, tone: 'guide', lift: false, close: 'بستن', buttons: [['replay', GUIDE.replay, 'again']] });
    if (a === 'replay') learn(0);
    else if (a === 'close' || a === 'back') toMenu();
  }

  // Real raids: one line the first time a vault shows something the lessons didn't (a plate, a door, a gadget taken; the alarm when it
  // first goes off). Each stays four turns or until closed, and is shown once ever.
  const tipsSeen = new Set();
  let tipQueue = [], tipLeft = 0;
  try { for (const k of (localStorage.getItem('tanara:heist:tips') || '').split(',')) if (k) tipsSeen.add(k); } catch { /* private mode */ }
  function firstTips() {
    tipQueue = firsts(vault, kit).filter(k => !tipsSeen.has(k));
    if (tipQueue.length) nextTip();
  }
  function nextTip(k = tipQueue.shift()) {
    if (!k) { hideTip(); if (mode === 'play') scene?.setPads(...pads.play); return; }
    tipsSeen.add(k);
    try { localStorage.setItem('tanara:heist:tips', [...tipsSeen].join(',')); } catch { /* private mode */ }
    showTip(FIRST[k]);
    tipLeft = 4;
    scene?.setPads(...pads.learn);
  }

  // The menu, one thing at a time: a ring round it and its line. A tap anywhere goes on; at the end the start button glows.
  let coachAt = -1, coachList = [];
  function coach() {
    if (mode !== 'menu') return;
    coachList = COACH.filter(([sel]) => { const n = $(sel); const r = n?.getBoundingClientRect(); return n && !n.hidden && r && r.width > 0 && getComputedStyle(n).display !== 'none'; });
    coachAt = -1;
    nextCoach();
  }
  function nextCoach() {
    const box = $('.heist-coach');
    coachAt++;
    if (coachAt >= coachList.length || mode !== 'menu') { box.hidden = true; coachAt = -1; if (mode === 'menu') flash('[data-go]', 5000); return; }
    const [sel, text] = coachList[coachAt], r = $(sel).getBoundingClientRect(), h = el.clientHeight, ring = box.querySelector('i'), p = box.querySelector('p');
    box.hidden = false;
    Object.assign(ring.style, { left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
    p.innerHTML = `${text}<small>${fa(coachAt + 1)} از ${fa(coachList.length)}</small>`;
    const below = r.bottom + 14 + 90 < h;
    Object.assign(p.style, below ? { top: `${r.bottom + 14}px`, bottom: '' } : { top: '', bottom: `${h - r.top + 14}px` });
  }

  // ----- online (phase 4) -----
  async function refreshOnline() {
    if (!(await net.online())) return;
    let s;
    try { s = await net.call('state', drafted && mineCheck.ok ? { vault: mineVault } : {}); } catch { return; }
    if (live !== L) return;
    online = true;
    wallet = { coins: s.me.coins, raidsLeft: s.raidsLeft, perDay: s.rules.raidsPerDay, fee: s.rules.fee, practicePaid: s.practicePaid };
    habit = s.diet || null;
    if (s.kit) { owned = s.kit.gadgets; slots = s.kit.slots; kit = kit.filter(g => owned.includes(g)).slice(0, slots); }
    season = s.season || null;
    trophies = s.me.trophies || 0;
    mineCheck = check(mineVault, budget());
    if (habit?.paidToday) toast(`${fa(habit.paidToday * 100)} سکه برای ثبت کامل`);
    // the last season's winner, once
    try {
      if (s.lastWinner && season && localStorage.getItem('tanara:heist:told') !== String(season.id)) {
        toast(s.lastWinner.me ? 'الماس فصل قبل مال تو شد' : `${s.lastWinner.name} الماس فصل قبل را برد`);
        localStorage.setItem('tanara:heist:told', String(season.id));
      }
    } catch { /* private mode */ }
    members = s.targets || [];
    inbox = s.inbox || [];
    // My vault: a draft on this phone that the rules accept and the server doesn't have yet goes up; a draft still being worked on
    // stays here (others raid the last accepted one); with no draft, the server's is mine.
    const same = JSON.stringify(s.me.vault) === JSON.stringify(mineVault);
    if (drafted && !same && mineCheck.ok) saveOnline();
    else if (!drafted && !same) { mineVault = s.me.vault; mineCheck = check(mineVault, budget()); saveMine(); drafted = true; if (level === 'mine' && mode === 'menu') build(); }
    if (typeof level === 'string' && level.startsWith('u:') && !member()) { level = 1; if (mode === 'menu') build(); }
    $('.heist-targets').innerHTML = members.map(m => `<button data-level="u:${m.id}" class="${shielded(m) ? 'shielded' : ''}">${shielded(m) ? ICON.shield : ''}<span>${esc(m.name)}</span>${m.trophies ? `<i class="heist-cup">${ICON.loot}${fa(m.trophies)}</i>` : ''}</button>`).join('');
    hud();
  }
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let saveTimer = 0;
  function saveOnline(delay = 0) {
    clearTimeout(saveTimer);
    if (!online || !mineCheck.ok) return;
    const v = mineVault;
    saveTimer = setTimeout(() => net.call('save', { vault: v }).catch(() => {}), delay);
  }
  // The oldest raid on my vault I haven't watched, played out on the vault as it was then.
  async function watchInbox() {
    const r = inbox[0];
    if (!r || mode !== 'menu') return;
    viewing = r;
    await build(r.vault);
    if (!scene || viewing !== r) return;
    state = initial(vault);
    setMode('busy');
    await scene.intro(state, r.gadgets || [], true);
    scene.setQuiet(false);
    setMode('replay');
    moves = [];
    for (const mv of r.moves || []) { if (live !== L || !(await act(mv, 1.4, r.gadgets || []))) break; }
    if (state.status === 'play') {   // a raid left open (the thief's app was closed): no moves to show
      await bus.emit('result', { status: r.status, turns: r.turns || 0 });
      setMode('result');
      scene.setPads(...padFor('.heist-result h2', '.heist-result p'));
    }
    net.call('seen', { ids: [r.id] }).catch(() => {});
    inbox = inbox.filter(x => x !== r);
  }
  function leaveViewing() {
    viewing = null;
    el.classList.remove('viewing');
    if (inbox.length) watchInbox(); else build();
  }

  // The season's diamond: its price until there are coins enough; then two taps buy it (the first only arms it).
  async function diamond() {
    if (!season || !wallet || mode !== 'menu') return;
    if (wallet.coins < season.diamond) { toast(`الماس فصل: ${fa(season.diamond)} سکه`); return; }
    if (!armedBuy || Date.now() - armedBuy > 4000) { armedBuy = Date.now(); hud(); toast('یک بار دیگر بزن تا الماس را بخری'); setTimeout(() => { armedBuy = 0; hud(); }, 4000); return; }
    armedBuy = 0;
    try {
      await net.call('buy', { season: season.id });
      toast('الماس مال توست؛ برنده‌ی این فصل شدی');
      buzz([40, 30, 40, 30, 220]);
      try { localStorage.setItem('tanara:heist:told', String(season.id + 1)); } catch { /* private mode */ }
    } catch (e) {
      toast(e.code === 'over' ? 'این فصل تمام شده' : e.code === 'coins' ? 'سکه‌ی کافی نداری' : 'اینترنت را بررسی کن.');
    }
    refreshOnline();
  }

  // ----- the editor -----
  const editPads = () => padFor('.heist-why', '.heist-palette');
  function editorView() {
    mineCheck = check(vault, budget());
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
    drafted = true;
    saveMine();
    editorView();
    saveOnline(1200);
    rebuild();
  }
  function stepBack() {
    const u = undo.pop();
    if (!u) return;
    vault = mineVault = u.vault;
    sel = u.sel;
    saveMine();
    editorView();
    saveOnline(1200);
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
    if (armed === 'emp') { if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) <= EMP_RADIUS) act('E'); else disarm(); return; }
    if (AIMED[armed]) { const mv = `${AIMED[armed][0]}${x},${y}`; if (!play(vault, state, mv, kit)) disarm(); else act(mv); return; }
    const d = DX.findIndex((dx, k) => tx + dx === x && ty + DY[k] === y);
    if (d >= 0) act(DIRS[d]);
  }
  // a gadget put down again (in a lesson the line and the hand follow)
  function disarm() { armed = null; refresh(); if (lesson >= 0) { teach(); nudge(); } }
  const stage = $('.heist-stage');
  let down = null, holdTimer = 0;
  stage.addEventListener('pointerdown', e => {
    down = { x: e.clientX, y: e.clientY, held: false };
    clearTimeout(holdTimer);
    if (lesson >= 0 && mode === 'play') nudge();   // a finger on the board: the hand steps aside, and comes back if nothing happens
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
    if (b.dataset.card) { closeCard(b.dataset.card); return; }
    if (b.dataset.back !== undefined) {
      if (!$('.heist-card').hidden) closeCard('back');
      else if (mode === 'edit') closeEditor(); else if (lesson >= 0) leaveLesson(true); else location.replace('#/tools');
      return;
    }
    if (b.dataset.tipx !== undefined) { if (lesson < 0) nextTip(); return; }
    if (b.dataset.help !== undefined) { openGuide(); return; }
    if (b.dataset.tool) { if (mode === 'edit') { tool = b.dataset.tool; if (tool !== 'guard') sel = -1; editorView(); } return; }
    if (b.dataset.undo !== undefined) { if (mode === 'edit') stepBack(); return; }
    if (b.dataset.watch !== undefined) { watch(); return; }
    if (b.dataset.edit !== undefined) { openEditor(); return; }
    if (b.dataset.sound !== undefined) { el.classList.toggle('muted', !audio.toggle()); return; }
    if (b.dataset.level) {
      const l = b.dataset.level === 'mine' || b.dataset.level.startsWith('u:') ? b.dataset.level : +b.dataset.level;
      if (mode === 'menu' && l !== level) { level = l; seed = 1; try { localStorage.setItem('tanara:heist:level', level); } catch { /* private mode */ } build(); }
      return;
    }
    if (b.dataset.go !== undefined) { if (mode === 'menu') begin(false); return; }
    if (b.dataset.kit) { if (mode === 'menu') toggleKit(b.dataset.kit); return; }
    if (b.dataset.wait !== undefined) { armed = null; act('W'); return; }
    if (b.dataset.g) {
      if (mode === 'play') { armed = armed === b.dataset.g ? null : b.dataset.g; refresh(); if (lesson >= 0) { teach(); nudge(armed ? 300 : undefined); } }
      return;
    }
    if (b.dataset.inbox !== undefined) { watchInbox(); return; }
    if (b.dataset.diamond !== undefined) { diamond(); return; }
    if (b.dataset.again !== undefined) { if (mode === 'result') begin(true); return; }
    if (b.dataset.replay !== undefined) { if (mode === 'result') { if (viewing) { const r = viewing; inbox.unshift(r); watchInbox(); } else replay(); } return; }
    if (b.dataset.next !== undefined) {
      if (mode !== 'result') return;
      if (viewing) leaveViewing(); else { seed++; build(); }
    }
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
    act, begin, replay, solve: (alarm = false) => solve(vault, kit, { alarm })?.moves, learn, get lesson() { return lesson; }, get step() { return step; }, coach,
    get card() { const c = $('.heist-card'); return c.hidden ? null : c.querySelector('h2')?.textContent; }, press: a => closeCard(a), welcome, openGuide,
    get hand() { const h = $('.heist-hand'); return h.hidden ? null : { at: h.style.translate, turn: h.style.rotate }; }, get tip() { const t = $('.heist-tip'); return t.hidden ? null : t.textContent; },
    load(l, s) { level = l; seed = s; return build(); },
    refreshOnline, get habit() { return habit; }, get owned() { return owned; },
    get mine() { return mineVault; }, get editor() { return { tool, sel, check: mineCheck, undo: undo.length }; }, openEditor, closeEditor, watch,
    useTool(t) { tool = t; if (t !== 'guard') sel = -1; editorView(); }, editAt, stepBack, rebuilt: () => rebuilding,
  };

  L.dispose = () => {
    if (raid) finishRaid();   // leaving mid-raid: it ends where it stopped (a timeout)
    clearTimeout(saveTimer);
    if (online && drafted && mineCheck.ok) net.call('save', { vault: mineVault }).catch(() => {});
    building++;
    clearTimeout(holdTimer);
    hideHand();
    clearTimeout(warned);
    window.removeEventListener('keydown', onKey);
    scene?.dispose();
    scene = null;
    audio.dispose();
  };
  // the coach's tap anywhere goes on (and nothing under it is pressed)
  $('.heist-coach').addEventListener('click', e => { e.stopPropagation(); nextCoach(); });
  // The first open builds the menu and then welcomes (never a jump into a lesson).
  build().then(() => { if (live === L && mode === 'menu' && !learned && later !== today()) welcome(); });
  refreshOnline();
}
