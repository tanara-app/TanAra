/*
  The phase of the road, on screen: losing, a two-week diet break, or maintenance — plus the
  goal weight. The card lives in «نمایه»; the notes (goal reached, a break is due, where the
  weight sits in its band, light logging, a gap in weighing, months held) show on «امروز» and
  «پیشرفت». The rules are in domain/phase.js.
*/
import * as store from '../data/store.js';
import { effectiveTargets, phaseOn, maintenanceKcal, rampKcal, correcting, RAMP_STEP, CORRECT_KCAL } from '../domain/targets.js';
import { goalReached, goalProgress, breakDue, zone, correctionDue, lightDue, lightOn, lapse, milestone, maintainWeeks, withPhase, BREAK_DAYS, REGAIN_KG, BAND_KG, CORRECT_DAYS } from '../domain/phase.js';
import { nextTargets } from '../domain/energy.js';
import { sortedWeights, rollingAvg } from '../domain/stats.js';
import { fa, kcal50, parseNum } from '../lib/fa.js';
import { today, diffDays, faDM } from '../lib/dates.js';
import { sheet, toast, confirmBox, icon } from './dom.js';
import { dismissed, dismiss } from './notices.js';
import { startChat } from './chat.js';
import { aiAvailable } from '../ai/hooshvareh.js';
import { goMeasure } from './measure.js';

const LABEL = { loss: 'کاهش وزن', maintain: 'نگهداری', break: 'استراحت از رژیم' };
export const phaseLabel = (p, day = today()) => LABEL[phaseOn(p, day)];

const weights = () => sortedWeights(store.get().weights);
// the weight to hold: the 7-day average, or the last weigh-in
function currentKg() {
  const w = weights();
  return rollingAvg(w, today()) ?? (w.length ? Number(w[w.length - 1].kg) : null);
}

const BREAK_NOTE = 'شواهد درباره‌ی این‌که استراحت، چربی‌سوزی را تندتر کند قطعی نیست؛ فایده‌ی اصلی‌اش این است که ادامه دادن یک رژیم طولانی را راحت‌تر می‌کند.';

// Going into maintenance: the targets are worked out again at today's weight (the stored
// figure may be from several kilos ago, and a lighter body uses less), and the climb starts
// from the target losing ended on. Manual settings stay.
function toMaintain(p, t) {
  const s = store.get();
  const now = currentKg();
  const kg = now !== null ? Math.round(now * 10) / 10 : p.targets?.baseWeight;
  const from = effectiveTargets(p, t).kcal;
  const { t: next } = nextTargets(p, s.entries, s.weights, kg, t);
  const targets = { ...p.targets, kcal: next.kcal, protein: next.protein, baseWeight: kg, computedAt: t, tdee: next.tdee, source: next.measured ? 'measured' : 'formula' };
  return withPhase({ ...p, targets }, 'maintain', { day: t, kg, kcal: from });
}

async function go(action) {
  const p = store.profile();
  const t = today();
  const kcal = kcal50(maintenanceKcal(p));
  if (action === 'maintain') {
    const next = toMaintain(p, t);
    const full = kcal50(maintenanceKcal(next));
    const climb = rampKcal(next, t);
    if (!(await confirmBox(climb
      ? `سطح نگهداری‌ات با وزن امروز حدود ${full} کالری است. هدف یک‌دفعه به آن نمی‌پرد: از ${kcal50(climb)} شروع می‌شود و هر هفته ${fa(RAMP_STEP)} کالری بالا می‌رود تا برسد. یکی دو کیلوی اول روزهای اول معمولاً آب است، نه چربی. هر وقت خواستی می‌توانی به کاهش وزن برگردی.`
      : `از امروز هدف کالری‌ات روی سطح نگهداری (${full}) می‌رود تا وزنت ثابت بماند. هر وقت خواستی می‌توانی به کاهش وزن برگردی.`, 'برو روی نگهداری'))) return;
    store.saveProfile(next);
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
  } else if (action === 'correct') {
    const c = withPhase(p, 'correct', { day: t });
    if (!(await confirmBox(`${fa(CORRECT_DAYS)} روز هدف کالری ${kcal50(effectiveTargets(c, t).kcal)} می‌شود (${fa(CORRECT_KCAL)} کمتر از نگهداری) تا وزن به بازه‌اش برگردد. بعد خودکار به نگهداری برمی‌گردد.`, 'شروع اصلاح'))) return;
    store.saveProfile(c);
    toast('اصلاح دوهفته‌ای شروع شد');
  } else if (action === 'endCorrect') {
    if (!(await confirmBox('اصلاح همین حالا تمام شود و هدف به سطح نگهداری برگردد؟', 'تمام کن'))) return;
    store.saveProfile(withPhase(p, 'endCorrect', { day: t }));
    toast('اصلاح تمام شد');
  } else if (action === 'light') {
    if (!(await confirmBox('از این به بعد لازم نیست هر روز غذا ثبت کنی؛ چند روز در هفته کافی است و یادآور شبانه‌ی ثبت غذا فقط وقتی می‌آید که وزنت از بازه بالاتر برود. وزن‌کشی منظم را نگه دار: حالا آن است که خبر می‌دهد. اگر وزنت از بازه بیرون برود، ثبت کامل خودش برمی‌گردد.', 'ثبت سبک'))) return;
    store.saveProfile(withPhase(p, 'light', { day: t }));
    toast('ثبت سبک روشن شد');
  } else if (action === 'full') {
    store.saveProfile(withPhase(p, 'full', { day: t }));
    toast('ثبت کامل برگشت');
  } else if (action === 'raise') {
    // losing in maintenance: the level is set too low
    const tdee = Math.round(maintenanceKcal(p) + RAMP_STEP);
    if (!(await confirmBox(`در نگهداری وزنت دارد پایین می‌رود؛ یعنی سطح نگهداری کمی پایین تنظیم شده. ${fa(RAMP_STEP)} کالری بالاتر برود (${kcal50(tdee)})؟`, 'بالا ببر'))) return;
    store.saveProfile({ ...p, targets: { ...p.targets, tdee, computedAt: t } });
    toast('سطح نگهداری بالا رفت');
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

// In maintenance: the band, where the average is, the climb or the correction, light logging.
function maintainBlock(p, t) {
  const z = zone(p, weights(), t);
  const kg = Number(p.maintainFrom?.kg);
  const weeks = maintainWeeks(p, t);
  const climb = rampKcal(p, t);
  const tag = { green: 'در بازه', yellow: 'کمی بالاتر از بازه', red: 'بالاتر از بازه', low: 'پایین‌تر از بازه' };
  return `${kg > 0 ? `<div class="kv"><span>بازه‌ی وزن</span><b>${fa(kg - BAND_KG, 1)} تا ${fa(kg + BAND_KG, 1)} <small>کیلو</small></b></div>
    ${z ? `<div class="kv"><span>میانگین ۷ روزه</span><b class="zone-${z.zone}">${fa(z.avg, 1)} <small>· ${tag[z.zone]}</small></b></div>` : ''}` : ''}
    <p class="muted small">${weeks >= 4 ? `${fa(Math.floor(weeks / 4.35))} ماه` : `${fa(weeks)} هفته`} در نگهداری.${climb ? ` هدف هر هفته ${fa(RAMP_STEP)} کالری بالا می‌رود تا به ${kcal50(maintenanceKcal(p))} برسد.` : ''}${correcting(p, t) ? ` اصلاح کوتاه تا ${faDM(p.correctUntil)}.` : ''}</p>
    <label class="check mt"><input type="checkbox" data-light ${p.lightLog ? 'checked' : ''}><span>ثبت سبک<small class="muted">${p.lightLog ? (lightOn(p, weights(), t) ? 'ثبت غذا اختیاری است؛ وزن‌کشی نه' : 'تا وزنت به بازه برگردد، ثبت کامل لازم است') : 'وقتی وزن در بازه است، لازم نیست هر روز غذا ثبت کنی'}</small></span></label>`;
}

export function phaseCard() {
  const p = store.profile();
  const t = today();
  const phase = phaseOn(p, t);
  const g = goalProgress(p, weights(), t);
  const kcal = kcal50(maintenanceKcal(p));
  const now = kcal50(effectiveTargets(p, t).kcal);
  const text = phase === 'loss' ? 'هدف کالری: مصرف روزانه‌ات منهای ۵۰۰.'
    : phase === 'break' ? `در استراحت از رژیم هستی (روز ${fa(diffDays(t, p.breakFrom) + 1)} از ${fa(diffDays(p.breakUntil, p.breakFrom) + 1)}، تا ${faDM(p.breakUntil)}): هدف کالری روی سطح نگهداری (${kcal}) است.`
    : correcting(p, t) ? `هدف کالری فعلاً ${now} است (${fa(CORRECT_KCAL)} کمتر از نگهداری) تا وزن به بازه‌اش برگردد.`
    : rampKcal(p, t) ? `هدف کالری این هفته ${now} است و آرام‌آرام تا سطح نگهداری (${kcal}) بالا می‌رود.`
    : `هدف کالری روی سطح نگهداری (${kcal}) است تا وزنت ثابت بماند.`;
  return `<section class="card">
    <h2 class="card-h">مرحله</h2>
    <div class="seg" data-phase-seg role="tablist" aria-label="مرحله">
      <button type="button" role="tab" data-phase-act="${phase === 'maintain' ? 'loss' : ''}" aria-selected="${phase !== 'maintain'}" class="${phase !== 'maintain' ? 'on' : ''}">کاهش وزن</button>
      <button type="button" role="tab" data-phase-act="${phase === 'maintain' ? '' : 'maintain'}" aria-selected="${phase === 'maintain'}" class="${phase === 'maintain' ? 'on' : ''}">نگهداری</button>
    </div>
    <p class="muted small">${text}</p>
    ${phase === 'maintain' ? maintainBlock(p, t) : ''}
    ${g && phase !== 'maintain' ? `<div class="kv"><span>وزن هدف</span><b>${fa(p.goalKg, 1)} <small>کیلو${g.left > 0 ? ` · ${fa(g.left, 1)} کیلو مانده` : ' · رسیده‌ای'}</small></b></div>
      <div class="bar goal-bar"><i style="width:${Math.round(g.done * 100)}%"></i></div>` : ''}
    <div class="row gap mt">
      ${phase !== 'maintain' ? `<button class="btn grow" data-phase-act="goal">${p.goalKg ? 'تغییر وزن هدف' : 'تعیین وزن هدف'}</button>` : ''}
      ${phase === 'loss' ? '<button class="btn grow" data-phase-act="break">استراحت دوهفته‌ای</button>' : ''}
      ${phase === 'break' ? '<button class="btn grow" data-phase-act="endBreak">پایان استراحت</button>' : ''}
      ${correcting(p, t) ? '<button class="btn grow" data-phase-act="endCorrect">پایان اصلاح</button>' : ''}
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
  const z = zone(p, w, t);
  if (z?.zone === 'red') out.push(`<div class="note soft"><strong>وزنت دارد برمی‌گردد</strong>
    <p>میانگین ۷ روزه‌ات ${fa(z.gain, 1)} کیلو بالاتر از وزنی است که نگهداری را با آن شروع کردی (بیشتر از ${fa(REGAIN_KG)} کیلو). زود جلویش را گرفتن خیلی راحت‌تر از بعداً است.${aiAvailable() ? ' با هوشواره ببین چه عوض شده.' : ''}</p>
    <div class="row gap"><button class="btn sm" data-phase-act="loss">برگشت به کاهش وزن</button>${aiAvailable() ? '<button class="btn ghost sm" data-phase-ask="regain">از هوشواره بپرس</button>' : ''}</div></div>`);
  const cd = correctionDue(p, w, t);
  if (cd && !dismissed('correct', t)) out.push(`<div class="note soft" data-phase-note="correct"><strong>وزنت کمی بالاتر از بازه است</strong>
    <p>میانگین ۷ روزه‌ات ${fa(cd.avg, 1)} کیلو است؛ بازه‌ات تا ${fa(cd.hi, 1)}. حالا که فاصله کم است، دو هفته با ${fa(CORRECT_KCAL)} کالری کمتر برش می‌گرداند.</p>
    <div class="row gap"><button class="btn sm" data-phase-act="correct">اصلاح دوهفته‌ای</button><button class="btn ghost sm" data-phase-dismiss="correct:${t}">امروز نه</button></div></div>`);
  if (z?.zone === 'low' && !correcting(p, t) && !dismissed('low', t)) out.push(`<div class="note soft" data-phase-note="low"><strong>در نگهداری وزنت دارد کم می‌شود</strong>
    <p>میانگین ۷ روزه‌ات ${fa(-z.gain, 1)} کیلو زیر وزنی است که نگهش می‌داری. اگر عمدی نیست، سطح نگهداری‌ات کمی پایین است.</p>
    <div class="row gap"><button class="btn sm" data-phase-act="raise">${fa(RAMP_STEP)} کالری بالاتر</button><button class="btn ghost sm" data-phase-dismiss="low:${t}">امروز نه</button></div></div>`);
  if (p.lightLog && phaseOn(p, t) === 'maintain' && !lightOn(p, w, t)) out.push(`<div class="note soft"><strong>ثبت کامل برگشت</strong>
    <p>تا وزنت به بازه برگردد، هر روز همه‌ی وعده‌ها را ثبت کن؛ بعد خودش دوباره سبک می‌شود.</p></div>`);
  if (lightDue(p, w, t) && !dismissed('light', p.maintainFrom.day)) out.push(`<div class="note soft" data-phase-note="light"><strong>${fa(maintainWeeks(p, t))} هفته است وزنت را در بازه نگه داشته‌ای</strong>
    <p>اگر ثبت هر روزه خسته‌ات کرده، می‌توانی ثبت غذا را سبک کنی و فقط وزن‌کشی منظم را نگه داری. اگر وزن از بازه بیرون برود، ثبت کامل خودش برمی‌گردد.</p>
    <div class="row gap"><button class="btn sm" data-phase-act="light">ثبت سبک</button><button class="btn ghost sm" data-phase-dismiss="light:${p.maintainFrom.day}">نه، کامل ثبت می‌کنم</button></div></div>`);
  const ms = milestone(p, w, t);
  if (ms && !dismissed('milestone', `${p.maintainFrom.day}:${ms.months}`)) out.push(`<div class="note soft" data-phase-note="milestone"><strong>${ms.months >= 12 && ms.months % 12 === 0 ? `${fa(ms.months / 12)} سال` : `${fa(ms.months)} ماه`} است وزنت را نگه داشته‌ای</strong>
    <p>کم کردن وزن نصف راه است؛ نگه داشتنش همان نصف سخت‌تر است، و تو داری انجامش می‌دهی.</p>
    <button class="btn ghost sm" data-phase-dismiss="milestone:${p.maintainFrom.day}:${ms.months}">ممنون</button></div>`);
  const gap = lapse(w, t, p.reminders?.weigh?.every);
  if (gap && !dismissed('lapse', gap.last)) out.push(`<div class="note soft" data-phase-note="lapse"><strong>${fa(gap.days)} روز است وزن ثبت نشده</strong>
    <p>${phaseOn(p, t) === 'maintain' ? 'برگشت وزن معمولاً با کنار گذاشتن ترازو شروع می‌شود، نه با یک وعده‌ی زیاد. ' : ''}یک وزن‌کشی صبح، ناشتا، کافی است تا دوباره بدانی کجایی؛ عددش هر چه باشد، بی‌خبری بدتر است.</p>
    <div class="row gap"><button class="btn sm" data-phase-weigh>ثبت وزن</button><button class="btn ghost sm" data-phase-dismiss="lapse:${gap.last}">بعداً</button></div></div>`);
  return out.join('');
}

const ASK = {
  regain: 'وزنم در نگهداری دارد برمی‌گردد. با نگاه به ثبت‌هایم بگو چه عوض شده و از این هفته چه کنم؟',
};

// Wires the card and the notes, wherever they were drawn.
export function bindPhase(root) {
  root.querySelectorAll('[data-phase-act]').forEach(b => b.onclick = () => {
    const act = b.dataset.phaseAct;
    if (act === 'goal') openGoal();
    else if (act) go(act);
  });
  root.querySelectorAll('[data-phase-dismiss]').forEach(b => b.onclick = () => {
    // "kind:mark", or a bare mark for the diet-break note
    const v = b.dataset.phaseDismiss;
    const i = v.indexOf(':');
    const kind = b.closest('[data-phase-note]')?.dataset.phaseNote;
    if (kind && i > 0) dismiss(kind, v.slice(i + 1)); else dismiss('break', v);
    b.closest('.note').remove();
  });
  root.querySelectorAll('[data-phase-ask]').forEach(b => b.onclick = () => { startChat(ASK[b.dataset.phaseAsk]); location.hash = '#/ai'; });
  root.querySelectorAll('[data-phase-weigh]').forEach(b => b.onclick = () => { goMeasure(); });
  root.querySelector('[data-light]')?.addEventListener('change', e => go(e.target.checked ? 'light' : 'full').then(() => {
    e.target.checked = !!store.profile()?.lightLog;
  }));
}
