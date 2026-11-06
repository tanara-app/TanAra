/*
  Observations: what each person's record shows, written down once a day so that later we can
  see where the app falls short for them and add a fix only where it is needed. Nothing here is
  shown to the person and nothing here is a diagnosis: an eating disorder, for one, is diagnosed
  by a clinician (loss of control, distress, how long it has lasted), not by a food log. These
  are patterns, each with the evidence it rests on, so a person can look closer. SIGNALS.md has
  the full list with the references.

  Pure functions. observe() returns [{ kind, data }] for the day (looking at yesterday and
  before, so a day still being logged never counts). Thresholds marked "operational" are this
  app's choice where the literature gives no single number; the others come from the source.
*/
import { addDays, diffDays, parse } from '../lib/dates.js';
import { sortedWeights, rollingAvg, vegServings, VEG_SERVING_G, ACTIVITY_GOAL, activityWeek, weekStart } from './stats.js';
import { floorFor, effectiveTargets, isTeen, ageOn, refWeight, phaseOn, maintenanceKcal, computeTargets } from './targets.js';
import { measuredTdee } from './energy.js';
import { drift } from './drift.js';
import { lossStart, zone, lightOn } from './phase.js';

export const SIGNALS_VERSION = 1; // goes up whenever a rule below changes, so old rows can be told apart

export const SIG = {
  UNDER_DAYS: 3,        // full days below the safety floor, of the last 7
  VLCD: 800,            // below this is a very-low-calorie diet: medical supervision only
  RAPID_PCT: 1,         // % of body weight a week (0.5–1 % is the usual recommended pace)
  RAPID_SKIP: 21,       // first days of losing exempt (water)
  BMI_UNDER: 18.5,      // WHO
  LARGE_X: 1.5,         // a day at 1.5× maintenance or more is "large" (operational)
  LARGE_DAYS: 4,        // … four of them in 28 days, about once a week (the DSM-5 frequency)
  EPISODES: 2,          // large day then restriction / silence, at least this often in 28 days
  NIGHT_SHARE: 0.25,    // night eating syndrome: ≥ 25 % of the day's intake after the evening meal
  NIGHT_DAYS: 4,        // … on four of the last 14 full days (about twice a week)
  PROTEIN_RDA: 0.8,     // g per kg, adults
  PROTEIN_OLDER: 1.0,   // g per kg, 65 and over (PROT-AGE, ESPEN)
  OLDER_AGE: 65,
  PRODUCE: 400 / VEG_SERVING_G, // WHO: at least 400 g of fruit and vegetables a day = 5 portions
  PLATEAU_KG: 0.1,      // kg a week: not losing
  PLATEAU_EXPECT: 0.3,  // … while the log says at least this much should be coming off
  LOG_GAP: 3,           // days in a row with nothing logged
  WEIGH_GAP: 14, WEIGH_GAP_MAINTAIN: 10,
  WEEKEND_KCAL: 300,    // Thursday and Friday above the other days (operational)
  MANUAL_BELOW: 150,    // a hand-set target this far under the worked-out one
};

const r1 = n => Math.round(n * 10) / 10;
const r2 = n => Math.round(n * 100) / 100;
const mean = l => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0);

// kg per day through the weigh-ins, by least squares.
function slope(w) {
  if (w.length < 2) return 0;
  const xs = w.map(x => diffDays(x.day, w[0].day)), ys = w.map(x => Number(x.kg));
  const mx = mean(xs), my = mean(ys);
  let num = 0, den = 0;
  xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
  return den ? num / den : 0;
}

// Servings of fruit (by the food's category) in one entry: weighed ones by weight, the rest one a unit.
const fruitServings = (e, cat) => (cat !== 'fruit' ? 0 : e.unit === 'گرم' ? (Number(e.qty) || 0) / VEG_SERVING_G : Number(e.qty) || 1);

/*
  Each day from `from` to `to` with something logged: { kcal, protein, veg, fruit, meals, list }.
  full: at least two different meals, the rule the rest of the app uses for a day that is
  really logged.
*/
export function dayTotals(entries, foods, from, to) {
  const cat = new Map((foods || []).map(f => [f.id, f.category]));
  const by = new Map();
  for (const e of entries) {
    if (e.day < from || e.day > to) continue;
    const d = by.get(e.day) || { kcal: 0, protein: 0, veg: 0, fruit: 0, meals: new Set(), list: [] };
    d.kcal += Number(e.kcal) || 0;
    d.protein += Number(e.protein) || 0;
    if (e.is_veg) d.veg += vegServings(e);
    d.fruit += fruitServings(e, cat.get(e.food_id));
    d.meals.add(e.meal);
    d.list.push(e);
    by.set(e.day, d);
  }
  for (const d of by.values()) d.full = d.meals.size >= 2;
  return by;
}
const fullOf = by => [...by].filter(([, d]) => d.full);

/* ---------------- safety ---------------- */

// Three or more full days of the last week under the safety floor.
export function underFloor(by, p, day) {
  const week = fullOf(by).filter(([d]) => d >= addDays(day, -7));
  const under = week.filter(([d, x]) => x.kcal < floorFor(p, d));
  if (under.length < SIG.UNDER_DAYS) return null;
  return { days: under.length, of: week.length, avg: Math.round(mean(under.map(([, x]) => x.kcal))), floor: floorFor(p, day), under800: under.filter(([, x]) => x.kcal < SIG.VLCD).length };
}

// Losing faster than 1 % of body weight a week over the last three weeks (or the app's own
// kg limit: 1.5, 1 for a teen), once the first weeks of water are past.
export function rapidPace(weights, p, day) {
  if (phaseOn(p, day) !== 'loss') return null;
  const since = lossStart(p);
  if (!since || diffDays(day, since) < SIG.RAPID_SKIP + 21) return null;
  const w = sortedWeights(weights).filter(x => x.day >= addDays(day, -21) && x.day < day);
  if (w.length < 4 || diffDays(w[w.length - 1].day, w[0].day) < 14) return null;
  const perWeek = -slope(w) * 7, kg = mean(w.map(x => Number(x.kg)));
  const pct = (perWeek / kg) * 100, limit = isTeen(p, day) ? 1 : 1.5;
  return pct > SIG.RAPID_PCT || perWeek > limit ? { perWeek: r2(perWeek), pct: r2(pct), limit } : null;
}

// An adult whose 7-day average is under BMI 18.5. (Adult cut-offs don't fit teens; their BMI
// needs the WHO growth charts, which the app doesn't have, so they are left out.)
export function lowBmi(weights, p, day) {
  const h = Number(p?.heightCm);
  if (!(h > 0) || isTeen(p, day)) return null;
  const avg = rollingAvg(sortedWeights(weights).filter(x => x.day < day), addDays(day, -1));
  if (avg === null) return null;
  const bmi = avg / (h / 100) ** 2;
  return bmi < SIG.BMI_UNDER ? { bmi: r1(bmi), kg: r1(avg), phase: phaseOn(p, day) } : null;
}

/*
  Large days: a full day at LARGE_X × maintenance or more. What makes a binge is the loss of
  control, which a log can't show (see lossOfControl for what the person says), so this only
  counts the size and how often.
  - largeDays: LARGE_DAYS or more in the last 28 days.
  - afterLarge: what came next, in the two days after: a full day under the floor
    (compensatory restriction, as in bulimia's criterion B) or nothing logged at all (the
    "what the hell" lapse after breaking a diet rule). Each, EPISODES or more times.
*/
export function largeDays(by, p, day) {
  const maint = maintenanceKcal(p);
  if (!(maint > 0)) return null;
  const big = fullOf(by).filter(([d, x]) => d >= addDays(day, -28) && x.kcal >= SIG.LARGE_X * maint);
  return big.length >= SIG.LARGE_DAYS ? { count: big.length, days: big.map(([d]) => d), avg: Math.round(mean(big.map(([, x]) => x.kcal))), maint: Math.round(maint) } : null;
}

export function afterLarge(by, p, day) {
  const maint = maintenanceKcal(p);
  if (!(maint > 0)) return { restrict: null, silent: null };
  const big = fullOf(by).filter(([d, x]) => d >= addDays(day, -28) && d <= addDays(day, -3) && x.kcal >= SIG.LARGE_X * maint).map(([d]) => d);
  const restrict = [], silent = [];
  for (const d of big) {
    const next = [addDays(d, 1), addDays(d, 2)].map(n => by.get(n));
    if (next.some((x, i) => x?.full && x.kcal < floorFor(p, addDays(d, i + 1)))) restrict.push(d);
    else if (next.every(x => !x)) silent.push(d);
  }
  return {
    restrict: restrict.length >= SIG.EPISODES ? { count: restrict.length, days: restrict } : null,
    silent: silent.length >= SIG.EPISODES ? { count: silent.length, days: silent } : null,
  };
}

// Night eating (Allison et al. 2010): a big share of the day eaten after the evening meal.
// The log has no clock for eating, so the proxy is snacks logged on the day itself after that
// day's last dinner entry. Days logged afterwards from memory don't count.
export function nightEating(by, day) {
  const late = [];
  const days = fullOf(by).filter(([d]) => d >= addDays(day, -14));
  for (const [d, x] of days) {
    const sameDay = e => e.created_at && localDay(e.created_at) === d;
    const dinner = x.list.filter(e => e.meal === 'dinner' && sameDay(e)).map(e => e.created_at).sort().pop();
    if (!dinner || !(x.kcal > 0)) continue;
    const after = x.list.filter(e => e.meal === 'snack' && sameDay(e) && e.created_at > dinner).reduce((s, e) => s + (Number(e.kcal) || 0), 0);
    if (after / x.kcal >= SIG.NIGHT_SHARE) late.push([d, after / x.kcal]);
  }
  return late.length >= SIG.NIGHT_DAYS ? { days: late.length, of: days.length, share: r2(mean(late.map(l => l[1]))) } : null;
}
function localDay(isoTime) {
  const t = new Date(isoTime);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

/* ---------------- what the person says (the «برگشت به مسیر» check-in) ---------------- */

const checkins = (notes, from, to) => (notes || []).filter(n => n.kind === 'checkin' && n.key.slice(8) >= from && n.key.slice(8) <= to);

// They picked «پرخوری بی‌اختیار»: the loss of control that makes overeating a binge (DSM-5).
export const LOSS_OF_CONTROL = 'پرخوری بی‌اختیار';
export function lossOfControl(notes, day) {
  const list = checkins(notes, addDays(day, -28), day).filter(n => (n.data?.causes || []).includes(LOSS_OF_CONTROL));
  return list.length ? { count: list.length, days: list.map(n => n.key.slice(8)) } : null;
}

// A low mood (1–2 of 5) in a check-in in the last two weeks: low mood and depression go with
// emotional eating and with worse results, and are worth a human look.
export function lowMood(notes, day) {
  const list = checkins(notes, addDays(day, -14), day).filter(n => Number(n.data?.mood) > 0 && Number(n.data.mood) <= 2);
  return list.length ? { count: list.length, mood: Math.min(...list.map(n => Number(n.data.mood))), causes: [...new Set(list.flatMap(n => n.data?.causes || []))] } : null;
}

/* ---------------- what the food is made of ---------------- */

// Protein under the RDA (0.8 g/kg; 1.0 from 65), per kg of the weight at BMI 25 (or less, if
// they weigh less), over the last 14 days' full days.
export function lowProtein(by, weights, p, day) {
  const full = fullOf(by).filter(([d]) => d >= addDays(day, -14));
  if (full.length < 7 || !(Number(p?.heightCm) > 0)) return null;
  const kg = Math.min(refWeight(Number(p.heightCm)), rollingAvg(sortedWeights(weights), addDays(day, -1)) ?? Infinity);
  const perKg = ageOn(p, day) >= SIG.OLDER_AGE ? SIG.PROTEIN_OLDER : SIG.PROTEIN_RDA;
  const avg = mean(full.map(([, x]) => x.protein)), need = perKg * kg;
  return avg < need ? { avg: Math.round(avg), need: Math.round(need), perKg, days: full.length } : null;
}

// Fruit and vegetables under the WHO's 400 g (5 portions) a day.
export function lowProduce(by, day) {
  const full = fullOf(by).filter(([d]) => d >= addDays(day, -14));
  if (full.length < 7) return null;
  const veg = mean(full.map(([, x]) => x.veg)), fruit = mean(full.map(([, x]) => x.fruit));
  return veg + fruit < SIG.PRODUCE ? { servings: r1(veg + fruit), veg: r1(veg), fruit: r1(fruit), days: full.length } : null;
}

/* ---------------- the record and the scale ---------------- */

/*
  Plateau: losing, past the first six weeks, the scale flat for four weeks while the log says
  weight should be coming off (energy balance at 7700 kcal/kg against the formula's figure).
  Most often food not logged (people under-report by a third or more), sometimes the body
  adapting. Not used for the targets: only to see it.
*/
export function plateau(by, weights, p, day) {
  if (phaseOn(p, day) !== 'loss') return null;
  const since = lossStart(p);
  if (!since || diffDays(day, since) < 42) return null;
  const w = sortedWeights(weights).filter(x => x.day >= addDays(day, -28) && x.day < day);
  if (w.length < 6 || diffDays(w[w.length - 1].day, w[0].day) < 21) return null;
  const full = fullOf(by).filter(([d]) => d >= addDays(day, -28));
  if (full.length < 14) return null;
  const kg = mean(w.map(x => Number(x.kg)));
  const formula = computeTargets({ ...p, weightKg: kg, measuredTdee: null }).formulaTdee;
  const intake = mean(full.map(([, x]) => x.kcal));
  const expect = ((formula - intake) * 7) / 7700, perWeek = -slope(w) * 7;
  return expect >= SIG.PLATEAU_EXPECT && perWeek < SIG.PLATEAU_KG ? { perWeek: r2(perWeek), expect: r2(expect), intake: Math.round(intake), formula: Math.round(formula) } : null;
}

// The measured energy use is more than 25 % away from the formula (energy.js then holds it at
// the edge): the log and the scale don't agree.
export function energyMismatch(entries, weights, p, day) {
  const formula = computeTargets({ ...p, weightKg: rollingAvg(sortedWeights(weights), addDays(day, -1)) ?? Number(p?.targets?.baseWeight), measuredTdee: null }).formulaTdee;
  if (!(formula > 0)) return null;
  const m = measuredTdee(entries, weights, { day, startDate: p.startDate, formula });
  return m.ready && m.clamped ? { intake: m.intake, perWeek: r2(m.perWeek), formula: Math.round(formula), held: m.tdee } : null;
}

// Nothing logged LOG_GAP days in a row up to yesterday (after having logged; not under light logging).
export function logGap(entries, weights, p, day) {
  if (lightOn(p, sortedWeights(weights), day)) return null;
  const days = new Set(entries.map(e => e.day));
  let n = 0;
  while (n < 60 && !days.has(addDays(day, -1 - n))) n++;
  return n >= SIG.LOG_GAP && entries.some(e => e.day < addDays(day, -n)) ? { days: n } : null;
}

// No weigh-in for two weeks (ten days in maintenance): stopping weighing is how regain usually starts.
export function weighGap(weights, p, day) {
  const last = sortedWeights(weights).filter(w => w.day < day).pop();
  if (!last) return null;
  const n = diffDays(day, last.day), limit = phaseOn(p, day) === 'maintain' ? SIG.WEIGH_GAP_MAINTAIN : SIG.WEIGH_GAP;
  return n >= limit ? { days: n } : null;
}

// Thursday and Friday (the Iranian weekend) well above the other days, over four weeks.
export function weekendGap(by, day) {
  const full = fullOf(by).filter(([d]) => d >= addDays(day, -28));
  const wk = full.filter(([d]) => [4, 5].includes(parse(d).getDay())).map(([, x]) => x.kcal);
  const other = full.filter(([d]) => ![4, 5].includes(parse(d).getDay())).map(([, x]) => x.kcal);
  if (wk.length < 3 || other.length < 6) return null;
  const diff = mean(wk) - mean(other);
  return diff >= SIG.WEEKEND_KCAL ? { weekend: Math.round(mean(wk)), other: Math.round(mean(other)), diff: Math.round(diff) } : null;
}

// Under the activity goal (WHO 150 min a week; 250 in maintenance) over the last four full
// weeks, when they log activity at all.
export function lowActivity(activity, p, day) {
  const end = weekStart(day), weeks = [1, 2, 3, 4].map(k => addDays(end, -7 * k));
  if (!(activity || []).some(a => a.day >= weeks[3] && a.day < end)) return null;
  const avg = mean(weeks.map(ws => activityWeek(activity, ws)));
  const goal = ACTIVITY_GOAL[phaseOn(p, day)] ?? 150;
  return avg < goal ? { avg: Math.round(avg), goal } : null;
}

// Maintenance: the 7-day average out of its band (phase.js).
export function maintZone(weights, p, day) {
  const z = zone(p, sortedWeights(weights).filter(x => x.day < day), addDays(day, -1));
  return z && z.zone !== 'green' ? { zone: z.zone, gain: r1(z.gain) } : null;
}

/* ---------------- how the app's own numbers fit them ---------------- */

// The target sits on the safety floor while losing: the formula's deficit went below it, so
// they lose slower than the app promises (often small, older or not very active people).
export function onFloor(p, day) {
  const t = effectiveTargets(p, day);
  return t.phase === 'loss' && !t.manual && t.kcal <= t.floor ? { kcal: t.kcal, floor: t.floor, worked: p.targets?.kcal ?? null } : null;
}

// They set a calorie target by hand well under the worked-out one.
export function manualLow(p) {
  const m = Number(p?.targets?.manualKcal), k = Number(p?.targets?.kcal);
  return m > 0 && k > 0 && m < k - SIG.MANUAL_BELOW ? { manual: m, worked: k } : null;
}

/* ---------------- all of them ---------------- */

/*
  { p, entries, weights, waists, activity, notes, foods } → [{ kind, data }] for `day`.
  `kcalOn` / `adherence` are passed through to drift() (see checkin.js).
*/
export function observe({ p, entries = [], weights = [], waists = [], activity = [], notes = [], foods = [], adherence = null }, day) {
  if (!p?.onboarded) return [];
  const by = dayTotals(entries, foods, addDays(day, -42), addDays(day, -1));
  const after = afterLarge(by, p, day);
  const phase = phaseOn(p, day);
  const d = drift({
    entries, weights, waists, phase, light: lightOn(p, sortedWeights(weights), day),
    kcalOn: x => effectiveTargets(p, x)?.kcal, adherence,
  }, day);
  const found = {
    under_floor: underFloor(by, p, day),
    rapid_loss: rapidPace(weights, p, day),
    low_bmi: lowBmi(weights, p, day),
    large_days: largeDays(by, p, day),
    large_then_restrict: after.restrict,
    silent_after_large: after.silent,
    night_eating: nightEating(by, day),
    loss_of_control: lossOfControl(notes, day),
    low_mood: lowMood(notes, day),
    low_protein: lowProtein(by, weights, p, day),
    low_produce: lowProduce(by, day),
    plateau: plateau(by, weights, p, day),
    energy_mismatch: energyMismatch(entries, weights, p, day),
    log_gap: logGap(entries, weights, p, day),
    weigh_gap: weighGap(weights, p, day),
    weekend_gap: weekendGap(by, day),
    low_activity: lowActivity(activity, p, day),
    maint_zone: maintZone(weights, p, day),
    drift: d,
    on_floor: onFloor(p, day),
    manual_low: manualLow(p),
  };
  return Object.entries(found).filter(([, v]) => v).map(([kind, data]) => ({ kind, data }));
}
