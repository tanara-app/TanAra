/*
  Away from the app: how long since a member last recorded anything, what state that puts them in,
  and which push (if any) goes to them tonight. BAZGASHT.md («وضعیت هر عضو» and phase 1).

  An active day is a day with anything recorded: food, weight, waist or activity. The states follow
  Duolingo's growth model, cut to a food log: current (0–2 days away), lapsed (3–6), away (7–29),
  gone (30 or more). Pure functions; supabase/functions/remind has a copy of lapsePush and its
  constants (it cannot import from here): change both together.
*/
import { diffDays, addDays, jParts } from '../lib/dates.js';

export const BACK_DAYS = 3;   // away this long: a lapse (the welcome back, the first push)
export const BACK2_DAYS = 5;  // the second push
export const AWAY_DAYS = 7;   // the last push, then quiet
export const GONE_DAYS = 30;  // coming back after this long is like starting again
export const FRESH_MAX = 3;   // fresh-start pushes in one absence, at most
export const FRESH_REST = 3;  // days after the last push of the absence before a fresh-start one
export const LAST_REST = 2;   // days after the last push before the last one

// Days since the last active day on or before `day` (0: something recorded that day), or null if never.
export function awayDays({ entries = [], weights = [], waists = [], activity = [] }, day) {
  let last = '';
  for (const list of [entries, weights, waists, activity]) for (const r of list) if (r.day <= day && r.day > last) last = r.day;
  return last ? diffDays(day, last) : null;
}

/*
  Back after a long time (BAZGASHT.md, phase 9): when `day` has something recorded and the active day before it
  was GONE_DAYS or more earlier, that earlier day (it names the return); else null. Duolingo found those who come
  back after a month are much like newcomers, so the app starts them again: today's weight, then their targets.
*/
export function returnedAfter({ entries = [], weights = [], waists = [], activity = [] }, day) {
  let today = false, prev = '';
  for (const list of [entries, weights, waists, activity]) for (const r of list) {
    if (r.day === day) today = true;
    else if (r.day < day && r.day > prev) prev = r.day;
  }
  return today && prev && diffDays(day, prev) >= GONE_DAYS ? prev : null;
}

export function stateOf(gap) {
  if (gap === null || gap === undefined) return 'new';
  return gap < BACK_DAYS ? 'current' : gap < AWAY_DAYS ? 'lapsed' : gap < GONE_DAYS ? 'away' : 'gone';
}

// A fresh start (Dai, Milkman & Riis 2014): the first day of a Persian month (Nowruz is the first of Farvardin).
export const freshDay = day => jParts(day).d === 1;
export const freshSoon = (day, within = FRESH_REST) => {
  for (let k = 1; k <= within; k++) if (freshDay(addDays(day, k))) return true;
  return false;
};

/*
  The push for tonight to someone `gap` days away, or null. `sent` lists the pushes of this absence
  already sent ([{ kind, day }], kinds 'back3', 'back5', 'last', 'fresh'). Under BACK_DAYS the usual
  reminder goes instead (null here). One push a night at most; after 'last', only fresh starts.
*/
export function lapsePush(gap, sent, day) {
  if (gap === null || gap === undefined || gap < BACK_DAYS) return null;
  const has = k => sent.some(s => s.kind === k);
  const lastSent = sent.reduce((m, s) => (s.day > m ? s.day : m), '');
  const since = lastSent ? diffDays(day, lastSent) : Infinity;
  if (since < 1) return null;
  if (freshDay(day) && since >= FRESH_REST && sent.filter(s => s.kind === 'fresh').length < FRESH_MAX) return 'fresh';
  if (gap >= AWAY_DAYS) return !has('last') && since >= LAST_REST && !freshSoon(day) ? 'last' : null;
  if (gap >= BACK2_DAYS) return !has('back5') && since >= 2 ? 'back5' : null;
  return sent.length ? null : 'back3';
}
