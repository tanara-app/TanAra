/*
  «رسپی‌ها», inside the food bank: their own home dishes as ingredients by weight. The app adds
  the pot up (js/domain/recipe.js) and a saved recipe can be a bank food, so the calories of
  one کفگیر are those of *their* pot.

  Hooshvareh's part (mode `recipe`): suggest a new, simple dish sized to what is left of
  today (the main use), write their own recipe down from text or a photo, or make one lighter. It only
  names ingredients and grams; the numbers on screen are computed here.

  A recipe is an ai_note with key `recipe:<id>`; data.food_id links it to its bank food.
*/
import * as store from '../data/store.js';
import { CATEGORIES, UNITS, GRAM } from '../data/seedFoods.js';
import { recipeFrom, recipeItems, recipeTotals, itemTotals, perUnit, recipeFood } from '../domain/recipe.js';
import { MEALS, entriesOn, totals } from '../domain/stats.js';
import { effectiveTargets } from '../domain/targets.js';
import { SLOTS } from '../domain/plan.js';
import { fa, esc, parseNum, round50 } from '../lib/fa.js';
import { today, mealForNow } from '../lib/dates.js';
import { sheet, toast, confirmBox, choose, icon } from './dom.js';
import { foodMeta, mountAmount } from './units.js';
import { mealSeg, bindMeal } from './logFood.js';
import { pickPhoto, foodPhoto, cameraIcon } from './photo.js';
import { ask, aiAvailable, sparkle } from '../ai/hooshvareh.js';
import { pickForShopping } from './shopping.js';

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
const bankFood = r => (r?.food_id && store.get().foods.find(f => f.id === r.food_id)) || null;

export const recipes = () => store.get().ai_notes.filter(n => n.kind === 'recipe' && n.data?.items?.length)
  .map(n => n.data).sort((a, b) => a.name.localeCompare(b.name, 'fa'));

// Saves a recipe; with toBank its bank food is created or brought up to date. Returns it as saved.
export function saveRecipe(r, { toBank = !!bankFood(r) } = {}) {
  const linked = bankFood(r);
  const food = toBank ? store.upsertFood({ ...(linked || {}), ...recipeFood(r) }) : linked;
  const data = {
    id: r.id || newId(), name: r.name, items: r.items, steps: r.steps || [], unit: r.unit, servings: r.servings,
    cookedGrams: r.cookedGrams || null, category: r.category, is_veg: !!r.is_veg, note: r.note || '', minutes: r.minutes || null, food_id: food ? food.id : null,
  };
  store.saveNote({ key: `recipe:${data.id}`, kind: 'recipe', text: data.name, data });
  return data;
}

const wait = (body, title, text) => {
  body.innerHTML = `
    <div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
    <p class="muted small ai-wait"><span class="typing"><i></i><i></i><i></i></span> ${text}</p>`;
  body.querySelector('[data-close]').onclick = () => sheet.close();
};

// What goes to Hooshvareh when it works on an existing recipe.
const brief = r => ({
  name: r.name, unit: r.unit, servings: r.servings, cooked_grams: r.cookedGrams,
  items: r.items.map(({ name, grams, kcal100, protein100 }) => ({ name, grams, kcal100, protein100 })), steps: r.steps,
});

/* ---------------- the list, a tab of the food bank ---------------- */

export function recipesPanel(box, onChange) {
  const draw = () => {
    const list = recipes();
    box.innerHTML = `
      ${aiAvailable() ? `
        <button class="btn primary block big" data-idea>${sparkle()} یک غذای تازه و ساده پیشنهاد بده</button>
        <button class="btn block ai-btn" data-mine>${sparkle()} رسپی خودم را حساب کن</button>` : ''}
      <button class="btn block" data-new>${icon.plus} رسپی دستی</button>
      <div class="food-list bank">${list.map(r => `
        <button class="food-row" data-id="${r.id}">
          <span class="fname">${esc(r.name)}</span>
          <span class="fmeta">${foodMeta(perUnit(r))}${bankFood(r) ? ' · در بانک غذا' : ''}</span>
        </button>`).join('') || `<div class="empty">هنوز رسپی‌ای نداری.${aiAvailable() ? ' هوشواره غذای تازه و ساده‌ای پیشنهاد می‌دهد که در کالری امروزت جا شود؛ هر کدام را پسندیدی نگه دار.' : ''}</div>`}</div>`;
    const done = () => { draw(); onChange?.(); };
    box.querySelector('[data-mine]')?.addEventListener('click', () => openMine(done));
    box.querySelector('[data-idea]')?.addEventListener('click', () => openIdea(done));
    box.querySelector('[data-new]').onclick = () => openRecipeForm(null, done);
    box.querySelectorAll('[data-id]').forEach(b => b.onclick = () => openRecipe(recipes().find(r => r.id === b.dataset.id), { onChange: done }));
  };
  draw();
}

/* ---------------- one recipe ---------------- */

const numbers = r => {
  const u = perUnit(r), t = recipeTotals(r);
  return `
    <div class="preview recipe-num"><b>${fa(u.kcal)}</b> کالری · <b>${fa(u.protein, 1)}</b> گرم پروتئین
      <small>در هر ${esc(r.unit)}${u.grams ? ` (حدود ${fa(Math.round(u.grams))} گرم)` : ''}</small></div>
    <p class="muted small center">کل قابلمه: ${fa(t.kcal)} کالری · ${fa(r.servings, 1)} ${esc(r.unit)}${r.cookedGrams ? ` · ${fa(r.cookedGrams)} گرم پخته` : ''}${r.minutes ? ` · ${fa(r.minutes)} دقیقه` : ''}</p>`;
};

/*
  Shows a recipe. A saved one can be logged («پختم»), made lighter, edited or deleted. A draft
  (fresh from Hooshvareh, not saved yet) is kept or thrown away: `another` asks for a different
  suggestion, `base` is the recipe a lighter version was made from, `changes` what was changed.
*/
export function openRecipe(recipe, { draft = false, another = null, base = null, changes = [], onChange } = {}) {
  let r = recipe;
  sheet.open(body => {
    const draw = () => {
      const was = base && perUnit(base), now = perUnit(r);
      body.innerHTML = `
        <div class="sheet-head"><h2>${esc(r.name)}</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
        ${numbers(r)}
        ${base ? `<div class="ai-act"><p>قبل: هر ${esc(base.unit)} <b>${fa(was.kcal)}</b> کالری و ${fa(was.protein, 1)} گرم پروتئین ← حالا <b>${fa(now.kcal)}</b> کالری و ${fa(now.protein, 1)} گرم</p>
          ${changes.length ? `<ul class="recipe-changes">${changes.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}</div>` : ''}
        ${r.note ? `<p class="small ai-est-note">${sparkle(14)} ${esc(r.note)}</p>` : ''}
        <h3 class="list-h">مواد (برای کل قابلمه)</h3>
        <ul class="recipe-items">${r.items.map(i => `<li><span>${esc(i.name)}</span><small class="muted">${fa(Math.round(i.grams))} گرم · ${fa(itemTotals(i).kcal)} کالری${i.food_id ? '' : ' · تخمینی'}</small></li>`).join('')}</ul>
        <button class="link small shop-link" data-shop-items>${icon.cart} چیزی را نداری؟ به لیست خرید اضافه کن</button>
        ${r.steps?.length ? `<h3 class="list-h">روش پخت</h3><ol class="recipe-steps">${r.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
        <div class="stack recipe-acts">${draft ? `
          <label class="check"><input type="checkbox" data-bank checked><span>در بانک غذا هم باشد<small class="muted">تا در ثبت غذا و رژیم بیاید</small></span></label>
          <button class="btn primary block big" data-keep>${base ? 'جایگزین رسپی قبلی کن' : 'ذخیره در رسپی‌ها'}</button>
          ${base ? '<button class="btn block" data-keep-new>جدا ذخیره کن</button>' : ''}
          ${another ? `<button class="btn block ai-btn" data-another>${sparkle()} یک پیشنهاد دیگر</button>` : ''}
          <button class="btn block" data-edit>${icon.edit} اول ویرایشش کنم</button>` : `
          <button class="btn primary block big" data-cooked>پختم؛ یک سهم ثبت کن</button>
          ${aiAvailable() ? `<button class="btn block ai-btn" data-light>${sparkle()} سبک‌ترش کن</button>` : ''}
          ${bankFood(r) ? '' : '<button class="btn block" data-to-bank>به بانک غذا اضافه کن</button>'}
          <button class="btn block" data-edit>${icon.edit} ویرایش</button>
          <button class="btn danger-ghost block" data-del>حذف رسپی</button>`}
        </div>
        <p class="muted small">عدد موادی که «تخمینی» دارند از بانک غذا نیامده؛ جمع و تقسیم را خود اپ حساب می‌کند. در «ویرایش» می‌توانی هر عدد را درست کنی.</p>`;
      body.querySelector('[data-close]').onclick = () => sheet.close();
      const on = (sel, fn) => body.querySelector(sel)?.addEventListener('click', fn);
      const keep = id => {
        saveRecipe({ ...r, id, food_id: id ? base.food_id : null }, { toBank: body.querySelector('[data-bank]').checked });
        sheet.close(); toast('رسپی ذخیره شد'); onChange?.();
      };
      on('[data-keep]', () => keep(base?.id));
      on('[data-keep-new]', () => keep(null));
      on('[data-another]', () => { sheet.close(); another(); });
      on('[data-edit]', () => {
        if (draft) { sheet.close(); return openRecipeForm({ ...r, id: null, food_id: null }, onChange); }
        openRecipeForm(r, () => { r = recipes().find(x => x.id === r.id) || r; draw(); onChange?.(); });
      });
      on('[data-cooked]', () => openCooked(r, () => { r = recipes().find(x => x.id === r.id) || r; draw(); onChange?.(); }));
      on('[data-light]', () => lighten(r, onChange));
      on('[data-shop-items]', () => pickForShopping(`مواد ${r.name}`, r.items.map(i => ({ name: i.name, amount: `${fa(Math.round(i.grams))} گرم`, food_id: i.food_id })), { checked: false, hint: 'هر چه را در خانه نداری تیک بزن. وزن‌ها برای کل قابلمه است.' }));
      on('[data-to-bank]', () => { r = saveRecipe(r, { toBank: true }); toast('به بانک غذا اضافه شد'); draw(); onChange?.(); });
      on('[data-del]', async () => {
        const food = bankFood(r);
        if (!(await confirmBox(`رسپی «${esc(r.name)}» حذف شود؟${food ? ' غذایش در بانک غذا می‌ماند.' : ''}`, 'حذف'))) return;
        store.deleteNote(`recipe:${r.id}`);
        sheet.close(); toast('حذف شد'); onChange?.();
      });
    };
    draw();
  }, { tall: true });
}

// «سبک‌ترش کن»: a lighter or higher-protein version, shown next to the one it came from.
async function lighten(r, onChange) {
  const goal = await choose('چطور بهترش کنم؟', [{ value: 'kcal', label: 'کم‌کالری‌تر' }, { value: 'protein', label: 'پرپروتئین‌تر' }], null);
  if (!goal) return;
  sheet.open(async body => {
    wait(body, r.name, 'هوشواره دارد نسخه‌ی بهتری می‌چیند…');
    try {
      const raw = await ask('recipe', { base: brief(r), goal });
      const next = recipeFrom({ ...raw, name: r.name, category: r.category, is_veg: r.is_veg }, store.get().foods);
      if (!body.isConnected) return;
      sheet.close();
      if (!next) return toast(raw.note || 'نسخه‌ی تازه‌ای درنیامد.');
      sheet.close(); // the recipe it was made from: the new one opens in its place
      openRecipe(next, { draft: true, base: r, changes: (raw.changes || []).map(String).filter(Boolean), onChange });
    } catch (e) {
      toast(e.message);
      if (body.isConnected) sheet.close();
    }
  });
}

/* ---------------- «پختم»: log a serving, optionally with the weighed pot ---------------- */

function openCooked(r, onChange) {
  let meal = mealForNow();
  sheet.open(body => {
    body.innerHTML = `
      <div class="sheet-head"><h2>${esc(r.name)}</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      ${mealSeg(meal)}
      <label class="field"><span>وزن کل غذای پخته (گرم) <em>اختیاری</em></span><input name="cooked" inputmode="numeric" placeholder="مثلاً ۱۸۰۰" value="${r.cookedGrams ? fa(r.cookedGrams) : ''}"></label>
      <p class="muted small">اگر قابلمه را بعد از پخت وزن کنی (منهای وزن خود قابلمه)، می‌توانی سهمت را «با گرم» ثبت کنی و عدد دقیق می‌شود.</p>
      <div class="qty-box"><div class="stack" data-amount></div></div>
      <button class="btn primary block big" data-save>ثبت</button>`;
    bindMeal(body, v => { meal = v; });
    const input = body.querySelector('[name=cooked]');
    const cooked = () => { const n = parseNum(input.value); return n > 0 ? Math.round(n) : null; };
    const amount = mountAmount(body.querySelector('[data-amount]'), () => perUnit({ ...r, cookedGrams: cooked() }), { qty: 1, grams: false });
    input.addEventListener('input', () => amount.refresh());
    body.querySelector('[data-close]').onclick = () => sheet.close();
    body.querySelector('[data-save]').onclick = () => {
      const saved = cooked() !== (r.cookedGrams || null) ? saveRecipe({ ...r, cookedGrams: cooked() }) : r;
      store.saveEntry({ day: today(), meal, food_id: bankFood(saved)?.id || null, name: r.name, ...amount.get(), is_veg: r.is_veg });
      sheet.close();
      toast(`${r.name} ثبت شد`);
      onChange?.();
    };
  });
}

/* ---------------- Hooshvareh: my own recipe, from text or a photo ---------------- */

function openMine(onChange) {
  let shot = null;
  sheet.open(body => {
    const draw = (text = '') => {
      body.innerHTML = `
        <div class="sheet-head"><h2>رسپی خودم</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
        <form class="stack" novalidate>
          <label class="field"><span>اسم غذا و موادش را بنویس، هر جور راحتی</span><textarea name="text" rows="5" placeholder="مثلاً قورمه‌سبزی برای ۶ نفر: ۴۰۰ گرم گوشت، ۱ کیلو سبزی، ۱ لیوان لوبیا قرمز، ۵ قاشق روغن">${esc(text)}</textarea></label>
          ${shot ? `<img class="photo-prev shot" src="${shot.url}" alt="">` : ''}
          <button type="button" class="btn block" data-photo>${cameraIcon} ${shot ? 'عکس دیگر' : 'عکس رسپی یا اسکرین‌شات'}</button>
          <button class="btn primary block big">${sparkle()} حساب کن</button>
          <p class="muted small">هر چه مقدارها دقیق‌تر باشد (مخصوصاً روغن)، عدد دقیق‌تر است. مقداری را که ننویسی هوشواره مقدار معمول فرض می‌کند و می‌گوید کدام‌ها را فرض کرده.</p>
        </form>`;
      const form = body.querySelector('form');
      body.querySelector('[data-close]').onclick = () => sheet.close();
      body.querySelector('[data-photo]').onclick = async () => {
        const file = await pickPhoto();
        if (!file || !body.isConnected) return;
        try { shot = await foodPhoto(file); draw(form.elements.text.value); } catch { toast('عکس خوانده نشد'); }
      };
      form.onsubmit = async e => {
        e.preventDefault();
        const t = form.elements.text.value.trim();
        if (!t && !shot) return toast('اسم غذا یا موادش را بنویس');
        wait(body, 'رسپی خودم', 'هوشواره دارد مواد را وزن می‌کند…');
        try {
          const raw = await ask('recipe', { text: t, ...(shot ? { image: shot.b64 } : {}) });
          if (!body.isConnected) return;
          const r = recipeFrom(raw, store.get().foods);
          if (!r) { toast(raw.note || 'رسپی‌ای از این درنیامد.'); return draw(t); }
          sheet.close();
          openRecipe(r, { draft: true, onChange });
        } catch (x) {
          toast(x.message);
          if (body.isConnected) draw(t);
        }
      };
    };
    draw();
  }, { tall: true });
}

/* ---------------- Hooshvareh: a new, simple dish to try ---------------- */

const MEAL_SLOT = { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', snack: 'snack2' };
const WANTS = { quick: 'زیر ۱۵ دقیقه', protein: 'پرپروتئین', nomeat: 'بدون گوشت', nocook: 'بدون پخت‌وپز' };

// Calories one serving should have: that meal's share of the day, less when little is left
// of today (but never a starvation plate).
function mealBudget(meal) {
  const p = store.profile();
  if (!p) return 450;
  const t = effectiveTargets(p);
  const share = round50(t.kcal * SLOTS[MEAL_SLOT[meal]].share);
  const left = t.kcal - totals(entriesOn(store.get().entries, today())).kcal;
  return Math.max(round50(share * 0.6), Math.min(share, round50(left)));
}

function openIdea(onChange) {
  let meal = mealForNow();
  const want = new Set();
  const seen = []; // dishes already suggested this round
  sheet.open(body => {
    const draw = (have = '', people = 1) => {
      body.innerHTML = `
        <div class="sheet-head"><h2>غذای تازه</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
        ${mealSeg(meal)}
        <p class="muted small center" data-budget></p>
        <form class="stack" novalidate>
          <div class="chat-sugg" data-want>${Object.entries(WANTS).map(([k, l]) => `<button type="button" class="chip-btn${want.has(k) ? ' on' : ''}" data-v="${k}">${l}</button>`).join('')}</div>
          <label class="field"><span>چیزی در خانه داری یا هوس چیزی کرده‌ای؟ <em>اختیاری</em></span><textarea name="have" rows="2" placeholder="مثلاً سینه‌ی مرغ و قارچ دارم؛ یا: یک چیز تند">${esc(have)}</textarea></label>
          <label class="field"><span>برای چند نفر؟</span><input name="people" inputmode="numeric" value="${fa(people)}"></label>
          <button class="btn primary block big">${sparkle()} پیشنهاد بده</button>
          <p class="muted small">غذایی که تا حالا نپخته‌ای، با چند ماده‌ی معمولی و چند مرحله‌ی کوتاه. اگر نپسندیدی «یک پیشنهاد دیگر» بزن.</p>
        </form>`;
      const form = body.querySelector('form');
      const budget = () => { body.querySelector('[data-budget]').textContent = `برای ${MEALS[meal]}ِ امروز حدود ${fa(mealBudget(meal))} کالری جا داری؛ پیشنهاد در همین اندازه است.`; };
      budget();
      bindMeal(body, v => { meal = v; budget(); });
      body.querySelector('[data-close]').onclick = () => sheet.close();
      body.querySelector('[data-want]').onclick = e => {
        const b = e.target.closest('[data-v]');
        if (!b) return;
        want.has(b.dataset.v) ? want.delete(b.dataset.v) : want.add(b.dataset.v);
        b.classList.toggle('on', want.has(b.dataset.v));
      };
      form.onsubmit = e => {
        e.preventDefault();
        const n = parseNum(form.elements.people.value);
        suggest(form.elements.have.value.trim(), n >= 1 && n <= 20 ? Math.round(n) : 1);
      };
    };
    async function suggest(have, people) {
      wait(body, 'غذای تازه', 'هوشواره دارد یک غذای ساده برایت پیدا می‌کند…');
      try {
        const raw = await ask('recipe', { have, people, meal, kcal: mealBudget(meal), want: [...want], avoid: seen });
        if (!body.isConnected) return;
        const r = recipeFrom(raw, store.get().foods);
        if (!r) { toast(raw.note || 'پیشنهادی درنیامد.'); return draw(have, people); }
        seen.push(r.name);
        sheet.close();
        openRecipe(r, { draft: true, onChange, another: () => sheet.open(b => { body = b; suggest(have, people); }, { tall: true }) });
      } catch (x) {
        toast(x.message);
        if (body.isConnected) draw(have, people);
      }
    }
    draw();
  }, { tall: true });
}

/* ---------------- the form: write or correct a recipe by hand ---------------- */

const num = (v, digits = 0) => (v === '' || v == null || !Number.isFinite(Number(v)) ? '' : fa(Number(v), digits));

export function openRecipeForm(recipe, onSaved) {
  const r = recipe || { name: '', items: [], steps: [], unit: 'کفگیر', servings: '', cookedGrams: null, category: 'stew', is_veg: false, note: '' };
  // the rows as typed; read back through recipeItems on save
  const rows = r.items.length ? r.items.map(i => ({ ...i })) : [{ name: '', grams: '', kcal100: '', protein100: '', food_id: null }];
  const unitsList = UNITS.filter(u => u !== GRAM);
  if (!unitsList.includes(r.unit)) unitsList.push(r.unit);

  sheet.open(body => {
    body.innerHTML = `
      <div class="sheet-head"><h2>${recipe?.id ? 'ویرایش رسپی' : 'رسپی تازه'}</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <form class="stack" novalidate>
        <label class="field"><span>اسم غذا</span><input name="name" value="${esc(r.name)}"></label>
        <h3 class="list-h">مواد، برای کل قابلمه (وزن خام، روغن یادت نرود)</h3>
        <div class="stack" data-rows></div>
        <button type="button" class="btn block" data-add>${icon.plus} یک ماده‌ی دیگر</button>
        <div class="row gap">
          <label class="field grow"><span>با چه واحدی می‌کشی؟</span><select name="unit">${unitsList.map(u => `<option ${u === r.unit ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></label>
          <label class="field grow"><span data-sl>کل قابلمه چند تا؟</span><input name="servings" inputmode="decimal" placeholder="مثلاً ۶" value="${num(r.servings, 1)}"></label>
        </div>
        <label class="field"><span>وزن کل غذای پخته (گرم) <em>اختیاری</em></span><input name="cooked" inputmode="numeric" placeholder="اگر وزن کرده‌ای" value="${num(r.cookedGrams)}"></label>
        <div class="preview" data-preview></div>
        <label class="field"><span>روش پخت <em>اختیاری، هر مرحله در یک خط</em></span><textarea name="steps" rows="4">${esc((r.steps || []).join('\n'))}</textarea></label>
        <label class="field"><span>دسته</span><select name="category">${Object.entries(CATEGORIES).map(([k, l]) => `<option value="${k}" ${k === r.category ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" name="veg" ${r.is_veg ? 'checked' : ''}><span>جزو وعده‌ی سبزی حساب شود</span></label>
        <label class="check"><input type="checkbox" name="bank" ${!recipe?.id || bankFood(recipe) ? 'checked' : ''}><span>در بانک غذا هم باشد<small class="muted">تا در ثبت غذا و رژیم بیاید</small></span></label>
        <p class="err" hidden></p>
        <button class="btn primary block big">ذخیره</button>
      </form>`;
    const form = body.querySelector('form');
    const F = form.elements;
    const box = body.querySelector('[data-rows]');
    body.querySelector('[data-close]').onclick = () => sheet.close();

    // a linked ingredient keeps the numbers shown in its row (they may have been corrected)
    const read = () => {
      const items = rows.flatMap(x => recipeItems([{ ...x, grams: parseNum(x.grams), kcal100: parseNum(x.kcal100), protein100: parseNum(x.protein100) || 0 }]).map(i => ({ ...i, food_id: x.food_id || null })));
      const now = recipeFrom({
        name: F.name.value || '-', unit: F.unit.value, servings: parseNum(F.servings.value), cookedGrams: parseNum(F.cooked.value),
        category: F.category.value, is_veg: F.veg.checked, note: r.note, minutes: r.minutes, steps: F.steps.value.split('\n'), items,
      });
      return now && { ...now, items };
    };
    const preview = () => {
      body.querySelector('[data-sl]').textContent = `کل قابلمه چند ${F.unit.value}؟`;
      const now = read();
      const u = now && perUnit(now);
      body.querySelector('[data-preview]').innerHTML = now
        ? `کل قابلمه <b>${fa(recipeTotals(now).kcal)}</b> کالری${parseNum(F.servings.value) > 0 ? ` · هر ${esc(now.unit)} <b>${fa(u.kcal)}</b> کالری و ${fa(u.protein, 1)} گرم پروتئین` : ''}`
        : 'مواد را با وزن بنویس تا حساب شود';
    };

    const drawRows = () => {
      box.innerHTML = rows.map((x, n) => `
        <div class="ritem" data-n="${n}">
          <div class="row gap">
            <label class="field grow"><span>ماده</span><input data-k="name" value="${esc(x.name)}" placeholder="مثلاً روغن مایع"></label>
            ${aiAvailable() ? `<button type="button" class="icon-btn sm ai-btn" data-est aria-label="تخمین عدد این ماده با هوشواره">${sparkle(16)}</button>` : ''}
            <button type="button" class="icon-btn sm" data-rm aria-label="حذف این ماده">${icon.close}</button>
          </div>
          <div class="row gap">
            <label class="field grow"><span>گرم</span><input data-k="grams" inputmode="decimal" value="${num(parseNum(x.grams), 1)}"></label>
            <label class="field grow"><span>کالری در ۱۰۰ گرم</span><input data-k="kcal100" inputmode="decimal" value="${num(parseNum(x.kcal100))}"></label>
            <label class="field grow"><span>پروتئین در ۱۰۰</span><input data-k="protein100" inputmode="decimal" value="${num(parseNum(x.protein100), 1)}"></label>
          </div>
        </div>`).join('');
    };
    drawRows();
    preview();

    box.addEventListener('input', e => {
      const k = e.target.dataset.k;
      if (!k) return;
      const x = rows[Number(e.target.closest('.ritem').dataset.n)];
      x[k] = e.target.value;
      if (k !== 'grams') x.food_id = null; // no longer the bank's food as it stands
      preview();
    });
    box.addEventListener('click', async e => {
      const row = e.target.closest('.ritem');
      if (!row) return;
      const n = Number(row.dataset.n);
      if (e.target.closest('[data-rm]')) {
        rows.splice(n, 1);
        if (!rows.length) rows.push({ name: '', grams: '', kcal100: '', protein100: '', food_id: null });
        drawRows(); preview();
        return;
      }
      const est = e.target.closest('[data-est]');
      if (!est) return;
      const name = String(rows[n].name || '').trim();
      if (!name) return toast('اول اسم ماده را بنویس');
      est.disabled = true;
      try {
        // «تخمین غذا» for a weighed food answers per gram
        const x = await ask('estimate', { name: `${name} (ماده‌ی خام برای آشپزی)`, unit: GRAM });
        if (rows[n] && String(rows[n].name).trim() === name) {
          Object.assign(rows[n], { kcal100: Math.round(x.kcal * 100), protein100: Math.round(x.protein * 1000) / 10, food_id: null });
          if (box.isConnected) { drawRows(); preview(); }
        }
      } catch (x) { toast(x.message); est.disabled = false; }
    });
    body.querySelector('[data-add]').onclick = () => {
      rows.push({ name: '', grams: '', kcal100: '', protein100: '', food_id: null });
      drawRows();
      box.lastElementChild.querySelector('input').focus();
    };
    [F.unit, F.servings, F.cooked].forEach(i => i.addEventListener('input', preview));
    F.unit.addEventListener('change', preview);

    form.onsubmit = e => {
      e.preventDefault();
      const err = form.querySelector('.err');
      const fail = m => { err.textContent = m; err.hidden = false; };
      const now = read();
      const typed = rows.filter(x => String(x.name || '').trim() || String(x.grams || '').trim());
      if (!F.name.value.trim()) return fail('اسم غذا را بنویس.');
      if (!now || now.items.length < typed.length) return fail('هر ماده اسم، وزن (گرم) و کالری در ۱۰۰ گرم می‌خواهد.');
      if (!(parseNum(F.servings.value) > 0)) return fail(`بنویس کل قابلمه چند ${F.unit.value} می‌شود.`);
      saveRecipe({ ...now, id: recipe?.id, food_id: recipe?.food_id }, { toBank: F.bank.checked });
      sheet.close();
      toast('رسپی ذخیره شد');
      onSaved?.();
    };
  }, { tall: true });
}
