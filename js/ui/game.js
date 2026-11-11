/*
  «سرزمین» (beta): the city-builder, opened from «ابزارها» (#/game). Full screen, portrait.
  Drawn with Phaser 4 (loaded from the CDN only when this page opens); the buttons and the coin
  count are plain HTML over it. Logic is in js/domain/game.js, the placeholder art in gameArt.js.

  Drag to look around, pinch (or the wheel) to zoom. The hammer opens the shop; a bought building
  appears on a free spot as a ghost that can be dragged, and ✓ places it. Construction takes time;
  a finished one is tapped to open it. The caravanserai fills with coins to collect.
  Every meal logged in the app gives coins once (claimed when this page opens or the data changes).
*/
import * as store from '../data/store.js';
import { today } from '../lib/dates.js';
import { fa, faDigits } from '../lib/fa.js';
import { icon } from './dom.js';
import { KINDS, SHOP, SIZE, newGame, claimMeals, fits, freeSpot, place, finish, collect, stored, itemAt, left, fmtLeft, canBuy } from '../domain/game.js';
import { TW, TH, iso, polys, drawPreview } from './gameArt.js';

const PHASER = 'https://cdn.jsdelivr.net/npm/phaser@4.2.1/dist/phaser.min.js';
const ZMIN = 0.55, ZMAX = 2.2;

const coinSvg = (s = 20) => `<img src="img/game/test/coin.webp" width="${s}" height="${s}" alt="" draggable="false">`;

// Style test (2026-11-11): tapping the palace switches between the drawn shape and the images
// made in two styles. Remembered on this device. Goes away once a style is chosen.
const ART = [
  { name: 'شکل ساده' },
  { name: 'مینیاتور', key: 'palace-b', file: 'img/game/test/palace-b.webp' },
  { name: 'ماکت', key: 'palace-c', file: 'img/game/test/palace-c.webp' },
];
let artPick = 0;
try { artPick = Number(localStorage.getItem('tanara:gameArt')) % ART.length || 0; } catch { /* storage blocked */ }
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

// The saved game, with any newly logged meals turned into coins.
function current() {
  const p = store.profile() || {};
  const g = p.game?.v ? p.game : newGame(today());
  const { game, gained } = claimMeals(g, store.get().entries, today());
  if (game !== p.game) save(game);
  return { game, gained };
}
function save(game) { store.saveProfile({ ...store.profile(), game }); }

export function renderGame(root) {
  if (live && root.contains(live.root)) { live.sync(); return; }
  stop();
  if (!(store.profile()?.beta || []).includes('game')) { location.replace('#/tools'); return; }
  document.body.classList.add('game-mode');
  root.innerHTML = `
    <section class="game">
      <div class="game-stage"></div>
      <button class="game-back" data-back aria-label="برگشت">${icon.chevR}</button>
      <div class="game-coins" aria-label="سکه">${coinSvg(22)}<b data-coins></b></div>
      <button class="game-build" data-shop aria-label="ساختن">${hammerSvg}</button>
      <div class="game-place" hidden><button data-ok aria-label="بگذار">${icon.check}</button><button data-no aria-label="نه">${icon.close}</button></div>
      <div class="game-shop" hidden><div class="game-cards"></div></div>
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
  clearInterval(live.tick);
  live.game?.destroy(true);
  live = null;
  document.body.classList.remove('game-mode');
}

function start(el, L) {
  const stage = el.querySelector('.game-stage');
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const size = () => [Math.max(1, stage.clientWidth), Math.max(1, stage.clientHeight)];
  const [w, h] = size();
  const coinsEl = el.querySelector('[data-coins]');
  const placeBar = el.querySelector('.game-place'), shopEl = el.querySelector('.game-shop'), buildBtn = el.querySelector('[data-shop]');
  L.firstGain = current();
  let state = L.firstGain.game;
  let placing = null; // { kind, x, y }
  let scene;

  const showCoins = () => { coinsEl.textContent = fa(state.coins); };
  showCoins();

  class Land extends Phaser.Scene {
    preload() {
      for (const a of ART) if (a.key) this.load.image(a.key, a.file);
      this.load.image('coinImg', 'img/game/test/coin.webp');
    }

    create() {
      scene = this;
      const cam = this.cameras.main;
      cam.setBackgroundColor('#b98e57');
      this.zoomLevel = 1;
      cam.setZoom(this.zoomLevel * dpr);
      const [mx, my] = iso(SIZE / 2, SIZE / 2);
      cam.centerOn(mx, my - 20);
      this.drawGround();
      this.textures.exists('spark') || this.makeTextures();
      this.sprites = new Map();
      this.ghost = null;
      this.foot = this.add.graphics().setDepth(1);
      for (const it of state.items) this.addItem(it);
      this.input.addPointer(1);
      this.bindInput();
      el.querySelector('.game-wait').remove();
      const { gained } = L.firstGain || {};
      if (gained) this.time.delayedCall(400, () => flyCoins(gained, null));
    }

    makeTextures() {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xfff2b0, 1); g.fillPoints([{ x: 6, y: 0 }, { x: 12, y: 6 }, { x: 6, y: 12 }, { x: 0, y: 6 }], true);
      g.generateTexture('spark', 12, 12); g.clear();
      g.fillStyle(0xf2c14e, 1); g.fillCircle(10, 10, 10); g.lineStyle(2, 0xc98f1c, 1); g.strokeCircle(10, 10, 6.5);
      g.generateTexture('coin', 20, 20); g.destroy();
    }

    drawGround() {
      const g = this.add.graphics().setDepth(0);
      const M = 7; // desert around the land
      const dia = (x0, y0, x1, y1) => [iso(x0, y0), iso(x1, y0), iso(x1, y1), iso(x0, y1)].map(([x, y]) => ({ x, y }));
      g.fillStyle(0xc9a467, 1); g.fillPoints(dia(-M, -M, SIZE + M, SIZE + M), true);
      g.fillStyle(0xa8834f, 1); g.fillPoints(dia(-0.6, -0.6, SIZE + 0.6, SIZE + 0.6), true);
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        g.fillStyle((x + y) % 2 ? 0xd8bd84 : 0xd2b57a, 1);
        g.fillPoints(dia(x, y, x + 1, y + 1), true);
      }
      // a few palms in the desert
      // a few palms in the desert, each in its place in the depth order
      const palm = (x, y) => {
        const [px, py] = iso(x, y);
        const p = this.add.graphics().setDepth(10 + py);
        p.fillStyle(0x7a5532, 1); p.fillRect(px - 2, py - 34, 4, 34);
        p.fillStyle(0x4f8a3c, 1);
        for (const a of [-2.6, -2, -1.2, -0.5, 0.1]) p.fillTriangle(px, py - 36, px + Math.cos(a) * 22, py - 36 + Math.sin(a) * 10 + 8, px + Math.cos(a) * 18, py - 36 + Math.sin(a) * 10 + 2);
      };
      for (const [x, y] of [[-3, 3], [-4, 8], [SIZE + 3, 2], [SIZE + 3, 9], [4, -3], [9, SIZE + 3], [-3, SIZE + 2]]) palm(x, y);
      const [cx0, cy0] = iso(-M, SIZE + M), [cx1] = iso(SIZE + M, -M), [, cyt] = iso(-M, -M), [, cyb] = iso(SIZE + M, SIZE + M);
      this.cameras.main.setBounds(cx0 + 120, cyt + 60, cx1 - cx0 - 240, cyb - cyt - 120);
      void cy0;
    }

    // One building: a container at the middle of its footprint (so it bounces from its base).
    addItem(it) {
      const k = KINDS[it.kind];
      const [cx, cy] = iso(it.x + k.size / 2, it.y + k.size / 2);
      const c = this.add.container(cx, cy).setDepth(10 + cy);
      const g = this.add.graphics();
      c.add(g);
      const s = { c, g, it, bar: null, text: null, bubble: null };
      this.sprites.set(it.id, s);
      this.paint(s);
      return s;
    }

    paint(s) {
      const { it, g } = s;
      const k = KINDS[it.kind];
      g.clear();
      s.img?.destroy(); s.img = null;
      const art = it.kind === 'palace' && !it.done && ART[artPick].key;
      if (art) {
        // the image's bottom edge on the footprint's front corner, as wide as the footprint
        s.img = this.add.image(0, k.size * TH / 2, art).setOrigin(0.5, 1);
        s.img.setScale(k.size * TW * 1.04 / s.img.width);
        s.c.addAt(s.img, 0);
      }
      if (!art) for (const q of polys(it.kind, k.size, { building: !!it.done })) {
        g.fillStyle(parseInt(q.fill.slice(1), 16), it.done ? 0.8 : 1);
        const pts = []; for (let i = 0; i < q.pts.length; i += 2) pts.push({ x: q.pts[i], y: q.pts[i + 1] });
        g.fillPoints(pts, true);
      }
      s.text?.destroy(); s.bar?.destroy(); s.text = s.bar = null;
      if (it.done) {
        s.bar = this.add.graphics(); s.c.add(s.bar);
        s.text = this.add.text(0, -k.size * 22 - 46, '', { fontFamily: 'Vazirmatn, Tahoma', fontSize: '15px', color: '#fff', stroke: '#3b2a17', strokeThickness: 4 }).setOrigin(0.5);
        s.c.add(s.text);
      }
      this.status(s, Date.now());
    }

    // Timer and progress bar while building; a coin bubble when there is something to collect.
    status(s, now) {
      const { it } = s, k = KINDS[it.kind];
      if (it.done) {
        const rest = left(it, now), y = -k.size * 22 - 30;
        s.text.setText(rest ? faDigits(fmtLeft(rest)) : '');
        s.bar.clear();
        const p = k.time ? 1 - rest / k.time : 1;
        s.bar.fillStyle(0x2a1d10, 0.85); s.bar.fillRoundedRect(-30, y, 60, 9, 4);
        s.bar.fillStyle(rest ? 0x6cc070 : 0xf2c14e, 1); s.bar.fillRoundedRect(-29, y + 1, 58 * p, 7, 3);
        if (!rest && !s.ready) { s.ready = true; this.pulse(s.c); }
        return;
      }
      const n = stored(it, now);
      if (n >= 3 && !s.bubble) {
        s.bubble = this.add.image(0, -k.size * 22 - 34, 'coinImg').setScale(28 / 128);
        s.c.add(s.bubble);
        this.tweens.add({ targets: s.bubble, y: s.bubble.y - 6, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      } else if (n < 3 && s.bubble) { s.bubble.destroy(); s.bubble = null; }
    }

    pulse(c) { this.tweens.add({ targets: c, scaleX: 1.06, scaleY: 1.06, duration: 260, yoyo: true, repeat: 2 }); }
    bounce(c) {
      this.tweens.killTweensOf(c); c.setScale(1);
      this.tweens.add({ targets: c, scaleY: { from: 0.86, to: 1 }, scaleX: { from: 1.08, to: 1 }, duration: 380, ease: 'Back.easeOut' });
    }
    sparks(x, y) {
      const p = this.add.particles(x, y, 'spark', { speed: { min: 80, max: 220 }, angle: { min: 200, max: 340 }, lifespan: 700, scale: { start: 1.2, end: 0 }, gravityY: 300, quantity: 18, emitting: false }).setDepth(5000);
      p.explode(18); this.time.delayedCall(900, () => p.destroy());
    }
    label(s, text) {
      const k = KINDS[s.it.kind];
      const t = this.add.text(s.c.x, s.c.y - k.size * 22 - 40, text, { fontFamily: 'Vazirmatn, Tahoma', fontSize: '16px', color: '#fff', stroke: '#3b2a17', strokeThickness: 4 }).setOrigin(0.5).setDepth(6000);
      this.tweens.add({ targets: t, y: t.y - 14, alpha: { from: 1, to: 0 }, delay: 700, duration: 600, onComplete: () => t.destroy() });
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

    zoomTo(z) {
      this.zoomLevel = Phaser.Math.Clamp(z, ZMIN, ZMAX);
      this.cameras.main.setZoom(this.zoomLevel * dpr);
    }

    tap(t) {
      if (placing) {
        const s = KINDS[placing.kind].size;
        placing.x = Phaser.Math.Clamp(t.x - Math.floor(s / 2), 0, SIZE - s);
        placing.y = Phaser.Math.Clamp(t.y - Math.floor(s / 2), 0, SIZE - s);
        this.drawGhost(); return;
      }
      const it = itemAt(state, t.x, t.y);
      if (!it) return;
      const s = this.sprites.get(it.id), now = Date.now();
      if (it.done) {
        const g = finish(state, it.id, now);
        if (!g) { this.bounce(s.c); return; }
        commit(g);
        s.it = state.items.find(i => i.id === it.id); s.ready = false;
        this.paint(s); this.bounce(s.c); this.sparks(s.c.x, s.c.y - 20);
        try { navigator.vibrate?.(20); } catch { /* not allowed */ }
        return;
      }
      const c = collect(state, it.id, now);
      if (c) {
        commit(c.game);
        s.it = state.items.find(i => i.id === it.id);
        this.status(s, now); this.bounce(s.c);
        flyCoins(c.gained, s.c);
        return;
      }
      if (it.kind === 'palace') { // style test: the next look
        artPick = (artPick + 1) % ART.length;
        try { localStorage.setItem('tanara:gameArt', String(artPick)); } catch { /* storage blocked */ }
        this.paint(s); this.bounce(s.c); this.label(s, ART[artPick].name);
        return;
      }
      this.bounce(s.c);
      this.label(s, KINDS[it.kind].name);
    }

    drawGhost() {
      this.ghost?.destroy(); this.foot.clear();
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

    update() {
      const now = Date.now();
      if (now - (this.last || 0) < 250) return;
      this.last = now;
      for (const s of this.sprites.values()) if (s.it.done || KINDS[s.it.kind].rate) this.status(s, now);
    }
  }

  function commit(g) { state = g; save(g); showCoins(); }

  // Coins fly from a building (or the middle of the screen) to the counter.
  function flyCoins(n, from) {
    const box = el.querySelector('.game-coins'), r = box.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    let sx = sr.width / 2, sy = sr.height / 2;
    if (from && scene) {
      const cam = scene.cameras.main;
      sx = ((from.x - cam.worldView.x) * cam.zoom) / dpr; sy = ((from.y - 40 - cam.worldView.y) * cam.zoom) / dpr;
    }
    const k = Math.min(8, Math.max(3, Math.ceil(n / 5)));
    for (let i = 0; i < k; i++) {
      const c = document.createElement('span');
      c.className = 'game-fly'; c.innerHTML = coinSvg(18);
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

  // Shop: one card per building, with its picture, cost and time.
  function openShop() {
    const cards = shopEl.querySelector('.game-cards');
    cards.innerHTML = SHOP.map(k => {
      const K = KINDS[k], ok = canBuy(state, k);
      return `<button class="game-card${ok ? '' : ' off'}" data-kind="${k}">
        <canvas></canvas><b>${K.name}</b>
        <span class="game-cost">${coinSvg(15)}${fa(K.cost)}</span>
        <span class="game-time">${clockSvg}${fa(Math.round(K.time / 60000))} دقیقه</span>
      </button>`;
    }).join('');
    shopEl.hidden = false;
    cards.querySelectorAll('[data-kind]').forEach(b => drawPreview(b.querySelector('canvas'), b.dataset.kind, KINDS[b.dataset.kind].size));
  }
  buildBtn.onclick = () => (shopEl.hidden ? openShop() : (shopEl.hidden = true));
  shopEl.onclick = e => {
    const b = e.target.closest('[data-kind]');
    if (!b) { shopEl.hidden = true; return; }
    if (b.classList.contains('off')) { b.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], 260); return; }
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
    const g = placing && place(state, placing.kind, placing.x, placing.y, Date.now());
    if (!g) return;
    commit(g);
    const it = g.items[g.items.length - 1];
    endPlacing();
    const s = scene.addItem(it);
    scene.bounce(s.c); scene.sparks(s.c.x, s.c.y);
    try { navigator.vibrate?.(15); } catch { /* not allowed */ }
  };

  L.sync = () => { // the store changed (maybe a meal was logged elsewhere, or another device saved)
    const { game, gained } = current();
    if (game === state) return;
    const before = state;
    state = game;
    showCoins();
    if (gained) flyCoins(gained, null);
    if (scene && game.items.some(it => !before.items.find(b => b.id === it.id && b.x === it.x && b.y === it.y && b.done === it.done))) {
      for (const s of scene.sprites.values()) s.c.destroy();
      scene.sprites.clear();
      for (const it of state.items) scene.addItem(it);
    }
  };

  L.game = new Phaser.Game({
    type: Phaser.AUTO, parent: stage, backgroundColor: '#b98e57',
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
