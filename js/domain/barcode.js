/*
  Packaged foods by barcode. A product's label gives kcal and protein per ۱۰۰ گرم (or ml);
  the bank keeps a small pack (up to 300 g, a snack or a drink can) as one «بسته» of its
  weight, and anything bigger as a weighed food (unit «گرم», per-gram values).
  The numbers come from Open Food Facts, or from Hooshvareh reading a photo of the label.
*/
import { GRAM } from '../data/seedFoods.js';

const PACK = 'بسته';
const SMALL_PACK = 300;

// EAN-13, EAN-8, UPC-A or GTIN-14 with a correct check digit. Misreads almost never pass this.
export function validBarcode(code) {
  const s = String(code ?? '');
  if (!/^(\d{8}|\d{12,14})$/.test(s)) return false;
  const d = [...s].map(Number);
  const check = d.pop();
  const sum = d.reverse().reduce((t, x, i) => t + x * (i % 2 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === check;
}

const num = v => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : NaN;
};

// Per-100 g label values → the bank's fields, or null when the numbers can't be right.
export function labelFood({ name = '', kcal100, protein100 = 0, packG = 0, category = 'other', is_veg = false }) {
  const k = num(kcal100), p = num(protein100) || 0, g = num(packG);
  if (!(k >= 0 && k <= 900) || !(p >= 0 && p <= 100)) return null;
  const base = { name: String(name).trim(), category, is_veg: !!is_veg, kcal100: Math.round(k), protein100: Math.round(p * 10) / 10 };
  if (g > 0 && g <= SMALL_PACK) return { ...base, unit: PACK, grams: g, kcal: k * g / 100, protein: p * g / 100 };
  return { ...base, unit: GRAM, grams: 1, kcal: k / 100, protein: p / 100 };
}

// Open Food Facts categories → the bank's (first match wins, so the specific ones come first).
const CATS = [
  [/nuts|seeds|dried-fruits|dates/, 'nuts'],
  [/beverages|drinks|juices|waters|sodas/, 'drink'],
  [/dairies|dairy|yogurts|milks|cheeses|doogh/, 'dairy'],
  [/biscuits|chocolates|candies|confectioner|sweet|cakes|chips|crisps|snacks/, 'sweet'],
  [/breakfast|cereals|spreads|jams|honeys/, 'breakfast'],
  [/breads|pastas|rices|grains/, 'grain'],
  [/legumes|beans|lentils|soups/, 'legume'],
  [/meats|poultr|fish|tuna|sausages|eggs/, 'protein'],
  [/fruits/, 'fruit'],
  [/vegetables|salads|pickles/, 'veg'],
];

// An Open Food Facts product (the `product` of /api/v2/product/<code>) → labelFood(), or null.
export function offFood(p) {
  if (!p) return null;
  const n = p.nutriments || {};
  const kj = num(n['energy-kj_100g'] ?? n.energy_100g);
  const kcal100 = Number.isFinite(num(n['energy-kcal_100g'])) ? num(n['energy-kcal_100g']) : kj / 4.184;
  if (!Number.isFinite(kcal100)) return null;
  const brand = String(p.brands || '').split(',')[0].trim();
  const title = String(p.product_name_fa || p.product_name || p.generic_name || '').trim();
  const name = title && brand && !title.includes(brand) ? `${title} ${brand}` : title || brand;
  const tags = (p.categories_tags || []).join(' ');
  const category = CATS.find(([re]) => re.test(tags))?.[1] || 'other';
  return labelFood({ name, kcal100, protein100: n.proteins_100g, packG: p.product_quantity, category, is_veg: category === 'veg' });
}
