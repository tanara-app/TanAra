// Foods and medical conditions. Pure functions — no DOM, no storage.

/*
  What a food is, for the conditions that change what goes into a diet plan. Every food can
  carry a few of these tags. The app's starter foods have theirs here (SEED_TAGS); a food the
  person adds or writes as a recipe gets its tags from Hooshvareh (mode `food_tags`), saved in
  the ai_note `food_tags` and asked again when the food's name, unit, calories or recipe
  change. So the rules hold for their own foods too, which matching names could never do.
*/
export const TAGS = {
  // organ meats (جگر، دل، قلوه، مغز، زبان، سیرابی، کله‌پاچه), anchovy/sardine, shellfish, meat extract
  purine: 'پورین بالا',
  // soda, any fruit juice (also fresh), sweetened drinks, شربت, sweet coffee mixes
  sweetDrink: 'نوشیدنی شیرین',
  // sweets, pastries, jam, honey, sugar itself, sweetened desserts and dishes cooked with sugar
  sugary: 'قند افزوده‌ی زیاد',
  // fried in oil, fatty or processed red meat, butter, cream, کله‌پاچه, cheesy fast food
  fatty: 'سرخ‌کردنی یا چربی حیوانی زیاد',
  // processed and very salty: pickles, sausage, chips and puffs, کشک, instant soups, salty fast food
  salty: 'نمک زیاد',
};
export const TAG_KEYS = Object.keys(TAGS);
// The same, as said of one food: «جگر پورین زیادی دارد».
export const TAG_SAYS = {
  purine: 'پورین زیادی دارد',
  sweetDrink: 'نوشیدنی شیرین است',
  sugary: 'قند افزوده‌ی زیادی دارد',
  fatty: 'سرخ‌کردنی است یا چربی حیوانی زیادی دارد',
  salty: 'نمک زیادی دارد',
};

/*
  The tags each condition keeps out of a diet plan (and its swaps and «هر وقت گرسنه شدی»).
  Only well-established advice; the rest of what a condition needs is in Hooshvareh's rules.
  - gout / high uric acid: high-purine foods and fructose drinks (ACR 2020, EULAR 2016);
  - diabetes and prediabetes: sweet drinks and sweets (ADA Standards of Care);
  - high cholesterol / triglycerides: saturated fat and fried food, and sugar, which raises
    triglycerides most (ESC/EAS 2019, AHA);
  - fatty liver (MASLD): sugar, sweet drinks, saturated fat (EASL 2024);
  - heart disease / narrowed arteries: saturated fat, fried and salty food (AHA 2021);
  - high blood pressure, kidney stones and reduced kidney function: salt (DASH, AUA 2014, KDIGO);
  - gallstones and reflux: fried and fatty meals, which bring on attacks and heartburn.
  MS, constipation and eczema keep no food out: no diet is proven for MS, and cutting foods for
  eczema without a confirmed allergy is advised against (AAD 2023).
*/
export const AVOID = {
  gout: ['purine', 'sweetDrink'],
  diabetes: ['sweetDrink', 'sugary'],
  prediabetes: ['sweetDrink', 'sugary'],
  lipids: ['fatty', 'sweetDrink', 'sugary'],
  liver: ['fatty', 'sweetDrink', 'sugary'],
  heart: ['fatty', 'salty'],
  bp: ['salty'],
  kidney: ['salty'],
  stones: ['salty'],
  gallstone: ['fatty'],
  reflux: ['fatty'],
};

// The tags their conditions keep out, each with the conditions that ask for it.
export function avoidedTags(conditions = []) {
  const out = new Map();
  for (const c of conditions) for (const t of AVOID[c] || []) (out.get(t) || out.set(t, []).get(t)).push(c);
  return out;
}

// The starter foods' tags, by their exact seed name.
export const SEED_TAGS = {
  'ته‌دیگ': ['fatty'],
  'کوکو سبزی': ['fatty'],
  'کتلت': ['fatty'],
  'کباب کوبیده': ['fatty'],
  'مرغ سوخاری': ['fatty'],
  'ماهی سرخ‌شده': ['fatty'],
  'همبرگر خانگی': ['fatty'],
  'سوسیس': ['fatty', 'salty'],
  'خامه صبحانه': ['fatty'],
  'کره': ['fatty'],
  'عسل': ['sugary'],
  'مربا': ['sugary'],
  'حلیم (با شکر)': ['sugary'],
  'کشک': ['salty'],
  'چای با یک حبه قند': ['sugary'],
  'نوشابه': ['sweetDrink'],
  'آب‌میوه صنعتی': ['sweetDrink'],
  'آب‌پرتقال طبیعی': ['sweetDrink'],
  'قهوه فوری سه‌در‌یک': ['sweetDrink'],
  'ماءالشعیر': ['sweetDrink'],
  'شیرینی تر (خامه‌ای)': ['sugary', 'fatty'],
  'شیرینی خشک': ['sugary'],
  'بیسکویت ساده': ['sugary'],
  'شکلات شیری': ['sugary', 'fatty'],
  'چیپس (بسته کوچک)': ['fatty', 'salty'],
  'پفک (بسته کوچک)': ['fatty', 'salty'],
  'کیک یزدی': ['sugary'],
  'بستنی سنتی': ['sugary'],
  'زولبیا یا بامیه': ['sugary', 'fatty'],
  'قند': ['sugary'],
  'پیتزا': ['fatty', 'salty'],
  'سیب‌زمینی سرخ‌کرده': ['fatty'],
};

export const TAGS_KEY = 'food_tags';

// What a food's tags were judged on: when any of it changes, they are asked again.
export const tagSig = (food, recipe = null) =>
  [food.name, food.unit, Math.round(Number(food.kcal) || 0), ...(recipe?.items || []).map(i => `${i.name}:${Math.round(Number(i.grams) || 0)}`)].join('|');

/*
  A food's tags: the seed's for a starter food, else the saved ones while they still match the
  food (`saved`: the data of the `food_tags` note, { [food id]: { s: sig, t: [tags] } }).
  null: not known yet. `recipeOf(food)`: its recipe, if it is one.
*/
export function tagsOf(food, saved = {}, seedNames = new Set(), recipeOf = () => null) {
  if (!food) return null;
  if (seedNames.has(food.name)) return SEED_TAGS[food.name] || [];
  const s = saved?.[food.id];
  return s && s.s === tagSig(food, recipeOf(food)) ? s.t || [] : null;
}

// The foods whose tags are not known yet (only worth asking when a condition needs them).
export const untagged = (foods, saved, seedNames, recipeOf) =>
  foods.filter(f => tagsOf(f, saved, seedNames, recipeOf) === null);

/*
  The test the diet plan uses: food id → the first tag of it their conditions keep out, or
  null. A food whose tags aren't known yet passes (Hooshvareh's plan rules still apply to it).
  Returns null when their conditions keep nothing out.
*/
export function avoidTest(conditions, foods, saved, seedNames, recipeOf) {
  const bad = avoidedTags(conditions);
  if (!bad.size) return null;
  const byId = new Map(foods.map(f => [f.id, f]));
  return id => (tagsOf(byId.get(id), saved, seedNames, recipeOf) || []).find(t => bad.has(t)) || null;
}

// A tag a model answer gave, kept only if it is one of ours.
export const cleanTags = list => [...new Set((Array.isArray(list) ? list : []).filter(t => TAG_KEYS.includes(t)))];
