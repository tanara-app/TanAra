// Food bank management: search, add, edit, delete.
import * as store from '../data/store.js';
import { CATEGORIES, UNITS } from '../data/seedFoods.js';
import { fa, parseNum, norm, esc } from '../lib/fa.js';
import { sheet, toast, confirmBox, icon } from './dom.js';
import { bindEstimate } from './logFood.js';
import { aiAvailable, sparkle } from '../ai/hooshvareh.js';

export function openFoodBank(onChange) {
  let query = '';
  sheet.open(body => {
    function draw() {
      body.innerHTML = `
        <div class="sheet-head"><h2>بانک غذا</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
        <div class="search">${icon.search}<input type="search" placeholder="جست‌وجو" value="${esc(query)}"></div>
        <button class="btn block" data-new>${icon.plus} غذای جدید</button>
        <div class="food-list bank"></div>`;
      const input = body.querySelector('input');
      const list = body.querySelector('.food-list');
      const paint = () => {
        const q = norm(query);
        const foods = store.get().foods.filter(f => !q || norm(f.name).includes(q))
          .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
        list.innerHTML = foods.map(f => `
          <button class="food-row" data-id="${f.id}">
            <span class="fname">${esc(f.name)}</span>
            <span class="fmeta">${esc(f.unit)} · ${fa(f.kcal)} کالری · ${fa(f.protein, 1)} گرم پروتئین · ${CATEGORIES[f.category] || 'سایر'}</span>
          </button>`).join('') || '<div class="empty">چیزی پیدا نشد.</div>';
      };
      paint();
      input.addEventListener('input', () => { query = input.value; paint(); });
      body.querySelector('[data-close]').onclick = () => { sheet.close(); onChange?.(); };
      body.querySelector('[data-new]').onclick = () => openFoodForm(null, () => { paint(); onChange?.(); });
      list.addEventListener('click', e => {
        const b = e.target.closest('[data-id]');
        if (b) openFoodForm(store.get().foods.find(f => f.id === b.dataset.id), () => { paint(); onChange?.(); });
      });
    }
    draw();
  }, { tall: true });
}

export function openFoodForm(food, onSaved) {
  const f = food || { name: '', unit: 'کفگیر', kcal: '', protein: '', category: 'other', is_veg: false };
  sheet.open(body => {
    body.innerHTML = `
      <div class="sheet-head"><h2>${food ? 'ویرایش غذا' : 'غذای جدید'}</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <form class="stack" novalidate>
        <label class="field"><span>اسم</span><input name="name" value="${esc(f.name)}"></label>
        ${aiAvailable() ? `<button type="button" class="btn ai-btn" data-ai-est>${sparkle()} تخمین کالری با هوشواره</button><p class="muted small ai-est-note" hidden></p>` : ''}
        <label class="field"><span>واحد خانگی</span><input name="unit" list="units-bank" value="${esc(f.unit)}"></label>
        <div class="row gap">
          <label class="field grow"><span>کالری هر واحد</span><input name="kcal" inputmode="numeric" value="${f.kcal === '' ? '' : fa(f.kcal)}"></label>
          <label class="field grow"><span>پروتئین (گرم)</span><input name="protein" inputmode="decimal" value="${f.protein === '' ? '' : fa(f.protein, 1)}"></label>
        </div>
        <label class="field"><span>دسته</span><select name="category">${Object.entries(CATEGORIES).map(([k, l]) => `<option value="${k}" ${k === f.category ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" name="veg" ${f.is_veg ? 'checked' : ''}><span>جزو وعده‌ی سبزی حساب شود</span></label>
        <p class="err" hidden></p>
        <button class="btn primary block big">ذخیره</button>
        ${food ? '<button type="button" class="btn danger-ghost block" data-del>حذف از بانک غذا</button>' : ''}
      </form>
      <datalist id="units-bank">${UNITS.map(u => `<option value="${u}">`).join('')}</datalist>`;
    const form = body.querySelector('form');
    const F = form.elements;
    body.querySelector('[data-close]').onclick = () => sheet.close();
    bindEstimate(body, F);
    form.onsubmit = e => {
      e.preventDefault();
      const name = F.name.value.trim();
      const kcal = parseNum(F.kcal.value);
      const protein = parseNum(F.protein.value) || 0;
      const err = form.querySelector('.err');
      if (!name) { err.textContent = 'اسم را بنویسید.'; err.hidden = false; return; }
      if (!(kcal >= 0)) { err.textContent = 'کالری را وارد کنید.'; err.hidden = false; return; }
      store.upsertFood({ ...(food || {}), name, unit: F.unit.value.trim() || 'پرس', kcal, protein, category: F.category.value, is_veg: F.veg.checked });
      sheet.close();
      toast('ذخیره شد');
      onSaved?.();
    };
    body.querySelector('[data-del]')?.addEventListener('click', async () => {
      if (await confirmBox(`«${esc(food.name)}» از بانک غذا حذف شود؟ ثبت‌های قبلی دست نمی‌خورند.`, 'حذف')) {
        store.deleteFood(food.id);
        sheet.close();
        toast('حذف شد');
        onSaved?.();
      }
    });
  });
}
