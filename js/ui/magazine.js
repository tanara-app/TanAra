/*
  Magazine: one article a day that Hooshvareh researches with real web search (trusted
  health sources only — the list is MAG_DOMAINS in the Edge Function) and writes for this
  person. Articles are ai_notes: 'mag:<day>' for the daily one, 'mag:<day>:<n>' for one
  asked for by topic; everything shown is in note.data.
*/
import * as store from '../data/store.js';
import { ask, aiAvailable, aiOnline, md, sparkle, focusArticle } from '../ai/hooshvareh.js';
import { today, parse, relLabel } from '../lib/dates.js';
import { fa, esc } from '../lib/fa.js';
import { toast, sheet, icon } from './dom.js';
import { startChat } from './chat.js';

const CATS = {
  nutrition: 'تغذیه', activity: 'ورزش و تحرک', sleep_stress: 'خواب و استرس', habits: 'روان‌شناسی عادت',
  myths: 'باورهای رایج', body: 'بدن و متابولیسم', practical: 'زندگی روزمره',
};
const EVIDENCE = { strong: 'شواهد قوی', moderate: 'شواهد متوسط', limited: 'شواهد محدود' };

const busy = new Map();   // note key → topic asked for ('' for the daily one)
const failed = new Map(); // note key → error message; the daily one then waits for a manual retry
let openKey = null;       // article to open as soon as the tab is shown

const articles = () => store.get().ai_notes.filter(n => n.kind === 'mag' && n.data?.title).sort((a, b) => (a.key < b.key ? 1 : -1));
const dayOf = n => n.key.slice(4, 14);
const dailyKey = () => `mag:${today()}`;
// the section of the day rotates through the categories
const categoryFor = day => Object.keys(CATS)[Math.floor(parse(day).getTime() / 864e5) % Object.keys(CATS).length];

async function generate(key, topic, refresh, quiet = false) {
  if (busy.has(key)) return;
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

// Writes today's article once, after the first pull (so another device's isn't duplicated).
function autoDaily(refresh) {
  const key = dailyKey();
  if (store.note(key) || busy.has(key) || failed.has(key) || !aiOnline() || !store.syncStatus.lastPull) return;
  generate(key, '', refresh, true);
}

const meta = n => `${CATS[n.data.category] || 'مجله'} · ${fa(Math.max(1, Number(n.data.minutes) || 3))} دقیقه`;

/* ---------------- Today: today's unread article ---------------- */

export function magCard() {
  const n = store.note(dailyKey());
  if (!n?.data?.title || n.data.read) return '';
  return `<button class="card mag-teaser" data-mag-open="${n.key}">
    <small class="mag-meta"><span class="ai-mark">${sparkle(14)}</span> مقاله‌ی امروز مجله · ${meta(n)}</small>
    <b>${esc(n.data.title)}</b>
    <span class="muted small">${esc(n.data.summary || '')}</span>
  </button>`;
}

export function bindMag(root, refresh) {
  root.querySelector('[data-mag-open]')?.addEventListener('click', e => {
    openKey = e.currentTarget.dataset.magOpen;
    location.hash = '#/mag';
  });
  autoDaily(refresh);
}

/* ---------------- the tab ---------------- */

const waiting = topic => `<section class="card ai-card">
  <p class="muted small ai-wait"><span class="typing"><i></i><i></i><i></i></span> ${topic ? `دارم درباره‌ی «${esc(topic)}» در منابع معتبر می‌گردم…` : 'دارم برای مقاله‌ی امروز در منابع معتبر می‌گردم…'}</p>
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
  const dailyMissing = !store.note(key) && !busy.has(key);

  root.innerHTML = `
    <header class="page-head mag-head">
      <h1>مجله</h1>
      <p class="muted small">هر روز یک مقاله که هوشواره از منابع معتبر علمی جمع می‌کند و برای خودت می‌نویسد.</p>
    </header>

    ${!ok ? '<div class="note soft"><p>مجله فقط وقتی وارد حساب شده‌ای ساخته می‌شود.</p></div>' : ''}
    ${[...busy].map(([, topic]) => waiting(topic)).join('')}
    ${ok && dailyMissing ? `<section class="card">
      <p class="muted small">${failed.get(key) ? esc(failed.get(key)) : navigator.onLine === false ? 'برای مقاله‌ی امروز به اینترنت وصل شو.' : 'مقاله‌ی امروز هنوز آماده نشده.'}</p>
      <button class="btn block" data-daily>مقاله‌ی امروز را بنویس</button>
    </section>` : ''}

    ${list.map((n, i) => row(n, i === 0)).join('') || (busy.size || !ok ? '' : '<div class="empty">هنوز مقاله‌ای نیست.</div>')}

    ${ok ? `<button class="btn block ai-btn mag-ask" data-topic>${sparkle(18)} مقاله درباره‌ی موضوع دلخواه</button>` : ''}`;

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
      // once the sheet's history entry is gone, so back from the chat isn't a dead step
      window.addEventListener('popstate', () => location.replace('#/ai'), { once: true });
      sheet.close();
    };
  }, { tall: true });
}
