/*
  Units and weights, shared by the food bank form, «غذای دلخواه», the log step and entry editing.

  A food stores kcal and protein for one household unit plus the weight of that unit in
  grams (food.grams). From those it can be logged either in units («۲ کفگیر») or straight in
  grams («۲۵۰ گرم»). A food whose unit is «گرم» has grams = 1 and per-gram values; its
  numbers are shown and typed per ۱۰۰ گرم, like a nutrition label.
*/
import { UNITS, UNIT_GRAMS, GRAM } from '../data/seedFoods.js';
import { fa, parseNum, esc, qtyLabel } from '../lib/fa.js';
import { toast, icon } from './dom.js';

const OTHER = '__other';
const r1 = x => Math.round(x * 10) / 10;
export const hasGrams = f => f.unit === GRAM || Number(f.grams) > 0;

// «کفگیر (۱۲۰ گرم) · ۱۸۰ کالری · ۳ گرم پروتئین» — or per ۱۰۰ گرم for weighed foods.
export function foodMeta(f) {
  if (f.unit === GRAM) {
    return `۱۰۰ گرم · ${fa(Math.round(f.kcal * 100))} کالری${f.protein ? ` · ${fa(r1(f.protein * 100), 1)} گرم پروتئین` : ''}`;
  }
  return `${esc(f.unit)}${Number(f.grams) > 0 ? ` (${fa(Math.round(f.grams))} گرم)` : ''} · ${fa(Math.round(f.kcal))} کالری${f.protein ? ` · ${fa(r1(f.protein), 1)} گرم پروتئین` : ''}`;
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
    <div class="seg small" data-basis ${per100 ? 'hidden' : ''}>
      <button type="button" data-v="unit" class="on">برای یک <span data-un>${esc(unit)}</span></button>
      <button type="button" data-v="100">برای ۱۰۰ گرم</button>
    </div>
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
  let basis = F.unit.value === GRAM ? '100' : 'unit';
  let lastUnit = F.unit.value;
  const gf = root.querySelector('[data-gf]');
  const other = root.querySelector('[data-other]');
  const seg = root.querySelector('[data-basis]');
  const unitName = () => (F.unit.value === OTHER ? F.unitOther.value.trim() || 'واحد' : F.unit.value);
  const grams = () => (F.unit.value === GRAM ? 1 : parseNum(F.grams.value));

  const labels = () => {
    const u = unitName();
    const g = F.unit.value === GRAM;
    gf.hidden = g;
    seg.hidden = g;
    other.hidden = F.unit.value !== OTHER;
    root.querySelector('[data-un]').textContent = u;
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === basis));
    const per = basis === '100' ? '۱۰۰ گرم' : u;
    root.querySelector('[data-kl]').textContent = `کالری هر ${per}`;
    root.querySelector('[data-pl]').textContent = `پروتئین هر ${per} (گرم)`;
  };

  // the numbers in the boxes, as per-unit values
  const values = () => {
    const k = parseNum(F.kcal.value), p = parseNum(F.protein.value) || 0, g = grams();
    if (basis === 'unit') return { kcal: k, protein: p };
    return F.unit.value === GRAM ? { kcal: k / 100, protein: p / 100 } : { kcal: k * g / 100, protein: p * g / 100 };
  };
  const show = (kcal, protein) => {
    const f = basis === 'unit' ? 1 : F.unit.value === GRAM ? 100 : 100 / grams();
    if (Number.isFinite(kcal)) F.kcal.value = fa(Math.round(kcal * f));
    if (Number.isFinite(protein)) F.protein.value = fa(r1(protein * f), 1);
  };

  seg.addEventListener('click', e => {
    const b = e.target.closest('button[data-v]');
    if (!b || b.dataset.v === basis) return;
    if (!(grams() > 0)) { toast('اول بنویس هر واحد چند گرم است'); F.grams.focus(); return; }
    const v = values();
    basis = b.dataset.v;
    show(v.kcal, v.protein);
    labels(); onChange?.();
  });

  F.unit.addEventListener('change', () => {
    const u = F.unit.value;
    const prev = lastUnit;
    lastUnit = u;
    if (u === OTHER) { labels(); F.unitOther.focus(); onChange?.(); return; }
    if (u === GRAM) {
      // switching a per-unit food to grams: turn its numbers into per-100 g when the weight is known
      const g = parseNum(F.grams.value);
      if (basis === 'unit' && g > 0 && F.kcal.value) {
        const k = parseNum(F.kcal.value), p = parseNum(F.protein.value) || 0;
        F.kcal.value = fa(Math.round(k * 100 / g));
        F.protein.value = fa(r1(p * 100 / g), 1);
      }
      basis = '100';
    } else {
      // a weight that was only the old unit's default follows the new unit
      const g = parseNum(F.grams.value);
      if (!(g > 0) || g === UNIT_GRAMS[prev]) F.grams.value = UNIT_GRAMS[u] ? fa(UNIT_GRAMS[u]) : '';
      if (prev === GRAM) basis = '100';
    }
    labels(); onChange?.();
  });
  [F.grams, F.kcal, F.protein, F.unitOther].forEach(i => i.addEventListener('input', () => { labels(); onChange?.(); }));
  labels();

  return {
    read() {
      const unit = unitName();
      if (F.unit.value === OTHER && !F.unitOther.value.trim()) return { error: 'اسم واحد را بنویس.' };
      const g = grams();
      if (basis === '100' && !(g > 0)) return { error: 'بنویس هر واحد چند گرم است.' };
      const v = values();
      if (!(v.kcal >= 0)) return { error: 'کالری را وارد کنید.' };
      return { unit, grams: g > 0 ? g : null, kcal: v.kcal, protein: v.protein || 0 };
    },
    set({ unit, grams: g, kcal, protein }) {
      if (unit) {
        if (![...F.unit.options].some(o => o.value === unit)) F.unit.add(new Option(unit, unit), F.unit.options.length - 1);
        F.unit.value = unit;
        lastUnit = unit;
        F.unit.dispatchEvent(new Event('change')); // repaint the picker; handler sees no change
      }
      basis = F.unit.value === GRAM ? '100' : 'unit';
      if (F.unit.value !== GRAM && g > 0) F.grams.value = fa(r1(g), 1);
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
  { qty, grams } where grams says the amount is in grams. Returns { get, refresh }:
  get() → { unit, qty, kcal, protein } ready for an entry.
*/
export function mountAmount(box, base, start, { onEditFood } = {}) {
  let inGrams = false, qty = 1, g = 100;
  const b0 = base();
  if (b0.unit === GRAM) { inGrams = true; g = start.qty > 1 ? start.qty : 100; }
  else if (start.grams && hasGrams(b0)) { inGrams = true; g = start.qty; }
  else qty = start.grams ? 1 : start.qty || 1;

  function draw() {
    const b = base();
    if (b.unit === GRAM) inGrams = true;
    else if (inGrams && !hasGrams(b)) { inGrams = false; qty = 1; }
    const canToggle = b.unit !== GRAM && hasGrams(b);
    const val = inGrams ? g : qty;
    box.innerHTML = `
      ${canToggle ? `<div class="seg small" data-mode>
        <button type="button" data-v="u" class="${inGrams ? '' : 'on'}">با ${esc(b.unit)}</button>
        <button type="button" data-v="g" class="${inGrams ? 'on' : ''}">با گرم</button>
      </div>` : ''}
      <div class="qty-row">
        <button type="button" class="round" data-step="1" aria-label="بیشتر">${icon.plus}</button>
        <div class="qty-val"><input inputmode="decimal" aria-label="مقدار" value="${inGrams ? fa(Math.round(val)) : fa(val, 2)}"><span data-sub></span></div>
        <button type="button" class="round" data-step="-1" aria-label="کمتر">${icon.minus}</button>
      </div>
      <div class="chips">${(inGrams ? GRAM_PRESETS : UNIT_PRESETS).map(q => `<button type="button" class="chip" data-q="${q}">${inGrams ? fa(q) : qtyLabel(q)}</button>`).join('')}</div>
      <div class="preview"></div>
      ${!hasGrams(b) && onEditFood ? '<button type="button" class="link small" data-edit-food>برای ثبت با گرم، بنویس هر واحد چند گرم است</button>' : ''}`;
    const input = box.querySelector('.qty-val input');
    box.querySelectorAll('[data-step]').forEach(x => x.onclick = () => {
      const d = Number(x.dataset.step);
      if (inGrams) g = Math.max(5, Math.round((g + d * (g >= 100 ? 25 : 10)) / 5) * 5);
      else qty = Math.max(0.25, qty + d * 0.5);
      input.value = inGrams ? fa(g) : fa(qty, 2);
      paint();
    });
    box.querySelectorAll('[data-q]').forEach(x => x.onclick = () => {
      if (inGrams) g = Number(x.dataset.q); else qty = Number(x.dataset.q);
      input.value = inGrams ? fa(g) : fa(qty, 2);
      paint();
    });
    input.addEventListener('input', () => {
      const n = parseNum(input.value);
      if (!(n > 0)) return;
      if (inGrams) g = n; else qty = n;
      paint();
    });
    box.querySelector('[data-mode]')?.addEventListener('click', e => {
      const x = e.target.closest('button[data-v]');
      if (!x || (x.dataset.v === 'g') === inGrams) return;
      const gr = Number(base().grams);
      if (x.dataset.v === 'g') { g = Math.max(5, Math.round(qty * gr / 5) * 5); inGrams = true; }
      else { qty = Math.max(0.25, Math.round(g / gr * 4) / 4); inGrams = false; }
      draw();
    });
    box.querySelector('[data-edit-food]')?.addEventListener('click', onEditFood);
    paint();
  }

  function get() {
    const b = base();
    const per = inGrams ? 1 / (b.unit === GRAM ? 1 : Number(b.grams)) : 1;
    const n = inGrams ? g : qty;
    return { unit: inGrams ? GRAM : b.unit, qty: n, kcal: b.kcal * per * n, protein: b.protein * per * n };
  }

  function paint() {
    const b = base();
    const a = get();
    const sub = box.querySelector('[data-sub]');
    sub.textContent = inGrams ? 'گرم'
      : `${b.unit}${Number(b.grams) > 0 ? ` · حدود ${fa(Math.round(qty * b.grams))} گرم` : ''}`;
    box.querySelector('.preview').innerHTML = `<b>${fa(Math.round(a.kcal))}</b> کالری · <b>${fa(r1(a.protein), 1)}</b> گرم پروتئین`;
    box.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', Number(c.dataset.q) === (inGrams ? g : qty)));
  }

  draw();
  return { get, refresh: draw, repaint: paint };
}
