/*
  Magazine: one article a week (Saturday → Friday) that Hooshvareh researches with real web search (trusted
  health sources only — the list is MAG_DOMAINS in the Edge Function) and writes for this
  person. Articles are ai_notes: 'mag:<day>' for the weekly one, 'mag:<day>:<n>' for one
  asked for by topic (it then takes that week's place); everything shown is in note.data.
*/
import * as store from '../data/store.js';
import { ask, aiAvailable, aiOnline, md, sparkle, focusArticle } from '../ai/hooshvareh.js';
import { today, parse, relLabel, weekStart, addDays, faFull } from '../lib/dates.js';
import { fa, esc } from '../lib/fa.js';
import { toast, sheet, icon } from './dom.js';
import { startChat } from './chat.js';
import { dismissed, dismiss } from './notices.js';

const CATS = {
  nutrition: 'تغذیه', activity: 'ورزش و تحرک', sleep_stress: 'خواب و استرس', habits: 'روان‌شناسی عادت',
  myths: 'باورهای رایج', body: 'بدن و متابولیسم', practical: 'زندگی روزمره', maintain: 'نگه داشتن وزن',
};
const EVIDENCE = { strong: 'شواهد قوی', moderate: 'شواهد متوسط', limited: 'شواهد محدود' };

const busy = new Map();   // note key → topic asked for ('' for the weekly one)
const failed = new Map(); // note key → error message; the weekly one then waits for a manual retry
let openKey = null;       // article to open as soon as the tab is shown

const articles = () => store.get().ai_notes.filter(n => n.kind === 'mag' && n.data?.title).sort((a, b) => (a.key < b.key ? 1 : -1));
const dayOf = n => n.key.slice(4, 14);
const dailyKey = () => `mag:${today()}`;
// the section of the week rotates through the categories
const categoryFor = day => Object.keys(CATS)[Math.round(parse(weekStart(day)).getTime() / 6048e5) % Object.keys(CATS).length];

// At most one article a week, whether it wrote itself or was asked for by topic (about four a month).
const weekArticle = () => articles().find(n => dayOf(n) >= weekStart(today()));
const weekTaken = () => !!weekArticle() || busy.size > 0;
const nextWeek = () => faFull(addDays(weekStart(today()), 7));

async function generate(key, topic, refresh, quiet = false) {
  if (weekTaken()) return;
  busy.set(key, topic);
  failed.delete(key);
  refresh();
  try {
    const r = await ask('magazine', { category: categoryFor(today()), topic, previous: articles().map(n => n.data.title) });
    store.saveNote({ key, kind: 'mag', text: `${r.title} — ${r.summary}`, data: { ...r, read: false } });
  } catch (e) {
    failed.set(key, e.message);
    if (!quiet) toast(e.message);
  } finally {
    busy.delete(key);
    refresh();
  }
}

// An article is the costliest thing Hooshvareh does (web searches and a long text), so the
// weekly one stops writing itself while the last two weekly articles sit unread; it starts
// again once one of them is opened, and the button writes this week's at any time.
const UNREAD_PAUSE = 2;
function paused() {
  const daily = articles().filter(n => n.key.length === 14).slice(0, UNREAD_PAUSE);
  return daily.length === UNREAD_PAUSE && daily.every(n => !n.data.read);
}

// Writes this week's article once, after the first pull (so another device's isn't duplicated).
function autoDaily(refresh) {
  const key = dailyKey();
  if (weekTaken() || failed.has(key) || !aiOnline() || !store.syncStatus.lastPull || paused()) return;
  generate(key, '', refresh, true);
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
  autoDaily(refresh);
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
  <p class="muted small">جست‌وجو و نوشتن حدود یک دقیقه طول می‌کشد.</p>
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
  const key = dailyKey();
  const ok = aiAvailable();
  const free = !weekTaken();

  root.innerHTML = `
    <header class="page-head mag-head">
      <h1>مجله</h1>
      <p class="muted small">هر هفته یک مقاله که هوشواره از منابع معتبر علمی جمع می‌کند و برای خودت می‌نویسد.</p>
    </header>

    ${!ok ? '<div class="note soft"><p>مجله فقط وقتی وارد حساب شده‌ای ساخته می‌شود.</p></div>' : ''}
    ${[...busy].map(([, topic]) => waiting(topic)).join('')}
    ${ok && free ? `<section class="card">
      <p class="muted small">${failed.get(key) ? esc(failed.get(key)) : navigator.onLine === false ? 'برای مقاله‌ی این هفته به اینترنت وصل شو.' : paused() ? 'دو مقاله‌ی آخر را هنوز نخوانده‌ای، برای همین مقاله‌ی این هفته خودکار نوشته نشد. هر وقت خواستی با این دکمه بنویسش، یا موضوعش را خودت بگو.' : 'مقاله‌ی این هفته هنوز آماده نشده.'}</p>
      <button class="btn block" data-daily>مقاله‌ی این هفته را بنویس</button>
    </section>` : ''}

    ${list.map((n, i) => row(n, i === 0)).join('') || (busy.size || !ok ? '' : '<div class="empty">هنوز مقاله‌ای نیست.</div>')}

    ${ok && free ? `<button class="btn block ai-btn mag-ask" data-topic>${sparkle(18)} مقاله‌ی این هفته درباره‌ی موضوع دلخواه</button>` : ''}
    ${ok && !busy.size && weekArticle() ? `<p class="muted small mag-next">هر هفته یک مقاله؛ مقاله‌ی بعدی از ${nextWeek()}.</p>` : ''}`;

  const refresh = () => { if (root.isConnected && location.hash === '#/mag') renderMagazine(root); };
  root.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openArticle(b.dataset.open));
  root.querySelector('[data-daily]')?.addEventListener('click', () => generate(key, '', refresh));
  root.querySelector('[data-topic]')?.addEventListener('click', () => askTopic(refresh));
  autoDaily(refresh);

  if (openKey) { const k = openKey; openKey = null; openArticle(k); }
}

function askTopic(refresh) {
  sheet.open(body => {
    body.innerHTML = `
      <div class="sheet-head"><h2>موضوع دلخواه</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <form class="stack" novalidate>
        <label class="field"><span>درباره‌ی چه چیزی بخوانی؟</span><textarea name="topic" rows="3" maxlength="300" placeholder="مثلاً: روزه‌داری متناوب واقعاً بهتر از رژیم معمولی است؟"></textarea></label>
        <p class="muted small">هوشواره فقط در منابع معتبر (سازمان جهانی بهداشت، NIH، کاکرین، مجله‌های پزشکی و…) می‌گردد و لینک منبع‌ها را زیر مقاله می‌گذارد.</p>
        <button class="btn primary block">بنویس</button>
      </form>`;
    body.querySelector('[data-close]').onclick = () => sheet.close();
    body.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const topic = e.target.elements.topic.value.trim();
      if (topic.length < 3) return toast('موضوع را بنویس');
      sheet.close();
      generate(`mag:${today()}:${Date.now()}`, topic, refresh);
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
