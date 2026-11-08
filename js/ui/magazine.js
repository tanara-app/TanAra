/*
  Magazine: one article a week (Saturday → Friday) for everyone in the app. The `magazine` Edge
  Function writes it on Saturday morning with real web search (trusted health sources only:
  MAG_DOMAINS there) and keeps it in the shared `magazine` table; `remind` pushes it to every
  device with notifications on. Shared, it costs one article a week in all, not one per person,
  so it is general: what it means for each person is a question to Hooshvareh in the chat.
  The app copies each ready article into its own ai_notes as 'mag:<week>:all' (read state and
  the chat's view of the magazine work from there). Older personal articles ('mag:<day>' and
  'mag:<day>:<n>', from before the magazine was shared) stay in the list. The owner
  (usage_members.admin) can write the week's article before Saturday's run, optionally on a topic.
*/
import * as store from '../data/store.js';
import { aiAvailable, aiOnline, authToken, md, sparkle, focusArticle } from '../ai/hooshvareh.js';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';
import { today, relLabel, weekStart } from '../lib/dates.js';
import { fa, esc } from '../lib/fa.js';
import { toast, sheet, icon } from './dom.js';
import { startChat } from './chat.js';
import { dismissed, dismiss } from './notices.js';

const URL_ = `${SUPABASE_URL}/functions/v1/magazine`;
const CATS = {
  nutrition: 'تغذیه', activity: 'ورزش و تحرک', sleep_stress: 'خواب و استرس', habits: 'روان‌شناسی عادت',
  myths: 'باورهای رایج', body: 'بدن و متابولیسم', practical: 'زندگی روزمره', maintain: 'نگه داشتن وزن',
};
const EVIDENCE = { strong: 'شواهد قوی', moderate: 'شواهد متوسط', limited: 'شواهد محدود' };
const PULL_EVERY = 15 * 60e3;

let openKey = null;     // article to open as soon as the tab is shown
let pulledAt = 0, pulling = null;
let owner = null;       // can this account write the week's article early (null: not asked yet)
let writing = null;     // the topic ('' for none) while the owner's request runs
let failure = null;     // what went wrong with the owner's last request

const articles = () => store.get().ai_notes.filter(n => n.kind === 'mag' && n.data?.title).sort((a, b) => (a.key < b.key ? 1 : -1));
const dayOf = n => n.key.slice(4, 14);
const sharedKey = week => `mag:${week}:all`;
const weekArticle = () => articles().find(n => dayOf(n) >= weekStart(today()));
const sharedThisWeek = () => !!store.note(sharedKey(weekStart(today())));

// Copies the shared articles this app doesn't have yet into ai_notes, unread. After the first
// pull, so another device's copy (and its read mark) isn't overwritten.
function pullShared(refresh, force = false) {
  if (pulling) return pulling;
  if (!aiOnline() || !store.syncStatus.lastPull || (!force && Date.now() - pulledAt < PULL_EVERY)) return Promise.resolve();
  pulling = (async () => {
    const rows = await store.sharedMagazine();
    if (!rows) return;
    pulledAt = Date.now();
    let added = false;
    for (const r of rows) {
      const key = sharedKey(r.week);
      if (store.note(key) || !r.data?.title) continue;
      store.saveNote({ key, kind: 'mag', text: `${r.data.title} — ${r.data.summary || ''}`, data: { ...r.data, read: false } });
      added = true;
    }
    if (added) refresh();
  })().finally(() => { pulling = null; });
  if (owner === null) store.isUsageAdmin().then(a => { owner = a; if (a) refresh(); });
  return pulling;
}

// The owner writes this week's article now (Saturday's run then has nothing to do).
async function writeNow(topic, refresh) {
  writing = topic;
  failure = null;
  refresh();
  try {
    const token = await authToken();
    if (!token) throw new Error('دوباره وارد شو.');
    let res;
    try {
      res = await fetch(URL_, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY },
        body: JSON.stringify({ topic }),
      });
    } catch { throw new Error('به هوشواره وصل نشد. اینترنت را بررسی کن.'); }
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(j?.error && /[؀-ۿ]/.test(j.error) ? j.error : 'مقاله آماده نشد؛ دوباره امتحان کن.');
    await pullShared(refresh, true);
  } catch (e) {
    failure = e.message;
    toast(e.message);
  } finally {
    writing = null;
    refresh();
  }
}

const meta = n => `${CATS[n.data.category] || 'مجله'} · ${fa(Math.max(1, Number(n.data.minutes) || 3))} دقیقه`;

/* ---------------- Today: this week's unread article ---------------- */

export function magCard() {
  const n = weekArticle();
  if (!n || n.data.read || dismissed('mag', n.key)) return '';
  return `<button class="card mag-teaser" data-mag-open="${n.key}">
    <small class="mag-meta"><span class="ai-mark">${sparkle(14)}</span> مقاله‌ی این هفته‌ی مجله · ${meta(n)}</small>
    <b>${esc(n.data.title)}</b>
    <span class="muted small">${esc(n.data.summary || '')}</span>
  </button>`;
}

export function bindMag(root, refresh) {
  const card = root.querySelector('[data-mag-open]');
  if (card) {
    card.addEventListener('click', e => {
      if (card.dataset.swiped) { e.preventDefault(); return; }
      openKey = card.dataset.magOpen;
      location.hash = '#/mag';
    });
    bindSwipeAway(card, () => dismiss('mag', card.dataset.magOpen));
  }
  pullShared(refresh);
}

// Drag the teaser to the right and it slides off and fades; the article stays unread in the tab.
function bindSwipeAway(el, onGone) {
  let x0 = null, y0 = 0, dx = 0, t0 = 0, dragging = false;
  el.addEventListener('pointerdown', e => {
    if (!e.isPrimary || e.button > 0) return;
    x0 = e.clientX; y0 = e.clientY; dx = 0; t0 = Date.now(); dragging = false;
  });
  el.addEventListener('pointermove', e => {
    if (x0 === null) return;
    const d = e.clientX - x0;
    if (!dragging) {
      if (Math.abs(e.clientY - y0) > Math.abs(d) && Math.abs(e.clientY - y0) > 8) { x0 = null; return; }
      if (d < 8) return;
      dragging = true;
      el.setPointerCapture(e.pointerId);
      el.style.transition = 'none';
    }
    dx = Math.max(0, d);
    el.style.transform = `translateX(${dx}px)`;
    el.style.opacity = String(Math.max(0, 1 - dx / el.offsetWidth));
  });
  const end = () => {
    if (x0 === null) return;
    x0 = null;
    if (!dragging) return;
    el.dataset.swiped = '1';
    setTimeout(() => delete el.dataset.swiped, 50);
    el.style.transition = '';
    const fast = dx / Math.max(1, Date.now() - t0) > 0.5 && dx > 40;
    if (!fast && dx < el.offsetWidth * 0.35) { el.style.transform = ''; el.style.opacity = ''; return; }
    onGone();
    el.style.transform = `translateX(${el.offsetWidth}px)`;
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    setTimeout(() => {
      el.style.transition = 'height .22s ease, margin .22s ease, padding .22s ease';
      el.style.height = `${el.offsetHeight}px`;
      el.style.overflow = 'hidden';
      requestAnimationFrame(() => { el.style.height = '0'; el.style.margin = '0'; el.style.paddingBlock = '0'; });
      setTimeout(() => el.remove(), 240);
    }, 220);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

/* ---------------- the tab ---------------- */

const waiting = topic => `<section class="card ai-card">
  <p class="muted small ai-wait"><span class="typing"><i></i><i></i><i></i></span> ${topic ? `دارم درباره‌ی «${esc(topic)}» در منابع معتبر می‌گردم…` : 'دارم برای مقاله‌ی این هفته در منابع معتبر می‌گردم…'}</p>
</section>`;

function row(n, lead) {
  const d = n.data;
  return `<button class="card mag-item${lead ? ' lead' : ''}${d.read ? '' : ' unread'}" data-open="${n.key}">
    <small class="mag-meta">${meta(n)} · ${relLabel(dayOf(n))}</small>
    <b>${esc(d.title)}</b>
    ${lead || !d.read ? `<span class="muted small">${esc(d.summary || '')}</span>` : ''}
  </button>`;
}

export function renderMagazine(root) {
  const list = articles();
  const ok = aiAvailable();
  const early = ok && owner && !sharedThisWeek() && writing === null;

  root.innerHTML = `
    <header class="page-head mag-head">
      <h1>مجله</h1>
      <p class="muted small">هر شنبه یک مقاله‌ی تازه برای همه.</p>
    </header>

    ${!ok ? '<div class="note soft"><p>مجله فقط وقتی وارد حساب شده‌ای می‌رسد.</p></div>' : ''}
    ${writing !== null ? waiting(writing) : ''}
    ${early ? `<section class="card">
      ${failure ? `<p class="muted small">${esc(failure)}</p>` : ''}
      <button class="btn block" data-now>مقاله‌ی این هفته را همین حالا بنویس</button>
      <button class="btn block ai-btn mag-ask" data-topic>${sparkle(18)} با موضوع دلخواه</button>
    </section>` : ''}

    ${list.map((n, i) => row(n, i === 0)).join('') || (writing !== null || !ok ? '' : '<div class="empty">هنوز مقاله‌ای نیست.</div>')}`;

  const refresh = () => { if (root.isConnected && location.hash === '#/mag') renderMagazine(root); };
  root.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openArticle(b.dataset.open));
  root.querySelector('[data-now]')?.addEventListener('click', () => writeNow('', refresh));
  root.querySelector('[data-topic]')?.addEventListener('click', () => askTopic(refresh));
  pullShared(refresh);

  if (openKey) { const k = openKey; openKey = null; openArticle(k); }
}

function askTopic(refresh) {
  sheet.open(body => {
    body.innerHTML = `
      <div class="sheet-head"><h2>موضوع دلخواه</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <form class="stack" novalidate>
        <label class="field"><span>درباره‌ی چه چیزی بخوانی؟</span><textarea name="topic" rows="3" maxlength="300" placeholder="مثلاً: روزه‌داری متناوب واقعاً بهتر از رژیم معمولی است؟"></textarea></label>
        <p class="muted small">برای همه فرستاده می‌شود؛ چیزی شخصی ننویس.</p>
        <button class="btn primary block">بنویس</button>
      </form>`;
    body.querySelector('[data-close]').onclick = () => sheet.close();
    body.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const topic = e.target.elements.topic.value.trim();
      if (topic.length < 3) return toast('موضوع را بنویس');
      sheet.close();
      writeNow(topic, refresh);
    };
  });
}

function openArticle(key) {
  const n = store.note(key);
  if (!n?.data?.title) return;
  const d = n.data;
  if (!d.read) store.saveNote({ ...n, data: { ...d, read: true } });
  sheet.open(body => {
    body.innerHTML = `
      <div class="sheet-head"><h2>مجله</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <article class="mag-article">
        <small class="mag-meta">${meta(n)} · ${relLabel(dayOf(n))}${EVIDENCE[d.evidence] ? ` · <span class="mag-ev ${d.evidence}">${EVIDENCE[d.evidence]}</span>` : ''}</small>
        <h2>${esc(d.title)}</h2>
        <p class="mag-lede">${esc(d.summary || '')}</p>
        <div class="ai-text mag-body">${md(d.body, { headings: true })}</div>
        ${d.key_points?.length ? `<div class="mag-points"><b>خلاصه در سه خط</b><ul>${d.key_points.map(k => `<li>${esc(k)}</li>`).join('')}</ul></div>` : ''}
        ${d.try_this ? `<div class="card ai-card mag-you"><div class="ai-card-h"><span class="ai-mark">${sparkle(16)}</span><b>این هفته امتحان کن</b></div><p>${esc(d.try_this)}</p></div>` : ''}
        ${d.for_you ? `<div class="card ai-card mag-you"><div class="ai-card-h"><span class="ai-mark">${sparkle(16)}</span><b>برای خودِ تو</b></div><p>${esc(d.for_you)}</p></div>` : ''}
        <div class="mag-sources">
          <b>منابع</b>
          <ol>${(d.sources || []).map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" dir="auto">${esc(s.title)}</a><small class="muted" dir="auto">${esc(s.publisher || '')}</small></li>`).join('')}</ol>
          <p class="muted small">این مقاله را هوشواره (هوش مصنوعی) از همین منابع نوشته است؛ جای توصیه‌ی پزشک یا متخصص تغذیه را نمی‌گیرد.</p>
        </div>
        <button class="btn block ai-btn" data-ask>${sparkle(18)} درباره‌ی این مقاله از هوشواره بپرس</button>
      </article>`;
    body.querySelector('[data-close]').onclick = () => sheet.close();
    body.querySelector('[data-ask]').onclick = () => {
      startChat(`درباره‌ی مقاله‌ی «${d.title}»: `);
      focusArticle(key); // after startChat: opening a conversation clears the previous focus
      // replace: back from the chat then returns to where the magazine was opened from
      sheet.closeThen(() => location.replace('#/ai'));
    };
  }, { tall: true });
}
