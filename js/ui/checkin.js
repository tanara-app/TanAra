/*
  «برگشت به مسیر»: when the record shows the diet slipping (domain/drift.js), or when they say
  so themselves, the app does not just warn. It asks what has been going on — mood, body, life,
  the diet itself — and Hooshvareh puts that next to the record to find the likely cause and a
  small plan aimed at it. A week later it asks how the plan went, and plans again from there.

  Each check-in is an ai_note `checkin:<day>`: what was noticed, what they said, what Hooshvareh
  made of it, and later the outcome. Hooshvareh sees past check-ins in every analysis.
*/
import * as store from '../data/store.js';
import { ask, aiAvailable, aiOnline, md, sparkle } from '../ai/hooshvareh.js';
import { drift, lastCheckin, checkinState } from '../domain/drift.js';
import { effectiveTargets, phaseOn } from '../domain/targets.js';
import { adherence } from '../domain/plan.js';
import { lightOn } from '../domain/phase.js';
import { sortedWeights } from '../domain/stats.js';
import { today, addDays, weekStart, faDM } from '../lib/dates.js';
import { fa, esc } from '../lib/fa.js';
import { sheet, toast, confirmBox, icon } from './dom.js';
import { dismissed, dismiss } from './notices.js';
import { startChat } from './chat.js';

const CAUSES = [
  ['حال و روان', ['استرس', 'غم یا دل‌گرفتگی', 'اضطراب و نگرانی', 'بی‌حوصلگی', 'تنهایی', 'خستگی ذهنی', 'عصبانیت']],
  ['بدن', ['خواب کم یا بد', 'گرسنگی زیاد', 'هوس خوراکی یا شیرینی', 'بیماری یا درد', 'تغییر دارو', 'دوران قاعدگی']],
  ['زندگی', ['کار یا درس زیاد', 'مشکل خانوادگی یا رابطه', 'مهمانی و بیرون‌خوری', 'سفر', 'نگرانی مالی', 'به هم خوردن برنامه‌ی روزانه']],
  ['خود رژیم', ['رژیم تکراری و خسته‌کننده شده', 'انگیزه‌ام کم شده', 'نتیجه نمی‌بینم', 'ثبت کردن خسته‌ام کرده', 'غذای مناسب دم دستم نبود', 'پرخوری بی‌اختیار', 'نمی‌دانم چرا']],
];
const MOODS = ['خیلی بد', 'بد', 'معمولی', 'خوب', 'خیلی خوب'];
const OUTCOMES = { good: 'خوب پیش رفت', some: 'نصفه‌نیمه', no: 'نشد' };

const edCare = p => ['yes', 'unsure'].includes(p?.edHistory);

// What the record shows today, or null.
export function signsNow() {
  const s = store.get();
  const p = store.profile();
  if (!p) return null;
  const t = today();
  return drift({
    entries: s.entries, weights: s.weights, waists: s.waists,
    phase: phaseOn(p, t), light: lightOn(p, sortedWeights(s.weights), t),
    kcalOn: d => effectiveTargets(p, d)?.kcal,
    adherence: p.mode === 'plan' ? (from, to) => adherence(s.ai_notes, s.entries, from, to) : null,
  }, t);
}

// Each sign in plain words. With a possible eating-disorder history, no weight, waist or
// calorie numbers: only that the routine has shifted.
function signLines(signs, p) {
  if (!signs) return [];
  const care = edCare(p);
  const out = [];
  if (signs.weight && !care) out.push(`میانگین وزنت در دو هفته‌ی اخیر ${fa(signs.weight.gain, 1)} کیلو بالاتر از هفته‌های قبلش بوده.`);
  if (signs.waist && !care) out.push(`دور کمرت از ${fa(signs.waist.from, 1)} به ${fa(signs.waist.to, 1)} سانت رسیده.`);
  if (signs.over && !care) out.push(`${fa(signs.over.days)} روز از هفته‌ی گذشته به‌طور میانگین ${fa(signs.over.by)} کالری بالاتر از هدف بوده.`);
  if (signs.logging) out.push(`هفته‌ی گذشته ${fa(signs.logging.now)} روز ثبت کرده‌ای؛ معمولاً حدود ${fa(Math.round(signs.logging.before))} روز.`);
  if (signs.plan) out.push(`هفته‌ی گذشته ${fa(signs.plan.now)}٪ وعده‌ها طبق رژیم بوده؛ قبلش ${fa(signs.plan.before)}٪.`);
  if (!out.length) out.push('این روزها روالت کمی به هم خورده.');
  return out;
}

const head = (title, extra = '') => `<div class="ai-card-h"><span class="ai-mark">${sparkle(16)}</span><b>${title}</b>${extra}</div>`;

/* ---------------- Today: the card ---------------- */

export function checkinCard() {
  if (!aiAvailable()) return '';
  const p = store.profile();
  const t = today();
  const last = lastCheckin(store.get().ai_notes);
  const state = checkinState(last, t);
  if (state === 'follow') return `<section class="card ai-card" data-checkin-card>
    ${head('برنامه‌ی برگشت چطور پیش رفت؟')}
    <p class="muted small">${faDM(last.key.slice(8))} با هم برنامه‌ای چیدیم${last.data?.goal ? `؛ هدفش این بود: <b>${esc(last.data.goal.replace(/[.!]\s*$/, ''))}</b>` : ''}.</p>
    <div class="row gap wrap">${Object.entries(OUTCOMES).map(([k, l]) => `<button class="btn sm${k === 'good' ? '' : ' ghost'}" data-checkin-outcome="${k}">${l}</button>`).join('')}</div>
  </section>`;
  if (state === 'quiet') return '';
  const signs = signsNow();
  // in maintenance a weight above the band has its own notes, which lead here too
  if (!signs || dismissed('drift', weekStart(t))) return '';
  return `<section class="card ai-card" data-checkin-card>
    ${head('انگار کمی از مسیر دور شده‌ای')}
    <ul class="small checkin-signs">${signLines(signs, p).map(l => `<li>${l}</li>`).join('')}</ul>
    <p class="muted small">این برای همه پیش می‌آید و معمولاً دلیلی دارد: خستگی، استرس، خواب، یک اتفاق، یا خود رژیم. بیا با هم ببینیم چه شده و یک برنامه‌ی کوچک برای برگشت بچینیم.</p>
    <div class="row gap"><button class="btn sm" data-checkin-open>بیا ببینیم چه شده</button><button class="btn ghost sm" data-checkin-later>این هفته نه</button></div>
  </section>`;
}

/* ---------------- Progress: always reachable, and the latest plan ---------------- */

export function checkinEntry() {
  if (!aiAvailable()) return '';
  const last = lastCheckin(store.get().ai_notes);
  const recent = last && checkinState(last, today()) !== null ? last : null;
  return `<section class="card ai-card">
    ${head('برگشت به مسیر', recent ? `<small class="muted">${faDM(recent.key.slice(8))}</small>` : '')}
    ${recent?.data?.steps?.length ? `<div class="ai-text"><ol>${recent.data.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol></div>` : '<p class="muted small">وقتی حس می‌کنی رژیم از دستت در رفته، به هوشواره بگو این روزها چه خبر است؛ کنار ثبت‌هایت می‌گذاردش، ریشه را پیدا می‌کند و یک برنامه‌ی کوچک برای برگشت می‌چیند.</p>'}
    <button class="btn ${recent ? 'ghost sm' : 'block'}" data-checkin-open>${recent ? 'دوباره با هوشواره بررسی کنیم' : 'از مسیر دور شده‌ام'}</button>
  </section>`;
}

export function bindCheckin(root, refresh) {
  root.querySelectorAll('[data-checkin-open]').forEach(b => b.onclick = () => openCheckin({ onDone: refresh }));
  root.querySelector('[data-checkin-later]')?.addEventListener('click', e => {
    dismiss('drift', weekStart(today()));
    e.target.closest('[data-checkin-card]').remove();
  });
  root.querySelectorAll('[data-checkin-outcome]').forEach(b => b.onclick = () => {
    const last = lastCheckin(store.get().ai_notes);
    const outcome = b.dataset.checkinOutcome;
    const done = { ...last, data: { ...last.data, outcome } };
    store.saveNote(done);
    if (outcome === 'good') { toast('عالی! همین را ادامه بده.'); refresh(); return; }
    openCheckin({ follow: done, onDone: refresh });
  });
}

/* ---------------- The check-in itself ---------------- */

// `follow`: the earlier check-in whose plan did not fully work, so this one builds on it.
export function openCheckin({ follow = null, onDone = () => {} } = {}) {
  const p = store.profile();
  const signs = signsNow();
  const picked = new Set();
  let mood = null;
  sheet.open(body => {
    const form = () => {
      body.innerHTML = `
        <div class="sheet-head"><h2>برگشت به مسیر</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
        ${follow ? `<p class="small">برنامه‌ی ${faDM(follow.key.slice(8))} ${follow.data?.outcome === 'some' ? 'نصفه‌نیمه پیش رفت' : 'جواب نداد'}. اشکالی ندارد؛ بگو این بار چه چیزی سد راه شد تا برنامه را جور دیگری بچینیم.</p>`
          : signs ? `<div class="note soft"><strong>چیزی که در ثبت‌هایت دیدم</strong><ul class="small checkin-signs">${signLines(signs, p).map(l => `<li>${l}</li>`).join('')}</ul></div>`
          : ''}
        <p class="field-label">این روزها حالت کلاً چطور است؟</p>
        <div class="seg checkin-mood" data-mood>${MOODS.map((l, i) => `<button type="button" data-v="${i + 1}">${l}</button>`).join('')}</div>
        <p class="field-label">این روزها چه چیزهایی بوده؟ <small class="muted">هر چند تا که هست</small></p>
        ${CAUSES.map(([g, list]) => `<div class="checkin-group"><small class="muted">${g}</small><div class="chip-row">${list
          .filter(c => !(c === 'دوران قاعدگی' && p?.sex === 'male'))
          .map(c => `<button type="button" class="chip-btn" data-cause="${esc(c)}">${c}</button>`).join('')}</div></div>`).join('')}
        <label class="field"><span>اگر دوست داری بیشتر بگو <small class="muted">(اختیاری)</small></span><textarea name="said" rows="3" maxlength="1500" placeholder="مثلاً: از وقتی کارم عوض شده شب‌ها خسته‌ام و…"></textarea></label>
        <button class="btn primary block" data-go>هوشواره ببیند ریشه‌اش چیست</button>
        <p class="muted small">چیزهایی که این‌جا می‌گویی فقط برای هوشواره‌ی خودت است و در حساب خودت می‌ماند.</p>`;
      body.querySelector('[data-close]').onclick = () => sheet.close();
      body.querySelector('[data-mood]').onclick = e => {
        const b = e.target.closest('[data-v]');
        if (!b) return;
        mood = Number(b.dataset.v);
        body.querySelectorAll('[data-mood] button').forEach(x => x.classList.toggle('on', x === b));
      };
      body.querySelectorAll('[data-cause]').forEach(b => b.onclick = () => {
        const c = b.dataset.cause;
        if (picked.has(c)) picked.delete(c); else picked.add(c);
        b.classList.toggle('on', picked.has(c));
      });
      body.querySelector('[data-go]').onclick = () => {
        const said = body.querySelector('[name=said]').value.trim();
        if (!mood && !picked.size && !said) { toast('یکی را انتخاب کن یا چند کلمه بنویس.'); return; }
        run({ mood, causes: [...picked], said });
      };
    };

    const run = async answers => {
      if (!aiOnline()) { toast('برای هوشواره به اینترنت وصل شو.'); return; }
      body.innerHTML = `<div class="sheet-head"><h2>برگشت به مسیر</h2></div>
        <p class="muted small ai-wait"><span class="typing"><i></i><i></i><i></i></span> دارم حرف‌هایت را کنار ثبت‌هایت می‌گذارم…</p>`;
      try {
        const r = await ask('checkin', {
          ...answers, signs: signs || {},
          follow: follow ? { day: follow.key.slice(8), outcome: follow.data?.outcome, goal: follow.data?.goal, steps: follow.data?.steps } : null,
        });
        const key = `checkin:${today()}`;
        const data = { signs: signs || {}, ...answers, cause: r.cause, steps: r.steps, first_step: r.first_step, goal: r.goal, support: r.support || '', ...(follow ? { after: follow.key } : {}) };
        store.saveNote({ key, kind: 'checkin', text: `${r.cause}\n${r.steps.map(x => `- ${x}`).join('\n')}`, data });
        result(data);
        onDone();
      } catch (e) {
        toast(e.message);
        form();
      }
    };

    const result = d => {
      body.innerHTML = `
        <div class="sheet-head"><h2>برگشت به مسیر</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
        ${d.support ? `<div class="note doctor">${md(d.support)}</div>` : ''}
        <div class="ai-text">${md(d.cause)}</div>
        <p class="field-label">برنامه‌ی این هفته</p>
        <div class="ai-text"><ol>${d.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol></div>
        <div class="ai-goal"><small class="muted">همین امروز</small><b>${esc(d.first_step)}</b></div>
        ${d.goal ? `<div class="ai-goal"><small class="muted">هدف این هفته</small><b>${esc(d.goal)}</b><button class="btn sm" data-goal>هدف این هفته‌ام کن</button></div>` : ''}
        <div class="row gap"><button class="btn primary grow" data-close2>باشه، شروع می‌کنم</button><button class="btn grow" data-chat>بیشتر حرف بزنیم</button></div>
        <p class="muted small">یک هفته‌ی دیگر می‌پرسم چطور پیش رفت.</p>`;
      body.querySelector('[data-close]').onclick = () => sheet.close();
      body.querySelector('[data-close2]').onclick = () => sheet.close();
      body.querySelector('[data-goal]')?.addEventListener('click', async e => {
        // this week's goal is the one last week's review set
        const ws = addDays(weekStart(today()), -7);
        const r = store.get().reviews.find(x => x.week_start === ws) || { week_start: ws };
        if (r.next_goal && r.next_goal !== d.goal && !(await confirmBox(`هدف این هفته‌ات «${esc(r.next_goal)}» است. با این عوضش کنم؟`, 'عوض کن'))) return;
        store.saveReview({ ...r, next_goal: d.goal });
        e.target.disabled = true;
        toast('هدف این هفته ثبت شد');
      });
      body.querySelector('[data-chat]').onclick = () => {
        sheet.closeAll();
        startChat('درباره‌ی برنامه‌ی برگشتی که امروز چیدیم می‌خواهم بیشتر حرف بزنم: ');
        location.hash = '#/ai';
      };
    };

    form();
  }, { tall: true });
}

