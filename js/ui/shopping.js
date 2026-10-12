/*
  «لیست خرید»: what has to be bought. Opened from the pill on «امروز» and from «نمایه»; items
  also arrive from a recipe's ingredients, from a plan food they don't have (the swap sheet)
  and from the chat (propose_shopping).

  Hooshvareh's part (mode `shop`): a week's groceries worked out from the diet plan, or from
  what they have been eating when there is no plan. Nothing is added until it is ticked here.

  Items are ai_notes with key `shop:<id>` (see js/domain/shopping.js).
*/
import * as store from '../data/store.js';
import { shopList, toBuy, bought, shopAdd, shopMatch, shopText } from '../domain/shopping.js';
import { planOn } from '../domain/plan.js';
import { fa, esc, norm } from '../lib/fa.js';
import { today } from '../lib/dates.js';
import { sheet, toast, icon } from './dom.js';
import { ask, aiAvailable, sparkle } from '../ai/hooshvareh.js';

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
export const shopping = () => shopList(store.get().ai_notes);
const save = i => {
  const id = i.id || newId();
  store.saveNote({ key: `shop:${id}`, kind: 'shop', text: i.name, data: { ...i, id } });
};

// Adds [{ name, amount, food_id }]; what is already waiting is skipped. Returns how many changed.
export function addToShopping(incoming) {
  const rows = shopAdd(shopping(), incoming, store.get().foods);
  rows.forEach(save);
  return rows.length;
}

// Ticks the waiting items these names point at. Returns how many.
export function markBought(names) {
  const hit = shopMatch(shopping(), names);
  hit.forEach(i => save({ ...i, done: true }));
  return hit.length;
}

const close = `<button class="icon-btn" data-close aria-label="بستن">${icon.close}</button>`;
const countText = n => (n ? `${fa(n)} قلم مانده` : 'چیزی برای خرید نمانده');

/* ---------------- on «امروز» and «نمایه» ---------------- */

export function shoppingPill() {
  const n = toBuy(shopping()).length;
  return `<button class="pill pill-btn" data-shop>${icon.cart}<span>لیست خرید${n ? `: <b>${fa(n)}</b> قلم` : ''}</span></button>`;
}
export const shoppingLine = () => countText(toBuy(shopping()).length);
export function bindShopping(root) {
  root.querySelector('[data-shop]')?.addEventListener('click', () => openShopping());
}

/* ---------------- the list ---------------- */

export function openShopping() {
  sheet.open(body => {
    body.innerHTML = `
      <div class="sheet-head"><h2>لیست خرید</h2>${close}</div>
      <form class="shop-add" novalidate>
        <label class="field grow"><span>چه چیزی باید بخری؟</span><input name="name" enterkeyhint="done" autocomplete="off" placeholder="مثلاً تخم‌مرغ"></label>
        <label class="field shop-amt"><span>مقدار</span><input name="amount" enterkeyhint="done" autocomplete="off" placeholder="۶ عدد"></label>
        <button class="icon-btn shop-plus" aria-label="افزودن به لیست">${icon.plus}</button>
      </form>
      <div class="chat-sugg shop-sugg" data-sugg hidden></div>
      <div class="shop-list" data-list></div>
      <div class="stack shop-acts" data-acts></div>`;
    const form = body.querySelector('form');
    const F = form.elements;
    const list = body.querySelector('[data-list]');
    const acts = body.querySelector('[data-acts]');
    const sugg = body.querySelector('[data-sugg]');
    body.querySelector('[data-close]').onclick = () => sheet.close();

    const row = i => `
      <div class="shop-row${i.done ? ' done' : ''}" data-id="${esc(i.id)}">
        <button class="shop-main" data-tick aria-pressed="${!!i.done}">
          <span class="tick">${i.done ? icon.check : ''}</span>
          <span class="shop-name">${esc(i.name)}${i.amount ? `<small>${esc(i.amount)}</small>` : ''}</span>
        </button>
        <button class="icon-btn sm" data-rm aria-label="حذف ${esc(i.name)} از لیست">${icon.close}</button>
      </div>`;

    const paint = () => {
      const all = shopping(), need = toBuy(all), got = bought(all);
      list.innerHTML = `
        ${need.map(row).join('') || `<div class="empty">${got.length ? 'همه را خریده‌ای.' : 'هر چیزی را که تمام شده یا برای رژیمت کم داری این‌جا بنویس تا موقع خرید جلوی چشمت باشد.'}</div>`}
        ${got.length ? `<div class="shop-got-h"><h3 class="list-h">خریده‌شده</h3><button class="link small" data-clear>پاک کردن خریده‌ها</button></div>${got.map(row).join('')}` : ''}`;
      acts.innerHTML = `
        ${aiAvailable() ? `<button class="btn block ai-btn" data-ai>${sparkle()} هوشواره خرید این هفته را پیشنهاد بدهد</button>` : ''}
        ${need.length ? '<button class="btn block" data-share>فرستادن لیست</button>' : ''}`;
    };

    // while typing: bank foods with that name, one tap to add
    const hints = () => {
      const q = norm(F.name.value);
      const have = new Set(toBuy(shopping()).map(i => norm(i.name)));
      const hits = q.length < 2 ? [] : store.get().foods.filter(f => norm(f.name).includes(q) && norm(f.name) !== q && !have.has(norm(f.name)))
        .sort((a, b) => norm(a.name).indexOf(q) - norm(b.name).indexOf(q) || a.name.length - b.name.length).slice(0, 5);
      sugg.hidden = !hits.length;
      sugg.innerHTML = hits.map(f => `<button type="button" class="chip-btn" data-food="${f.id}">${esc(f.name)}</button>`).join('');
    };
    const add = (name, amount, food_id) => {
      if (!String(name).trim()) return F.name.focus();
      if (!addToShopping([{ name, amount, food_id }])) toast('در لیست هست');
      F.name.value = ''; F.amount.value = '';
      hints(); paint();
      F.name.focus(); // the next item can be typed straight away
    };

    F.name.addEventListener('input', hints);
    form.onsubmit = e => { e.preventDefault(); add(F.name.value, F.amount.value); };
    // the + must not take focus from the field, or the keyboard would close between items
    body.querySelector('.shop-plus').addEventListener('mousedown', e => e.preventDefault());
    sugg.onclick = e => {
      const b = e.target.closest('[data-food]');
      if (b) add(b.textContent, F.amount.value, b.dataset.food);
    };
    list.onclick = e => {
      if (e.target.closest('[data-clear]')) {
        bought(shopping()).forEach(i => store.deleteNote(`shop:${i.id}`));
        return paint();
      }
      const i = shopping().find(x => x.id === e.target.closest('[data-id]')?.dataset.id);
      if (!i) return;
      if (e.target.closest('[data-rm]')) store.deleteNote(`shop:${i.id}`);
      else if (e.target.closest('[data-tick]')) save({ ...i, done: !i.done });
      paint();
    };
    acts.onclick = async e => {
      if (e.target.closest('[data-ai]')) return openSuggest(paint);
      if (!e.target.closest('[data-share]')) return;
      const text = `لیست خرید\n${shopText(shopping())}`;
      try {
        if (navigator.share) await navigator.share({ text });
        else { await navigator.clipboard.writeText(text); toast('لیست کپی شد'); }
      } catch { /* the share sheet was dismissed */ }
    };
    paint();
  }, { tall: true });
}

/*
  A list of things that could go on the list, each with a tick: [{ name, amount, food_id, why }].
  What is already waiting is left out. Used for Hooshvareh's suggestions (ticked to begin
  with) and a recipe's ingredients (unticked: they tick what they don't have).
*/
export function pickForShopping(title, items, { note = '', hint = '', checked = true, onDone } = {}) {
  const have = new Set(toBuy(shopping()).map(i => norm(i.name)));
  const rows = (items || []).filter(i => String(i?.name || '').trim() && !have.has(norm(i.name)));
  if (!rows.length) return toast(items?.length ? 'همه‌ی این‌ها در لیست خرید هست' : 'چیزی برای افزودن نبود');
  sheet.open(body => {
    body.innerHTML = `
      <div class="sheet-head"><h2>${esc(title)}</h2>${close}</div>
      ${note ? `<p class="small shop-note">${sparkle(14)} ${esc(note)}</p>` : ''}
      ${hint ? `<p class="muted small">${esc(hint)}</p>` : ''}
      <form class="stack" novalidate>
        ${rows.map((i, n) => `<label class="check"><input type="checkbox" data-n="${n}" ${checked ? 'checked' : ''}><span>${esc(i.name)}${i.amount ? ` · ${esc(i.amount)}` : ''}${i.why ? `<small class="muted">${esc(i.why)}</small>` : ''}</span></label>`).join('')}
        <button class="btn primary block big">به لیست خرید اضافه کن</button>
      </form>`;
    body.querySelector('[data-close]').onclick = () => sheet.close();
    body.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const picked = [...body.querySelectorAll('input:checked')].map(c => rows[Number(c.dataset.n)]);
      if (!picked.length) return toast('چیزی را تیک نزده‌ای');
      const n = addToShopping(picked);
      sheet.close();
      toast(`${fa(n)} قلم به لیست خرید اضافه شد`);
      onDone?.();
    };
  }, { tall: true });
}

/* ---------------- Hooshvareh: this week's groceries ---------------- */

function openSuggest(onDone) {
  const plan = !!planOn(store.get().ai_notes, today());
  sheet.open(body => {
    const draw = (text = '') => {
      body.innerHTML = `
        <div class="sheet-head"><h2>خرید این هفته</h2>${close}</div>
        <form class="stack" novalidate>
          <p class="muted small">هوشواره ${plan ? 'از روی رژیمت' : 'از روی چیزهایی که این روزها می‌خوری'} حساب می‌کند برای یک هفته چه چیزهایی لازم داری. هر کدام را که خواستی به لیست اضافه می‌کنی.</p>
          <label class="field"><span>چه چیزهایی در خانه داری یا تمام شده؟ <em>اختیاری</em></span><textarea name="have" rows="3" placeholder="مثلاً برنج و مرغ دارم؛ ماست و میوه تمام شده">${esc(text)}</textarea></label>
          <button class="btn primary block big">${sparkle()} پیشنهاد بده</button>
        </form>`;
      body.querySelector('[data-close]').onclick = () => sheet.close();
      body.querySelector('form').onsubmit = async e => {
        e.preventDefault();
        const have = e.target.elements.have.value.trim();
        body.innerHTML = `
          <div class="sheet-head"><h2>خرید این هفته</h2>${close}</div>
          <p class="muted small ai-wait"><span class="typing"><i></i><i></i><i></i></span> هوشواره دارد لیست خرید هفته‌ات را می‌نویسد…</p>`;
        body.querySelector('[data-close]').onclick = () => sheet.close();
        try {
          const r = await ask('shop', { have });
          if (!body.isConnected) return;
          const items = (r.items || []).map(i => ({ name: i.name, amount: i.amount, food_id: i.food_id || null, why: i.why }));
          if (!items.length) { toast(r.note || 'پیشنهادی درنیامد.'); return draw(have); }
          sheet.close();
          pickForShopping('خرید این هفته', items, { note: r.note, onDone });
        } catch (x) {
          toast(x.message);
          if (body.isConnected) draw(have);
        }
      };
    };
    draw();
  });
}
