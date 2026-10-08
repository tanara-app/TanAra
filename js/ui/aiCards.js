// Hooshvareh outside the chat: today's tip, the week analysis, the weight-trend analysis.
// Each result is saved as an ai_note, so it syncs and the chat knows what was said.
import * as store from '../data/store.js';
import { ask, aiAvailable, aiOnline, md, sparkle } from '../ai/hooshvareh.js';
import { today, faDMY } from '../lib/dates.js';
import { esc } from '../lib/fa.js';
import { toast } from './dom.js';

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
  if (n) return `<section class="card ai-card">${head('نکته‌ی امروز هوشواره')}<div class="ai-text">${md(n.text)}</div><a class="link small" href="#/ai">بیشتر بپرس</a></section>`;
  if (busy.has(tipKey())) return `<section class="card ai-card">${head('نکته‌ی امروز هوشواره')}${thinking('دارم نکته‌ی امروزت را آماده می‌کنم…')}</section>`;
  return '';
}

// Generates today's tip once, after the first pull (so another device's tip isn't duplicated).
export function bindTip(refresh) {
  const key = tipKey();
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

export function progressCard() {
  if (!aiAvailable()) return '';
  const key = `progress:${today()}`;
  const n = latestProgress();
  const day = n?.key.slice(9);
  return `<section class="card ai-card">
    ${head('تحلیل روند', n && !busy.has(key) ? `<small class="muted">${day === today() ? 'امروز' : faDMY(day)}</small>` : '')}
    ${busy.has(key) ? thinking('دارم روند وزنت را بررسی می‌کنم…')
      : n ? `<div class="ai-text">${md(n.text)}</div>${day !== today() ? '<button class="link small" data-ai-progress>تحلیل تازه</button>' : ''}`
      : '<p class="muted small">هوشواره روند وزن و غذاخوردنت را کنار هم می‌گذارد و می‌گوید کجای کاری.</p><button class="btn block" data-ai-progress>تحلیل روند من</button>'}
  </section>`;
}

export function bindProgressCard(root, refresh) {
  root.querySelector('[data-ai-progress]')?.addEventListener('click', () =>
    generate(`progress:${today()}`, 'progress', 'progress', {}, r => ({ text: r.text }), refresh));
}
