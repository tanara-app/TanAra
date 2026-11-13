/*
  «بسته‌ها» (beta, part of «سهم وعده»): foods eaten together, as small chips under each meal on
  the today screen. A tap shows the amounts that fit the meal now (fitMeal) with «ثبت»; the pencil
  opens «چقدر بخورم؟» with them. A pack holds foods only, no amounts. Combos eaten in the meal on
  two days or more show as dashed suggestions. Holding a chip renames or deletes a pack, or saves
  or turns down a suggestion. Stored in ai_notes: `pack:<id>` (kind 'pack') and `pack_hide`.
*/
import * as store from '../data/store.js';
import { fitMeal, usualCombos, mealPacks, packKey, usualAmounts } from '../domain/portion.js';
import { esc, fa } from '../lib/fa.js';
import { sheet, toast, confirmBox, choose, icon } from './dom.js';
import { amountLabel } from './units.js';
import { cheer } from './mascot.js';

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));

export const packs = () => store.get().ai_notes.filter(n => n.kind === 'pack' && n.data?.ids?.length).map(n => n.data);
export const hidden = () => store.note('pack_hide')?.data?.keys || [];

// `from`: the starter combo (data/combos.js) this one was made from, which it then replaces
export function savePack(p) {
  const data = { id: p.id || newId(), name: p.name, meal: p.meal, ids: [...p.ids], ...(p.from ? { from: p.from } : {}) };
  store.saveNote({ key: `pack:${data.id}`, kind: 'pack', text: data.name, data });
  return data;
}
export const deletePack = id => store.deleteNote(`pack:${id}`);
// a turned-down combo: its foods' key, or `lib:<id>` for a starter one
export const hideKey = key => store.saveNote({ key: 'pack_hide', kind: 'pack_hide', data: { keys: [...new Set([...hidden(), key])] } });
const hide = ids => hideKey(packKey(ids));

// the pack's foods that are still in the bank
const foodsOf = ids => {
  const byId = new Map(store.get().foods.map(f => [f.id, f]));
  return ids.map(id => byId.get(id)).filter(Boolean);
};

// A name for a pack. Resolves to the name, or null when closed.
export function askPackName(name = '') {
  return new Promise(resolve => {
    let done = false;
    sheet.open(body => {
      body.innerHTML = `
        <div class="sheet-head"><span></span><h2>اسم بسته</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
        <form class="stack" novalidate>
          <input class="pack-name" name="name" maxlength="40" value="${esc(name)}" aria-label="اسم بسته">
          <button class="btn primary block big">ذخیره</button>
        </form>`;
      const input = body.querySelector('input');
      body.querySelector('[data-close]').onclick = () => sheet.close();
      body.querySelector('form').onsubmit = e => {
        e.preventDefault();
        const v = input.value.trim();
        if (!v) return input.focus();
        done = true; resolve(v); sheet.close();
      };
      input.focus();
      input.select();
    }, { onClose: () => { if (!done) resolve(null); } });
  });
}

let open = null; // `${day}|${meal}|${chip key}`: the chip whose amounts are shown

function chipsFor(day, meal) {
  const s = store.get();
  const combos = usualCombos(s.entries, s.foods, day, meal, { limit: 12 });
  const { own, sug } = mealPacks(packs(), combos, hidden(), meal);
  return [
    ...own.map(p => ({ key: `p:${p.id}`, name: p.name, ids: p.ids, pack: p })),
    ...sug.map(c => ({ key: `s:${packKey(c.ids)}`, name: c.names.join(' + '), ids: c.ids, sug: true })),
  ].filter(c => foodsOf(c.ids).length);
}

// The chips under one meal (nothing when it has none), and the amounts of the open one.
export function packRow(day, meal, budgetFor) {
  const chips = chipsFor(day, meal);
  if (!chips.length) return '';
  const cur = chips.find(c => open === `${day}|${meal}|${c.key}`);
  let quick = '';
  if (cur) {
    const foods = foodsOf(cur.ids);
    const r = fitMeal(foods, budgetFor(meal).kcal, {}, { usual: usualAmounts(store.get().entries, store.get().foods, day) });
    quick = `<div class="pack-quick">
      <p>${foods.map((f, i) => `<b>${amountLabel(r.items[i].qty, f.unit)}</b> ${esc(f.name)}`).join(' · ')}</p>
      <div class="pq-row"><span class="muted small grow">${fa(Math.round(r.total))} کالری</span>
        <button type="button" class="icon-btn sm" data-pack-edit aria-label="تغییر">${icon.edit}</button>
        <button type="button" class="btn primary sm" data-pack-log>ثبت</button></div>
    </div>`;
  }
  return `<div class="packs" data-packs="${meal}">${chips.map(c => `<button type="button" class="pack-chip${c.sug ? ' sug' : ''}${c === cur ? ' on' : ''}" data-pack="${esc(c.key)}">${esc(c.name)}</button>`).join('')}</div>${quick}`;
}

/*
  `edit(meal, foods, packId)`: opens «چقدر بخورم؟» with the foods (the today screen passes
  openLogSheet, so this file needs no import of logFood.js).
*/
export function bindPacks(root, { day, budgetFor, redraw, edit }) {
  const find = (meal, key) => chipsFor(day, meal).find(c => c.key === key);
  let held = false;

  async function menu(meal, c) {
    if (c.sug) {
      const v = await choose(c.name, [{ value: 'save', label: 'ذخیره به‌عنوان بسته' }, { value: 'hide', label: 'پیشنهاد نکن' }], null);
      if (v === 'hide') { hide(c.ids); redraw(); }
      if (v === 'save') {
        const name = await askPackName(c.name);
        if (name) { savePack({ name, meal, ids: c.ids }); open = null; toast('بسته ذخیره شد'); redraw(); }
      }
      return;
    }
    const v = await choose(c.name, [{ value: 'rename', label: 'تغییر اسم' }, { value: 'del', label: 'حذف بسته' }], null);
    if (v === 'rename') {
      const name = await askPackName(c.name);
      if (name) { savePack({ ...c.pack, name }); redraw(); }
    }
    if (v === 'del' && await confirmBox(`بسته‌ی «${esc(c.name)}» حذف شود؟`, 'حذف')) { deletePack(c.pack.id); open = null; redraw(); }
  }

  root.querySelectorAll('[data-packs]').forEach(row => {
    const meal = row.dataset.packs;
    let timer = null;
    row.addEventListener('pointerdown', e => {
      const b = e.target.closest('[data-pack]');
      if (!b) return;
      held = false;
      timer = setTimeout(() => { held = true; const c = find(meal, b.dataset.pack); if (c) menu(meal, c); }, 500);
    });
    const stop = () => clearTimeout(timer);
    row.addEventListener('pointerup', stop);
    row.addEventListener('pointercancel', stop);
    row.addEventListener('pointerleave', stop);
    // a faded edge where more chips are hidden (RTL: scrollLeft goes from 0 to negative)
    const edges = () => {
      const max = row.scrollWidth - row.clientWidth, pos = Math.abs(row.scrollLeft);
      row.classList.toggle('more-end', max > 2 && pos < max - 2);
      row.classList.toggle('more-start', pos > 2);
    };
    edges();
    row.addEventListener('scroll', () => { stop(); edges(); }, { passive: true });
    row.addEventListener('contextmenu', e => e.preventDefault());
    row.addEventListener('click', e => {
      const b = e.target.closest('[data-pack]');
      if (!b || held) { held = false; return; }
      const k = `${day}|${meal}|${b.dataset.pack}`;
      open = open === k ? null : k;
      redraw();
    });
    const quick = row.nextElementSibling?.classList.contains('pack-quick') ? row.nextElementSibling : null;
    if (!quick) return;
    const c = find(meal, open?.split('|')[2]);
    if (!c) return;
    quick.querySelector('[data-pack-edit]').onclick = () => { open = null; edit(meal, foodsOf(c.ids), c.pack?.id || null); };
    quick.querySelector('[data-pack-log]').onclick = () => {
      const foods = foodsOf(c.ids);
      const r = fitMeal(foods, budgetFor(meal).kcal, {}, { usual: usualAmounts(store.get().entries, store.get().foods, day) });
      foods.forEach((f, i) => {
        const it = r.items[i];
        store.saveEntry({ day, meal, food_id: f.id, name: f.name, unit: f.unit, qty: it.qty, kcal: it.kcal, protein: it.protein, is_veg: !!f.is_veg });
      });
      cheer('entry');
      open = null;
      toast(`${c.name} ثبت شد`);
      redraw();
    };
  });
}
