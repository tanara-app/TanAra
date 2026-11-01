/*
  Hooshvareh's face: a small, cheerful professor (img/mascot/, one picture per mood) who says a
  short line when something gets done — the first meal of the day, all three meals, a run of
  days, moving more, a weekly review — and greets them at the top of «امروز».

  The lines are written here, not asked of the AI: they cost nothing and work offline. He never
  judges amounts or comments on weight going up or down. With a possible eating-disorder history
  (edCare) he only says kind things about eating and looking after oneself: no streaks, no
  counting, nothing about the scale.

  He keeps quiet most of the time: a line at most every 90 seconds (the big moments excepted),
  six a day, and the switch in «نمایه» turns him off on this device.
*/
import * as store from '../data/store.js';
import { entriesOn, streak } from '../domain/stats.js';
import { today, diffDays } from '../lib/dates.js';
import { esc, fa } from '../lib/fa.js';

export const face = (mood = 'happy') => `img/mascot/${mood}.webp`;

const KEY = 'tanara:mascot';
export function mascotOn() {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function setMascot(on) {
  try { on ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, 'off'); } catch { /* private mode */ }
}

const edCare = () => ['yes', 'unsure'].includes(store.profile()?.edHistory);
const pick = list => list[Math.floor(Math.random() * list.length)];

// What he says, by moment. {n} is filled in with a number.
const LINES = {
  first: { mood: 'excited', lines: [
    'آه، اولین ثبت امروز! آزمایش روزانه رسماً شروع شد!',
    'عالی! داده‌ی امروز رسید. علم ازت ممنونه!',
    'به‌به! روز رو با یه ثبت درست شروع کردی.',
  ] },
  entry: { mood: ['wink', 'happy', 'proud'], lines: [
    'ثبت شد! دقیق و مرتب، مثل یه دانشمند واقعی.',
    'آفرین! همین ثبت‌های کوچیک نتیجه‌ی بزرگ می‌سازن.',
    'یه داده‌ی دیگه به آزمایشگاه اضافه شد!',
    'عالیه! داری عالی پیش میری.',
    'دقت تو منو به وجد میاره!',
  ] },
  meals: { mood: 'proud', lines: [
    'صبحانه، ناهار، شام: هر سه ثبت شد! یه روز کامل!',
    'هر سه وعده ثبت شده. این یعنی یه روز علمیِ کامل!',
  ] },
  streak: { mood: 'excited', lines: [
    '{n} روز پشت‌سرهم! این دیگه یه عادت واقعیه!',
    'فوق‌العاده! {n} روز پیاپی ثبت کردی!',
    '{n} روز بی‌وقفه! نظریه‌ی من ثابت شد: تو می‌تونی!',
  ] },
  activity: { mood: 'excited', lines: [
    'حرکت ثبت شد! بدنت الان داره تشکر می‌کنه.',
    'آفرین! هر دقیقه حرکت، یه سرمایه‌گذاریه.',
    'به‌به، تحرک! قلبت عاشق این کاره.',
  ] },
  measure: { mood: 'calm', lines: [
    'ثبت شد! یه نقطه‌ی تازه روی نمودار.',
    'ممنون! داده‌ی منظم یعنی تحلیل دقیق‌تر.',
  ] },
  review: { mood: 'proud', lines: [
    'مرور هفته ثبت شد! نگاه کردن به عقب، قدم بعدی رو روشن می‌کنه.',
    'آفرین! یه دانشمند خوب همیشه یادداشت برمی‌داره.',
  ] },
  goal: { mood: 'wink', lines: [
    'هدف این هفته ثبت شد. بزن بریم!',
    'هدف تازه! من کنارتم.',
  ] },
};
// With edCare: eating is looking after yourself, nothing more.
const CARE = {
  first: { mood: 'caring', lines: ['نوش جان! خوبه که به خودت انرژی دادی.', 'روزت رو با مراقبت از خودت شروع کردی.'] },
  entry: { mood: ['caring', 'calm', 'happy'], lines: ['نوش جان!', 'بدنت از این انرژی ممنونه.', 'خوبه که به خودت رسیدی.'] },
  activity: { mood: 'happy', lines: ['چه خوب که کمی حرکت کردی.', 'حرکت آروم هم حال آدم رو خوب می‌کنه.'] },
  review: { mood: 'caring', lines: ['ممنون که به هفته‌ات نگاه کردی.'] },
  goal: { mood: 'caring', lines: ['هدف تازه ثبت شد. آروم و با مهربونی پیش برو.'] },
};
// The moments that may come right after another line.
const BIG = new Set(['first', 'meals', 'streak', 'review', 'goal']);
const STREAKS = [3, 7, 14, 21, 30, 60, 100, 200, 365];

/* ---------- how often: kept on this device, per day ---------- */
const LOG = 'tanara:mascot:log';
function readLog() {
  try {
    const l = JSON.parse(localStorage.getItem(LOG) || 'null');
    if (l?.day === today()) return l;
  } catch { /* fall through */ }
  return { day: today(), n: 0, last: 0, said: [] };
}
function writeLog(l) { try { localStorage.setItem(LOG, JSON.stringify(l)); } catch { /* private mode */ } }

/* ---------- the pop-up ---------- */
let el = null, hideTimer = 0;
function mount() {
  if (el) return el;
  el = document.createElement('div');
  el.className = 'buddy';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = '<img class="buddy-img" alt="" width="96" height="96"><p class="buddy-say"></p>';
  el.onclick = hide;
  document.body.appendChild(el);
  return el;
}
function hide() { clearTimeout(hideTimer); el?.classList.remove('show'); }

async function show(mood, text) {
  const b = mount();
  const img = b.querySelector('img');
  img.src = face(mood);
  b.querySelector('p').textContent = text;
  // wait for the picture, but not for long (a page in the background may never decode it)
  await Promise.race([img.decode().catch(() => {}), new Promise(r => setTimeout(r, 400))]);
  document.getElementById('toast')?.classList.remove('show'); // his line says it too
  b.classList.remove('show');
  void b.offsetWidth; // restart the pop-in
  b.classList.add('show');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hide, Math.max(3500, text.length * 90));
}

function say(kind, n) {
  const set = (edCare() ? CARE : LINES)[kind];
  if (!set) return false;
  const log = readLog();
  if (log.n >= 6) return false;
  if (!BIG.has(kind) && Date.now() - log.last < 90000) return false;
  const mood = Array.isArray(set.mood) ? pick(set.mood) : set.mood;
  show(mood, pick(set.lines).replace('{n}', fa(n)));
  log.n++;
  log.last = Date.now();
  log.said.push(kind === 'streak' ? `streak${n}` : kind);
  writeLog(log);
  return true;
}

/*
  Called right after something is saved. A photo or a plan option logs several foods at once,
  so entries are gathered for a moment and answered with one line. The sheet that saved them
  usually closes first, so the line comes a beat later.
*/
let entryTimer = 0;
export function cheer(kind) {
  if (!mascotOn() || !store.profile()) return;
  if (kind !== 'entry') { setTimeout(() => quiet() || say(kind), 700); return; }
  clearTimeout(entryTimer);
  entryTimer = setTimeout(() => { if (!quiet()) onEntry(); }, 900);
}
// not over the keyboard or the chat (Hooshvareh is already talking there)
const quiet = () => document.body.classList.contains('kb') || document.body.classList.contains('chat-mode');

function onEntry() {
  const t = today();
  const entries = store.get().entries;
  const todays = entriesOn(entries, t);
  if (!todays.length) return;
  const said = readLog().said;
  if (!said.includes('first')) { say('first'); return; }
  if (!edCare()) {
    const meals = new Set(todays.map(e => e.meal));
    if (!said.includes('meals') && ['breakfast', 'lunch', 'dinner'].every(m => meals.has(m))) { say('meals'); return; }
    const n = streak(entries, t);
    if (STREAKS.includes(n) && !said.includes(`streak${n}`)) { say('streak', n); return; }
  }
  if (Math.random() < 0.4) say('entry');
}

/* ---------- greeting at the top of «امروز» ---------- */
const GREET = {
  morning: { mood: 'wave', lines: ['صبح بخیر! آزمایشگاه امروز آماده‌ست.', 'صبح بخیر! یه روز تازه، یه شروع تازه.', 'سلام صبح‌به‌خیر! امروز چی کشف می‌کنیم؟'] },
  noon: { mood: 'happy', lines: ['ظهرت بخیر! روز داره خوب پیش میره.', 'سلام! یادت نره به خودت برسی.', 'ظهر بخیر! من اینجام اگه سؤالی داشتی.'] },
  evening: { mood: 'calm', lines: ['عصرت بخیر! امروز چطور گذشت؟', 'سلام! یه نگاه کوچیک به امروز بندازیم؟', 'عصر بخیر! تا اینجای روز عالی بودی.'] },
  night: { mood: 'sleepy', lines: ['شب بخیر! خواب خوب هم بخشی از برنامه‌ست.', 'دیروقته! بدنت به استراحت نیاز داره.'] },
  back: { mood: 'hello', lines: ['خوش برگشتی! دلم برات تنگ شده بود.', 'سلام دوباره! از همین‌جا ادامه می‌دیم، بی‌دغدغه.'] },
};
function slot(h) { return h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'noon' : h >= 17 && h < 23 ? 'evening' : 'night'; }

// The same line all through a part of the day, so redraws don't change it.
export function greetCard() {
  if (!mascotOn()) return '';
  const t = today();
  const entries = store.get().entries;
  const last = entries.reduce((m, e) => (e.day < t && e.day > m ? e.day : m), '');
  const away = last && diffDays(t, last) >= 3 && !entriesOn(entries, t).length;
  const key = away ? 'back' : slot(new Date().getHours());
  const g = GREET[key];
  const seed = [...`${t}${key}`].reduce((a, c) => a + c.charCodeAt(0), 0);
  return `<button type="button" class="greet" data-greet aria-label="گفت‌وگو با هوشواره">
    <img src="${face(g.mood)}" alt="" width="60" height="60">
    <span>${esc(g.lines[seed % g.lines.length])}</span>
  </button>`;
}
export function bindGreet(root) {
  root.querySelector('[data-greet]')?.addEventListener('click', () => document.querySelector('#nav a[data-route="ai"]')?.click());
}
