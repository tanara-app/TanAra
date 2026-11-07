/*
  Health tags of the foods in the bank (see js/domain/health.js). Starter foods carry theirs;
  for the person's own foods and recipes Hooshvareh is asked (mode `food_tags`), only when a
  condition of theirs needs tags and only for foods not tagged yet (or changed since). The
  answers live in the ai_note `food_tags`, so they sync between devices.
*/
import * as store from '../data/store.js';
import { SEED_FOODS } from '../data/seedFoods.js';
import { TAGS_KEY, tagSig, tagsOf, untagged, avoidTest, avoidedTags, cleanTags } from '../domain/health.js';
import { ask, aiOnline } from './hooshvareh.js';

const SEED_NAMES = new Set(SEED_FOODS.map(f => f.name));
const BATCH = 40;
const RETRY_MS = 10 * 60 * 1000; // after a failed request, not again for a while
let failedAt = 0;

const saved = () => store.note(TAGS_KEY)?.data || {};
const recipeOf = food => store.get().ai_notes.find(n => n.kind === 'recipe' && n.data?.food_id === food.id)?.data || null;
const conditions = () => store.profile()?.conditions || [];

export const foodTags = food => tagsOf(food, saved(), SEED_NAMES, recipeOf);

// food id → the tag their conditions keep out, or null; null when nothing is kept out.
export const planAvoid = () => avoidTest(conditions(), store.get().foods, saved(), SEED_NAMES, recipeOf);

// Their own foods not tagged yet: asked of Hooshvareh in batches. Quiet when offline or it fails
// (those foods then pass, and the plan rules for the model still apply to them).
// Resolves to the number of foods tagged.
export async function ensureTags() {
  if (!avoidedTags(conditions()).size || !aiOnline() || Date.now() - failedAt < RETRY_MS) return 0;
  let done = 0;
  const todo = untagged(store.get().foods, saved(), SEED_NAMES, recipeOf);
  for (let i = 0; i < todo.length; i += BATCH) {
    const part = todo.slice(i, i + BATCH);
    let res;
    try {
      res = await ask('food_tags', {
        foods: part.map((f, n) => {
          const r = recipeOf(f);
          return { n, name: f.name, unit: f.unit, grams: f.grams, kcal: f.kcal, protein: f.protein, ...(r ? { ingredients: r.items.map(x => `${x.name} ${Math.round(x.grams)} g`) } : {}) };
        }),
      });
    } catch { failedAt = Date.now(); return done; }
    const next = { ...saved() };
    const got = new Map((res?.foods || []).map(a => [Number(a.n), cleanTags(a.tags)]));
    // a food left out of the answer counts as having none of the tags, so it isn't asked forever
    part.forEach((f, n) => { next[f.id] = { s: tagSig(f, recipeOf(f)), t: got.get(n) || [] }; done++; });
    // foods no longer in the bank go
    const ids = new Set(store.get().foods.map(f => f.id));
    for (const id of Object.keys(next)) if (!ids.has(id)) delete next[id];
    store.saveNote({ key: TAGS_KEY, kind: 'tags', text: '', data: next });
  }
  return done;
}
