/*
  Hooshvareh client: talks to the `hooshvareh` Supabase Edge Function, which holds the
  Claude API key. Every request carries the app's full local state (see context()), so the
  AI sees exactly what the person sees; the function decides which parts each mode needs, to
  keep token use low. When the app gains a new kind of data, add it to context() and to
  sections() in the function (and only to the modes that need it), and update HOOSHVAREH.md.
*/
import * as store from '../data/store.js';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';
import { effectiveTargets, computeTargets, phaseOn, maintenanceKcal, rampKcal, correcting } from '../domain/targets.js';
import { SLOTS, planOn, planEnd, previousPlan, adherence, optionText, picksOn, offOn, slotExtras, dayRooms } from '../domain/plan.js';
import { measuredTdee } from '../domain/energy.js';
import { lossStart, zone, maintainWeeks, lightOn } from '../domain/phase.js';
import { sortedWeights, measureDue, activityWeek, weekStart, ACTIVITY_GOAL } from '../domain/stats.js';
import { upcoming } from '../domain/occasions.js';
import { today, parse, addDays, diffDays } from '../lib/dates.js';
import { perUnit } from '../domain/recipe.js';
import { shopList, toBuy } from '../domain/shopping.js';

const URL_ = `${SUPABASE_URL}/functions/v1/hooshvareh`;
let getToken = null; // async () => access token, or null when signed out / local mode
export function configureAI(fn) { getToken = fn; }
export const aiAvailable = () => !!getToken;
export const aiOnline = () => !!getToken && navigator.onLine !== false;
// The signed-in person's access token, for the app's other Edge Function (reminders).
export const authToken = async () => (getToken ? getToken() : null);

// The diet plan as Hooshvareh sees it: every option in plain words, plus how closely each
// recent day followed it.
function planContext(s, t) {
  const plan = planOn(s.ai_notes, t);
  if (!plan) return null;
  const brief = pl => ({
    start: pl.start, end: planEnd(pl), kcal: pl.kcal,
    slots: Object.keys(SLOTS).map(k => ({ slot: SLOTS[k].label, pick: pl.slots[k].pick, options: pl.slots[k].options.map(o => `${o.title ? `${o.title}: ` : ''}${optionText(o)} (${o.kcal} kcal, ${o.protein} g protein)`) })),
    free: (pl.free || []).map(f => f.name),
  });
  const prev = previousPlan(s.ai_notes, plan);
  const from = addDays(t, -27);
  const picks = picksOn(s.ai_notes, s.entries, t);
  const rooms = dayRooms(plan, picks, slotExtras(s.entries, picks, offOn(s.ai_notes, t), t), s.entries);
  return {
    ...brief(plan), note: plan.note,
    previous: prev ? { start: prev.start, kcal: prev.kcal, adherence: (({ done, of }) => ({ done, of }))(adherence(s.ai_notes, s.entries, prev.start, addDays(plan.start, -1))) } : null,
    days: adherence(s.ai_notes, s.entries, from, t).days,
    // today's occasions that off-plan food changed: what is left, and what was taken off for earlier ones
    rooms: Object.keys(SLOTS).filter(k => rooms[k].extras || rooms[k].owed).map(k => ({ slot: SLOTS[k].label, left: rooms[k].left, owed: rooms[k].owed, locked: rooms[k].locked })),
  };
}

// The magazine as Hooshvareh sees it: every article by title. The full text of the latest few
// goes along too, but the function only shows it to the model when it asks (get_article) or
// for the one the person is asking about (see focusArticle).
let focusKey = null;
export function focusArticle(key) { focusKey = key; }
function magazineContext(s) {
  const all = s.ai_notes.filter(n => n.kind === 'mag' && n.data?.title).sort((a, b) => (a.key < b.key ? 1 : -1));
  return all.slice(0, 60).map((n, i) => {
    const d = n.data;
    const brief = { key: n.key, day: n.key.slice(4, 14), category: d.category, title: d.title, summary: d.summary, read: !!d.read };
    return i < 10 || n.key === focusKey ? { ...brief, body: d.body, for_you: d.for_you, sources: (d.sources || []).map(x => `${x.publisher}: ${x.title}`) } : brief;
  });
}

// Where they are on the road: the phase, the goal, how long they have been losing; in
// maintenance the band, the climb or correction, light logging and where the weight sits now.
function phaseContext(s, p, t) {
  if (!p) return null;
  const phase = phaseOn(p, t);
  const since = lossStart(p);
  const z = zone(p, sortedWeights(s.weights), t);
  const m = phase === 'maintain';
  return {
    phase, goalKg: Number(p.goalKg) || null, breakUntil: phase === 'break' ? p.breakUntil : null,
    maintainFrom: m ? p.maintainFrom || null : null,
    lossWeeks: phase === 'loss' && since ? Math.floor(diffDays(t, since) / 7) : null,
    maintenance: maintenanceKcal(p) || null,
    ...(m ? {
      weeks: maintainWeeks(p, t), climb: rampKcal(p, t), correctUntil: correcting(p, t) ? p.correctUntil : null,
      lightLog: !!p.lightLog, lightNow: lightOn(p, sortedWeights(s.weights), t),
      band: z ? { lo: z.lo, hi: z.hi } : null, zone: z ? { zone: z.zone, avg: Math.round(z.avg * 10) / 10 } : null,
    } : {}),
  };
}

// Minutes of activity: the last four weeks day by day, this week's total and the goal.
function activityContext(s, p, t) {
  const from = addDays(t, -27);
  return {
    days: s.activity.filter(a => a.day >= from && a.day <= t).sort((a, b) => (a.day < b.day ? -1 : 1)).map(({ day, minutes }) => ({ day, minutes })),
    week: activityWeek(s.activity, weekStart(t)),
    goal: ACTIVITY_GOAL[phaseOn(p, t)] || 150,
  };
}

// What the body really uses, measured from the log (or what is still missing for that).
function energyContext(s, p, t) {
  if (!p?.startDate) return null;
  const w = sortedWeights(s.weights);
  const formula = computeTargets({ ...p, weightKg: w.length ? Number(w[w.length - 1].kg) : p.targets?.baseWeight }).tdee;
  const m = measuredTdee(s.entries, s.weights, { day: t, startDate: p.startDate, formula });
  return { ...m, formula: Number.isFinite(formula) ? formula : null, source: p.targets?.manualKcal ? 'manual' : p.targets?.source || 'formula' };
}

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
    foods: s.foods.map(({ id, name, category, unit, grams, kcal, protein, is_veg, created_at, unit2, grams2 }) => ({ id, name, category, unit, grams, kcal, protein, is_veg, created_at, ...(unit2 ? { unit2, grams2 } : {}) })),
    // ids are not shown to the model; the Edge Function needs them to point a correction at a record
    entries: s.entries.map(({ id, day, meal, name, qty, unit, kcal, protein, is_veg, created_at }) => ({ id, day, meal, name, qty, unit, kcal, protein, is_veg, created_at })),
    weights: s.weights.map(({ day, kg }) => ({ day, kg })),
    waists: s.waists.map(({ day, cm }) => ({ day, cm })),
    // what the check-in asks for today (the two are entered together on «پیشرفت»)
    measure: p ? (({ weigh, waist }) => ({ weigh, waist }))(measureDue(s.weights, s.waists, p, t, p.reminders?.weigh?.every)) : null,
    phase: phaseContext(s, p, t),
    activity: p ? activityContext(s, p, t) : null,
    // yearly occasions and their own events in the coming week
    occasions: upcoming(t, s.motivations).map(({ name, day, inDays, days }) => ({ name, day, inDays, days })),
    energy: energyContext(s, p, t),
    reviews: s.reviews.map(({ week_start, good, hard, next_goal }) => ({ week_start, good, hard, next_goal })),
    motivations: s.motivations.map(({ kind, title, note, day, image_path }) => ({ kind, title, note, day, image_path: image_path ? 1 : null })),
    mode: p?.mode === 'plan' ? 'plan' : 'count',
    plan: planContext(s, t),
    magazine: magazineContext(s),
    focus: focusKey,
    // their own recipes, as one unit of the finished dish and what goes in it
    recipes: s.ai_notes.filter(n => n.kind === 'recipe' && n.data?.items?.length).map(({ data: r }) => ({ name: r.name, ...perUnit(r), in_bank: s.foods.some(f => f.id === r.food_id), items: r.items.map(i => `${i.name} ${Math.round(i.grams)} g`) })),
    // «لیست خرید»: what is still waiting to be bought
    shopping: toBuy(shopList(s.ai_notes)).map(({ name, amount }) => ({ name, amount })),
    // «برگشت به مسیر»: what they said when the diet slipped, what was planned, how it went
    checkins: s.ai_notes.filter(n => n.kind === 'checkin' && n.data).sort((a, b) => (a.key < b.key ? -1 : 1)).slice(-5)
      .map(({ key, data: d }) => ({ day: key.slice(8), signs: d.signs, mood: d.mood, causes: d.causes, said: d.said, cause: d.cause, steps: d.steps, goal: d.goal, outcome: d.outcome || null })),
    notes: s.ai_notes.filter(n => !['thread', 'plan', 'pick', 'mag', 'recipe', 'shop', 'checkin'].includes(n.kind)).map(({ key, text, created_at }) => ({ key, text, created_at })),
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

// One-shot modes: tip, quote, review, progress, maintain, checkin, occasion, estimate, photo, label, recipe, shop, title, plan, plan_option, plan_swap, magazine. Resolves to the result object.
export async function ask(mode, input = {}) {
  const res = await post({ mode, input });
  const j = await res.json();
  if (!j.result) throw new Error(j.error || 'هوشواره جواب نداد.');
  return j.result;
}

/*
  Chat: messages are [{ role, content }] oldest first. Calls onText(delta) as the reply
  streams and onAction(proposal) for each proposed change. Resolves when the reply ends.
  `images` (base64 JPEGs) are the photos sent with the last message.
*/
export async function chat(messages, { onText, onAction, images = [] }) {
  const res = await post({ mode: 'chat', messages, ...(images.length ? { images } : {}) });
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

// Small, safe Markdown: **bold**, "- " bullets, numbered lines, paragraphs; "## " lines
// become subheadings only where asked (magazine articles).
export function md(text, { headings = false } = {}) {
  const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const out = [];
  let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    const b = line.match(/^[-•*]\s+(.*)$/);
    const n = line.match(/^[\d۰-۹]+[.)]\s+(.*)$/);
    const h = headings && line.match(/^#+\s+(.*)$/);
    if (h) {
      close();
      out.push(`<h3>${inline(h[1])}</h3>`);
    } else if (b || n) {
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
