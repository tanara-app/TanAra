/*
  What the body really uses in a day, measured instead of guessed. Pure functions.

  The formula in targets.js (Mifflin-St Jeor × an activity factor) can be a few hundred
  calories off for one person. Once there are a few weeks of data the answer is in the log:
  energy used = energy eaten − energy that came out of (or went into) the body's stores, and
  the stores show up as the weight trend (about 7700 kcal per kg).

  Only fully logged days count for the eating side (what they said about the day, else at least
  two different meals: fullDay in stats.js, the rule the under-eating check uses too), and the first week of use is skipped: the early drop is
  mostly water and would make the body look hungrier than it is. Four weeks are looked at, or
  six for someone weighing once a week (the reminder's default): the wider span steadies the
  trend as much as more weigh-ins would, so nobody is asked to step on the scale more often.
  Food counts up to yesterday (today isn't over), but weigh-ins count up to today: a weigh-in
  the card asked for must count the moment it is saved (2026-11-23: it didn't, and the card kept
  asking for «one more»). Six weeks need five weigh-ins, not six: people weighing «once a week»
  weigh every 7 to 9 days, and with six the card went back to asking each time the oldest one
  slid out of the window.
  A steady habit of logging a
  little less than was eaten moves the result by the same amount, and the target with it, so
  the target stays right in the person's own way of logging.

  The science, checked on 2026-11-23 (research/energy-review.md has the sources and the numbers):
  - A kg gained or lost is not always 7700 kcal. It is part fat (9440 kcal/kg) and part lean
    tissue (1816 kcal/kg), and the lean part is larger the less fat the body has (Forbes; Hall,
    Int J Obes 2008). So the energy of a kg comes from the person's body fat, estimated from BMI,
    age and sex (Deurenberg 1991): about 8000 kcal for someone with a lot of fat, 6000 for a lean
    one. 7700 only when sex, age or height is unknown.
  - The trend is a straight line through the weigh-ins (least squares), and how far it can be
    trusted is worked out too: from how much the weigh-ins scatter around the line, never less
    than the day-to-day swing of a body's weight (about 0.5% of it, Khosla & Billewicz 1964).
    The food side adds its own uncertainty (the spread of the logged days).
  - The measurement is then combined with the formula as two estimates of the same thing, each
    weighted by how sure it is (precision weighting): the formula is taken as ±15% (Mifflin-St Jeor
    is within 10% of measured resting energy for 70–80% of people, Frankenfield 2005; the
    activity factor and the share of food that goes unlogged add to that; 15% did best on the
    simulated people of tools/energy-eval.mjs, 12% and 20% worse). A result more than 30% from the
    formula is held at 30%: that far is more likely a gap in logging than a metabolism. With little or noisy data the result stays nearer the formula;
    with good data it is almost all measurement. `range` is the 95% half-width of the result.
*/
import { addDays, diffDays } from '../lib/dates.js';
import { baseMeal } from './meals.js';
import { sortedWeights, fullDay } from './stats.js';
import { computeTargets, ageOn } from './targets.js';

export const ENERGY = {
  WINDOW: 28,      // days looked at, ending yesterday
  LONG_WINDOW: 42, // … or these, when the 28 hold too few weigh-ins: six weeks of weighing once a week is enough
  SKIP_START: 7,   // days after the start that never count
  MIN_SPAN: 21,    // the window must be at least this long
  MIN_DAYS: 14,    // fully logged days needed in it
  MIN_WEIGHS: 6,   // weigh-ins needed in it …
  MIN_WEIGHS_LONG: 5, // … or in the six weeks
  MIN_WEIGH_SPAN: 14, // … spread over at least this many days
  KCAL_PER_KG: 7700,  // when the body can't be estimated
  KCAL_FAT: 9440,     // per kg of fat mass (39.5 MJ, Hall 2008)
  KCAL_LEAN: 1816,    // per kg of lean mass (7.6 MJ, Hall 2008)
  FORBES: 10.4,       // kg: the share of lean in a change is FORBES / (FORBES + fat mass)
  WEIGHT_NOISE: 0.005, // the day-to-day swing of body weight, as a share of it (one SD)
  KCAL_PER_KG_SD: 0.07, // how far off that energy can be for one person (one SD)
  FORMULA_SD: 0.15,   // how far off the formula can be, as a share of it (one SD)
  MAX_OFF: 0.3,    // further than this from the formula is more likely a logging gap than a metabolism
};

// Body fat in % from BMI, age and sex (Deurenberg 1991; the children's equation under 16).
export function bodyFatPct({ sex, age, heightCm, weightKg }) {
  const h = Number(heightCm) / 100, kg = Number(weightKg), a = Number(age);
  if (!(h > 0 && kg > 0 && a > 0) || (sex !== 'male' && sex !== 'female')) return null;
  const bmi = kg / (h * h), male = sex === 'male' ? 1 : 0;
  const pct = a >= 16 ? 1.2 * bmi + 0.23 * a - 10.8 * male - 5.4 : 1.51 * bmi - 0.7 * a - 3.6 * male + 1.4;
  return Math.min(60, Math.max(5, pct));
}

// The energy in one kg of weight gained or lost, for this body (see above).
export function kcalPerKg(body) {
  const pct = body ? bodyFatPct(body) : null;
  if (pct == null) return ENERGY.KCAL_PER_KG;
  const fat = Number(body.weightKg) * pct / 100;
  const lean = ENERGY.FORBES / (ENERGY.FORBES + fat);
  return (1 - lean) * ENERGY.KCAL_FAT + lean * ENERGY.KCAL_LEAN;
}

// kg per day through the weigh-ins, by least squares, and its standard error.
function trend(w) {
  const xs = w.map(x => diffDays(x.day, w[0].day));
  const ys = w.map(x => Number(x.kg));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
  const b = den ? num / den : 0;
  const ssr = xs.reduce((s, x, i) => s + (ys[i] - (my + b * (x - mx))) ** 2, 0);
  const sd = Math.max(n > 2 ? Math.sqrt(ssr / (n - 2)) : 0, ENERGY.WEIGHT_NOISE * my);
  return { perDay: b, se: den ? sd / Math.sqrt(den) : Infinity, mean: my };
}

/*
  { ready: true, tdee, range, raw, intake, perWeek, kcalPerKg, days, weighs, from, to, clamped } or,
  while there isn't enough data, { ready: false, days, weighs, needDays, needWeighs, needSpan }.
  `formula` (the formula's figure, optional) is combined with the measurement and bounds it;
  `body` ({ sex, age, heightCm }) gives the energy in a kg of this person's weight change.
  `raw` is the measurement alone; `tdee` the result, `range` its 95% half-width (kcal).
*/
export function measuredTdee(entries, weights, { day, startDate, formula, marks, body } = {}) {
  const E = ENERGY;
  const to = addDays(day, -1); // the last day of food; weigh-ins go up to `day` itself
  const since = n => {
    const d = addDays(day, -n), first = startDate ? addDays(startDate, E.SKIP_START) : d;
    return first > d ? first : d;
  };
  const weighed = from => sortedWeights(weights).filter(x => x.day >= from && x.day <= day);
  const short = weighed(since(E.WINDOW)).length >= E.MIN_WEIGHS;
  const from = since(short ? E.WINDOW : E.LONG_WINDOW);
  const minWeighs = short ? E.MIN_WEIGHS : E.MIN_WEIGHS_LONG;

  const byDay = new Map();
  for (const e of entries) {
    if (e.day < from || e.day > to) continue;
    const d = byDay.get(e.day) || { day: e.day, kcal: 0, meals: new Set() };
    d.kcal += Number(e.kcal) || 0;
    d.meals.add(baseMeal(e.meal));
    byDay.set(e.day, d);
  }
  const full = [...byDay.values()].filter(d => fullDay(d.day, d.meals.size, marks));
  const w = weighed(from);
  const wSpan = w.length > 1 ? diffDays(w[w.length - 1].day, w[0].day) : 0;
  const span = diffDays(to, from) + 1;

  const needDays = Math.max(0, E.MIN_DAYS - full.length);
  const needWeighs = Math.max(0, minWeighs - w.length);
  const needSpan = span < E.MIN_SPAN || wSpan < E.MIN_WEIGH_SPAN;
  if (needDays || needWeighs || needSpan) return { ready: false, days: full.length, weighs: w.length, minWeighs, needDays, needWeighs, needSpan, from, to };

  // the food side: the mean of the fully logged days, and its error (fewer logged days of the window, more error)
  const n = full.length;
  const intake = full.reduce((s, d) => s + d.kcal, 0) / n;
  const sdDay = n > 1 ? Math.sqrt(full.reduce((s, d) => s + (d.kcal - intake) ** 2, 0) / (n - 1)) : 0;
  const seIntake = sdDay / Math.sqrt(n) * Math.sqrt(Math.max(0, 1 - n / span));
  // the stores side: the weight trend × the energy in a kg of this body
  const tr = trend(w);
  const perKg = kcalPerKg(body ? { ...body, weightKg: tr.mean } : null);
  let raw = intake - tr.perDay * perKg;
  const seRaw = Math.sqrt(seIntake ** 2 + (tr.se * perKg) ** 2 + (tr.perDay * perKg * E.KCAL_PER_KG_SD) ** 2);

  let tdee = raw, se = seRaw, clamped = false;
  const f = Number(formula);
  if (f > 0) {
    const lo = f * (1 - E.MAX_OFF), hi = f * (1 + E.MAX_OFF);
    if (raw < lo || raw > hi) { raw = Math.min(hi, Math.max(lo, raw)); clamped = true; }
    const vf = (E.FORMULA_SD * f) ** 2, vm = seRaw ** 2;
    tdee = (raw * vf + f * vm) / (vf + vm);
    se = Math.sqrt(vf * vm / (vf + vm));
  } else tdee = raw;
  const r50 = x => Math.round(x / 50) * 50;
  return {
    ready: true, tdee: r50(tdee), range: Math.max(50, r50(1.96 * se)), raw: r50(raw), intake: Math.round(intake),
    perWeek: tr.perDay * 7, kcalPerKg: Math.round(perKg), days: n, weighs: w.length, from, to, clamped,
  };
}

// Targets for a profile at a weight: from the measured figure when there is one, else the formula.
// Returns { t (as computeTargets), m (as measuredTdee) }.
export function nextTargets(p, entries, weights, weightKg, day, marks) {
  const f = computeTargets({ ...p, weightKg });
  const body = { sex: p.sex, age: ageOn(p, day), heightCm: p.heightCm };
  const m = measuredTdee(entries, weights, { day, startDate: p.startDate, formula: f.tdee, marks, body });
  return { t: m.ready ? computeTargets({ ...p, weightKg, measuredTdee: m.tdee }) : f, m };
}
