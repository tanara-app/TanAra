/*
  Units and weights, shared by the food bank form, «غذای دلخواه», the log step and entry editing.

  A food stores kcal and protein for one household unit plus the weight of that unit in
  grams (food.grams). From those it can be logged either in units («۲ کفگیر») or straight in
  grams («۲۵۰ گرم»). A food whose unit is «گرم» has grams = 1 and per-gram values; its
  numbers are shown and typed per ۱۰۰ گرم, like a nutrition label.

  A food can also have a second unit (food.unit2, weighing food.grams2): «نان سنگک» by
  کف‌دست or by نان کامل. Amounts in it go through grams, so it needs the food's weight too.
*/
import { UNITS, UNIT_GRAMS, GRAM } from '../data/seedFoods.js';
import { fa, parseNum, esc, qtyLabel } from '../lib/fa.js';
import { icon } from './dom.js';

const OTHER = '__other';
const r1 = x => Math.round(x * 10) / 10;
export const hasGrams = f => f.unit === GRAM || Number(f.grams) > 0;
export const hasUnit2 = f => !!f.unit2 && f.unit2 !== f.unit && Number(f.grams2) > 0 && hasGrams(f);
const perGram = f => (f.unit === GRAM ? 1 : 1 / Number(f.grams)); // food units in one gram

// «کفگیر (۱۲۰ گرم) · ۱۸۰ کالری · ۳ گرم پروتئین» — or per ۱۰۰ گرم for weighed foods.
export function foodMeta(f) {
  if (f.unit === GRAM) {
    return `۱۰۰ گرم${hasUnit2(f) ? ` (یا ${unit2Label(f)})` : ''} · ${fa(Math.round(f.kcal * 100))} کالری${f.protein ? ` · ${fa(r1(f.protein * 100), 1)} گرم پروتئین` : ''}`;
  }
  return `${esc(f.unit)}${Number(f.grams) > 0 ? ` (${fa(Math.round(f.grams))} گرم)` : ''}${hasUnit2(f) ? ` یا ${unit2Label(f)}` : ''} · ${fa(Math.round(f.kcal))} کالری${f.protein ? ` · ${fa(r1(f.protein), 1)} گرم پروتئین` : ''}`;
}

function unit2Label(f) {
  return `${esc(f.unit2)} (${fa(f.grams2 < 10 ? r1(f.grams2) : Math.round(f.grams2), 1)} گرم)`;
}

// «۲ کفگیر» / «۲۵۰ گرم» for an amount as stored on an entry.
export const amountLabel = (qty, unit) => `${unit === GRAM ? fa(Math.round(qty)) : qtyLabel(qty)} ${esc(unit)}`;

/* ---------------- unit / weight / calorie fields ---------------- */

export function unitFields(f, { kcalLabel = 'کالری' } = {}) {
  const unit = f.unit || 'کفگیر';
  const known = UNITS.includes(unit);
  const per100 = unit === GRAM;
  const grams = per100 ? '' : Number(f.grams) > 0 ? fa(r1(f.grams), 1) : '';
  const k = f.kcal === '' || f.kcal == null ? '' : fa(per100 ? Math.round(f.kcal * 100) : Math.round(f.kcal));
  const p = f.protein === '' || f.protein == null ? '' : fa(r1(per100 ? f.protein * 100 : f.protein), 1);
  const u2 = f.unit2 || '';
  const g2 = u2 && Number(f.grams2) > 0 ? fa(r1(f.grams2), 1) : '';
  const units2 = UNITS.filter(u => u !== GRAM);
  return `
    <div class="row gap unit-row">
      <label class="field grow"><span>واحد خانگی</span>
        <select name="unit">
          ${UNITS.map(u => `<option value="${esc(u)}" ${u === unit ? 'selected' : ''}>${u === GRAM ? 'گرم (وزن‌کردنی)' : esc(u)}</option>`).join('')}
          ${known ? '' : `<option value="${esc(unit)}" selected>${esc(unit)}</option>`}
          <option value="${OTHER}">واحد دیگر…</option>
        </select>
      </label>
      <label class="field grow" data-gf ${per100 ? 'hidden' : ''}><span>هر واحد چند گرم؟</span><input name="grams" inputmode="decimal" placeholder="مثلاً ۱۲۰" value="${grams}"></label>
    </div>
    <label class="field" data-other hidden><span>اسم واحد</span><input name="unitOther" placeholder="مثلاً قاشق چای‌خوری"></label>
    <div class="row gap unit-row">
      <label class="field grow"><span>واحد دوم (اختیاری)</span>
        <select name="unit2">
          <option value="" ${u2 ? '' : 'selected'}>ندارد</option>
          ${units2.map(u => `<option value="${esc(u)}" ${u === u2 ? 'selected' : ''}>${esc(u)}</option>`).join('')}
          ${!u2 || units2.includes(u2) ? '' : `<option value="${esc(u2)}" selected>${esc(u2)}</option>`}
          <option value="${OTHER}">واحد دیگر…</option>
        </select>
      </label>
      <label class="field grow" data-g2f ${u2 ? '' : 'hidden'}><span>هر کدام چند گرم؟</span><input name="grams2" inputmode="decimal" placeholder="مثلاً ۴۰۰" value="${g2}"></label>
    </div>
    <label class="field" data-other2 hidden><span>اسم واحد دوم</span><input name="unit2Other" placeholder="مثلاً نان کامل"></label>
    <div class="row gap">
      <label class="field grow"><span data-kl>${kcalLabel}</span><input name="kcal" inputmode="numeric" placeholder="۰" value="${k}"></label>
      <label class="field grow"><span data-pl>پروتئین (گرم)</span><input name="protein" inputmode="decimal" placeholder="۰" value="${p}"></label>
    </div>`;
}

/*
  Wires unitFields. Returns { read, set }: read() → { unit, grams, kcal, protein } per one
  unit (per gram for «گرم»), or { error }; set(values) fills the fields from such values.
*/
export function bindUnitFields(root, F, onChange) {
  let lastUnit = F.unit.value, lastUnit2 = F.unit2.value;
  const gf = root.querySelector('[data-gf]');
  const other = root.querySelector('[data-other]');
  const g2f = root.querySelector('[data-g2f]');
  const other2 = root.querySelector('[data-other2]');
  const unit2Name = () => (F.unit2.value === OTHER ? F.unit2Other.value.trim() : F.unit2.value);
  const unitName = () => (F.unit.value === OTHER ? F.unitOther.value.trim() || 'واحد' : F.unit.value);
  const per100 = () => F.unit.value === GRAM; // weighed foods are typed per ۱۰۰ گرم
  const grams = () => (per100() ? 1 : parseNum(F.grams.value));

  const labels = () => {
    gf.hidden = per100();
    other.hidden = F.unit.value !== OTHER;
    g2f.hidden = !F.unit2.value;
    other2.hidden = F.unit2.value !== OTHER;
    const per = per100() ? '۱۰۰ گرم' : unitName();
    root.querySelector('[data-kl]').textContent = `کالری هر ${per}`;
    root.querySelector('[data-pl]').textContent = `پروتئین هر ${per} (گرم)`;
  };

  // the numbers in the boxes, as per-unit values
  const values = () => {
    const k = parseNum(F.kcal.value), p = parseNum(F.protein.value) || 0;
    return per100() ? { kcal: k / 100, protein: p / 100 } : { kcal: k, protein: p };
  };
  const show = (kcal, protein) => {
    const f = per100() ? 100 : 1;
    if (Number.isFinite(kcal)) F.kcal.value = fa(Math.round(kcal * f));
    if (Number.isFinite(protein)) F.protein.value = fa(r1(protein * f), 1);
  };
  // rescale the typed numbers by a factor (unit ↔ ۱۰۰ گرم)
  const scale = f => {
    if (!F.kcal.value) return;
    const k = parseNum(F.kcal.value), p = parseNum(F.protein.value) || 0;
    if (k >= 0) F.kcal.value = fa(Math.round(k * f));
    if (F.protein.value) F.protein.value = fa(r1(p * f), 1);
  };

  F.unit.addEventListener('change', () => {
    const u = F.unit.value;
    const prev = lastUnit;
    lastUnit = u;
    if (u === prev) { labels(); return; }
    if (u === OTHER) { labels(); F.unitOther.focus(); onChange?.(); return; }
    const g = parseNum(F.grams.value);
    if (u === GRAM) {
      // one unit of g grams → per ۱۰۰ گرم
      if (g > 0) scale(100 / g);
    } else {
      // a weight that was only the old unit's default follows the new unit
      if (prev !== GRAM && (!(g > 0) || g === UNIT_GRAMS[prev])) F.grams.value = UNIT_GRAMS[u] ? fa(UNIT_GRAMS[u]) : '';
      // per ۱۰۰ گرم → one unit of its weight
      const ng = parseNum(F.grams.value);
      if (prev === GRAM && ng > 0) scale(ng / 100);
    }
    labels(); onChange?.();
  });
  F.unit2.addEventListener('change', () => {
    const u = F.unit2.value, prev = lastUnit2;
    lastUnit2 = u;
    if (u === prev) { labels(); return; }
    // a weight that was only the old unit's default follows the new unit
    const g = parseNum(F.grams2.value);
    if (u !== OTHER && (!(g > 0) || g === UNIT_GRAMS[prev])) F.grams2.value = UNIT_GRAMS[u] ? fa(UNIT_GRAMS[u]) : '';
    labels(); onChange?.();
    if (u === OTHER) F.unit2Other.focus();
    else if (u && !F.grams2.value) F.grams2.focus();
  });
  [F.grams, F.kcal, F.protein, F.unitOther, F.grams2, F.unit2Other].forEach(i => i.addEventListener('input', () => { labels(); onChange?.(); }));
  labels();

  return {
    read() {
      const unit = unitName();
      if (F.unit.value === OTHER && !F.unitOther.value.trim()) return { error: 'اسم واحد را بنویس.' };
      const g = grams();
      const v = values();
      if (!(v.kcal >= 0)) return { error: 'کالری را وارد کنید.' };
      const u2 = unit2Name(), g2 = parseNum(F.grams2.value);
      if (F.unit2.value === OTHER && !u2) return { error: 'اسم واحد دوم را بنویس.' };
      if (u2 && u2 === unit) return { error: 'واحد دوم با واحد اول یکی است.' };
      if (u2 && !(g2 > 0)) return { error: `بنویس هر ${u2} چند گرم است.` };
      if (u2 && !(g > 0)) return { error: `برای واحد دوم، اول بنویس هر ${unit} چند گرم است.` };
      return { unit, grams: g > 0 ? g : null, kcal: v.kcal, protein: v.protein || 0, unit2: u2 || null, grams2: u2 ? g2 : null };
    },
    set({ unit, grams: g, kcal, protein, unit2, grams2 }) {
      if (unit2) {
        if (![...F.unit2.options].some(o => o.value === unit2)) F.unit2.add(new Option(unit2, unit2), F.unit2.options.length - 1);
        F.unit2.value = unit2;
        lastUnit2 = unit2;
        F.unit2.dispatchEvent(new Event('change'));
        if (grams2 > 0) F.grams2.value = fa(r1(grams2), 1);
      }
      if (unit) {
        if (![...F.unit.options].some(o => o.value === unit)) F.unit.add(new Option(unit, unit), F.unit.options.length - 1);
        F.unit.value = unit;
        lastUnit = unit;
        F.unit.dispatchEvent(new Event('change')); // repaint the picker; handler sees no change
      }
      if (!per100() && g > 0) F.grams.value = fa(r1(g), 1);
      show(kcal, protein);
      labels(); onChange?.();
    },
  };
}

/* ---------------- amount (units or grams) ---------------- */

const UNIT_PRESETS = [0.5, 1, 1.5, 2, 3];
const GRAM_PRESETS = [50, 100, 150, 200, 300];

/*
  The quantity box. base() gives the food's current per-unit values; start is
  { qty, grams, unit2 } where grams says the amount is in grams and unit2 that it is in the
  food's second unit. Returns { get, refresh }: get() → { unit, qty, kcal, protein } ready
  for an entry.
*/
export function mountAmount(box, base, start, { onEditFood } = {}) {
  // mode: 'u' the food's unit, 'u2' its second unit, 'g' grams; n holds the amount in each
  let mode = 'u';
  const n = { u: 1, u2: 1, g: 100 };
  const b0 = base();
  if (start.unit2 && hasUnit2(b0)) { mode = 'u2'; n.u2 = start.qty; }
  else if (b0.unit === GRAM) { mode = 'g'; n.g = start.qty > 1 ? start.qty : 100; }
  else if (start.grams && hasGrams(b0)) { mode = 'g'; n.g = start.qty; }
  else n.u = start.grams ? 1 : start.qty || 1;

  const modes = b => [b.unit !== GRAM && 'u', hasUnit2(b) && 'u2', hasGrams(b) && 'g'].filter(Boolean);
  const name = (b, m) => (m === 'u' ? b.unit : m === 'u2' ? b.unit2 : GRAM);
  // grams in one of the mode's unit
  const gramsIn = (b, m) => (m === 'g' ? 1 : m === 'u2' ? Number(b.grams2) : Number(b.grams));
  const show = v => (mode === 'g' ? fa(Math.round(v)) : fa(v, 2));

  function draw() {
    const b = base();
    const ms = modes(b);
    if (!ms.includes(mode)) { mode = ms[0]; if (mode === 'u') n.u = 1; }
    const inGrams = mode === 'g';
    box.innerHTML = `
      ${ms.length > 1 ? `<div class="seg small" data-mode>
        ${ms.map(m => `<button type="button" data-v="${m}" class="${m === mode ? 'on' : ''}">با ${esc(name(b, m))}</button>`).join('')}
      </div>` : ''}
      <div class="qty-row">
        <button type="button" class="round" data-step="1" aria-label="بیشتر">${icon.plus}</button>
        <div class="qty-val"><input inputmode="decimal" aria-label="مقدار" value="${show(n[mode])}"><span data-sub></span></div>
        <button type="button" class="round" data-step="-1" aria-label="کمتر">${icon.minus}</button>
      </div>
      <div class="chips">${(inGrams ? GRAM_PRESETS : UNIT_PRESETS).map(q => `<button type="button" class="chip" data-q="${q}">${inGrams ? fa(q) : qtyLabel(q)}</button>`).join('')}</div>
      <div class="preview"></div>
      ${!hasGrams(b) && onEditFood ? '<button type="button" class="link small" data-edit-food>برای ثبت با گرم، بنویس هر واحد چند گرم است</button>' : ''}`;
    const input = box.querySelector('.qty-val input');
    box.querySelectorAll('[data-step]').forEach(x => x.onclick = () => {
      const d = Number(x.dataset.step);
      if (inGrams) n.g = Math.max(5, Math.round((n.g + d * (n.g >= 100 ? 25 : 10)) / 5) * 5);
      else n[mode] = Math.max(0.25, n[mode] + d * 0.5);
      input.value = show(n[mode]);
      paint();
    });
    box.querySelectorAll('[data-q]').forEach(x => x.onclick = () => {
      n[mode] = Number(x.dataset.q);
      input.value = show(n[mode]);
      paint();
    });
    input.addEventListener('input', () => {
      const v = parseNum(input.value);
      if (!(v > 0)) return;
      n[mode] = v;
      paint();
    });
    box.querySelector('[data-mode]')?.addEventListener('click', e => {
      const x = e.target.closest('button[data-v]');
      if (!x || x.dataset.v === mode) return;
      const b2 = base();
      // the same amount, by weight, in the new unit
      const grams = n[mode] * gramsIn(b2, mode);
      const to = x.dataset.v;
      n[to] = to === 'g' ? Math.max(5, Math.round(grams / 5) * 5) : Math.max(0.25, Math.round(grams / gramsIn(b2, to) * 4) / 4);
      mode = to;
      draw();
    });
    box.querySelector('[data-edit-food]')?.addEventListener('click', onEditFood);
    paint();
  }

  function get() {
    const b = base();
    // food units in one of the amount's unit
    const per = mode === 'u' ? 1 : gramsIn(b, mode) * perGram(b);
    const v = n[mode];
    return { unit: name(b, mode), qty: v, kcal: b.kcal * per * v, protein: b.protein * per * v };
  }

  function paint() {
    const b = base();
    const a = get();
    const sub = box.querySelector('[data-sub]');
    const w = gramsIn(b, mode);
    sub.textContent = mode === 'g' ? 'گرم'
      : `${name(b, mode)}${w > 0 ? ` · حدود ${fa(Math.round(n[mode] * w))} گرم` : ''}`;
    box.querySelector('.preview').innerHTML = `<b>${fa(Math.round(a.kcal))}</b> کالری · <b>${fa(r1(a.protein), 1)}</b> گرم پروتئین`;
    box.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', Number(c.dataset.q) === n[mode]));
  }

  draw();
  return { get, refresh: draw, repaint: paint };
}
