/*
  Diet-plan mode on the Today screen: Hooshvareh's two-week plan as a list of options per
  eating occasion. Ticking an option logs its foods as ordinary entries (and unticking
  removes them), so the calorie-counting mode always shows the same day.
*/
import * as store from '../data/store.js';
import { effectiveTargets, hasMedicalFlag } from '../domain/targets.js';
import {
  SLOTS, PLAN_DAYS, budgets, buildPlan, fitOption, optionBudget, planOn, planEnd, planDayNo, planOver,
  picksOn, dayAdherence, newFoods, optionText,
  swapItem, restoreItem, sameItems, swapSuggestions, swapsOn, dayPlan, offOn, slotExtras, dayRooms, roomPlan,
} from '../domain/plan.js';
import { ask, aiAvailable, md, sparkle } from '../ai/hooshvareh.js';
import { fa, esc, norm } from '../lib/fa.js';
import { today, diffDays, relLabel } from '../lib/dates.js';
import { amountLabel } from './units.js';
import { icon, sheet, toast, confirmBox } from './dom.js';
import { openLogSheet, openEntrySheet } from './logFood.js';
import { shopList, neededFoods } from '../domain/shopping.js';
import { addToShopping } from './shopping.js';

let busy = false;        // a plan is being made
const busySlots = new Set(); // slots waiting for one more option
const opened = new Set();    // «day|option id»: options unfolded to show their foods
const shown = new Set();     // «day|slot»: slots showing the options that folded away once the choice was made
let refresh = () => {};

const notes = () => store.get().ai_notes;
const pickWord = n => (n === 2 ? 'دو تا را انتخاب کن' : 'یکی را انتخاب کن');
const head = (title, extra = '') => `<div class="ai-card-h"><span class="ai-mark">${sparkle(16)}</span><b>${title}</b>${extra}</div>`;

/* ---------------- making a plan ---------------- */

/*
  Asks Hooshvareh for a plan starting today. `days` is the full two weeks for a new period,
  or what is left of the current one when the plan is only being refreshed (new foods), so
  the period — and the weigh-in at its end — stays where it was.
*/
async function generate({ days = PLAN_DAYS, include = [] } = {}) {
  if (busy) return;
  busy = true; refresh();
  try {
    const t = effectiveTargets(store.profile());
    const input = { kcal: t.kcal, protein: t.protein, budgets: budgets(t.kcal), days, include: include.map(f => f.name) };
    let plan = null, raw = null;
    // the amounts are fitted here; if too few options survive, one more try is worth it
    for (let i = 0; i < 2 && !plan; i++) {
      raw = await ask('plan', input);
      plan = buildPlan(raw, store.get().foods, t.kcal, today());
    }
    if (!plan) throw new Error('برنامه کامل درنیامد؛ دوباره امتحان کن.');
    plan.days = days;
    store.saveNote({ key: `plan:${plan.start}`, kind: 'plan', text: String(raw.note || ''), data: plan });
    toast('رژیمت آماده شد');
  } catch (e) {
    toast(e.message);
  } finally {
    busy = false; refresh();
  }
}

// Likes and limits, asked once before the first plan and editable before every new one.
function openPrefs(onGo) {
  const p = store.profile();
  const d = p.planPrefs || {};
  sheet.open(body => {
    body.innerHTML = `
      <div class="sheet-head"><h2>قبل از چیدن رژیم</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <form class="stack" novalidate>
        <p class="muted small">هوشواره برنامه را از غذاهای بانک غذای خودت می‌چیند: برای هر وعده چند گزینه با مقدار مشخص. هر چیزی که این‌جا بنویسی در نظر می‌گیرد.</p>
        <label class="field"><span>چه چیزهایی نمی‌خوری یا دوست نداری؟ <em>اختیاری</em></span><textarea name="dislikes" rows="2" placeholder="مثلاً ماهی، بادمجان، شیر">${esc(d.dislikes || '')}</textarea></label>
        <label class="field"><span>حساسیت غذایی <em>اختیاری</em></span><input name="allergies" value="${esc(d.allergies || '')}" placeholder="مثلاً گردو، لاکتوز"></label>
        <label class="field"><span>هر چیز دیگری که باید بداند <em>اختیاری</em></span><textarea name="notes" rows="2" placeholder="مثلاً ناهار سر کارم، صبح‌ها وقت آشپزی ندارم، گیاه‌خوارم">${esc(d.notes || '')}</textarea></label>
        ${hasMedicalFlag(p) ? '<p class="note doctor small">چون بیماری یا دارو ثبت کرده‌ای، این برنامه را قبل از شروع به پزشک یا متخصص تغذیه‌ات نشان بده.</p>' : ''}
        <button class="btn primary block big">${sparkle()} رژیمم را بچین</button>
      </form>`;
    body.querySelector('[data-close]').onclick = () => sheet.close();
    body.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const F = e.target.elements;
      const next = { dislikes: F.dislikes.value.trim(), allergies: F.allergies.value.trim(), notes: F.notes.value.trim() };
      if (JSON.stringify(next) !== JSON.stringify({ dislikes: d.dislikes || '', allergies: d.allergies || '', notes: d.notes || '' })) {
        store.saveProfile({ ...store.profile(), planPrefs: next });
      }
      sheet.close();
      onGo();
    };
  }, { tall: true });
}

/*
  One more option for an occasion. With `fit` ({ day, kcal }) it is sized to what off-plan food
  left of that occasion and kept with that day only; otherwise it joins the plan.
*/
async function oneMore(plan, key, fit = null) {
  if (busySlots.has(key)) return;
  busySlots.add(key); refresh();
  try {
    const slot = plan.slots[key];
    const budget = fit ? fit.kcal : optionBudget(plan, key);
    const raw = await ask('plan_option', { slot: SLOTS[key].label, kcal: Math.round(budget), existing: slot.options.map(optionText) });
    const opt = fitOption(raw, new Map(store.get().foods.map(f => [f.id, f])), budget, `${key}-x${Date.now().toString(36)}`);
    if (!opt) throw new Error('گزینه‌ی مناسبی پیدا نشد؛ دوباره امتحان کن.');
    if (fit) {
      const s = store.get();
      savePicks(fit.day, picksOn(s.ai_notes, s.entries, fit.day), { ...swapsOn(s.ai_notes, fit.day), [opt.id]: { ...opt, slot: key } });
      return;
    }
    // re-read: the plan may have changed while waiting
    const cur = notes().find(n => n.key === plan.key);
    if (!cur) return;
    const data = structuredClone(cur.data);
    data.slots[key].options.push(opt);
    store.saveNote({ key: cur.key, kind: 'plan', text: cur.text, data });
  } catch (e) {
    toast(e.message);
  } finally {
    busySlots.delete(key); refresh();
  }
}

/* ---------------- ticking options ---------------- */

function savePicks(day, picks, swaps = swapsOn(notes(), day), off = offOn(notes(), day)) {
  const alive = new Set(store.get().entries.map(e => e.id));
  off = Object.fromEntries(Object.entries(off).filter(([id]) => alive.has(id)));
  store.saveNote({ key: `pick:${day}`, kind: 'pick', text: '', data: { slots: picks, ...(Object.keys(swaps).length ? { swaps } : {}), ...(Object.keys(off).length ? { off } : {}) } });
}

// Remembers which occasion's «+» logged an off-plan entry, so it counts against that one.
function placeExtra(day, key, entry) {
  if (entry.meal !== SLOTS[key].meal) return;
  const s = store.get();
  savePicks(day, picksOn(s.ai_notes, s.entries, day), undefined, { ...offOn(s.ai_notes, day), [entry.id]: key });
}

const entryOf = (day, key, i) => ({
  day, meal: SLOTS[key].meal, food_id: i.food_id, name: i.name, unit: i.unit, qty: i.qty, kcal: i.kcal, protein: i.protein, is_veg: i.is_veg,
});

/*
  A day as the plan screen shows it: the plan in force with that day's own versions of options,
  and — where off-plan food took part of an occasion, or went over an earlier one — the options
  cut down to what is left.
  Null when no plan covers the day.
*/
function dayView(day) {
  const s = store.get();
  const picks = picksOn(s.ai_notes, s.entries, day);
  const ticked = new Set(Object.values(picks).flatMap(l => l.map(p => p.o)));
  // a cut-down version is only kept while it is ticked
  const swaps = Object.fromEntries(Object.entries(swapsOn(s.ai_notes, day)).map(([id, o]) => [id, o.fit && !ticked.has(id) ? o.base : o]).filter(([, o]) => o));
  const base = dayPlan(planOn(s.ai_notes, day), swaps);
  if (!base) return null;
  const extras = slotExtras(s.entries, picks, offOn(s.ai_notes, day), day);
  const rooms = dayRooms(base, picks, extras, s.entries);
  return { plan: roomPlan(base, picks, rooms, new Map(s.foods.map(f => [f.id, f]))), picks, extras, rooms };
}

function toggle(day, key, optId) {
  const s = store.get();
  const v = dayView(day);
  if (!v) return;
  const { plan, picks } = v;
  const swaps = { ...swapsOn(s.ai_notes, day) };
  const cur = picks[key] || [];
  const had = cur.find(p => p.o === optId);
  const remove = p => p.e.forEach(id => { if (s.entries.some(e => e.id === id)) store.deleteEntry(id); });
  // unticked, a cut-down option goes back to what it was
  const unfit = id => { if (swaps[id]?.fit) { if (swaps[id].base) swaps[id] = swaps[id].base; else delete swaps[id]; } };
  if (had) {
    remove(had);
    unfit(optId);
    picks[key] = cur.filter(p => p !== had);
  } else {
    const opt = plan.slots[key].options.find(o => o.id === optId);
    if (!opt) return;
    if (v.rooms[key].locked) return toast(v.rooms[key].extras ? 'سهم این وعده با خوراکی خارج از برنامه پر شده' : 'سهم این وعده با اضافه‌ی وعده‌های قبل پر شده');
    if (opt.over) return toast('این گزینه در باقی‌مانده‌ی سهم این وعده جا نمی‌شود');
    const n = plan.slots[key].pick;
    if (cur.length >= n) {
      if (n > 1) return toast('دو گزینه را برداشته‌ای؛ برای عوض کردن، اول یکی را بردار');
      cur.forEach(p => { remove(p); unfit(p.o); }); // a single choice just moves
      cur.length = 0;
    }
    // eaten smaller than planned: that version stays with the day, so the card shows what was logged
    if (opt.fit) swaps[optId] = swaps[optId] && !swaps[optId].fit ? { ...opt, base: swaps[optId] } : opt;
    const ids = opt.items.map(i => store.saveEntry(entryOf(day, key, i)).id);
    picks[key] = [...cur, { o: optId, e: ids, t: optionText(opt) }];
  }
  if (!picks[key].length) delete picks[key];
  savePicks(day, picks, swaps);
}

/* ---------------- swapping one food of an option ---------------- */

// The stored option and the one shown on `day` (which differ after a «فقط امروز» swap).
function optionOn(day, key, optId) {
  const s = store.get();
  const plan = planOn(s.ai_notes, day);
  const stored = plan?.slots[key]?.options.find(o => o.id === optId);
  return stored ? { plan, stored, shown: swapsOn(s.ai_notes, day)[optId] || stored } : null;
}

/*
  Puts `food` in place of the option's food at `index` (`food` null: back to the plan's own).
  scope 'day' changes the option on that day only (kept with the day's picks); 'plan' changes
  the stored plan from now on. Either way the amount aims at the calories the plan gave that
  place, and if the option is already ticked on that day its logged food is replaced too.
  Returns the option as it now reads, or null when it is no longer there.
*/
// The calories a replacement aims at: the plan's own for that place, or the cut-down ones when the option was eaten smaller.
const sized = (shown, stored, index) => (shown.fit ? shown.items[index] : stored.items[index]).kcal;

export function applySwap({ day, slot: key, opt: optId, index, food, scope = 'day' }) {
  const at = optionOn(day, key, optId);
  if (!at?.stored.items[index]) return null;
  const { plan, stored } = at;
  const swaps = { ...swapsOn(notes(), day) };
  let next;
  if (scope === 'plan' && food) {
    const fresh = swapItem(stored, index, food);
    delete fresh.items[index].was;
    const cur = notes().find(n => n.key === plan.key);
    const data = structuredClone(cur.data);
    data.slots[key].options = data.slots[key].options.map(o => (o.id === optId ? fresh : o));
    store.saveNote({ key: cur.key, kind: 'plan', text: cur.text, data });
    // a version kept for this day follows, so its other swaps stay
    next = swaps[optId] ? swapItem(swaps[optId], index, food, sized(swaps[optId], stored, index)) : fresh;
    delete next.items[index].was;
    if (sameItems(next, fresh)) { delete swaps[optId]; next = fresh; } else swaps[optId] = next;
  } else {
    next = food ? swapItem(at.shown, index, food, sized(at.shown, stored, index)) : restoreItem(at.shown, index, stored);
    if (sameItems(next, stored)) { delete swaps[optId]; next = stored; } else swaps[optId] = next;
  }

  const s = store.get();
  const picks = picksOn(s.ai_notes, s.entries, day);
  const mine = picks[key]?.find(p => p.o === optId);
  if (mine) {
    const e = [...mine.e];
    if (s.entries.some(x => x.id === e[index])) store.deleteEntry(e[index]);
    e[index] = store.saveEntry(entryOf(day, key, next.items[index])).id;
    picks[key] = picks[key].map(p => (p === mine ? { ...p, e, t: optionText(next) } : p));
  }
  savePicks(day, picks, swaps);
  return next;
}

const onlyWord = day => (day === today() ? 'فقط امروز' : `فقط ${relLabel(day)}`);
const amount = i => `${amountLabel(i.qty, i.unit)}${i.grams ? ` (${fa(i.grams)} گرم)` : ''}`;

function openSwap(day, key, optId, index) {
  const first = optionOn(day, key, optId);
  const old = first?.shown.items[index];
  if (!old) return;
  const base = (first.shown.fit ? first.shown : first.stored).items[index];
  const showKcal = !!store.profile().planKcal;
  let query = '';
  let ai = null; // null · 'wait' · [{ food, why }]

  sheet.open(body => {
    const close = `<button class="icon-btn" data-close aria-label="بستن">${icon.close}</button>`;
    const preview = f => swapItem(first.shown, index, f, base.kcal);
    const row = (f, why = '') => {
      const i = preview(f).items[index];
      return `<button class="food-row" data-food="${f.id}">
        <span class="fname">${esc(f.name)}</span>
        <span class="fmeta">${amount(i)}${showKcal ? ` · ${fa(i.kcal)} کالری` : ''}${why ? ` · ${esc(why)}` : ''}</span>
      </button>`;
    };

    function drawList() {
      const rest = first.shown.items.filter((_, n) => n !== index).map(i => i.name);
      body.innerHTML = `
        <div class="sheet-head"><h2>به‌جای «${esc(old.name)}»</h2>${close}</div>
        <p class="muted small">${rest.length ? `${rest.map(esc).join('، ')} سر جایش می‌ماند. ` : ''}مقدار جایگزین را خود اپ هم‌کالری با ${amount(base)} ${esc(base.name)} حساب می‌کند.</p>
        ${old.was ? `<button class="btn block" data-back>برگرداندن به «${esc(old.was)}»</button>` : ''}
        ${neededFoods(shopList(notes())).has(old.food_id)
          ? `<p class="small shop-note">${icon.cart} «${esc(old.name)}» در لیست خریدت هست.</p>`
          : `<button class="btn block" data-shop-add>${icon.cart} «${esc(old.name)}» را به لیست خرید اضافه کن</button>`}
        <div class="search">${icon.search}<input type="search" placeholder="جست‌وجو در بانک غذا" value="${esc(query)}" autocomplete="off"></div>
        <div class="food-list"></div>`;
      const list = body.querySelector('.food-list');
      const input = body.querySelector('input[type=search]');
      const drawResults = () => {
        const s = store.get();
        const used = new Set(first.shown.items.map(i => i.food_id));
        const can = s.foods.filter(f => !used.has(f.id) && f.kcal > 0);
        if (query) {
          const q = norm(query);
          const hits = can.filter(f => norm(f.name).includes(q)).sort((a, b) => norm(a.name).indexOf(q) - norm(b.name).indexOf(q));
          list.innerHTML = hits.length ? hits.map(f => row(f)).join('') : '<div class="empty">در بانک غذا پیدا نشد.</div>';
          return;
        }
        const near = swapSuggestions(first.shown, index, s.foods, s.entries);
        list.innerHTML = `
          ${near.length ? `<h3 class="list-h">هم‌دسته در بانک غذا</h3>${near.map(f => row(f)).join('')}` : ''}
          ${Array.isArray(ai) ? `<h3 class="list-h">پیشنهاد هوشواره</h3>${ai.map(x => row(x.food, x.why)).join('')}` : ''}
          ${ai === 'wait' ? '<p class="muted small ai-wait"><span class="typing"><i></i><i></i><i></i></span> دارم جایگزین مناسب پیدا می‌کنم…</p>' : ''}
          ${!ai && aiAvailable() ? `<button class="btn block ai-btn" data-ai>${sparkle()} هوشواره پیشنهاد بدهد</button>` : ''}
          <p class="muted small swap-hint">هر غذای دیگری را هم می‌توانی از بانک غذا جست‌وجو کنی.</p>`;
      };
      drawResults();
      input.addEventListener('input', () => { query = input.value; drawResults(); });
      body.querySelector('[data-close]').onclick = () => sheet.close();
      body.querySelector('[data-back]')?.addEventListener('click', () => done(null, 'day'));
      // they still need something for today, so the sheet stays open
      body.querySelector('[data-shop-add]')?.addEventListener('click', () => {
        addToShopping([{ name: old.name, food_id: old.food_id }]);
        toast('به لیست خرید اضافه شد');
        drawList();
      });
      list.onclick = async e => {
        const f = e.target.closest('[data-food]');
        if (f) return drawConfirm(store.get().foods.find(x => x.id === f.dataset.food));
        if (!e.target.closest('[data-ai]')) return;
        ai = 'wait'; drawResults();
        try {
          const r = await ask('plan_swap', { slot: SLOTS[key].label, option: optionText(first.shown), food: old.name, kcal: base.kcal });
          const s = store.get();
          const used = new Set(first.shown.items.map(i => i.food_id));
          ai = (r.foods || []).map(x => ({ food: s.foods.find(f => f.id === x.food_id), why: String(x.why || '').slice(0, 60) }))
            .filter(x => x.food && x.food.kcal > 0 && !used.has(x.food.id) && used.add(x.food.id));
          if (!ai.length) { ai = null; toast('هوشواره جایگزین مناسبی در بانک غذا پیدا نکرد.'); }
        } catch (err) {
          ai = null; toast(err.message);
        }
        if (body.isConnected && body.querySelector('.food-list') === list && !query) drawResults();
      };
    }

    function drawConfirm(food) {
      if (!food) return;
      const next = preview(food);
      const budget = optionBudget(first.plan, key);
      const off = next.kcal - budget;
      const lost = Math.round(first.shown.protein - next.protein);
      const warn = [
        Math.abs(off) / budget > 0.15 && Math.abs(off) > Math.abs(first.shown.kcal - budget)
          ? `با این جایگزین، این گزینه حدود ${fa(Math.round(Math.abs(off) / 10) * 10)} کالری ${off > 0 ? 'بیشتر' : 'کمتر'} از سهم ${SLOTS[key].label} می‌شود (کمترین مقدار قابل‌اندازه‌گیری همین است).` : '',
        lost >= 5 ? `پروتئین این گزینه حدود ${fa(lost)} گرم کم می‌شود؛ اگر می‌شود جایگزینی با پروتئین نزدیک‌تر بردار.` : '',
      ].filter(Boolean);
      body.innerHTML = `
        <div class="sheet-head"><button class="icon-btn" data-list aria-label="برگشت به فهرست">${icon.chevR}</button><h2>${esc(food.name)} به‌جای ${esc(old.name)}</h2>${close}</div>
        <div class="popt on swap-prev"><div class="popt-body">
          ${next.title ? `<strong>${esc(next.title)}</strong>` : ''}
          <ul>${next.items.map((i, n) => `<li${n === index ? ' class="new"' : ''}><span>${esc(i.name)}</span><b>${amount(i)}</b></li>`).join('')}</ul>
          ${showKcal ? `<small class="muted">${fa(next.kcal)} کالری · ${fa(Math.round(next.protein))} گرم پروتئین (قبلاً ${fa(first.shown.kcal)} · ${fa(Math.round(first.shown.protein))})</small>` : ''}
        </div></div>
        ${warn.map(w => `<p class="note soft small">${w}</p>`).join('')}
        <label class="check"><input type="checkbox" name="forget"><span>«${esc(base.name)}» را در رژیم‌های بعدی نیاور<small class="muted">به «دوست ندارم»های رژیم اضافه می‌شود.</small></span></label>
        <div class="row gap swap-go">
          <button class="btn grow" data-scope="day">${onlyWord(day)}</button>
          <button class="btn primary grow" data-scope="plan">از این به بعد</button>
        </div>`;
      body.querySelector('[data-close]').onclick = () => sheet.close();
      body.querySelector('[data-list]').onclick = drawList;
      body.querySelectorAll('[data-scope]').forEach(b => b.onclick = () => done(food, b.dataset.scope, body.querySelector('[name=forget]').checked));
    }

    function done(food, scope, forget = false) {
      const next = applySwap({ day, slot: key, opt: optId, index, food, scope });
      if (next && forget) {
        const p = store.profile();
        const had = String(p.planPrefs?.dislikes || '').trim();
        if (!norm(had).includes(norm(base.name))) store.saveProfile({ ...p, planPrefs: { ...(p.planPrefs || {}), dislikes: had ? `${had}، ${base.name}` : base.name } });
      }
      sheet.close();
      toast(!next ? 'این گزینه دیگر در برنامه نیست.' : !food ? 'به برنامه برگشت' : scope === 'plan' ? 'در رژیم عوض شد' : 'جایگزین شد');
    }

    drawList();
  }, { tall: true });
}

/* ---------------- drawing ---------------- */

// One food of an option; the button beside it swaps just that food for another. `need`: bank
// foods on the shopping list, marked so it is clear which options have to wait for the shop.
const itemLine = (only, need, canSwap) => (i, n) => `<li>
  <span>${esc(i.name)}${i.was ? `<small class="was">به‌جای ${esc(i.was)} · ${only}</small>` : ''}${need.has(i.food_id) ? '<small class="was">در لیست خرید</small>' : ''}</span>
  <b>${amountLabel(i.qty, i.unit)}${i.grams ? ` <small>(${fa(i.grams)} گرم)</small>` : ''}</b>
  ${canSwap ? `<button class="swap-btn" data-swap="${n}" aria-label="جایگزین کردن ${esc(i.name)}">${icon.swap}</button>` : ''}
</li>`;

const r10 = x => Math.round(x / 10) * 10;

// Under an occasion that off-plan food touched — its own, or an earlier one's that went over
// (`room.owed`): what is left of its calories, or that it is used up.
// `cut`: options were made smaller to fit; `over`: how many could not be.
function roomNote(key, room, cut, over) {
  const left = r10(room.left);
  const label = SLOTS[key].label;
  const owed = r10(room.owed) > 0 ? `<b>${fa(r10(room.owed))}</b> کالری اضافه‌ی وعده‌های قبل از سهم ${label} کم شد. ` : '';
  const state = left > 0 ? `${room.locked ? 'فقط ' : ''}<b>${fa(left)}</b> کالری از سهم ${label} مانده`
    : left < 0 ? `<b>${fa(-left)}</b> کالری از سهم ${label} بیشتر شده` : `سهم ${label} پر شده`;
  const on = room.passed > 0 ? 'این اضافه از سهم وعده‌های بعدی کم شد.' : '';
  const then = room.locked ? `؛ گزینه‌های این وعده قفل شد. ${on}${room.extras ? `${on ? ' ' : ''}اگر ثبت خارج از برنامه را برداری، دوباره باز می‌شوند.` : ''}`
    : on ? `؛ ${on}`
    : cut ? `؛ مقدار گزینه‌ها به همین اندازه کم شد${over ? ` (${fa(over)} گزینه آن‌قدر کوچک نمی‌شود و کنار رفت)` : ''}.`
    : over ? '؛ هیچ‌کدام از گزینه‌ها آن‌قدر کوچک نمی‌شود.' : '.';
  return `<p class="room small${room.locked ? ' lock' : ''}">${room.locked ? icon.lock : ''}<span>${owed}${state}${then}</span></p>`;
}

/*
  One occasion. To keep the day short an option is a single line until it is tapped (its foods
  and amounts unfold) or ticked; once the choice is made the other options fold away behind a
  link, and when off-plan food has used the occasion up they are not offered at all.
*/
function slotCard(plan, key, day, picks, extras, room, showKcal, only, need) {
  const slot = plan.slots[key];
  const mine = picks[key] || [];
  const full = mine.length >= slot.pick;
  const known = new Set(slot.options.map(o => o.id));
  const offer = slot.options.filter(o => !o.over); // the rest no longer fit what off-plan food left
  const over = slot.options.length - offer.length;
  // ticked before the plan was replaced: still shown, so it can be unticked
  const orphans = mine.filter(p => !known.has(p.o));
  const isOn = o => mine.some(p => p.o === o.id);
  const option = o => {
    const on = isOn(o);
    const names = o.items.map(i => i.name).join('، ');
    // a div, not a button: the swap buttons sit inside it. The tick is the real control.
    return `<div class="popt${on ? ' on' : ''}${on || opened.has(`${day}|${o.id}`) ? ' open' : ''}" data-slot="${key}" data-opt="${o.id}">
      <button class="tick" aria-pressed="${on}" aria-label="${esc(o.title || optionText(o))}">${on ? icon.check : ''}</button>
      <div class="popt-body">
        <div class="popt-head${o.title ? '' : ' plain'}"><strong>${esc(o.title || names)}</strong>${on ? '' : icon.chevD}</div>
        ${o.title ? `<small class="muted popt-sum">${esc(names)}</small>` : ''}
        <div class="popt-more">
          <ul>${o.items.map(itemLine(only, need, !o.slot)).join('')}</ul>
          ${o.slot || o.fit ? `<small class="was">${o.fit ? 'کوچک‌شده' : 'برای باقی‌مانده‌ی سهم این وعده'} · ${only}</small>` : ''}
          ${showKcal ? `<small class="muted">${fa(o.kcal)} کالری · ${fa(Math.round(o.protein))} گرم پروتئین</small>` : ''}
        </div>
      </div>
    </div>`;
  };
  const wait = busySlots.has(key) ? '<p class="muted small ai-wait"><span class="typing"><i></i><i></i><i></i></span> دارم یک گزینه‌ی دیگر پیدا می‌کنم…</p>' : '';
  const more = !aiAvailable() || wait ? '' : `<button class="link small ai-more" data-more="${key}">${sparkle(14)} هیچ‌کدام را ندارم؛ یک گزینه‌ی دیگر</button>`;
  const rest = offer.filter(o => !isOn(o));
  const left = r10(room.left);
  // what is left is too little for a whole option: Hooshvareh can size one to it
  const touched = extras.length || r10(room.owed) > 0; // off-plan food changed what this occasion has
  const fit = touched && !full && !room.locked && !wait && aiAvailable() && left >= 50 && !rest.length
    ? `<button class="link small ai-more" data-fit="${key}" data-kcal="${left}">${sparkle(14)} هوشواره گزینه‌ای برای همین ${fa(left)} کالری بچیند</button>` : '';
  const unfolded = shown.has(`${day}|${key}`);
  const options = room.locked ? slot.options.filter(isOn).map(option).join('')
    : !full ? offer.map(option).join('')
    : `${slot.options.filter(isOn).map(option).join('')}
      ${rest.length ? `<button class="link small fold-btn" data-fold="${key}" aria-expanded="${unfolded}">${fa(rest.length)} گزینه‌ی دیگر ${icon.chevD}</button>
      <div class="fold"${unfolded ? '' : ' hidden'}>${rest.map(option).join('')}${more}</div>` : ''}`;
  return `<div class="meal card slot${full ? ' full' : ''}${room.locked ? ' locked' : ''}">
    <div class="meal-head">
      <h2>${SLOTS[key].label}</h2>
      <span class="muted">${full ? icon.check : room.locked ? icon.lock : pickWord(slot.pick)}</span>
      <button class="icon-btn sm" data-add="${SLOTS[key].meal}" data-key="${key}" aria-label="ثبت چیزی خارج از برنامه در ${SLOTS[key].label}">${icon.plus}</button>
    </div>
    ${options}
    ${orphans.map(p => `<button class="popt on" data-slot="${key}" data-opt="${esc(p.o)}" aria-pressed="true">
      <span class="tick">${icon.check}</span><span class="popt-body"><strong>از برنامه‌ی قبلی</strong><small class="muted">${esc(p.t || '')}</small></span>
    </button>`).join('')}
    ${extras.length ? `<h3 class="list-h">خارج از برنامه</h3>${extras.map(e => `
      <button class="entry" data-entry="${e.id}">
        <span class="ename">${esc(e.name)}</span><span class="eqty">${amountLabel(Number(e.qty), e.unit)}</span><span class="ekcal">${fa(Math.round(e.kcal))}</span>
      </button>`).join('')}` : ''}
    ${touched ? `${roomNote(key, room, rest.some(o => o.fit), over)}${fit}` : ''}
    ${wait}${full || room.locked ? '' : more}
  </div>`;
}

const waiting = () => `<section class="card ai-card">${head('رژیم هوشواره')}<p class="muted small ai-wait"><span class="typing"><i></i><i></i><i></i></span> دارم رژیم دو هفته‌ات را از بانک غذایت می‌چینم؛ حدود یک دقیقه طول می‌کشد…</p></section>`;

/*
  The plan part of the Today screen for one day. Returns '' when no plan covers that day
  and none can be offered (a past day) — the caller then shows the ordinary meal list.
*/
export function planHtml(day) {
  const s = store.get();
  const view = dayView(day);
  const plan = view?.plan;
  const isToday = day === today();
  if (!plan) {
    if (!isToday) return '';
    if (busy) return waiting();
    return `<section class="card ai-card">
      ${head('رژیم هوشواره')}
      <p class="small">هوشواره برای دو هفته برنامه می‌چیند: برای هر وعده چند گزینه با مقدار مشخص، از غذاهای بانک غذای خودت. تو فقط انتخاب می‌کنی و تیک می‌زنی.</p>
      ${aiAvailable() ? `<button class="btn primary block" data-plan-new>${sparkle()} رژیمم را بچین</button>` : '<p class="muted small">برای چیدن رژیم باید وارد حساب شده باشی.</p>'}
    </section>`;
  }

  const p = store.profile();
  const showKcal = !!p.planKcal;
  const { picks, extras, rooms } = view;
  const a = dayAdherence(plan, picks);
  const over = planOver(plan, today());
  const fresh = isToday && !over ? newFoods(plan, s.foods) : [];
  const dayNo = planDayNo(plan, day);
  const keys = Object.keys(SLOTS);
  const need = neededFoods(shopList(s.ai_notes)); // foods of the plan waiting on the shopping list
  const card = k => slotCard(plan, k, day, picks, extras[k], rooms[k], showKcal, onlyWord(day), need);

  return `
    ${busy ? waiting() : ''}
    ${isToday && over && !busy ? `<div class="note soft">
      <strong>دوره‌ی دوهفته‌ای تمام شد</strong>
      <p>وزنت را ثبت کن تا هوشواره برنامه‌ی دوره‌ی بعد را با نتیجه‌ی این دو هفته تنظیم کند. تا آن موقع همین برنامه سر جایش است.</p>
      <div class="row gap"><button class="btn primary sm" data-plan-new>برنامه‌ی دوره‌ی بعد</button><a class="btn sm" href="#/progress">ثبت وزن</a></div>
    </div>` : ''}
    ${isToday && !over && !busy && Math.abs(plan.kcal - effectiveTargets(p, day).kcal) >= 100 ? `<div class="note soft">
      <strong>هدف کالری‌ات عوض شده</strong>
      <p>این برنامه برای ${fa(plan.kcal)} کالری چیده شده، ولی هدف الانت ${fa(effectiveTargets(p, day).kcal)} است. هوشواره می‌تواند برنامه‌ای با هدف تازه بچیند.</p>
      ${aiAvailable() ? '<button class="btn sm" data-plan-new>برنامه با هدف تازه</button>' : ''}
    </div>` : ''}
    ${fresh.length && !busy ? `<div class="note soft" data-fresh>
      <strong>غذای تازه در بانک غذا</strong>
      <p>${fresh.slice(0, 4).map(f => `«${esc(f.name)}»`).join('، ')}${fresh.length > 4 ? ' و…' : ''} را اضافه کرده‌ای. هوشواره برنامه را با ${fresh.length > 1 ? 'این‌ها' : 'این'} به‌روز کند؟</p>
      <div class="row gap"><button class="btn primary sm" data-plan-fresh>به‌روز کن</button><button class="btn ghost sm" data-plan-skip>نه</button></div>
    </div>` : ''}

    <section class="card ai-card plan-card">
      ${head('رژیم هوشواره', `<small class="muted">${dayNo <= plan.days ? `روز ${fa(dayNo)} از ${fa(plan.days)}` : 'دوره تمام شده'}</small>`)}
      <div class="bar plan-bar"><i style="width:${a.done / a.of * 100}%"></i></div>
      <p class="small"><b>${fa(a.done)}</b> از ${fa(a.of)} وعده طبق برنامه</p>
      ${plan.note ? `<details class="plan-note"><summary class="link small">توضیح هوشواره</summary><div class="ai-text small">${md(plan.note)}</div></details>` : ''}
      <div class="plan-links">
        <button class="link small" data-plan-kcal>${showKcal ? 'پنهان کردن کالری' : 'نمایش کالری'}</button>
        ${aiAvailable() && !over ? '<button class="link small" data-plan-redo>برنامه‌ی تازه</button>' : ''}
      </div>
    </section>

    <section class="meals">${keys.map(card).join('')}</section>

    ${plan.free?.length ? `<section class="card">
      <h2 class="card-h">هر وقت گرسنه شدی</h2>
      <p class="muted small">این‌ها خیلی کم‌کالری‌اند و بیرون از وعده‌ها هم آزادند:</p>
      <div class="pills free">${plan.free.map(f => `<span class="pill">${icon.leaf}<span>${esc(f.name)}</span></span>`).join('')}</div>
    </section>` : ''}`;
}

export function bindPlan(root, day, redraw) {
  refresh = redraw;
  const s = store.get();
  const plan = dayView(day)?.plan;
  const startNew = () => openPrefs(() => generate());

  root.querySelectorAll('[data-plan-new]').forEach(b => b.onclick = startNew);
  root.querySelector('[data-plan-redo]')?.addEventListener('click', async () => {
    if (await confirmBox('برنامه‌ی فعلی کنار گذاشته شود و هوشواره از امروز یک دوره‌ی دوهفته‌ای تازه بچیند؟', 'بچین')) startNew();
  });
  root.querySelector('[data-plan-kcal]')?.addEventListener('click', () => {
    const p = store.profile();
    store.saveProfile({ ...p, planKcal: !p.planKcal });
  });
  if (!plan) return;

  const fresh = newFoods(plan, s.foods);
  root.querySelector('[data-plan-fresh]')?.addEventListener('click', () =>
    generate({ days: Math.max(1, diffDays(planEnd(plan), today()) + 1), include: fresh }));
  root.querySelector('[data-plan-skip]')?.addEventListener('click', () => {
    const cur = notes().find(n => n.key === plan.key);
    if (cur) store.saveNote({ key: cur.key, kind: 'plan', text: cur.text, data: { ...cur.data, seenFoods: [...(cur.data.seenFoods || []), ...fresh.map(f => f.id)] } });
  });
  root.querySelectorAll('[data-opt]').forEach(b => b.onclick = e => {
    const swap = e.target.closest('[data-swap]');
    if (swap) return openSwap(day, b.dataset.slot, b.dataset.opt, Number(swap.dataset.swap));
    // the tick picks; anywhere else on an option not yet picked unfolds its foods
    if (e.target.closest('.tick') || b.matches('button')) return toggle(day, b.dataset.slot, b.dataset.opt);
    if (b.classList.contains('on')) return;
    const k = `${day}|${b.dataset.opt}`;
    b.classList.toggle('open', !opened.delete(k) && !!opened.add(k));
  });
  root.querySelectorAll('[data-fold]').forEach(b => b.onclick = () => {
    const k = `${day}|${b.dataset.fold}`;
    const open = !shown.delete(k) && !!shown.add(k);
    b.setAttribute('aria-expanded', open);
    b.nextElementSibling.hidden = !open;
  });
  root.querySelectorAll('[data-more]').forEach(b => b.onclick = () => oneMore(plan, b.dataset.more));
  root.querySelectorAll('[data-fit]').forEach(b => b.onclick = () => oneMore(plan, b.dataset.fit, { day, kcal: Number(b.dataset.kcal) }));
  root.querySelectorAll('.slot [data-add]').forEach(b => b.onclick = () => openLogSheet({ day, meal: b.dataset.add, onSaved: row => placeExtra(day, b.dataset.key, row) }));
  root.querySelectorAll('.slot [data-entry]').forEach(b => b.onclick = () => openEntrySheet(s.entries.find(e => e.id === b.dataset.entry)));
}
