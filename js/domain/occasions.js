/*
  Occasions that make eating harder and are coming up soon: the yearly ones of the Iranian
  calendar (شب یلدا، نوروز، رمضان) and the events they saved in «انگیزه». Pure functions;
  the dates come from the browser's Persian and Islamic (Umm al-Qura) calendars.
*/
import { addDays, parse } from '../lib/dates.js';

export const AHEAD = 7; // days before an occasion it is offered

const YEARLY = [
  { id: 'yalda', name: 'شب یلدا', cal: 'persian', m: 9, d: 30, days: 1 },
  { id: 'nowruz', name: 'نوروز', cal: 'persian', m: 1, d: 1, days: 13 },
  { id: 'ramadan', name: 'ماه رمضان', cal: 'islamic-umalqura', m: 9, d: 1, days: 30 },
];

const fmts = {};
function md(day, cal) {
  const f = fmts[cal] || (fmts[cal] = new Intl.DateTimeFormat(`en-u-ca-${cal}-nu-latn`, { month: 'numeric', day: 'numeric' }));
  const o = Object.fromEntries(f.formatToParts(parse(day)).map(p => [p.type, p.value]));
  return { m: Number(o.month), d: Number(o.day) };
}

// [{ key, name, day, inDays, days }] starting within AHEAD days (today included), nearest first.
export function upcoming(day, motivations = [], ahead = AHEAD) {
  const out = [];
  for (let i = 0; i <= ahead; i++) {
    const d = addDays(day, i);
    for (const o of YEARLY) {
      let hit = false;
      try { const x = md(d, o.cal); hit = x.m === o.m && x.d === o.d; } catch { /* calendar not supported */ }
      if (hit) out.push({ key: `${o.id}:${d}`, name: o.name, day: d, inDays: i, days: o.days });
    }
  }
  for (const m of motivations) {
    if (m.kind !== 'event' || !m.day || m.day < day || m.day > addDays(day, ahead)) continue;
    out.push({ key: `event:${m.id}:${m.day}`, name: m.title || 'رویداد', day: m.day, inDays: Math.round((parse(m.day) - parse(day)) / 86400000), days: 1 });
  }
  return out.sort((a, b) => a.inDays - b.inDays);
}
