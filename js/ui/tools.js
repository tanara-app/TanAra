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
import { openRewards } from './rewards.js';


// the game's tile: a safe's round door at night, with a red beam across it
const HEIST_ICON = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="6" y="6" width="52" height="52" rx="12" fill="#16224a"/><circle cx="32" cy="33" r="16" fill="#2b3f7a" stroke="#ffc94a" stroke-width="3"/><circle cx="32" cy="33" r="5" fill="#ffc94a"/><path d="M32 21v6M32 39v6M20 33h6M38 33h6" stroke="#ffc94a" stroke-width="3" stroke-linecap="round"/><path d="M6 17h52" stroke="#ff2e4d" stroke-width="2.5"/><circle cx="50" cy="50" r="3" fill="#3de0ff"/></svg>`;
// the garden's tile: a pomegranate tree on a patch of grass
const GARDEN_ICON = `<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="52" rx="20" ry="6" fill="#7cbf5a"/><path d="M30 52V36h4v16z" fill="#8a5a33"/><circle cx="32" cy="27" r="15" fill="#4f9a3e"/><circle cx="24" cy="22" r="8" fill="#5fb04a"/><circle cx="39" cy="21" r="8" fill="#5fb04a"/><circle cx="26" cy="31" r="2.6" fill="#d8443a"/><circle cx="37" cy="29" r="2.6" fill="#d8443a"/><circle cx="32" cy="20" r="2.4" fill="#d8443a"/></svg>`;

const again = () => { const v = document.querySelector('#view .tools'); if (v) renderTools(v.parentElement); };
const TOOLS = {
  shop: { label: 'لیست خرید', badge: () => toBuy(shopping()).length, open: () => openShopping() },
  bank: { label: 'بانک غذا', open: () => openFoodBank() },
  recipes: { label: 'رسپی‌ها', open: () => openRecipes() },
  mag: { label: 'مجله', open: () => { location.hash = '#/mag'; } },
  share: { label: 'غذاهای تازه‌ی خانواده', only: shareAdmin, open: () => openFoodShare(() => checkShare(again, true)) },
  // what a member earns by keeping a habit (for everyone since 2026-11-15)
  rewards: { label: 'جوایز', open: () => openRewards() },
  // beta, only for accounts with `game` in profile.beta (set from the database; the key is older than the garden)
  // «سرقت بزرگ» took the garden's tile on 2026-11-17 (the garden's page is still at #/garden, with no tile)
  heist: { label: 'سرقت بزرگ', beta: true, svg: HEIST_ICON, only: () => (store.profile()?.beta || []).includes('game'), open: () => { location.hash = '#/heist'; } },
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
            <span class="tool-ic">${t.svg ? t.svg : `<img src="img/tools/${k}.webp" alt="" draggable="false">`}${n ? `<b class="tool-badge">${fa(n)}</b>` : ''}</span>
            <span class="tool-name">${t.label}${t.beta ? '<small>آزمایشی</small>' : ''}</span>
          </button>`;
        }).join('')}
      </div>
    </section>`;

  const grid = root.querySelector('.tool-grid');
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
