/*
  «سرقت بزرگ»: teaching the game (the owner on 2026-11-18: «بازی آموزش نداره», then «با حوصله… فکر کن برای یه شرکت بزرگ بازی‌سازی بخش آموزش رو
  درست می‌کنی»). Pure: everything the tutorial says and when, so ui/heist.js only shows it. DESIGN-heist.md («آموزش») has the whole flow.

  - WELCOME: the first open, a card with a choice, never a jump into a lesson.
  - LESSONS: five small vaults, one idea each, played for real. Each opens with a goal card (rings round what is new on the board); one
    short line at a time; a hand points at the next safe tap when the player hesitates; the guard lesson won't let the player step on red
    (it warns instead); a capture, an alarm or a wasted pulse shows why (FAIL) and offers to go back to just before the mistake
    (canFinish finds it). Every lesson was checked with the solver (tests/heistTutorial.test.js): the guard, laser and camera lessons can't
    be walked straight through (waiting is the lesson), the gadget lesson can't be done without the pulse, and a player who only avoids red
    gets through the first four.
  - RULES and POWER: the wrap-up cards (the three rules; what the diet gives). Then the menu tour (in the UI, COACH).
  - FIRST: one line the first time a real raid shows something new (a plate, a door, the alarm, a gadget).
  - GUIDE: the «?» sheet, what every sign means.
*/
import { nextThreats, play } from './heist.js';

const V = (tiles, defenses = []) => ({ v: 1, w: 7, h: 9, tiles, defenses });
const CORRIDOR = ['###X###', '###.###', '##V.###', '###.###', '###.###', '###.###', '###.###', '###.###', '###E###'];

export const WELCOME = {
  title: 'سرقت بزرگ',
  text: 'به گاوصندوق‌ها دستبرد بزن، طلا را بردار و گیر نیفت.',
  start: 'شروع آموزش', later: 'بعداً',
  length: 'پنج درس کوتاه',
};
export const START = 'شروع';

export const LESSONS = [
  {
    key: 'move', title: 'هدف', kit: [], protect: false, hand: 0,
    goal: 'طلای صندوق را بردار و از خروجی فرار کن.',
    rows: [['safe', 'صندوق طلایی: کنارش برو و بزنش'], ['exit', 'خروجی فیروزه‌ای: با طلا بیرون برو']],
    vault: V(['###X###', '###.###', '###.###', '##V.###', '###.###', '###.###', '###.###', '###.###', '###E###']),
    steps: [
      { text: 'خانه‌ی روشن کنار دزد را بزن', until: { turns: 1 } },
      { text: 'جلو برو تا کنار صندوق طلایی', until: { nearSafe: true } },
      { text: 'حالا خود صندوق را بزن', until: { loot: true } },
      { text: 'طلا مال توست؛ از خروجی فیروزه‌ای بیرون برو' },
    ],
  },
  {
    key: 'guard', title: 'نگهبان', kit: [], protect: true, hand: 1800,
    goal: 'هر قدم تو، نگهبان هم یک قدم می‌رود.',
    rows: [['red', 'قرمز: اگر آن‌جا بروی، گیرت می‌اندازند'], ['wait', 'ساعت شنی: یک نوبت صبر کن']],
    vault: V(['###X###', '###.###', '##V.###', '###.###', '#.....#', '###.###', '###.###', '###.###', '###E###'],
      [{ t: 'guard', path: [[4, 4], [5, 4], [4, 4], [3, 4], [2, 4], [1, 4], [2, 4], [3, 4]] }]),
    steps: [
      { text: 'جلو برو؛ ببین نگهبان هم راه می‌رود', until: { turns: 2 } },
      { text: 'جلویت قرمز است؛ با ساعت شنی صبر کن', ui: '[data-wait]', until: { clear: true } },
      { text: 'قرمز رفت؛ حالا برو', until: { above: 4 } },
      { text: 'طلا را بردار و فرار کن' },
    ],
  },
  {
    key: 'laser', title: 'لیزر و آژیر', kit: [], protect: false, hand: 3000,
    goal: 'لیزر روشن و خاموش می‌شود. اگر ببیندت، آژیر می‌زند.',
    rows: [['laser', 'لیزر: وقتی خاموش است رد شو'], ['alarm', 'آژیر: ۴ نوبت فرصت داری به خروجی برسی']],
    vault: V(CORRIDOR, [{ t: 'laser', x: 3, y: 5, axis: 'h', mode: 'blink', phase: 2 }]),
    steps: [
      { text: 'جلو برو تا کنار لیزر', until: { turns: 2 } },
      { text: 'جلویت قرمز است؛ صبر کن تا خاموش شود', ui: '[data-wait]', until: { clear: true } },
      { text: 'خاموش شد؛ حالا رد شو', until: { above: 5 } },
      { text: 'طلا را بردار و فرار کن' },
    ],
  },
  {
    key: 'cam', title: 'دوربین', kit: [], protect: false, hand: 3000,
    goal: 'دوربین هر دو نوبت می‌چرخد. وقتی رویش آن‌طرف است، رد شو.',
    rows: [['cam', 'دوربین: هر دو نوبت ربع دور می‌چرخد'], ['red', 'جایی که نوبت بعد می‌بیند، قرمز است']],
    vault: V(CORRIDOR, [{ t: 'cam', x: 2, y: 4, dir: 3, ph: 1 }]),
    steps: [
      { text: 'جلو برو؛ دوربین را روی دیوار ببین', until: { turns: 3 } },
      { text: 'دوربین رو به راهت می‌چرخد؛ صبر کن', ui: '[data-wait]', until: { clear: true } },
      { text: 'رویش را برگرداند؛ حالا برو', until: { above: 4 } },
      { text: 'طلا را بردار و فرار کن' },
    ],
  },
  {
    key: 'emp', title: 'ابزار', kit: ['emp'], protect: false, hand: 2500,
    goal: 'بعضی دفاع‌ها هیچ‌وقت خاموش نمی‌شوند؛ برای آن‌ها ابزار داری.',
    rows: [['emp', 'پالس: لیزر و دوربینِ نزدیک را ۳ نوبت خاموش می‌کند'], ['kit', 'ابزارها را قبل از دستبرد در منو انتخاب می‌کنی']],
    vault: V(CORRIDOR, [{ t: 'laser', x: 3, y: 4, axis: 'h', mode: 'on' }]),
    steps: [
      { text: 'این لیزر خاموش نمی‌شود؛ برو نزدیکش', until: { above: 7 } },
      { text: 'دکمه‌ی پالس را بزن', armed: 'حالا خود دزد را بزن تا پالس بزند', ui: '[data-g="emp"]', until: { used: 0 } },
      { text: 'لیزر سه نوبت خاموش است؛ سریع رد شو', until: { above: 4 } },
      { text: 'طلا را بردار و فرار کن' },
    ],
  },
];

// Why a lesson went wrong (the caught event's `by`, the alarm's `by`, or the ending), and what to do about it.
export const FAIL = {
  seen: ['نگهبان دیدت', 'جلوی چشم نگهبان قرمز است؛ صبر کن تا رد شود.'],
  near: ['کنار نگهبان رفتی', 'خانه‌های کنار نگهبان هم قرمزند.'],
  laser: ['لیزر دیدت', 'صبر کن تا لیزر خاموش شود، بعد رد شو.'],
  cam: ['دوربین دیدت', 'صبر کن تا دوربین رویش را برگرداند.'],
  plate: ['روی صفحه‌ی فشاری رفتی', 'صفحه‌ها از نزدیک معلوم می‌شوند؛ از کنارشان برو.'],
  cornered: ['آژیر تمام شد', 'بعد از آژیر ۴ نوبت داری به خروجی برسی.'],
  timeout: ['وقت تمام شد', 'هر دستبرد ۳۰ نوبت دارد.'],
  fled: ['دست خالی رفتی', 'اول طلای صندوق را بردار، بعد برو.'],
  stuck: ['دیر شد', 'پالس فقط ۳ نوبت کار می‌کند؛ زود رد شو.'],
  back: 'یک قدم برگرد', restart: 'از اول',
};
export const NO_RED = 'روی قرمز نرو؛ نگهبان می‌بیندت';
export const ALARM = 'آژیر! ۴ نوبت فرصت داری به خروجی برسی';
export const DONE = 'آفرین!';

// The wrap-up: the three rules of every raid, then what the diet gives (habits only: briefs/heist-5.md).
export const RULES = {
  title: 'آماده‌ای', button: 'ادامه',
  rows: [['red', 'روی قرمز نرو'], ['wait', 'هر قدم تو، یک قدم دشمن‌ها؛ لازم شد صبر کن'], ['safe', 'طلا را بردار و از خروجی برو']],
};
export const POWER = {
  title: 'قدرتت از رژیمت می‌آید', button: 'بزن بریم',
  rows: [['coin', 'هر روز ثبت کامل: ۱۰۰ سکه و یک دستبرد بیشتر'], ['move', 'روزی که تحرک ثبت کنی: یک دستبرد بیشتر'],
    ['kit', 'هر ۷ روز پشت‌سرهم ثبت کامل: یک ابزار تازه'], ['diamond', 'اولین کسی که الماس فصل را بخرد، برنده است']],
};

// One line the first time a real raid has something the lessons didn't show (shown once each).
export const FIRST = {
  plate: 'خراش کم‌رنگ شاید صفحه‌ی فشاری باشد؛ از کنارش معلوم می‌شود',
  door: 'در قفل: کنارش دو بار به سمتش برو تا باز شود',
  smoke: 'دود: دکمه‌اش را بزن، بعد خانه‌ای نزدیک؛ آن‌جا دید بسته می‌شود',
  decoy: 'طعمه: دکمه‌اش را بزن، بعد خانه‌ای نزدیک؛ نگهبان سراغش می‌رود',
  lockpick: 'قفل‌بازکن: درها با یک بار زدن باز می‌شوند',
  goggles: 'عینک: صفحه‌های فشاری واقعی را از دور قرمز نشان می‌دهد',
  alarm: ALARM,
};
// What a vault (and the gadgets taken) has that FIRST can tell about, in the order to tell it.
export function firsts(vault, kit = []) {
  const d = vault.defenses || [], out = [];
  if (d.some(x => x.t === 'plate' || x.t === 'mark')) out.push('plate');
  if (vault.tiles.join('').includes('D')) out.push('door');
  for (const g of ['smoke', 'decoy', 'lockpick', 'goggles']) if (kit.includes(g)) out.push(g);
  return out;
}

// The «?» sheet: every sign of the game in a line.
export const GUIDE = {
  title: 'راهنما', replay: 'دوباره آموزش',
  rows: [
    ['red', 'قرمز: اگر آن‌جا بروی، گیر می‌افتی یا آژیر می‌زند'], ['corners', 'گوشه‌های روشن: حرکت‌های امن'],
    ['wait', 'ساعت شنی (یا نگه داشتن انگشت): یک نوبت صبر'], ['safe', 'صندوق طلایی: کنارش برو و بزنش'], ['exit', 'خروجی: با طلا بیرون برو'],
    ['guard', 'نگهبان: ۳ خانه جلو و کنارش را می‌بیند'], ['cam', 'دوربین: هر دو نوبت می‌چرخد'], ['laser', 'لیزر: بعضی همیشه روشن‌اند، بعضی چشمک می‌زنند'],
    ['plate', 'صفحه‌ی فشاری: از نزدیک معلوم می‌شود؛ رویش نرو'], ['door', 'در قفل: دو نوبت تا باز شود'], ['alarm', 'آژیر: ۴ نوبت تا خروجی'],
    ['emp', 'پالس: لیزر و دوربینِ نزدیک ۳ نوبت خاموش'], ['smoke', 'دود: دید را ۳ نوبت می‌بندد'], ['decoy', 'طعمه: نگهبان را دو نوبت سرگرم می‌کند'],
    ['lockpick', 'قفل‌بازکن: در با یک بار باز می‌شود'], ['goggles', 'عینک: صفحه‌های واقعی را از دور نشان می‌دهد'],
  ],
};

const W = 7;

// What the lesson's card rings on the board: what is new in it (the gold and the way out in the first).
export function spots(lesson) {
  const v = lesson.vault, t = v.tiles.join(''), d = (v.defenses || [])[0];
  if (!d) return [{ cell: t.indexOf('V'), kind: 'safe' }, { cell: t.indexOf('X'), kind: 'exit' }];
  const [x, y] = d.t === 'guard' ? d.path[0] : [d.x, d.y];
  return [{ cell: y * W + x, kind: 'danger' }];
}

/*
  Can the lesson still be won, quietly, from this state (with what is left of its gadgets)? A search over the moves; the lessons are
  small, so it is quick. Used to send «one step back» to just before the mistake, and to stop a lesson whose pulse was wasted.
*/
export function canFinish(lesson, state) {
  const { vault, kit } = lesson;
  if (state.status !== 'play' || state.alarm) return state.status === 'escaped';
  const key = s => `${s.p}|${s.loot}|${s.t}|${s.used}|${s.emp.join(';')}|${s.doors.join('')}|${s.g.join(',')}`;
  const seen = new Set([key(state)]), moves = kit.includes('emp') ? ['U', 'R', 'D', 'L', 'W', 'E'] : ['U', 'R', 'D', 'L', 'W'];
  let frontier = [state];
  while (frontier.length) {
    const next = [];
    for (const s of frontier) for (const mv of moves) {
      const n = play(vault, s, mv, kit)?.state;
      if (!n) continue;
      if (n.status === 'escaped') return true;
      if (n.status !== 'play' || n.alarm) continue;
      const k = key(n);
      if (!seen.has(k)) { seen.add(k); next.push(n); }
    }
    frontier = next;
  }
  return false;
}

const red = (state, vault) => { const n = nextThreats(vault, state); return new Set([...n.seen, ...n.near, ...n.cam, ...n.laser]); };
export const isRed = (state, vault, cell) => red(state, vault).has(cell);

// Is a line done in this state of the raid?
export function reached(until, state, vault) {
  if (!until) return false;
  const x = state.p % W, y = state.p / W | 0;
  if (until.turns !== undefined) return state.t >= until.turns;
  if (until.loot) return !!state.loot;
  if (until.above !== undefined) return y < until.above;
  if (until.used !== undefined) return !!(state.used & (1 << until.used));
  // the cell ahead (up the board) isn't red: safe to step on next turn
  if (until.clear) return !red(state, vault).has(state.p - W);
  if (until.nearSafe) {
    const safe = vault.tiles.join('').indexOf('V');
    return Math.abs(safe % W - x) + Math.abs((safe / W | 0) - y) === 1;
  }
  return false;
}

// The line to show: the first one not yet done, from `from` on (lines are done in order and never come back).
export function stepOf(lesson, state, from = 0) {
  let i = from;
  while (i < lesson.steps.length - 1 && reached(lesson.steps[i].until, state, lesson.vault)) i++;
  return i;
}

/*
  The next safe tap for the pointing hand: a step toward the safe (or, with the gold, the exit) that isn't red, else a wait if standing still
  is safe, else null. Only walls block the way here (the lessons are corridors). The safe itself is a «step» toward the gold: tapping it
  takes the loot.
*/
export function guide(vault, state) {
  const t = vault.tiles.join(''), goal = t.indexOf(state.loot ? 'X' : 'V'), dist = new Map([[goal, 0]]), q = [goal];
  while (q.length) {
    const c = q.shift();
    for (const n of [c - W, c + 1, c + W, c - 1]) {
      if (n < 0 || n >= t.length || Math.abs(n % W - c % W) + Math.abs((n / W | 0) - (c / W | 0)) !== 1 || t[n] === '#' || t[n] === 'V' || dist.has(n)) continue;
      dist.set(n, dist.get(c) + 1);
      q.push(n);
    }
  }
  const danger = red(state, vault), here = dist.get(state.p) ?? 99;
  const steps = [['U', -W], ['R', 1], ['D', W], ['L', -1]].map(([m, d]) => [m, state.p + d])
    .filter(([, to]) => dist.has(to) && dist.get(to) < here && (to === goal || !danger.has(to)));
  if (steps.length) return { move: steps[0][0], cell: steps[0][1] };
  return danger.has(state.p) ? null : { move: 'W', cell: -1 };
}
