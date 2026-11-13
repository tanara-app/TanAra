/*
  «سرزمین»: the battle screen (GAME.md §8). A second Phaser scene over the same game, with its own
  HTML bar; the village scene sleeps meanwhile. The fight itself is js/domain/battle.js.

  Laid out as in the genre (GAME.md §13b): top left the fort's name and the loot still there; top right
  the time left; bottom right the stars and destruction; bottom left the red flag that ends the battle;
  along the bottom the troops still to place, with their counts (tap one to pick it). Tap the ground to place one, hold to place a stream. Troops can't go down in
  the red zone round the buildings; it shows at the start and wherever a tap is refused. When the
  battle is over a sheet shows the stars and the loot; ✓ goes back to the village.
  A replay (opts.plan, a raid from js/domain/raid.js) places the troops by itself and takes no taps.
*/
import { fa, faDigits } from '../lib/fa.js';
import { I, troopIcon } from './gameIcons.js';
import { SIZE, KINDS } from '../domain/game.js';
import { TROOPS, TROOP_ORDER } from '../domain/army.js';
import { makeBattle, deploy, canDeploy, step, result, over, BATTLE_TIME, STEP } from '../domain/battle.js';
import { TW, TH, iso, polys } from './gameArt.js';

const OUT = 8;
const starSvg = (on, s = 26) => I.star(s, on);
const troopSvg = (t, s = 34) => troopIcon(t, TROOPS[t].color, s);

/*
  Opens a battle. opts: { game (Phaser.Game), el (the .game section), layout, army, dpr, title,
  onEnd(result) → { got } (applies it to the saved game and returns what went in), onClose() }.
*/
// The same nudge as a raid (js/domain/raid.js): a spot in the red zone moves a little further out.
function nudge(b, p) {
  for (let d = 0.5; d < 3; d += 0.5) for (const [dx, dy] of [[0, -d], [d, 0], [0, d], [-d, 0]]) if (canDeploy(b, p.x + dx, p.y + dy)) { deploy(b, p.t, p.x + dx, p.y + dy); return; }
}

export function openBattle(opts) {
  const { game, el, layout, army, dpr } = opts;
  const b = makeBattle(layout, army);
  const plan = opts.plan || null;
  let pick = plan ? null : TROOP_ORDER.find(t => army[t] > 0) || null, ended = false, k = 0;

  el.classList.add('in-battle');
  const hud = document.createElement('div');
  hud.className = `battle-hud${plan ? ' replay' : ''}`;
  hud.innerHTML = `
    <div class="bh-name"><b>${opts.title || ''}</b><span class="bh-loot" data-loot></span></div>
    <div class="bh-time"><span>پایان نبرد در</span><b data-time></b></div>
    <div class="bh-score"><span class="gstars" data-stars></span><b data-pct></b></div>
    <button class="bh-end" data-end aria-label="پایان">${I.flag(24)}<span>پایان</span></button>
    <div class="battle-troops" data-troops></div>
    <div class="battle-over" hidden></div>`;
  el.appendChild(hud);
  const $ = (s) => hud.querySelector(s);

  function bar() {
    $('[data-troops]').innerHTML = TROOP_ORDER.filter(t => army[t] > 0).map(t =>
      `<button class="battle-troop${t === pick ? ' on' : ''}${b.left[t] ? '' : ' none'}" data-t="${t}"><b>×${fa(b.left[t] || 0)}</b>${troopSvg(t, 46)}</button>`).join('');
  }
  function top() {
    const r = result(b), left = Math.max(0, BATTLE_TIME - b.t);
    $('[data-time]').textContent = faDigits(`${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`);
    $('[data-pct]').textContent = `${fa(r.pct)}٪`;
    $('[data-stars]').innerHTML = [0, 1, 2].map(i => starSvg(i < r.stars, 26)).join('');
    const left2 = { coin: Math.max(0, (layout.loot?.coin || 0) - b.got.coin), water: Math.max(0, (layout.loot?.water || 0) - b.got.water) };
    $('[data-loot]').innerHTML = ['coin', 'water'].map(k => `<span class="gc">${opts.resIcon[k](20)}<b>${fa(left2[k])}</b></span>`).join('');
  }
  bar(); top();
  $('[data-troops]').onclick = e => { const t = e.target.closest('[data-t]'); if (t) { pick = t.dataset.t; bar(); } };
  $('[data-end]').onclick = () => finish();

  function finish() {
    if (ended) return;
    ended = true;
    const r = result(b);
    const { got } = opts.onEnd?.(r) || { got: r.loot };
    const lootHtml = ['coin', 'water'].map(k => `<span class="battle-loot">${opts.resIcon[k](30)}<b>${fa(got[k] || 0)}</b></span>`).join('');
    const box = $('.battle-over');
    box.innerHTML = `<div class="battle-card">
      <div class="battle-big">${[0, 1, 2].map(i => starSvg(i < r.stars, 58)).join('')}</div>
      <div class="battle-pct">${fa(r.pct)}٪</div>
      <div class="battle-loots">${lootHtml}</div>
      <button class="gb green big" data-back aria-label="برگشت">${I.check(30)}</button></div>`;
    box.hidden = false;
    box.querySelector('[data-back]').onclick = close;
    scene.pauseSim = true;
  }
  function close() {
    game.scene.remove('battle');
    hud.remove();
    el.classList.remove('in-battle');
    opts.onClose?.();
  }

  class Battle extends Phaser.Scene {
    create() {
      scene = this;
      const cam = this.cameras.main;
      cam.setBackgroundColor('#4d5a2a');
      const g = this.add.graphics().setDepth(0);
      const dia = (x0, y0, x1, y1) => [iso(x0, y0), iso(x1, y0), iso(x1, y1), iso(x0, y1)].map(([x, y]) => ({ x, y }));
      g.fillStyle(0x4d5a2a, 1); g.fillPoints(dia(-OUT * 3, -OUT * 3, SIZE + OUT * 3, SIZE + OUT * 3), true);
      g.fillStyle(0x93a24d, 1); g.fillPoints(dia(0, 0, SIZE, SIZE), true);
      let seed = 11; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 70; i++) { const x = r() * (SIZE - 3), y = r() * (SIZE - 3), w = 1 + r() * 2.5; g.fillStyle(r() < 0.5 ? 0x9fae57 : 0x879643, 0.8); g.fillPoints(dia(x, y, x + w, y + w * (0.6 + r() * 0.8)), true); }
      this.zone = this.add.graphics().setDepth(1).setAlpha(0);
      this.zone.fillStyle(0xd23b2a, 0.32);
      for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y++) if (!canDeploy(b, x + 0.5, y + 0.5)) this.zone.fillPoints(dia(x, y, x + 1, y + 1), true);
      this.showZone();
      this.sprites = new Map();
      for (const o of b.blds) this.addBld(o);
      this.fx = this.add.graphics().setDepth(9000);
      this.units = this.add.graphics().setDepth(8000);
      const [x0] = iso(-OUT, SIZE + OUT), [x1] = iso(SIZE + OUT, -OUT), [, y0] = iso(-OUT, -OUT), [, y1] = iso(SIZE + OUT, SIZE + OUT);
      cam.setBounds(x0, y0, x1 - x0, y1 - y0);
      this.zoom = 0.55; this.applyZoom();
      const [mx, my] = iso(SIZE / 2, SIZE / 2); cam.centerOn(mx, my);
      this.acc = 0;
      this.input.addPointer(1);
      this.bindInput();
    }
    applyZoom() {
      const bd = this.cameras.main.getBounds(), vw = this.scale.width / dpr, vh = this.scale.height / dpr;
      this.zoom = Phaser.Math.Clamp(this.zoom, Math.max(0.2, vw / bd.width, vh / bd.height), 2);
      this.cameras.main.setZoom(this.zoom * dpr);
    }
    showZone() { this.tweens.killTweensOf(this.zone); this.zone.setAlpha(1); this.tweens.add({ targets: this.zone, alpha: 0, delay: 1600, duration: 700 }); }
    addBld(o) {
      const [cx, cy] = iso(o.x + o.s / 2, o.y + o.s / 2);
      const c = this.add.container(cx, cy).setDepth(10 + cy);
      if (o.trap) { c.setVisible(false); }
      if (o.kind === 'palace' && this.textures.exists('art-palace')) {
        const img = this.add.image(0, o.s * TH / 2, 'art-palace').setOrigin(0.5, 1);
        img.setScale(o.s * TW / img.width); c.add(img);
      } else {
        const g = this.add.graphics();
        for (const q of polys(o.kind, o.s)) {
          g.fillStyle(parseInt(q.fill.slice(1), 16), 1);
          const p = []; for (let i = 0; i < q.pts.length; i += 2) p.push({ x: q.pts[i], y: q.pts[i + 1] });
          g.fillPoints(p, true);
        }
        c.add(g);
      }
      this.sprites.set(o.id, { c, o, down: false });
    }
    rubble(s) {
      s.down = true;
      s.c.removeAll(true);
      if (s.o.trap) { s.c.setVisible(false); return; }
      const g = this.add.graphics(), k = s.o.s;
      const pts = [iso(0, 0), iso(k, 0), iso(k, k), iso(0, k)].map(([x, y]) => { const [cx, cy] = iso(k / 2, k / 2); return { x: x - cx, y: y - cy }; });
      g.fillStyle(0x5b4a38, 0.9); g.fillPoints(pts, true);
      for (let i = 0; i < 5 * k; i++) { g.fillStyle(i % 2 ? 0x7d6a55 : 0x463828, 1); g.fillRect((Math.sin(i * 7.3) * 0.35) * k * TW / 2, (Math.cos(i * 3.1) * 0.3) * k * TH / 2 - 4, 6, 4); }
      s.c.add(g); s.c.setDepth(5 + s.c.y);
      const p = this.add.particles(s.c.x, s.c.y - 10, 'spark', { speed: { min: 60, max: 180 }, angle: { min: 200, max: 340 }, lifespan: 600, scale: { start: 1, end: 0 }, gravityY: 300, tint: 0xb8a58a, emitting: false }).setDepth(9500);
      p.explode(14); this.time.delayedCall(800, () => p.destroy());
    }
    bindInput() {
      const cam = this.cameras.main;
      let down = null, pinch = null, hold = null;
      const tile = (px, py) => { const p = cam.getWorldPoint(px, py); const a = p.x / (TW / 2), c = p.y / (TH / 2); return { x: (a + c) / 2, y: (c - a) / 2 }; };
      const place = (p) => {
        if (plan) return;
        if (ended || !pick || !(b.left[pick] > 0)) return;
        const t = tile(p.x, p.y);
        if (!deploy(b, pick, t.x, t.y)) { if (!canDeploy(b, t.x, t.y)) this.showZone(); return; }
        if (!b.left[pick]) pick = TROOP_ORDER.find(x => b.left[x] > 0) || pick;
        bar();
      };
      this.input.on('pointerdown', p => {
        if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
          pinch = { d: Phaser.Math.Distance.Between(this.input.pointer1.x, this.input.pointer1.y, this.input.pointer2.x, this.input.pointer2.y), z: this.zoom };
          down = null; hold?.remove(); return;
        }
        down = { x: p.x, y: p.y, moved: false };
        hold = this.time.addEvent({ delay: 350, callback: () => { if (down && !down.moved) { hold = this.time.addEvent({ delay: 110, loop: true, callback: () => place(p) }); place(p); down.held = true; } } });
      });
      this.input.on('pointermove', p => {
        if (pinch && this.input.pointer1.isDown && this.input.pointer2.isDown) {
          const d = Phaser.Math.Distance.Between(this.input.pointer1.x, this.input.pointer1.y, this.input.pointer2.x, this.input.pointer2.y);
          this.zoom = pinch.z * d / pinch.d; this.applyZoom(); return;
        }
        if (!down || !p.isDown) return;
        if (!down.moved && Math.hypot(p.x - down.x, p.y - down.y) < 8 * dpr) return;
        if (down.held) return;
        down.moved = true; hold?.remove();
        cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom; cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
      });
      this.input.on('pointerup', p => {
        hold?.remove(); hold = null;
        if (pinch) { if (!this.input.pointer1.isDown && !this.input.pointer2.isDown) pinch = null; return; }
        if (down && !down.moved && !down.held) place(p);
        down = null;
      });
      this.input.on('wheel', (p, o, dx, dy) => { this.zoom *= dy > 0 ? 0.9 : 1.1; this.applyZoom(); });
    }
    update(time, delta) {
      if (this.pauseSim) return;
      this.acc += Math.min(delta, 250) / 1000;
      const shots = [], booms = [];
      while (this.acc >= STEP) {
        this.acc -= STEP;
        if (plan) { while (k < plan.length && plan[k].s <= b.clock + 1e-9) { const p = plan[k++]; if (!deploy(b, p.t, p.x, p.y)) nudge(b, p); } bar(); }
        step(b, STEP); b.clock += STEP; shots.push(...b.shots); booms.push(...b.booms);
        if (over(b) && (!plan || k >= plan.length)) break;
      }
      for (const s of this.sprites.values()) if (s.o.dead && !s.down) this.rubble(s);
      this.draw(shots, booms);
      top();
      if (over(b) && (!plan || k >= plan.length) && !ended) { ended = true; this.time.delayedCall(700, () => { ended = false; finish(); }); }
    }
    draw(shots, booms) {
      const u = this.units, f = this.fx;
      u.clear(); f.clear();
      // health bars of damaged buildings
      for (const s of this.sprites.values()) {
        const o = s.o;
        if (o.dead || o.trap || o.hp >= o.max) continue;
        const y = s.c.y - o.s * 20 - 18, w = 14 + o.s * 8;
        f.fillStyle(0x2a1d10, 0.85); f.fillRect(s.c.x - w / 2, y, w, 5);
        f.fillStyle(0xe0533d, 1); f.fillRect(s.c.x - w / 2 + 1, y + 1, (w - 2) * o.hp / o.max, 3);
      }
      for (const tr of b.troops) {
        if (tr.dead) continue;
        const [x, y] = iso(tr.x, tr.y), lift = tr.air ? 30 : 0, T = TROOPS[tr.t], r = 8 + Math.sqrt(T.room) * 3;
        u.fillStyle(0x000000, 0.25); u.fillEllipse(x, y, r * 2.2, r);
        u.fillStyle(parseInt(T.color.slice(1), 16), 1); u.fillCircle(x, y - r - lift, r);
        u.lineStyle(1.5, 0x3b2a17, 1); u.strokeCircle(x, y - r - lift, r);
        if (tr.hp < tr.max) { u.fillStyle(0x2a1d10, 0.8); u.fillRect(x - 8, y - 2 * r - lift - 7, 16, 3); u.fillStyle(0x6cc070, 1); u.fillRect(x - 8, y - 2 * r - lift - 7, 16 * tr.hp / tr.max, 3); }
      }
      const seen = new Set();
      for (const sh of shots) {
        if (seen.has(sh.from)) continue; seen.add(sh.from);
        const s = this.sprites.get(sh.from); if (!s) continue;
        const [x, y] = iso(sh.x, sh.y);
        const col = s.o.kind === 'fire' ? 0xff7a2a : s.o.kind === 'airtower' ? 0x7fd0ff : 0xfff2b0;
        f.lineStyle(2, col, 0.9); f.lineBetween(s.c.x, s.c.y - s.o.s * 18, x, y - (sh.air ? 36 : 6));
      }
      for (const bm of booms) {
        const [x, y] = iso(bm.x, bm.y);
        const c = this.add.circle(x, y, bm.r * TW / 2, 0xffb347, 0.6).setDepth(9600).setScale(1, 0.5);
        this.tweens.add({ targets: c, alpha: 0, scaleX: 1.4, scaleY: 0.7, duration: 400, onComplete: () => c.destroy() });
      }
    }
  }
  let scene = null;
  game.scene.add('battle', Battle, true);
}
