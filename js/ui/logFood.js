// The food-logging sheet: frequents → search → quantity → save. Built for 2–3 taps.
// Or one photo: Hooshvareh lists what is on the plate and it is logged after a look.
// Or a packaged food's barcode: from the bank if scanned before, else looked up (barcode.js).
import * as store from '../data/store.js';
import { MEALS, frequentFoods, lastAmountFor } from '../domain/stats.js';
import { CATEGORIES, GRAM } from '../data/seedFoods.js';
import { norm, esc, fa, qtyLabel } from '../lib/fa.js';
import { mealForNow, today } from '../lib/dates.js';
import { sheet, toast, confirmBox, icon } from './dom.js';
import { openFoodBank, openFoodForm } from './foodBank.js';
import { foodMeta, amountLabel, unitFields, bindUnitFields, mountAmount, hasGrams, hasUnit2 } from './units.js';
import { ask, aiAvailable, sparkle } from '../ai/hooshvareh.js';
import { cheer } from './mascot.js';
import { photoItems } from '../domain/photo.js';
import { pickPhoto, foodPhoto, cameraIcon } from './photo.js';
import { scanBarcode, barcodeBox, fillFromBarcode, barcodeIcon } from './barcode.js';
import { portionsFor } from '../domain/plan.js';
import { fitMeal, usualCombos } from '../domain/portion.js';

export const mealSeg = meal => `<div class="seg meal-seg" data-meal>
  ${Object.entries(MEALS).map(([k, l]) => `<button type="button" data-v="${k}" class="${k === meal ? 'on' : ''}">${l}</button>`).join('')}
</div>`;

export function bindMeal(root, set) {
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

// `onSaved` is called with every entry the sheet logs (the diet plan notes which occasion it was for).
// `room.smart` («سهم وعده», beta): any meal, its calories from `room.budgetFor(meal)`; the chosen
// foods get amounts by their role on the plate (fitMeal), which + / − can change.
// `room` ({ kcal, label }): from the diet plan's «+» — the meal is fixed, and the foods chosen
// (from the bank or typed in) are given the amounts that fit what is left of the occasion
// together (drawPortions) instead of an amount to pick.
export function openLogSheet({ day = today(), meal = null, onSaved = null, room = null } = {}) {
  let curMeal = meal || (day === today() ? mealForNow() : 'lunch');
  let query = '';
  const save = e => { const row = store.saveEntry(e); onSaved?.(row); cheer('entry'); return row; };
  const smart = !!room?.smart;
  if (smart) room = { ...room, ...room.budgetFor(curMeal) };
  const seg = () => (room && !smart ? `<p class="muted small portion">ثبت در ${room.label}</p>` : mealSeg(curMeal));
  const onMeal = (root, set) => {
    if (room && !smart) return;
    bindMeal(root, v => { if (smart) room = { ...room, ...room.budgetFor(v) }; set(v); });
  };
  const locks = new Map(); // «سهم وعده»: amounts set with + / −, by chosen food
  const shown = new Map(); // «سهم وعده»: the unit each chosen food's amount is shown in: 'u', 'u2' or 'g'
  let chosen = []; // with `room`: the foods to be eaten together (a typed-in one may have no id)
  // in the list, next to each food: how much of it fits, beside what is already chosen
  const fits = f => {
    if (!room) return '';
    if (chosen.some(c => c.id === f.id)) return ' · <b>انتخاب شد</b>';
    if (smart) return '';
    const p = portionsFor([...chosen, f], room.kcal).at(-1);
    return p ? ` · <b>تا ${amountLabel(p.qty, f.unit)}</b>` : ' · جا نمی‌شود';
  };

  sheet.open(body => {
    function drawList() {
      body.innerHTML = `
        <div class="sheet-head">
          <h2>ثبت غذا</h2>
          <button class="icon-btn" data-close aria-label="بستن">${icon.close}</button>
        </div>
        ${seg()}
        ${room && chosen.length ? `<div class="chosen-bar"><span class="small">کنارِ ${chosen.map(c => esc(c.name)).join('، ')}</span><button class="btn primary sm" data-portions>مقدارها</button></div>` : ''}
        <div class="search">${icon.search}<input type="search" placeholder="جست‌وجو در بانک غذا" value="${esc(query)}" autocomplete="off"></div>
        <div class="food-list"></div>
        <div class="sheet-foot">
          ${aiAvailable() ? `<button class="btn block ai-btn" data-photo>${cameraIcon} عکس بگیر؛ هوشواره ثبتش می‌کند</button>` : ''}
          <div class="row gap">
            <button class="btn grow" data-scan>${barcodeIcon} بارکد</button>
            <button class="btn grow" data-custom>غذای دلخواه</button>
            <button class="btn grow" data-bank>بانک غذا</button>
          </div>
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
            ? hits.map(f => foodRow(f, fits(f))).join('')
            : `<div class="empty">پیدا نشد. <button class="link" data-custom>«${esc(query)}» را دستی ثبت کنید</button></div>`;
          return;
        }
        // frequents are per meal, so breakfast regulars don't crowd dinner
        const freq = frequentFoods(s.entries, foods, day, curMeal);
        const combos = smart ? usualCombos(s.entries, foods, day, curMeal) : [];
        const groups = {};
        foods.forEach(f => (groups[f.category] ||= []).push(f));
        list.innerHTML = `
          ${combos.length ? `<h3 class="list-h">ترکیب‌های همیشگی من</h3><div class="combos">${combos.map((c, n) => `<button class="combo" data-combo="${n}">
            <span>${c.names.map(esc).join(' + ')}</span><small class="muted">${fa(c.n)} بار${c.meal !== curMeal ? ` · در ${MEALS[c.meal]}` : ''}</small></button>`).join('')}</div>` : ''}
          ${freq.length ? `<h3 class="list-h">پرتکرارهای من در ${MEALS[curMeal]}</h3>${freq.map(x => foodRow(x.food, room ? fits(x.food) : ` · معمولاً ${amountLabel(x.last.qty, x.last.grams ? GRAM : x.food.unit)}`)).join('')}` : ''}
          ${Object.keys(CATEGORIES).filter(c => groups[c]).map(c => `
            <h3 class="list-h">${CATEGORIES[c]}</h3>
            ${groups[c].sort((a, b) => a.name.localeCompare(b.name, 'fa')).map(f => foodRow(f, fits(f))).join('')}`).join('')}
          ${!foods.length ? '<div class="empty">بانک غذا خالی است. از «بانک غذا» غذا اضافه کنید.</div>' : ''}`;
      }
      drawResults();
      onMeal(body, v => { curMeal = v; drawResults(); });

      input.addEventListener('input', () => { query = input.value; drawResults(); });
      body.querySelector('[data-close]').onclick = () => sheet.close();
      body.querySelector('[data-bank]').onclick = () => openFoodBank(() => drawResults());
      list.addEventListener('click', e => {
        const cb = e.target.closest('[data-combo]');
        if (cb) {
          const c = usualCombos(store.get().entries, store.get().foods, day, curMeal)[Number(cb.dataset.combo)];
          const byId = new Map(store.get().foods.map(x => [x.id, x]));
          chosen = c.ids.map(id => byId.get(id)).filter(Boolean);
          locks.clear();
          return drawPortions();
        }
        const f = e.target.closest('[data-food]');
        if (f) return drawQty(store.get().foods.find(x => x.id === f.dataset.food));
        if (e.target.closest('[data-custom]')) drawCustom();
      });
      body.querySelector('.sheet-foot [data-custom]').onclick = () => drawCustom();
      body.querySelector('[data-scan]').onclick = scan;
      body.querySelector('[data-portions]')?.addEventListener('click', drawPortions);
      body.querySelector('[data-photo]')?.addEventListener('click', takePhoto);
    }

    // A barcode seen before opens its bank food; a new one opens «غذای دلخواه», filled in.
    async function scan() {
      const code = await scanBarcode();
      if (!code || !body.isConnected) return;
      const food = store.get().foods.find(f => f.barcode === code);
      if (food) return drawQty(food);
      drawCustom(code);
    }

    /*
      Photo → list of foods → log. The amounts come from Hooshvareh's look at the plate;
      calories of bank foods come from the bank (photoItems). Nothing is saved before «ثبت».
    */
    async function takePhoto() {
      const file = await pickPhoto();
      if (!file || !body.isConnected) return;
      let shot;
      try { shot = await foodPhoto(file); } catch { return toast('عکس خوانده نشد'); }
      readPhoto(shot, '');
    }

    async function readPhoto(shot, hint) {
      body.innerHTML = `
        <div class="sheet-head"><button class="icon-btn" data-back aria-label="برگشت">${icon.chevR}</button><h2>از روی عکس</h2><span></span></div>
        <img class="photo-prev shot" src="${shot.url}" alt="">
        <p class="muted small ai-wait"><span class="typing"><i></i><i></i><i></i></span> هوشواره دارد بشقابت را نگاه می‌کند…</p>`;
      body.querySelector('[data-back]').onclick = drawList;
      try {
        const r = await ask('photo', { image: shot.b64, meal: curMeal, hint });
        if (body.isConnected && body.querySelector('.shot')) drawPhoto(shot, r, hint);
      } catch (e) {
        toast(e.message);
        if (body.isConnected && body.querySelector('.shot')) drawList();
      }
    }

    function drawPhoto(shot, result, hint) {
      const items = photoItems(result, store.get().foods);
      const off = new Set();
      body.innerHTML = `
        <div class="sheet-head"><button class="icon-btn" data-back aria-label="برگشت">${icon.chevR}</button><h2>از روی عکس</h2><span></span></div>
        ${seg()}
        <img class="photo-prev shot" src="${shot.url}" alt="">
        ${result.note ? `<p class="small ai-est-note">${sparkle(14)} ${esc(result.note)}</p>` : ''}
        ${items.length ? `<div class="shot-list">${items.map((it, n) => `
          <label class="check shot-item"><input type="checkbox" data-i="${n}" checked>
            <span><b>${esc(it.name)}</b><small class="muted">${amountLabel(it.qty, it.unit)} · ${fa(it.kcal)} کالری · ${fa(it.protein, 1)} گرم پروتئین${it.bank ? '' : ' · تخمینی'}</small></span>
          </label>`).join('')}</div>
          <div class="preview" data-total></div>` : '<div class="empty">غذایی در این عکس پیدا نشد.</div>'}
        <form class="row gap shot-hint" novalidate>
          <label class="field grow"><span>چیزی اشتباه است؟ بنویس تا دوباره ببیند</span><input name="hint" value="${esc(hint)}" placeholder="مثلاً برنج دو کفگیر بود، مرغ سرخ‌شده است"></label>
          <button class="btn">دوباره</button>
        </form>
        ${items.length ? '<button class="btn primary block big" data-save></button>' : ''}
        <p class="muted small">تخمین از روی عکس تقریبی است: روغن، شکر و عمق ظرف در عکس دیده نمی‌شود. بعد از ثبت هم می‌توانی هر مورد را باز و اصلاح کنی.</p>`;
      onMeal(body, v => { curMeal = v; });
      body.querySelector('[data-back]').onclick = drawList;
      const paint = () => {
        const on = items.filter((_, n) => !off.has(n));
        const save = body.querySelector('[data-save]');
        if (!save) return;
        save.textContent = on.length ? `ثبت ${fa(on.length)} مورد` : 'موردی انتخاب نشده';
        save.disabled = !on.length;
        body.querySelector('[data-total]').innerHTML = `<b>${fa(on.reduce((s, i) => s + i.kcal, 0))}</b> کالری · ${fa(Math.round(on.reduce((s, i) => s + i.protein, 0)))} گرم پروتئین`;
      };
      paint();
      body.querySelectorAll('.shot-item input').forEach(c => c.onchange = () => { c.checked ? off.delete(Number(c.dataset.i)) : off.add(Number(c.dataset.i)); paint(); });
      body.querySelector('.shot-hint').onsubmit = e => {
        e.preventDefault();
        const h = e.target.elements.hint.value.trim();
        if (!h) return toast('بنویس چه چیزی را درست کند');
        readPhoto(shot, h);
      };
      body.querySelector('[data-save]')?.addEventListener('click', () => {
        const on = items.filter((_, n) => !off.has(n));
        on.forEach(({ bank, ...it }) => save({ day, meal: curMeal, ...it }));
        URL.revokeObjectURL(shot.url);
        sheet.close();
        toast(`${fa(on.length)} مورد ثبت شد`);
      });
    }

    /*
      `eaten`: from the plan's «+», what was actually eaten (more than fits, often): the usual
      amount picker, whatever is left of the occasion. Back goes to the portions.
    */
    function drawQty(food, eaten = false) {
      if (room && !eaten) {
        if (!chosen.some(c => c.id === food.id)) chosen.push(food);
        return drawPortions();
      }
      body.innerHTML = `
        <div class="sheet-head">
          <button class="icon-btn" data-back aria-label="برگشت">${icon.chevR}</button>
          <h2>${esc(food.name)}</h2>
          <button class="icon-btn" data-edit aria-label="ویرایش غذا">${icon.edit}</button>
        </div>
        ${seg()}
        <div class="qty-box"><div class="stack" data-amount></div>
          <button class="link small" data-edit>کالری، واحد یا وزنش دقیق نیست؟ ویرایش</button>
        </div>
        <button class="btn primary block big" data-save>ثبت</button>`;
      onMeal(body, v => { curMeal = v; });
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
      body.querySelector('[data-back]').onclick = eaten ? drawPortions : drawList;
      if (eaten) body.querySelector('[data-amount]').insertAdjacentHTML('beforebegin', `<p class="muted small portion">هر مقداری که واقعاً خورده‌ای را ثبت کن؛ اگر از سهم ${room.label} بیشتر شود، اپ خودش حساب می‌کند.</p>`);
      body.querySelectorAll('[data-edit]').forEach(b => b.onclick = edit);
      body.querySelector('[data-save]').onclick = () => {
        const a = amount.get();
        save({ day, meal: curMeal, food_id: food.id, name: food.name, ...a, is_veg: food.is_veg });
        sheet.close();
        toast(`${food.name} ثبت شد`);
      };
    }

    /*
      A food that isn't in the bank: describe one unit, say how much was eaten, optionally keep it.
      From a barcode it is filled in from the product and kept by default, with its barcode.
      With `room` there is no amount: the food joins the chosen ones (drawPortions).
    */
    function drawCustom(code = null) {
      body.innerHTML = `
        <div class="sheet-head">
          <button class="icon-btn" data-back aria-label="برگشت">${icon.chevR}</button>
          <h2>غذای دلخواه</h2><span></span>
        </div>
        ${seg()}
        <form class="stack" novalidate>
          <label class="field"><span>اسم غذا</span><input name="name" value="${code ? '' : esc(query)}" placeholder="مثلاً ساندویچ مرغ"></label>
          ${code ? barcodeBox(code) : ''}
          ${aiEstBtn()}
          ${unitFields({ unit: 'پرس', grams: 300, kcal: '', protein: '' })}
          ${room ? '' : '<div class="qty-box"><div class="stack" data-amount></div></div>'}
          <label class="check"><input type="checkbox" name="veg"><span>جزو وعده‌ی سبزی حساب شود</span></label>
          <label class="check"><input type="checkbox" name="save" ${code ? 'checked' : ''}><span>به بانک غذا هم اضافه شود${code ? ' (دفعه‌ی بعد با همین بارکد مستقیم می‌آید)' : ''}</span></label>
          <p class="err" hidden></p>
          <button class="btn primary block big">${room ? 'بگو چقدر بخورم' : 'ثبت'}</button>
        </form>`;
      onMeal(body, v => { curMeal = v; });
      const form = body.querySelector('form');
      const F = form.elements;
      let amount = null;
      const units = bindUnitFields(form, F, () => amount?.refresh());
      const base = () => {
        const r = units.read();
        return r.error ? { unit: F.unit.value === GRAM ? GRAM : 'پرس', grams: null, kcal: 0, protein: 0 } : r;
      };
      if (!room) amount = mountAmount(body.querySelector('[data-amount]'), base, { qty: 1, grams: false });
      bindEstimate(body, F, units);
      // the form has no category field; a product's category still reaches the bank
      let category = null;
      if (code) fillFromBarcode(body, F, units, code, f => { category = f.category; });
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
          food_id = store.upsertFood({ name, ...r, is_veg: F.veg.checked, category: category || (F.veg.checked ? 'veg' : 'other'), barcode: code }).id;
        }
        if (room) {
          chosen.push({ id: food_id, name, ...r, is_veg: F.veg.checked });
          return drawPortions();
        }
        save({ day, meal: curMeal, food_id, name, ...amount.get(), is_veg: F.veg.checked });
        sheet.close();
        toast(`${name} ثبت شد`);
      };
      if (!code) F.name.focus();
    }

    /*
      The diet plan's «+»: the chosen foods with how much of each fits what is left of the
      occasion when eaten together (portionsFor) — nothing to pick. Another food can be put
      beside them, or one taken off, and the amounts are shared out again.
    */
    function drawPortions() {
      // a bank food corrected meanwhile comes back with its new values
      chosen = chosen.map(c => (c.id && store.get().foods.find(f => f.id === c.id)) || c);
      if (!chosen.length) return drawList();
      if (smart) return drawSmart();
      const left = Math.max(0, Math.round(room.kcal));
      const ps = portionsFor(chosen, left);
      const amt = (f, p) => p && { unit: f.unit, qty: p.qty, kcal: f.kcal * p.qty, protein: f.protein * p.qty };
      const all = chosen.map((f, i) => amt(f, ps[i]));
      const on = all.filter(Boolean);
      const sum = k => on.reduce((t, a) => t + a[k], 0);
      const many = chosen.length > 1;
      body.innerHTML = `
        <div class="sheet-head">
          <button class="icon-btn" data-back aria-label="برگشت">${icon.chevR}</button>
          <h2>${many ? `${fa(chosen.length)} خوراکی در ${room.label}` : esc(chosen[0].name)}</h2><span></span>
        </div>
        <p class="muted small portion">${left ? `از <b>${fa(left)}</b> کالری‌ای که از سهم ${room.label} مانده${many ? '، با هم' : ''} این‌قدر می‌توانی بخوری:` : `سهم ${room.label} پر شده؛ چیزی با کالری در آن جا نمی‌شود.`}</p>
        <div class="qty-box portions">${chosen.map((f, i) => {
          const a = all[i];
          const g = a && f.unit !== GRAM && Number(f.grams) > 0 ? ` (حدود ${fa(Math.round(a.qty * f.grams))} گرم)` : '';
          return `<div class="portion-row">
            <span class="grow"><b>${esc(f.name)}</b>
              <small class="muted">${!a ? `حتی ${qtyLabel(0.25)} ${esc(f.unit)} هم جا نمی‌شود`
                : ps[i].free ? `${amountLabel(a.qty, a.unit)} · کالری ندارد و از سهم کم نمی‌کند`
                : `تا <b>${amountLabel(a.qty, a.unit)}</b>${g} · ${fa(Math.round(a.kcal))} کالری`}</small>
              ${f.id ? `<button type="button" class="link small eaten-btn" data-eaten="${i}">بیشتر خورده‌ام؛ مقدار واقعی</button>` : ''}</span>
            ${f.id ? `<button class="icon-btn sm" data-fix="${i}" aria-label="ویرایش ${esc(f.name)}">${icon.edit}</button>` : ''}
            <button class="icon-btn sm" data-drop="${i}" aria-label="برداشتن ${esc(f.name)}">${icon.close}</button>
          </div>`;
        }).join('')}
          ${on.length ? `<div class="preview"><b>${fa(Math.round(sum('kcal')))}</b> کالری · <b>${fa(Math.round(sum('protein') * 10) / 10, 1)}</b> گرم پروتئین</div>` : ''}
          ${ps.some(p => p?.capped) ? '<small class="muted portion">بیشتر از این هم جا می‌شود، ولی برای یک وعده همین اندازه بس است.</small>' : ''}
        </div>
        <button class="btn block" data-beside>${icon.plus} یک خوراکی دیگر هم کنارش می‌خورم</button>
        <button class="btn primary block big" data-save ${on.length ? '' : 'disabled'}>${many && on.length ? `ثبت ${fa(on.length)} مورد` : 'ثبت'}</button>`;
      body.querySelector('[data-back]').onclick = drawList;
      body.querySelector('[data-beside]').onclick = () => { query = ''; drawList(); };
      body.querySelectorAll('[data-drop]').forEach(b => b.onclick = () => { chosen.splice(Number(b.dataset.drop), 1); drawPortions(); });
      body.querySelectorAll('[data-eaten]').forEach(b => b.onclick = () => drawQty(chosen[Number(b.dataset.eaten)], true));
      body.querySelectorAll('[data-fix]').forEach(b => b.onclick = () => openFoodForm(chosen[Number(b.dataset.fix)], drawPortions));
      body.querySelector('[data-save]').onclick = () => {
        chosen.forEach((f, i) => all[i] && save({ day, meal: curMeal, food_id: f.id || null, name: f.name, ...all[i], is_veg: !!f.is_veg }));
        sheet.close();
        toast(on.length > 1 ? `${fa(on.length)} مورد ثبت شد` : `${chosen.find((_, i) => all[i]).name} ثبت شد`);
      };
    }

    /*
      «سهم وعده»: how much of each chosen food, by its role on the plate (fitMeal). + / − sets a
      food's amount by hand and the others share what is left around it.
    */
    function drawSmart() {
      for (const k of [...locks.keys()]) if (!chosen.includes(k)) locks.delete(k);
      const left = Math.max(0, Math.round(room.kcal));
      const lockIdx = Object.fromEntries(chosen.map((f, i) => [i, locks.get(f)]).filter(([, q]) => q != null));
      const r = fitMeal(chosen, left, lockIdx);
      const many = chosen.length > 1;
      // the amount in the unit it is shown in (fitMeal works in the food's own unit)
      const view = (f, it) => {
        const ms = [f.unit !== GRAM && 'u', hasUnit2(f) && 'u2', f.unit !== GRAM && hasGrams(f) && 'g'].filter(Boolean);
        const m = ms.includes(shown.get(f)) ? shown.get(f) : ms[0] || 'u';
        const gIn = m === 'g' ? 1 : m === 'u2' ? Number(f.grams2) : 1; // grams in one shown unit ('u': in food units)
        const per = m === 'u' ? 1 : Number(f.grams) / gIn;              // shown units in one food unit
        const val = m === 'g' ? Math.round(it.qty * per) : Math.round(it.qty * per * 100) / 100;
        const step = m === 'g' ? (val >= 100 ? 25 : 10) : m === 'u2' ? 0.5 : it.step;
        return { ms, m, per, val, step, min: m === 'g' ? 5 : step, unit: m === 'g' ? GRAM : m === 'u2' ? f.unit2 : f.unit };
      };
      const views = chosen.map((f, i) => view(f, r.items[i]));
      body.innerHTML = `
        <div class="sheet-head">
          <button class="icon-btn" data-back aria-label="برگشت">${icon.chevR}</button>
          <h2>چقدر بخورم؟</h2><span></span>
        </div>
        ${mealSeg(curMeal)}
        ${left ? '' : `<p class="muted small portion">از کالری امروز چیزی برای ${room.label} نمانده.</p>`}
        <div class="qty-box portions">${chosen.map((f, i) => {
          const it = r.items[i];
          const v = views[i];
          // a food whose unit has a weight: tapping its amount shows it in grams (and back)
          const val = `<b>${v.unit === GRAM ? fa(Math.round(v.val)) : qtyLabel(v.val)}</b><small><span>${esc(v.unit)}</span>${v.ms.length > 1 ? icon.swap : ''}</small>`;
          const amt = v.ms.length > 1
            ? `<button type="button" class="pval punit" data-unit="${i}" aria-label="${esc(amountLabel(v.val, v.unit))}، واحد دیگر">${val}</button>`
            : `<span class="pval">${val}</span>`;
          return `<div class="portion-row smart">
            <span class="grow"><b>${esc(f.name)}</b>
              <small class="muted">${it.free ? 'کالری ندارد' : `${fa(Math.round(it.kcal))} کالری`}${it.locked ? ' · دستی' : ''}</small></span>
            <span class="pstep">
              <button class="icon-btn sm" data-dec="${i}" aria-label="کمتر" ${v.val - v.step < v.min - 1e-9 ? 'disabled' : ''}>${icon.minus}</button>
              ${amt}
              <button class="icon-btn sm" data-inc="${i}" aria-label="بیشتر">${icon.plus}</button>
            </span>
            <button class="icon-btn sm" data-drop="${i}" aria-label="برداشتن ${esc(f.name)}">${icon.close}</button>
          </div>`;
        }).join('')}
          <div class="preview ptotal"><span><b>${fa(Math.round(r.total))}</b>${left ? ` از ${fa(left)}` : ''} کالری · <b>${fa(Math.round(r.protein))}</b> گرم پروتئین</span>
            ${locks.size ? `<button type="button" class="icon-btn sm" data-reset aria-label="برگشت به پیشنهاد اپ">${icon.undo}</button>` : ''}</div>
          ${r.over ? `<p class="small warn-text">${fa(r.over)} کالری بیشتر از سهم ${room.label}${r.drop != null ? `؛ بدون «${esc(chosen[r.drop].name)}» جا می‌شود` : ''}. می‌توانی همین را بخوری؛ از وعده‌های بعد کم می‌شود.</p>` : ''}
          ${r.spare > 50 ? `<p class="small muted">همه به اندازه‌ی یک وعده رسیدند و ${fa(r.spare)} کالری از سهم ماند.</p>` : ''}
        </div>
        <button class="btn block" data-beside>${icon.plus} یک خوراکی دیگر هم کنارش می‌خورم</button>
        <button class="btn primary block big" data-save>${many ? `ثبت ${fa(chosen.length)} مورد` : 'ثبت'}</button>`;
      bindMeal(body, v => { curMeal = v; room = { ...room, ...room.budgetFor(v) }; drawSmart(); });
      body.querySelector('[data-back]').onclick = drawList;
      body.querySelector('[data-beside]').onclick = () => { query = ''; drawList(); };
      body.querySelector('[data-reset]')?.addEventListener('click', () => { locks.clear(); drawSmart(); });
      const nudge = (i, dir) => {
        const it = r.items[i];
        const v = views[i];
        if (v.m === 'u') locks.set(chosen[i], Math.max(it.step, Math.round((it.qty + dir * it.step) * 100) / 100));
        else {
          // grams go to the next round 5 / 10 / 25; the amount is kept in the food's own unit
          const to = Math.max(v.min, v.m === 'g' ? (dir > 0 ? Math.floor(v.val / v.step) + 1 : Math.ceil(v.val / v.step) - 1) * v.step : v.val + dir * v.step);
          locks.set(chosen[i], to / v.per);
        }
        drawSmart();
      };
      body.querySelectorAll('[data-unit]').forEach(x => x.onclick = () => {
        const i = Number(x.dataset.unit);
        const { ms, m } = views[i];
        shown.set(chosen[i], ms[(ms.indexOf(m) + 1) % ms.length]);
        drawSmart();
      });
      body.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => nudge(Number(b.dataset.dec), -1));
      body.querySelectorAll('[data-inc]').forEach(b => b.onclick = () => nudge(Number(b.dataset.inc), 1));
      body.querySelectorAll('[data-drop]').forEach(b => b.onclick = () => { chosen.splice(Number(b.dataset.drop), 1); drawPortions(); });
      body.querySelector('[data-save]').onclick = () => {
        chosen.forEach((f, i) => {
          const it = r.items[i];
          const v = views[i];
          save({ day, meal: curMeal, food_id: f.id || null, name: f.name, unit: v.unit, qty: v.m === 'u' ? it.qty : v.val, kcal: it.kcal, protein: it.protein, is_veg: !!f.is_veg });
        });
        sheet.close();
        toast(many ? `${fa(chosen.length)} مورد ثبت شد` : `${chosen[0].name} ثبت شد`);
      };
    }

    drawList();
  }, { tall: true });
}

/*
  «تخمین با هوشواره»: fills unit, weight, calories, protein (and category / veg where the
  form has them) from the food's name. Shared with the food bank form. The chosen unit and
  its weight are sent along, and kept, when they were set on purpose (an existing food, a
  barcode, or changed by hand); numbers read off the pack stay, the estimate then only
  gives the weight of a unit when it is missing, and the category.
*/
export function bindEstimate(root, F, units, { keepUnit = false } = {}) {
  const btn = root.querySelector('[data-ai-est]');
  if (!btn) return;
  const label = btn.innerHTML;
  const unit0 = F.unit.value;
  btn.onclick = async () => {
    const name = F.name.value.trim();
    if (!name) { toast('اول اسم غذا را بنویس'); F.name.focus(); return; }
    const cur = units.picked();
    const chosen = keepUnit || F.unit.value !== unit0;
    const unit = chosen ? cur.unit : '';
    const grams = chosen && cur.unit !== GRAM && cur.grams > 0 ? cur.grams : 0;
    const ex = units.exact();
    btn.disabled = true;
    btn.innerHTML = `${sparkle()} هوشواره دارد حساب می‌کند…`;
    try {
      const per100 = ex && { kcal: Math.round(ex.kcal * 100), protein: Math.round(ex.protein * 1000) / 10 };
      const r = await ask('estimate', { name, unit, grams, per100 });
      if (!btn.isConnected) return;
      r.unit = unit || r.unit;
      const w = r.unit === GRAM ? 1 : r.grams;
      // the estimate's density, or the pack's, on the weight that was chosen
      const d = ex || (w > 0 && { kcal: r.kcal / w, protein: r.protein / w });
      r.grams = r.unit === GRAM ? 1 : grams || r.grams;
      if (d && r.grams > 0) { r.kcal = d.kcal * r.grams; r.protein = d.protein * r.grams; }
      units.set({ unit: r.unit, grams: r.grams, kcal: r.kcal, protein: r.protein }, { exact: !!ex });
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
    ? { unit: food.unit, grams: food.grams, kcal: food.kcal, protein: food.protein, unit2: food.unit2, grams2: food.grams2 }
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
    const start = entry.unit === GRAM && per.unit !== GRAM ? { qty: q0, grams: true }
      : { qty: q0, grams: false, unit2: !!per.unit2 && entry.unit === per.unit2 };
    amount = mountAmount(body.querySelector('[data-amount]'), base, start);
    const changed = r => food && ['unit', 'grams', 'kcal', 'protein', 'unit2', 'grams2'].some(k =>
      typeof r[k] === 'number' ? Math.abs(r[k] - (Number(food[k]) || 0)) > 1e-6 : (r[k] ?? null) !== (food[k] ?? null));
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
