// «آزمایش خون»: reading a lab sheet's numbers and checking them. Made-up sheets only (no member's data).
import { suite, test, eq, ok, near } from './harness.js';
import { parseValue, unitKey, toUnit, parseRange, normRow, mergeReads, status, series, latest, sheetsOf, suggestions, toSaved, KEYS, TESTS } from '../js/domain/labs.js';

const today = '2026-11-17';
// a sheet as one read returns it, with the units and spellings labs print
const row = (key, name, value, unit, range = '', prev = '') => ({ key, name, value, unit, range, prev });
const READ = {
  found: true, lab: 'آزمایشگاه نمونه', date: '2026-11-10', prev_date: '2026-03-02',
  person: { name: 'نمونه', age: 50, sex: 'male' },
  rows: [
    row('fbs', 'Blood Sugar (F)', '98', 'mg/dl', 'Normal, 70-105', '104'),
    row('hba1c', 'HbA1C', '5.4', '%HbA1C', 'Normal < 5.7', '5.6'),
    row('chol', 'S. Cholesterol', '180', 'Mg/dl', '120-200', '190'),
    row('hdl', 'HDL Cholesterol', '38', 'Mg/dl', 'Normal, 30-70', '41'),
    row('ldl', 'LDL Cholesterol', '112', 'Mg/dl', '60-130', '118'),
    row('vldl', 'VLDL', '30', 'Mg/dl', '13-60', '31'),
    row('tg', 'S. Triglycerides', '150', 'Mg/dl', '35-160', ''),
    row('hgb', 'Haemoglobin', '15.0', 'gm/dl', '13-18', '15.2'),
    row('hct', 'Hematocrit', '45.0', '', '40-54', ''),
    row('rbc', 'R.B.C. Count', '5.00', 'mil/cmm', '4.5-6.5', ''),
    row('mcv', 'MCV', '90.0', 'cu micron', '80-94', ''),
    row('mch', 'MCH', '30.0', 'picograms', '27-31', ''),
    row('mchc', 'MCHC', '33.3', 'g/dl', '31.5-35', ''),
    row('wbc', 'Total WBC Count', '6,200', '\\cmm', '4000-11000', '5900'),
    row('plt', 'Platelet Count', '250', 'x10^3/u', '150-400', ''),
    row('neut', 'Neutrophils', '55', '%', '40-70', ''),
    row('lymph', 'Lymphocytes', '35', '%', '20-40', ''),
    row('mono', 'Monocytes', '6', '%', '2-8', ''),
    row('eos', 'Eosinophils', '3', '%', '0-4', ''),
    row('baso', 'Basophils', '1', '%', '0-1', ''),
    row('vitd', '25-OH Vitamin D', '22.5', 'ng/ml', 'Optimal 30-50', ''),
    row('tsh', 'TSH', '2.10', 'uIU/ML', '0.35-4.94', '2.30'),
    row('u_glucose', 'Sugar', 'Absent', '', 'Absent', 'Trace'),
    row('other', 'Anti streptolysin O titer', '120', 'IU/ml', 'More than 200 is positive', '<100'),
  ],
};
const copy = o => JSON.parse(JSON.stringify(o));

suite('labs', () => {
  test('numbers as labs print them: Persian digits, decimal commas, thousands, < and text', () => {
    eq(parseValue('۱۸۶'), { n: 186, q: '' });
    eq(parseValue('٠٫٩٥'), { n: 0.95, q: '' });
    eq(parseValue('0,95'), { n: 0.95, q: '' });
    eq(parseValue('4,750'), { n: 4750, q: '' });
    eq(parseValue('< 1.0'), { n: 1, q: '<' });
    eq(parseValue('++'), { t: '++' });
    eq(parseValue('Absent'), { t: 'neg' });
    eq(parseValue('Trace'), { t: 'trace' });
    eq(parseValue(''), null);
  });

  test('units in many spellings', () => {
    eq(unitKey('Mg/dl'), 'mg/dl');
    eq(unitKey('\\cmm'), '/ul');
    eq(unitKey('x10^3/u'), 'e3/ul');
    eq(unitKey('mil/cmm'), 'e6/ul');
    eq(unitKey('cu micron'), 'fl');
    eq(unitKey('uIU/ML'), 'miu/l');
    eq(unitKey('IU/L'), 'u/l');
    eq(unitKey('µmol/L'), 'umol/l');
    eq(unitKey('mEq/L'), 'mmol/l');
  });

  test('values are converted to the unit the app keeps, or the only unit that makes sense', () => {
    near(toUnit('fbs', 5.5, 'mmol/L').v, 99.1, 0.1);
    near(toUnit('cr', 84, 'µmol/L').v, 0.95, 0.01);
    near(toUnit('wbc', 4750, '/cmm').v, 4.75);
    eq(toUnit('tg', 186, '').how, 'same');
    // a cholesterol of 4.5 with no unit can only be mmol/L
    const g = toUnit('chol', 4.5, '');
    eq(g.how, 'guess');
    near(g.v, 174, 0.1);
    eq(toUnit('hgb', 160, 'g/dL').how, 'bad');
  });

  test('printed ranges', () => {
    eq(parseRange('Normal, 70-105', 'fbs', 'mg/dl'), [70, 105]);
    eq(parseRange('<150', 'other', ''), [null, 150]);
    eq(parseRange('Normal < 5.7, Prediabetic 5.7 - 6.5', 'hba1c', '%'), [5.7, 6.5]);
    eq(parseRange('', 'fbs', 'mg/dl'), null);
    eq(parseRange('More than 200 IU/ML is positive', 'other', ''), [null, 200]);
    eq(parseRange('> 60', 'egfr', 'ml/min'), [60, null]);
  });

  test('two reads that agree: nothing to look at', () => {
    const m = mergeReads([READ, copy(READ)], { today });
    eq(m.flagged, 0);
    eq(m.day, '2026-11-10');
    eq(m.prevDay, '2026-03-02');
    eq(m.rows.length, READ.rows.length);
    const wbc = m.rows.find(r => r.k === 'wbc');
    near(wbc.v, 6.2);
    near(wbc.p, 5.9);
    eq(m.rows.find(r => r.k === 'u_glucose').t, 'neg');
    eq(m.rows.find(r => r.k === 'other').pq, '<');
  });

  test('a number read differently the second time is flagged with both values', () => {
    const b = copy(READ);
    b.rows.find(r => r.key === 'hdl').value = '41'; // the previous-result column by mistake
    const m = mergeReads([READ, b], { today });
    const hdl = m.rows.find(r => r.k === 'hdl');
    eq(hdl.ok, false);
    eq(hdl.v, 38);
    eq(hdl.alts[0].v, 41);
    // HDL is part of cholesterol = LDL + HDL + TG/5, which still adds up with 38
    eq(m.flagged, 1);
  });

  test('numbers that do not add up are flagged even when both reads agree', () => {
    const a = copy(READ);
    a.rows.find(r => r.key === 'ldl').value = '172'; // 112 misread as 172 in both
    const m = mergeReads([a, copy(a)], { today });
    for (const k of ['chol', 'ldl', 'hdl', 'tg']) eq(m.rows.find(r => r.k === k).ok, false, k);
    const c = copy(READ);
    c.rows.find(r => r.key === 'mchc').value = '38.3';
    eq(mergeReads([c, copy(c)], { today }).rows.find(r => r.k === 'mchc').ok, false);
    const d = copy(READ);
    d.rows.find(r => r.key === 'lymph').value = '45';
    eq(mergeReads([d, copy(d)], { today }).rows.find(r => r.k === 'neut').ok, false);
  });

  test('an impossible number, a guessed unit and a date in the future', () => {
    const a = copy(READ);
    a.rows.find(r => r.key === 'hgb').value = '150';
    a.rows.find(r => r.key === 'chol').unit = '';
    a.rows.find(r => r.key === 'chol').value = '4.66';
    a.date = '2027-01-01';
    const m = mergeReads([a], { today });
    eq(m.rows.find(r => r.k === 'hgb').ok, false);
    const chol = m.rows.find(r => r.k === 'chol');
    eq(chol.why, 'واحد خوانده نشد');
    near(chol.v, 180.2, 0.1);
    eq(m.day, today);
  });

  test('a row only one read found is kept', () => {
    const b = copy(READ);
    b.rows = b.rows.filter(r => r.key !== 'tsh');
    const m = mergeReads([READ, b], { today });
    const tsh = m.rows.find(r => r.k === 'tsh');
    ok(tsh.single);
    eq(tsh.ok, true);
  });

  test('status uses the guideline range where there is one, the lab range otherwise', () => {
    const m = mergeReads([READ], { today });
    const st = k => status(m.rows.find(r => r.k === k), 'male');
    eq(st('hdl'), 'low'); // the lab says 30–70; under 40 is low for a man
    eq(st('tg'), 'high'); // 150 is over the guideline's 149, inside the lab's 35–160
    eq(st('vitd'), 'low');
    eq(st('fbs'), 'ok');
    eq(st('hgb'), 'ok');
    eq(st('u_glucose'), 'ok');
    eq(status({ k: 'hdl', v: 45 }, 'female'), 'low');
  });

  test('saved sheets become one series per test, with the previous-result column as an older point', () => {
    const m = mergeReads([READ], { today });
    const notes = [{ key: 'lab:a', kind: 'lab', data: toSaved(m, m.rows) }];
    const later = copy(READ);
    later.date = '2026-12-20'; later.prev_date = '2026-11-10';
    later.rows.find(r => r.key === 'hdl').value = '42';
    const m2 = mergeReads([later], { today: '2026-12-31' });
    notes.push({ key: 'lab:b', kind: 'lab', data: toSaved(m2, m2.rows) });
    const sheets = sheetsOf(notes);
    eq(sheets[0].key, 'lab:b');
    const s = series(sheets, 'hdl');
    eq(s.map(p => [p.day, p.v]), [['2026-03-02', 41], ['2026-11-10', 38], ['2026-12-20', 42]]);
    const list = latest(sheets, 'male');
    const hdl = list.find(l => l.k === 'hdl');
    eq(hdl.last.v, 42);
    eq(hdl.before.v, 38);
    eq(hdl.status, 'ok');
    eq(list[0].k, 'fbs');
  });

  test('conditions the numbers point to', () => {
    const m = mergeReads([READ], { today });
    const list = latest(sheetsOf([{ key: 'lab:a', kind: 'lab', data: toSaved(m, m.rows) }]), 'male');
    eq(suggestions(list, { sex: 'male', conditions: [] }).map(s => [s.cond, s.keys]), [['lipids', ['tg', 'hdl']]]);
    eq(suggestions(list, { sex: 'male', conditions: ['lipids'] }), []);
  });

  test('the Edge Function offers the same test keys as the app', async () => {
    if (typeof process === 'undefined') return;
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../supabase/functions/hooshvareh/index.ts', import.meta.url), 'utf8');
    const m = src.match(/const LAB_TESTS = \{([\s\S]*?)\n\};/);
    ok(m, 'LAB_TESTS in the Edge Function');
    const keys = [...m[1].matchAll(/^\s+(\w+):/gm)].map(x => x[1]);
    eq(keys.sort(), [...KEYS].sort());
    ok(Object.values(TESTS).every(t => t.fa && t.g));
  });
});
