/*
  «بیشتر» (a tab of the bottom bar, where «مجله» used to be): the app's tools as square tiles,
  like the icons on a phone's home screen. Holding a tile for a moment picks it up; dragging it
  puts it somewhere else, and that order is kept in the profile (profile.toolsOrder), so it is
  the same on every device of that member. «تمام» (or a tap outside the tiles) ends arranging.

  Tiles: the family shopping list, the food bank, its recipes, the magazine (its own page,
  #/mag), and for the app owner «غذاهای تازه‌ی خانواده».
*/
import * as store from '../data/store.js';
import { fa } from '../lib/fa.js';
import { icon } from './dom.js';
import { openShopping, shopping } from './shopping.js';
import { toBuy } from '../domain/shopping.js';
import { openFoodBank, openRecipes } from './foodBank.js';
import { shareAdmin, checkShare, openFoodShare } from './foodShare.js';
import { drawPreview } from './gameArt.js';
import { KINDS } from '../domain/game.js';
import { oneOn } from './meal.js';

// a tile drawn here rather than an image: a plate with a fork and a spoon
const PLATE = `<svg viewBox="0 0 48 48" width="62%" height="62%" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="24" cy="24" r="12.5"/><circle cx="24" cy="24" r="7.5" stroke-opacity=".55"/>
  <path d="M6 9v9a3 3 0 0 0 3 3v18M9 9v7M12 9v9a3 3 0 0 1-3 3"/><path d="M41 39V22c-3 0-4-4-4-7s1.5-6 4-6v30"/></svg>`;

const again = () => { const v = document.querySelector('#view .tools'); if (v) renderTools(v.parentElement); };
const TOOLS = {
  shop: { label: 'لیست خرید', badge: () => toBuy(shopping()).length, open: () => openShopping() },
  bank: { label: 'بانک غذا', open: () => openFoodBank() },
  recipes: { label: 'رسپی‌ها', open: () => openRecipes() },
  mag: { label: 'مجله', open: () => { location.hash = '#/mag'; } },
  share: { label: 'غذاهای تازه‌ی خانواده', only: shareAdmin, open: () => openFoodShare(() => checkShare(again, true)) },
  // beta, only for accounts with `game` in profile.beta (set from the database)
  // beta, only for accounts with `one`: the single meal screen (meal.js), on its own page for now
  meals: { label: 'وعده‌ها', beta: true, svg: PLATE, only: oneOn, open: () => { location.hash = '#/meals'; } },
  game: { label: 'سرزمین', beta: true, art: 'palace', only: () => (store.profile()?.beta || []).includes('game'), open: () => { location.hash = '#/game'; } },
};

// The member's order: what they arranged, then any tool added since, in its usual place.
function order() {
  const saved = (store.profile()?.toolsOrder || []).filter(k => TOOLS[k]);
  return [...saved, ...Object.keys(TOOLS).filter(k => !saved.includes(k))].filter(k => !TOOLS[k].only || TOOLS[k].only());
}

let arranging = false;

export function renderTools(root) {
  checkShare(again);
  const keys = order();
  root.innerHTML = `
    <section class="tools">
      <header class="page-head head-row">
        <h1>بیشتر</h1>
        ${arranging ? '<button class="btn sm" data-done>تمام</button>' : ''}
      </header>
      <div class="tool-grid${arranging ? ' arranging' : ''}">
        ${keys.map(k => {
          const t = TOOLS[k], n = t.badge?.() || 0;
          return `<button class="tool" data-tool="${k}" aria-label="${t.label}${n ? `، ${fa(n)} مورد` : ''}">
            <span class="tool-ic">${t.svg ? t.svg : t.art ? `<canvas data-art="${t.art}"></canvas>` : `<img src="img/tools/${k}.webp" alt="" draggable="false">`}${n ? `<b class="tool-badge">${fa(n)}</b>` : ''}</span>
            <span class="tool-name">${t.label}${t.beta ? '<small>آزمایشی</small>' : ''}</span>
          </button>`;
        }).join('')}
      </div>
    </section>`;

  const grid = root.querySelector('.tool-grid');
  grid.querySelectorAll('canvas[data-art]').forEach(c => drawPreview(c, c.dataset.art, KINDS[c.dataset.art].size));
  const stop = () => { arranging = false; renderTools(root); };
  root.querySelector('[data-done]')?.addEventListener('click', stop);
  root.querySelector('.tools').addEventListener('click', e => {
    if (arranging && !e.target.closest('.tool, [data-done]')) stop();
  });
  bindArrange(grid, () => {
    if (!arranging) { arranging = true; grid.classList.add('arranging'); showDone(root, stop); }
  }, keys => {
    const p = store.profile();
    // the owner-only tile keeps its place for them; the others never see it either way
    const rest = (p.toolsOrder || []).filter(k => !keys.includes(k));
    store.saveProfile({ ...p, toolsOrder: [...keys, ...rest] });
  });
  grid.addEventListener('click', e => {
    const b = e.target.closest('[data-tool]');
    if (!b || arranging || b.dataset.dragged) return;
    TOOLS[b.dataset.tool].open();
  });
}

function showDone(root, stop) {
  const head = root.querySelector('.page-head');
  if (head.querySelector('[data-done]')) return;
  head.insertAdjacentHTML('beforeend', '<button class="btn sm" data-done>تمام</button>');
  head.querySelector('[data-done]').addEventListener('click', stop);
}

/*
  Hold (HOLD ms without moving) to pick a tile up; while arranging, a tile is picked up at once.
  The tile follows the finger, and the others make room as it passes over them. `onPick` runs
  when arranging starts, `onDrop` with the new order of keys.
*/
const HOLD = 420;
function bindArrange(grid, onPick, onDrop) {
  let timer = 0, drag = null, start = null;

  const cancelHold = () => { clearTimeout(timer); timer = 0; };
  const pick = (el, x, y) => {
    const r = el.getBoundingClientRect();
    drag = { el, dx: x - r.left, dy: y - r.top, moved: false };
    el.classList.add('lifted');
    try { navigator.vibrate?.(15); } catch { /* not allowed */ }
    onPick();
  };
  const follow = (x, y) => {
    const el = drag.el;
    el.style.transform = 'none';
    const r = el.getBoundingClientRect();
    el.style.transform = `translate(${x - drag.dx - r.left}px, ${y - drag.dy - r.top}px) scale(1.08)`;
    const over = [...grid.children].find(t => {
      if (t === el) return false;
      const b = t.getBoundingClientRect();
      return x > b.left && x < b.right && y > b.top && y < b.bottom;
    });
    if (!over) return;
    const tiles = [...grid.children];
    if (tiles.indexOf(el) < tiles.indexOf(over)) over.after(el); else over.before(el);
    drag.moved = true;
    follow(x, y); // its place in the grid changed: keep it under the finger
  };
  const drop = () => {
    if (!drag) return;
    const { el, moved } = drag;
    drag = null;
    el.classList.remove('lifted');
    el.style.transform = '';
    // the click that ends a drag must not open the tool
    el.dataset.dragged = '1';
    setTimeout(() => delete el.dataset.dragged, 0);
    if (moved) onDrop([...grid.children].map(t => t.dataset.tool));
  };

  grid.addEventListener('pointerdown', e => {
    const el = e.target.closest('.tool');
    if (!el || e.button > 0) return;
    start = { x: e.clientX, y: e.clientY };
    if (grid.classList.contains('arranging')) { pick(el, e.clientX, e.clientY); el.setPointerCapture?.(e.pointerId); return; }
    cancelHold();
    timer = setTimeout(() => { timer = 0; pick(el, start.x, start.y); el.setPointerCapture?.(e.pointerId); }, HOLD);
  });
  grid.addEventListener('pointermove', e => {
    if (timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) cancelHold(); // scrolling, not holding
    if (drag) follow(e.clientX, e.clientY);
  });
  grid.addEventListener('pointerup', () => { cancelHold(); drop(); });
  grid.addEventListener('pointercancel', () => { cancelHold(); drop(); });
  // while a tile is held the page must not scroll under it, nor the phone's long-press menu open
  grid.addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false });
  grid.addEventListener('contextmenu', e => e.preventDefault());
}
