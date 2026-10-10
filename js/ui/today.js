// Today screen, in one of two modes over the same entries: calorie counting (remaining
// calories/protein, meals, veg counter) or the diet plan (Hooshvareh's options per meal).
import * as store from '../data/store.js';
import { effectiveTargets } from '../domain/targets.js';
import { MEALS, entriesOn, totals, daysLoggedInWeek } from '../domain/stats.js';
import { underEating, rapidLoss } from '../domain/safety.js';
import { fa, kcal50, round50, esc, qtyLabel } from '../lib/fa.js';
import { amountLabel } from './units.js';
import { today, addDays, relLabel, faDM, weekStart } from '../lib/dates.js';
import { icon } from './dom.js';
import { openLogSheet, openEntrySheet } from './logFood.js';
import { dismissed, dismiss } from './notices.js';
import { motivationCard, bindMotivation } from './motivation.js';
import { vaultNudge, bindVault } from './vault.js';
import { tipCard, bindTip } from './aiCards.js';
import { magCard, bindMag } from './magazine.js';
import { planHtml, bindPlan } from './plan.js';

let day = today();
export const setDay = d => { day = d; };

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
  const t = effectiveTargets(p);
  const list = entriesOn(s.entries, day);
  const tot = totals(list);
  const isToday = day === today();
  const remaining = round50(t.kcal) - round50(tot.kcal);
  const logged = daysLoggedInWeek(s.entries, weekStart(today()));
  const planMode = p.mode === 'plan';
  // '' when no plan covers this day: the ordinary meal list is shown instead
  const plan = planMode ? planHtml(day) : '';
  const counting = !planMode || !!p.planKcal;
  const mealList = !planMode || !plan || !plan.includes('class="meals"');

  // Safety notices only on today's view.
  const notices = [];
  if (isToday) {
    const ue = underEating(s.entries, t.floor, today());
    if (ue && !dismissed('under', ue.days[0])) {
      notices.push({ key: 'under', mark: ue.days[0], html: `<strong>چند روز است کم خورده‌اید</strong><p>سه روز گذشته کالری‌تان از حداقل ایمن (${fa(t.floor)}) کمتر بوده. کم‌خوری زیاد معمولاً نتیجه‌ی برعکس دارد؛ بدن خسته می‌شود و ادامه دادن سخت‌تر. کمی بیشتر خوردن کاملاً اشکالی ندارد.</p>` });
    }
    const rl = rapidLoss(s.weights, p.startDate, today());
    if (rl && !dismissed('rapid', weekStart(today()))) {
      notices.push({ key: 'rapid', mark: weekStart(today()), cls: 'doctor', html: '<strong>سرعت کاهش وزن زیاد است</strong><p>سه هفته‌ی پشت‌سرهم بیشتر از ۱٫۵ کیلو در هفته کم کرده‌اید. لطفاً با پزشک‌تان مشورت کنید.</p>' });
    }
  }

  root.innerHTML = `
    <header class="day-nav">
      <button class="icon-btn" data-prev aria-label="روز قبل">${icon.chevR}</button>
      <div class="day-title">
        <h1>${relLabel(day)}</h1>
        ${isToday ? `<small>${faDM(day)}</small>` : '<button class="link small" data-today>برگشت به امروز</button>'}
      </div>
      <button class="icon-btn" data-next aria-label="روز بعد" ${isToday ? 'disabled' : ''}>${icon.chevL}</button>
    </header>

    <div class="seg mode-seg" data-mode role="tablist" aria-label="حالت">
      <button type="button" role="tab" data-v="count" aria-selected="${!planMode}" class="${planMode ? '' : 'on'}">شمارش کالری</button>
      <button type="button" role="tab" data-v="plan" aria-selected="${planMode}" class="${planMode ? 'on' : ''}">رژیم</button>
    </div>

    ${isToday ? motivationCard() : ''}
    ${isToday ? vaultNudge() : ''}
    ${isToday ? tipCard() : ''}
    ${isToday ? magCard() : ''}

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
      <div class="pill"><span>این هفته <b>${fa(logged)}</b> روز ثبت کرده‌اید</span></div>
    </div>

    ${notices.map(n => `<div class="note ${n.cls || 'soft'}" data-notice="${n.key}" data-mark="${n.mark}">${n.html}<button class="link small" data-dismiss>باشه</button></div>`).join('')}

    ${plan}

    ${mealList ? `<section class="meals">
      ${Object.entries(MEALS).map(([k, label]) => {
        const items = list.filter(e => e.meal === k).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
        const mt = totals(items);
        return `<div class="meal card">
          <div class="meal-head">
            <h2>${label}</h2>
            <span class="muted">${items.length ? `${fa(Math.round(mt.kcal))} کالری` : ''}</span>
            <button class="icon-btn sm" data-add="${k}" aria-label="افزودن به ${label}">${icon.plus}</button>
          </div>
          ${items.map(e => `
            <button class="entry" data-entry="${e.id}">
              <span class="ename">${esc(e.name)}${e.is_veg ? ` <i class="veg">${icon.leaf}</i>` : ''}</span>
              <span class="eqty">${amountLabel(Number(e.qty), e.unit)}</span>
              <span class="ekcal">${fa(Math.round(e.kcal))}</span>
            </button>`).join('')}
        </div>`;
      }).join('')}
    </section>` : ''}
    ${mealList ? `<div class="fab-space"></div>
    <button class="fab" data-log>${icon.plus}<span>ثبت غذا</span></button>` : ''}`;

  root.querySelector('[data-prev]').onclick = () => { day = addDays(day, -1); renderToday(root); };
  root.querySelector('[data-next]').onclick = () => { if (!isToday) { day = addDays(day, 1); renderToday(root); } };
  root.querySelector('[data-today]')?.addEventListener('click', () => { day = today(); renderToday(root); });
  root.querySelector('[data-log]')?.addEventListener('click', () => openLogSheet({ day }));
  root.querySelectorAll('[data-add]').forEach(b => b.onclick = () => openLogSheet({ day, meal: b.dataset.add }));
  root.querySelectorAll('[data-entry]').forEach(b => b.onclick = () => openEntrySheet(s.entries.find(e => e.id === b.dataset.entry)));
  root.querySelector('[data-mode]').onclick = e => {
    const v = e.target.closest('button[data-v]')?.dataset.v;
    if (v && v !== (planMode ? 'plan' : 'count')) store.saveProfile({ ...p, mode: v });
  };
  const redraw = () => { if (root.querySelector('[data-mode]')) renderToday(root); };
  if (planMode) bindPlan(root, day, redraw);
  bindMotivation(root);
  bindVault(root);
  root.querySelectorAll('[data-dismiss]').forEach(b => b.onclick = () => {
    const n = b.closest('[data-notice]');
    dismiss(n.dataset.notice, n.dataset.mark);
    n.remove();
  });
  // last: generating the tip or today's magazine article redraws this screen
  const redrawAi = () => { if (root.querySelector('[data-mode]') && day === today()) renderToday(root); };
  if (isToday) { bindTip(redrawAi); bindMag(root, redrawAi); }
}
