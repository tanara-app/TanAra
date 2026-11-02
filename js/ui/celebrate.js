/*
  The day the goal weight is reached deserves more than a note: a full screen with confetti, what
  it took in their own numbers, and Heimerdinger celebrating. Once per goal, kept in the profile
  (goalCelebrated) so another device doesn't repeat it; a new goal can be celebrated again. Not
  with a possible eating-disorder history (see celebrationDue): a party about the scale is the
  last thing that helps. The quiet note on «امروز» and the step to maintenance stay as they were.
*/
import * as store from '../data/store.js';
import { celebrationDue } from '../domain/phase.js';
import { sortedWeights } from '../domain/stats.js';
import { today, diffDays } from '../lib/dates.js';
import { fa } from '../lib/fa.js';
import { face, mascotOn, celebrateSound } from './mascot.js';
import { toMaintenance } from './phase.js';

const COLORS = ['#7fd1ae', '#f4c867', '#f08a7a', '#a99cf0', '#7cc4ee', '#fff3d6'];

// Falling paper, for a few seconds. Plain canvas, so it needs nothing from outside.
function confetti(canvas) {
  const ctx = canvas.getContext('2d');
  const size = () => {
    const r = window.devicePixelRatio || 1;
    canvas.width = innerWidth * r; canvas.height = innerHeight * r;
    ctx.setTransform(r, 0, 0, r, 0, 0);
  };
  size();
  const bits = Array.from({ length: 130 }, () => ({
    x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.9,
    w: 6 + Math.random() * 6, h: 9 + Math.random() * 7,
    fall: 1.6 + Math.random() * 2.6, sway: Math.random() * 6.28, spin: Math.random() * 6.28, turn: 0.04 + Math.random() * 0.12,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));
  const end = Date.now() + 5500;
  (function frame() {
    if (!canvas.isConnected) return;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const going = Date.now() < end;
    let left = false;
    for (const b of bits) {
      b.y += b.fall; b.sway += 0.03; b.spin += b.turn;
      if (b.y > innerHeight + 20) { if (!going) continue; b.y = -20; b.x = Math.random() * innerWidth; }
      left = true;
      ctx.save();
      ctx.translate(b.x + Math.sin(b.sway) * 18, b.y);
      ctx.rotate(b.spin);
      ctx.fillStyle = b.color;
      ctx.fillRect(-b.w / 2, -b.h / 2 * Math.abs(Math.cos(b.spin)), b.w, b.h * Math.abs(Math.cos(b.spin)));
      ctx.restore();
    }
    if (left) requestAnimationFrame(frame); else canvas.remove();
  })();
}

function show(p, reached) {
  const s = store.get();
  const t = today();
  const first = sortedWeights(s.weights)[0];
  const lost = Number(first.kg) - reached.avg;
  const days = diffDays(t, first.day);
  const logged = new Set(s.entries.map(e => e.day)).size;
  const el = document.createElement('div');
  el.className = 'party';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  const still = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
  el.innerHTML = `
    ${still ? '' : '<canvas class="party-paper" aria-hidden="true"></canvas>'}
    <div class="party-body">
      ${mascotOn() ? `<img class="party-face" src="${face('party')}" alt="" width="200" height="200">` : ''}
      <h1>رسیدی!</h1>
      <p class="party-line">وزن هدفت ${fa(p.goalKg, 1)} کیلو بود و الان میانگین وزنت ${fa(reached.avg, 1)} کیلو است.</p>
      <div class="party-stats">
        ${lost > 0 ? `<div><b>${fa(lost, 1)}</b><span>کیلو کمتر</span></div>` : ''}
        ${days > 0 ? `<div><b>${fa(days)}</b><span>روز راه</span></div>` : ''}
        ${logged > 0 ? `<div><b>${fa(logged)}</b><span>روز ثبت</span></div>` : ''}
      </div>
      <p class="muted">این کار خودت بود؛ روز به روز و وعده به وعده. حالا مرحله‌ی بعد نگه داشتن همین وزن است.</p>
      <button class="btn primary block big" data-party-go>برویم سراغ نگه داشتنش</button>
      <button class="btn ghost block" data-party-close>فعلاً فقط جشن بگیریم</button>
    </div>`;
  const close = () => { window.removeEventListener('hashchange', close); el.remove(); };
  el.querySelector('[data-party-close]').onclick = close;
  el.querySelector('[data-party-go]').onclick = () => { close(); toMaintenance(); };
  window.addEventListener('hashchange', close);
  document.body.appendChild(el);
  const paper = el.querySelector('.party-paper');
  if (paper) confetti(paper);
  celebrateSound();
}

// Called after every draw. It waits for a form to close, since the weigh-in that gets them there
// is usually saved from one; a typed field or the chat holds it back until the next draw.
let timer = 0;
export function maybeCelebrate() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const p = store.profile();
    const reached = p && celebrationDue(p, sortedWeights(store.get().weights), today());
    if (!reached || document.querySelector('.party')) return;
    if (document.querySelector('.sheet-wrap') || document.body.classList.contains('kb') || document.body.classList.contains('chat-mode')) return;
    store.saveProfile({ ...p, goalCelebrated: Number(p.goalKg) });
    show(p, reached);
  }, 1000);
}
