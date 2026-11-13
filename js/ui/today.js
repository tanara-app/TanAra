// Today screen, in one of two modes over the same entries: calorie counting (remaining
// calories/protein, meals, veg counter) or the diet plan (Hooshvareh's options per meal).
// The numbers come first, then the one card that matters most today; the other cards wait in a
// fold under the meals, and the next one moves up when the top one is dismissed.
import * as store from '../data/store.js';
import { effectiveTargets, isTeen, proteinFor } from '../domain/targets.js';
import { phaseNotes, bindPhase, phaseLabel } from './phase.js';
import { lightOn } from '../domain/phase.js';
import { MEALS, MEALS5, mealLabel, baseMeal, meal5, entriesOn, totals, daysLoggedInWeek, sortedWeights } from '../domain/stats.js';
import { underEating, rapidLoss, rapidLimit, slowPace } from '../domain/safety.js';
import { bmiOf, UNDERWEIGHT_BMI } from '../domain/targets.js';
import { recalcTargets } from './profile.js';
import { fa, kcal50, round50, esc, qtyLabel } from '../lib/fa.js';
import { amountLabel } from './units.js';
import { today, addDays, relLabel, faDM, weekStart } from '../lib/dates.js';
import { icon } from './dom.js';
import { openLogSheet, openEntrySheet } from './logFood.js';
import { dismissed, dismiss } from './notices.js';
import { motivationCard, bindMotivation } from './motivation.js';
import { tipCard, bindTip, occasionCard, bindOccasion } from './aiCards.js';
import { magCard, bindMag } from './magazine.js';
import { planHtml, bindPlan, setFast } from './plan.js';
import { fastOn } from '../domain/plan.js';
import { isRamadan } from '../domain/occasions.js';
import { measureNote, bindMeasureNote } from './measure.js';
import { checkinCard, bindCheckin } from './checkin.js';
import { weekCard, bindWeekCard } from './review.js';
import { greetCard, bindGreet } from './mascot.js';
import { mealBudget, mealSharesFrom, mealShares5From, mealStanding } from '../domain/portion.js';
import { planAvoid } from '../ai/foodTags.js';
import { TAG_SAYS } from '../domain/health.js';
import { packRow, bindPacks } from './packs.js';
import { mealRowsHtml, bindMealRows, openMeal } from './meal.js';
import { openEat } from './eat.js';
import { freeFoods, shortName } from '../domain/combos.js';
import { eatingPattern } from '../domain/pattern.js';

let day = today();

// a fasting day of the rebuilt «امروز» (beta `eat`): its three meals and their part of the day
const FAST_MEALS = { breakfast: 'سحری', snack2: 'افطار', dinner: 'شام' };
const FAST_SHARES5 = { breakfast: 0.4, snack2: 0.3, dinner: 0.3 };
const MOON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>';
// what a fasting day asks of some illnesses (the same words as the diet's)
function fastNotes(conditions) {
  const has = c => conditions.includes(c);
  const out = [];
  if (has('diabetes')) out.push('با دیابت، روزه گرفتن و مقدار داروها را حتماً با پزشکت هماهنگ کن؛ اگر قندت افت کرد یا حالت بد شد روزه را بشکن.');
  if (has('kidney')) out.push('با کم شدن کارکرد کلیه، روزه گرفتن (و کم‌آبی‌اش) را حتماً با پزشکت هماهنگ کن.');
  if (has('stones') || has('gout')) out.push(`با ${has('gout') ? 'نقرس' : 'سنگ کلیه'}، کم‌آبیِ روزه خطر ${has('gout') ? 'حمله‌ی نقرس' : 'سنگ'} را بیشتر می‌کند: روزه گرفتن را با پزشکت هماهنگ کن و از افطار تا سحر آب زیاد بنوش.`);
  return out.map(t => `<p class="note doctor small">${t}</p>`).join('');
}
export const setDay = d => { day = d; };
let moreOpen = false;

// Today's cards, most important first: what asks something of them, then what is there to read.
const dayCards = () => [
  ['مرحله', phaseNotes()],
  ['برگشت به مسیر', checkinCard()],
  ['مرور هفته', weekCard()],
  ['اندازه‌گیری', measureNote()],
  ['مناسبت', occasionCard()],
  ['مقاله‌ی هفته', magCard()],
  ['نکته‌ی امروز', tipCard()],
  ['انگیزه‌ها', motivationCard()],
].filter(([, html]) => html);

function ring(consumed, target) {
  const r = 52, c = 2 * Math.PI * r;
  const frac = target ? Math.min(consumed / target, 1) : 0;
  return `<svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
    <circle cx="60" cy="60" r="${r}" class="ring-bg"/>
    <circle cx="60" cy="60" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - frac)}" transform="rotate(-90 60 60)"/>
  </svg>`;
}

export function renderToday(root) {
  const s = store.get();
  const p = store.profile();
  /*
    The underweight hold goes by the weight the targets were set at: when the latest weight crosses
    the line either way (with half a point to spare on the way up), they are worked out again.
  */
  const lastKg = sortedWeights(store.get().weights).at(-1)?.kg;
  if (lastKg && p.targets?.baseWeight && Number(p.heightCm) > 0) {
    const was = bmiOf(Number(p.targets.baseWeight), Number(p.heightCm)), now = bmiOf(Number(lastKg), Number(p.heightCm));
    if ((was >= UNDERWEIGHT_BMI && now < UNDERWEIGHT_BMI) || (was < UNDERWEIGHT_BMI && now >= UNDERWEIGHT_BMI + 0.5)) { recalcTargets(); return; }
  }
  const t = effectiveTargets(p, day);
  const list = entriesOn(s.entries, day);
  const tot = totals(list);
  const isToday = day === today();
  const remaining = round50(t.kcal) - round50(tot.kcal);
  const logged = daysLoggedInWeek(s.entries, weekStart(today()));
  // «سهم وعده»: a beta for the accounts whose profile has it in `beta` (set from the database)
  const beta = (p.beta || []).includes('portion');
  // «یکی» (beta, accounts with `one`): one meal screen in place of the three modes (meal.js)
  const one = (p.beta || []).includes('one');
  // the rebuild of «امروز» (REDESIGN.md, beta `eat`, on for nobody yet): no mode tabs; each meal card
  // shows its share of the day and a line for it, and a dot by a food their illness keeps out
  const eat = !one && (p.beta || []).includes('eat');
  const portionMode = !one && !eat && beta && p.mode === 'portion';
  const planMode = !one && !eat && p.mode === 'plan';
  // '' when no plan covers this day: the ordinary meal list is shown instead
  const plan = planMode ? planHtml(day) : '';
  const counting = !planMode || !!p.planKcal;
  const mealList = !planMode || !plan || !plan.includes('class="meals"');
  const [top, ...more] = isToday ? dayCards() : [];

  // Safety notices only on today's view.
  const notices = [];
  if (isToday) {
    const ue = underEating(s.entries, t.floor, today());
    if (ue && !dismissed('under', ue.days[0])) {
      notices.push({ key: 'under', mark: ue.days[0], html: `<strong>چند روز است کم خورده‌اید</strong><p>سه روز گذشته کالری‌تان از حداقل ایمن (${fa(t.floor)}) کمتر بوده. کم‌خوری زیاد معمولاً نتیجه‌ی برعکس دارد؛ بدن خسته می‌شود و ادامه دادن سخت‌تر. کمی بیشتر خوردن کاملاً اشکالی ندارد.</p>` });
    }
    const rl = rapidLoss(s.weights, p.startDate, today(), rapidLimit(isTeen(p), p.conditions, slowPace(p)));
    if (rl && !dismissed('rapid', weekStart(today()))) {
      notices.push({ key: 'rapid', mark: weekStart(today()), cls: 'doctor', html: `<strong>سرعت کاهش وزن زیاد است</strong><p>سه هفته‌ی پشت‌سرهم بیشتر از ${fa(rl.perWeek, 1)} کیلو در هفته کم کرده‌اید. لطفاً با پزشک‌تان مشورت کنید.</p>` });
    }
    // safety holds (targets.js): no deficit in pregnancy or underweight, a gentle one while breastfeeding
    if (t.hold === 'pregnant' && !dismissed('hold', 'pregnant')) notices.push({ key: 'hold', mark: 'pregnant', cls: 'doctor', html: '<strong>در بارداری کالری کم نمی‌شود</strong><p>هدف روزانه همان مصرف بدن است. افزایش وزن بارداری را با پزشک یا ماما دنبال کن.</p>' });
    if (t.hold === 'underweight' && !dismissed('hold', 'underweight')) notices.push({ key: 'hold', mark: 'underweight', cls: 'doctor', html: '<strong>وزنت کمتر از حد سالم است</strong><p>برای همین کالری کم نمی‌شود و هدف همان مصرف بدن است. لطفاً با پزشک مشورت کن.</p>' });
    // insulin or a sugar-lowering pill: a deficit can bring the sugar too low
    if (p.glucoseMeds && !dismissed('glucose', '1')) notices.push({ key: 'glucose', mark: '1', cls: 'doctor', html: '<strong>با انسولین یا قرص قند</strong><p>کم کردن کالری ممکن است قندت را پایین بیاورد. مقدار دارو را با پزشکت تنظیم کن و نشانه‌های افت قند را بشناس: لرزش، عرق سرد، گرسنگی ناگهانی، گیجی.</p>' });
    // asked once of members who joined before these questions
    if (p.sex === 'female' && !p.pregnancy) {
      notices.push({ key: 'askpreg', mark: '1', cls: 'doctor', keep: true, html: `<strong>باردار هستی یا شیر می‌دهی؟</strong><p>در این دو حالت هدف کالری فرق می‌کند.</p>
        <div class="row gap">${[['no', 'هیچ‌کدام'], ['pregnant', 'باردارم'], ['breastfeeding', 'شیر می‌دهم']].map(([k, l], i) => `<button class="btn ${i ? '' : 'primary '}sm" data-preg="${k}">${l}</button>`).join('')}</div>` });
    }
    if (!p.glucoseMedsAsked && (p.conditions || []).some(c => c === 'diabetes' || c === 'prediabetes')) {
      notices.push({ key: 'askglucose', mark: '1', cls: 'doctor', keep: true, html: `<strong>انسولین یا قرص پایین‌آورنده‌ی قند مصرف می‌کنی؟</strong><p>مثل گلی‌بنکلامید یا گلیکلازید.</p>
        <div class="row gap"><button class="btn primary sm" data-glucose="no">نه</button><button class="btn sm" data-glucose="yes">بله</button></div>` });
    }
    // «بیماری کلیه» used to be one choice; it became two that the diet treats very differently
    if ((p.conditions || []).includes('kidney') && !p.kidneyAsked) {
      notices.push({ key: 'kidney', mark: '1', cls: 'doctor', keep: true, html: `<strong>مشکل کلیه‌تان کدام است؟</strong><p>«بیماری کلیه» را تیک زده بودید. حالا دو گزینه است، چون رژیم هر کدام فرق دارد: با سنگ کلیه پروتئین کافی لازم است و آب زیاد، ولی با کم شدن کارکرد کلیه (به تشخیص پزشک) پروتئین باید محدود شود.</p>
        <div class="row gap"><button class="btn primary sm" data-kidney="stones">فقط سنگ کلیه</button><button class="btn sm" data-kidney="kidney">کارکرد کلیه‌ام کم شده</button><button class="btn sm" data-kidney="both">هر دو</button></div>` });
    }
  }

  // «سهم وعده»: the meal's calories for today, from what is left of the day
  // the meals shown: five with `eat` (a plain snack placed by the hour it was logged), else four
  // (either named snack counted as the snack); the entries get the meal they are shown in
  /*
    A fasting day in Ramadan (the moon in the pills row; remembered like the diet's «امروز روزه‌ام»,
    for the days after too): three meals, سحری in breakfast, افطار in the afternoon snack and شام,
    with 40 / 30 / 30 of the day. What was logged in another meal that day goes with the nearest one.
  */
  const ramadan = eat && isRamadan(day);
  const fast = ramadan && fastOn(s.ai_notes, day);
  const meals = fast ? FAST_MEALS : eat ? MEALS5 : MEALS;
  const fastMeal = m => (m === 'snack1' ? 'breakfast' : m === 'lunch' || m === 'snack' ? 'snack2' : m);
  const asShown = es => es.map(e => (eat ? { ...e, meal: fast && e.day === day ? fastMeal(meal5(e)) : meal5(e) } : e.meal !== baseMeal(e.meal) ? { ...e, meal: baseMeal(e.meal) } : e));
  const sharesNow = () => {
    if (fast) return FAST_SHARES5;
    const st = store.get();
    const pat = eatingPattern(st.entries, st.ai_notes, day);
    return (eat ? mealShares5From : mealSharesFrom)(pat.ready ? pat.shares : null);
  };
  // with reduced kidney function protein is a limit: each meal gets its part of it (fitMeal)
  const budgetFor = m => {
    const st = store.get();
    const sh = sharesNow();
    const all = Object.values(sh).reduce((a, b) => a + b, 0);
    return {
      kcal: mealBudget(asShown(st.entries), day, m, t.kcal, sh), label: meals[m] || mealLabel(m), meals,
      proteinMax: t.proteinMax && all ? Math.round(t.protein * (sh[m] || 0) / all) : null,
    };
  };
  const standing = m => mealStanding(asShown(store.get().entries), day, m, t.kcal, sharesNow());
  const shownList = asShown(list);
  const avoid = eat ? planAvoid() : null;
  // a meal whose share is used up: three foods free to eat anyway (a tap opens their amounts)
  const freeRow = m => {
    const free = freeFoods(s.foods, s.entries, day, m, { avoid, limit: 3 });
    return free.length ? `<div class="meal-free">${icon.leaf}${free.map(f => `<button type="button" class="eat-chip" data-free="${f.id}" data-free-meal="${m}">${esc(shortName(f.name))}</button>`).join('')}</div>` : '';
  };
  root.innerHTML = `
    <header class="day-nav">
      <button class="icon-btn" data-prev aria-label="روز قبل">${icon.chevR}</button>
      <div class="day-title">
        <h1>${relLabel(day)}</h1>
        ${isToday ? `<small>${faDM(day)}</small>` : '<button class="link small" data-today>برگشت به امروز</button>'}
      </div>
      <button class="icon-btn" data-next aria-label="روز بعد" ${isToday ? 'disabled' : ''}>${icon.chevL}</button>
    </header>

    ${one || eat ? '' : `<div class="seg mode-seg" data-mode role="tablist" aria-label="حالت">
      <button type="button" role="tab" data-v="count" aria-selected="${!planMode && !portionMode}" class="${planMode || portionMode ? '' : 'on'}">شمارش کالری</button>
      ${beta ? `<button type="button" role="tab" data-v="portion" aria-selected="${portionMode}" class="${portionMode ? 'on' : ''}">سهم وعده <small>آزمایشی</small></button>` : ''}
      <button type="button" role="tab" data-v="plan" aria-selected="${planMode}" class="${planMode ? 'on' : ''}">رژیم</button>
    </div>`}

    ${counting ? `<section class="card summary">
      <div class="ring-wrap">
        ${ring(tot.kcal, t.kcal)}
        <div class="ring-center">
          ${remaining >= 0
            ? `<b>${fa(remaining)}</b><span>کالری باقی‌مانده</span>`
            : `<b>${fa(-remaining)}</b><span>کالری بیشتر از هدف</span>`}
        </div>
      </div>
      <div class="sum-side">
        <div class="kv"><span>خورده‌شده</span><b>${kcal50(tot.kcal)}</b></div>
        <div class="kv"><span>هدف</span><b>${kcal50(t.kcal)}</b></div>
        <div class="protein">
          <div class="kv"><span>پروتئین</span><b>${fa(Math.round(tot.protein))} <small>از ${fa(t.protein)} گرم</small></b></div>
          <div class="bar"><i style="width:${t.protein ? Math.min(100, tot.protein / t.protein * 100) : 0}%"></i></div>
        </div>
      </div>
    </section>` : ''}

    <div class="pills">
      ${ramadan ? `<button type="button" class="pill fast-pill${fast ? ' on' : ''}" data-fast aria-pressed="${fast}" aria-label="${isToday ? 'امروز' : 'این روز'} روزه‌ام">${MOON}</button>` : ''}
      <div class="pill">${icon.leaf}<span>سبزی ${isToday ? 'امروز' : ''}: <b>${qtyLabel(Math.round(tot.veg * 2) / 2)}</b> وعده</span></div>
      <div class="pill"><span>این هفته <b>${fa(logged)}</b> روز ثبت کرده‌اید${lightOn(p, sortedWeights(s.weights), today()) ? ' · ثبت سبک' : ''}</span></div>
      ${t.phase !== 'loss' ? `<div class="pill"><span>مرحله: <b>${phaseLabel(p, day)}</b></span></div>` : ''}
    </div>

    ${fast ? fastNotes(p.conditions || []) : ''}
    ${notices.map(n => `<div class="note ${n.cls || 'soft'}" data-notice="${n.key}" data-mark="${n.mark}">${n.html}${n.keep ? '' : '<button class="link small" data-dismiss>باشه</button>'}</div>`).join('')}

    ${isToday ? greetCard() : ''}
    ${top ? `<div data-day-cards>${top[1]}</div>` : ''}

    ${plan}

    ${one ? mealRowsHtml(day, budgetFor) : ''}
    ${mealList && !one ? `<section class="meals">
      ${Object.entries(meals).map(([k, label]) => {
        const items = shownList.filter(e => e.meal === k).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
        const mt = totals(items);
        const st = eat ? standing(k) : null;
        return `<div class="meal card">
          <div class="meal-head">
            <h2>${label}</h2>
            ${st ? (items.length
              ? `<span class="meal-share"><b class="${st.over ? 'over' : ''}">${fa(st.eaten)}</b> از ${fa(st.share)}</span>`
              : `<span class="meal-share">${fa(st.share)}</span>`)
            : `<span class="muted">${items.length ? `${fa(Math.round(mt.kcal))} کالری` : ''}</span>`}
            <button class="icon-btn sm" data-add="${k}" aria-label="افزودن به ${label}">${icon.plus}</button>
          </div>
          ${st ? `<div class="meal-line" aria-hidden="true"><i class="${st.over ? 'over' : ''}" style="width:${st.share ? Math.min(100, st.eaten / st.share * 100) : st.eaten ? 100 : 0}%"></i></div>` : ''}
          ${portionMode ? packRow(day, k, budgetFor) : ''}
          ${items.map(e => {
            const bad = avoid && e.food_id ? avoid(e.food_id) : null;
            return `
            <button class="entry" data-entry="${e.id}">
              <span class="ename">${esc(e.name)}${e.is_veg ? ` <i class="veg">${icon.leaf}</i>` : ''}${bad ? `<i class="sick-dot" title="${TAG_SAYS[bad]}" aria-label="${TAG_SAYS[bad]}"></i>` : ''}</span>
              <span class="eqty">${amountLabel(Number(e.qty), e.unit)}</span>
              <span class="ekcal">${fa(Math.round(e.kcal))}</span>
            </button>`;
          }).join('')}
          ${st && isToday && (st.share <= 0 || st.eaten >= st.share) ? freeRow(k) : ''}
        </div>`;
      }).join('')}
    </section>` : ''}
    ${more.length ? `<details class="fold today-more"${moreOpen ? ' open' : ''}>
      <summary><span><h2>بیشتر برای امروز</h2><small>${more.map(([label]) => label).join('، ')}</small></span></summary>
      <div data-day-cards>${more.map(([, html]) => html).join('')}</div>
    </details>` : ''}
    ${mealList ? `<div class="fab-space"></div>
    <button class="fab" data-log>${icon.plus}<span>ثبت غذا</span></button>` : ''}`;

  root.querySelector('[data-prev]').onclick = () => { day = addDays(day, -1); renderToday(root); };
  root.querySelector('[data-next]').onclick = () => { if (!isToday) { day = addDays(day, 1); renderToday(root); } };
  root.querySelector('[data-today]')?.addEventListener('click', () => { day = today(); renderToday(root); });
  const room = portionMode ? { smart: true, budgetFor } : null;
  root.querySelector('[data-log]')?.addEventListener('click', () => (one ? openMeal({ day, budgetFor }) : eat ? openEat({ day, budgetFor }) : openLogSheet({ day, room })));
  if (one) bindMealRows(root, day, budgetFor);
  root.querySelector('[data-fast]')?.addEventListener('click', () => setFast(day, !fast));
  root.querySelectorAll('[data-free]').forEach(b => b.onclick = () => {
    const f = store.get().foods.find(x => x.id === b.dataset.free);
    if (f) openEat({ day, meal: b.dataset.freeMeal, budgetFor, start: [f] });
  });
  root.querySelectorAll('[data-add]').forEach(b => b.onclick = () => (eat ? openEat({ day, meal: b.dataset.add, budgetFor }) : openLogSheet({ day, meal: b.dataset.add, room })));
  if (portionMode) bindPacks(root, { day, budgetFor, redraw: () => renderToday(root), edit: (meal, start, pack) => openLogSheet({ day, meal, room, start, pack }) });
  root.querySelectorAll('[data-entry]').forEach(b => b.onclick = () => openEntrySheet(s.entries.find(e => e.id === b.dataset.entry)));
  const modeSeg = root.querySelector('[data-mode]');
  if (modeSeg) modeSeg.onclick = e => {
    const v = e.target.closest('button[data-v]')?.dataset.v;
    if (v && v !== (planMode ? 'plan' : portionMode ? 'portion' : 'count')) store.saveProfile({ ...p, mode: v });
  };
  const onToday = () => !!root.querySelector('[data-mode], .meal-rows');
  const redraw = () => { if (onToday()) renderToday(root); };
  if (planMode) bindPlan(root, day, redraw);
  bindMotivation(root);
  bindGreet(root);
  bindPhase(root);
  bindMeasureNote(root);
  bindCheckin(root, redraw);
  // a card dismissed: draw again, so the next one moves up
  root.querySelectorAll('[data-day-cards]').forEach(el => new MutationObserver(redraw).observe(el, { childList: true }));
  const fold = root.querySelector('.today-more');
  if (fold) fold.ontoggle = () => {
    moreOpen = fold.open;
    // a motivation drawn inside the closed fold had no height to take
    if (fold.open) fold.querySelector('.mot-track')?.dispatchEvent(new Event('scroll'));
  };
  // the answers change the targets: worked out again at once
  root.querySelectorAll('[data-preg]').forEach(b => b.onclick = () => { store.saveProfile({ ...store.profile(), pregnancy: b.dataset.preg }); recalcTargets(); });
  root.querySelectorAll('[data-glucose]').forEach(b => b.onclick = () => { store.saveProfile({ ...store.profile(), glucoseMeds: b.dataset.glucose === 'yes', glucoseMedsAsked: true }); });
  root.querySelectorAll('[data-kidney]').forEach(b => b.onclick = () => {
    const pr = store.profile();
    const v = b.dataset.kidney;
    const rest = (pr.conditions || []).filter(c => c !== 'kidney' && c !== 'stones');
    const conditions = [...rest, ...(v === 'stones' ? ['stones'] : v === 'kidney' ? ['kidney'] : ['kidney', 'stones'])];
    // the protein goes with the choice (unless they set it by hand): a limit only with reduced function
    const next = { ...pr, conditions, kidneyAsked: true };
    if (pr.targets && !pr.targets.manualProtein && Number(pr.heightCm) > 0) next.targets = { ...pr.targets, protein: proteinFor(next) };
    store.saveProfile(next);
    renderToday(root);
  });
  root.querySelectorAll('[data-dismiss]').forEach(b => b.onclick = () => {
    const n = b.closest('[data-notice]');
    dismiss(n.dataset.notice, n.dataset.mark);
    n.remove();
  });
  // last: generating the tip or today's magazine article redraws this screen
  const redrawAi = () => { if (onToday() && day === today()) renderToday(root); };
  if (isToday) { bindTip(redrawAi, root); bindMag(root, redrawAi); bindOccasion(root, redrawAi); bindWeekCard(root, redrawAi); }
}
