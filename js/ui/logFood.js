// The food-logging sheet: frequents → search → quantity → save. Built for 2–3 taps.
import * as store from '../data/store.js';
import { MEALS, frequentFoods, lastQtyFor } from '../domain/stats.js';
import { CATEGORIES, UNITS } from '../data/seedFoods.js';
import { fa, parseNum, norm, esc, qtyLabel } from '../lib/fa.js';
import { mealForNow, today } from '../lib/dates.js';
import { sheet, toast, confirmBox, icon } from './dom.js';
import { openFoodBank } from './foodBank.js';

const QTY_PRESETS = [0.5, 1, 1.5, 2, 3];

const mealSeg = meal => `<div class="seg meal-seg" data-meal>
  ${Object.entries(MEALS).map(([k, l]) => `<button type="button" data-v="${k}" class="${k === meal ? 'on' : ''}">${l}</button>`).join('')}
</div>`;

function bindMeal(root, get, set) {
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
    <span class="fmeta">${esc(f.unit)} · ${fa(f.kcal)} کالری${f.protein ? ` · ${fa(f.protein, 1)} گرم پروتئین` : ''}${extra}</span>
  </button>`;

export function openLogSheet({ day = today(), meal = null } = {}) {
  let curMeal = meal || (day === today() ? mealForNow() : 'lunch');
  let query = '';

  sheet.open(body => {
    function drawList() {
      const s = store.get();
      const freq = frequentFoods(s.entries, s.foods, day);
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
      bindMeal(body, () => curMeal, v => { curMeal = v; });
      const list = body.querySelector('.food-list');
      const input = body.querySelector('input[type=search]');

      function drawResults() {
        const foods = store.get().foods;
        if (query) {
          const q = norm(query);
          const hits = foods.filter(f => norm(f.name).includes(q))
            .sort((a, b) => norm(a.name).indexOf(q) - norm(b.name).indexOf(q));
          list.innerHTML = hits.length
            ? hits.map(f => foodRow(f)).join('')
            : `<div class="empty">پیدا نشد. <button class="link" data-custom>«${esc(query)}» را دستی ثبت کنید</button></div>`;
          return;
        }
        const groups = {};
        foods.forEach(f => (groups[f.category] ||= []).push(f));
        list.innerHTML = `
          ${freq.length ? `<h3 class="list-h">پرتکرارهای من</h3>${freq.map(x => foodRow(x.food, ` · معمولاً ${qtyLabel(x.lastQty)}`)).join('')}` : ''}
          ${Object.keys(CATEGORIES).filter(c => groups[c]).map(c => `
            <h3 class="list-h">${CATEGORIES[c]}</h3>
            ${groups[c].sort((a, b) => a.name.localeCompare(b.name, 'fa')).map(f => foodRow(f)).join('')}`).join('')}
          ${!foods.length ? '<div class="empty">بانک غذا خالی است. از «بانک غذا» غذا اضافه کنید.</div>' : ''}`;
      }
      drawResults();

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
      let qty = lastQtyFor(store.get().entries, food.id);
      body.innerHTML = `
        <div class="sheet-head">
          <button class="icon-btn" data-back aria-label="برگشت">${icon.chevR}</button>
          <h2>${esc(food.name)}</h2>
          <span></span>
        </div>
        ${mealSeg(curMeal)}
        <div class="qty-box">
          <div class="qty-row">
            <button class="round" data-step="0.5" aria-label="بیشتر">${icon.plus}</button>
            <div class="qty-val"><input inputmode="decimal" value="${fa(qty, 2)}"><span>${esc(food.unit)}</span></div>
            <button class="round" data-step="-0.5" aria-label="کمتر">${icon.minus}</button>
          </div>
          <div class="chips">${QTY_PRESETS.map(q => `<button class="chip" data-q="${q}">${qtyLabel(q)}</button>`).join('')}</div>
          <div class="preview"></div>
        </div>
        <button class="btn primary block big" data-save>ثبت</button>`;
      bindMeal(body, () => curMeal, v => { curMeal = v; });
      const input = body.querySelector('.qty-val input');
      const preview = body.querySelector('.preview');
      const paint = () => {
        preview.innerHTML = `<b>${fa(Math.round(food.kcal * qty))}</b> کالری · <b>${fa(Math.round(food.protein * qty * 10) / 10, 1)}</b> گرم پروتئین`;
        body.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', Number(c.dataset.q) === qty));
      };
      const setQty = (q, fromInput = false) => {
        qty = Math.max(0.25, Math.round(q * 4) / 4);
        if (!fromInput) input.value = fa(qty, 2);
        paint();
      };
      paint();
      body.querySelector('[data-back]').onclick = drawList;
      body.querySelectorAll('[data-step]').forEach(b => b.onclick = () => setQty(qty + Number(b.dataset.step)));
      body.querySelectorAll('[data-q]').forEach(b => b.onclick = () => setQty(Number(b.dataset.q)));
      input.addEventListener('input', () => { const n = parseNum(input.value); if (n > 0) setQty(n, true); });
      body.querySelector('[data-save]').onclick = () => {
        store.saveEntry({
          day, meal: curMeal, food_id: food.id, name: food.name, unit: food.unit, qty,
          kcal: food.kcal * qty, protein: food.protein * qty, is_veg: food.is_veg,
        });
        sheet.close();
        toast(`${food.name} ثبت شد`);
      };
    }

    function drawCustom() {
      body.innerHTML = `
        <div class="sheet-head">
          <button class="icon-btn" data-back aria-label="برگشت">${icon.chevR}</button>
          <h2>غذای دلخواه</h2><span></span>
        </div>
        ${mealSeg(curMeal)}
        <form class="stack" novalidate>
          <label class="field"><span>اسم غذا</span><input name="name" value="${esc(query)}" placeholder="مثلاً ساندویچ مرغ"></label>
          <div class="row gap">
            <label class="field grow"><span>کالری</span><input name="kcal" inputmode="numeric" placeholder="۰"></label>
            <label class="field grow"><span>پروتئین (گرم)</span><input name="protein" inputmode="decimal" placeholder="۰"></label>
          </div>
          <label class="check"><input type="checkbox" name="veg"><span>جزو وعده‌ی سبزی حساب شود</span></label>
          <label class="check"><input type="checkbox" name="save"><span>به بانک غذا هم اضافه شود</span></label>
          <label class="field" data-unit hidden><span>واحد</span><input name="unit" list="units-dl" value="پرس"></label>
          <p class="err" hidden></p>
          <button class="btn primary block big">ثبت</button>
        </form>
        <datalist id="units-dl">${UNITS.map(u => `<option value="${u}">`).join('')}</datalist>`;
      bindMeal(body, () => curMeal, v => { curMeal = v; });
      const form = body.querySelector('form');
      const F = form.elements;
      F.save.onchange = () => { body.querySelector('[data-unit]').hidden = !F.save.checked; };
      body.querySelector('[data-back]').onclick = drawList;
      form.onsubmit = e => {
        e.preventDefault();
        const name = F.name.value.trim();
        const kcal = parseNum(F.kcal.value);
        const protein = parseNum(F.protein.value) || 0;
        const err = form.querySelector('.err');
        if (!name) { err.textContent = 'اسم غذا را بنویسید.'; err.hidden = false; return; }
        if (!(kcal >= 0)) { err.textContent = 'کالری را وارد کنید.'; err.hidden = false; return; }
        let food_id = null;
        const unit = F.save.checked ? (F.unit.value.trim() || 'پرس') : 'پرس';
        if (F.save.checked) {
          food_id = store.upsertFood({ name, unit, kcal, protein, is_veg: F.veg.checked, category: F.veg.checked ? 'veg' : 'other' }).id;
        }
        store.saveEntry({ day, meal: curMeal, food_id, name, unit, qty: 1, kcal, protein, is_veg: F.veg.checked });
        sheet.close();
        toast(`${name} ثبت شد`);
      };
      F.name.focus();
    }

    drawList();
  }, { tall: true });
}

// Edit or delete an existing entry.
export function openEntrySheet(entry) {
  const food = entry.food_id ? store.get().foods.find(f => f.id === entry.food_id) : null;
  // per-unit values: from the food if still linked, else derived from the entry itself
  const perKcal = food ? food.kcal : entry.kcal / entry.qty;
  const perProt = food ? food.protein : entry.protein / entry.qty;
  let meal = entry.meal;
  let qty = Number(entry.qty);

  sheet.open(body => {
    body.innerHTML = `
      <div class="sheet-head"><h2>${esc(entry.name)}</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      ${mealSeg(meal)}
      <div class="qty-box">
        <div class="qty-row">
          <button class="round" data-step="0.5">${icon.plus}</button>
          <div class="qty-val"><input inputmode="decimal" value="${fa(qty, 2)}"><span>${esc(entry.unit || 'پرس')}</span></div>
          <button class="round" data-step="-0.5">${icon.minus}</button>
        </div>
        ${food ? '' : `<div class="row gap">
          <label class="field grow"><span>کالری هر ${esc(entry.unit || 'پرس')}</span><input name="kcal" inputmode="numeric" value="${fa(Math.round(perKcal))}"></label>
          <label class="field grow"><span>پروتئین</span><input name="protein" inputmode="decimal" value="${fa(Math.round(perProt * 10) / 10, 1)}"></label>
        </div>`}
        <div class="preview"></div>
      </div>
      <button class="btn primary block big" data-save>ذخیره</button>
      <button class="btn danger-ghost block" data-del>حذف این مورد</button>`;
    bindMeal(body, () => meal, v => { meal = v; });
    const input = body.querySelector('.qty-val input');
    const kIn = body.querySelector('[name=kcal]');
    const pIn = body.querySelector('[name=protein]');
    const per = () => ({ k: kIn ? (parseNum(kIn.value) || 0) : perKcal, p: pIn ? (parseNum(pIn.value) || 0) : perProt });
    const paint = () => {
      const { k, p } = per();
      body.querySelector('.preview').innerHTML = `<b>${fa(Math.round(k * qty))}</b> کالری · <b>${fa(Math.round(p * qty * 10) / 10, 1)}</b> گرم پروتئین`;
    };
    paint();
    body.querySelectorAll('[data-step]').forEach(b => b.onclick = () => {
      qty = Math.max(0.25, qty + Number(b.dataset.step)); input.value = fa(qty, 2); paint();
    });
    input.addEventListener('input', () => { const n = parseNum(input.value); if (n > 0) { qty = n; paint(); } });
    kIn?.addEventListener('input', paint);
    pIn?.addEventListener('input', paint);
    body.querySelector('[data-close]').onclick = () => sheet.close();
    body.querySelector('[data-save]').onclick = () => {
      const { k, p } = per();
      store.saveEntry({ ...entry, meal, qty, kcal: k * qty, protein: p * qty });
      sheet.close();
      toast('ذخیره شد');
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
