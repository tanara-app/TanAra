/*
  The evening reminder at the right time (BAZGASHT.md, phase 8; the owner's go-ahead, 2026-11-21). Help works
  when it comes at the moment it is needed and can be taken in (just-in-time adaptive interventions,
  Nahum-Shani et al.), so the log reminder goes AFTER_MIN after the time a member usually finishes logging:
  the median, over their last USUAL_DAYS logged days, of each day's last entry (minutes from that day's
  midnight, within the app's day: 5:00 to 29:00, so food logged at 1 am counts for the evening before). At
  least USUAL_MIN such days, rounded to STEP minutes, kept between EARLIEST and LATEST; else the default.

  Only for a member who has not set the time themselves: `log.auto` true, or (from before this) no `auto`
  and the old default DEFAULT_AT. Picking a time in «یادآورها» sets `auto` false; «خودکار» sets it true.
  Pure functions; supabase/functions/remind has a copy (it cannot import from here): change both together.
*/
import { diffDays } from '../lib/dates.js';

export const DEFAULT_AT = '21:00';
export const USUAL_DAYS = 28;
export const USUAL_MIN = 7;
export const AFTER_MIN = 30;
export const EARLIEST = 19 * 60;
export const LATEST = 23 * 60;
export const STEP = 15;
const DAY_FROM = 5 * 60, DAY_TO = 29 * 60;

const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/*
  Each logged day's last entry, in minutes from that day's midnight, oldest day first. `entries` carry `day`
  and `created_at`; `local(iso)` gives { day, min }: the calendar day and minute it was in the member's zone.
*/
export function dayEnds(entries, local) {
  const last = new Map();
  for (const e of entries) {
    if (!e.created_at || !e.day) continue;
    const t = local(e.created_at);
    const m = diffDays(t.day, e.day) * 1440 + t.min;
    if (m < DAY_FROM || m > DAY_TO) continue; // added another day (a day filled in later): says nothing about the hour
    if (!last.has(e.day) || m > last.get(e.day)) last.set(e.day, m);
  }
  return [...last].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, m]) => m);
}

// The time the reminder should go, 'HH:MM', or null with too few days to tell.
export function usualLogTime(ends) {
  const xs = ends.slice(-USUAL_DAYS).sort((a, b) => a - b);
  if (xs.length < USUAL_MIN) return null;
  const mid = xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
  const at = Math.round((mid + AFTER_MIN) / STEP) * STEP;
  return hhmm(Math.min(LATEST, Math.max(EARLIEST, at)));
}

// Whether the time follows their habit (they never set one themselves).
export const autoTime = log => log?.auto === true || (log?.auto === undefined && (!log?.at || log.at === DEFAULT_AT));

// The time the evening reminder goes.
export const logTimeFor = (log, ends) => (autoTime(log) ? usualLogTime(ends) || DEFAULT_AT : log.at);
