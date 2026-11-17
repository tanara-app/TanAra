/*
  «آزمایش خون» (LABS.md): the tests the app knows, and the checks that let a member trust a lab
  sheet that Hooshvareh read from a PDF without going over every number themselves.

  A sheet is read twice, independently (two calls with different instructions, the `lab` mode of
  the Edge Function). What both reads agree on, and what passes the checks below, is taken as is;
  only the rest is shown to the member, with what is wrong and the candidate values:
    - the two reads disagree (a different number, unit or previous result);
    - a number is impossible for that test, or its unit is unknown and no unit makes it possible;
    - numbers that are tied by arithmetic do not add up (cholesterol = LDL + HDL + TG/5; VLDL = TG/5;
      MCHC = Hb / Hct; MCV = Hct / RBC; MCH = Hb / RBC; the white-cell percentages add up to 100);
    - the same test twice with different numbers.
  Values are kept in one unit per test (the one Iranian labs use most), converted from the sheet's.

  For the tests where clinical guidelines set the healthy range (sugar, lipids, uric acid, vitamin D,
  eGFR), the app uses that range and keeps the lab's only for reference: some labs print HDL 30 as
  «normal (30–70)», while under 40 is low for a man (decided 2026-11-17). Other tests use the lab's
  own range, or a usual one when the sheet prints none.

  Each saved sheet is an ai_note `lab:<id>` (kind `lab`): { day, lab, person, file, prevDay, rows }.
*/

export const GROUPS = [
  ['sugar', 'قند'], ['lipids', 'چربی خون'], ['liver', 'کبد'], ['kidney', 'کلیه'],
  ['vit', 'ویتامین و املاح'], ['thyroid', 'تیروئید'], ['blood', 'شمارش خون'], ['urine', 'ادرار'], ['other', 'بقیه'],
];

const LIPID = { 'mg/dl': 1, 'mmol/l': 38.67 };
const ENZ = { 'u/l': 1 };
const PCT = { '%': 1 };
const E3 = { 'e3/ul': 1, '/ul': 0.001 };
const MMOL = { 'mmol/l': 1 };
const sexed = (m, f) => sex => (sex === 'female' ? f : m);

/*
  key: { fa, g: group, u: unit shown, conv: printed unit → factor to `u` (or a function),
         ok: [min, max] a number outside is impossible, rule: guideline range [lo, hi] (or by sex),
         def: usual range when the sheet prints none, main: shown as a tile even when in range,
         dec: decimals shown, text: a qualitative result (negative / trace / +) }
*/
export const TESTS = {
  fbs: { fa: 'قند ناشتا', g: 'sugar', u: 'mg/dL', conv: { 'mg/dl': 1, 'mmol/l': 18.016 }, ok: [20, 800], rule: [70, 99], main: true },
  rbs: { fa: 'قند غیرناشتا', g: 'sugar', u: 'mg/dL', conv: { 'mg/dl': 1, 'mmol/l': 18.016 }, ok: [20, 1000], rule: [null, 139] },
  pp2: { fa: 'قند ۲ ساعت بعد از غذا', g: 'sugar', u: 'mg/dL', conv: { 'mg/dl': 1, 'mmol/l': 18.016 }, ok: [20, 1000], rule: [null, 139] },
  hba1c: { fa: 'HbA1c', g: 'sugar', u: '%', conv: { '%': 1, 'mmol/mol': v => v / 10.929 + 2.15 }, ok: [3, 20], rule: [null, 5.6], main: true, dec: 1 },
  chol: { fa: 'کلسترول کل', g: 'lipids', u: 'mg/dL', conv: LIPID, ok: [50, 1000], rule: [null, 199], main: true },
  tg: { fa: 'تری‌گلیسرید', g: 'lipids', u: 'mg/dL', conv: { 'mg/dl': 1, 'mmol/l': 88.57 }, ok: [10, 10000], rule: [null, 149], main: true },
  hdl: { fa: 'HDL', g: 'lipids', u: 'mg/dL', conv: LIPID, ok: [5, 200], rule: sexed([40, null], [50, null]), main: true },
  ldl: { fa: 'LDL', g: 'lipids', u: 'mg/dL', conv: LIPID, ok: [5, 600], rule: [null, 129], main: true },
  vldl: { fa: 'VLDL', g: 'lipids', u: 'mg/dL', conv: LIPID, ok: [1, 500], rule: [null, 30], dec: 1 },
  alt: { fa: 'ALT', g: 'liver', u: 'U/L', conv: ENZ, ok: [1, 5000], def: [null, 40], main: true },
  ast: { fa: 'AST', g: 'liver', u: 'U/L', conv: ENZ, ok: [1, 5000], def: [null, 40], main: true },
  alp: { fa: 'ALP', g: 'liver', u: 'U/L', conv: ENZ, ok: [5, 3000], def: [40, 130] },
  ggt: { fa: 'GGT', g: 'liver', u: 'U/L', conv: ENZ, ok: [1, 3000], def: [null, 60] },
  bili: { fa: 'بیلی‌روبین', g: 'liver', u: 'mg/dL', conv: { 'mg/dl': 1, 'umol/l': 1 / 17.1 }, ok: [0, 40], def: [0.2, 1.2], dec: 1 },
  cr: { fa: 'کراتینین', g: 'kidney', u: 'mg/dL', conv: { 'mg/dl': 1, 'umol/l': 1 / 88.4 }, ok: [0.1, 20], def: sexed([0.7, 1.3], [0.5, 1.1]), main: true, dec: 2 },
  urea: { fa: 'اوره', g: 'kidney', u: 'mg/dL', conv: { 'mg/dl': 1, 'mmol/l': 6.006 }, ok: [2, 400], def: [15, 45] },
  bun: { fa: 'BUN', g: 'kidney', u: 'mg/dL', conv: { 'mg/dl': 1, 'mmol/l': 2.801 }, ok: [1, 200], def: [7, 20] },
  uric: { fa: 'اسید اوریک', g: 'kidney', u: 'mg/dL', conv: { 'mg/dl': 1, 'umol/l': 1 / 59.48, 'mmol/l': 16.81 }, ok: [0.5, 20], rule: sexed([null, 7], [null, 6]), main: true, dec: 1 },
  egfr: { fa: 'eGFR', g: 'kidney', u: 'mL/min', conv: { 'ml/min': 1 }, ok: [2, 200], rule: [60, null] },
  vitd: { fa: 'ویتامین D', g: 'vit', u: 'ng/mL', conv: { 'ng/ml': 1, 'nmol/l': 1 / 2.496 }, ok: [2, 250], rule: [30, 100], main: true, dec: 1 },
  b12: { fa: 'ویتامین B12', g: 'vit', u: 'pg/mL', conv: { 'pg/ml': 1, 'pmol/l': 1.355 }, ok: [50, 5000], def: [200, 900], main: true },
  ferritin: { fa: 'فریتین', g: 'vit', u: 'ng/mL', conv: { 'ng/ml': 1, 'pmol/l': 1 / 2.247 }, ok: [1, 10000], def: sexed([30, 400], [15, 150]), main: true },
  iron: { fa: 'آهن', g: 'vit', u: 'µg/dL', conv: { 'ug/dl': 1, 'umol/l': 5.585 }, ok: [5, 500], def: [60, 170] },
  ca: { fa: 'کلسیم', g: 'vit', u: 'mg/dL', conv: { 'mg/dl': 1, 'mmol/l': 4.008 }, ok: [4, 16], def: [8.5, 10.5], dec: 1 },
  na: { fa: 'سدیم', g: 'vit', u: 'mmol/L', conv: MMOL, ok: [100, 180], def: [135, 145] },
  k: { fa: 'پتاسیم', g: 'vit', u: 'mmol/L', conv: MMOL, ok: [1.5, 9], def: [3.5, 5.1], dec: 1 },
  cl: { fa: 'کلر', g: 'vit', u: 'mmol/L', conv: MMOL, ok: [70, 140], def: [98, 107] },
  mg: { fa: 'منیزیم', g: 'vit', u: 'mg/dL', conv: { 'mg/dl': 1, 'mmol/l': 2.431 }, ok: [0.5, 6], def: [1.7, 2.4], dec: 1 },
  phos: { fa: 'فسفر', g: 'vit', u: 'mg/dL', conv: { 'mg/dl': 1, 'mmol/l': 3.097 }, ok: [0.5, 15], def: [2.5, 4.5], dec: 1 },
  tsh: { fa: 'TSH', g: 'thyroid', u: 'mIU/L', conv: { 'miu/l': 1 }, ok: [0.001, 200], def: [0.4, 4.5], main: true, dec: 2 },
  ft4: { fa: 'T4 آزاد', g: 'thyroid', u: 'ng/dL', conv: { 'ng/dl': 1, 'pmol/l': 1 / 12.87 }, ok: [0.1, 10], def: [0.8, 1.8], dec: 2 },
  t4: { fa: 'T4', g: 'thyroid', u: 'µg/dL', conv: { 'ug/dl': 1, 'nmol/l': 1 / 12.87 }, ok: [0.5, 30], def: [4.5, 12], dec: 1 },
  t3: { fa: 'T3', g: 'thyroid', u: 'ng/mL', conv: { 'ng/ml': 1, 'ng/dl': 0.01, 'nmol/l': 0.651 }, ok: [0.1, 10], def: [0.8, 2], dec: 2 },
  hgb: { fa: 'هموگلوبین', g: 'blood', u: 'g/dL', conv: { 'g/dl': 1, 'g/l': 0.1, 'mmol/l': 1.611 }, ok: [3, 25], def: sexed([13.5, 17.5], [12, 15.5]), main: true, dec: 1 },
  wbc: { fa: 'گلبول سفید', g: 'blood', u: '×۱۰۰۰/µL', conv: E3, ok: [0.3, 200], def: [4, 11], main: true, dec: 2 },
  plt: { fa: 'پلاکت', g: 'blood', u: '×۱۰۰۰/µL', conv: E3, ok: [5, 2000], def: [150, 450], main: true },
  rbc: { fa: 'گلبول قرمز', g: 'blood', u: 'میلیون/µL', conv: { 'e6/ul': 1 }, ok: [1, 9], def: sexed([4.5, 5.9], [4, 5.2]), dec: 2 },
  hct: { fa: 'هماتوکریت', g: 'blood', u: '%', conv: { '%': 1, 'l/l': 100 }, ok: [10, 70], def: sexed([40, 52], [36, 46]), dec: 1 },
  mcv: { fa: 'MCV', g: 'blood', u: 'fL', conv: { fl: 1 }, ok: [50, 130], def: [80, 100], dec: 1 },
  mch: { fa: 'MCH', g: 'blood', u: 'pg', conv: { pg: 1 }, ok: [10, 50], def: [27, 33], dec: 1 },
  mchc: { fa: 'MCHC', g: 'blood', u: 'g/dL', conv: { 'g/dl': 1, 'g/l': 0.1, '%': 1 }, ok: [20, 45], def: [32, 36], dec: 1 },
  rdw: { fa: 'RDW', g: 'blood', u: '%', conv: PCT, ok: [8, 40], def: [11.5, 14.5], dec: 1 },
  mpv: { fa: 'MPV', g: 'blood', u: 'fL', conv: { fl: 1 }, ok: [5, 15], def: [7.5, 11.5], dec: 1 },
  neut: { fa: 'نوتروفیل', g: 'blood', u: '%', conv: PCT, ok: [0, 100], def: [40, 70], dec: 1 },
  lymph: { fa: 'لنفوسیت', g: 'blood', u: '%', conv: PCT, ok: [0, 100], def: [20, 40], dec: 1 },
  mono: { fa: 'مونوسیت', g: 'blood', u: '%', conv: PCT, ok: [0, 100], def: [2, 8], dec: 1 },
  eos: { fa: 'ائوزینوفیل', g: 'blood', u: '%', conv: PCT, ok: [0, 100], def: [0, 5], dec: 1 },
  baso: { fa: 'بازوفیل', g: 'blood', u: '%', conv: PCT, ok: [0, 100], def: [0, 1], dec: 1 },
  esr: { fa: 'ESR', g: 'blood', u: 'mm/h', conv: { 'mm/h': 1 }, ok: [0, 160], def: sexed([0, 15], [0, 20]) },
  crp: { fa: 'CRP', g: 'blood', u: 'mg/L', conv: { 'mg/l': 1, 'mg/dl': 10 }, ok: [0, 500], def: [null, 5], dec: 1 },
  u_glucose: { fa: 'قند ادرار', g: 'urine', text: true, main: true },
  u_protein: { fa: 'پروتئین ادرار', g: 'urine', text: true, main: true },
  u_ketone: { fa: 'کتون ادرار', g: 'urine', text: true },
};
export const KEYS = Object.keys(TESTS);

const DIGITS = { '۰': 0, '۱': 1, '۲': 2, '۳': 3, '۴': 4, '۵': 5, '۶': 6, '۷': 7, '۸': 8, '۹': 9, '٠': 0, '١': 1, '٢': 2, '٣': 3, '٤': 4, '٥': 5, '٦': 6, '٧': 7, '٨': 8, '٩': 9 };
const latin = s => String(s ?? '').replace(/[۰-۹٠-٩]/g, d => DIGITS[d]).replace(/٫/g, '.').replace(/٬/g, ',');

// A printed result: { n: number, q: '<' | '>' | '' } or { t: text } (or null when empty).
export function parseValue(raw) {
  let s = latin(raw).trim().replace(/\s+/g, ' ');
  if (!s || s === '-' || s === '—') return null;
  const m = s.match(/^(<=?|>=?|≤|≥)\s*(.*)$/);
  const q = m ? (m[1][0] === '<' || m[1] === '≤' ? '<' : '>') : '';
  if (m) s = m[2];
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^\d+,\d+$/.test(s)) s = s.replace(',', '.');
  if (/^-?\d+(\.\d+)?$/.test(s) || /^-?\.\d+$/.test(s)) return { n: Number(s), q };
  return { t: qualText(s) };
}

// Qualitative results in one spelling: neg, trace, +, ++, +++, ++++, pos, or the text as printed.
export function qualText(s) {
  const x = latin(s).trim().toLowerCase().replace(/\s+/g, ' ');
  if (/^(neg|negative|nil|absent|not detected|none|normal|منفی|ندارد|نرمال|طبیعی)\.?$/.test(x)) return 'neg';
  if (/^(trace|tr|traces|کم|ناچیز|اثر)$/.test(x)) return 'trace';
  const plus = x.replace(/\s/g, '').match(/^(\+{1,4})$/) || x.match(/^([1-4])\s*\+$/);
  if (plus) return '+'.repeat(/^\d/.test(plus[1]) ? Number(plus[1]) : plus[1].length);
  if (/^(pos|positive|present|detected|مثبت|دارد)$/.test(x)) return 'pos';
  return String(s).trim();
}
export const TEXT_FA = { neg: 'منفی', trace: 'ناچیز', pos: 'مثبت' };

// The sheet's unit in one spelling, so it can be looked up in a test's `conv`.
export function unitKey(raw) {
  let u = latin(raw).toLowerCase().replace(/[µμ]/g, 'u').replace(/\\/g, '/').replace(/[×*]/g, 'x').replace(/\s+/g, '').replace(/\.$/, '');
  if (!u) return '';
  u = u.replace(/^gm\//, 'g/').replace(/^mgs?\//, 'mg/').replace(/^mg%$/, 'mg/dl');
  if (/^(iu|u)\/l$/.test(u)) return 'u/l';
  // TSH: µIU/mL is the same number as mIU/L
  if (/^(uiu|uu)\/ml$/.test(u) || /^(miu|mu)\/l$/.test(u)) return 'miu/l';
  if (/^(meq|mmol)\/l$/.test(u)) return 'mmol/l';
  if (/^(umol|micromol)\/l$/.test(u)) return 'umol/l';
  if (/^(ug|mcg)\/l$/.test(u)) return 'ng/ml';
  if (/^(ng)\/l$/.test(u)) return 'pg/ml';
  if (/^(ug|mcg)\/dl$/.test(u)) return 'ug/dl';
  if (/^(x?10\^?\(?3\)?|10e3|k|thou|thousand)\/(u|ul|cmm|mm3|cumm)/.test(u) || /^x?10\^?\(?9\)?\/l/.test(u)) return 'e3/ul';
  if (/^(x?10\^?\(?6\)?|10e6|mil|million|m)\/(u|ul|cmm|mm3|cumm)/.test(u) || /^x?10\^?\(?12\)?\/l/.test(u)) return 'e6/ul';
  if (/^(\/?(cmm|cumm|ul|mm3)|cells\/(ul|cmm|mm3))$/.test(u)) return '/ul';
  if (/^(fl|femtoliters?|cumicrons?|cu\.?microns?|um3)$/.test(u)) return 'fl';
  if (/^(pg|picograms?)$/.test(u)) return 'pg';
  if (/^mm\/(h|hr|hour|1sthr|1sthour)/.test(u)) return 'mm/h';
  if (/^ml\/min/.test(u)) return 'ml/min';
  return u;
}

const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const conv = (f, n) => (typeof f === 'function' ? f(n) : n * f);
const inOk = (def, v) => v >= def.ok[0] && v <= def.ok[1];

/*
  A printed number and unit in the test's own unit: { v, how } — how is 'unit' (from the sheet's
  unit), 'same' (no unit, already plausible), 'guess' (the only unit that makes it plausible) or
  'bad' (impossible either way: v is the number as printed).
*/
export function toUnit(key, n, rawUnit) {
  const def = TESTS[key];
  if (!def || def.text) return { v: n, how: 'same' };
  const uk = unitKey(rawUnit);
  const f = def.conv[uk];
  if (f != null) {
    const v = conv(f, n);
    return { v, how: inOk(def, v) ? 'unit' : 'bad' };
  }
  if (inOk(def, n)) return { v: n, how: 'same' };
  const fits = Object.values(def.conv).map(g => conv(g, n)).filter(v => inOk(def, v));
  return fits.length === 1 ? { v: fits[0], how: 'guess' } : { v: n, how: 'bad' };
}

// The lab's printed range, in the test's unit: [lo, hi] (either may be null), or null.
export function parseRange(raw, key, rawUnit) {
  const s = latin(raw).replace(/–|—/g, '-');
  let lo = null, hi = null;
  const pair = s.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  const lt = s.match(/(?:<|less than|up to|≤|کمتر از|تا)\s*(\d+(?:\.\d+)?)/i);
  const gt = s.match(/(?:>|more than|greater than|≥|بیشتر از)\s*(\d+(?:\.\d+)?)/i);
  // «more than 200 is positive»: 200 is where it stops being normal
  const bad = /positive|abnormal|reactive|high|مثبت|غیرطبیعی/i.test(s);
  if (pair) { lo = Number(pair[1]); hi = Number(pair[2]); }
  else if (lt) hi = Number(lt[1]);
  else if (gt) { if (bad) hi = Number(gt[1]); else lo = Number(gt[1]); }
  else return null;
  const def = TESTS[key];
  if (!def || def.text) return [lo, hi];
  const f = def.conv[unitKey(rawUnit)] ?? 1;
  return [lo == null ? null : round(conv(f, lo), 3), hi == null ? null : round(conv(f, hi), 3)];
}

// The range the app judges by: the guideline's, else the lab's, else the usual one.
export function rangeOf(key, sex, lab) {
  const def = TESTS[key];
  if (!def || def.text) return null;
  const pick = r => (typeof r === 'function' ? r(sex) : r);
  if (def.rule) return { r: pick(def.rule), from: 'rule' };
  if (lab && (lab[0] != null || lab[1] != null)) return { r: lab, from: 'lab' };
  return def.def ? { r: pick(def.def), from: 'def' } : null;
}

// 'low' | 'high' | 'ok' | null for a saved row.
export function status(row, sex) {
  if (!row) return null;
  if (row.t != null) {
    const def = TESTS[row.k];
    if (!def?.text) return null;
    return row.t === 'neg' ? 'ok' : (['trace', 'pos'].includes(row.t) || /^\++$/.test(row.t) ? 'high' : null);
  }
  if (row.v == null) return null;
  const range = rangeOf(row.k, sex, row.lo != null || row.hi != null ? [row.lo, row.hi] : null);
  if (!range) {
    if (row.lo != null && row.v < row.lo) return 'low';
    if (row.hi != null && row.v > row.hi) return 'high';
    return row.lo != null || row.hi != null ? 'ok' : null;
  }
  const [lo, hi] = range.r;
  if (lo != null && row.v < lo) return 'low';
  if (hi != null && row.v > hi) return 'high';
  return 'ok';
}

const normName = s => latin(s).toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '').replace(/\d{3,}$/, '');

/*
  One read's row → a row in the app's units. Read rows: { key, name, value, unit, range, prev }
  as printed. The result: { k, n, v | t, q, u, lo, hi, p, pq, pt, raw, bad, guess }.
*/
export function normRow(r) {
  const key = TESTS[r.key] ? r.key : 'other';
  const def = TESTS[key];
  const out = { k: key, n: String(r.name || '').trim(), raw: { value: r.value ?? '', unit: r.unit ?? '', range: r.range ?? '', prev: r.prev ?? '' } };
  const val = parseValue(r.value), prev = parseValue(r.prev);
  if (val?.n != null && !def?.text) {
    const c = toUnit(key, val.n, r.unit);
    out.v = def ? round(c.v, 3) : val.n;
    out.q = val.q;
    if (c.how === 'bad') out.bad = true;
    if (c.how === 'guess') out.guess = true;
    // the previous result is printed in the same unit as this one
    if (prev?.n != null) { out.p = def ? round(c.how === 'guess' && val.n ? c.v / val.n * prev.n : toUnit(key, prev.n, r.unit).v, 3) : prev.n; out.pq = prev.q; }
    else if (prev?.t) out.pt = prev.t;
  } else if (val) {
    out.t = val.t != null ? val.t : String(val.n);
    if (prev) out.pt = prev.t != null ? prev.t : String(prev.n);
  }
  const lab = parseRange(r.range, key, r.unit);
  if (lab) { out.lo = lab[0]; out.hi = lab[1]; }
  out.u = def && !def.text ? def.u : String(r.unit || '').trim();
  return out;
}

const same = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) <= Math.max(1e-6, Math.abs(a) * 0.002));
const sameRow = (a, b) => a.t != null || b.t != null ? (a.t ?? '') === (b.t ?? '') && (a.pt ?? '') === (b.pt ?? '') : same(a.v, b.v) && same(a.p, b.p) && (a.q || '') === (b.q || '');
const matchKey = row => (row.k !== 'other' ? row.k : `other:${normName(row.n)}`);

/*
  Two reads of one sheet → what to show for confirming:
  { day, prevDay, lab, person, rows, flagged, dayAlt, prevAlt }
  Every row has `ok` (taken as is) or `why` (a short Persian reason) and maybe `alts` (other values).
*/
export function mergeReads(reads, { today } = {}) {
  const good = (reads || []).filter(r => r && r.found !== false && Array.isArray(r.rows) && r.rows.length);
  if (!good.length) return null;
  const [A, B] = good;
  const rowsA = A.rows.map(normRow);
  const rowsB = B ? B.rows.map(normRow) : null;
  const out = {
    day: validDay(A.date, today) || validDay(B?.date, today) || today || '',
    prevDay: validDay(A.prev_date, today) || validDay(B?.prev_date, today) || '',
    lab: String(A.lab || B?.lab || '').trim(),
    person: { name: String(A.person?.name || B?.person?.name || '').trim(), age: Number(A.person?.age || B?.person?.age) || null, sex: A.person?.sex || B?.person?.sex || '' },
  };
  if (B && validDay(B.date, today) && validDay(A.date, today) && B.date !== A.date) out.dayAlt = B.date;
  if (out.prevDay && out.day && out.prevDay >= out.day) out.prevDay = '';

  // pair the rows: the n-th row with a key in A is the n-th with that key in B
  const pool = new Map();
  if (rowsB) rowsB.forEach(r => { const k = matchKey(r); (pool.get(k) || pool.set(k, []).get(k)).push(r); });
  const rows = rowsA.map(a => {
    const row = { ...a };
    if (rowsB) {
      const list = pool.get(matchKey(a)) || [];
      const b = list.shift();
      if (!b) { row.single = true; }
      else if (!sameRow(a, b)) {
        row.why = 'دو بار خواندن فرق داشت';
        row.alts = [b];
      }
    }
    return row;
  });
  // rows only the second read found (a skipped section in the first)
  if (rowsB) for (const list of pool.values()) for (const b of list) rows.push({ ...b, single: true });

  for (const r of rows) {
    if (r.why) continue;
    if (r.bad) r.why = 'این عدد برای این آزمایش ممکن نیست';
    else if (r.guess) r.why = 'واحد خوانده نشد';
  }
  checkSums(rows);
  // the same test twice with different numbers
  const seen = new Map();
  for (const r of rows) {
    if (r.k === 'other' || TESTS[r.k]?.text) continue;
    const o = seen.get(r.k);
    if (o && !same(o.v, r.v)) { o.why ||= 'دو بار در برگه آمده'; r.why ||= 'دو بار در برگه آمده'; }
    else seen.set(r.k, r);
  }
  for (const r of rows) r.ok = !r.why;
  out.rows = rows;
  out.flagged = rows.filter(r => !r.ok).length;
  return out;
}

function validDay(d, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d || ''))) return '';
  if (d < '1990-01-01' || (today && d > today)) return '';
  return d;
}

// Numbers tied by arithmetic must agree; when they don't, every one involved is flagged.
const SUMS = [
  { keys: ['chol', 'ldl', 'hdl', 'tg'], ok: (c, l, h, t) => t > 400 || Math.abs(c - (l + h + t / 5)) <= Math.max(15, c * 0.1) },
  { keys: ['vldl', 'tg'], ok: (v, t) => Math.abs(v - t / 5) <= Math.max(3, v * 0.15) },
  { keys: ['mchc', 'hgb', 'hct'], ok: (c, h, t) => Math.abs(c - h / t * 100) <= c * 0.05 },
  { keys: ['mcv', 'hct', 'rbc'], ok: (m, t, r) => Math.abs(m - t / r * 10) <= m * 0.05 },
  { keys: ['mch', 'hgb', 'rbc'], ok: (m, h, r) => Math.abs(m - h / r * 10) <= m * 0.05 },
];
export function checkSums(rows) {
  const by = {};
  for (const r of rows) if (r.v != null && !r.q && !r.bad && !by[r.k]) by[r.k] = r;
  for (const s of SUMS) {
    const rs = s.keys.map(k => by[k]);
    if (rs.some(r => !r)) continue;
    if (!s.ok(...rs.map(r => r.v))) rs.forEach(r => { r.why ||= 'با بقیه‌ی عددها جور نیست'; });
  }
  const diff = ['neut', 'lymph', 'mono', 'eos', 'baso'].map(k => by[k]);
  if (diff.filter(Boolean).length >= 4) {
    const sum = diff.reduce((s, r) => s + (r?.v || 0), 0);
    if (sum < 95 || sum > 102) diff.filter(Boolean).forEach(r => { r.why ||= 'با بقیه‌ی عددها جور نیست'; });
  }
  return rows;
}

// What is saved for a sheet (the checked rows as the member left them).
export function toSaved(merged, rows) {
  return {
    day: merged.day, prevDay: merged.prevDay || '', lab: merged.lab || '', person: merged.person || {},
    rows: rows.map(r => {
      const o = { k: r.k, n: r.n };
      for (const f of ['v', 'q', 't', 'u', 'lo', 'hi', 'p', 'pq', 'pt']) if (r[f] != null && r[f] !== '') o[f] = r[f];
      return o;
    }),
  };
}

// Saved sheets, newest first: [{ key, ...data }].
export const sheetsOf = notes => (notes || []).filter(n => n.kind === 'lab' && n.data?.day).map(n => ({ key: n.key, ...n.data })).sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));

const rowId = r => (r.k !== 'other' ? r.k : `other:${normName(r.n)}`);

// Every value of one test over time, oldest first: [{ day, v | t, q, sheet, prev }].
export function series(sheets, id) {
  const pts = new Map();
  for (const s of sheets) {
    for (const r of s.rows || []) {
      if (rowId(r) !== id) continue;
      if (!pts.has(s.day) || pts.get(s.day).prev) pts.set(s.day, { day: s.day, v: r.v, t: r.t, q: r.q, row: r, sheet: s.key });
      if (s.prevDay && (r.p != null || r.pt != null) && !pts.has(s.prevDay)) pts.set(s.prevDay, { day: s.prevDay, v: r.p, t: r.pt, q: r.pq, row: r, sheet: s.key, prev: true });
    }
  }
  return [...pts.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}

// The newest value of every test: [{ id, k, name, g, last, before, status }] in catalog order.
export function latest(sheets, sex) {
  const ids = new Map();
  for (const s of sheets) for (const r of s.rows || []) if (!ids.has(rowId(r))) ids.set(rowId(r), r);
  const order = id => { const i = KEYS.indexOf(id); return i < 0 ? 1e6 : i; };
  return [...ids.entries()].sort((a, b) => order(a[0]) - order(b[0])).map(([id, r]) => {
    const pts = series(sheets, id);
    const last = pts[pts.length - 1], before = pts.length > 1 ? pts[pts.length - 2] : null;
    const def = TESTS[r.k];
    return { id, k: r.k, name: def?.fa || r.n, g: def?.g || 'other', u: last.row.u || '', last, before, pts, status: status({ ...last.row, v: last.v, t: last.t }, sex) };
  });
}

/*
  Conditions of the app's list (targets.js CONDITIONS) the numbers point to and the profile does
  not have yet: [{ cond, keys }]. A suggestion, never a diagnosis; «نه» is kept per sheet.
*/
export function suggestions(list, profile) {
  const has = new Set(profile?.conditions || []);
  const sex = profile?.sex;
  const v = k => { const x = list.find(l => l.k === k); return x?.last?.v ?? null; };
  const out = [];
  const add = (cond, keys) => { if (keys.length && !has.has(cond)) out.push({ cond, keys }); };
  const a1c = v('hba1c'), fbs = v('fbs');
  const diab = [a1c != null && a1c >= 6.5 && 'hba1c', fbs != null && fbs >= 126 && 'fbs'].filter(Boolean);
  if (diab.length) add('diabetes', diab);
  else if (!has.has('diabetes')) add('prediabetes', [a1c != null && a1c >= 5.7 && 'hba1c', fbs != null && fbs >= 100 && 'fbs'].filter(Boolean));
  const hdl = v('hdl');
  add('lipids', [v('tg') >= 150 && 'tg', v('ldl') >= 160 && 'ldl', v('chol') >= 240 && 'chol', hdl != null && hdl < (sex === 'female' ? 50 : 40) && 'hdl'].filter(k => k && v(k) != null));
  const ua = v('uric');
  if (ua != null && ua > (sex === 'female' ? 6 : 7)) add('gout', ['uric']);
  const egfr = v('egfr');
  if (egfr != null && egfr < 60) add('kidney', ['egfr']);
  return out;
}

// The newest numbers for Hooshvareh: one compact line per test.
export function forAI(sheets, sex) {
  return latest(sheets, sex).slice(0, 60).map(l => {
    const range = rangeOf(l.k, sex, l.last.row.lo != null || l.last.row.hi != null ? [l.last.row.lo, l.last.row.hi] : null);
    const val = x => (x.v != null ? `${x.q || ''}${x.v}` : TEXT_FA[x.t] || x.t);
    return {
      test: l.name, value: val(l.last), unit: l.u, day: l.last.day, status: l.status,
      range: range ? `${range.r[0] ?? ''}–${range.r[1] ?? ''}` : '',
      ...(l.before ? { before: val(l.before), before_day: l.before.day } : {}),
    };
  });
}
