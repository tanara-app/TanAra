// Weekly review: last week's numbers and three short notes.
import * as store from '../data/store.js';
import { weekSummary } from '../domain/stats.js';
import { fa, kcal50, signed, esc } from '../lib/fa.js';
import { today, addDays, weekStart, weekLabel } from '../lib/dates.js';
import { icon, toast } from './dom.js';

let ws = null;

export function renderReview(root) {
  const thisWeek = weekStart(today());
  if (!ws) ws = addDays(thisWeek, -7); // default: the week that just ended
  const s = store.get();
  const sum = weekSummary(s.entries, s.weights, ws);
  const r = s.reviews.find(x => x.week_start === ws) || {};
  const isCurrent = ws === thisWeek;

  root.innerHTML = `
    <header class="page-head"><h1>مرور هفته</h1></header>
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
    </section>

    <form class="card stack review-form" novalidate>
      <label class="field"><span>چه چیزی خوب بود؟</span><textarea name="good" rows="3">${esc(r.good || '')}</textarea></label>
      <label class="field"><span>چه چیزی سخت بود؟</span><textarea name="hard" rows="3">${esc(r.hard || '')}</textarea></label>
      <label class="field"><span>هدف هفته‌ی بعد</span><textarea name="next_goal" rows="2" placeholder="یک چیز کوچک و مشخص">${esc(r.next_goal || '')}</textarea></label>
      <button class="btn primary block">ذخیره</button>
    </form>`;

  root.querySelector('[data-prev]').onclick = () => { ws = addDays(ws, -7); renderReview(root); };
  root.querySelector('[data-next]').onclick = () => { if (!isCurrent) { ws = addDays(ws, 7); renderReview(root); } };
  const form = root.querySelector('form');
  const save = (quiet) => {
    const F = form.elements;
    const next = { week_start: ws, good: F.good.value.trim(), hard: F.hard.value.trim(), next_goal: F.next_goal.value.trim() };
    if (next.good === (r.good || '') && next.hard === (r.hard || '') && next.next_goal === (r.next_goal || '')) {
      if (!quiet) toast('ذخیره شد');
      return;
    }
    store.saveReview(next);
    if (!quiet) toast('ذخیره شد');
  };
  form.onsubmit = e => { e.preventDefault(); save(false); };
  // also keep notes when the person just leaves the field
  form.querySelectorAll('textarea').forEach(t => t.addEventListener('change', () => save(true)));
}
