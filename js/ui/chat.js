// Hooshvareh chat: talk to the AI about everything recorded in the app. It can propose
// changes (log a food, a weight, ...) as cards; nothing is written until «ثبت» is tapped.
import * as store from '../data/store.js';
import { chat, aiAvailable, md, sparkle } from '../ai/hooshvareh.js';
import { MEALS } from '../domain/stats.js';
import { fa, esc, qtyLabel } from '../lib/fa.js';
import { today, relLabel, faDMY, weekLabel } from '../lib/dates.js';
import { toast, confirmBox } from './dom.js';

const SUGGESTIONS = [
  'امروز تا الان چطور پیش رفتم؟',
  'برای شام چی بخورم که پروتئینم برسد؟',
  'این هفته را با هفته‌ی قبل مقایسه کن',
  'ناهار دو کفگیر برنج با یک کفگیر قیمه خوردم',
];

let draft = '';
let live = null; // the reply being streamed: { text, actions, error }
let viewRoot = null;

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
      return `افزودن به بانک غذا: <b>${esc(a.name)}</b><br><small>هر ${esc(a.unit)} · ${fa(Math.round(a.kcal))} کالری · ${fa(Math.round(a.protein * 10) / 10, 1)} گرم پروتئین</small>`;
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
      if (!isISO(a.day) || a.day > t || !MEALS[a.meal] || !a.name || !num(a.kcal, 0, 10000) || !num(a.qty, 0.01, 100)) return 'این پیشنهاد کامل نیست.';
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
      store.upsertFood({ name: a.name, unit: a.unit, kcal: Number(a.kcal), protein: Number(a.protein) || 0, category: a.category, is_veg: !!a.is_veg });
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
  if (!live) return '';
  const body = live.text ? md(live.text) : '<p class="typing"><i></i><i></i><i></i></p>';
  return `<div class="msg ai" data-live>${body}${actionsHtml(null, live.actions)}${live.error ? `<p class="err">${esc(live.error)}</p>` : ''}</div>`;
}

export function renderChat(root) {
  viewRoot = root;
  const msgs = sorted();
  const ok = aiAvailable();
  root.innerHTML = `
    <header class="page-head chat-head">
      <h1><span class="ai-mark">${sparkle(22)}</span> هوشواره</h1>
      ${msgs.length ? '<button class="link small" data-clear>پاک کردن گفت‌وگو</button>' : ''}
    </header>
    <div class="chat">
      ${!msgs.length && !live ? `<div class="chat-empty">
        <p>سلام! من هوشواره‌ام. همه‌ی چیزهایی را که در تن‌آرا ثبت کرده‌ای می‌بینم: غذاها، وزن، مرورهای هفته و انگیزه‌هایت.</p>
        <p class="muted small">بپرس، تحلیل بخواه، یا بگو چه خوردی تا برایت ثبتش کنم (با تأیید خودت).</p>
        <div class="chat-sugg">${SUGGESTIONS.map(s => `<button class="chip-btn" data-sugg>${s}</button>`).join('')}</div>
      </div>` : ''}
      ${msgs.map(bubble).join('')}
      ${liveHtml()}
    </div>
    <form class="chat-bar" novalidate>
      <textarea rows="1" placeholder="${ok ? 'از هوشواره بپرس…' : 'هوشواره فقط با ورود به حساب کار می‌کند'}" ${ok ? '' : 'disabled'}>${esc(draft)}</textarea>
      <button class="send" aria-label="فرستادن" ${ok && !live ? '' : 'disabled'}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12H5M11 6l-6 6 6 6"/></svg></button>
    </form>`;

  const ta = root.querySelector('textarea');
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; };
  grow();
  ta.addEventListener('input', () => { draft = ta.value; grow(); });
  ta.addEventListener('keydown', e => {
    // Enter sends on a keyboard; on phones Enter is a new line and the button sends
    if (e.key === 'Enter' && !e.shiftKey && matchMedia('(hover: hover)').matches) { e.preventDefault(); send(); }
  });
  root.querySelector('.chat-bar').onsubmit = e => { e.preventDefault(); send(); };
  root.querySelectorAll('[data-sugg]').forEach(b => b.onclick = () => { draft = b.textContent; send(); });
  root.querySelector('[data-clear]')?.addEventListener('click', async () => {
    if (await confirmBox('همه‌ی گفت‌وگو با هوشواره پاک شود؟', 'پاک کن')) store.clearChat();
  });
  root.querySelectorAll('.ai-act [data-yes], .ai-act [data-no]').forEach(b => b.onclick = () => decide(b));
  requestAnimationFrame(() => window.scrollTo(0, document.documentElement.scrollHeight));
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
  const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 120;
  el.outerHTML = liveHtml();
  if (nearBottom) window.scrollTo(0, document.documentElement.scrollHeight);
}

async function send() {
  const text = draft.trim();
  if (!text || live || !aiAvailable()) return;
  draft = '';
  // History for the model: what was said, plus what became of each proposal.
  const history = sorted().map(m => ({
    role: m.role,
    content: m.role === 'assistant' && m.actions?.length ? `${m.content}\n\n${m.actions.map(historyLine).join('\n')}` : m.content,
  }));
  history.push({ role: 'user', content: text });
  store.saveChat({ role: 'user', content: text });
  live = { text: '', actions: [], error: null };
  rerender();

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
    store.saveChat({ role: 'assistant', content: done.text.trim() + (done.error ? `\n\n(${done.error})` : ''), actions: done.actions });
  } else {
    toast(done.error || 'هوشواره جوابی نداد.');
  }
  rerender();
}

function rerender() {
  if (viewRoot?.isConnected && location.hash === '#/ai') renderChat(viewRoot);
}
