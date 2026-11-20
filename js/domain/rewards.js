/*
  «جوایز»: things a member earns by keeping a habit. Pure functions.

  Each reward is one entry of REWARDS: what it is (`kind`, `name`, and `about`, the few words shown
  under its name), the goal that earns it (`goal`), and `since`, the day it was added. Adding a reward =
  one more entry here (and, for a new kind of goal, one more case in `progress`); the «جوایز» page lists
  them all the same way. Earned once, a reward stays earned (profile.data.rewards: { key: day earned }).

  Only days from `since` on count towards a goal, never the days before the reward existed (the owner's
  rule, 2026-11-19): a new reward is something to start on, not something already won. So every new
  reward gets `since` = the day it ships; one released late at night starts the next day.

  Kinds: 'finish' — a look laid over any colour theme (css/app.css [data-finish]), worn from «ظاهر»;
  'game' — a game (games/<key>/), a tile in «بیشتر» once earned; 'buddy' — a companion (ui/buddies.js)
  who can take Heimerdinger's place, picked in «تنظیمات» ← «همراه» once earned.
  Goals: 'fullRun' — `of` full days in a row (stats.js fullDay: what they said about the day, else two
  meals or more); 'fullDays' — `of` full days in all, in a row or not; 'vegDays' — `of` days, in a row
  or not, with the day's vegetables and fruit at VEG_FRUIT_GOAL servings or more (quality.js);
  'recipeDays' — `of` days, in a row or not, with something logged from one of their own recipes
  («رسپی‌ها» in «بیشتر», ui/recipes.js): its bank food, or for a recipe not in the bank its name.

  Each reward's page (ui/rewards.js) explains its goal in plain words: goalRules.
*/
import { addDays } from '../lib/dates.js';
import { baseMeal } from './meals.js';
import { logMarks, fullDay, VEG_SERVING_G } from './stats.js';
import { vegByDay, VEG_FRUIT_GOAL } from './quality.js';

export const REWARDS = [
  { key: 'parniyan', kind: 'finish', name: 'پرنیان', about: 'پوسته‌ی ظاهر اپ', goal: { type: 'fullRun', of: 21 }, since: '2026-11-15' },
  // 40 days: a «چله»
  { key: 'shab', kind: 'finish', name: 'شب‌پر', about: 'پوسته‌ی ظاهر اپ', goal: { type: 'fullDays', of: 40 }, since: '2026-11-17' },
  // PACKABUNCHAS by Mattia Fortunati (MIT), in Persian: games/tangatang/ (released 2026-11-18 at 23:49)
  { key: 'tangatang', kind: 'game', name: 'تنگاتنگ', about: 'بازی پازل', goal: { type: 'vegDays', of: 10 }, since: '2026-11-19' },
  // the little chef (PFEFFERDINGER.md): pictures img/pfeffer/, voice audio/pfeffer/
  { key: 'pfeffer', kind: 'buddy', name: 'پِفِردینگر', about: 'همراه تازه', goal: { type: 'recipeDays', of: 10 }, since: '2026-11-20' },
];
export const rewardOf = key => REWARDS.find(r => r.key === key) || null;

// the goal in words, under the reward's name
export function goalText(r, fa = String) {
  if (r.goal.type === 'fullRun') return `${fa(r.goal.of)} روز پشت‌سرهم ثبت کامل`;
  if (r.goal.type === 'fullDays') return `${fa(r.goal.of)} روز ثبت کامل`;
  if (r.goal.type === 'vegDays') return `${fa(r.goal.of)} روز ${fa(VEG_FRUIT_GOAL)} سهم سبزی و میوه`;
  if (r.goal.type === 'recipeDays') return `${fa(r.goal.of)} روز غذا از رسپی‌های خودت`;
  return '';
}

/*
  The goal's rules in plain words, one short line each, for the reward's own page: what counts as a
  day, what breaks a run, the day counting starts (`dm`: a day in Persian), and where the reward is
  used once earned. They follow progress() exactly; change both together.
*/
const FULL_DAY = 'هر روزی که دست‌کم دو وعده‌اش را ثبت کنی، یک «روز کامل» است.';
const MARK_DAY = 'اگر روزی کمتر خوردی و همه‌اش را ثبت کردی، در «امروز» روی «ثبت ناقص» بزن تا «ثبت کامل» شود.';
const USE = {
  finish: 'در «تنظیمات» ← «ظاهر» ← «پوسته» روشنش کن',
  game: 'کاشی‌اش در «بیشتر» می‌آید',
  buddy: 'در «تنظیمات» ← «همراه» ← «شخصیت» انتخابش کن',
};
export function goalRules(r, fa = String, dm = String) {
  const of = fa(r.goal.of);
  const own = {
    fullRun: [FULL_DAY, MARK_DAY,
      `${of} روز کامل باید پشت‌سرهم باشد؛ یک روز ناقص یا خالی، شمارش را از صفر شروع می‌کند.`,
      'امروز تا وقتی کامل نشده رشته را نمی‌شکند؛ وقتی کامل شد، یک روز اضافه می‌شود.'],
    fullDays: [FULL_DAY, MARK_DAY,
      'لازم نیست پشت‌سرهم باشد؛ هر روز کامل یکی اضافه می‌کند و روز ناقص چیزی کم نمی‌کند.'],
    vegDays: [`روزی حساب می‌شود که دست‌کم ${fa(VEG_FRUIT_GOAL)} سهم سبزی و میوه ثبت کنی؛ همان عددی که در «امروز» کنار «سبزی و میوه» است.`,
      `هر واحد سبزی یا میوه یک سهم است؛ اگر با گرم ثبت کنی، هر ${fa(VEG_SERVING_G)} گرم یک سهم.`,
      'خرما و کشمش حساب نیستند؛ جزو «آجیل و خرما» هستند.',
      'لازم نیست پشت‌سرهم باشد.'],
    recipeDays: ['روزی حساب می‌شود که دست‌کم یک غذا از رسپی‌های خودت ثبت کنی.',
      'رسپی را در «بیشتر» ← «رسپی‌ها» بساز یا ذخیره کن؛ بعد در همان رسپی «پختم» را بزن و سهمت را ثبت کن.',
      'رسپی‌ای که در بانک غذا هم گذاشته‌ای، از جست‌وجوی غذا هم ثبت کنی حساب است.',
      'چند غذا در یک روز، یک روز حساب می‌شود؛ لازم نیست پشت‌سرهم باشد.'],
  }[r.goal.type] || [];
  return [...own,
    `فقط روزهای از ${dm(r.since)} به بعد حساب‌اند؛ همان روزی که این جایزه آمد.`,
    `وقتی رسیدی، برای همیشه مال توست؛ ${USE[r.kind]}.`];
}

/*
  { best, now, total }: the longest run of full days so far (up to `day`), the run going on now —
  ending today when today is already full, else ending yesterday (today is not over yet) — and all
  the full days so far.
*/
export function fullRuns(entries, notes, day) {
  const meals = new Map();
  for (const e of entries) {
    if (e.day > day) continue;
    (meals.get(e.day) || meals.set(e.day, new Set()).get(e.day)).add(baseMeal(e.meal));
  }
  const marks = logMarks(notes);
  const full = new Set([...meals].filter(([d, m]) => fullDay(d, m.size, marks)).map(([d]) => d));
  let best = 0;
  for (const d of full) {
    if (full.has(addDays(d, -1))) continue; // not the start of a run
    let n = 0;
    for (let x = d; full.has(x); x = addDays(x, 1)) n++;
    best = Math.max(best, n);
  }
  let now = 0;
  for (let x = full.has(day) ? day : addDays(day, -1); full.has(x); x = addDays(x, -1)) now++;
  return { best, now, total: full.size };
}

/*
  Where a member stands with each reward: [{ reward, earned, now, of }]. `earned` (from the profile)
  keeps a reward earned; otherwise it is earned once its goal was ever met. `now`/`of`: the progress
  shown while it is still ahead.
*/
// Days up to `day` (today counts once reached) with the vegetables and fruit goal met.
export const vegDays = (entries, foods, day) =>
  [...vegByDay(entries, foods)].filter(([d, n]) => d <= day && n >= VEG_FRUIT_GOAL).length;

// Days up to `day` with something logged from one of their own recipes (ai_notes of kind 'recipe').
export function recipeDays(entries, notes, day) {
  const recs = (notes || []).filter(n => n.kind === 'recipe' && n.data);
  const ids = new Set(recs.map(n => n.data.food_id).filter(Boolean));
  const names = new Set(recs.map(n => String(n.data.name || '').trim()).filter(Boolean));
  const days = new Set();
  for (const e of entries) {
    if (e.day > day) continue;
    if (e.food_id ? ids.has(e.food_id) : names.has(String(e.name || '').trim())) days.add(e.day);
  }
  return days.size;
}

export function progress({ entries = [], notes = [], foods = [], earned = {} }, day, rewards = REWARDS) {
  return rewards.map(r => {
    const of = r.goal.of;
    // only the days since the reward was added
    const mine = r.since ? entries.filter(e => e.day >= r.since) : entries;
    const runs = r.goal.type === 'fullRun' || r.goal.type === 'fullDays' ? fullRuns(mine, notes, day) : null;
    const veg = r.goal.type === 'vegDays' ? vegDays(mine, foods, day) : 0;
    const cooked = r.goal.type === 'recipeDays' ? recipeDays(mine, notes, day) : 0;
    const [now, met] = r.goal.type === 'fullRun' ? [runs.now, runs.best >= of]
      : r.goal.type === 'fullDays' ? [runs.total, runs.total >= of]
      : r.goal.type === 'vegDays' ? [veg, veg >= of]
      : r.goal.type === 'recipeDays' ? [cooked, cooked >= of]
      : [0, false];
    return { reward: r, earned: !!earned[r.key] || met, now: Math.min(now, of), of };
  });
}

// the finishes they may wear (earned ones)
export const earnedFinishes = earned => REWARDS.filter(r => r.kind === 'finish' && earned?.[r.key]);
