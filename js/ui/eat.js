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
import { MEALS5, mealLabel, baseMeal, frequentFoods, lastAmountFor } from '../domain/stats.js';
import { meal5ForNow } from '../domain/meals.js';
import { GRAM } from '../data/seedFoods.js';
import { norm, esc, fa, qtyLabel, parseNum } from '../lib/fa.js';
import { mealForNow, today } from '../lib/dates.js';
import { sheet, toast, confirmBox, choose, icon } from './dom.js';
import { amountLabel, hasGrams, hasUnit2 } from './units.js';
import { fitMeal, usualCombos, roleOf, packKey } from '../domain/portion.js';
import { mealCombos, shortName, libKey, freeFoods } from '../domain/combos.js';
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
// the unit each food was last shown in (a tap on the unit), so it comes back that way: { food id: 'u' | 'u2' | 'g' }
const UNIT_KEY = 'unit_pref';
const unitPrefs = () => store.note(UNIT_KEY)?.data || {};

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

// `start`: foods to begin with (a free food tapped on a meal card); the sheet opens on their amounts
export function openEat({ day = today(), meal = null, budgetFor, start = null }) {
  let cur = meal || (day === today() ? meal5ForNow(mealForNow()) : 'lunch');
  // a fasting day has only سحری, افطار and شام: the one for this hour
  const dayMeals = budgetFor(cur).meals;
  if (dayMeals && !dayMeals[cur]) { const h = new Date().getHours(); cur = h < 12 ? 'breakfast' : h < 20 ? 'snack2' : 'dinner'; }
  let view_ = 'home';
  let query = '';
  let picked = [];          // the foods ticked (a typed-in one may have no id)
  let from = null;          // the pack the foods came from
  let edited = false;       // its foods changed since
  let why = null;           // the food whose «why» line is open
  let openRow = null;       // the food whose ready numbers are open
  let editing = false;      // the pencil: amounts can be changed and foods taken off
  let making = false;       // «+ بسته»: the foods ticked become a new pack instead of a meal
  const locks = new Map();  // food → amount set by a tap, in its own unit
  const shown = new Map();  // food → the unit it is shown in now: 'u', 'u2' or 'g'
  let unsub = null;

  const left = () => Math.max(0, Math.round(budgetFor(cur).kcal));
  // the meal's name as the today screen calls it (سحری and افطار on a fasting day)
  const labelOf = m => budgetFor(m).label || mealLabel(m);
  const avoidOf = () => planAvoid() || (() => null);
  const isPicked = f => picked.some(p => p === f || (p.id && p.id === f.id));

  sheet.open(body => {
    unsub = store.subscribe(() => { if (body.isConnected && view_ === 'plate') drawPlate(); });

    const pickMeal = async () => {
      const v = await choose('وعده', Object.entries(budgetFor(cur).meals || MEALS5).map(([value, label]) => ({ value, label })), cur);
      if (!v || v === cur) return;
      cur = v;
      view_ === 'plate' ? drawPlate() : drawHome();
    };

    /* ----- home: search and packs ----- */
    function drawHome() {
      view_ = 'home';
      body.innerHTML = `
        <div class="sheet-head">
          <button class="icon-btn" data-close aria-label="بستن">${icon.close}</button>
          <button type="button" class="eat-title" data-pick-meal aria-label="وعده‌ی دیگر"><h2>${labelOf(cur)}</h2><small>${fa(left())} کالری</small></button>
          <span></span>
        </div>
        <label class="eat-search${query ? ' on' : ''}">
          ${icon.search}
          <input type="search" placeholder="${making ? 'خوراکی‌های بسته' : 'جست‌وجو'}" value="${esc(query)}" autocomplete="off" aria-label="جست‌وجوی خوراکی">
          ${query ? `<button type="button" class="eat-sbtn" data-clear aria-label="پاک کردن">${icon.close}</button>` : `
          <button type="button" class="eat-sbtn" data-via="scan" aria-label="بارکد">${barcodeIcon}</button>
          ${aiAvailable() ? `<button type="button" class="eat-sbtn" data-via="photo" aria-label="عکس">${cameraIcon}</button>` : ''}`}
        </label>
        <div class="eat-main"></div>
        ${picked.length ? `<button type="button" class="eat-bar${making ? ' making' : ''}" ${making ? 'data-make' : 'data-amounts'} ${making && packable().length < 2 ? 'disabled' : ''}>
          ${making ? `${icon.bookmark}<b>ذخیره‌ی بسته</b>` : '<b>چقدر بخورم؟</b>'}<span>${picked.map(f => esc(shortName(f.name))).join('، ')}</span></button>` : ''}`;
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
      body.querySelector('[data-make]')?.addEventListener('click', makePack);
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
      // «هر وقت گرسنه شدی»: free to eat, whatever is left of the meal
      const free = freeFoods(store.get().foods, store.get().entries, day, cur, { avoid: planAvoid() });
      main.innerHTML = `
        <div class="eat-packs">
          ${list.map(c => `
            <button type="button" class="eat-pack${c.sug ? ' sug' : ''}" data-pack="${esc(c.key)}">
              <b>${esc(c.name)}${c.foods.some(f => f.id && avoid(f.id)) ? '<i class="sick-dot" aria-label="چیزی دارد که برای بیماری‌تان خوب نیست"></i>' : ''}</b>
              <small>${c.foods.map(f => esc(shortName(f.name))).join('، ')}</small>
            </button>`).join('')}
          <button type="button" class="eat-pack new" data-new-pack>${icon.plus}<span>بسته</span></button>
        </div>
        ${free.length ? `<p class="eat-lh">${icon.leaf}<span>آزاد</span></p>
        <div class="eat-free">${free.map(f => `<button type="button" class="eat-chip${isPicked(f) ? ' on' : ''}" data-food="${f.id}" aria-pressed="${isPicked(f)}">${isPicked(f) ? icon.check : icon.leaf}<span>${esc(shortName(f.name))}</span></button>`).join('')}</div>` : ''}`;
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
        locks.clear(); shown.clear(); openRow = null; editing = false;
        return drawPlate();
      }
      // «+ بسته»: tick two or more foods (search or the free ones), then «ذخیره‌ی بسته» names it
      if (e.target.closest('[data-new-pack]')) { making = true; from = null; drawHome(); body.querySelector('input').focus(); return; }
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
      if (view_ === 'home') drawHome();
    }

    /* ----- amounts: the app's answer first; the pencil to change it ----- */
    // the units a food can be shown in, in the order a tap goes through them: its own, grams, its second one
    // («۱ کفگیر» → «۱۲۰ گرم» → …); the second unit only when half-steps of it can say the same amount
    // closely (½ بشقاب for one کفگیر of rice would be a quarter more)
    const u2Close = (f, qty) => {
      if (!hasUnit2(f) || !(qty > 0)) return false;
      const exact = qty * Number(f.grams) / Number(f.grams2);
      const q = Math.max(0.5, Math.round(exact * 2) / 2);
      return Math.abs(q - exact) / exact <= 0.1;
    };
    const modesOf = (f, qty = null) => ['u', f.unit !== GRAM && hasGrams(f) && 'g', (qty == null ? hasUnit2(f) : u2Close(f, qty)) && 'u2'].filter(Boolean);
    const modeOf = (f, qty) => {
      const ms = modesOf(f, qty);
      if (shown.has(f) && ms.includes(shown.get(f))) return shown.get(f);
      const pref = f.id && unitPrefs()[f.id];
      if (pref && ms.includes(pref)) return pref;
      // never chosen: the way they logged it last time
      const last = f.id && store.get().entries.some(e => e.food_id === f.id) ? lastAmountFor(store.get().entries, f, cur) : null;
      const m = last?.grams ? 'g' : last?.unit2 ? 'u2' : 'u';
      return ms.includes(m) ? m : 'u';
    };
    // the amount as shown, rounded to what can be measured in that unit, and in the food's own units
    const view = (f, it) => {
      const m = modeOf(f, it.qty);
      const g = Number(f.grams);
      let q = it.qty, units = it.qty, unit = f.unit;
      // the app's amount rounds to what can be measured; one they typed stays as they typed it
      const exact = locks.has(f);
      if (m === 'g') { q = exact ? Math.round(it.qty * g) : Math.max(5, Math.round(it.qty * g / 5) * 5); units = q / g; unit = GRAM; }
      if (m === 'u2') { const x = it.qty * g / Number(f.grams2); q = exact ? Math.round(x * 100) / 100 : Math.max(0.5, Math.round(x * 2) / 2); units = q * Number(f.grams2) / g; unit = f.unit2; }
      const nums = m === 'g' || f.unit === GRAM ? GRAMS : m === 'u' && it.step === 1 ? COUNTS : NUMS;
      const toUnits = n => (m === 'g' ? n / g : m === 'u2' ? n * Number(f.grams2) / g : n);
      return { m, q, unit, units, nums, toUnits, kcal: units * (Number(f.kcal) || 0), protein: units * (Number(f.protein) || 0) };
    };
    const amountText = (q, unit) => (unit === GRAM ? fa(q) : qtyLabel(q));

    function drawPlate() {
      view_ = 'plate';
      picked = picked.map(c => (c.id && store.get().foods.find(f => f.id === c.id)) || c);
      for (const k of [...locks.keys()]) if (!picked.includes(k)) locks.delete(k);
      if (!picked.length) { from = null; editing = false; return drawHome(); }
      const b = budgetFor(cur);
      const budget = Math.max(0, Math.round(b.kcal));
      const r = fitMeal(picked, budget, Object.fromEntries(picked.map((f, i) => [i, locks.get(f)]).filter(([, q]) => q != null)), { proteinMax: b.proteinMax ?? null });
      const views = picked.map((f, i) => view(f, r.items[i]));
      const total = views.reduce((t, v) => t + v.kcal, 0);
      const protein = views.reduce((t, v) => t + v.protein, 0);
      const avoid = avoidOf();
      const ids = [...new Set(picked.map(f => f.id).filter(Boolean))];
      const own = from?.own;
      const canKeep = ids.length >= 2 && (!own || edited);
      body.innerHTML = `
        <div class="sheet-head">
          <button class="icon-btn" data-back aria-label="برگشت">${icon.chevR}</button>
          <button type="button" class="eat-title" data-pick-meal aria-label="وعده‌ی دیگر"><h2>${labelOf(cur)}</h2>${from ? `<small>${esc(from.name)}</small>` : ''}</button>
          ${ids.length >= 2 ? `<button class="icon-btn" data-keep ${canKeep ? '' : 'disabled'} aria-label="${own ? 'به‌روز کردن بسته' : 'ذخیره به‌عنوان بسته'}">${own ? icon.bookmarkOn : icon.bookmark}</button>` : '<span></span>'}
        </div>
        <div class="eat-answer${editing ? ' editing' : ''}">${picked.map((f, i) => {
          const it = r.items[i];
          const v = views[i];
          const bad = f.id && avoid(f.id);
          const more = modesOf(f, it.qty).length > 1;
          const isOpen = editing && openRow === f;
          return `<div class="eat-line${locks.has(f) ? ' hand' : ''}${isOpen ? ' open' : ''}">
            <div class="eat-ltop">
              ${editing ? `<button type="button" class="eat-x" data-drop="${i}" aria-label="برداشتن ${esc(f.name)}">${icon.close}</button>` : ''}
              <div class="eat-lname"><b>${esc(shortName(f.name))}${bad ? '<i class="sick-dot"></i>' : ''}</b><small>${it.free ? 'کالری ندارد' : `${fa(Math.round(v.kcal))} کالری`}</small></div>
              <button type="button" class="eat-q" ${editing ? `data-row="${i}" aria-expanded="${isOpen}"` : more ? `data-unit="${i}" aria-label="${esc(amountLabel(v.q, v.unit))}، واحد دیگر"` : 'disabled'}>
                <b>${amountText(v.q, v.unit)}</b><small>${esc(v.unit)}${!editing && more ? icon.swap : ''}</small>
              </button>
            </div>
            ${isOpen ? `<div class="eat-nums">${v.nums.map(n => `<button type="button" class="eat-n${Math.abs(n - v.q) < 1e-6 ? ' on' : ''}" data-set="${i}" data-n="${n}">${amountText(n, v.unit)}</button>`).join('')}
              <input class="eat-n eat-type${v.nums.some(n => Math.abs(n - v.q) < 1e-6) ? '' : ' on'}" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" data-type="${i}" value="${v.nums.some(n => Math.abs(n - v.q) < 1e-6) ? '' : amountText(v.q, v.unit)}" placeholder="…" aria-label="مقدار دلخواه به ${esc(v.unit)}">
              ${more ? `<button type="button" class="eat-n g" data-unit="${i}">${icon.swap}</button>` : ''}</div>` : ''}
          </div>`;
        }).join('')}</div>
        <div class="eat-total"><span><b>${fa(Math.round(total))}</b>${budget ? ` از ${fa(budget)}` : ''} کالری · <b>${fa(Math.round(protein))}</b> گرم پروتئین</span>
          ${editing && locks.size ? `<button type="button" class="icon-btn sm" data-reset aria-label="مقدارهای اپ">${icon.undo}</button>` : ''}</div>
        ${r.over ? `<p class="small warn-text eat-over">${fa(r.over)} کالری بیشتر${r.drop != null && picked.length > 1 ? `؛ بدون «${esc(shortName(picked[r.drop].name))}» جا می‌شود` : ''}</p>` : ''}
        ${editing ? `<button type="button" class="eat-more" data-more>${icon.plus} خوراکی دیگر</button>` : ''}
        <div class="eat-savebar">
          <button class="btn primary big grow" data-save>${picked.length > 1 ? `ثبت ${fa(picked.length)} مورد` : 'ثبت'}</button>
          <button type="button" class="eat-edit${editing ? ' on' : ''}" data-edit aria-label="${editing ? 'تمام' : 'تغییر مقدارها'}" aria-pressed="${editing}">${editing ? icon.check : icon.edit}</button>
        </div>`;

      body.querySelector('[data-back]').onclick = () => { editing = false; drawHome(); };
      body.querySelector('[data-pick-meal]').onclick = pickMeal;
      body.querySelector('[data-edit]').onclick = () => { editing = !editing; openRow = null; drawPlate(); };
      body.querySelector('[data-more]')?.addEventListener('click', () => { query = ''; editing = false; drawHome(); body.querySelector('input').focus(); });
      body.querySelector('[data-reset]')?.addEventListener('click', () => { locks.clear(); drawPlate(); });
      body.querySelector('[data-keep]')?.addEventListener('click', keep);
      body.querySelectorAll('[data-row]').forEach(x => x.onclick = () => { const f = picked[Number(x.dataset.row)]; openRow = openRow === f ? null : f; drawPlate(); });
      // another unit: only how it is shown (and remembered for this food), never the amount
      body.querySelectorAll('[data-unit]').forEach(x => x.onclick = () => {
        const i = Number(x.dataset.unit);
        const f = picked[i];
        const qty = r.items[i].qty;
        const ms = modesOf(f, qty);
        const next = ms[(ms.indexOf(modeOf(f, qty)) + 1) % ms.length];
        shown.set(f, next);
        if (f.id) store.saveNote({ key: UNIT_KEY, kind: UNIT_KEY, data: { ...unitPrefs(), [f.id]: next } });
        drawPlate();
      });
      body.querySelectorAll('[data-drop]').forEach(x => x.onclick = () => { picked.splice(Number(x.dataset.drop), 1); if (from) edited = true; drawPlate(); });
      body.querySelectorAll('[data-set]').forEach(x => x.onclick = () => {
        const i = Number(x.dataset.set);
        locks.set(picked[i], views[i].toUnits(Number(x.dataset.n)));
        drawPlate();
      });
      // any amount, in the unit shown (Persian digits and «٫» are fine); nothing happens on a blank or a 0
      body.querySelectorAll('[data-type]').forEach(x => {
        const apply = () => {
          const i = Number(x.dataset.type);
          const n = parseNum(x.value);
          const most = views[i].unit === GRAM ? 3000 : 50;
          if (!(n > 0) || n > most || Math.abs(n - views[i].q) < 1e-6) return;
          locks.set(picked[i], views[i].toUnits(n));
          drawPlate();
        };
        x.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
        x.addEventListener('change', apply);
      });
      body.querySelector('[data-save]').onclick = () => {
        picked.forEach((f, i) => {
          const v = views[i];
          store.saveEntry({ day, meal: cur, food_id: f.id || null, name: f.name, unit: v.unit, qty: v.q, kcal: v.kcal, protein: v.protein, is_veg: !!f.is_veg });
        });
        cheer('entry');
        const n = picked.length;
        const name = from && !edited ? from.name : null;
        const first = picked[0].name;
        sheet.close();
        toast(name ? `${name} ثبت شد` : n > 1 ? `${fa(n)} مورد ثبت شد` : `${first} ثبت شد`);
      };
    }

    // a pack holds foods of the bank only (one typed in has no id)
    const packable = () => [...new Set(picked.map(f => f.id).filter(Boolean))];
    async function makePack() {
      const ids = packable();
      if (ids.length < 2) return;
      const name = await askPackName('');
      if (!name) return;
      savePack({ name, meal: cur, ids });
      making = false; picked = []; query = ''; why = null;
      toast('بسته ذخیره شد');
      drawHome();
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

    if (start?.length) { picked = [...start]; drawPlate(); } else drawHome();
  }, { tall: true, onClose: () => unsub?.() });
}
