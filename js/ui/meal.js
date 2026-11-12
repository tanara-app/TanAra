/*
  The single meal screen (beta «یکی»): one place instead of «شمارش کالری»، «سهم وعده» and «رژیم».

  Only for accounts with `one` in profile.beta: then the today screen has no mode tabs, and every
  meal there is one row: its name, the foods eaten, and the calories eaten —
  or, for a meal with nothing yet, the calories it has. A tap opens the meal:
  - what was already logged in it (a tap edits);
  - combos (domain/combos.js): their own, the ones they keep eating, the app's starters;
  - every food, with search, a photo, a barcode or a food typed in.
  Whatever is picked lands on «the plate»: the app gives the amounts that fit what the meal has
  left (fitMeal), + / − sets one by hand, a tap on a food's name swaps it for another of the same
  kind, and the bookmark keeps the plate as their own combo (a starter one they changed is then
  replaced by theirs). A single food they logged before starts at the amount they had last time,
  so counting calories stays counting what was eaten. Nothing here calls Hooshvareh or costs anything.
*/
import * as store from '../data/store.js';
import { MEALS, frequentFoods, lastAmountFor } from '../domain/stats.js';
import { CATEGORIES, GRAM } from '../data/seedFoods.js';
import { norm, esc, fa, qtyLabel } from '../lib/fa.js';
import { mealForNow, today } from '../lib/dates.js';
import { sheet, toast, confirmBox, choose, icon } from './dom.js';
import { amountLabel, foodMeta, hasGrams, hasUnit2 } from './units.js';
import { fitMeal, usualCombos, roleOf, packKey } from '../domain/portion.js';
import { mealCombos, searchCombos, shortName, libKey, mealRows } from '../domain/combos.js';
import { COMBOS } from '../data/combos.js';
import { packs, savePack, askPackName, deletePack, hideKey, hidden } from './packs.js';
import { planAvoid } from '../ai/foodTags.js';
import { openLogSheet, openEntrySheet } from './logFood.js';
import { aiAvailable } from '../ai/hooshvareh.js';
import { cameraIcon } from './photo.js';
import { barcodeIcon } from './barcode.js';
import { cheer } from './mascot.js';

const SHOWN = 4; // combos shown before «همه»

const combosFor = (day, meal) => {
  const s = store.get();
  return mealCombos({
    meal, foods: s.foods, packs: packs(), starters: COMBOS, hidden: hidden(),
    usual: usualCombos(s.entries, s.foods, day, meal, { limit: 12 }),
    avoid: planAvoid(), dislikes: store.profile()?.planPrefs?.dislikes || '',
  });
};

/* ---------------- the meal rows ---------------- */

export function mealRowsHtml(day, budgetFor) {
  const rows = mealRows(store.get().entries, day, MEALS, m => budgetFor(m).kcal);
  return `<section class="card meal-rows">${rows.map(r => `
    <button type="button" class="mrow" data-open-meal="${r.meal}">
      <span class="mr-text"><b>${r.label}</b>${r.names.length ? `<small>${r.names.map(esc).join('، ')}</small>` : ''}</span>
      ${r.items.length ? `<span class="mr-kcal">${fa(Math.round(r.kcal))}</span>` : r.budget > 0 ? `<span class="mr-kcal open" aria-label="${fa(r.budget)} کالری جا دارد">${fa(r.budget)}</span>` : ''}
    </button>`).join('')}
  </section>`;
}

export function bindMealRows(root, day, budgetFor) {
  root.querySelectorAll('[data-open-meal]').forEach(b => b.onclick = () => openMeal({ day, meal: b.dataset.openMeal, budgetFor }));
}

/* ---------------- the meal sheet ---------------- */

export function openMeal({ day = today(), meal = null, budgetFor }) {
  let cur = meal || (day === today() ? mealForNow() : 'lunch');
  let view = 'browse';
  let query = '';
  let all = false;           // every combo shown, not only the first few
  let chosen = [];           // the plate's foods (a typed-in one may have no id)
  let from = null;           // the combo the plate came from
  let edited = false;        // its foods changed since
  const locks = new Map();   // food → amount set by hand (in its own unit)
  const auto = new Set();    // locks that are only «what they had last time»
  const shown = new Map();   // food → the unit its amount is shown in: 'u', 'u2' or 'g'
  let unsub = null;

  const left = () => Math.max(0, Math.round(budgetFor(cur).kcal));
  const fresh = () => { chosen = chosen.map(c => (c.id && store.get().foods.find(f => f.id === c.id)) || c); };

  sheet.open(body => {
    // a change elsewhere (an entry edited, a photo logged, a sync) shows up here too
    unsub = store.subscribe(() => {
      if (!body.isConnected) return;
      if (view === 'browse' && document.activeElement?.type !== 'search') drawBrowse();
    });

    const pickMeal = async () => {
      const v = await choose('وعده', Object.entries(MEALS).map(([value, label]) => ({ value, label })), cur);
      if (!v || v === cur) return;
      cur = v;
      view === 'plate' ? drawPlate() : drawBrowse();
    };
    // the calories the meal has, under its name (on the plate the total line says it)
    const head = (start, end, kcal = true) => `
      <div class="sheet-head">
        ${start}
        <button type="button" class="meal-title" data-pick-meal aria-label="وعده‌ی دیگر">
          <h2>${MEALS[cur]}</h2>${kcal ? `<small>${fa(left())} کالری</small>` : ''}
        </button>
        ${end}
      </div>`;

    /* ----- browse: logged, combos, foods ----- */
    function drawBrowse() {
      view = 'browse';
      const s = store.get();
      const logged = s.entries.filter(e => e.day === day && e.meal === cur).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      body.innerHTML = `
        ${head(`<button class="icon-btn" data-close aria-label="بستن">${icon.close}</button>`, '<span></span>')}
        ${logged.length ? `<div class="logged">${logged.map(e => `
          <button class="entry" data-entry="${e.id}">
            <span class="ename">${esc(e.name)}${e.is_veg ? ` <i class="veg">${icon.leaf}</i>` : ''}</span>
            <span class="eqty">${amountLabel(Number(e.qty), e.unit)}</span>
            <span class="ekcal">${fa(Math.round(e.kcal))}</span>
          </button>`).join('')}</div>` : ''}
        <div class="search">${icon.search}<input type="search" placeholder="جست‌وجو" value="${esc(query)}" autocomplete="off" aria-label="جست‌وجوی غذا یا ترکیب"></div>
        <div class="meal-list"></div>
        <div class="sheet-foot meal-foot">
          ${chosen.length ? `<button class="plate-bar" data-plate><span class="pb-names">${chosen.map(c => esc(shortName(c.name))).join('، ')}</span><span class="pb-go">مقدارها</span></button>` : ''}
          <div class="row gap">
            ${aiAvailable() ? `<button class="btn grow" data-via="photo" aria-label="عکس">${cameraIcon}</button>` : ''}
            <button class="btn grow" data-via="scan" aria-label="بارکد">${barcodeIcon}</button>
            <button class="btn grow custom-btn" data-via="custom">${icon.edit} غذای دلخواه</button>
          </div>
        </div>`;
      const list = body.querySelector('.meal-list');
      const input = body.querySelector('input[type=search]');
      drawResults(list);
      input.addEventListener('input', () => { query = input.value; drawResults(list); });
      body.querySelector('[data-close]').onclick = () => sheet.close();
      body.querySelector('[data-pick-meal]').onclick = pickMeal;
      body.querySelector('[data-plate]')?.addEventListener('click', drawPlate);
      body.querySelectorAll('[data-entry]').forEach(b => b.onclick = () => openEntrySheet(s.entries.find(e => e.id === b.dataset.entry)));
      body.querySelectorAll('[data-via]').forEach(b => b.onclick = () => openLogSheet({
        day, meal: cur, via: b.dataset.via, query, onPick: food => addFood(food),
      }));
      list.addEventListener('click', e => {
        const c = e.target.closest('[data-combo]');
        if (c && !held) return takeCombo(c.dataset.combo);
        const f = e.target.closest('[data-food]');
        if (f) return addFood(store.get().foods.find(x => x.id === f.dataset.food));
        if (e.target.closest('[data-all]')) { all = true; drawResults(list); }
      });
      bindHold(list);
    }

    function drawResults(list) {
      const s = store.get();
      const combos = searchCombos(combosFor(day, cur), query);
      const few = !query && !all && combos.length > SHOWN + 1;
      // the foods under the name, unless the name already says them all («سیب و گردو»)
      const comboRow = c => {
        const names = c.foods.map(f => shortName(f.name));
        const said = names.every(n => norm(c.name).includes(norm(n)));
        return `<button type="button" class="combo" data-combo="${esc(c.key)}">
          <span class="cname">${c.kind === 'own' ? `<i class="ck">${icon.bookmarkOn}</i>` : c.kind === 'usual' ? `<i class="ck">${icon.history}</i>` : ''}${esc(c.name)}</span>
          ${said ? '' : `<span class="cfoods">${names.map(esc).join('، ')}</span>`}
        </button>`;
      };
      const on = new Set(chosen.map(c => c.id).filter(Boolean));
      const foodRow = f => `
        <button class="food-row${on.has(f.id) ? ' on' : ''}" data-food="${f.id}">
          <span class="fname">${esc(f.name)}</span><span class="fmeta">${foodMeta(f)}</span>
          ${on.has(f.id) ? `<i class="fcheck">${icon.check}</i>` : ''}
        </button>`;
      let foods;
      if (query) {
        const q = norm(query);
        const hits = s.foods.filter(f => norm(f.name).includes(q)).sort((a, b) => norm(a.name).indexOf(q) - norm(b.name).indexOf(q));
        foods = hits.length ? hits.map(foodRow).join('') : '';
      } else {
        const freq = frequentFoods(s.entries, s.foods, day, cur);
        const freqIds = new Set(freq.map(x => x.food.id));
        const groups = {};
        s.foods.filter(f => !freqIds.has(f.id)).forEach(f => (groups[f.category] ||= []).push(f));
        foods = `${freq.length ? `<h3 class="list-h">پرتکرارها</h3>${freq.map(x => foodRow(x.food)).join('')}` : ''}
          ${Object.keys(CATEGORIES).filter(c => groups[c]).map(c => `
            <h3 class="list-h">${CATEGORIES[c]}</h3>
            ${groups[c].sort((a, b) => a.name.localeCompare(b.name, 'fa')).map(foodRow).join('')}`).join('')}`;
      }
      list.innerHTML = `
        ${combos.length ? `<h3 class="list-h">ترکیب‌ها</h3><div class="combos">${(few ? combos.slice(0, SHOWN) : combos).map(comboRow).join('')}
          ${few ? `<button type="button" class="link small more-combos" data-all>همه (${fa(combos.length)})</button>` : ''}</div>` : ''}
        ${foods ? (query ? `<h3 class="list-h">خوراکی‌ها</h3>${foods}` : foods)
          : query ? `<div class="empty"><button class="link" data-type-in>«${esc(query)}» را دستی بنویس</button></div>` : ''}`;
      list.querySelector('[data-type-in]')?.addEventListener('click', () => openLogSheet({ day, meal: cur, via: 'custom', query, onPick: addFood }));
    }

    // Holding a combo: their own is renamed or deleted, another is turned down.
    let held = false;
    function bindHold(list) {
      let timer = null;
      list.addEventListener('pointerdown', e => {
        const b = e.target.closest('[data-combo]');
        if (!b) return;
        held = false;
        timer = setTimeout(() => { held = true; comboMenu(b.dataset.combo); }, 500);
      });
      const stop = () => clearTimeout(timer);
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => list.addEventListener(t, stop));
      list.addEventListener('scroll', stop, { passive: true });
      list.addEventListener('contextmenu', e => { if (e.target.closest('[data-combo]')) e.preventDefault(); });
      // the click that ends a hold is not a tap
      list.addEventListener('click', () => { setTimeout(() => { held = false; }, 0); }, true);
    }
    async function comboMenu(key) {
      const c = combosFor(day, cur).find(x => x.key === key);
      if (!c) return;
      if (c.kind === 'own') {
        const v = await choose(c.name, [{ value: 'rename', label: 'تغییر اسم' }, { value: 'del', label: 'حذف ترکیب' }], null);
        if (v === 'rename') {
          const name = await askPackName(c.name);
          if (name) savePack({ ...c.pack, name });
        }
        if (v === 'del' && await confirmBox(`«${esc(c.name)}» حذف شود؟`, 'حذف')) deletePack(c.pack.id);
      } else {
        const v = await choose(c.name, [{ value: 'hide', label: 'پیشنهاد نکن' }], null);
        if (v === 'hide') hideKey(c.kind === 'starter' ? libKey(c.lib.id) : packKey(c.ids));
      }
      if (view === 'browse') drawBrowse();
    }

    function takeCombo(key) {
      const c = combosFor(day, cur).find(x => x.key === key);
      if (!c) return;
      chosen = [...c.foods];
      from = c;
      edited = false;
      locks.clear(); auto.clear(); shown.clear();
      drawPlate();
    }

    function addFood(food) {
      if (!food) return;
      if (!chosen.some(c => c === food || (c.id && c.id === food.id))) {
        chosen.push(food);
        if (from) edited = true;
        // a second food: «what I had last time» gives way to amounts that fit together
        for (const f of auto) { locks.delete(f); auto.delete(f); }
        if (chosen.length === 1 && food.id) {
          const last = store.get().entries.some(e => e.food_id === food.id) && lastAmountFor(store.get().entries, food, cur);
          if (last) {
            const q = last.grams && Number(food.grams) > 0 ? last.qty / Number(food.grams)
              : last.unit2 ? last.qty * Number(food.grams2) / Number(food.grams) : last.qty;
            if (q > 0) {
              locks.set(food, q); auto.add(food);
              shown.set(food, last.grams ? 'g' : last.unit2 ? 'u2' : 'u');
            }
          }
        }
      }
      drawPlate();
    }

    /* ----- the plate: amounts that fit, by hand where they say ----- */
    function drawPlate() {
      view = 'plate';
      fresh();
      for (const k of [...locks.keys()]) if (!chosen.includes(k)) { locks.delete(k); auto.delete(k); }
      if (!chosen.length) { from = null; return drawBrowse(); }
      const budget = left();
      const lockIdx = Object.fromEntries(chosen.map((f, i) => [i, locks.get(f)]).filter(([, q]) => q != null));
      const r = fitMeal(chosen, budget, lockIdx);
      const views = chosen.map((f, i) => unitView(f, r.items[i], shown));
      const own = from?.kind === 'own';
      const ids = [...new Set(chosen.map(f => f.id).filter(Boolean))];
      const canKeep = ids.length >= 2 && (!own || edited);
      const byHand = [...locks.keys()].some(f => !auto.has(f));
      body.innerHTML = `
        ${head(`<button class="icon-btn" data-back aria-label="برگشت">${icon.chevR}</button>`,
          canKeep || own ? `<button class="icon-btn" data-keep ${canKeep ? '' : 'disabled'} aria-label="${own ? 'ذخیره‌ی تغییر ترکیب' : 'ذخیره به‌عنوان ترکیب'}">${own ? icon.bookmarkOn : icon.bookmark}</button>` : '<span></span>', false)}
        ${from ? `<p class="plate-name">${esc(from.name)}</p>` : ''}
        <div class="qty-box portions">${chosen.map((f, i) => {
          const it = r.items[i];
          const v = views[i];
          const val = `<b>${v.unit === GRAM ? fa(Math.round(v.val)) : qtyLabel(v.val)}</b><small><span>${esc(v.unit)}</span>${v.ms.length > 1 ? icon.swap : ''}</small>`;
          const amt = v.ms.length > 1
            ? `<button type="button" class="pval punit" data-unit="${i}" aria-label="${esc(amountLabel(v.val, v.unit))}، واحد دیگر">${val}</button>`
            : `<span class="pval">${val}</span>`;
          return `<div class="portion-row smart">
            <button type="button" class="grow pname" data-swap="${i}" aria-label="${esc(f.name)}، عوض کردن">
              <b>${esc(shortName(f.name))}</b><small class="muted">${it.free ? 'کالری ندارد' : `${fa(Math.round(it.kcal))} کالری`}</small>
            </button>
            <span class="pstep">
              <button class="icon-btn sm" data-dec="${i}" aria-label="کمتر" ${v.val - v.step < v.min - 1e-9 ? 'disabled' : ''}>${icon.minus}</button>
              ${amt}
              <button class="icon-btn sm" data-inc="${i}" aria-label="بیشتر">${icon.plus}</button>
            </span>
            <button class="icon-btn sm" data-drop="${i}" aria-label="برداشتن ${esc(f.name)}">${icon.close}</button>
          </div>`;
        }).join('')}
          <div class="preview ptotal"><span><b>${fa(Math.round(r.total))}</b>${budget ? ` از ${fa(budget)}` : ''} کالری · <b>${fa(Math.round(r.protein))}</b> گرم پروتئین</span>
            ${byHand || auto.size ? `<button type="button" class="icon-btn sm" data-reset aria-label="مقدارهای پیشنهادی">${icon.undo}</button>` : ''}</div>
          ${r.over ? `<p class="small warn-text">${fa(r.over)} کالری بیشتر${r.drop != null && chosen.length > 1 ? `؛ بدون «${esc(shortName(chosen[r.drop].name))}» جا می‌شود` : ''}</p>` : ''}
        </div>
        <div class="row gap plate-actions">
          <button class="btn" data-beside aria-label="خوراکی دیگر">${icon.plus}</button>
          <button class="btn primary grow big" data-save>${chosen.length > 1 ? `ثبت ${fa(chosen.length)} مورد` : 'ثبت'}</button>
        </div>`;

      body.querySelector('[data-back]').onclick = drawBrowse;
      body.querySelector('[data-pick-meal]').onclick = pickMeal;
      body.querySelector('[data-beside]').onclick = () => { query = ''; drawBrowse(); };
      body.querySelector('[data-reset]')?.addEventListener('click', () => { locks.clear(); auto.clear(); drawPlate(); });
      body.querySelector('[data-keep]')?.addEventListener('click', keep);
      const nudge = (i, dir) => {
        const it = r.items[i];
        const v = views[i];
        const f = chosen[i];
        auto.delete(f);
        if (v.m === 'u') locks.set(f, Math.max(it.step, Math.round((it.qty + dir * it.step) * 100) / 100));
        else {
          const to = Math.max(v.min, v.m === 'g' ? (dir > 0 ? Math.floor(v.val / v.step) + 1 : Math.ceil(v.val / v.step) - 1) * v.step : v.val + dir * v.step);
          locks.set(f, to / v.per);
        }
        drawPlate();
      };
      body.querySelectorAll('[data-unit]').forEach(x => x.onclick = () => {
        const i = Number(x.dataset.unit);
        const { ms, m } = views[i];
        shown.set(chosen[i], ms[(ms.indexOf(m) + 1) % ms.length]);
        drawPlate();
      });
      body.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => nudge(Number(b.dataset.dec), -1));
      body.querySelectorAll('[data-inc]').forEach(b => b.onclick = () => nudge(Number(b.dataset.inc), 1));
      body.querySelectorAll('[data-drop]').forEach(b => b.onclick = () => {
        chosen.splice(Number(b.dataset.drop), 1);
        if (from) edited = true;
        drawPlate();
      });
      body.querySelectorAll('[data-swap]').forEach(b => b.onclick = () => swapFood(Number(b.dataset.swap)));
      body.querySelector('[data-save]').onclick = () => {
        chosen.forEach((f, i) => {
          const it = r.items[i];
          const v = views[i];
          store.saveEntry({ day, meal: cur, food_id: f.id || null, name: f.name, unit: v.unit, qty: v.m === 'u' ? it.qty : v.val, kcal: it.kcal, protein: it.protein, is_veg: !!f.is_veg });
        });
        cheer('entry');
        const n = chosen.length;
        const name = from && !edited ? (from.kind === 'usual' ? null : from.name) : null;
        sheet.close();
        toast(name ? `${name} ثبت شد` : n > 1 ? `${fa(n)} مورد ثبت شد` : `${chosen[0].name} ثبت شد`);
      };
    }

    async function keep() {
      const ids = [...new Set(chosen.map(f => f.id).filter(Boolean))];
      if (from?.kind === 'own') {
        const p = savePack({ ...from.pack, ids });
        from = { ...from, pack: p, ids };
        edited = false;
        toast('ترکیب به‌روز شد');
        return drawPlate();
      }
      const name = await askPackName(from && from.kind !== 'usual' ? from.name : '');
      if (!name) return;
      const p = savePack({ name, meal: cur, ids, from: from?.kind === 'starter' ? from.lib.id : null });
      from = { key: `p:${p.id}`, name, foods: chosen, ids, kind: 'own', pack: p };
      edited = false;
      toast('ترکیب ذخیره شد');
      drawPlate();
    }

    // Another food in its place: the same kind on the plate first (bread for bread), then any by search.
    function swapFood(i) {
      const old = chosen[i];
      const role = roleOf(old);
      const s = store.get();
      const taken = new Set(chosen.map(c => c.id).filter(Boolean));
      const freq = new Map(frequentFoods(s.entries, s.foods, day, cur, 40).map((x, n) => [x.food.id, n]));
      const same = s.foods.filter(f => !taken.has(f.id) && roleOf(f) === role)
        .sort((a, b) => (freq.get(a.id) ?? 99) - (freq.get(b.id) ?? 99) || a.name.localeCompare(b.name, 'fa'));
      let q = '';
      sheet.open(sb => {
        sb.innerHTML = `
          <div class="sheet-head"><span></span><h2>به‌جای ${esc(shortName(old.name))}</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
          <div class="search">${icon.search}<input type="search" placeholder="جست‌وجو" autocomplete="off" aria-label="جست‌وجوی غذا"></div>
          <div class="food-list"></div>`;
        const list = sb.querySelector('.food-list');
        const draw = () => {
          const n = norm(q);
          const hits = n ? s.foods.filter(f => !taken.has(f.id) && norm(f.name).includes(n)) : same;
          list.innerHTML = hits.length ? hits.map(f => `<button class="food-row" data-food="${f.id}"><span class="fname">${esc(f.name)}</span><span class="fmeta">${foodMeta(f)}</span></button>`).join('')
            : '<div class="empty">پیدا نشد</div>';
        };
        draw();
        sb.querySelector('input').addEventListener('input', e => { q = e.target.value; draw(); });
        sb.querySelector('[data-close]').onclick = () => sheet.close();
        list.addEventListener('click', e => {
          const b = e.target.closest('[data-food]');
          if (!b) return;
          const f = s.foods.find(x => x.id === b.dataset.food);
          sheet.close();
          locks.delete(old); auto.delete(old); shown.delete(old);
          chosen[i] = f;
          if (from) edited = true;
          drawPlate();
        });
      }, { tall: true });
    }

    drawBrowse();
  }, { tall: true, onClose: () => unsub?.() });
}

// The amount in the unit it is shown in (fitMeal works in the food's own unit): 'u', 'u2' or 'g'.
function unitView(f, it, shown) {
  const ms = [f.unit !== GRAM && 'u', hasUnit2(f) && 'u2', f.unit !== GRAM && hasGrams(f) && 'g'].filter(Boolean);
  const m = ms.includes(shown.get(f)) ? shown.get(f) : ms[0] || 'u';
  const gIn = m === 'g' ? 1 : m === 'u2' ? Number(f.grams2) : 1;
  const per = m === 'u' ? 1 : Number(f.grams) / gIn;
  const val = m === 'g' ? Math.round(it.qty * per) : Math.round(it.qty * per * 100) / 100;
  const step = m === 'g' ? (val >= 100 ? 25 : 10) : m === 'u2' ? 0.5 : it.step;
  return { ms, m, per, val, step, min: m === 'g' ? 5 : step, unit: m === 'g' ? GRAM : m === 'u2' ? f.unit2 : f.unit };
}
