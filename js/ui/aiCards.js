// Hooshvareh outside the chat: today's tip, the week analysis, the weight-trend analysis, the
// monthly maintenance review and a plan for an occasion coming up.
// Each result is saved as an ai_note, so it syncs and the chat knows what was said.
import * as store from '../data/store.js';
import { ask, aiAvailable, aiOnline, md, sparkle } from '../ai/hooshvareh.js';
import { today, faDMY, faDM } from '../lib/dates.js';
import { esc, fa } from '../lib/fa.js';
import { toast, icon } from './dom.js';
import { phaseOn } from '../domain/targets.js';
import { maintainWeeks } from '../domain/phase.js';
import { upcoming } from '../domain/occasions.js';
import { dismissed, dismiss } from './notices.js';

const busy = new Set();   // note keys being generated right now
const failed = new Set(); // auto-generation failed this session; wait for a manual retry

async function generate(key, kind, mode, input, toNote, refresh, quiet = false) {
  if (busy.has(key)) return;
  busy.add(key);
  refresh();
  try {
    const r = await ask(mode, input);
    store.saveNote({ key, kind, ...toNote(r) });
  } catch (e) {
    failed.add(key);
    if (!quiet) toast(e.message);
  } finally {
    busy.delete(key);
    refresh();
  }
}

const head = (title, extra = '') => `<div class="ai-card-h"><span class="ai-mark">${sparkle(16)}</span><b>${title}</b>${extra}</div>`;
const thinking = text => `<p class="muted small ai-wait"><span class="typing"><i></i><i></i><i></i></span> ${text}</p>`;

/* ---------------- Today: tip of the day ---------------- */

const tipKey = () => `tip:${today()}`;

export function tipCard() {
  if (!aiAvailable()) return '';
  const n = store.note(tipKey());
  // checked first: while «یک نکته‌ی دیگر» is being made, the old tip gives way to the wait
  if (busy.has(tipKey())) return `<section class="card ai-card">${head('نکته‌ی امروز هوشواره')}${thinking(n ? 'دارم یک نکته‌ی تازه آماده می‌کنم…' : 'دارم نکته‌ی امروزت را آماده می‌کنم…')}</section>`;
  if (n) return `<section class="card ai-card">${head('نکته‌ی امروز هوشواره')}<div class="ai-text">${md(n.text)}</div><div class="row gap"><a class="link small" href="#/ai">بیشتر بپرس</a><button class="link small" data-tip-again>یک نکته‌ی دیگر</button></div></section>`;
  return '';
}

// Generates today's tip once, after the first pull (so another device's tip isn't duplicated).
export function bindTip(refresh, root = document) {
  const key = tipKey();
  // another tip today moves on to the next topic, so it is really a different one
  root.querySelector('[data-tip-again]')?.addEventListener('click', () => {
    const shift = (store.note(key)?.data?.shift || 0) + 1;
    generate(key, 'tip', 'tip', { shift }, r => ({ text: r.text, data: { shift } }), refresh);
  });
  if (store.note(key) || busy.has(key) || failed.has(key) || !aiOnline() || !store.syncStatus.lastPull) return;
  generate(key, 'tip', 'tip', {}, r => ({ text: r.text }), refresh, true);
}

/* ---------------- Weekly review: analysis + suggested goal ---------------- */

export function reviewCard(ws) {
  if (!aiAvailable()) return '';
  const key = `review:${ws}`;
  const n = store.note(key);
  const goal = n?.data?.next_goal;
  return `<section class="card ai-card">
    ${head('تحلیل هوشواره')}
    ${busy.has(key) ? thinking('دارم هفته‌ات را بررسی می‌کنم…')
      : n ? `<div class="ai-text">${md(n.text)}</div>
        ${goal ? `<div class="ai-goal"><small class="muted">هدف پیشنهادی برای هفته‌ی بعد</small><b>${esc(goal)}</b><button class="btn sm" data-ai-goal>همین را هدف کن</button></div>` : ''}
        <button class="link small" data-ai-review>تحلیل دوباره</button>`
      : '<p class="muted small">هوشواره این هفته را با هدف‌هایت مقایسه می‌کند و یک هدف کوچک برای هفته‌ی بعد پیشنهاد می‌دهد.</p><button class="btn block" data-ai-review>تحلیل این هفته</button>'}
  </section>`;
}

export function bindReviewCard(root, ws, refresh, useGoal) {
  root.querySelector('[data-ai-review]')?.addEventListener('click', () =>
    generate(`review:${ws}`, 'review', 'review', { week_start: ws }, r => ({ text: r.analysis, data: { next_goal: r.next_goal } }), refresh));
  root.querySelector('[data-ai-goal]')?.addEventListener('click', () => useGoal(store.note(`review:${ws}`)?.data?.next_goal || ''));
}

/* ---------------- Progress: weight-trend analysis ---------------- */

const latestProgress = () => store.get().ai_notes.filter(n => n.kind === 'progress').sort((a, b) => (a.key < b.key ? 1 : -1))[0] || null;

// The analysis is long, so once written it stays folded to its title until tapped open; the
// choice is remembered on this device (a convenience, not data).
const FOLD = () => store.localKey('progressOpen');
const progressOpen = () => { try { return localStorage.getItem(FOLD()) === '1'; } catch { return false; } };

export function progressCard() {
  if (!aiAvailable()) return '';
  const key = `progress:${today()}`;
  const n = latestProgress();
  const day = n?.key.slice(9);
  if (n && !busy.has(key)) return `<section class="card ai-card fold${progressOpen() ? '' : ' folded'}" data-ai-fold>
    <button type="button" class="ai-card-h fold-h" aria-expanded="${progressOpen()}"><span class="ai-mark">${sparkle(16)}</span><b>تحلیل روند</b><small class="muted">${day === today() ? 'امروز' : faDMY(day)}</small>${icon.chevD}</button>
    <div class="fold-body"><div class="ai-text">${md(n.text)}</div><button class="link small" data-ai-progress>تحلیل تازه</button></div>
  </section>`;
  return `<section class="card ai-card">
    ${head('تحلیل روند')}
    ${busy.has(key) ? thinking('دارم روند وزنت را بررسی می‌کنم…')
      : n ? `<div class="ai-text">${md(n.text)}</div>`
      : '<p class="muted small">هوشواره روند وزن و غذاخوردنت را کنار هم می‌گذارد و می‌گوید کجای کاری.</p><button class="btn block" data-ai-progress>تحلیل روند من</button>'}
  </section>`;
}

export function bindProgressCard(root, refresh) {
  root.querySelector('[data-ai-progress]')?.addEventListener('click', () => {
    // a fresh analysis is asked for to be read: show it open
    try { localStorage.setItem(FOLD(), '1'); } catch { /* ignore */ }
    generate(`progress:${today()}`, 'progress', 'progress', {}, r => ({ text: r.text }), refresh);
  });
  root.querySelector('[data-ai-fold] .fold-h')?.addEventListener('click', e => {
    const card = e.currentTarget.closest('[data-ai-fold]');
    const open = card.classList.toggle('folded') === false;
    e.currentTarget.setAttribute('aria-expanded', open);
    try { localStorage.setItem(FOLD(), open ? '1' : '0'); } catch { /* ignore */ }
  });
}

/* ---------------- Progress: the monthly maintenance review ---------------- */

const monthKey = () => `maintain:${today().slice(0, 7)}`;
// from the fourth week of maintenance on: the first weeks are still the climb
const maintainShown = () => aiAvailable() && phaseOn(store.profile()) === 'maintain' && (maintainWeeks(store.profile(), today()) ?? 0) >= 3;

export function maintainCard() {
  if (!maintainShown()) return '';
  const key = monthKey();
  const n = store.note(key) || store.get().ai_notes.filter(x => x.kind === 'maintain').sort((a, b) => (a.key < b.key ? 1 : -1))[0];
  return `<section class="card ai-card">
    ${head('مرور ماهانه‌ی نگهداری', n && !busy.has(key) ? `<small class="muted">${faDMY(n.created_at?.slice(0, 10) || today())}</small>` : '')}
    ${busy.has(key) ? thinking('دارم ماهِ نگهداری‌ات را مرور می‌کنم…')
      : n ? `<div class="ai-text">${md(n.text)}</div>${n.key !== key ? '<button class="link small" data-ai-maintain>مرور این ماه</button>' : ''}`
      : '<p class="muted small">ماهی یک بار، هوشواره نگاه می‌کند وزنت در بازه مانده یا نه، وزن‌کشی و تحرکت چطور بوده، و یک کار برای ماه بعد پیشنهاد می‌دهد.</p><button class="btn block" data-ai-maintain>مرور این ماه</button>'}
  </section>`;
}

// Made once a month by itself (after the first pull, like the tip), or on the button.
export function bindMaintainCard(root, refresh) {
  if (!maintainShown()) return;
  const key = monthKey();
  const run = quiet => generate(key, 'maintain', 'maintain', {}, r => ({ text: r.text }), refresh, quiet);
  root.querySelector('[data-ai-maintain]')?.addEventListener('click', () => run(false));
  if (!store.note(key) && !busy.has(key) && !failed.has(key) && aiOnline() && store.syncStatus.lastPull) run(true);
}

/* ---------------- Today: an occasion coming up ---------------- */

export function occasionCard() {
  if (!aiAvailable()) return '';
  const o = upcoming(today(), store.get().motivations)[0];
  if (!o || dismissed('occasion', o.key)) return '';
  const key = `occasion:${o.key}`;
  const n = store.note(key);
  const when = o.inDays === 0 ? 'امروز است' : o.inDays === 1 ? 'فردا است' : `${fa(o.inDays)} روز دیگر است (${faDM(o.day)})`;
  return `<section class="card ai-card" data-occasion="${esc(o.key)}">
    ${head(`${esc(o.name)} ${when}`)}
    ${busy.has(key) ? thinking('دارم برایش برنامه می‌چینم…')
      : n ? `<div class="ai-text">${md(n.text)}</div><button class="link small" data-occ-done>باشه</button>`
      : `<p class="muted small">مهمانی‌ها و مناسبت‌ها جایی‌اند که برنامه بیشتر از همه به هم می‌خورد. با چند جمله‌ی «اگر این شد، این کار را می‌کنم» از قبل آماده باش.</p>
        <div class="row gap"><button class="btn sm" data-occ-plan>برنامه‌ی هوشواره</button><button class="btn ghost sm" data-occ-done>لازم نیست</button></div>`}
  </section>`;
}

export function bindOccasion(root, refresh) {
  const card = root.querySelector('[data-occasion]');
  if (!card) return;
  const o = upcoming(today(), store.get().motivations).find(x => x.key === card.dataset.occasion);
  card.querySelector('[data-occ-plan]')?.addEventListener('click', () =>
    generate(`occasion:${o.key}`, 'occasion', 'occasion', { name: o.name, day: o.day, inDays: o.inDays, days: o.days }, r => ({ text: r.text }), refresh));
  card.querySelector('[data-occ-done]')?.addEventListener('click', () => { dismiss('occasion', o.key); card.remove(); });
}
