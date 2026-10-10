/*
  The phase of the road, on screen: losing, a two-week diet break, or maintenance — plus the
  goal weight. The card lives in «نمایه»; the notes (goal reached, a break is due, weight
  creeping back) show on «امروز» and «پیشرفت». The rules are in domain/phase.js.
*/
import * as store from '../data/store.js';
import { effectiveTargets, phaseOn, maintenanceKcal } from '../domain/targets.js';
import { goalReached, goalProgress, breakDue, regain, withPhase, BREAK_DAYS, REGAIN_KG } from '../domain/phase.js';
import { sortedWeights, rollingAvg } from '../domain/stats.js';
import { fa, kcal50, parseNum } from '../lib/fa.js';
import { today, diffDays, faDM } from '../lib/dates.js';
import { sheet, toast, confirmBox, icon } from './dom.js';
import { dismissed, dismiss } from './notices.js';

const LABEL = { loss: 'کاهش وزن', maintain: 'نگهداری', break: 'استراحت از رژیم' };
export const phaseLabel = (p, day = today()) => LABEL[phaseOn(p, day)];

const weights = () => sortedWeights(store.get().weights);
// the weight to hold: the 7-day average, or the last weigh-in
function currentKg() {
  const w = weights();
  return rollingAvg(w, today()) ?? (w.length ? Number(w[w.length - 1].kg) : null);
}

const BREAK_NOTE = 'شواهد درباره‌ی این‌که استراحت، چربی‌سوزی را تندتر کند قطعی نیست؛ فایده‌ی اصلی‌اش این است که ادامه دادن یک رژیم طولانی را راحت‌تر می‌کند.';

async function go(action) {
  const p = store.profile();
  const t = today();
  const kcal = kcal50(maintenanceKcal(p));
  if (action === 'maintain') {
    if (!(await confirmBox(`از امروز هدف کالری‌ات روی سطح نگهداری (${kcal}) می‌رود تا وزنت ثابت بماند. هر وقت خواستی می‌توانی به کاهش وزن برگردی.`, 'برو روی نگهداری'))) return;
    store.saveProfile(withPhase(p, 'maintain', { day: t, kg: currentKg() }));
    toast('مرحله‌ی نگهداری شروع شد');
  } else if (action === 'loss') {
    if (!(await confirmBox(`هدف کالری‌ات به ${kcal50(effectiveTargets(withPhase(p, 'loss', { day: t }), t).kcal)} برمی‌گردد (مصرف روزانه منهای ۵۰۰).`, 'برگرد به کاهش وزن'))) return;
    store.saveProfile(withPhase(p, 'loss', { day: t }));
    toast('برگشتی به کاهش وزن');
  } else if (action === 'break') {
    if (!(await confirmBox(`${fa(BREAK_DAYS)} روز در سطح نگهداری (${kcal} کالری) می‌خوری و بعد خودکار به کاهش وزن برمی‌گردی. ${BREAK_NOTE}`, 'شروع استراحت'))) return;
    store.saveProfile(withPhase(p, 'break', { day: t }));
    toast('استراحت دوهفته‌ای شروع شد');
  } else if (action === 'endBreak') {
    if (!(await confirmBox('استراحت همین حالا تمام شود و هدف کالری به کاهش وزن برگردد؟', 'تمام کن'))) return;
    store.saveProfile(withPhase(p, 'endBreak', { day: t }));
    toast('استراحت تمام شد');
  }
}

function openGoal() {
  const p = store.profile();
  const now = currentKg();
  sheet.open(body => {
    body.innerHTML = `
      <div class="sheet-head"><h2>وزن هدف</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <form class="stack" novalidate>
        <label class="field"><span>می‌خواهی به چه وزنی برسی؟ (کیلوگرم)</span><input name="kg" inputmode="decimal" value="${p.goalKg ? fa(p.goalKg, 1) : ''}" placeholder="مثلاً ${fa(Math.round(25 * (p.heightCm / 100) ** 2))}"></label>
        <p class="muted small">وقتی میانگین ۷ روزه‌ی وزنت به این عدد برسد، تن‌آرا پیشنهاد می‌دهد به مرحله‌ی نگهداری بروی. برای قد تو، وزن با نمایه‌ی توده‌ی بدنی ۲۵ حدود ${fa(Math.round(25 * (p.heightCm / 100) ** 2))} کیلو است؛ هدف می‌تواند بالاتر از آن و مرحله‌به‌مرحله باشد.</p>
        <p class="err" hidden></p>
        <button class="btn primary block big">ذخیره</button>
        ${p.goalKg ? '<button type="button" class="btn danger-ghost block" data-clear>برداشتن وزن هدف</button>' : ''}
      </form>`;
    body.querySelector('[data-close]').onclick = () => sheet.close();
    body.querySelector('[data-clear]')?.addEventListener('click', () => { store.saveProfile({ ...store.profile(), goalKg: null }); sheet.close(); });
    body.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const kg = parseNum(e.target.elements.kg.value);
      const err = body.querySelector('.err');
      const floor = 18.5 * (p.heightCm / 100) ** 2; // under this BMI is underweight
      const msg = !(kg >= 35 && kg <= 350) ? 'وزن هدف را به کیلوگرم وارد کن.'
        : kg < floor ? `برای قد تو، کمتر از ${fa(Math.ceil(floor))} کیلو کم‌وزنی حساب می‌شود؛ هدف پایین‌تر از آن تنظیم نمی‌شود.`
        : now !== null && kg > now + 0.05 && phaseOn(p) === 'loss' ? 'وزن هدف باید کمتر از وزن الانت باشد.' : null;
      if (msg) { err.textContent = msg; err.hidden = false; return; }
      store.saveProfile({ ...store.profile(), goalKg: Math.round(kg * 10) / 10 });
      sheet.close();
      toast('وزن هدف ذخیره شد');
    };
  });
}

/* ---------------- «نمایه»: the phase card ---------------- */

export function phaseCard() {
  const p = store.profile();
  const t = today();
  const phase = phaseOn(p, t);
  const g = goalProgress(p, weights(), t);
  const kcal = kcal50(maintenanceKcal(p));
  const text = phase === 'loss' ? 'هدف کالری: مصرف روزانه‌ات منهای ۵۰۰.'
    : phase === 'break' ? `در استراحت از رژیم هستی (روز ${fa(diffDays(t, p.breakFrom) + 1)} از ${fa(diffDays(p.breakUntil, p.breakFrom) + 1)}، تا ${faDM(p.breakUntil)}): هدف کالری روی سطح نگهداری (${kcal}) است.`
    : `هدف کالری روی سطح نگهداری (${kcal}) است تا وزنت ثابت بماند.`;
  return `<section class="card">
    <h2 class="card-h">مرحله</h2>
    <div class="seg" data-phase-seg role="tablist" aria-label="مرحله">
      <button type="button" role="tab" data-phase-act="${phase === 'maintain' ? 'loss' : ''}" aria-selected="${phase !== 'maintain'}" class="${phase !== 'maintain' ? 'on' : ''}">کاهش وزن</button>
      <button type="button" role="tab" data-phase-act="${phase === 'maintain' ? '' : 'maintain'}" aria-selected="${phase === 'maintain'}" class="${phase === 'maintain' ? 'on' : ''}">نگهداری</button>
    </div>
    <p class="muted small">${text}</p>
    ${g ? `<div class="kv"><span>وزن هدف</span><b>${fa(p.goalKg, 1)} <small>کیلو${g.left > 0 ? ` · ${fa(g.left, 1)} کیلو مانده` : ' · رسیده‌ای'}</small></b></div>
      <div class="bar goal-bar"><i style="width:${Math.round(g.done * 100)}%"></i></div>` : ''}
    <div class="row gap mt">
      <button class="btn grow" data-phase-act="goal">${p.goalKg ? 'تغییر وزن هدف' : 'تعیین وزن هدف'}</button>
      ${phase === 'loss' ? '<button class="btn grow" data-phase-act="break">استراحت دوهفته‌ای</button>' : ''}
      ${phase === 'break' ? '<button class="btn grow" data-phase-act="endBreak">پایان استراحت</button>' : ''}
    </div>
  </section>`;
}

/* ---------------- «امروز» and «پیشرفت»: what the phase asks for ---------------- */

export function phaseNotes() {
  const p = store.profile();
  const t = today();
  const w = weights();
  const out = [];
  const reached = goalReached(p, w, t);
  if (reached) out.push(`<div class="note soft"><strong>به وزن هدفت رسیدی</strong>
    <p>میانگین ۷ روزه‌ی وزنت ${fa(reached.avg, 1)} کیلو است؛ هدفت ${fa(p.goalKg, 1)} بود. حالا مهم‌ترین کار نگه داشتن همین وزن است: هدف کالری را روی سطح نگهداری بگذار.</p>
    <button class="btn primary sm" data-phase-act="maintain">برو روی نگهداری</button></div>`);
  const due = breakDue(p, t);
  const mark = due ? `${due.since}:${Math.floor(due.weeks / 4)}` : '';
  if (due && !reached && !dismissed('break', mark)) out.push(`<div class="note soft"><strong>${fa(due.weeks)} هفته است پشت‌سرهم در کسری کالری هستی</strong>
    <p>اگر خسته شده‌ای، یک استراحت دوهفته‌ای در سطح نگهداری می‌تواند ادامه دادن را راحت‌تر کند. ${BREAK_NOTE} اختیاری است.</p>
    <div class="row gap"><button class="btn sm" data-phase-act="break">استراحت دوهفته‌ای</button><button class="btn ghost sm" data-phase-dismiss="${mark}">فعلاً نه</button></div></div>`);
  const back = regain(p, w, t);
  if (back) out.push(`<div class="note soft"><strong>وزنت دارد برمی‌گردد</strong>
    <p>میانگین ۷ روزه‌ات ${fa(back.gain, 1)} کیلو بالاتر از وزنی است که نگهداری را با آن شروع کردی (بیشتر از ${fa(REGAIN_KG)} کیلو). زود جلویش را گرفتن خیلی راحت‌تر از بعداً است.</p>
    <button class="btn sm" data-phase-act="loss">برگشت به کاهش وزن</button></div>`);
  return out.join('');
}

// Wires the card and the notes, wherever they were drawn.
export function bindPhase(root) {
  root.querySelectorAll('[data-phase-act]').forEach(b => b.onclick = () => {
    const act = b.dataset.phaseAct;
    if (act === 'goal') openGoal();
    else if (act) go(act);
  });
  root.querySelectorAll('[data-phase-dismiss]').forEach(b => b.onclick = () => {
    dismiss('break', b.dataset.phaseDismiss);
    b.closest('.note').remove();
  });
}
