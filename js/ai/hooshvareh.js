/*
  Hooshvareh client: talks to the `hooshvareh` Supabase Edge Function, which holds the
  Claude API key. Every request carries the app's full local state (see context()), so the
  AI sees exactly what the person sees. When the app gains a new kind of data, add it to
  context() and to snapshot() in the function, and update HOOSHVAREH.md.
*/
import * as store from '../data/store.js';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';
import { effectiveTargets } from '../domain/targets.js';
import { today, parse } from '../lib/dates.js';

const URL_ = `${SUPABASE_URL}/functions/v1/hooshvareh`;
let getToken = null; // async () => access token, or null when signed out / local mode
export function configureAI(fn) { getToken = fn; }
export const aiAvailable = () => !!getToken;
export const aiOnline = () => !!getToken && navigator.onLine !== false;

function context() {
  const s = store.get();
  const p = store.profile();
  const t = today();
  const d = new Date();
  return {
    today: t,
    todayFa: new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(parse(t)),
    now: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    profile: p,
    targets: p ? effectiveTargets(p) : null,
    foods: s.foods.map(({ id, name, unit, kcal, protein, is_veg }) => ({ id, name, unit, kcal, protein, is_veg })),
    entries: s.entries.map(({ day, meal, name, qty, unit, kcal, protein, is_veg, created_at }) => ({ day, meal, name, qty, unit, kcal, protein, is_veg, created_at })),
    weights: s.weights.map(({ day, kg }) => ({ day, kg })),
    reviews: s.reviews.map(({ week_start, good, hard, next_goal }) => ({ week_start, good, hard, next_goal })),
    motivations: s.motivations.map(({ kind, title, note, day, image_path }) => ({ kind, title, note, day, image_path: image_path ? 1 : null })),
    notes: s.ai_notes.map(({ key, text, created_at }) => ({ key, text, created_at })),
  };
}

async function post(body) {
  if (!getToken) throw new Error('هوشواره فقط وقتی وارد حساب شده‌ای کار می‌کند.');
  if (navigator.onLine === false) throw new Error('برای هوشواره به اینترنت وصل شو.');
  const token = await getToken();
  if (!token) throw new Error('دوباره وارد شو.');
  let res;
  try {
    res = await fetch(URL_, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY },
      body: JSON.stringify({ ...body, ctx: context() }),
    });
  } catch { throw new Error('به هوشواره وصل نشد. اینترنت را بررسی کن.'); }
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new Error(j?.error && /[؀-ۿ]/.test(j.error) ? j.error : 'هوشواره جواب نداد؛ دوباره امتحان کن.');
  }
  return res;
}

// One-shot modes: tip, quote, review, progress, estimate. Resolves to the result object.
export async function ask(mode, input = {}) {
  const res = await post({ mode, input });
  const j = await res.json();
  if (!j.result) throw new Error(j.error || 'هوشواره جواب نداد.');
  return j.result;
}

/*
  Chat: messages are [{ role, content }] oldest first. Calls onText(delta) as the reply
  streams and onAction(proposal) for each proposed change. Resolves when the reply ends.
*/
export async function chat(messages, { onText, onAction }) {
  const res = await post({ mode: 'chat', messages });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let errored = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }
      if (ev.t === 'text') onText(ev.v);
      else if (ev.t === 'action') onAction(ev.v);
      else if (ev.t === 'error') errored = ev.v;
    }
  }
  if (errored) throw new Error(errored);
}

/* ---------------- shared bits for the screens ---------------- */

// Small, safe Markdown: **bold**, "- " bullets, numbered lines, paragraphs.
export function md(text) {
  const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const out = [];
  let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    const b = line.match(/^[-•*]\s+(.*)$/);
    const n = line.match(/^[\d۰-۹]+[.)]\s+(.*)$/);
    if (b || n) {
      const want = b ? 'ul' : 'ol';
      if (list !== want) { close(); out.push(`<${want}>`); list = want; }
      out.push(`<li>${inline((b || n)[1])}</li>`);
    } else if (!line) {
      close();
    } else {
      close();
      out.push(`<p>${inline(line.replace(/^#+\s*/, ''))}</p>`);
    }
  }
  close();
  return out.join('');
}

export const sparkle = (size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.5l-1.8-5L5 9.7l5.2-1.8z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>`;
