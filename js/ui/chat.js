// Hooshvareh chat: talk to the AI about everything recorded in the app. It can propose
// changes (log a food, a weight, ...) as cards; nothing is written until «ثبت» is tapped.
import * as store from '../data/store.js';
import { chat, ask, aiAvailable, md, sparkle, focusArticle } from '../ai/hooshvareh.js';
import { MEALS } from '../domain/stats.js';
import { fa, esc, qtyLabel } from '../lib/fa.js';
import { today, relLabel, faDMY, weekLabel } from '../lib/dates.js';
import { toast, confirmBox, sheet, icon } from './dom.js';

const SUGGESTIONS = [
  'امروز تا الان چطور پیش رفتم؟',
  'برای شام چی بخورم که پروتئینم برسد؟',
  'این هفته را با هفته‌ی قبل مقایسه کن',
  'ناهار دو کفگیر برنج با یک کفگیر قیمه خوردم',
];

let draft = '';
let live = null; // the reply being streamed: { text, actions, error, thread }
let viewRoot = null;

/*
  Conversations: every message carries a thread id. The open one is remembered on this
  device; null is the single conversation from before threads existed. A new conversation
  gets its id now but only shows up in the list once something is said in it.
*/
const THREAD_KEY = 'tanara:chat-thread';
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
let current;
function loadThread() {
  if (current !== undefined) return;
  let saved = null;
  try { saved = localStorage.getItem(THREAD_KEY); } catch { /* private mode */ }
  const list = threads();
  const id = saved === null ? undefined : saved || null;
  if (id !== undefined && list.some(t => t.id === id)) current = id;
  else current = list[0] ? list[0].id : newId(); // otherwise the latest conversation, like a messenger
}
function setThread(id) {
  current = id;
  focusArticle(null); // an article's full text only rides along in the conversation opened for it
  try { localStorage.setItem(THREAD_KEY, id ?? ''); } catch { /* ignore */ }
}
// Opens a fresh conversation with a question already typed (used by the magazine).
export function startChat(text) {
  loadThread();
  if (sorted().some(m => sameThread(m, current))) setThread(newId());
  draft = text;
}
const sameThread = (m, id) => (m.thread ?? null) === (id || null);

// [{ id, title, last, n }] most recent first
function threads() {
  const by = new Map();
  for (const m of store.get().chat) {
    const id = m.thread ?? null;
    const t = by.get(id) || { id, first: null, last: '', n: 0 };
    t.n++;
    if (m.role === 'user' && (!t.first || m.created_at < t.first.created_at)) t.first = m;
    if (m.created_at > t.last) t.last = m.created_at;
    by.set(id, t);
  }
  return [...by.values()].map(t => ({ ...t, title: threadTitle(t.id, t.first) })).sort((a, b) => (a.last < b.last ? 1 : -1));
}
function threadTitle(id, first) {
  const n = store.note(`thread:${id ?? 'old'}`);
  if (n?.text) return n.text;
  const t = (first?.content || 'گفت‌وگو').replace(/\s+/g, ' ').trim();
  return t.length > 48 ? `${t.slice(0, 46)}…` : t;
}

// After the first exchange of a conversation, Hooshvareh names it (once).
async function nameThread(id) {
  const key = `thread:${id ?? 'old'}`;
  if (store.note(key)) return;
  const msgs = sorted().filter(m => sameThread(m, id)).slice(0, 2);
  if (msgs.length < 2) return;
  try {
    const r = await ask('title', { messages: msgs.map(m => ({ role: m.role, content: m.content.slice(0, 1500) })) });
    if (r?.title) store.saveNote({ key, kind: 'thread', text: String(r.title).slice(0, 60) });
  } catch { /* the first message stays the title */ }
}

const isISO = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

/* ---------------- proposals ---------------- */

function describe(a) {
  switch (a.type) {
    case 'log_food':
      return `ثبت در ${MEALS[a.meal] || 'وعده'}ِ ${isISO(a.day) ? relLabel(a.day) : ''}: <b>${esc(a.name)}</b><br><small>${qtyLabel(Number(a.qty) || 1)} ${esc(a.unit || '')} · ${fa(Math.round(a.kcal))} کالری · ${fa(Math.round(a.protein * 10) / 10, 1)} گرم پروتئین</small>`;
    case 'weight':
      return `ثبت وزن <b>${fa(a.kg, 1)}</b> کیلو برای ${isISO(a.day) ? relLabel(a.day) : ''}`;
    case 'motivation':
      return a.kind === 'event'
        ? `افزودن رویداد به انگیزه‌ها: <b>${esc(a.title)}</b>${isISO(a.day) ? `<br><small>${faDMY(a.day)}</small>` : ''}`
        : `افزودن جمله به انگیزه‌ها:<br><b>«${esc(a.title)}»</b>`;
    case 'food':
      return `افزودن به بانک غذا: <b>${esc(a.name)}</b><br><small>هر ${esc(a.unit)}${a.grams && a.unit !== 'گرم' ? ` (${fa(Math.round(a.grams))} گرم)` : ''} · ${fa(Math.round(a.kcal))} کالری · ${fa(Math.round(a.protein * 10) / 10, 1)} گرم پروتئین</small>`;
    case 'review_goal':
      return `هدف هفته‌ی بعد${isISO(a.week_start) ? ` (${weekLabel(a.week_start)})` : ''}:<br><b>${esc(a.next_goal)}</b>`;
    default:
      return 'پیشنهاد ناشناخته';
  }
}

// Plain-text version for the history sent back to the AI, so it knows what happened.
function historyLine(a) {
  const st = a.status === 'done' ? 'ثبت شد' : a.status === 'declined' ? 'رد شد' : 'هنوز بی‌جواب';
  const what = describe(a).replace(/<br>/g, ' — ').replace(/<[^>]+>/g, '');
  return `[پیشنهاد هوشواره: ${what} → ${st}]`;
}

// Writes a confirmed proposal through the store. Returns an error message or null.
function apply(a) {
  const t = today();
  const num = (v, min, max) => Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max;
  switch (a.type) {
    case 'log_food': {
      if (!isISO(a.day) || a.day > t || !MEALS[a.meal] || !a.name || !num(a.kcal, 0, 10000) || !num(a.qty, 0.01, a.unit === 'گرم' ? 5000 : 100)) return 'این پیشنهاد کامل نیست.';
      const food = a.food_id ? store.get().foods.find(f => f.id === a.food_id) : null;
      store.saveEntry({
        day: a.day, meal: a.meal, food_id: food ? food.id : null, name: a.name, unit: a.unit || food?.unit || 'پرس',
        qty: Number(a.qty), kcal: Number(a.kcal), protein: Number(a.protein) || 0, is_veg: !!a.is_veg,
      });
      return null;
    }
    case 'weight':
      if (!isISO(a.day) || a.day > t || !num(a.kg, 35, 350)) return 'این وزن درست نیست.';
      store.setWeight(a.day, Number(a.kg));
      return null;
    case 'motivation':
      if (!a.title) return 'متنی ندارد.';
      if (a.kind === 'event') {
        if (!isISO(a.day) || a.day < t) return 'تاریخ این رویداد درست نیست.';
        store.saveMotivation({ kind: 'event', title: a.title, note: a.note || '', day: a.day });
      } else store.saveMotivation({ kind: 'quote', title: a.title });
      return null;
    case 'food':
      if (!a.name || !num(a.kcal, 0, 10000)) return 'این پیشنهاد کامل نیست.';
      store.upsertFood({ name: a.name, unit: a.unit, grams: a.grams, kcal: Number(a.kcal), protein: Number(a.protein) || 0, category: a.category, is_veg: !!a.is_veg });
      return null;
    case 'review_goal': {
      if (!isISO(a.week_start) || !a.next_goal) return 'این پیشنهاد کامل نیست.';
      const r = store.get().reviews.find(x => x.week_start === a.week_start) || { week_start: a.week_start };
      store.saveReview({ ...r, next_goal: a.next_goal });
      return null;
    }
    default:
      return 'این کار را بلد نیستم انجام بدهم.';
  }
}

/* ---------------- rendering ---------------- */

const sorted = () => [...store.get().chat].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

function actionsHtml(msgId, actions) {
  return actions.map((a, i) => `
    <div class="ai-act ${a.status || 'pending'}" data-msg="${msgId}" data-i="${i}">
      <p>${describe(a)}</p>
      ${a.status === 'done' ? '<span class="ai-act-st">✓ ثبت شد</span>'
        : a.status === 'declined' ? '<span class="ai-act-st">رد شد</span>'
        : msgId ? '<div class="row gap"><button class="btn primary sm" data-yes>ثبت</button><button class="btn ghost sm" data-no>نه</button></div>'
        : ''}
    </div>`).join('');
}

function bubble(m) {
  if (m.role === 'user') return `<div class="msg me"><p>${esc(m.content).replace(/\n/g, '<br>')}</p></div>`;
  return `<div class="msg ai">${md(m.content)}${actionsHtml(m.id, m.actions || [])}</div>`;
}

function liveHtml() {
  if (!live || !sameThread(live, current)) return '';
  const body = live.text ? md(live.text) : '<p class="typing"><i></i><i></i><i></i></p>';
  return `<div class="msg ai" data-live>${body}${actionsHtml(null, live.actions)}${live.error ? `<p class="err">${esc(live.error)}</p>` : ''}</div>`;
}

const sendIcon = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12H5M11 6l-6 6 6 6"/></svg>';

/*
  The screen is a fixed column (header · messages · composer) sized to the visible area,
  so the composer rides on the keyboard and only the messages scroll. The shell is built
  once; later redraws only repaint the messages, keeping the keyboard and draft intact.
*/
export function renderChat(root) {
  viewRoot = root;
  loadThread();
  if (!root.querySelector('.chat-bar')) buildShell(root);
  paint();
}

function buildShell(root) {
  const ok = aiAvailable();
  root.innerHTML = `
    <header class="chat-head">
      <button class="icon-btn" data-threads aria-label="گفت‌وگوهای قبلی">${icon.history}</button>
      <div class="chat-title"><h1><span class="ai-mark">${sparkle(20)}</span> هوشواره</h1><small data-title></small></div>
      <button class="icon-btn" data-new aria-label="گفت‌وگوی تازه">${icon.compose}</button>
    </header>
    <div class="chat" data-scroll></div>
    <form class="chat-bar" novalidate>
      <textarea rows="1" enterkeyhint="enter" placeholder="${ok ? 'از هوشواره بپرس…' : 'هوشواره فقط با ورود به حساب کار می‌کند'}" ${ok ? '' : 'disabled'}>${esc(draft)}</textarea>
      <button class="send" aria-label="فرستادن">${sendIcon}</button>
    </form>`;

  const ta = root.querySelector('textarea');
  const sendBtn = root.querySelector('.send');
  const grow = () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight + 3, 140) + 'px';
    ta.style.overflowY = ta.scrollHeight > 140 ? 'auto' : 'hidden';
  };
  requestAnimationFrame(grow);
  ta.addEventListener('input', () => { draft = ta.value; grow(); paintSend(); });
  ta.addEventListener('keydown', e => {
    // Enter sends on a keyboard; on phones Enter is a new line and the button sends
    if (e.key === 'Enter' && !e.shiftKey && matchMedia('(hover: hover)').matches) { e.preventDefault(); send(); }
  });
  // Tapping send must not take focus from the text box, or the keyboard would close.
  sendBtn.addEventListener('mousedown', e => e.preventDefault());
  root.querySelector('.chat-bar').onsubmit = e => {
    e.preventDefault();
    const keep = document.activeElement === ta;
    send();
    ta.value = draft; grow();
    if (keep) ta.focus();
  };
  // keep the latest message in view while the keyboard opens and closes (if it was in view)
  const box = root.querySelector('[data-scroll]');
  stuck = true;
  box.addEventListener('scroll', () => { stuck = nearBottom(box, 40); }, { passive: true });

  root.querySelector('[data-new]').onclick = () => {
    if (!sorted().some(m => sameThread(m, current))) { ta.focus(); return; } // already a fresh one
    setThread(newId());
    paint(true);
  };
  root.querySelector('[data-threads]').onclick = openThreads;
  root.querySelector('[data-scroll]').addEventListener('click', e => {
    const s = e.target.closest('[data-sugg]');
    if (s) { draft = s.textContent; send(); return; }
    const b = e.target.closest('.ai-act [data-yes], .ai-act [data-no]');
    if (b) decide(b);
  });
}

const localDay = iso => { const d = new Date(iso); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
let stuck = true;
function keepBottom() {
  const box = viewRoot?.isConnected && viewRoot.querySelector('[data-scroll]');
  if (!box || !stuck) return;
  // after the layout has taken the new height (app.js sets it from the same event)
  requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
}
window.visualViewport?.addEventListener('resize', keepBottom);
window.addEventListener('resize', keepBottom);

const nearBottom = (box, slack = 120) => box.scrollTop + box.clientHeight >= box.scrollHeight - slack;

function paintSend() {
  const b = viewRoot?.querySelector('.send');
  if (b) b.disabled = !aiAvailable() || !!live || !draft.trim();
}

function paint(forceBottom = false) {
  if (!viewRoot?.isConnected) return;
  const box = viewRoot.querySelector('[data-scroll]');
  if (!box) return;
  const stick = forceBottom || nearBottom(box) || !box.childElementCount;
  const msgs = sorted().filter(m => sameThread(m, current));
  const title = msgs.length ? threadTitle(current, msgs.find(m => m.role === 'user')) : '';
  viewRoot.querySelector('[data-title]').textContent = title;
  box.innerHTML = `
    ${!msgs.length && !liveHtml() ? `<div class="chat-empty">
      <p>سلام! من هوشواره‌ام. همه‌ی چیزهایی را که در تن‌آرا ثبت کرده‌ای می‌بینم: غذاها، وزن، مرورهای هفته و انگیزه‌هایت.</p>
      <p class="muted small">بپرس، تحلیل بخواه، یا بگو چه خوردی تا برایت ثبتش کنم (با تأیید خودت).</p>
      <div class="chat-sugg">${SUGGESTIONS.map(s => `<button class="chip-btn" data-sugg>${s}</button>`).join('')}</div>
    </div>` : ''}
    ${msgs.map(bubble).join('')}
    ${liveHtml()}`;
  paintSend();
  if (stick) box.scrollTop = box.scrollHeight;
}

function openThreads() {
  sheet.open(body => {
    const draw = () => {
      const list = threads();
      body.innerHTML = `
        <div class="sheet-head"><h2>گفت‌وگوها</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
        <button class="btn block" data-new>${icon.compose} گفت‌وگوی تازه</button>
        <div class="thread-list">${list.map(t => `
          <div class="thread-row${(t.id ?? null) === (current || null) ? ' on' : ''}">
            <button class="thread-open" data-id="${t.id ?? ''}">
              <b>${esc(t.title)}</b>
              <small>${relLabel(localDay(t.last))} · ${fa(t.n)} پیام</small>
            </button>
            <button class="icon-btn" data-del="${t.id ?? ''}" aria-label="حذف گفت‌وگو">${icon.trash}</button>
          </div>`).join('') || '<div class="empty">هنوز گفت‌وگویی نیست.</div>'}</div>`;
      body.querySelector('[data-close]').onclick = () => sheet.close();
      body.querySelector('[data-new]').onclick = () => { setThread(newId()); sheet.close(); paint(true); };
      body.querySelectorAll('[data-id]').forEach(b => b.onclick = () => { setThread(b.dataset.id || null); sheet.close(); paint(true); });
      body.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
        const id = b.dataset.del || null;
        if (!(await confirmBox('این گفت‌وگو پاک شود؟', 'پاک کن'))) return;
        store.deleteThread(id);
        if ((current || null) === id) setThread(threads()[0]?.id ?? newId());
        draw(); paint(true);
      });
    };
    draw();
  }, { tall: true });
}

function decide(btn) {
  const box = btn.closest('.ai-act');
  const m = store.get().chat.find(x => x.id === box.dataset.msg);
  if (!m) return;
  const actions = (m.actions || []).map(a => ({ ...a }));
  const a = actions[Number(box.dataset.i)];
  if (!a || a.status) return;
  if (btn.hasAttribute('data-yes')) {
    const err = apply(a);
    if (err) { toast(err); return; }
    a.status = 'done';
    toast('ثبت شد');
  } else a.status = 'declined';
  store.saveChat({ ...m, actions });
}

function paintLive() {
  const el = viewRoot?.isConnected && viewRoot.querySelector('[data-live]');
  if (!el) return;
  const box = viewRoot.querySelector('[data-scroll]');
  const stick = nearBottom(box);
  el.outerHTML = liveHtml();
  if (stick) box.scrollTop = box.scrollHeight;
}

async function send() {
  const text = draft.trim();
  if (!text || live || !aiAvailable()) return;
  draft = '';
  const thread = current || null;
  // History for the model: this conversation, plus what became of each proposal.
  const history = sorted().filter(m => sameThread(m, thread)).map(m => ({
    role: m.role,
    content: m.role === 'assistant' && m.actions?.length ? `${m.content}\n\n${m.actions.map(historyLine).join('\n')}` : m.content,
  }));
  history.push({ role: 'user', content: text });
  live = { text: '', actions: [], error: null, thread };
  store.saveChat({ role: 'user', content: text, thread });
  paint(true);

  let raf = 0;
  try {
    await chat(history, {
      onText: d => { live.text += d; cancelAnimationFrame(raf); raf = requestAnimationFrame(paintLive); },
      onAction: a => { live.actions.push(a); paintLive(); },
    });
  } catch (e) {
    live.error = e.message;
  }
  cancelAnimationFrame(raf);
  const done = live;
  live = null;
  if (done.text.trim() || done.actions.length) {
    store.saveChat({ role: 'assistant', content: done.text.trim() + (done.error ? `\n\n(${done.error})` : ''), actions: done.actions, thread });
    nameThread(thread);
  } else {
    toast(done.error || 'هوشواره جوابی نداد.');
  }
  paint();
}
