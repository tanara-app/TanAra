/*
  «سرزمین» (beta): the city-builder, opened from «بیشتر» (#/game). Full screen, portrait.
  Drawn with Phaser 4 (loaded from the CDN only when this page opens); the bars, buttons and sheets
  are plain HTML over it. Logic is in js/domain/game.js (design in GAME.md), the placeholder art in
  gameArt.js, the finished pictures in img/game/.

  Drag to look around, pinch (or the wheel) to zoom. Top: coins, water and gems (with their caps)
  and the free builders. The hammer opens the shop; a bought building appears on a free spot as a
  ghost that can be dragged, and ✓ places it. Tapping a producer collects what it holds; tapping any
  building opens its sheet (level, upgrade, finish now with gems); tapping an obstacle offers to clear
  it. Jobs finish by themselves when their time comes.
  Logged meals give coins, active days water, full weeks gems (claimed when this page opens or the
  data changes).
*/
import * as store from '../data/store.js';
import { today } from '../lib/dates.js';
import { fa, faDigits } from '../lib/fa.js';
import { icon } from './dom.js';
import {
  KINDS, ROCKS, SHOP, SIZE, load, claimAll, settle, fits, freeSpot, place, collect, stored, itemAt, rockAt, left,
  fmtLeft, cap, builders, busy, whyNot, priceOf, countOf, maxCount, maxLv, whyNotUp, upgrade, level, whyNotClear,
  clearRock, speedCost, speedUp,
} from '../domain/game.js';
import { TW, TH, iso, polys, scaffoldPolys, drawPreview } from './gameArt.js';

const PHASER = 'https://cdn.jsdelivr.net/npm/phaser@4.2.1/dist/phaser.min.js';
const ZMIN = 0.45, ZMAX = 2.2;

const coinSvg = (s = 20) => `<img src="img/game/test/coin.webp" width="${s}" height="${s}" alt="" draggable="false">`;
const waterSvg = (s = 20) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}"><path d="M12 2.5C9 7 5.5 10.6 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10.6 15 7 12 2.5z" fill="#4aa8e0" stroke="#1f5f8f" stroke-width="1.4"/><path d="M9 14.5a3 3 0 0 0 3 3" stroke="#d6f0ff" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`;
const gemSvg = (s = 20) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}"><path d="M6 3h12l4 6-10 12L2 9z" fill="#38c48f" stroke="#17664a" stroke-width="1.4" stroke-linejoin="round"/><path d="M2 9h20M9 3l3 18 3-18" stroke="#17664a" stroke-width="1" fill="none"/></svg>`;
const builderSvg = (s = 18) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="3"/><path d="M6 21v-2a6 6 0 0 1 12 0v2"/><path d="M8 5.5h8"/></svg>`;
const lockSvg = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const upSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
const RES_ICON = { coin: coinSvg, water: waterSvg, gem: gemSvg };

// Buildings that already have a picture (style «ماکت», art/STYLE.md); the rest are still drawn.
// The palace is a Blender render of its Meshy model (art/models/palace-3.glb), cropped to the building:
// rotated 45°, 30° down (2:1 footprint), transparent background, front to the lower right. See IDEAS.md.
const ART = { palace: 'img/game/palace.webp', rock: 'img/game/rock.webp', dune: 'img/game/dune.webp', tree: 'img/game/tree.webp', bush: 'img/game/bush.webp' };
// The palace image is cropped to the building (a little wider than its footprint); the others are framed
// exactly on their footprint by art/blender/common.py (frame_footprint), so they scale to it as they are.
const FIT = { palace: 1.04 };
// The ground (art/blender/land.py): the plot inside its curb with MARGIN tiles of desert all round.
const LAND = 'img/game/land.webp', MARGIN = 6;
const hammerSvg = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4l6 6-3 3-6-6z"/><path d="M11 7L4 14l3 3 7-7"/><path d="M5.5 15.5L3 20l4.5-2.5"/></svg>';
const clockSvg = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

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

// The saved game, with new logs turned into resources and finished jobs completed.
function current() {
  const p = store.profile() || {};
  const d = store.get();
  const g0 = load(p.game, today());
  const { game: g1, gained } = claimAll(g0, { entries: d.entries, activity: d.activity }, today());
  const { game } = settle(g1, Date.now());
  if (game !== p.game) save(game);
  return { game, gained };
}
function save(game) { store.saveProfile({ ...store.profile(), game }); }

const costHtml = (cost, have) => Object.entries(cost).filter(([, v]) => v > 0)
  .map(([k, v]) => `<span class="game-cost${have && (have[k] || 0) < v ? ' short' : ''}">${RES_ICON[k](15)}${fa(v)}</span>`).join('');
const timeHtml = (ms) => ms ? `<span class="game-time">${clockSvg}${faDigits(fmtLeft(ms))}</span>` : '';

export function renderGame(root) {
  if (live && root.contains(live.root)) { live.sync(); return; }
  stop();
  if (!(store.profile()?.beta || []).includes('game')) { location.replace('#/tools'); return; }
  document.body.classList.add('game-mode');
  root.innerHTML = `
    <section class="game">
      <div class="game-stage"></div>
      <button class="game-back" data-back aria-label="برگشت">${icon.chevR}</button>
      <div class="game-bar">
        <div class="game-res" data-res="coin" aria-label="سکه">${coinSvg(20)}<b></b><i></i></div>
        <div class="game-res" data-res="water" aria-label="آب">${waterSvg(20)}<b></b><i></i></div>
        <div class="game-res" data-res="gem" aria-label="گوهر">${gemSvg(20)}<b></b></div>
        <div class="game-res game-bld" aria-label="معمار">${builderSvg()}<b data-builders></b></div>
      </div>
      <button class="game-build" data-shop aria-label="ساختن">${hammerSvg}</button>
      <div class="game-place" hidden><button data-ok aria-label="بگذار">${icon.check}</button><button data-no aria-label="نه">${icon.close}</button></div>
      <div class="game-shop" hidden><div class="game-cards"></div></div>
      <div class="game-info" hidden></div>
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
  const placeBar = el.querySelector('.game-place'), shopEl = el.querySelector('.game-shop'), buildBtn = el.querySelector('[data-shop]');
  const infoEl = el.querySelector('.game-info');
  L.firstGain = current();
  let state = L.firstGain.game;
  let placing = null; // { kind, x, y }
  let selected = null; // id of the building or obstacle whose sheet is open
  let scene;

  function showBar() {
    for (const r of ['coin', 'water', 'gem']) {
      const box = el.querySelector(`[data-res="${r}"]`);
      box.querySelector('b').textContent = fa(state.res[r]);
      const c = cap(state, r), fill = box.querySelector('i');
      if (fill) { fill.style.width = `${Math.min(100, 100 * state.res[r] / c)}%`; box.classList.toggle('full', state.res[r] >= c); }
    }
    el.querySelector('[data-builders]').textContent = `${fa(builders(state) - busy(state))}/${fa(builders(state))}`;
  }
  showBar();

  class Land extends Phaser.Scene {
    preload() {
      for (const [kind, file] of Object.entries(ART)) this.load.image(`art-${kind}`, file);
      this.load.image('coinImg', 'img/game/test/coin.webp');
      this.load.image('land', LAND);
    }

    create() {
      scene = this;
      const cam = this.cameras.main;
      cam.setBackgroundColor('#c98f55');
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
      el.querySelector('.game-wait').remove();
      const { gained } = L.firstGain || {};
      if (gained) this.time.delayedCall(400, () => flyAll(gained, null));
    }

    makeTextures() {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xfff2b0, 1); g.fillPoints([{ x: 6, y: 0 }, { x: 12, y: 6 }, { x: 6, y: 12 }, { x: 0, y: 6 }], true);
      g.generateTexture('spark', 12, 12); g.destroy();
    }

    drawGround() {
      const full = SIZE + 2 * MARGIN;
      const [cx, cy] = iso(SIZE / 2, SIZE / 2);
      this.add.image(cx, cy, 'land').setDisplaySize(full * TW, full * TH).setDepth(0);
      this.grid = this.add.graphics().setDepth(1);
      const [x0] = iso(-MARGIN, SIZE + MARGIN), [x1] = iso(SIZE + MARGIN, -MARGIN), [, y0] = iso(-MARGIN, -MARGIN), [, y1] = iso(SIZE + MARGIN, SIZE + MARGIN);
      this.cameras.main.setBounds(x0 + 40, y0 + 20, x1 - x0 - 80, y1 - y0 - 40);
    }

    // The tile grid, shown only while a building is being placed.
    showGrid(on) {
      this.grid.clear();
      if (!on) return;
      this.grid.lineStyle(1, 0xfff4d6, 0.28);
      for (let i = 0; i <= SIZE; i++) {
        const a = iso(i, 0), b = iso(i, SIZE), c = iso(0, i), d = iso(SIZE, i);
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
          const x = Phaser.Math.Clamp(t.x - down.ghost.dx, 0, SIZE - s), y = Phaser.Math.Clamp(t.y - down.ghost.dy, 0, SIZE - s);
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
        placing.x = Phaser.Math.Clamp(t.x - Math.floor(s / 2), 0, SIZE - s);
        placing.y = Phaser.Math.Clamp(t.y - Math.floor(s / 2), 0, SIZE - s);
        this.drawGhost(); return;
      }
      const it = itemAt(state, t.x, t.y) || rockAt(state, t.x, t.y);
      if (!it) { closeInfo(); return; }
      const s = this.sprites.get(it.id), now = Date.now();
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
      const r = settle(state, now);
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
    }
  }

  const find = (id) => state.items.find(i => i.id === id) || state.rocks.find(r => r.id === id);

  function commit(g) { state = g; save(g); showBar(); }

  // A resource flies from a building (or the middle of the screen) to its counter.
  function fly(res, n, from) {
    if (!n) return;
    const box = el.querySelector(`[data-res="${res}"]`), r = box.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    let sx = sr.width / 2, sy = sr.height / 2;
    if (from && scene) {
      const cam = scene.cameras.main;
      sx = ((from.x - cam.worldView.x) * cam.zoom) / dpr; sy = ((from.y - 40 - cam.worldView.y) * cam.zoom) / dpr;
    }
    const k = Math.min(8, Math.max(3, Math.ceil(n / 5)));
    for (let i = 0; i < k; i++) {
      const c = document.createElement('span');
      c.className = 'game-fly'; c.innerHTML = RES_ICON[res](18);
      c.style.left = `${sx}px`; c.style.top = `${sy}px`;
      el.appendChild(c);
      const dx = r.left - sr.left + 12 - sx, dy = r.top - sr.top + 12 - sy;
      c.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${(Math.random() - 0.5) * 60}px, -40px) scale(1.2)`, offset: 0.35 }, { transform: `translate(${dx}px, ${dy}px) scale(.7)`, opacity: 0.9 }], { duration: 750 + i * 70, easing: 'ease-in', fill: 'forwards' })
        .onfinish = () => { c.remove(); box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop'); };
    }
    const plus = document.createElement('span');
    plus.className = 'game-plus'; plus.textContent = `+${fa(n)}`;
    box.appendChild(plus); setTimeout(() => plus.remove(), 1400);
  }
  const flyAll = (gained, from) => { let d = 0; for (const r of ['coin', 'water', 'gem']) if (gained[r]) { setTimeout(() => fly(r, gained[r], from), d); d += 350; } };

  /* ---- the sheet of one building or obstacle ---- */

  const REASON = { cost: null, builder: 'معمار آزاد نیست', palace: null, max: 'بالاترین سطح', busy: null, count: null };
  function openInfo(id) {
    const o = find(id);
    if (!o) { closeInfo(); return; }
    selected = id; scene?.mark(o);
    shopEl.hidden = true;
    const now = Date.now();
    let body = '';
    if (ROCKS[o.kind]) {
      const R = ROCKS[o.kind];
      body = o.job ? jobHtml(o, now) : actionHtml('clear', 'پاک کردن', costHtml({ coin: R.cost }, state.res) + timeHtml(R.time), whyNotClear(state, id));
      infoEl.innerHTML = `<div class="game-info-head"><b>${R.name}</b></div>${body}`;
    } else {
      const K = KINDS[o.kind], next = level(o.kind, o.lv + 1);
      const lv = o.lv ? `<span class="game-lv">سطح ${fa(o.lv)}</span>` : '';
      if (o.job) body = jobHtml(o, now);
      else if (next) {
        const why = whyNotUp(state, id);
        const extra = why === 'palace' ? `<span class="game-lock">${lockSvg}کاخ سطح ${fa(K.maxLv.findIndex(m => m > o.lv) + 1)}</span>` : '';
        body = actionHtml('up', upSvg, costHtml(next.cost, state.res) + timeHtml(next.time), why, extra);
      }
      infoEl.innerHTML = `<div class="game-info-head"><b>${K.name}</b>${lv}${statHtml(o)}</div>${body}`;
    }
    infoEl.hidden = false;
  }
  function statHtml(o) {
    const K = KINDS[o.kind], L = o.lv ? level(o.kind, o.lv) : null;
    if (!L) return '';
    if (K.makes) return `<span class="game-stat">${RES_ICON[K.makes](14)}${fa(L.rate)}/ساعت</span>`;
    if (K.keeps) return `<span class="game-stat">${RES_ICON[K.keeps](14)}${fa(L.store)}</span>`;
    return '';
  }
  function actionHtml(act, label, price, why, extra = '') {
    const off = why && why !== 'cost' ? ' off' : why === 'cost' ? ' short' : '';
    const note = extra || (REASON[why] ? `<span class="game-lock">${REASON[why]}</span>` : '');
    return `<div class="game-act"><button class="game-btn${off}" data-act="${act}" ${why ? 'aria-disabled="true"' : ''}>${label}<span class="game-price">${price}</span></button>${note}</div>`;
  }
  function jobHtml(o, now) {
    const gems = speedCost(o.job, now);
    return `<div class="game-act"><span class="game-time big" data-timer>${clockSvg}${faDigits(fmtLeft(left(o, now)))}</span>
      <button class="game-btn gem${state.res.gem < gems ? ' short' : ''}" data-act="speed">تمام کن<span class="game-price">${costHtml({ gem: gems })}</span></button></div>`;
  }
  function refreshTimer() {
    const o = find(selected), t = infoEl.querySelector('[data-timer]');
    if (o?.job && t) t.innerHTML = `${clockSvg}${faDigits(fmtLeft(left(o, Date.now())))}`;
  }
  function closeInfo() { selected = null; infoEl.hidden = true; scene?.mark(null); }

  infoEl.onclick = e => {
    const b = e.target.closest('[data-act]');
    if (!b || !selected) return;
    const now = Date.now(), id = selected, act = b.dataset.act;
    let g = null;
    if (act === 'up') g = upgrade(state, id, now);
    else if (act === 'clear') g = clearRock(state, id, now);
    else if (act === 'speed') g = speedUp(state, id, now);
    if (!g) { b.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], 260); return; }
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
  };

  /* ---- the shop ---- */

  function openShop() {
    closeInfo();
    const cards = shopEl.querySelector('.game-cards');
    cards.innerHTML = SHOP.map(k => {
      const K = KINDS[k], why = whyNot(state, k), mx = maxCount(state, k);
      const lock = why === 'palace' ? `<span class="game-lock">${lockSvg}کاخ سطح ${fa(K.count.findIndex(n => n > 0) + 1)}</span>`
        : why === 'count' ? `<span class="game-lock">${fa(countOf(state, k))}/${fa(mx)}</span>`
          : why === 'builder' ? `<span class="game-lock">${REASON.builder}</span>` : '';
      return `<button class="game-card${why && why !== 'cost' ? ' off' : ''}" data-kind="${k}">
        <canvas></canvas><b>${K.name}</b>
        ${lock || `<span class="game-price">${costHtml(priceOf(state, k), state.res)}${timeHtml(K.levels[0].time)}</span><span class="game-count">${fa(countOf(state, k))}/${fa(mx)}</span>`}
      </button>`;
    }).join('');
    shopEl.hidden = false;
    cards.querySelectorAll('[data-kind]').forEach(b => drawPreview(b.querySelector('canvas'), b.dataset.kind, KINDS[b.dataset.kind].size));
  }
  buildBtn.onclick = () => (shopEl.hidden ? openShop() : (shopEl.hidden = true));
  shopEl.onclick = e => {
    const b = e.target.closest('[data-kind]');
    if (!b) { shopEl.hidden = true; return; }
    if (whyNot(state, b.dataset.kind)) { b.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], 260); return; }
    const spot = freeSpot(state, b.dataset.kind);
    if (!spot) return;
    shopEl.hidden = true;
    placing = { kind: b.dataset.kind, ...spot };
    buildBtn.hidden = true; placeBar.hidden = false;
    const [cx, cy] = iso(spot.x + KINDS[placing.kind].size / 2, spot.y + KINDS[placing.kind].size / 2);
    scene.cameras.main.pan(cx, cy, 350, 'Sine.easeInOut');
    scene.drawGhost();
  };
  const endPlacing = () => { placing = null; scene.drawGhost(); placeBar.hidden = true; buildBtn.hidden = false; };
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
      if (spot) { placing = { kind, ...spot }; buildBtn.hidden = true; placeBar.hidden = false; scene.drawGhost(); }
    }
  };

  L.sync = () => { // the store changed (maybe a meal was logged elsewhere, or another device saved)
    const { game, gained } = current();
    if (game === state) return;
    const before = state;
    state = game;
    showBar();
    flyAll(gained, null);
    const key = (g) => [...g.items, ...g.rocks].map(o => `${o.id}:${o.x}:${o.y}:${o.lv}:${o.job?.end || 0}`).join('|');
    if (scene && key(before) !== key(game)) scene.redraw();
    if (selected) openInfo(selected);
  };

  L.game = new Phaser.Game({
    type: Phaser.AUTO, parent: stage, backgroundColor: '#c98f55',
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
