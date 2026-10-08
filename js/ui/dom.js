// Small DOM helpers shared by the screens.

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
*/
const stack = [];
export const sheet = {
  open(build, { tall = false } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = `<div class="sheet-backdrop"></div><div class="sheet${tall ? ' tall' : ''}" role="dialog" aria-modal="true"><div class="sheet-grip"></div><div class="sheet-body"></div></div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
    wrap.querySelector('.sheet-backdrop').addEventListener('click', () => sheet.close());
    const ctx = { body: wrap.querySelector('.sheet-body'), wrap };
    stack.push(ctx);
    build(ctx.body);
    return ctx;
  },
  close() {
    const ctx = stack.pop();
    if (!ctx) return;
    ctx.wrap.classList.remove('open');
    setTimeout(() => ctx.wrap.remove(), 220);
  },
  closeAll() { while (stack.length) sheet.close(); },
  get isOpen() { return stack.length > 0; },
};

export function confirmBox(message, okLabel = 'بله', cancelLabel = 'انصراف') {
  return new Promise(resolve => {
    sheet.open(body => {
      body.innerHTML = `<p class="confirm-msg">${message}</p>
        <div class="row gap"><button class="btn primary grow" data-ok>${okLabel}</button><button class="btn grow" data-no>${cancelLabel}</button></div>`;
      body.querySelector('[data-ok]').onclick = () => { sheet.close(); resolve(true); };
      body.querySelector('[data-no]').onclick = () => { sheet.close(); resolve(false); };
    });
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
  week: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
  user: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19l7-7"/></svg>',
  edit: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
};
