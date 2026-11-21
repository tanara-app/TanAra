/*
  «چه شد؟» (BAZGASHT.md, phase 7). Someone away a week or more is asked once per absence, with one tap, why;
  each reason makes the app answer differently (lapsed members segmented by why, not only by how long they have
  been gone: what the games found works). The answer is the member's own, an ai_note `why:<last active day>`,
  and is shown to no one else.

  «فعلاً نمی‌خواهم» buys a month of quiet: `profile.data.quietUntil` (its last day). Until then `remind` sends
  nothing at all and no one can send «به یادتم»; supabase/functions/remind has a copy of quietOn.
*/
import { addDays } from '../lib/dates.js';

export const REASONS = [
  ['time', 'وقت ندارم'],
  ['hard', 'ثبت کردن سخت است'],
  ['results', 'نتیجه نگرفتم'],
  ['mood', 'حالم خوب نیست'],
  ['forgot', 'فقط یادم رفت'],
  ['notnow', 'فعلاً نمی‌خواهم'],
];
export const reasonLabel = key => REASONS.find(([k]) => k === key)?.[1] || '';

export const QUIET_DAYS = 30;
export const quietEnd = day => addDays(day, QUIET_DAYS - 1);
export const quietOn = (p, day) => !!p?.quietUntil && day <= p.quietUntil;

export const whyKey = since => `why:${since}`;
export const answered = (notes, since) => (notes || []).some(n => n.key === whyKey(since));
