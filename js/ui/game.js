/*
  «سرزمین» (beta): the city-builder, opened from «بیشتر» (#/game). Full screen, portrait.
  Drawn with Phaser 4 (loaded from the CDN only when this page opens); the bars, buttons and windows
  are plain HTML over it (styles in css/game.css, icons in gameIcons.js). Logic is in js/domain/ (design
  in GAME.md), the placeholder art in gameArt.js, the finished pictures in img/game/.

  The layout follows the genre (GAME.md §13b): top right the coins, water and gems as bars filled to
  their caps; top left the player's level and medals (tap: the raids); top middle the free builders and
  the shield; bottom left Attack (the road of div forts), bottom right the Shop and, above it, the
  achievements. Drag to look around, pinch (or the wheel) to zoom.
  Tapping a building selects it: its name and level, and round buttons below (info, upgrade with its
  price, train for barracks and camps, finish now with gems while a builder works, clear for an obstacle).
  Upgrade and info open a window with the numbers now and after. Tapping a producer collects what it holds.
  A bought building appears on a free spot as a ghost that can be dragged; ✓ places it.
  Logged meals give coins, active days water, full weeks gems; a day with breakfast, lunch and dinner
  logged puts a chest on the palace (tap it). Raids by the divs (js/domain/raid.js) are fought when the
  page opens; a window then shows what happened, with a replay.
*/
import * as store from '../data/store.js';
import { today } from '../lib/dates.js';
import { fa, faDigits } from '../lib/fa.js';
import {
  KINDS, ROCKS, SHOP, GROUPS, SIZE, EDGE, load, claimAll, settle, fits, freeSpot, place, collect, stored, itemAt, rockAt, left,
  fmtLeft, cap, builders, busy, whyNot, priceOf, countOf, maxCount, maxLv, whyNotUp, upgrade, level, whyNotClear,
  clearRock, speedCost, speedUp, chestReady, openChest, xpLevel, achievements, claimAch, give, palaceLv,
} from '../domain/game.js';
import { TW, TH, iso, polys, scaffoldPolys, drawPreview } from './gameArt.js';
import { TROOPS, TROOP_ORDER, train, untrain, settleArmy, armyRoom, armyUsed, whyNotTrain, opensAt, armyCount } from '../domain/army.js';
import { FORTS, fortLayout, fortOpen, endFort } from '../domain/battle.js';
import { openBattle } from './battle.js';
import { runRaids, unseen, markSeen, shieldLeft } from '../domain/raid.js';
import { I, troopIcon } from './gameIcons.js';

const PHASER = 'https://cdn.jsdelivr.net/npm/phaser@4.2.1/dist/phaser.min.js';
const ZMIN = 0.2, ZMAX = 2.2;

export const RES_ICON = { coin: I.coin, water: I.water, gem: I.gem };
export const troopSvg = (t, s) => troopIcon(t, TROOPS[t].color, s);

// Buildings that already have a picture (art/STYLE.md); the rest are still drawn (gameArt.js).
// The palace (bright chunky style, 2026-11-14) is a Blender render of its Meshy model (art/models/palace-5.glb)
// by art/blender/building.py. Every image is framed exactly on its footprint by art/blender/common.py
// (frame_footprint): as wide as the footprint, its bottom edge on the front corner, so it scales as it is.
// The old desert obstacles (tree, bush, dune) are drawn until the green valley's art (GAME.md §12).
const ART = { palace: 'img/game/palace.webp', caravan: 'img/game/caravan.webp', rock: 'img/game/rock.webp' };
const FIT = {};
// The ground until its picture (§12): green grass, a lighter ring where troops are placed, and a dark
// band of woods round it. OUT tiles of woods are visible past each side.
const OUT = 8;
const GROUP_ICON = { res: I.coin, army: I.swords, def: I.shield, decor: I.trophy };

let phaser = null; // the script's promise
let live = null;   // { game, scene, root, hud } while the page is open

function loadPhaser() {
  if (window.Phaser) return Promise.resolve();
  phaser ||= new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = PHASER; s.async = true; s.onload = ok; s.onerror = () => { phaser = null; fail(new Error('load')); };
    document.head.appendChild(s);
  });
  return phaser;
}

// The saved game, with new logs turned into resources and finished jobs completed (and, when the page
// opens, the raids that came due while it was closed).
function current(opening = false) {
  const p = store.profile() || {};
  const d = store.get();
  const g0 = load(p.game, today());
  const { game: g1, gained } = claimAll(g0, { entries: d.entries, activity: d.activity }, today());
  const { game: g2 } = settle(g1, Date.now());
  const { game: g3 } = settleArmy(g2, Date.now());
  const game = opening ? runRaids(g3, Date.now()) : g3;
  if (game !== p.game) save(game);
  return { game, gained };
}
function save(game) { store.saveProfile({ ...store.profile(), game }); }

export const costHtml = (cost, have) => Object.entries(cost).filter(([, v]) => v > 0)
  .map(([k, v]) => `<span class="gc${have && (have[k] || 0) < v ? ' short' : ''}">${RES_ICON[k](18)}<b>${fa(v)}</b></span>`).join('');
const timeHtml = (ms) => ms ? `<span class="gtime">${I.clock(15)}${faDigits(fmtLeft(ms))}</span>` : '';
const shake = (b) => b.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], 260);
const starsHtml = (n, s = 22, red = false) => `<span class="gstars${red ? ' red' : ''}">${[0, 1, 2].map(i => I.star(s, i < n)).join('')}</span>`;

export function renderGame(root) {
  if (live && root.contains(live.root)) { live.sync(); return; }
  stop();
  if (!(store.profile()?.beta || []).includes('game')) { location.replace('#/tools'); return; }
  document.body.classList.add('game-mode');
  const bar = (r, name) => `<div class="gh-bar" data-res="${r}" aria-label="${name}">
      ${r === 'gem' ? '' : '<span class="gh-max"></span>'}<div class="gh-fill"><i></i><b></b></div><span class="gh-ico">${RES_ICON[r](36)}</span></div>`;
  root.innerHTML = `
    <section class="game">
      <div class="game-stage"></div>
      <div class="gh-top">
        <div class="gh-player">
          <button class="gh-back" data-back aria-label="برگشت">${I.back(20)}</button>
          <div class="gh-level" aria-label="سطح"><span class="gh-xp">${I.xp(44)}<b data-xp></b></span><span class="gh-xpbar"><i></i></span></div>
          <button class="gh-chip gh-medals" data-news aria-label="نشان افتخار">${I.medal(24)}<b data-medals></b></button>
        </div>
        <div class="gh-mid">
          <div class="gh-chip" aria-label="معمار">${I.builder(24)}<b data-builders></b></div>
          <div class="gh-chip gh-shield" aria-label="سپر" hidden>${I.shield(22)}<b></b></div>
        </div>
        <div class="gh-res">${bar('coin', 'سکه')}${bar('water', 'آب')}${bar('gem', 'گوهر')}</div>
      </div>
      <button class="gh-big gh-attack" data-attack aria-label="حمله">${I.swords(46)}<span>حمله</span></button>
      <div class="gh-right">
        <button class="gh-round" data-ach aria-label="دستاوردها">${I.trophy(30)}<span class="gh-dot" hidden></span></button>
        <button class="gh-big gh-shop" data-shop aria-label="فروشگاه">${I.shop(46)}<span>فروشگاه</span></button>
      </div>
      <div class="gh-place" hidden><button class="gb green" data-ok aria-label="بگذار">${I.check(28)}</button><button class="gb red" data-no aria-label="نه">${I.close(26)}</button></div>
      <div class="gh-sel" hidden></div>
      <div class="gw" hidden><div class="gw-box"><div class="gw-head"><button class="gw-back" data-wback hidden aria-label="برگشت">${I.back(18)}</button><b></b><button class="gw-x" data-wx aria-label="بستن">${I.close(18)}</button></div><div class="gw-body"></div></div></div>
      <p class="game-wait">در حال بارگذاری…</p>
    </section>`;
  const el = root.querySelector('.game');
  el.querySelector('[data-back]').onclick = () => location.replace('#/tools');
  const onHash = () => { if (location.hash !== '#/game') stop(); };
  window.addEventListener('hashchange', onHash);
  live = { root: el, onHash, sync: () => {}, game: null };
  const mine = live;
  loadPhaser().then(() => { if (live === mine) start(el, mine); })
    .catch(() => { el.querySelector('.game-wait').textContent = 'بارگذاری نشد؛ اینترنت را بررسی کن.'; });
}

function stop() {
  if (!live) return;
  window.removeEventListener('hashchange', live.onHash);
  live.ro?.disconnect();
  live.game?.destroy(true);
  live = null;
  document.body.classList.remove('game-mode');
}

function start(el, L) {
  const stage = el.querySelector('.game-stage');
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const size = () => [Math.max(1, stage.clientWidth), Math.max(1, stage.clientHeight)];
  const [w, h] = size();
  const placeBar = el.querySelector('.gh-place'), selEl = el.querySelector('.gh-sel');
  const winEl = el.querySelector('.gw'), winBody = winEl.querySelector('.gw-body');
  L.firstGain = current(true);
  let state = L.firstGain.game;
  let placing = null; // { kind, x, y }
  let selected = null; // id of the selected building or obstacle
  let win = null;      // which window is open: 'shop' | 'train' | 'map' | 'ach' | 'news' | 'up' | 'info'
  let scene;

  function showShield(now) {
    const left = shieldLeft(state, now), box = el.querySelector('.gh-shield');
    box.hidden = !left;
    if (left) box.querySelector('b').textContent = faDigits(fmtLeft(left).replace(/:\d\d$/, ''));
  }
  function showBar() {
    for (const r of ['coin', 'water', 'gem']) {
      const box = el.querySelector(`.gh-bar[data-res="${r}"]`);
      box.querySelector('b').textContent = fa(state.res[r]);
      if (r === 'gem') continue;
      const c = cap(state, r);
      box.querySelector('i').style.width = `${Math.min(100, 100 * state.res[r] / c)}%`;
      box.querySelector('.gh-max').textContent = `حداکثر: ${fa(c)}`;
      box.classList.toggle('full', state.res[r] >= c);
    }
    el.querySelector('[data-builders]').textContent = `${fa(builders(state) - busy(state))}/${fa(builders(state))}`;
    const x = xpLevel(state.xp);
    el.querySelector('[data-xp]').textContent = fa(x.lv);
    el.querySelector('.gh-xpbar i').style.width = `${100 * x.into / x.need}%`;
    el.querySelector('.gh-dot').hidden = !achievements(state).some(a => a.ready);
    el.querySelector('[data-medals]').textContent = fa(state.medals || 0);
    showShield(Date.now());
  }
  showBar();

  class Land extends Phaser.Scene {
    preload() {
      for (const [kind, file] of Object.entries(ART)) this.load.image(`art-${kind}`, file);
      this.load.image('coinImg', 'img/game/test/coin.webp');
    }

    create() {
      scene = this;
      const cam = this.cameras.main;
      cam.setBackgroundColor('#2f5e2c');
      this.drawGround();
      this.zoomTo(0.8);
      const [mx, my] = iso(SIZE / 2, SIZE / 2);
      cam.centerOn(mx, my - 20);
      this.textures.exists('spark') || this.makeTextures();
      this.sprites = new Map();
      this.ghost = null;
      this.foot = this.add.graphics().setDepth(1);
      this.sel = this.add.graphics().setDepth(2);
      for (const it of state.items) this.addThing(it);
      for (const r of state.rocks) this.addThing(r);
      this.input.addPointer(1);
      this.bindInput();
      this.showChest();
      el.querySelector('.game-wait').remove();
      const { gained } = L.firstGain || {};
      if (gained) this.time.delayedCall(400, () => flyAll(gained, null));
      if (unseen(state).length) this.time.delayedCall(600, openNews);
    }

    makeTextures() {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xfff2b0, 1); g.fillPoints([{ x: 6, y: 0 }, { x: 12, y: 6 }, { x: 6, y: 12 }, { x: 0, y: 6 }], true);
      g.generateTexture('spark', 12, 12); g.destroy();
    }

    drawGround() {
      const g = this.add.graphics().setDepth(0);
      const dia = (x0, y0, x1, y1) => [iso(x0, y0), iso(x1, y0), iso(x1, y1), iso(x0, y1)].map(([x, y]) => ({ x, y }));
      g.fillStyle(0x2f5e2c, 1); g.fillPoints(dia(-OUT * 3, -OUT * 3, SIZE + OUT * 3, SIZE + OUT * 3), true);
      g.fillStyle(0x6fae4a, 1); g.fillPoints(dia(0, 0, SIZE, SIZE), true);
      g.fillStyle(0x7dbd55, 1); g.fillPoints(dia(EDGE, EDGE, SIZE - EDGE, SIZE - EDGE), true);
      // a few lighter patches so the grass isn't flat
      let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 60; i++) {
        const x = EDGE + r() * (SIZE - 2 * EDGE - 3), y = EDGE + r() * (SIZE - 2 * EDGE - 3), w = 1 + r() * 2.5;
        g.fillStyle(r() < 0.5 ? 0x86c55e : 0x74b44e, 0.7); g.fillPoints(dia(x, y, x + w, y + w * (0.6 + r() * 0.8)), true);
      }
      this.grid = this.add.graphics().setDepth(1);
      const [x0] = iso(-OUT, SIZE + OUT), [x1] = iso(SIZE + OUT, -OUT), [, y0] = iso(-OUT, -OUT), [, y1] = iso(SIZE + OUT, SIZE + OUT);
      this.cameras.main.setBounds(x0, y0, x1 - x0, y1 - y0);
    }

    // The tile grid, shown only while a building is being placed.
    showGrid(on) {
      this.grid.clear();
      if (!on) return;
      this.grid.lineStyle(1, 0xffffff, 0.22);
      for (let i = EDGE; i <= SIZE - EDGE; i++) {
        const a = iso(i, EDGE), b = iso(i, SIZE - EDGE), c = iso(EDGE, i), d = iso(SIZE - EDGE, i);
        this.grid.lineBetween(a[0], a[1], b[0], b[1]); this.grid.lineBetween(c[0], c[1], d[0], d[1]);
      }
    }

    // One building or obstacle: a container at the middle of its footprint (so it bounces from its base).
    addThing(it) {
      const k = KINDS[it.kind] || ROCKS[it.kind];
      const [cx, cy] = iso(it.x + k.size / 2, it.y + k.size / 2);
      const c = this.add.container(cx, cy).setDepth(10 + cy);
      const g = this.add.graphics();
      c.add(g);
      const s = { c, g, it, rock: !KINDS[it.kind], bar: null, text: null, bubble: null };
      this.sprites.set(it.id, s);
      this.paint(s);
      return s;
    }

    paint(s) {
      const { it, g } = s;
      const k = KINDS[it.kind] || ROCKS[it.kind];
      g.clear();
      s.img?.destroy(); s.img = null;
      const art = ART[it.kind] && (s.rock || it.lv > 0) && `art-${it.kind}`;
      if (art) {
        // the image's bottom edge on the footprint's front corner, as wide as the footprint
        s.img = this.add.image(0, k.size * TH / 2, art).setOrigin(0.5, 1);
        s.img.setScale(k.size * TW * (FIT[it.kind] || 1) / s.img.width);
        s.c.addAt(s.img, 0);
      }
      const list = art ? (it.job && !s.rock ? scaffoldPolys(k.size) : []) : polys(it.kind, k.size, { building: !!it.job && !s.rock });
      for (const q of list) {
        g.fillStyle(parseInt(q.fill.slice(1), 16), it.job && !art && !s.rock ? 0.8 : 1);
        const pts = []; for (let i = 0; i < q.pts.length; i += 2) pts.push({ x: q.pts[i], y: q.pts[i + 1] });
        g.fillPoints(pts, true);
      }
      if (art && it.job) s.c.bringToTop(g);
      s.text?.destroy(); s.bar?.destroy(); s.text = s.bar = null;
      if (it.job) {
        s.bar = this.add.graphics(); s.c.add(s.bar);
        s.text = this.add.text(0, -k.size * 22 - 46, '', { fontFamily: 'Vazirmatn, Tahoma', fontSize: '15px', color: '#fff', stroke: '#3b2a17', strokeThickness: 4 }).setOrigin(0.5);
        s.c.add(s.text);
      }
      this.status(s, Date.now());
    }

    // Timer and progress bar while a builder works; a bubble when a producer has something to collect.
    status(s, now) {
      const { it } = s, k = KINDS[it.kind] || ROCKS[it.kind];
      if (it.job) {
        const rest = left(it, now), y = -k.size * 22 - 30, all = it.job.end - it.job.start;
        s.text.setText(faDigits(fmtLeft(rest)));
        s.bar.clear();
        const p = all ? 1 - rest / all : 1;
        s.bar.fillStyle(0x2a1d10, 0.85); s.bar.fillRoundedRect(-30, y, 60, 9, 4);
        s.bar.fillStyle(0x6cc070, 1); s.bar.fillRoundedRect(-29, y + 1, 58 * p, 7, 3);
        return;
      }
      if (s.rock) return;
      const n = stored(it, now), makes = KINDS[it.kind].makes;
      if (n >= 3 && !s.bubble) {
        if (makes === 'coin') s.bubble = this.add.image(0, -k.size * 22 - 34, 'coinImg').setScale(28 / 128);
        else { s.bubble = this.add.graphics({ x: 0, y: -k.size * 22 - 34 }); s.bubble.fillStyle(0x4aa8e0, 1); s.bubble.fillCircle(0, 2, 9); s.bubble.fillTriangle(-8, -1, 8, -1, 0, -14); }
        s.c.add(s.bubble);
        this.tweens.add({ targets: s.bubble, y: s.bubble.y - 6, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      } else if (n < 3 && s.bubble) { s.bubble.destroy(); s.bubble = null; }
    }

    // The daily chest floats over the palace while it is ready (GAME.md §3).
    showChest() {
      const ready = chestReady(state, store.get().entries, today());
      if (!ready) { this.chest?.destroy(); this.chest = null; return; }
      if (this.chest) return;
      const p = state.items.find(i => i.kind === 'palace'), k = KINDS.palace;
      const [cx, cy] = iso(p.x + k.size / 2, p.y + k.size / 2);
      const g = this.add.graphics({ x: cx, y: cy - k.size * 34 - 20 }).setDepth(5500);
      g.fillStyle(0x4a2c12, 1); g.fillRoundedRect(-17, -9, 34, 24, 4);
      g.fillStyle(0xa0612b, 1); g.fillRoundedRect(-15, -7, 30, 20, 3);
      g.fillStyle(0xc47a35, 1); g.fillRoundedRect(-15, -15, 30, 10, { tl: 8, tr: 8, bl: 0, br: 0 });
      g.fillStyle(0xf2c14e, 1); g.fillRect(-3, -6, 6, 8);
      this.tweens.add({ targets: g, y: g.y - 8, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.chest = g;
    }

    bounce(c) {
      this.tweens.killTweensOf(c); c.setScale(1);
      this.tweens.add({ targets: c, scaleY: { from: 0.86, to: 1 }, scaleX: { from: 1.08, to: 1 }, duration: 380, ease: 'Back.easeOut' });
    }
    sparks(x, y) {
      const p = this.add.particles(x, y, 'spark', { speed: { min: 80, max: 220 }, angle: { min: 200, max: 340 }, lifespan: 700, scale: { start: 1.2, end: 0 }, gravityY: 300, quantity: 18, emitting: false }).setDepth(5000);
      p.explode(18); this.time.delayedCall(900, () => p.destroy());
    }
    label(s, text) {
      const k = KINDS[s.it.kind] || ROCKS[s.it.kind];
      const t = this.add.text(s.c.x, s.c.y - k.size * 22 - 40, text, { fontFamily: 'Vazirmatn, Tahoma', fontSize: '16px', color: '#fff', stroke: '#3b2a17', strokeThickness: 4 }).setOrigin(0.5).setDepth(6000);
      this.tweens.add({ targets: t, y: t.y - 14, alpha: { from: 1, to: 0 }, delay: 700, duration: 600, onComplete: () => t.destroy() });
    }

    // The outline of the selected thing's footprint.
    mark(o) {
      this.sel.clear();
      if (!o) return;
      const s = (KINDS[o.kind] || ROCKS[o.kind]).size;
      const pts = [iso(o.x, o.y), iso(o.x + s, o.y), iso(o.x + s, o.y + s), iso(o.x, o.y + s)].map(([x, y]) => ({ x, y }));
      this.sel.lineStyle(3, 0xfff2b0, 0.95); this.sel.strokePoints(pts, true);
    }

    tileAt(px, py) {
      const p = this.cameras.main.getWorldPoint(px, py);
      const a = p.x / (TW / 2), b = p.y / (TH / 2);
      return { x: Math.floor((a + b) / 2), y: Math.floor((b - a) / 2) };
    }

    bindInput() {
      const cam = this.cameras.main;
      let down = null, pinch = null;
      this.input.on('pointerdown', p => {
        if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
          const d = Phaser.Math.Distance.Between(this.input.pointer1.x, this.input.pointer1.y, this.input.pointer2.x, this.input.pointer2.y);
          pinch = { d, z: this.zoomLevel }; down = null; return;
        }
        const t = this.tileAt(p.x, p.y);
        const onGhost = placing && t.x >= placing.x && t.x < placing.x + KINDS[placing.kind].size && t.y >= placing.y && t.y < placing.y + KINDS[placing.kind].size;
        down = { x: p.x, y: p.y, moved: false, ghost: onGhost ? { dx: t.x - placing.x, dy: t.y - placing.y } : null };
      });
      this.input.on('pointermove', p => {
        if (pinch && this.input.pointer1.isDown && this.input.pointer2.isDown) {
          const d = Phaser.Math.Distance.Between(this.input.pointer1.x, this.input.pointer1.y, this.input.pointer2.x, this.input.pointer2.y);
          this.zoomTo(pinch.z * d / pinch.d); return;
        }
        if (!down || !p.isDown) return;
        if (!down.moved && Math.hypot(p.x - down.x, p.y - down.y) < 8 * dpr) return;
        down.moved = true;
        if (down.ghost) {
          const t = this.tileAt(p.x, p.y);
          const s = KINDS[placing.kind].size;
          const x = Phaser.Math.Clamp(t.x - down.ghost.dx, EDGE, SIZE - EDGE - s), y = Phaser.Math.Clamp(t.y - down.ghost.dy, EDGE, SIZE - EDGE - s);
          if (x !== placing.x || y !== placing.y) { placing.x = x; placing.y = y; this.drawGhost(); }
          return;
        }
        cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
        cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
      });
      this.input.on('pointerup', p => {
        if (pinch) { if (!this.input.pointer1.isDown && !this.input.pointer2.isDown) pinch = null; return; }
        if (down && !down.moved) this.tap(this.tileAt(p.x, p.y));
        down = null;
      });
      this.input.on('wheel', (p, objs, dx, dy) => this.zoomTo(this.zoomLevel * (dy > 0 ? 0.9 : 1.1)));
    }

    // Never zoomed out past the ground picture: the screen must fit inside it (the bounds, set in drawGround).
    zoomTo(z) {
      const b = this.cameras.main.getBounds(), [vw, vh] = size();
      const fit = Math.max(vw / b.width, vh / b.height);
      this.zoomLevel = Phaser.Math.Clamp(z, Math.max(ZMIN, fit), ZMAX);
      this.cameras.main.setZoom(this.zoomLevel * dpr);
    }

    tap(t) {
      if (placing) {
        const s = KINDS[placing.kind].size;
        placing.x = Phaser.Math.Clamp(t.x - Math.floor(s / 2), EDGE, SIZE - EDGE - s);
        placing.y = Phaser.Math.Clamp(t.y - Math.floor(s / 2), EDGE, SIZE - EDGE - s);
        this.drawGhost(); return;
      }
      const it = itemAt(state, t.x, t.y) || rockAt(state, t.x, t.y);
      if (!it) { closeInfo(); return; }
      const s = this.sprites.get(it.id), now = Date.now();
      if (it.kind === 'palace' && this.chest) {
        const o = openChest(state, store.get().entries, today());
        if (o) { commit(o.game); this.showChest(); this.bounce(s.c); this.sparks(s.c.x, s.c.y - 60); flyAll(o.got, s.c); return; }
      }
      if (!s.rock && !it.job) {
        const c = collect(state, it.id, now);
        if (c?.gained) {
          commit(c.game);
          s.it = state.items.find(i => i.id === it.id);
          this.status(s, now); this.bounce(s.c);
          fly(c.res, c.gained, s.c);
          return;
        }
        if (c?.full) this.label(s, 'انبار پر است');
      }
      this.bounce(s.c);
      openInfo(it.id);
    }

    drawGhost() {
      this.ghost?.destroy(); this.foot.clear();
      this.showGrid(!!placing);
      if (!placing) { this.ghost = null; return; }
      const k = KINDS[placing.kind], ok = fits(state, placing.kind, placing.x, placing.y);
      const pts = [iso(placing.x, placing.y), iso(placing.x + k.size, placing.y), iso(placing.x + k.size, placing.y + k.size), iso(placing.x, placing.y + k.size)].map(([x, y]) => ({ x, y }));
      this.foot.fillStyle(ok ? 0x5ad16b : 0xe0533d, 0.5); this.foot.fillPoints(pts, true);
      const [cx, cy] = iso(placing.x + k.size / 2, placing.y + k.size / 2);
      const g = this.add.graphics({ x: cx, y: cy }).setDepth(4000).setAlpha(0.8);
      for (const q of polys(placing.kind, k.size)) {
        g.fillStyle(parseInt(q.fill.slice(1), 16), 1);
        const p = []; for (let i = 0; i < q.pts.length; i += 2) p.push({ x: q.pts[i], y: q.pts[i + 1] });
        g.fillPoints(p, true);
      }
      this.ghost = g;
      placeBar.querySelector('[data-ok]').disabled = !ok;
    }

    // Rebuilds every sprite (after a big change, like another device saving).
    redraw() {
      for (const s of this.sprites.values()) s.c.destroy();
      this.sprites.clear();
      for (const o of [...state.items, ...state.rocks]) this.addThing(o);
      this.mark(selected && find(selected));
    }

    update() {
      const now = Date.now();
      if (now - (this.last || 0) < 250) return;
      this.last = now;
      const a = settleArmy(state, now);
      if (a.ready) { commit(a.game); if (win === 'train') openTrain(); }
      const r = settle(state, now);
      if (r.grown.length) { commit(r.game); for (const o of r.grown) this.addThing(o); }
      if (r.done.length) {
        commit(r.game);
        for (const id of r.done) {
          const s = this.sprites.get(id);
          if (!s) continue;
          if (s.rock) { s.c.destroy(); this.sprites.delete(id); this.sparks(s.c.x, s.c.y); if (s.it.gem) fly('gem', s.it.gem, s.c); continue; }
          s.it = state.items.find(i => i.id === id);
          this.paint(s); this.bounce(s.c); this.sparks(s.c.x, s.c.y - 20);
        }
        try { navigator.vibrate?.(20); } catch { /* not allowed */ }
        if (selected) { r.done.includes(selected) && !find(selected) ? closeInfo() : openInfo(selected); }
      }
      for (const s of this.sprites.values()) if (s.it.job || KINDS[s.it.kind]?.makes) this.status(s, now);
      if (selected && find(selected)?.job) refreshTimer();
      if (win === 'train') refreshQueue(now);
      if (now % 1000 < 260) showShield(now);
    }
  }

  const find = (id) => state.items.find(i => i.id === id) || state.rocks.find(r => r.id === id);

  function commit(g) { state = g; save(g); showBar(); }

  // A resource flies from a building (or the middle of the screen) to its bar.
  function fly(res, n, from) {
    if (!n) return;
    const box = el.querySelector(`.gh-bar[data-res="${res}"]`), target = box.querySelector('.gh-ico'), r = target.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    let sx = sr.width / 2, sy = sr.height / 2;
    if (from && scene) {
      const cam = scene.cameras.main;
      sx = ((from.x - cam.worldView.x) * cam.zoom) / dpr; sy = ((from.y - 40 - cam.worldView.y) * cam.zoom) / dpr;
    }
    const k = Math.min(8, Math.max(3, Math.ceil(n / 5)));
    for (let i = 0; i < k; i++) {
      const c = document.createElement('span');
      c.className = 'game-fly'; c.innerHTML = RES_ICON[res](22);
      c.style.left = `${sx}px`; c.style.top = `${sy}px`;
      el.appendChild(c);
      const dx = r.left - sr.left + r.width / 2 - sx, dy = r.top - sr.top + r.height / 2 - sy;
      c.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${(Math.random() - 0.5) * 60}px, -40px) scale(1.2)`, offset: 0.35 }, { transform: `translate(${dx}px, ${dy}px) scale(.7)`, opacity: 0.9 }], { duration: 750 + i * 70, easing: 'ease-in', fill: 'forwards' })
        .onfinish = () => { c.remove(); box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop'); };
    }
    const plus = document.createElement('span');
    plus.className = 'game-plus'; plus.textContent = `+${fa(n)}`;
    box.appendChild(plus); setTimeout(() => plus.remove(), 1400);
  }
  const flyAll = (gained, from) => { let d = 0; for (const r of ['coin', 'water', 'gem']) if (gained[r]) { setTimeout(() => fly(r, gained[r], from), d); d += 350; } };

  /* ---- windows ---- */

  function openWin(kind, title, html, back = false) {
    win = kind;
    winEl.querySelector('.gw-head b').textContent = title;
    winEl.querySelector('[data-wback]').hidden = !back;
    winEl.className = `gw gw-${kind}`;
    winBody.innerHTML = html;
    winEl.hidden = false;
  }
  function closeWin() { win = null; winEl.hidden = true; }
  winEl.querySelector('[data-wx]').onclick = closeWin;
  winEl.querySelector('[data-wback]').onclick = () => { if (win === 'shop') { tab = null; openShop(); } };
  winEl.onclick = e => {
    if (e.target === winEl) { closeWin(); return; }
    const t = e.target.closest('[data-tab],[data-kind],[data-troop],[data-un],[data-fort],[data-replay],[data-claim],[data-go]');
    if (!t) return;
    const d = t.dataset;
    if (d.tab) { tab = d.tab; openShop(); }
    else if (d.kind) buy(t, d.kind);
    else if (d.un) { const g = untrain(state, d.un, Date.now()); if (g) { commit(g); openTrain(); } }
    else if (d.troop) { const g = train(state, d.troop, Date.now()); if (!g) { shake(t); return; } commit(g); openTrain(); }
    else if (d.fort) attack(t, d.fort);
    else if (d.replay) replay(+d.replay);
    else if (d.claim) { const g = claimAch(state, d.claim); if (!g) return; const got = g.res.gem - state.res.gem; commit(g); fly('gem', got, null); openAch(); }
    else if (d.go) act(t, d.go);
  };

  /* ---- a selected building: its name and round buttons (the genre's way) ---- */

  const REASON = { builder: 'معمار آزاد نیست', max: 'بالاترین سطح' };
  function openInfo(id) {
    const o = find(id);
    if (!o) { closeInfo(); return; }
    selected = id; scene?.mark(o);
    const now = Date.now(), btn = (go, ic, label, extra = '', cls = '') => `<button class="gs-btn ${cls}" data-go="${go}">${ic}<span>${label}</span>${extra}</button>`;
    let name, lv = '', btns = '';
    if (ROCKS[o.kind]) {
      const R = ROCKS[o.kind];
      name = R.name;
      btns = o.job ? jobBtns(o, now, btn) : btn('clear', I.hammer(30), 'پاک کن', `<em>${costHtml({ coin: R.cost }, state.res)}</em>`, whyNotClear(state, id) ? 'dim' : '');
    } else {
      const K = KINDS[o.kind], next = level(o.kind, o.lv + 1);
      name = K.name; lv = o.lv ? `سطح ${fa(o.lv)}` : '';
      btns = btn('info', I.info(30), 'اطلاعات');
      if (o.job) btns += jobBtns(o, now, btn);
      else if (next) btns += btn('up', I.up(30), 'ارتقا', `<em>${costHtml(next.cost, state.res)}</em>`, whyNotUp(state, id) && whyNotUp(state, id) !== 'cost' ? 'dim' : '');
      if ((o.kind === 'barracks' || o.kind === 'camp') && o.lv > 0) btns += btn('train', I.sword(30), 'آموزش');
    }
    selEl.innerHTML = `<div class="gs-name"><b>${name}</b>${lv ? `<span>${lv}</span>` : ''}</div><div class="gs-btns">${btns}</div>`;
    selEl.hidden = false;
    el.classList.add('selecting');
  }
  function jobBtns(o, now, btn) {
    const gems = speedCost(o.job, now);
    return `<div class="gs-timer" data-timer>${I.clock(18)}${faDigits(fmtLeft(left(o, now)))}</div>` + btn('speed', I.gem(30), 'تمام کن', `<em>${costHtml({ gem: gems }, state.res)}</em>`);
  }
  function refreshTimer() {
    const o = find(selected), t = selEl.querySelector('[data-timer]');
    if (o?.job && t) t.innerHTML = `${I.clock(18)}${faDigits(fmtLeft(left(o, Date.now())))}`;
  }
  function closeInfo() { selected = null; selEl.hidden = true; el.classList.remove('selecting'); scene?.mark(null); }
  selEl.onclick = e => { const b = e.target.closest('[data-go]'); if (b) act(b, b.dataset.go); };

  function act(b, go) {
    if (!selected) return;
    const now = Date.now(), id = selected;
    if (go === 'info') { openUp(id, false); return; }
    if (go === 'train') { openTrain(); return; }
    let g = null;
    if (go === 'up') { openUp(id, true); return; }
    if (go === 'upgo') g = upgrade(state, id, now);
    else if (go === 'clear') g = clearRock(state, id, now);
    else if (go === 'speed') g = speedUp(state, id, now);
    if (!g) { shake(b); return; }
    if (go === 'upgo') closeWin();
    const was = find(id);
    commit(g);
    const s = scene.sprites.get(id), now2 = find(id);
    if (!now2) { // an obstacle cleared at once with gems
      if (s) { s.c.destroy(); scene.sprites.delete(id); scene.sparks(s.c.x, s.c.y); if (was.gem) fly('gem', was.gem, s.c); }
      closeInfo(); return;
    }
    if (s) { s.it = now2; scene.paint(s); scene.bounce(s.c); if (!now2.job) scene.sparks(s.c.x, s.c.y - 20); }
    try { navigator.vibrate?.(15); } catch { /* not allowed */ }
    openInfo(id);
  }

  // The numbers a building shows: now, and (when upgrading) after.
  const STAT = [
    ['hp', I.heart, 'جان'], ['rate', (s) => '', 'تولید در ساعت'], ['cap', (s) => '', 'ظرفیت'], ['store', (s) => '', 'انبار'],
    ['dps', I.dps, 'آسیب در ثانیه'], ['range', I.range, 'برد'], ['room', I.army, 'جای سپاه'], ['damage', I.dps, 'آسیب'],
  ];
  function statRows(kind, lv, nextLv) {
    const K = KINDS[kind], L = level(kind, lv), N = nextLv ? level(kind, nextLv) : null, res = K.makes || K.keeps;
    const rows = [];
    if (kind === 'palace') for (const r of ['coin', 'water']) rows.push([RES_ICON[r](20), 'انبار', K.store[r][lv - 1], N ? K.store[r][nextLv - 1] : null]);
    for (const [key, ic, label] of STAT) {
      const a = L?.[key], b = N?.[key];
      if (typeof a !== 'number' && typeof b !== 'number') continue;
      rows.push([res && ['rate', 'cap', 'store'].includes(key) ? RES_ICON[res](20) : ic(20), label, a ?? 0, b]);
    }
    return rows.map(([ic, label, a, b]) => {
      const max = Math.max(a, b || 0) || 1;
      return `<div class="gw-stat">${ic}<div class="gw-sbar"><i style="width:${100 * a / max}%"></i>${b != null && b > a ? `<u style="width:${100 * (b - a) / max}%"></u>` : ''}
        <span>${label}: ${fa(a)}${b != null && b > a ? ` <em>+${fa(b - a)}</em>` : ''}</span></div></div>`;
    }).join('');
  }
  function preview(kind) {
    return kind === 'palace' ? `<img class="gw-pic" src="${ART.palace}" alt="">` : `<canvas class="gw-pic" data-prev="${kind}"></canvas>`;
  }
  function drawPreviews() { winBody.querySelectorAll('[data-prev]').forEach(c => drawPreview(c, c.dataset.prev, KINDS[c.dataset.prev].size)); }

  // The upgrade window (or, with go false, the information window).
  function openUp(id, go) {
    const o = find(id), K = KINDS[o.kind], next = level(o.kind, o.lv + 1);
    const lv = Math.max(1, o.lv);
    if (!go || !next) {
      openWin('info', `${K.name} (سطح ${fa(lv)})`, `<div class="gw-up">${preview(o.kind)}<div class="gw-stats">${statRows(o.kind, lv)}</div></div>`);
      drawPreviews(); return;
    }
    const why = whyNotUp(state, id);
    const note = why === 'palace' ? `<div class="gw-note">${I.lock(18)}کاخ سطح ${fa(K.maxLv.findIndex(m => m > o.lv) + 1)}</div>`
      : REASON[why] ? `<div class="gw-note">${REASON[why]}</div>` : '';
    openWin('up', `ارتقا به سطح ${fa(o.lv + 1)}`, `<div class="gw-up">${preview(o.kind)}<div class="gw-stats">${statRows(o.kind, lv, o.lv + 1)}</div></div>
      <div class="gw-foot">${timeHtml(next.time)}${note || `<button class="gb green big${why === 'cost' ? ' short' : ''}" data-go="upgo">${costHtml(next.cost, state.res)}</button>`}</div>`);
    drawPreviews();
  }

  /* ---- the shop: four groups, then big cards ---- */

  let tab = null;
  function openShop() {
    closeInfo();
    if (!tab) {
      openWin('shop', 'فروشگاه', `<div class="gw-groups">${Object.entries(GROUPS).map(([g, name]) =>
        `<button class="gw-group" data-tab="${g}">${GROUP_ICON[g](56)}<b>${name}</b></button>`).join('')}</div>`);
      return;
    }
    const cards = SHOP.filter(k => KINDS[k].group === tab).map(k => {
      const K = KINDS[k], why = whyNot(state, k), mx = maxCount(state, k), n = countOf(state, k);
      const lock = why === 'palace' ? `<span class="gk-lock">${I.lock(26)}<b>کاخ سطح ${fa(K.count.findIndex(c => c > 0) + 1)}</b></span>` : '';
      return `<button class="gk${why && why !== 'cost' ? ' off' : ''}" data-kind="${k}">
        <span class="gk-n${n >= mx && mx ? ' full' : ''}">${fa(n)}/${fa(mx)}</span>
        <canvas data-prev="${k}"></canvas><b class="gk-name">${K.name}</b>
        ${lock || `${timeHtml(K.levels[0].time)}<span class="gk-price">${costHtml(priceOf(state, k), state.res) || '<span class="gc"><b>رایگان</b></span>'}</span>`}
        ${why === 'builder' ? `<span class="gk-note">${REASON.builder}</span>` : ''}</button>`;
    }).join('');
    openWin('shop', GROUPS[tab], `<div class="gw-cards">${cards}</div>`, true);
    drawPreviews();
  }
  el.querySelector('[data-shop]').onclick = () => { tab = null; openShop(); };
  function buy(b, kind) {
    if (whyNot(state, kind)) { shake(b); return; }
    const spot = freeSpot(state, kind);
    if (!spot) return;
    closeWin();
    placing = { kind, ...spot };
    el.classList.add('placing'); placeBar.hidden = false;
    const [cx, cy] = iso(spot.x + KINDS[kind].size / 2, spot.y + KINDS[kind].size / 2);
    scene.cameras.main.pan(cx, cy, 350, 'Sine.easeInOut');
    scene.drawGhost();
  }
  const endPlacing = () => { placing = null; scene.drawGhost(); placeBar.hidden = true; el.classList.remove('placing'); };
  placeBar.querySelector('[data-no]').onclick = endPlacing;
  placeBar.querySelector('[data-ok]').onclick = () => {
    const kind = placing?.kind;
    const g = placing && place(state, kind, placing.x, placing.y, Date.now());
    if (!g) return;
    commit(g);
    const it = g.items[g.items.length - 1];
    endPlacing();
    const s = scene.addThing(it);
    scene.bounce(s.c); scene.sparks(s.c.x, s.c.y);
    try { navigator.vibrate?.(15); } catch { /* not allowed */ }
    // walls go one after another: offer the next piece right away
    if (kind === 'wall' && !whyNot(state, 'wall')) {
      const spot = freeSpot(state, 'wall');
      if (spot) { placing = { kind, ...spot }; el.classList.add('placing'); placeBar.hidden = false; scene.drawGhost(); }
    }
  };

  /* ---- training (GAME.md §7) ---- */

  const armyRow = () => TROOP_ORDER.filter(t => state.army?.[t]).map(t => `<span class="ga-t">${troopSvg(t, 34)}<b>×${fa(state.army[t])}</b></span>`).join('');
  function openTrain() {
    closeInfo();
    const q = state.queue || [], queued = {};
    for (const x of q) queued[x.t] = (queued[x.t] || 0) + 1;
    const used = armyUsed(state), room = armyRoom(state);
    const queue = Object.entries(queued).map(([t, n]) => `<button class="ga-q" data-un="${t}">${troopSvg(t, 34)}<b>×${fa(n)}</b><i>−</i></button>`).join('');
    const cards = TROOP_ORDER.map(t => {
      const T = TROOPS[t], why = whyNotTrain(state, t);
      const lock = why === 'locked' ? `<span class="gk-lock">${I.lock(22)}<b>سربازخانه ${fa(opensAt(t))}</b></span>` : '';
      return `<button class="gk gk-troop${why && why !== 'cost' ? ' off' : ''}" data-troop="${t}">${troopSvg(t, 58)}<b class="gk-name">${T.name}</b>
        ${lock || `<span class="gk-price">${costHtml({ water: T.cost }, state.res)}</span>`}</button>`;
    }).join('');
    openWin('train', 'آموزش سپاه', `<div class="ga-top"><div class="ga-room">${I.army(22)}<span class="ga-bar"><i style="width:${room ? 100 * used / room : 0}%"></i><b>${fa(used)}/${fa(room)}</b></span></div>
      <div class="ga-have">${armyRow()}</div>${queue ? `<div class="ga-queue">${queue}<span class="gtime" data-q></span></div>` : ''}</div><div class="gw-cards troops">${cards}</div>`);
    refreshQueue(Date.now());
  }
  function refreshQueue(now) {
    const q = state.queue || [], t = winBody.querySelector('[data-q]');
    if (t) t.innerHTML = q.length ? `${I.clock(15)}${faDigits(fmtLeft(Math.max(0, q[q.length - 1].end - now)))}` : '';
  }

  /* ---- the road of div forts and the battle (GAME.md §8, §9) ---- */

  function openMap() {
    closeInfo();
    const has = armyCount(state) > 0;
    const forts = FORTS.map((f, i) => {
      const open = fortOpen(state, f.id), st = state.forts?.[f.id]?.stars || 0, loot = fortLayout(state, f.id).loot;
      return `<div class="gf${open ? '' : ' off'}"><span class="gf-n">${fa(i + 1)}</span><div class="gf-mid"><b>${f.name}</b>${starsHtml(st, 20)}<span class="gf-loot">${costHtml(loot)}</span></div>
        ${open ? `<button class="gb orange${has ? '' : ' dim'}" data-fort="${f.id}">${I.swords(30)}</button>` : `<span class="gf-lock">${I.lock(26)}</span>`}</div>`;
    }).join('');
    openWin('map', 'راه دیوها', `<div class="ga-have wide">${armyRow() || `<span class="ga-empty">${I.army(22)}۰</span>`}</div><div class="gf-list">${forts}</div>`);
  }
  el.querySelector('[data-attack]').onclick = openMap;
  function attack(b, id) {
    if (!armyCount(state)) { shake(b); return; }
    closeWin(); closeInfo();
    scene.scene.sleep();
    const f = FORTS.find(x => x.id === id);
    openBattle({ game: L.game, el, dpr, title: f.name, layout: fortLayout(state, id), army: { ...state.army }, resIcon: RES_ICON,
      onEnd: (r) => { const e2 = endFort(state, id, r, give); commit(e2.game); return { got: e2.got }; },
      onClose: () => { scene.scene.wake(); showBar(); } });
  }

  /* ---- the divs' raids (GAME.md §9) ---- */

  function openNews() {
    closeInfo();
    const list = (state.raids || []).slice(0, 5);
    const rows = list.map((x, i) => {
      const lost = !!x.stars;
      const money = lost ? costHtml({ coin: x.lost.coin, water: x.lost.water }).replace(/class="gc/g, 'class="gc lost') : costHtml(x.won);
      return `<div class="gn${lost ? ' lose' : ' win'}${x.seen ? '' : ' new'}"><span class="gn-ban">${lost ? 'شکست' : 'پیروزی'}</span>
        <div class="gn-mid">${starsHtml(x.stars, 20, true)}<span class="gn-pct">${fa(x.pct)}٪</span><span class="gn-money">${money}</span>
        <span class="gc">${I.medal(18)}<b>${x.medals > 0 ? '+' : ''}${fa(x.medals)}</b></span></div>
        <button class="gb blue" data-replay="${i}" aria-label="بازپخش">${I.play(22)}</button></div>`;
    }).join('');
    openWin('news', 'دفاع از سرزمین', rows ? `<div class="gn-list">${rows}</div>` : `<div class="gw-empty">${I.shield(56)}</div>`);
    if (unseen(state).length) commit(markSeen(state));
  }
  function replay(i) {
    const x = state.raids[i];
    closeWin();
    scene.scene.sleep();
    openBattle({ game: L.game, el, dpr, title: 'سپاه دیو', layout: { items: x.items, loot: x.loot, keepShare: 0 }, army: { ...x.army }, plan: x.plan, resIcon: RES_ICON,
      onClose: () => { scene.scene.wake(); showBar(); } });
  }
  el.querySelector('[data-news]').onclick = openNews;

  /* ---- achievements (GAME.md §10) ---- */

  function openAch() {
    closeInfo();
    const rows = achievements(state).map(a => {
      const pct = a.next ? Math.min(100, 100 * a.n / a.next) : 100;
      const right = a.ready ? `<button class="gb green" data-claim="${a.id}">${costHtml({ gem: a.gems })}</button>` : `<span class="gc">${I.gem(18)}<b>${fa(a.gems || 0)}</b></span>`;
      return `<div class="gn ach">${starsHtml(a.claimed, 20)}<div class="gn-mid"><b>${a.name}</b><span class="ga-bar"><i style="width:${pct}%"></i><b>${a.next ? `${fa(Math.min(a.n, a.next))}/${fa(a.next)}` : fa(a.n)}</b></span></div>${right}</div>`;
    }).join('');
    openWin('ach', 'دستاوردها', `<div class="gn-list">${rows}</div>`);
  }
  el.querySelector('[data-ach]').onclick = openAch;

  L.sync = () => { // the store changed (maybe a meal was logged elsewhere, or another device saved)
    const { game, gained } = current();
    if (game === state) return;
    const before = state;
    state = game;
    showBar();
    flyAll(gained, null);
    scene?.showChest();
    const key = (g) => [...g.items, ...g.rocks].map(o => `${o.id}:${o.x}:${o.y}:${o.lv}:${o.job?.end || 0}`).join('|');
    if (scene && key(before) !== key(game)) scene.redraw();
    if (selected) openInfo(selected);
  };

  L.game = new Phaser.Game({
    type: Phaser.AUTO, parent: stage, backgroundColor: '#2f5e2c',
    scale: { mode: Phaser.Scale.NONE, width: w * dpr, height: h * dpr, zoom: 1 / dpr },
    input: { activePointers: 2 },
    banner: false, scene: Land,
  });
  L.ro = new ResizeObserver(() => {
    const [nw, nh] = size();
    L.game.scale.resize(nw * dpr, nh * dpr); L.game.scale.setZoom(1 / dpr);
  });
  L.ro.observe(stage);
}
