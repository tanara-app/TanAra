/*
  The meal sheet of the rebuilt «امروز» (REDESIGN.md, step 2; beta `eat`). Opened from a meal card's «+»
  or «ثبت غذا». Nothing here calls Hooshvareh or costs anything (a photo goes through the log sheet).

  Home: a search (with the photo and barcode buttons inside it) and the packs of this meal as cards:
  their own (packs.js), and, while they have fewer than two, a few suggestions that suit their
  illnesses (combos they keep eating, then the app's starters; domain/combos.js). Typing shows the
  foods instead; a tap ticks one, several can be ticked, and «چقدر بخورم؟» goes to the amounts.
  A food their illness keeps out (planAvoid, health.js) has a dot; a tap on the dot says why and
  offers two foods of the same kind instead. A pack goes straight to the amounts.

  Amounts: the app gives each food's amount from what the meal has left (fitMeal). A tap on a food
  opens ready numbers under it (½، ۱، ۱٫۵، ۲، ۳, or grams); one tap sets it, and the others are fitted
  again around it. The bookmark keeps the foods as a pack (or updates the pack they came from).
*/
import * as store from '../data/store.js';
import { MEALS5, mealLabel, baseMeal, frequentFoods } from '../domain/stats.js';
import { meal5ForNow } from '../domain/meals.js';
import { GRAM } from '../data/seedFoods.js';
import { norm, esc, fa, qtyLabel } from '../lib/fa.js';
import { mealForNow, today } from '../lib/dates.js';
import { sheet, toast, confirmBox, choose, icon } from './dom.js';
import { amountLabel, hasGrams } from './units.js';
import { fitMeal, usualCombos, roleOf, packKey } from '../domain/portion.js';
import { mealCombos, shortName, libKey } from '../domain/combos.js';
import { COMBOS } from '../data/combos.js';
import { packs, savePack, askPackName, deletePack, hideKey, hidden } from './packs.js';
import { planAvoid } from '../ai/foodTags.js';
import { TAG_SAYS } from '../domain/health.js';
import { openLogSheet } from './logFood.js';
import { aiAvailable } from '../ai/hooshvareh.js';
import { cameraIcon } from './photo.js';
import { barcodeIcon } from './barcode.js';
import { cheer } from './mascot.js';

const SUGGEST = 3;        // suggested packs shown while they have fewer than two of their own
const RESULTS = 40;       // search results shown
const NUMS = [0.5, 1, 1.5, 2, 3];
const COUNTS = [1, 2, 3, 4, 5];   // a food counted whole (a walnut, a date)
const GRAMS = [50, 100, 150, 200, 300];

// the packs of a meal: their own (a snack's packs serve both snacks), then suggestions
function packsFor(day, meal) {
  const s = store.get();
  const byId = new Map(s.foods.map(f => [f.id, f]));
  const avoid = planAvoid();
  const own = packs().filter(p => baseMeal(p.meal) === baseMeal(meal))
    .map(p => ({ key: `p:${p.id}`, name: p.name, foods: p.ids.map(id => byId.get(id)).filter(Boolean), pack: p, own: true }))
    .filter(p => p.foods.length);
  if (own.length >= 2) return own;
  const sug = mealCombos({
    meal: baseMeal(meal), foods: s.foods, starters: COMBOS, hidden: hidden(), avoid,
    usual: usualCombos(s.entries, s.foods, day, baseMeal(meal), { limit: 12 }),
    dislikes: store.profile()?.planPrefs?.dislikes || '',
  }).filter(c => c.kind !== 'own' && !own.some(o => packKey(o.foods.map(f => f.id)) === packKey(c.ids)))
    .slice(0, SUGGEST).map(c => ({ ...c, sug: true }));
  return [...own, ...sug];
}

export function openEat({ day = today(), meal = null, budgetFor }) {
  let cur = meal || (day === today() ? meal5ForNow(mealForNow()) : 'lunch');
  let view = 'home';
  let query = '';
  let picked = [];          // the foods ticked (a typed-in one may have no id)
  let from = null;          // the pack the foods came from
  let edited = false;       // its foods changed since
  let why = null;           // the food whose «why» line is open
  let openRow = null;       // the food whose ready numbers are open
  const locks = new Map();  // food → amount set by a tap, in its own unit
  const grams = new Set();  // foods shown in grams
  let unsub = null;

  const left = () => Math.max(0, Math.round(budgetFor(cur).kcal));
  const avoidOf = () => planAvoid() || (() => null);
  const isPicked = f => picked.some(p => p === f || (p.id && p.id === f.id));

  sheet.open(body => {
    unsub = store.subscribe(() => { if (body.isConnected && view === 'plate') drawPlate(); });

    const pickMeal = async () => {
      const v = await choose('وعده', Object.entries(MEALS5).map(([value, label]) => ({ value, label })), cur);
      if (!v || v === cur) return;
      cur = v;
      view === 'plate' ? drawPlate() : drawHome();
    };

    /* ----- home: search and packs ----- */
    function drawHome() {
      view = 'home';
      body.innerHTML = `
        <div class="sheet-head">
          <button class="icon-btn" data-close aria-label="بستن">${icon.close}</button>
          <button type="button" class="eat-title" data-pick-meal aria-label="وعده‌ی دیگر"><h2>${mealLabel(cur)}</h2><small>${fa(left())} کالری</small></button>
          <span></span>
        </div>
        <label class="eat-search${query ? ' on' : ''}">
          ${icon.search}
          <input type="search" placeholder="جست‌وجو" value="${esc(query)}" autocomplete="off" aria-label="جست‌وجوی خوراکی">
          ${query ? `<button type="button" class="eat-sbtn" data-clear aria-label="پاک کردن">${icon.close}</button>` : `
          <button type="button" class="eat-sbtn" data-via="scan" aria-label="بارکد">${barcodeIcon}</button>
          ${aiAvailable() ? `<button type="button" class="eat-sbtn" data-via="photo" aria-label="عکس">${cameraIcon}</button>` : ''}`}
        </label>
        <div class="eat-main"></div>
        ${picked.length ? `<button type="button" class="eat-bar" data-amounts><b>چقدر بخورم؟</b><span>${picked.map(f => esc(shortName(f.name))).join('، ')}</span></button>` : ''}`;
      const input = body.querySelector('input');
      const main = body.querySelector('.eat-main');
      drawMain(main);
      input.addEventListener('input', () => {
        const had = !!query;
        query = input.value;
        // the clear button and the scan / photo buttons swap only when the search empties or fills
        if (had !== !!query) { drawHome(); const i = body.querySelector('input'); i.focus(); i.setSelectionRange(query.length, query.length); return; }
        drawMain(main);
      });
      body.querySelector('[data-close]').onclick = () => sheet.close();
      body.querySelector('[data-pick-meal]').onclick = pickMeal;
      body.querySelector('[data-clear]')?.addEventListener('click', () => { query = ''; why = null; drawHome(); });
      body.querySelector('[data-amounts]')?.addEventListener('click', drawPlate);
      body.querySelectorAll('[data-via]').forEach(b => b.onclick = e => {
        e.preventDefault();
        openLogSheet({ day, meal: cur, via: b.dataset.via, onPick: f => { tick(f, true); drawHome(); } });
      });
      main.addEventListener('click', onMain);
      bindHold(main);
    }

    function drawMain(main) {
      if (query) return drawResults(main);
      const list = packsFor(day, cur);
      const avoid = avoidOf();
      main.innerHTML = `
        <div class="eat-packs">
          ${list.map(c => `
            <button type="button" class="eat-pack${c.sug ? ' sug' : ''}" data-pack="${esc(c.key)}">
              <b>${esc(c.name)}${c.foods.some(f => f.id && avoid(f.id)) ? '<i class="sick-dot" aria-label="چیزی دارد که برای بیماری‌تان خوب نیست"></i>' : ''}</b>
              <small>${c.foods.map(f => esc(shortName(f.name))).join('، ')}</small>
            </button>`).join('')}
          <button type="button" class="eat-pack new" data-new-pack>${icon.plus}<span>بسته</span></button>
        </div>`;
    }

    function drawResults(main) {
      const s = store.get();
      const q = norm(query);
      const freq = new Map(frequentFoods(s.entries, s.foods, day, cur, 60).map((x, n) => [x.food.id, n]));
      // a word of the name starts with it («نان» finds «نان سنگک», not «یونانی»); anywhere only when nothing does
      const words = f => String(f.name).split(/[\s\u200c()\/،,-]+/).map(norm).filter(Boolean);
      const atStart = f => words(f).some(w => w.startsWith(q)) || norm(f.name).startsWith(q);
      let found = s.foods.filter(atStart);
      if (!found.length) found = s.foods.filter(f => norm(f.name).includes(q));
      const hits = found
        .sort((a, b) => (norm(a.name).indexOf(q) === 0 ? 0 : 1) - (norm(b.name).indexOf(q) === 0 ? 0 : 1)
          || (freq.get(a.id) ?? 999) - (freq.get(b.id) ?? 999) || a.name.localeCompare(b.name, 'fa'))
        .slice(0, RESULTS);
      const avoid = avoidOf();
      main.innerHTML = hits.length ? `<div class="eat-results">${hits.map(f => {
        const bad = avoid(f.id);
        const on = isPicked(f);
        return `<div class="eat-hit${on ? ' on' : ''}">
          <button type="button" class="eat-row" data-food="${f.id}" aria-pressed="${on}">
            <span class="eat-ck">${on ? icon.check : ''}</span>
            <span class="eat-tx"><b>${esc(f.name)}</b><small>${esc(f.unit)} · ${fa(Math.round(f.unit === GRAM ? f.kcal * 100 : f.kcal))} کالری${f.unit === GRAM ? ' در ۱۰۰ گرم' : ''}</small></span>
          </button>
          ${bad ? `<button type="button" class="eat-why" data-why="${f.id}" aria-label="چرا؟" aria-expanded="${why === f.id}"><i class="sick-dot"></i></button>` : ''}
          ${bad && why === f.id ? whyLine(f, bad) : ''}
        </div>`;
      }).join('')}</div>`
        : `<div class="empty"><button class="link" data-type-in>«${esc(query)}» را دستی بنویس</button></div>`;
    }

    // why a food is marked, and two of the same kind that are not
    function whyLine(f, tag) {
      const s = store.get();
      const avoid = avoidOf();
      const role = roleOf(f);
      const freq = new Map(frequentFoods(s.entries, s.foods, day, cur, 60).map((x, n) => [x.food.id, n]));
      const alts = s.foods.filter(x => x.id !== f.id && roleOf(x) === role && !avoid(x.id))
        .sort((a, b) => (freq.get(a.id) ?? 999) - (freq.get(b.id) ?? 999) || a.name.localeCompare(b.name, 'fa')).slice(0, 2);
      return `<div class="eat-whyline"><span>${esc(shortName(f.name))} ${TAG_SAYS[tag]}.</span>
        ${alts.map(a => `<button type="button" class="eat-alt" data-alt="${a.id}" data-for="${f.id}">${esc(shortName(a.name))}</button>`).join('')}</div>`;
    }

    function tick(f, on = !isPicked(f)) {
      if (!f) return;
      if (on && !isPicked(f)) picked.push(f);
      if (!on) picked = picked.filter(p => !(p === f || (p.id && p.id === f.id)));
      if (from) edited = true;
    }

    function onMain(e) {
      const s = store.get();
      if (held) return;
      const alt = e.target.closest('[data-alt]');
      if (alt) {
        tick(s.foods.find(x => x.id === alt.dataset.for), false);
        tick(s.foods.find(x => x.id === alt.dataset.alt), true);
        why = null;
        return drawHome();
      }
      const w = e.target.closest('[data-why]');
      if (w) { why = why === w.dataset.why ? null : w.dataset.why; return drawResults(body.querySelector('.eat-main')); }
      const r = e.target.closest('[data-food]');
      if (r) { tick(s.foods.find(x => x.id === r.dataset.food)); return drawHome(); }
      const p = e.target.closest('[data-pack]');
      if (p) {
        const c = packsFor(day, cur).find(x => x.key === p.dataset.pack);
        if (!c) return;
        picked = [...c.foods]; from = c; edited = false;
        locks.clear(); grams.clear(); openRow = null;
        return drawPlate();
      }
      if (e.target.closest('[data-new-pack]')) { from = null; const i = body.querySelector('input'); i.focus(); return; }
      if (e.target.closest('[data-type-in]')) openLogSheet({ day, meal: cur, via: 'custom', query, onPick: f => { tick(f, true); drawHome(); } });
    }

    // holding a pack: their own is renamed or deleted, a suggestion is turned down
    let held = false;
    function bindHold(main) {
      let timer = null;
      main.addEventListener('pointerdown', e => {
        const b = e.target.closest('[data-pack]');
        if (!b) return;
        held = false;
        timer = setTimeout(() => { held = true; packMenu(b.dataset.pack); }, 500);
      });
      const stop = () => clearTimeout(timer);
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => main.addEventListener(t, stop));
      main.addEventListener('contextmenu', e => { if (e.target.closest('[data-pack]')) e.preventDefault(); });
      main.addEventListener('click', () => setTimeout(() => { held = false; }, 0), true);
    }
    async function packMenu(key) {
      const c = packsFor(day, cur).find(x => x.key === key);
      if (!c) return;
      if (c.own) {
        const v = await choose(c.name, [{ value: 'rename', label: 'تغییر اسم' }, { value: 'del', label: 'حذف بسته' }], null);
        if (v === 'rename') { const name = await askPackName(c.name); if (name) savePack({ ...c.pack, name }); }
        if (v === 'del' && await confirmBox(`بسته‌ی «${esc(c.name)}» حذف شود؟`, 'حذف')) deletePack(c.pack.id);
      } else {
        const v = await choose(c.name, [{ value: 'hide', label: 'پیشنهاد نکن' }], null);
        if (v === 'hide') hideKey(c.kind === 'starter' ? libKey(c.lib.id) : packKey(c.ids));
      }
      if (view === 'home') drawHome();
    }

    /* ----- amounts ----- */
    function drawPlate() {
      view = 'plate';
      picked = picked.map(c => (c.id && store.get().foods.find(f => f.id === c.id)) || c);
      for (const k of [...locks.keys()]) if (!picked.includes(k)) locks.delete(k);
      if (!picked.length) { from = null; return drawHome(); }
      const budget = left();
      const r = fitMeal(picked, budget, Object.fromEntries(picked.map((f, i) => [i, locks.get(f)]).filter(([, q]) => q != null)));
      const avoid = avoidOf();
      const ids = [...new Set(picked.map(f => f.id).filter(Boolean))];
      const own = from?.own;
      const canKeep = ids.length >= 2 && (!own || edited);
      body.innerHTML = `
        <div class="sheet-head">
          <button class="icon-btn" data-back aria-label="برگشت">${icon.chevR}</button>
          <button type="button" class="eat-title" data-pick-meal aria-label="وعده‌ی دیگر"><h2>${mealLabel(cur)}</h2>${from ? `<small>${esc(from.name)}</small>` : ''}</button>
          ${ids.length >= 2 ? `<button class="icon-btn" data-keep ${canKeep ? '' : 'disabled'} aria-label="${own ? 'به‌روز کردن بسته' : 'ذخیره به‌عنوان بسته'}">${own ? icon.bookmarkOn : icon.bookmark}</button>` : '<span></span>'}
        </div>
        <div class="eat-plate">${picked.map((f, i) => {
          const it = r.items[i];
          const g = grams.has(f) && f.unit !== GRAM && hasGrams(f);
          const shownQty = g ? Math.round(it.qty * Number(f.grams)) : it.qty;
          const unit = g ? GRAM : f.unit;
          const isOpen = openRow === f;
          const nums = g || f.unit === GRAM ? GRAMS : it.step === 1 ? COUNTS : NUMS;
          const bad = f.id && avoid(f.id);
          return `<div class="eat-item${isOpen ? ' open' : ''}">
            <div class="eat-itop">
              <button type="button" class="eat-iname" data-row="${i}" aria-expanded="${isOpen}">
                <b>${esc(shortName(f.name))}${bad ? '<i class="sick-dot"></i>' : ''}</b><small>${it.free ? 'کالری ندارد' : `${fa(Math.round(it.kcal))} کالری`}</small>
              </button>
              <button type="button" class="eat-amt" data-row="${i}">${unit === GRAM ? fa(shownQty) : qtyLabel(shownQty)} <small>${esc(unit)}</small></button>
              <button type="button" class="eat-x" data-drop="${i}" aria-label="برداشتن ${esc(f.name)}">${icon.close}</button>
            </div>
            ${isOpen ? `<div class="eat-nums">${nums.map(n => `<button type="button" class="eat-n${Math.abs(n - shownQty) < 1e-6 ? ' on' : ''}" data-set="${i}" data-n="${n}">${unit === GRAM ? fa(n) : qtyLabel(n)}</button>`).join('')}
              ${f.unit !== GRAM && hasGrams(f) ? `<button type="button" class="eat-n g${g ? ' on' : ''}" data-grams="${i}">${g ? esc(f.unit) : 'گرم'}</button>` : ''}</div>` : ''}
          </div>`;
        }).join('')}</div>
        <div class="eat-total"><span><b>${fa(Math.round(r.total))}</b>${budget ? ` از ${fa(budget)}` : ''} کالری · <b>${fa(Math.round(r.protein))}</b> گرم پروتئین</span>
          ${locks.size ? `<button type="button" class="icon-btn sm" data-reset aria-label="مقدارهای پیشنهادی">${icon.undo}</button>` : ''}</div>
        ${r.over ? `<p class="small warn-text eat-over">${fa(r.over)} کالری بیشتر${r.drop != null && picked.length > 1 ? `؛ بدون «${esc(shortName(picked[r.drop].name))}» جا می‌شود` : ''}</p>` : ''}
        <button type="button" class="eat-more" data-more>${icon.plus} خوراکی دیگر</button>
        <div class="eat-savebar"><button class="btn primary block big" data-save>${picked.length > 1 ? `ثبت ${fa(picked.length)} مورد` : 'ثبت'}</button></div>`;

      body.querySelector('[data-back]').onclick = drawHome;
      body.querySelector('[data-pick-meal]').onclick = pickMeal;
      body.querySelector('[data-more]').onclick = () => { query = ''; drawHome(); body.querySelector('input').focus(); };
      body.querySelector('[data-reset]')?.addEventListener('click', () => { locks.clear(); drawPlate(); });
      body.querySelector('[data-keep]')?.addEventListener('click', keep);
      body.querySelectorAll('[data-row]').forEach(b => b.onclick = () => { const f = picked[Number(b.dataset.row)]; openRow = openRow === f ? null : f; drawPlate(); });
      body.querySelectorAll('[data-drop]').forEach(b => b.onclick = () => { picked.splice(Number(b.dataset.drop), 1); if (from) edited = true; drawPlate(); });
      body.querySelectorAll('[data-set]').forEach(b => b.onclick = () => {
        const f = picked[Number(b.dataset.set)];
        const n = Number(b.dataset.n);
        locks.set(f, grams.has(f) && f.unit !== GRAM ? n / Number(f.grams) : n);
        drawPlate();
      });
      body.querySelectorAll('[data-grams]').forEach(b => b.onclick = () => {
        const f = picked[Number(b.dataset.grams)];
        grams.has(f) ? grams.delete(f) : grams.add(f);
        drawPlate();
      });
      body.querySelector('[data-save]').onclick = () => {
        picked.forEach((f, i) => {
          const it = r.items[i];
          const g = grams.has(f) && f.unit !== GRAM && hasGrams(f);
          store.saveEntry({ day, meal: cur, food_id: f.id || null, name: f.name, unit: g ? GRAM : f.unit, qty: g ? Math.round(it.qty * Number(f.grams)) : it.qty, kcal: it.kcal, protein: it.protein, is_veg: !!f.is_veg });
        });
        cheer('entry');
        const n = picked.length;
        const name = from && !edited ? from.name : null;
        const first = picked[0].name;
        sheet.close();
        toast(name ? `${name} ثبت شد` : n > 1 ? `${fa(n)} مورد ثبت شد` : `${first} ثبت شد`);
      };
    }

    async function keep() {
      const ids = [...new Set(picked.map(f => f.id).filter(Boolean))];
      if (from?.own) {
        const p = savePack({ ...from.pack, ids });
        from = { ...from, pack: p };
        edited = false;
        toast('بسته به‌روز شد');
        return drawPlate();
      }
      const name = await askPackName(from?.name || '');
      if (!name) return;
      const p = savePack({ name, meal: cur, ids, from: from?.kind === 'starter' ? from.lib.id : null });
      from = { key: `p:${p.id}`, name, pack: p, own: true };
      edited = false;
      toast('بسته ذخیره شد');
      drawPlate();
    }

    drawHome();
  }, { tall: true, onClose: () => unsub?.() });
}
