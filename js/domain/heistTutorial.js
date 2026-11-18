/*
  «سرقت بزرگ»: the first-play tutorial (asked for by the owner on 2026-11-18: «بازی آموزش نداره»). Four small vaults, each teaching one
  thing by doing it, with one short line at a time; then the menu is walked through (ui/heist.js). Pure: the vaults, the lines, and when
  each line is done.

  Each lesson was checked with the solver (tests/heistTutorial.test.js): the guard and the laser lessons can't be walked straight through
  (waiting is the lesson), the last can't be done without the pulse.
*/
import { nextThreats } from './heist.js';

const V = (tiles, defenses = []) => ({ v: 1, w: 7, h: 9, tiles, defenses });

export const LESSONS = [
  {
    key: 'move', kit: [],
    vault: V(['###X###', '###.###', '###.###', '##V.###', '###.###', '###.###', '###.###', '###.###', '###E###']),
    steps: [
      { text: 'خانه‌ی روشن کنار دزد را بزن', until: { turns: 1 } },
      { text: 'برو کنار صندوق طلایی', until: { nearSafe: true } },
      { text: 'صندوق را بزن', until: { loot: true } },
      { text: 'حالا از خروجی فیروزه‌ای فرار کن' },
    ],
  },
  {
    key: 'guard', kit: [],
    vault: V(['###X###', '###.###', '##V.###', '###.###', '#.....#', '###.###', '###.###', '###.###', '###E###'],
      [{ t: 'guard', path: [[4, 4], [5, 4], [4, 4], [3, 4], [2, 4], [1, 4], [2, 4], [3, 4]] }]),
    steps: [
      { text: 'قرمز یعنی اگر آن‌جا بروی، نگهبان می‌گیردت', until: { turns: 2 } },
      { text: 'جلویت قرمز است؛ با ساعت شنی صبر کن', ui: '[data-wait]', until: { clear: true } },
      { text: 'قرمز رفت؛ حالا برو', until: { above: 4 } },
      { text: 'صندوق، بعد خروجی' },
    ],
  },
  {
    key: 'laser', kit: [],
    vault: V(['###X###', '###.###', '##V.###', '###.###', '###.###', '###.###', '###.###', '###.###', '###E###'],
      [{ t: 'laser', x: 3, y: 5, axis: 'h', mode: 'blink', phase: 2 }]),
    steps: [
      { text: 'لیزر روشن و خاموش می‌شود', until: { turns: 2 } },
      { text: 'جلویت قرمز است؛ صبر کن تا خاموش شود', ui: '[data-wait]', until: { clear: true } },
      { text: 'خاموش شد؛ حالا رد شو', until: { above: 5 } },
      { text: 'اگر لیزر یا دوربین ببیندت، آژیر می‌زند', until: { loot: true } },
      { text: 'فرار کن' },
    ],
  },
  {
    key: 'emp', kit: ['emp'],
    vault: V(['###X###', '###.###', '##V.###', '###.###', '###.###', '###.###', '###.###', '###.###', '###E###'],
      [{ t: 'laser', x: 3, y: 4, axis: 'h', mode: 'on' }]),
    steps: [
      { text: 'این لیزر خاموش نمی‌شود؛ برو نزدیکش', until: { above: 7 } },
      { text: 'پالس را بزن', ui: '[data-g="emp"]', until: { used: 0 } },
      { text: 'لیزر سه نوبت خاموش است؛ رد شو' },
    ],
  },
];

const W = 7;
// Is a line done in this state of the raid?
export function reached(until, state, vault) {
  if (!until) return false;
  const x = state.p % W, y = state.p / W | 0;
  if (until.turns !== undefined) return state.t >= until.turns;
  if (until.loot) return !!state.loot;
  if (until.above !== undefined) return y < until.above;
  if (until.used !== undefined) return !!(state.used & (1 << until.used));
  // the cell ahead (up the board) isn't red: safe to step on next turn
  if (until.clear) { const n = nextThreats(vault, state); return ![...n.seen, ...n.near, ...n.cam, ...n.laser].includes(state.p - W); }
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
