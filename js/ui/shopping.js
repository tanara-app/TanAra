/*
  «لیست خرید»: what the family has to buy. One list for everyone (js/data/shop.js): each item
  says who wants it (whoever added it), anyone can tick what they bought, and only the one who
  added a waiting item can take it off. Opened from «نمایه»; items also arrive from a recipe's
  ingredients, from a plan food they don't have (the swap sheet) and from the chat
  (propose_shopping).
*/
import * as store from '../data/store.js';
import * as shop from '../data/shop.js';
import { toBuy, bought, shopAdd, shopMatch, shopText } from '../domain/shopping.js';
import { fa, esc, norm } from '../lib/fa.js';
import { sheet, toast, icon } from './dom.js';
import { sparkle } from '../ai/hooshvareh.js';

export const shopping = () => shop.list();

// Adds [{ name, amount, food_id }] for this member; what is already waiting is skipped.
// Returns how many changed.
export function addToShopping(incoming) {
  const all = shopping();
  // someone else's waiting item keeps its amount: only the one who added it changes it
  const rows = shopAdd(all, incoming, store.get().foods).filter(r => {
    const old = r.id && all.find(i => i.id === r.id);
    return !old || old.done || old.me;
  });
  for (const r of rows) {
    const old = r.id && all.find(i => i.id === r.id);
    if (!old) shop.add(r);
    else if (!old.done) shop.change(old.id, { amount: r.amount });
    else if (old.me) shop.change(old.id, { amount: r.amount, done: false, at: r.at });
    else { shop.remove(old.id); shop.add({ ...r, food_id: null }); } // bought earlier for someone else: now it's for this member
  }
  return rows.length;
}

// Ticks the waiting items these names point at. Returns how many.
export function markBought(names) {
  const hit = shopMatch(shopping(), names);
  hit.forEach(i => shop.change(i.id, { done: true }));
  return hit.length;
}

const close = `<button class="icon-btn" data-close aria-label="بستن">${icon.close}</button>`;

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
          <span class="shop-name">${esc(i.name)}<small>${i.amount ? `${esc(i.amount)} · ` : ''}<span class="shop-who">برای ${esc(i.who || 'من')}</span></small></span>
        </button>
        ${i.me || i.done ? `<button class="icon-btn sm" data-rm aria-label="حذف ${esc(i.name)} از لیست">${icon.close}</button>` : ''}
      </div>`;

    const paint = () => {
      const all = shopping(), need = toBuy(all), got = bought(all);
      list.innerHTML = `
        ${need.map(row).join('') || `<div class="empty">${got.length ? 'همه خریده شده.' : 'این لیست مال همه‌ی خانواده است: هر چیزی را که می‌خواهی یا تمام شده این‌جا بنویس تا هر کس خرید می‌رود ببیند و بداند برای کیست.'}</div>`}
        ${got.length ? `<div class="shop-got-h"><h3 class="list-h">خریده‌شده</h3><button class="link small" data-clear>پاک کردن خریده‌ها</button></div>${got.map(row).join('')}` : ''}`;
      acts.innerHTML = need.length ? '<button class="btn block" data-share>فرستادن لیست</button>' : '';
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
        bought(shopping()).forEach(i => shop.remove(i.id));
        return paint();
      }
      const i = shopping().find(x => x.id === e.target.closest('[data-id]')?.dataset.id);
      if (!i) return;
      if (e.target.closest('[data-rm]')) shop.remove(i.id);
      else if (e.target.closest('[data-tick]')) shop.change(i.id, { done: !i.done });
      paint();
    };
    acts.onclick = async e => {
      if (!e.target.closest('[data-share]')) return;
      const text = `لیست خرید\n${shopText(shopping())}`;
      try {
        if (navigator.share) await navigator.share({ text });
        else { await navigator.clipboard.writeText(text); toast('لیست کپی شد'); }
      } catch { /* the share sheet was dismissed */ }
    };
    paint();
    // what the others added or bought since this device last looked
    const off = shop.onChange(() => { if (body.isConnected) paint(); else off(); });
    shop.refresh();
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
