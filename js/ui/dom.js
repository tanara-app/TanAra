// Small DOM helpers shared by the screens.
import { esc } from '../lib/fa.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function on(root, event, selector, fn) {
  root.addEventListener(event, e => {
    const t = e.target.closest(selector);
    if (t && root.contains(t)) fn(e, t);
  });
}

let toastTimer;
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

/*
  Bottom sheet. open(renderFn) gives renderFn the sheet body; renderFn can call
  sheet.render again to swap content (e.g. food list → quantity step).

  Each open sheet owns a history entry, so the phone's back button closes the top sheet
  instead of leaving the screen. Closing from the UI pops those entries again (batched
  into one history.go). A sheet can also be dragged down by its grip / header, or from
  anywhere once its content is scrolled to the top.
*/
const stack = [];
let owed = 0;      // history entries of sheets closed from the UI, not yet popped
let ignorePops = 0; // popstate events caused by our own history.go
let goTimer = null;

function settleHistory() {
  clearTimeout(goTimer);
  goTimer = setTimeout(() => {
    if (!owed) return;
    ignorePops++;
    history.go(-owed);
    owed = 0;
  }, 0);
}

window.addEventListener('popstate', () => {
  if (ignorePops) { ignorePops--; return; }
  if (stack.length) close(stack[stack.length - 1], false);
});

function close(ctx, fromUi = true) {
  const i = stack.indexOf(ctx);
  if (i < 0) return;
  stack.splice(i, 1);
  if (fromUi && ctx.ownsHistory) { owed++; settleHistory(); }
  ctx.el.style.transform = '';
  ctx.el.style.transition = '';
  ctx.backdrop.style.opacity = '';
  ctx.wrap.classList.remove('open');
  setTimeout(() => ctx.wrap.remove(), 220);
  ctx.onClose?.();
}

function bindDrag(ctx) {
  const { el, backdrop } = ctx;
  let y0 = null, x0 = 0, dy = 0, t0 = 0, dragging = false, fromHandle = false;
  el.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { y0 = null; return; }
    fromHandle = !!e.target.closest('.sheet-grip, .sheet-head');
    if (!fromHandle && (el.scrollTop > 0 || e.target.closest('input, textarea, .mot-track'))) { y0 = null; return; }
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dy = 0; t0 = Date.now(); dragging = false;
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (y0 === null) return;
    const d = e.touches[0].clientY - y0;
    if (!dragging) {
      if (Math.abs(e.touches[0].clientX - x0) > Math.abs(d)) { y0 = null; return; }
      if (d < -6 || (!fromHandle && el.scrollTop > 0)) { y0 = null; return; }
      if (d < 8) return;
      dragging = true;
      el.style.transition = 'none';
      backdrop.style.transition = 'none';
    }
    dy = Math.max(0, d);
    el.style.transform = `translateY(${dy}px)`;
    backdrop.style.opacity = String(Math.max(0, 1 - dy / el.offsetHeight));
    e.preventDefault();
  }, { passive: false });
  const end = () => {
    if (y0 === null) return;
    y0 = null;
    if (!dragging) return;
    el.style.transition = '';
    backdrop.style.transition = '';
    const fast = dy / Math.max(1, Date.now() - t0) > 0.5 && dy > 40;
    if (fast || dy > Math.min(140, el.offsetHeight * 0.3)) close(ctx);
    else { el.style.transform = ''; backdrop.style.opacity = ''; }
  };
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);
}

export const sheet = {
  open(build, { tall = false, onClose = null } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = `<div class="sheet-backdrop"></div><div class="sheet${tall ? ' tall' : ''}" role="dialog" aria-modal="true"><div class="sheet-grip"></div><div class="sheet-body"></div></div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
    const ctx = {
      body: wrap.querySelector('.sheet-body'), wrap, el: wrap.querySelector('.sheet'),
      backdrop: wrap.querySelector('.sheet-backdrop'), onClose, ownsHistory: true,
    };
    ctx.backdrop.addEventListener('click', () => close(ctx));
    // a sheet opened right after others closed reuses one of their entries instead of pushing
    if (owed) owed--; else history.pushState({ sheet: true }, '');
    stack.push(ctx);
    bindDrag(ctx);
    // content is often redrawn (list → quantity → ...), so selects are styled whenever it changes
    new MutationObserver(() => enhanceSelects(ctx.body)).observe(ctx.body, { childList: true, subtree: true });
    build(ctx.body);
    enhanceSelects(ctx.body);
    return ctx;
  },
  close() { if (stack.length) close(stack[stack.length - 1]); },
  // On navigation the history has already moved on, so the entries are just abandoned.
  closeAll({ history: h = true } = {}) {
    while (stack.length) {
      const ctx = stack[stack.length - 1];
      if (!h) ctx.ownsHistory = false;
      close(ctx);
    }
  },
  get isOpen() { return stack.length > 0; },
};

/*
  Styled replacement for <select>: the native element stays in the form (hidden) and keeps
  the value; a button shows the choice and opens a sheet list. Setting .value from code
  should be followed by a 'change' event so the button updates.
*/
export function enhanceSelects(root) {
  root.querySelectorAll('select:not([data-enh])').forEach(sel => {
    sel.dataset.enh = '1';
    sel.hidden = true;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pick';
    if (sel.getAttribute('aria-label')) btn.setAttribute('aria-label', sel.getAttribute('aria-label'));
    const paint = () => { btn.innerHTML = `<span>${esc(sel.selectedOptions[0]?.textContent || '')}</span>${icon.chevD}`; };
    paint();
    sel.after(btn);
    sel.addEventListener('change', paint);
    const title = sel.getAttribute('aria-label') || sel.closest('.field')?.querySelector(':scope > span')?.textContent || '';
    btn.addEventListener('click', e => {
      e.preventDefault();
      choose(title, [...sel.options].map(o => ({ value: o.value, label: o.textContent })), sel.value).then(v => {
        if (v === null || v === sel.value) return;
        sel.value = v;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  });
}

// A list of options in a sheet. Resolves to the chosen value, or null when dismissed.
export function choose(title, options, current) {
  return new Promise(resolve => {
    sheet.open(body => {
      body.innerHTML = `
        <div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
        <div class="opt-list" role="listbox">${options.map((o, i) => `
          <button type="button" class="opt${o.value === current ? ' on' : ''}" role="option" aria-selected="${o.value === current}" data-i="${i}">
            <span>${esc(o.label)}</span>${o.value === current ? icon.check : ''}
          </button>`).join('')}</div>`;
      body.querySelector('[data-close]').onclick = () => sheet.close();
      body.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { resolve(options[Number(b.dataset.i)].value); sheet.close(); });
      requestAnimationFrame(() => body.querySelector('.opt.on')?.scrollIntoView({ block: 'center' }));
    }, { onClose: () => resolve(null) });
  });
}

export function confirmBox(message, okLabel = 'بله', cancelLabel = 'انصراف') {
  return new Promise(resolve => {
    sheet.open(body => {
      body.innerHTML = `<p class="confirm-msg">${message}</p>
        <div class="row gap"><button class="btn primary grow" data-ok>${okLabel}</button><button class="btn grow" data-no>${cancelLabel}</button></div>`;
      body.querySelector('[data-ok]').onclick = () => { resolve(true); sheet.close(); };
      body.querySelector('[data-no]').onclick = () => sheet.close();
    }, { onClose: () => resolve(false) });
  });
}

export const icon = {
  chevR: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  chevL: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  today: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/></svg>',
  chart: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h16"/><path d="M5 15l4-4 4 3 6-7"/></svg>',
  book: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5z"/><path d="M12 6.5v13"/></svg>',
  week: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
  user: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19l7-7"/></svg>',
  chevD: '<svg class="chev-d" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  lock: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  link: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  gear: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7z"/><path d="M12 9.5l5 5M17 9.5l-5 5"/></svg>',
  history: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4v4.5h4.5"/><path d="M12 8v4l3 2"/></svg>',
  compose: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-6"/><path d="M17.5 3.5l3 3L12 15l-4 1 1-4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  edit: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
};
