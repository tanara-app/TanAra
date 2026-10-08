// Persian number formatting and input parsing.

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function faDigits(s) {
  return String(s).replace(/\d/g, d => FA_DIGITS[d]).replace(/\./g, '٫');
}

const nfCache = {};
export function fa(n, maxFrac = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const key = maxFrac;
  nfCache[key] ||= new Intl.NumberFormat('fa-IR', { maximumFractionDigits: maxFrac });
  // Intl gives "−" with a LRM in some engines; normalise to a plain minus.
  return nfCache[key].format(n).replace(/‎/g, '');
}

export function signed(n, maxFrac = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const r = Math.round(n * 10 ** maxFrac) / 10 ** maxFrac;
  if (r === 0) return fa(0);
  // isolate as LTR so the sign stays on the left of the number inside RTL text
  return `<bdi dir="ltr">${r > 0 ? '+' : '−'}${fa(Math.abs(r), maxFrac)}</bdi>`;
}

// Accepts Persian/Arabic digits and either decimal separator. Returns NaN when empty.
export function parseNum(s) {
  if (s === null || s === undefined) return NaN;
  const t = String(s).trim()
    .replace(/[۰-۹]/g, d => '0123456789'['۰۱۲۳۴۵۶۷۸۹'.indexOf(d)])
    .replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])
    .replace(/[٫/،,]/g, '.');
  if (t === '') return NaN;
  return Number(t);
}

export const round50 = x => Math.round(x / 50) * 50;
export const round5 = x => Math.round(x / 5) * 5;

// Calories are estimates; daily figures are shown to the nearest 50.
export const kcal50 = x => fa(round50(x));

export function qtyLabel(q) {
  const map = { 0.25: '¼', 0.5: '½' };
  return map[q] || fa(q, 2);
}

// Normalise for search: Arabic ي/ك → Persian, drop ZWNJ/spaces/diacritics.
export function norm(s) {
  return String(s || '')
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[ۀة]/g, 'ه').replace(/[أإآ]/g, 'ا')
    .replace(/[ً-ْ‌\s‌-]/g, '')
    .toLowerCase();
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
