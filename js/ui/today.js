// Today screen, in one of two modes over the same entries: calorie counting (remaining
// calories/protein, meals, veg counter) or the diet plan (Hooshvareh's options per meal).
// The numbers come first, then the one card that matters most today; the other cards wait in a
// fold under the meals, and the next one moves up when the top one is dismissed.
import * as store from '../data/store.js';
import { effectiveTargets, isTeen, proteinFor } from '../domain/targets.js';
import { phaseNotes, bindPhase, phaseLabel } from './phase.js';
import { lightOn } from '../domain/phase.js';
import { MEALS, entriesOn, totals, daysLoggedInWeek, sortedWeights } from '../domain/stats.js';
import { underEating, rapidLoss, rapidLimit } from '../domain/safety.js';
import { fa, kcal50, round50, esc, qtyLabel } from '../lib/fa.js';
import { amountLabel } from './units.js';
import { today, addDays, relLabel, faDM, weekStart } from '../lib/dates.js';
import { icon } from './dom.js';
import { openLogSheet, openEntrySheet } from './logFood.js';
import { dismissed, dismiss } from './notices.js';
import { motivationCard, bindMotivation } from './motivation.js';
import { tipCard, bindTip, occasionCard, bindOccasion } from './aiCards.js';
import { magCard, bindMag } from './magazine.js';
import { planHtml, bindPlan } from './plan.js';
import { measureNote, bindMeasureNote } from './measure.js';
import { checkinCard, bindCheckin } from './checkin.js';
import { weekCard, bindWeekCard } from './review.js';
import { greetCard, bindGreet } from './mascot.js';
import { mealBudget, mealSharesFrom, mealStanding } from '../domain/portion.js';
import { planAvoid } from '../ai/foodTags.js';
import { TAG_SAYS } from '../domain/health.js';
import { packRow, bindPacks } from './packs.js';
import { mealRowsHtml, bindMealRows, openMeal } from './meal.js';
import { eatingPattern } from '../domain/pattern.js';

let day = today();
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
    const rl = rapidLoss(s.weights, p.startDate, today(), rapidLimit(isTeen(p), p.conditions));
    if (rl && !dismissed('rapid', weekStart(today()))) {
      notices.push({ key: 'rapid', mark: weekStart(today()), cls: 'doctor', html: `<strong>سرعت کاهش وزن زیاد است</strong><p>سه هفته‌ی پشت‌سرهم بیشتر از ${fa(rl.perWeek, 1)} کیلو در هفته کم کرده‌اید. لطفاً با پزشک‌تان مشورت کنید.</p>` });
    }
    // «بیماری کلیه» used to be one choice; it became two that the diet treats very differently
    if ((p.conditions || []).includes('kidney') && !p.kidneyAsked) {
      notices.push({ key: 'kidney', mark: '1', cls: 'doctor', keep: true, html: `<strong>مشکل کلیه‌تان کدام است؟</strong><p>«بیماری کلیه» را تیک زده بودید. حالا دو گزینه است، چون رژیم هر کدام فرق دارد: با سنگ کلیه پروتئین کافی لازم است و آب زیاد، ولی با کم شدن کارکرد کلیه (به تشخیص پزشک) پروتئین باید محدود شود.</p>
        <div class="row gap"><button class="btn primary sm" data-kidney="stones">فقط سنگ کلیه</button><button class="btn sm" data-kidney="kidney">کارکرد کلیه‌ام کم شده</button><button class="btn sm" data-kidney="both">هر دو</button></div>` });
    }
  }

  // «سهم وعده»: the meal's calories for today, from what is left of the day
  const budgetFor = m => {
    const st = store.get();
    const pat = eatingPattern(st.entries, st.ai_notes, day);
    return { kcal: mealBudget(st.entries, day, m, t.kcal, mealSharesFrom(pat.ready ? pat.shares : null)), label: MEALS[m] };
  };
  const standing = m => {
    const st = store.get();
    const pat = eatingPattern(st.entries, st.ai_notes, day);
    return mealStanding(st.entries, day, m, t.kcal, mealSharesFrom(pat.ready ? pat.shares : null));
  };
  const avoid = eat ? planAvoid() : null;
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
      <div class="pill">${icon.leaf}<span>سبزی ${isToday ? 'امروز' : ''}: <b>${qtyLabel(Math.round(tot.veg * 2) / 2)}</b> وعده</span></div>
      <div class="pill"><span>این هفته <b>${fa(logged)}</b> روز ثبت کرده‌اید${lightOn(p, sortedWeights(s.weights), today()) ? ' · ثبت سبک' : ''}</span></div>
      ${t.phase !== 'loss' ? `<div class="pill"><span>مرحله: <b>${phaseLabel(p, day)}</b></span></div>` : ''}
    </div>

    ${notices.map(n => `<div class="note ${n.cls || 'soft'}" data-notice="${n.key}" data-mark="${n.mark}">${n.html}${n.keep ? '' : '<button class="link small" data-dismiss>باشه</button>'}</div>`).join('')}

    ${isToday ? greetCard() : ''}
    ${top ? `<div data-day-cards>${top[1]}</div>` : ''}

    ${plan}

    ${one ? mealRowsHtml(day, budgetFor) : ''}
    ${mealList && !one ? `<section class="meals">
      ${Object.entries(MEALS).map(([k, label]) => {
        const items = list.filter(e => e.meal === k).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
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
  // `eat`: until the new meal sheet is built (REDESIGN.md, step 2), «+» opens «چقدر بخورم؟»
  const room = portionMode || eat ? { smart: true, budgetFor } : null;
  root.querySelector('[data-log]')?.addEventListener('click', () => (one ? openMeal({ day, budgetFor }) : openLogSheet({ day, room })));
  if (one) bindMealRows(root, day, budgetFor);
  root.querySelectorAll('[data-add]').forEach(b => b.onclick = () => openLogSheet({ day, meal: b.dataset.add, room }));
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
