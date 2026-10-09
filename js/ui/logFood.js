// The food-logging sheet: frequents → search → quantity → save. Built for 2–3 taps.
import * as store from '../data/store.js';
import { MEALS, frequentFoods, lastAmountFor } from '../domain/stats.js';
import { CATEGORIES, GRAM } from '../data/seedFoods.js';
import { norm, esc } from '../lib/fa.js';
import { mealForNow, today } from '../lib/dates.js';
import { sheet, toast, confirmBox, icon } from './dom.js';
import { openFoodBank, openFoodForm } from './foodBank.js';
import { foodMeta, amountLabel, unitFields, bindUnitFields, mountAmount } from './units.js';
import { ask, aiAvailable, sparkle } from '../ai/hooshvareh.js';

const mealSeg = meal => `<div class="seg meal-seg" data-meal>
  ${Object.entries(MEALS).map(([k, l]) => `<button type="button" data-v="${k}" class="${k === meal ? 'on' : ''}">${l}</button>`).join('')}
</div>`;

function bindMeal(root, set) {
  root.querySelector('[data-meal]').addEventListener('click', e => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    set(b.dataset.v);
    root.querySelectorAll('[data-meal] button').forEach(x => x.classList.toggle('on', x === b));
  });
}

const foodRow = (f, extra = '') => `
  <button class="food-row" data-food="${f.id}">
    <span class="fname">${esc(f.name)}</span>
    <span class="fmeta">${foodMeta(f)}${extra}</span>
  </button>`;

const aiEstBtn = () => (aiAvailable() ? `<button type="button" class="btn ai-btn" data-ai-est>${sparkle()} تخمین کالری با هوشواره</button><p class="muted small ai-est-note" hidden></p>` : '');

export function openLogSheet({ day = today(), meal = null } = {}) {
  let curMeal = meal || (day === today() ? mealForNow() : 'lunch');
  let query = '';

  sheet.open(body => {
    function drawList() {
      body.innerHTML = `
        <div class="sheet-head">
          <h2>ثبت غذا</h2>
          <button class="icon-btn" data-close aria-label="بستن">${icon.close}</button>
        </div>
        ${mealSeg(curMeal)}
        <div class="search">${icon.search}<input type="search" placeholder="جست‌وجو در بانک غذا" value="${esc(query)}" autocomplete="off"></div>
        <div class="food-list"></div>
        <div class="row gap sheet-foot">
          <button class="btn grow" data-custom>غذای دلخواه</button>
          <button class="btn grow" data-bank>بانک غذا</button>
        </div>`;
      const list = body.querySelector('.food-list');
      const input = body.querySelector('input[type=search]');

      function drawResults() {
        const s = store.get();
        const foods = s.foods;
        if (query) {
          const q = norm(query);
          const hits = foods.filter(f => norm(f.name).includes(q))
            .sort((a, b) => norm(a.name).indexOf(q) - norm(b.name).indexOf(q));
          list.innerHTML = hits.length
            ? hits.map(f => foodRow(f)).join('')
            : `<div class="empty">پیدا نشد. <button class="link" data-custom>«${esc(query)}» را دستی ثبت کنید</button></div>`;
          return;
        }
        // frequents are per meal, so breakfast regulars don't crowd dinner
        const freq = frequentFoods(s.entries, foods, day, curMeal);
        const groups = {};
        foods.forEach(f => (groups[f.category] ||= []).push(f));
        list.innerHTML = `
          ${freq.length ? `<h3 class="list-h">پرتکرارهای من در ${MEALS[curMeal]}</h3>${freq.map(x => foodRow(x.food, ` · معمولاً ${amountLabel(x.last.qty, x.last.grams ? GRAM : x.food.unit)}`)).join('')}` : ''}
          ${Object.keys(CATEGORIES).filter(c => groups[c]).map(c => `
            <h3 class="list-h">${CATEGORIES[c]}</h3>
            ${groups[c].sort((a, b) => a.name.localeCompare(b.name, 'fa')).map(f => foodRow(f)).join('')}`).join('')}
          ${!foods.length ? '<div class="empty">بانک غذا خالی است. از «بانک غذا» غذا اضافه کنید.</div>' : ''}`;
      }
      drawResults();
      bindMeal(body, v => { curMeal = v; drawResults(); });

      input.addEventListener('input', () => { query = input.value; drawResults(); });
      body.querySelector('[data-close]').onclick = () => sheet.close();
      body.querySelector('[data-bank]').onclick = () => openFoodBank(() => drawResults());
      list.addEventListener('click', e => {
        const f = e.target.closest('[data-food]');
        if (f) return drawQty(store.get().foods.find(x => x.id === f.dataset.food));
        if (e.target.closest('[data-custom]')) drawCustom();
      });
      body.querySelector('.sheet-foot [data-custom]').onclick = drawCustom;
    }

    function drawQty(food) {
      body.innerHTML = `
        <div class="sheet-head">
          <button class="icon-btn" data-back aria-label="برگشت">${icon.chevR}</button>
          <h2>${esc(food.name)}</h2>
          <button class="icon-btn" data-edit aria-label="ویرایش غذا">${icon.edit}</button>
        </div>
        ${mealSeg(curMeal)}
        <div class="qty-box"><div class="stack" data-amount></div>
          <button class="link small" data-edit>کالری، واحد یا وزنش دقیق نیست؟ ویرایش</button>
        </div>
        <button class="btn primary block big" data-save>ثبت</button>`;
      bindMeal(body, v => { curMeal = v; });
      // Every bank food — seeded ones included — can be corrected right here; the fix sticks for next time.
      const edit = () => openFoodForm(food, () => {
        const fresh = store.get().foods.find(x => x.id === food.id);
        if (!fresh) return drawList();
        food = fresh;
        body.querySelector('.sheet-head h2').textContent = food.name;
        amount.refresh();
      });
      const amount = mountAmount(body.querySelector('[data-amount]'), () => food,
        lastAmountFor(store.get().entries, food, curMeal), { onEditFood: edit });
      body.querySelector('[data-back]').onclick = drawList;
      body.querySelectorAll('[data-edit]').forEach(b => b.onclick = edit);
      body.querySelector('[data-save]').onclick = () => {
        const a = amount.get();
        store.saveEntry({ day, meal: curMeal, food_id: food.id, name: food.name, ...a, is_veg: food.is_veg });
        sheet.close();
        toast(`${food.name} ثبت شد`);
      };
    }

    // A food that isn't in the bank: describe one unit, say how much was eaten, optionally keep it.
    function drawCustom() {
      body.innerHTML = `
        <div class="sheet-head">
          <button class="icon-btn" data-back aria-label="برگشت">${icon.chevR}</button>
          <h2>غذای دلخواه</h2><span></span>
        </div>
        ${mealSeg(curMeal)}
        <form class="stack" novalidate>
          <label class="field"><span>اسم غذا</span><input name="name" value="${esc(query)}" placeholder="مثلاً ساندویچ مرغ"></label>
          ${aiEstBtn()}
          ${unitFields({ unit: 'پرس', grams: 300, kcal: '', protein: '' })}
          <div class="qty-box"><div class="stack" data-amount></div></div>
          <label class="check"><input type="checkbox" name="veg"><span>جزو وعده‌ی سبزی حساب شود</span></label>
          <label class="check"><input type="checkbox" name="save"><span>به بانک غذا هم اضافه شود</span></label>
          <p class="err" hidden></p>
          <button class="btn primary block big">ثبت</button>
        </form>`;
      bindMeal(body, v => { curMeal = v; });
      const form = body.querySelector('form');
      const F = form.elements;
      let amount = null;
      const units = bindUnitFields(form, F, () => amount?.refresh());
      const base = () => {
        const r = units.read();
        return r.error ? { unit: F.unit.value === GRAM ? GRAM : 'پرس', grams: null, kcal: 0, protein: 0 } : r;
      };
      amount = mountAmount(body.querySelector('[data-amount]'), base, { qty: 1, grams: false });
      bindEstimate(body, F, units);
      body.querySelector('[data-back]').onclick = drawList;
      form.onsubmit = e => {
        e.preventDefault();
        const name = F.name.value.trim();
        const err = form.querySelector('.err');
        const r = units.read();
        if (!name) { err.textContent = 'اسم غذا را بنویسید.'; err.hidden = false; return; }
        if (r.error) { err.textContent = r.error; err.hidden = false; return; }
        let food_id = null;
        if (F.save.checked) {
          food_id = store.upsertFood({ name, ...r, is_veg: F.veg.checked, category: F.veg.checked ? 'veg' : 'other' }).id;
        }
        store.saveEntry({ day, meal: curMeal, food_id, name, ...amount.get(), is_veg: F.veg.checked });
        sheet.close();
        toast(`${name} ثبت شد`);
      };
      F.name.focus();
    }

    drawList();
  }, { tall: true });
}

/*
  «تخمین با هوشواره»: fills unit, weight, calories, protein (and category / veg where the
  form has them) from the food's name. Shared with the food bank form. The chosen unit is
  sent along when it was set on purpose (an existing food, or changed by hand).
*/
export function bindEstimate(root, F, units, { keepUnit = false } = {}) {
  const btn = root.querySelector('[data-ai-est]');
  if (!btn) return;
  const label = btn.innerHTML;
  const unit0 = F.unit.value;
  btn.onclick = async () => {
    const name = F.name.value.trim();
    if (!name) { toast('اول اسم غذا را بنویس'); F.name.focus(); return; }
    const picked = units.read().unit;
    btn.disabled = true;
    btn.innerHTML = `${sparkle()} هوشواره دارد حساب می‌کند…`;
    try {
      const r = await ask('estimate', { name, unit: keepUnit || F.unit.value !== unit0 ? picked : '' });
      if (!btn.isConnected) return;
      units.set({ unit: r.unit, grams: r.unit === GRAM ? 1 : r.grams, kcal: r.kcal, protein: r.protein });
      if (F.category && r.category) { F.category.value = r.category; F.category.dispatchEvent(new Event('change')); }
      F.veg.checked = !!r.is_veg;
      const note = root.querySelector('.ai-est-note');
      if (note) { note.textContent = `برای هر ${r.unit}${r.grams && r.unit !== GRAM ? ` (حدود ${Math.round(r.grams)} گرم)` : ''}: ${r.note}`; note.hidden = false; }
    } catch (x) { toast(x.message); }
    btn.disabled = false;
    btn.innerHTML = label;
  };
}

/*
  Edit or delete an existing entry: amount (in units or grams), meal, and the per-unit
  values. When the entry came from the bank, the correction can also be written back to it.
*/
export function openEntrySheet(entry) {
  const food = entry.food_id ? store.get().foods.find(f => f.id === entry.food_id) : null;
  const q0 = Number(entry.qty) || 1;
  // per-unit values: from the food if still linked, else derived from the entry itself
  const per = food
    ? { unit: food.unit, grams: food.grams, kcal: food.kcal, protein: food.protein }
    : { unit: entry.unit || 'پرس', grams: entry.unit === GRAM ? 1 : null, kcal: entry.kcal / q0, protein: entry.protein / q0 };
  let meal = entry.meal;

  sheet.open(body => {
    body.innerHTML = `
      <div class="sheet-head"><h2>${esc(entry.name)}</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      ${mealSeg(meal)}
      <div class="qty-box"><div class="stack" data-amount></div></div>
      <form class="stack" novalidate>
        ${unitFields(per)}
        ${food ? '<label class="check"><input type="checkbox" name="fix" checked><span>اصلاح در بانک غذا هم ذخیره شود</span></label>' : ''}
        <p class="err" hidden></p>
      </form>
      <button class="btn primary block big" data-save>ذخیره</button>
      <button class="btn danger-ghost block" data-del>حذف این مورد</button>`;
    bindMeal(body, v => { meal = v; });
    const form = body.querySelector('form');
    const F = form.elements;
    let amount = null;
    const units = bindUnitFields(form, F, () => amount?.refresh());
    const base = () => { const r = units.read(); return r.error ? per : r; };
    const start = entry.unit === GRAM && per.unit !== GRAM ? { qty: q0, grams: true } : { qty: q0, grams: false };
    amount = mountAmount(body.querySelector('[data-amount]'), base, start);
    const changed = r => food && ['unit', 'grams', 'kcal', 'protein'].some(k =>
      typeof r[k] === 'number' ? Math.abs(r[k] - (Number(food[k]) || 0)) > 1e-6 : r[k] !== food[k]);
    body.querySelector('[data-close]').onclick = () => sheet.close();
    body.querySelector('[data-save]').onclick = () => {
      const r = units.read();
      const err = form.querySelector('.err');
      if (r.error) { err.textContent = r.error; err.hidden = false; return; }
      const fix = food && F.fix.checked && changed(r);
      if (fix) store.upsertFood({ ...food, ...r });
      store.saveEntry({ ...entry, meal, ...amount.get() });
      sheet.close();
      toast(fix ? 'ذخیره شد؛ بانک غذا هم اصلاح شد' : 'ذخیره شد');
    };
    body.querySelector('[data-del]').onclick = async () => {
      if (await confirmBox(`«${esc(entry.name)}» حذف شود؟`, 'حذف')) {
        store.deleteEntry(entry.id);
        sheet.close();
        toast('حذف شد');
      }
    };
  });
}
