/*
  Hooshvareh's face: a small, cheerful professor (img/mascot/, one picture per mood) who says a
  short line when something gets done — the first meal of the day, all three meals, a run of
  days, moving more, a weekly review — and greets them at the top of «امروز».

  The lines are written here, not asked of the AI: they cost nothing and work offline. He never
  judges amounts or comments on weight going up or down. With a possible eating-disorder history
  (edCare) he only says kind things about eating and looking after oneself: no streaks, no
  counting, nothing about the scale.

  He keeps quiet most of the time: a line at most every 90 seconds (the big moments excepted),
  six a day; tapping him gets an answer on top of those (poke). One setting in «نمایه» picks, on this device, whether he is off, only writes, or
  also speaks (his voice is recorded with ElevenLabs, see VOICE.md); it starts on «فقط نوشته».
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
    '{n} روز! یه سال کامل! نظریه‌ی من ثابت شد: تو می‌تونی!',
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
  family: { mood: 'excited', lines: [
    'خانواده به هدف مشترک تحرک این هفته رسید! کار تیمی، نتیجه‌ی تیمی!',
  ] },
};
// With edCare: eating is looking after yourself, nothing more.
const CARE = {
  first: { mood: 'caring', lines: ['نوش جان! خوبه که به خودت انرژی دادی.', 'روزت رو با مراقبت از خودت شروع کردی.'] },
  entry: { mood: ['caring', 'calm', 'happy'], lines: ['نوش جان!', 'بدنت از این انرژی ممنونه.', 'خوبه که به خودت رسیدی.'] },
  activity: { mood: 'happy', lines: ['چه خوب که کمی حرکت کردی.', 'حرکت آروم هم حال آدم رو خوب می‌کنه.'] },
  review: { mood: 'caring', lines: ['ممنون که به هفته‌ات نگاه کردی.'] },
  goal: { mood: 'caring', lines: ['هدف تازه ثبت شد. آروم و با مهربونی پیش برو.'] },
  family: { mood: 'happy', lines: ['خانواده با هم به هدف تحرک این هفته رسید. چه خوب که کنار همید.'] },
};
// The moments that may come right after another line.
const BIG = new Set(['first', 'meals', 'streak', 'review', 'goal', 'family']);
// Each run of days has its own recording, so each has one fixed line (VOICE.md).
const STREAK_LINE = { 3: 0, 7: 1, 14: 2, 21: 0, 30: 1, 60: 2, 100: 0, 200: 1, 365: 3 };
const STREAKS = Object.keys(STREAK_LINE).map(Number);

/*
  His voice: one recording per line in audio/mascot/, named <moment>-<n> after the line's place
  in its list (care-<moment>-<n> for the caring lines, streak-<days>, greet-<part of day>-<n>),
  and a short sound effect under it. Off unless switched on in «نمایه». Recordings are fetched
  whole (not streamed), so the service worker keeps a copy and they play offline too.
*/
const SOUND = 'tanara:mascot:sound';
export function soundOn() {
  try { return localStorage.getItem(SOUND) === 'on'; } catch { return false; }
}
export function setSound(on) {
  try { on ? localStorage.setItem(SOUND, 'on') : localStorage.removeItem(SOUND); } catch { /* private mode */ }
  if (on) speak('greet-back-1'); // a sample, right on the tap that turned it on
}
// The one setting in «نمایه»: 'off', 'text' or 'voice'.
export const MODES = [
  { value: 'off', label: 'خاموش' },
  { value: 'text', label: 'فقط نوشته' },
  { value: 'voice', label: 'نوشته و صدای هایمردینگر' },
];
export const buddyMode = () => (!mascotOn() ? 'off' : soundOn() ? 'voice' : 'text');
export function setBuddyMode(m) {
  const wasVoice = buddyMode() === 'voice';
  setMascot(m !== 'off');
  if (m !== 'voice') setSound(false);
  else if (!wasVoice) setSound(true);
}
const urls = new Map();
function load(name) {
  if (!urls.has(name)) {
    urls.set(name, fetch(`audio/mascot/${name}.mp3`)
      .then(r => (r.ok ? r.blob() : Promise.reject(new Error(r.status))))
      .then(b => URL.createObjectURL(b))
      .catch(e => { urls.delete(name); throw e; }));
  }
  return urls.get(name);
}
// Resolves to the playing Audio, or null (sound off, app in the background, not allowed yet).
async function play(name, volume = 1) {
  if (!soundOn() || document.hidden) return null;
  try {
    const a = new Audio(await load(name));
    a.volume = volume;
    await a.play();
    return a;
  } catch { return null; }
}
let voice = null;
async function speak(name) {
  voice?.pause();
  voice = await play(name);
  return voice;
}
// The goal weight reached (ui/celebrate.js): the cheer, then his line goal-reached (VOICE.md).
export async function celebrateSound() {
  if (!mascotOn()) return;
  play('sfx-cheer', 0.6);
  await new Promise(r => setTimeout(r, 500));
  speak('goal-reached');
}
// The bubbling flasks while Hooshvareh thinks in the chat.
export function thinkingSound() { if (mascotOn()) play('sfx-bubble', 0.3); }

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

async function show(mood, text, sound) {
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
  if (!sound || !soundOn()) return;
  play(sound.sfx, 0.45);
  await new Promise(r => setTimeout(r, 250));
  const a = await speak(sound.voice);
  // stays until he has finished talking
  if (a) a.addEventListener('ended', () => { if (voice === a) { clearTimeout(hideTimer); hideTimer = setTimeout(hide, 1500); } });
  if (a) { clearTimeout(hideTimer); hideTimer = setTimeout(hide, 15000); }
}

function say(kind, n) {
  const care = edCare();
  const set = (care ? CARE : LINES)[kind];
  if (!set) return false;
  const log = readLog();
  if (log.n >= 6) return false;
  if (!BIG.has(kind) && Date.now() - log.last < 90000) return false;
  const mood = Array.isArray(set.mood) ? pick(set.mood) : set.mood;
  const i = kind === 'streak' ? STREAK_LINE[n] : Math.floor(Math.random() * set.lines.length);
  const sfx = care ? 'sfx-chime' : kind === 'goal' ? 'sfx-gadget' : ['meals', 'streak', 'review', 'family'].includes(kind) ? 'sfx-cheer' : 'sfx-pop';
  const file = kind === 'streak' ? `streak-${n}` : `${care ? 'care-' : ''}${kind}-${i + 1}`;
  show(mood, set.lines[i].replace('{n}', fa(n)), { sfx, voice: file });
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
  const i = seed % g.lines.length;
  return `<div class="greet" data-greet data-voice="greet-${key}-${i + 1}" data-once="${t}-${key}">
    <button type="button" class="greet-face" data-greet-face aria-label="هایمردینگر"><img src="${face(g.mood)}" alt="" width="60" height="60"></button>
    <button type="button" class="greet-say" data-greet-say aria-label="گفت‌وگو با هوشواره"><span>${esc(g.lines[i])}</span></button>
  </div>`;
}

/*
  Tap him and he answers, and more so the more he is tapped: curious, then fussy, then giving up.
  The lines take the place of the greeting for a moment and don't count towards the six a day,
  since they asked for them. Nothing here is about food or the body, so they suit everyone. The
  last one says where the chat is, now that tapping him no longer opens it. Each has a recording
  poke-<n> (VOICE.md).
*/
const POKES = [
  { mood: 'surprised', text: 'اوه! داشتم یه فرمول رو حل می‌کردم.' },
  { mood: 'happy', text: 'سلام! دنبال من می‌گشتی؟' },
  { mood: 'wink', text: 'یه راز بهت بگم؟ نصف اختراع‌هام اولش منفجر شدن.' },
  { mood: 'thinking', text: 'هیس! وسط یه آزمایش حساسم.' },
  { mood: 'surprised', text: 'این دکمه نیست‌ها! من پروفسورم!' },
  { mood: 'proud', text: 'نظریه‌ی جدید: تو عاشق دست زدن به پروفسوری!' },
  { mood: 'calm', text: 'باشه، تو بردی. سؤالی داشتی، روی همین نوشته بزن.' },
];
const STAGES = [[0, 1, 2], [3, 4], [5], [6]]; // by how many taps in a row
const plainSrc = img => img.getAttribute('src').replace('-blink', '');
let pokes = 0, pokeAt = 0, lastPoke = -1, pokeTimer = 0, pokeId = 0;

function poke(g) {
  pokes = Date.now() - pokeAt > 6000 ? 0 : pokes + 1;
  pokeAt = Date.now();
  const stage = STAGES[Math.min(Math.floor(pokes / 2), STAGES.length - 1)];
  const i = stage.length > 1 ? pick(stage.filter(n => n !== lastPoke)) : stage[0];
  lastPoke = i;
  const img = g.querySelector('img'), say = g.querySelector('[data-greet-say] span');
  g.dataset.mood ??= plainSrc(img);
  g.dataset.line ??= say.textContent;
  img.src = face(POKES[i].mood);
  say.textContent = POKES[i].text;
  const btn = g.querySelector('[data-greet-face]');
  btn.classList.remove('poked');
  void btn.offsetWidth; // restart the hop
  btn.classList.add('poked');
  const back = () => {
    if (!g.isConnected) return;
    img.src = g.dataset.mood;
    say.textContent = g.dataset.line;
    delete g.dataset.mood;
    delete g.dataset.line;
  };
  clearTimeout(pokeTimer);
  pokeTimer = setTimeout(back, Math.max(3500, POKES[i].text.length * 90));
  voice?.pause();
  play('sfx-pop', 0.45);
  const id = ++pokeId;
  setTimeout(async () => {
    if (id !== pokeId) return;
    const a = await speak(`poke-${i + 1}`);
    if (id !== pokeId) { a?.pause(); return; } // tapped again while it was loading
    if (!a) return;
    // the line stays until he has finished saying it
    clearTimeout(pokeTimer);
    pokeTimer = setTimeout(back, 15000);
    a.addEventListener('ended', () => { if (id === pokeId) { clearTimeout(pokeTimer); pokeTimer = setTimeout(back, 800); } });
  }, 200);
}
/*
  With sound on, the greeting is said once per part of the day. A phone only lets a page play
  sound after a tap, so when the app has just opened it waits for the first touch.
*/
const GREETED = 'tanara:mascot:greeted';
let waiting = false;
export function bindGreet(root) {
  const g = root.querySelector('[data-greet]');
  if (!g) return;
  g.querySelector('[data-greet-say]').addEventListener('click', () => document.querySelector('#nav a[data-route="ai"]')?.click());
  g.querySelector('[data-greet-face]').addEventListener('click', () => poke(g));
  const greet = async () => {
    const now = document.querySelector('[data-greet]');
    if (!now || !soundOn()) return true;
    try { if (localStorage.getItem(GREETED) === now.dataset.once) return true; } catch { return true; }
    if (!(await speak(now.dataset.voice))) return false;
    try { localStorage.setItem(GREETED, now.dataset.once); } catch { /* private mode */ }
    return true;
  };
  if (waiting) return;
  greet().then(done => {
    if (done) return;
    waiting = true;
    document.addEventListener('pointerdown', () => { waiting = false; greet(); }, { once: true, capture: true });
  });
}

/*
  He blinks, every few seconds and now and then twice, wherever he is on screen: the same picture
  with the eyes closed (<mood>-blink.webp) for a moment. Only the moods that have one, and the
  sleepy one already has its eyes shut.
*/
const BLINKS = new Set(['wave', 'happy', 'calm', 'hello']);
const BLINK_MS = 130;
const still = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const kept = [...BLINKS].map(m => Object.assign(new Image(), { src: face(`${m}-blink`) })); // ready, so no flicker

function blinkOnce() {
  for (const img of document.querySelectorAll('.greet img, .chat-buddy, .buddy.show .buddy-img')) {
    const src = img.getAttribute('src') || '';
    const mood = src.match(/mascot\/([a-z]+)\.webp$/)?.[1];
    if (!BLINKS.has(mood)) continue;
    const shut = face(`${mood}-blink`);
    img.src = shut;
    // unless he got a new face in the meantime
    setTimeout(() => { if (img.getAttribute('src') === shut) img.src = src; }, BLINK_MS);
  }
}
(function blinkLater() {
  setTimeout(() => {
    if (kept.length && !document.hidden && !still()) {
      blinkOnce();
      if (Math.random() < 0.15) setTimeout(blinkOnce, BLINK_MS + 140);
    }
    blinkLater();
  }, 2500 + Math.random() * 4500);
})();
