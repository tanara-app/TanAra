// Weekly review. The week that just ended comes to «امروز» by itself as a card: its numbers,
// Hooshvareh's analysis and goal. Earlier weeks open in a sheet from «پیشرفت».
import * as store from '../data/store.js';
import { weekSummary, weekToReview } from '../domain/stats.js';
import { adherence } from '../domain/plan.js';
import { fa, kcal50, signed, esc } from '../lib/fa.js';
import { today, addDays, weekStart, weekLabel } from '../lib/dates.js';
import { icon, toast, sheet } from './dom.js';
import { cheer } from './mascot.js';
import { aiAvailable } from '../ai/hooshvareh.js';
import { head, reviewBody, reviewCard, bindReviewCard, autoReview } from './aiCards.js';
import { dismissed, dismiss } from './notices.js';

let ws = null;

export function renderReview(root) {
  const thisWeek = weekStart(today());
  if (!ws) ws = addDays(thisWeek, -7); // default: the week that just ended
  const s = store.get();
  const sum = weekSummary(s.entries, s.weights, ws);
  const r = s.reviews.find(x => x.week_start === ws) || {};
  const isCurrent = ws === thisWeek;
  const plan = adherence(s.ai_notes, s.entries, ws, isCurrent ? today() : addDays(ws, 6));

  root.innerHTML = `
    <div class="day-nav compact">
      <button class="icon-btn" data-prev aria-label="هفته‌ی قبل">${icon.chevR}</button>
      <div class="day-title"><b>${weekLabel(ws)}</b><small>${isCurrent ? 'همین هفته' : ws === addDays(thisWeek, -7) ? 'هفته‌ی گذشته' : ''}</small></div>
      <button class="icon-btn" data-next aria-label="هفته‌ی بعد" ${isCurrent ? 'disabled' : ''}>${icon.chevL}</button>
    </div>

    <section class="tiles">
      <div class="tile"><span>روزهای ثبت‌شده</span><b>${fa(sum.daysLogged)} <small>از ۷</small></b></div>
      <div class="tile"><span>میانگین کالری</span><b>${sum.avgKcal === null ? '—' : kcal50(sum.avgKcal)}</b><small>در روزهای ثبت‌شده</small></div>
      <div class="tile"><span>میانگین پروتئین</span><b>${sum.avgProtein === null ? '—' : fa(Math.round(sum.avgProtein))}</b><small>گرم در روز</small></div>
      <div class="tile"><span>تغییر میانگین وزن</span><b>${sum.weightChange === null ? '—' : signed(sum.weightChange)}</b><small>${sum.weightChange === null ? 'وزن کافی ثبت نشده' : 'کیلو نسبت به هفته‌ی قبل'}</small></div>
      ${plan.of ? `<div class="tile wide"><span>پایبندی به رژیم</span><b>${fa(plan.done)} <small>از ${fa(plan.of)} وعده طبق برنامه</small></b></div>` : ''}
    </section>

    ${reviewCard(ws)}

    <form class="card stack review-form" novalidate>
      <label class="field"><span>چه چیزی سخت بود؟</span><textarea name="hard" rows="3">${esc(r.hard || '')}</textarea></label>
      <label class="field"><span>هدف هفته‌ی بعد</span><textarea name="next_goal" rows="2" placeholder="یک چیز کوچک و مشخص">${esc(r.next_goal || '')}</textarea></label>
      <button class="btn primary block">ذخیره</button>
    </form>`;

  root.querySelector('[data-prev]').onclick = () => { ws = addDays(ws, -7); renderReview(root); };
  root.querySelector('[data-next]').onclick = () => { if (!isCurrent) { ws = addDays(ws, 7); renderReview(root); } };
  const form = root.querySelector('form');
  const save = (quiet) => {
    const F = form.elements;
    const next = { week_start: ws, good: r.good || '', hard: F.hard.value.trim(), next_goal: F.next_goal.value.trim() };
    if (next.hard === (r.hard || '') && next.next_goal === (r.next_goal || '')) {
      if (!quiet) toast('ذخیره شد');
      return;
    }
    store.saveReview(next);
    if (!quiet) { toast('ذخیره شد'); cheer('review'); }
  };
  form.onsubmit = e => { e.preventDefault(); save(false); };
  // also keep notes when the person just leaves the field
  form.querySelectorAll('textarea').forEach(t => t.addEventListener('change', () => save(true)));
  const shown = ws;
  bindReviewCard(root, ws, () => { if (root.isConnected && ws === shown) renderReview(root); }, goal => {
    form.elements.next_goal.value = goal;
    save(false);
  });
}

export function openReviews() {
  ws = null;
  sheet.open(body => {
    body.innerHTML = `<div class="sheet-head"><h2>مرور هفته‌ها</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div><div data-review></div>`;
    body.querySelector('[data-close]').onclick = () => sheet.close();
    renderReview(body.querySelector('[data-review]'));
  }, { tall: true });
}

/* ---------------- «امروز»: the week that just ended ---------------- */

const edCare = () => ['yes', 'unsure'].includes(store.profile()?.edHistory);
const weekDue = () => {
  const w = weekToReview(store.get().entries, today());
  return w && !dismissed('week', w) ? w : null;
};

// Folded to one line of numbers, so it doesn't push the meals down; the rest opens on a tap.
let weekOpen = false;

export function weekCard() {
  const w = weekDue();
  if (!w) return '';
  const s = store.get();
  const sum = weekSummary(s.entries, s.weights, w);
  const line = [`${fa(sum.daysLogged)} روز از ۷ ثبت`];
  if (!edCare()) {
    if (sum.avgKcal !== null) line.push(`میانگین ${kcal50(sum.avgKcal)} کالری`);
    if (sum.avgProtein !== null) line.push(`${fa(Math.round(sum.avgProtein))} گرم پروتئین`);
    if (sum.weightChange !== null) line.push(`وزن ${signed(sum.weightChange)} کیلو`);
  }
  return `<section class="card ai-card fold${weekOpen ? '' : ' folded'}" data-week-card>
    ${head('مرور هفته‌ی گذشته', `<small class="muted">${weekLabel(w)}</small>`)}
    <p class="small">${line.join(' · ')}</p>
    <div class="fold-body mt">
      ${reviewBody(w)}
    </div>
    <div class="week-foot">
      ${aiAvailable() ? `<button type="button" class="fold-h link small" aria-expanded="${weekOpen}">تحلیل و هدف این هفته${icon.chevD}</button>` : '<span></span>'}
      <button class="btn ghost sm" data-week-done>باشه</button>
    </div>
  </section>`;
}

export function bindWeekCard(root, refresh) {
  const card = root.querySelector('[data-week-card]');
  const w = weekDue();
  if (!card || !w) return;
  const saved = () => store.get().reviews.find(x => x.week_start === w) || {};
  const put = patch => { const r = saved(); store.saveReview({ week_start: w, good: r.good || '', hard: r.hard || '', next_goal: r.next_goal || '', ...patch }); };
  card.querySelector('[data-week-done]').onclick = () => { dismiss('week', w); card.remove(); };
  card.querySelector('.fold-h')?.addEventListener('click', e => {
    weekOpen = card.classList.toggle('folded') === false;
    e.currentTarget.setAttribute('aria-expanded', weekOpen);
  });
  bindReviewCard(card, w, refresh, goal => { put({ next_goal: goal }); toast('هدف این هفته ثبت شد'); cheer('review'); });
  autoReview(w, refresh);
}
