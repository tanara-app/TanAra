/*
  Foods Hooshvareh read off a photo → entries ready to be logged. Pure functions.

  Same rule as the diet plan: when a food is in the bank, the model only says which food and
  how much; the calories and protein are computed here from the bank. Its own numbers are
  used only for foods the bank doesn't have.
*/
const GRAM = 'گرم';
const r1 = x => Math.round(x * 10) / 10;

export function photoItems(raw, foods) {
  const byId = new Map(foods.map(f => [f.id, f]));
  const out = [];
  for (const i of raw?.items || []) {
    const qty = Number(i?.qty);
    const name = String(i?.name || '').trim();
    if (!(qty > 0) || !name) continue;
    const f = i.food_id ? byId.get(i.food_id) : null;
    // per one of the unit the amount is given in, when the bank can say
    const per = f && i.unit === f.unit ? { kcal: f.kcal, protein: f.protein }
      : f && i.unit === GRAM && Number(f.grams) > 0 ? { kcal: f.kcal / f.grams, protein: f.protein / f.grams }
      : null;
    if (per) {
      out.push({ food_id: f.id, name: f.name, unit: i.unit, qty, kcal: Math.round(per.kcal * qty), protein: r1(per.protein * qty), is_veg: !!f.is_veg, bank: true });
      continue;
    }
    const kcal = Number(i.kcal);
    if (!(kcal >= 0 && kcal <= 10000) || qty > (i.unit === GRAM ? 5000 : 100)) continue;
    out.push({ food_id: null, name, unit: String(i.unit || 'پرس'), qty, kcal: Math.round(kcal), protein: r1(Math.max(0, Number(i.protein) || 0)), is_veg: !!i.is_veg, bank: false });
  }
  return out;
}
