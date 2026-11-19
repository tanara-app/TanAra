// Days are stored as local 'YYYY-MM-DD' (Gregorian) strings; everything shown is Jalali.
// Weeks run Saturday → Friday.

const pad = n => String(n).padStart(2, '0');

export function iso(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parse(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}
/*
  The app's day starts at 5 in the morning, not at midnight (the owner's decision, 2026-11-19): what is
  eaten or logged late at night belongs to the evening before, not to a day that has barely begun (two
  members logged their whole day at 1–3 am and it landed on the next day). On a fasting day the day starts
  at midnight as before, so سحری stays with its own day: app.js tells which days those are (setFastingDay).
*/
export const DAY_START_HOUR = 5;
let fastingDay = () => false;
export function setFastingDay(fn) { fastingDay = fn; }
// The app's day at a moment (a Date): before DAY_START_HOUR still the day before, unless it is a fasting day.
export function dayAt(d) {
  const cal = iso(d);
  if (d.getHours() >= DAY_START_HOUR) return cal;
  return fastingDay(cal) ? cal : addDays(cal, -1);
}
export const today = () => dayAt(new Date());
// After midnight but still the day before (the app's day has not started yet).
export const lateNight = () => today() !== iso(new Date());
export function addDays(day, n) {
  const d = parse(day);
  d.setDate(d.getDate() + n);
  return iso(d);
}
export function diffDays(a, b) {
  return Math.round((parse(a) - parse(b)) / 86400000);
}
export function weekStart(day) {
  const d = parse(day);
  const offset = (d.getDay() + 1) % 7; // Sat → 0
  d.setDate(d.getDate() - offset);
  return iso(d);
}
export function range(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const fmt = (opts) => new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-arabext', opts);
const F = {
  full: fmt({ weekday: 'long', day: 'numeric', month: 'long' }),
  dm: fmt({ day: 'numeric', month: 'long' }),
  d: fmt({ day: 'numeric' }),
  short: fmt({ day: 'numeric', month: 'numeric' }),
  dmy: fmt({ day: 'numeric', month: 'long', year: 'numeric' }),
};
export const faFull = day => F.full.format(parse(day));
export const faDM = day => F.dm.format(parse(day));
export const faShort = day => F.short.format(parse(day));
export const faDMY = day => F.dmy.format(parse(day));

export function relLabel(day) {
  const t = today();
  if (day === t) return 'امروز';
  if (day === addDays(t, -1)) return 'دیروز';
  return faFull(day);
}

export function weekLabel(ws) {
  const we = addDays(ws, 6);
  const sameMonth = F.dm.formatToParts(parse(ws)).find(p => p.type === 'month').value
    === F.dm.formatToParts(parse(we)).find(p => p.type === 'month').value;
  return sameMonth ? `${F.d.format(parse(ws))} تا ${faDM(we)}` : `${faDM(ws)} تا ${faDM(we)}`;
}

export function mealForNow() {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return 'breakfast';
  if (h >= 11 && h < 16) return 'lunch';
  if (h >= 19 || h < 2) return 'dinner';
  return 'snack';
}

// Jalali ↔ stored day. Built on Intl so there's no calendar table to maintain.
export const J_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const JP = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric' });
export function jParts(day) {
  const p = Object.fromEntries(JP.formatToParts(parse(day)).map(x => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day) };
}
// Returns null for dates that don't exist (e.g. 30 Esfand in a non-leap year).
export function fromJalali(y, m, d) {
  const offset = (m <= 6 ? (m - 1) * 31 : 186 + (m - 7) * 30) + d - 1;
  const guess = addDays(iso(new Date(y + 621, 2, 20)), offset);
  for (const k of [0, 1, -1, 2, -2]) {
    const c = addDays(guess, k);
    const j = jParts(c);
    if (j.y === y && j.m === m && j.d === d) return c;
  }
  return null;
}
