import { suite, test, eq, ok } from './harness.js';
import { AVOID, SEED_TAGS, TAG_KEYS, avoidedTags, tagSig, tagsOf, untagged, avoidTest, cleanTags } from '../js/domain/health.js';
import { CONDITIONS, computeTargets, proteinFor } from '../js/domain/targets.js';
import { SEED_FOODS } from '../js/data/seedFoods.js';
import { optionAllowed, buildPlan, swapAllowed } from '../js/domain/plan.js';

const SEED = new Set(SEED_FOODS.map(f => f.name));
const f = (id, name, kcal = 100, extra = {}) => ({ id, name, unit: 'پرس', kcal, protein: 10, grams: 100, ...extra });

suite('health', () => {
  test('every condition the rules name can be ticked, and every tag is known', () => {
    for (const c of Object.keys(AVOID)) ok(CONDITIONS[c], c);
    for (const tags of [...Object.values(AVOID), ...Object.values(SEED_TAGS)]) for (const t of tags) ok(TAG_KEYS.includes(t), t);
  });

  test('seed tags are on real seed names', () => {
    for (const name of Object.keys(SEED_TAGS)) ok(SEED.has(name), name);
  });

  test('conditions keep out their tags; MS, constipation and eczema keep out nothing', () => {
    eq([...avoidedTags(['gout']).keys()], ['purine', 'sweetDrink']);
    eq(avoidedTags(['gout', 'diabetes']).get('sweetDrink'), ['gout', 'diabetes']);
    eq(avoidedTags(['ms', 'constipation', 'eczema']).size, 0);
  });

  test('an own food has the tags saved for it only while it is unchanged', () => {
    const liver = f('a', 'جگر گوسفندی', 200);
    const saved = { a: { s: tagSig(liver), t: ['purine'] } };
    eq(tagsOf(liver, saved, SEED), ['purine']);
    eq(tagsOf({ ...liver, kcal: 250 }, saved, SEED), null);
    eq(tagsOf(f('b', 'نوشابه'), {}, SEED), ['sweetDrink']);
    eq(tagsOf(f('c', 'سیب'), {}, SEED), []);
    eq(untagged([liver, f('d', 'کله‌پاچه')], saved, SEED).map(x => x.id), ['d']);
  });

  test('a recipe is asked again when what goes into it changes', () => {
    const food = f('r', 'آش من');
    const r1 = { items: [{ name: 'لوبیا', grams: 100 }] };
    const r2 = { items: [{ name: 'لوبیا', grams: 100 }, { name: 'سیرابی', grams: 200 }] };
    ok(tagSig(food, r1) !== tagSig(food, r2));
    eq(tagsOf(food, { r: { s: tagSig(food, r1), t: [] } }, SEED, () => r2), null);
  });

  test('the plan keeps an own high-purine food out with gout, not without it', () => {
    const foods = [f('kp', 'کله‌پاچه', 300), f('br', 'نان سنگک', 300)];
    const saved = { kp: { s: tagSig(foods[0]), t: ['purine', 'fatty'] } };
    const gout = avoidTest(['gout'], foods, saved, SEED);
    eq(gout('kp'), 'purine');
    eq(gout('br'), null);
    eq(avoidTest(['ms'], foods, saved, SEED), null);
    const o = { items: [{ food_id: 'kp' }, { food_id: 'br' }], protein: 10 };
    eq(optionAllowed(o, 'breakfast', 1, { avoid: gout }), false);
    eq(optionAllowed({ items: [{ food_id: 'br' }], protein: 5 }, 'breakfast', 1, { avoid: gout }), true);
    eq(optionAllowed(o, 'breakfast', 1, {}), true);
  });

  test('a food without tags yet passes (the model rules still apply)', () => {
    const foods = [f('x', 'غذای تازه')];
    eq(avoidTest(['gout'], foods, {}, SEED)('x'), null);
  });

  test('a built plan drops options and free foods with a kept-out food', () => {
    const foods = [f('kp', 'کله‌پاچه', 100), f('br', 'نان', 100), f('ch', 'پنیر', 100), f('tea', 'نوشابه', 2)];
    const saved = { kp: { s: tagSig(foods[0]), t: ['purine'] } };
    const avoid = avoidTest(['gout'], foods, saved, SEED);
    const slot = items => ({ pick: 1, options: items.map(i => ({ title: 't', items: [{ food_id: i, qty: 5 }] })) });
    const raw = { slots: { breakfast: slot(['kp', 'br', 'ch']), snack1: slot(['br', 'ch']), lunch: slot(['br', 'ch']), snack2: slot(['br', 'ch']), dinner: slot(['br', 'ch']) }, free: [{ food_id: 'tea' }] };
    const plan = buildPlan(raw, foods, 2500, '2026-11-08', { breakfast: 0.2, snack1: 0.2, lunch: 0.2, snack2: 0.2, dinner: 0.2 }, { avoid });
    ok(plan);
    eq(plan.slots.breakfast.options.map(o => o.items[0].food_id), ['br', 'ch']);
    eq(plan.free, []);
  });

  test('a swap to a kept-out food is refused', () => {
    const avoid = id => (id === 'kp' ? 'purine' : null);
    const plan = { kcal: 2000, slots: { breakfast: { pick: 1, options: [] } } };
    eq(swapAllowed({ items: [{ food_id: 'kp' }], protein: 5 }, 'breakfast', plan, { avoid }), false);
    eq(swapAllowed({ items: [{ food_id: 'br' }], protein: 5 }, 'breakfast', plan, { avoid }), true);
  });

  test('kidney stones keep the full protein target; only reduced function limits it', () => {
    const base = { sex: 'female', age: 50, heightCm: 160, weightKg: 75, activity: 'light' };
    eq(computeTargets({ ...base, conditions: ['stones', 'ms'] }).protein, proteinFor({ heightCm: 160 }));
    ok(computeTargets({ ...base, conditions: ['stones'] }).protein > computeTargets({ ...base, conditions: ['kidney'] }).protein);
    eq(computeTargets({ ...base, conditions: ['stones'] }).proteinMax, false);
  });

  test('model tags are kept only if known', () => {
    eq(cleanTags(['purine', 'x', 'purine', 'salty']), ['purine', 'salty']);
    eq(cleanTags(null), []);
  });
});
