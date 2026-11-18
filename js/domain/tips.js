/*
  «نکته‌ی امروز»: one tip a day from the fixed list (js/data/tips.js, written from TIPS.md by
  tools/tips.mjs). The user decided on 2026-11-18 that the whole family sees the same tip each day,
  and left the rest to Claude:

  - The shared tip comes from the date alone, so every phone works out the same one without a
    server. The tips for everyone go round in a fixed order, one section after another so the same
    subject doesn't come twice in a row. Tips of a season or occasion (Ramadan, Nowruz, Yalda, summer,
    winter) take a few days of their window, spread over it.
  - A member a tip doesn't suit (TIPS.md, «برچسب‌ها»: a possible eating-disorder history sees only
    the «مراقبتی» ones, a teen or a pregnant or underweight member no weight-loss ones…) sees one of
    their own in its place. Those come from the far end of the order, so they don't meet the shared
    ones again soon.
  - Tips only for a group they are in (an illness, sugar-lowering drugs, pregnancy, breastfeeding,
    the teens, 65+, women, maintenance) come to them on Fridays instead of the shared one.

  Pure functions.
*/
import { addDays, diffDays, parse, jParts, fromJalali } from '../lib/dates.js';
import { isRamadan } from './occasions.js';
import { effectiveTargets, phaseOn, ageOn } from './targets.js';

export const EPOCH = '2026-11-18'; // day 0 of the order
const GROUP = ['cond', 'med', 'stage', 'sex', 'phase'];
const FRIDAY = 5;
const mod = (n, m) => ((n % m) + m) % m;

// A tip's «فقط» tags by kind: { cond: ['diabetes'], season: ['ramadan'], … }
const kindCache = new WeakMap();
function kinds(tip) {
  let k = kindCache.get(tip);
  if (!k) {
    k = {};
    for (const t of tip.t) {
      const i = t.indexOf(':');
      if (i > 0) (k[t.slice(0, i)] ||= []).push(t.slice(i + 1));
    }
    kindCache.set(tip, k);
  }
  return k;
}
export const isGroup = tip => GROUP.some(g => kinds(tip)[g]);
const seasonOf = tip => kinds(tip).season || null;

// Who is reading, as the tags need it.
export function tipPerson(profile = {}, targets = {}, { phase = 'loss', age = null } = {}) {
  const stages = [];
  if (profile.pregnancy === 'pregnant') stages.push('pregnant');
  if (targets.nursing || profile.pregnancy === 'breastfeeding') stages.push('nursing');
  if (targets.teen) stages.push('teen');
  if (age >= 65) stages.push('senior');
  return {
    ed: ['yes', 'unsure'].includes(profile.edHistory),
    teen: !!targets.teen,
    hold: !!targets.hold,
    conditions: profile.conditions || [],
    glucoseMeds: !!profile.glucoseMeds,
    stages,
    sex: profile.sex || null,
    phase,
  };
}

// Whether a tip suits them on a day in these seasons. Several «فقط» tags of one kind mean any of
// them (diabetes or prediabetes); tags of different kinds all have to hold (Ramadan and diabetes).
export function fits(tip, who, seasons = []) {
  const t = tip.t;
  if (who.ed && !t.includes('care')) return false;
  if (t.includes('loss') && (who.teen || who.hold)) return false;
  if (t.includes('adult') && who.teen) return false;
  if (t.includes('!kidney') && who.conditions.includes('kidney')) return false;
  const k = kinds(tip);
  if (k.cond && !k.cond.some(c => who.conditions.includes(c))) return false;
  if (k.med && !who.glucoseMeds) return false;
  if (k.stage && !k.stage.some(s => who.stages.includes(s))) return false;
  if (k.sex && !k.sex.includes(who.sex)) return false;
  if (k.phase && !k.phase.includes(who.phase)) return false;
  if (k.season && !k.season.some(s => seasons.some(x => x.id === s))) return false;
  return true;
}

const win = (id, start, length, day) => ({ id, start, length, offset: diffDays(day, start) });

// The seasons and occasions a day falls in, most particular first, with where in its window it is.
export function seasonsOn(day) {
  const out = [];
  if (isRamadan(day)) {
    let start = day, end = day;
    for (let i = 0; i < 31 && isRamadan(addDays(start, -1)); i++) start = addDays(start, -1);
    for (let i = 0; i < 31 && isRamadan(addDays(end, 1)); i++) end = addDays(end, 1);
    out.push(win('ramadan', start, diffDays(end, start) + 1, day));
  }
  const j = jParts(day);
  if (j.m === 1 && j.d <= 13) out.push(win('nowruz', fromJalali(j.y, 1, 1), 13, day));
  if (j.m === 9 && j.d >= 29) out.push(win('yalda', fromJalali(j.y, 9, 29), 2, day));
  if (j.m >= 4 && j.m <= 6) out.push(win('summer', fromJalali(j.y, 4, 1), 93, day));
  if (j.m >= 10) {
    const start = fromJalali(j.y, 10, 1);
    out.push(win('winter', start, diffDays(fromJalali(j.y + 1, 1, 1), start), day));
  }
  return out;
}

// The tips for everyone in the order they come, one section after another.
export function rotation(tips) {
  const bySection = new Map();
  for (const t of tips) if (!isGroup(t) && !seasonOf(t)) (bySection.get(t.c) || bySection.set(t.c, []).get(t.c)).push(t);
  const lists = [...bySection.values()];
  const out = [];
  for (let i = 0; lists.some(l => l[i]); i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}

// The family's tip of the day.
export function sharedTip(tips, day, order = rotation(tips), seasons = seasonsOn(day)) {
  for (const s of seasons) {
    const list = tips.filter(t => !isGroup(t) && seasonOf(t)?.includes(s.id));
    const hit = list.find((_, k) => Math.floor(k * s.length / list.length) === s.offset);
    if (hit) return hit;
  }
  return order[mod(diffDays(day, EPOCH), order.length)];
}

// The member's own group tip for a Friday, or null. A season's group tips (Ramadan and diabetes)
// take the first Fridays of its window; the others are spread over the Fridays of one round of the
// shared order (about ten months), so each comes once a round rather than every few weeks.
function groupTip(tips, who, day, n, order, seasons) {
  for (const s of seasons) {
    const list = tips.filter(t => isGroup(t) && seasonOf(t)?.includes(s.id) && fits(t, who, seasons));
    const k = Math.floor(s.offset / 7);
    if (k < list.length) return list[k];
  }
  const mine = tips.filter(t => isGroup(t) && !seasonOf(t) && fits(t, who, seasons));
  if (!mine.length) return null;
  const weeks = Math.ceil(order.length / 7);
  const week = mod(Math.floor(n / 7), weeks);
  return mine.find((_, k) => Math.floor(k * weeks / mine.length) === week) || null;
}

// The tip this member sees on a day, or null when no tip suits them.
export function tipFor(tips, who, day, order = rotation(tips)) {
  const seasons = seasonsOn(day);
  const n = diffDays(day, EPOCH);
  const group = parse(day).getDay() === FRIDAY && groupTip(tips, who, day, n, order, seasons);
  if (group) return group;
  const shared = sharedTip(tips, day, order, seasons);
  if (fits(shared, who, seasons)) return shared;
  // a season's tip that doesn't suit them: the day's tip from the order, if it does
  const regular = order[mod(n, order.length)];
  if (shared !== regular && fits(regular, who, seasons)) return regular;
  const own = order.filter(t => fits(t, who, seasons));
  if (!own.length) return null;
  // how many days so far the order's tip didn't suit them: their own ones go from the end backwards
  let missed = 0;
  for (let x = 0; x < n; x++) if (!fits(order[mod(x, order.length)], who, seasons)) missed++;
  return own[own.length - 1 - mod(missed, own.length)];
}

// Today's tip for someone, straight from their profile.
export function tipOfDay(tips, profile, day) {
  if (!profile) return null;
  const who = tipPerson(profile, effectiveTargets(profile, day), { phase: phaseOn(profile, day), age: ageOn(profile, day) });
  return tipFor(tips, who, day);
}
