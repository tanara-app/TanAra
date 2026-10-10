/*
  Store: the single place the UI reads and writes data.

  - State lives in memory and is cached in localStorage, so the app opens instantly and
    logging never waits on the network.
  - Every write is applied locally first, then queued for the remote adapter (Supabase).
    The queue survives reloads and is flushed in order whenever we're online.
  - A pull from the remote replaces local state, but only once the queue is empty, so
    unsent changes are never overwritten.
  - The remote is an adapter with fetchAll / upsert / remove / replaceAll. Cross-device sync
    or an AI layer later plugs in here without touching the UI.
*/
import { SEED_FOODS, UNIT_GRAMS, GRAM } from './seedFoods.js';
import { parseNum } from '../lib/fa.js';

export const TABLES = ['profile', 'foods', 'entries', 'weights', 'waists', 'reviews', 'motivations', 'chat', 'ai_notes', 'vault'];
export const KEY = { profile: 'user_id', foods: 'id', entries: 'id', weights: 'day', waists: 'day', reviews: 'week_start', motivations: 'id', chat: 'id', ai_notes: 'key', vault: 'id' };

const empty = () => ({ profile: null, foods: [], entries: [], weights: [], waists: [], reviews: [], motivations: [], chat: [], ai_notes: [], vault: [] });

let ns = 'local';
let remote = null;
let state = empty();
let queue = [];
let flushing = false;
let flushTimer = null;
const listeners = new Set();
export let syncStatus = { pending: 0, error: null, lastPull: null };

const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  }));
const now = () => new Date().toISOString();

function lsGet(k, fallback) {
  try { const v = localStorage.getItem(`tanara:${ns}:${k}`); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function lsSet(k, v) {
  try { localStorage.setItem(`tanara:${ns}:${k}`, JSON.stringify(v)); } catch { /* quota or private mode */ }
}
function persist() {
  lsSet('state', state);
  lsSet('queue', queue);
  syncStatus = { ...syncStatus, pending: queue.length };
}
function emit() { listeners.forEach(fn => fn()); }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function init(namespace, remoteAdapter) {
  ns = namespace;
  remote = remoteAdapter;
  state = { ...empty(), ...lsGet('state', {}) };
  queue = lsGet('queue', []);
  urlCache = null;
  syncStatus = { pending: queue.length, error: null, lastPull: null };
  fillFoodGrams();
}

export function clearLocal() {
  try {
    Object.keys(localStorage).filter(k => k.startsWith(`tanara:${ns}:`)).forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
  state = empty(); queue = []; urlCache = null;
  forgetVaultFiles();
  try { caches.delete(VAULT_CACHE); } catch { /* no Cache API */ }
}

/* ---------------- reads ---------------- */
export const get = () => state;
export const profile = () => state.profile?.data || null;

/* ---------------- sync ---------------- */
function enqueue(op) {
  if (!remote) return;
  queue.push(op);
  persist();
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => flush(), 250);
}

// Postgres errors (constraint, bad input) won't succeed on retry; network errors will.
// 42501 (permission) usually means the session lapsed, so it's retried after sign-in rather than dropped.
const isPermanent = err => /^[0-9A-Z]{5}$/.test(err?.code || '') && !/^(08|42501)/.test(err.code);

export async function flush() {
  if (!remote || flushing || !queue.length) return true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  flushing = true;
  try {
    while (queue.length) {
      const op = queue[0];
      let res;
      try {
        if (op.op === 'upsert') res = await remote.upsert(op.table, op.row);
        else if (op.op === 'delete') res = await remote.remove(op.table, op.key);
        else if (op.op === 'clear') res = await remote.clear(op.table);
        else if (op.op === 'deleteWhere') res = await remote.removeWhere(op.table, op.col, op.val);
        else if (op.op === 'replaceAll') res = await remote.replaceAll(op.data);
      } catch (e) { res = { error: { message: String(e) } }; }
      if (res?.error) {
        if (isPermanent(res.error)) {
          console.warn('dropping op', op, res.error);
          syncStatus.error = 'یکی از تغییرها روی سرور ذخیره نشد.';
          queue.shift(); persist();
          continue;
        }
        syncStatus.error = 'فعلاً به سرور وصل نیست؛ تغییرها روی گوشی نگه داشته می‌شوند.';
        persist(); emit();
        return false;
      }
      queue.shift(); persist();
    }
    syncStatus.error = null;
    return true;
  } finally {
    flushing = false;
    emit();
  }
}

export async function pull() {
  if (!remote) return;
  const ok = await flush();
  if (!ok || queue.length) return;
  const res = await remote.fetchAll();
  if (res.error) { syncStatus.error = 'دریافت داده از سرور انجام نشد.'; emit(); return; }
  if (queue.length) return; // a write slipped in while fetching — keep local, pull later
  state = { ...empty(), ...res.data };
  syncStatus.lastPull = now();
  syncStatus.error = null;
  persist();
  emit();
  fillFoodGrams();
}

/* ---------------- writes ---------------- */
function put(table, row) {
  const k = KEY[table];
  const list = state[table];
  const i = list.findIndex(r => r[k] === row[k]);
  if (i >= 0) list[i] = row; else list.push(row);
}
function drop(table, key) {
  const k = KEY[table];
  state[table] = state[table].filter(r => r[k] !== key);
}
function commit(op) { persist(); emit(); enqueue(op); }

export function saveProfile(data) {
  const row = { data, updated_at: now() };
  state.profile = row;
  commit({ op: 'upsert', table: 'profile', row });
}

export function upsertFood(food) {
  const row = {
    id: food.id || uid(),
    name: food.name.trim(),
    category: food.category || 'other',
    unit: (food.unit || 'پرس').trim(),
    grams: Number(food.grams) > 0 ? Number(food.grams) : null,
    kcal: Number(food.kcal) || 0,
    protein: Number(food.protein) || 0,
    is_veg: !!food.is_veg,
    created_at: food.created_at || now(),
    updated_at: now(),
  };
  put('foods', row);
  commit({ op: 'upsert', table: 'foods', row });
  return row;
}

export function deleteFood(id) {
  drop('foods', id);
  // past entries keep their own name and numbers; only the link goes (server does the same)
  state.entries.forEach(e => { if (e.food_id === id) e.food_id = null; });
  commit({ op: 'delete', table: 'foods', key: id });
}

// Foods are added in batches so the seed doesn't produce 100 separate requests.
export function addFoods(list) {
  const rows = list.map(f => ({
    id: uid(), name: f.name, category: f.category, unit: f.unit, grams: f.grams ?? null,
    kcal: f.kcal, protein: f.protein, is_veg: !!f.is_veg, created_at: now(), updated_at: now(),
  }));
  rows.forEach(r => state.foods.push(r));
  persist(); emit();
  if (remote) { queue.push({ op: 'upsert', table: 'foods', row: rows }); persist(); flush(); }
  return rows;
}

/*
  Foods saved before units had a weight get one: seeded foods take it from the seed (if the
  unit wasn't changed), a unit typed as «۱۰۰ گرم» becomes a per-gram food, and common
  units get their typical weight. Anything else stays unknown until the person sets it.
*/
function fillFoodGrams() {
  const seed = new Map(SEED_FOODS.map(f => [f.name, f]));
  const rows = [];
  for (const f of state.foods) {
    if (Number(f.grams) > 0) continue;
    let patch = null;
    const sd = seed.get(f.name);
    const m = String(f.unit || '').match(/^([\d۰-۹٫.,]+)\s*گرم$/);
    if (sd && sd.unit === f.unit) patch = { grams: sd.grams };
    else if (m && parseNum(m[1]) > 0) {
      const n = parseNum(m[1]);
      patch = { unit: GRAM, grams: 1, kcal: f.kcal / n, protein: f.protein / n };
    } else if (UNIT_GRAMS[f.unit]) patch = { grams: UNIT_GRAMS[f.unit] };
    if (!patch) continue;
    Object.assign(f, patch, { updated_at: now() });
    rows.push(f);
  }
  if (!rows.length) return;
  persist(); emit();
  if (remote) { queue.push({ op: 'upsert', table: 'foods', row: rows.map(r => ({ ...r })) }); persist(); flush(); }
}

export function seedFoods() {
  return addFoods(SEED_FOODS);
}

export function restoreDefaultFoods() {
  const have = new Set(state.foods.map(f => f.name));
  const missing = SEED_FOODS.filter(f => !have.has(f.name));
  if (missing.length) addFoods(missing);
  return missing.length;
}

export function saveEntry(e) {
  const row = {
    id: e.id || uid(),
    day: e.day,
    meal: e.meal,
    food_id: e.food_id || null,
    name: e.name,
    unit: e.unit || '',
    qty: Number(e.qty) || 1,
    kcal: Math.max(0, Math.round(Number(e.kcal) || 0)),
    protein: Math.max(0, Math.round((Number(e.protein) || 0) * 10) / 10),
    is_veg: !!e.is_veg,
    created_at: e.created_at || now(),
  };
  put('entries', row);
  commit({ op: 'upsert', table: 'entries', row });
  return row;
}

export function deleteEntry(id) {
  drop('entries', id);
  commit({ op: 'delete', table: 'entries', key: id });
}

export function setWeight(day, kg) {
  const existing = state.weights.find(w => w.day === day);
  const row = { id: existing?.id || uid(), day, kg: Math.round(Number(kg) * 10) / 10, created_at: existing?.created_at || now() };
  put('weights', row);
  commit({ op: 'upsert', table: 'weights', row });
}

export function deleteWeight(day) {
  drop('weights', day);
  commit({ op: 'delete', table: 'weights', key: day });
}

// Waist in cm, at most one per day (see waistSeries in stats.js).
export function setWaist(day, cm) {
  const existing = state.waists.find(w => w.day === day);
  const row = { id: existing?.id || uid(), day, cm: Math.round(Number(cm) * 10) / 10, created_at: existing?.created_at || now() };
  put('waists', row);
  commit({ op: 'upsert', table: 'waists', row });
}

export function deleteWaist(day) {
  drop('waists', day);
  commit({ op: 'delete', table: 'waists', key: day });
}

export function saveReview(r) {
  const row = { week_start: r.week_start, good: r.good || '', hard: r.hard || '', next_goal: r.next_goal || '', updated_at: now() };
  put('reviews', row);
  commit({ op: 'upsert', table: 'reviews', row });
}

/*
  Motivations: things that keep you going — an upcoming event, an inspiring photo, a
  photo of yourself before, a sentence. Rows sync like everything else; photos go
  straight to the remote's storage (they're too big for the offline queue), so adding
  a photo needs a connection. Without a remote, the photo is kept inline as a data URL.
*/
export function saveMotivation(m) {
  const old = state.motivations.find(x => x.id === m.id);
  const row = {
    id: m.id || uid(),
    kind: m.kind,
    title: (m.title || '').trim(),
    note: (m.note || '').trim(),
    day: m.day || null,
    image_path: m.image_path || null,
    created_at: old?.created_at || now(),
    updated_at: now(),
  };
  put('motivations', row);
  commit({ op: 'upsert', table: 'motivations', row });
  if (old?.image_path && old.image_path !== row.image_path) removeImage(old.image_path);
  return row;
}

export function deleteMotivation(id) {
  const old = state.motivations.find(x => x.id === id);
  drop('motivations', id);
  commit({ op: 'delete', table: 'motivations', key: id });
  if (old?.image_path) removeImage(old.image_path);
}

// Resolves to a value for image_path, or throws with a message fit for the user.
export async function uploadImage(blob) {
  if (!remote) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('عکس خوانده نشد.'));
      r.readAsDataURL(blob);
    });
  }
  if (navigator.onLine === false) throw new Error('برای افزودن عکس به اینترنت وصل شوید.');
  const { path, error } = await remote.uploadImage(`${uid()}.jpg`, blob);
  if (error) throw new Error('عکس آپلود نشد. دوباره امتحان کنید.');
  return path;
}

function removeImage(path) {
  if (remote && !path.startsWith('data:')) remote.removeImage(path).catch(() => {});
}

// Signed URLs are cached (and persisted) so photos show instantly and the browser's
// HTTP cache keeps working across opens.
let urlCache = null;
const URL_TTL = 7 * 86400;
export function imageUrl(path) {
  if (!path) return null;
  if (path.startsWith('data:')) return path;
  urlCache ||= lsGet('imgurls', {});
  const hit = urlCache[path];
  return hit && hit.exp > Date.now() + 3600e3 ? hit.url : null;
}
export async function loadImageUrls(paths) {
  const need = paths.filter(p => p && !imageUrl(p));
  if (!need.length || !remote) return false;
  const res = await remote.imageUrls(need, URL_TTL).catch(() => null);
  if (!res?.length) return false;
  res.forEach(r => { if (r.url) urlCache[r.path] = { url: r.url, exp: Date.now() + URL_TTL * 1000 }; });
  lsSet('imgurls', urlCache);
  return true;
}

/*
  «صندوقچه»: private photos, videos and links behind a PIN (see ui/vault.js). Rows sync like
  everything else. Files go to their own private bucket and are downloaded once per device
  into the Cache API: a video then plays offline and doesn't use the monthly transfer again.
  Without a remote (?local) the files live only in that cache.
*/
export const VAULT_MAX_FILE = 30 * 1024 * 1024; // the bucket's limit
export const VAULT_QUOTA = 1024 ** 3;           // total storage on the free plan
const VAULT_CACHE = 'tanara-vault';
const vaultKey = path => `/__vault/${encodeURIComponent(path)}`;
const vaultUrls = new Map(); // path → object URL, for as long as the vault is unlocked

export const vaultUsed = () => state.vault.reduce((s, v) => s + (Number(v.size) || 0), 0);

async function cacheVaultFile(path, blob) {
  try { await (await caches.open(VAULT_CACHE)).put(vaultKey(path), new Response(blob, { headers: { 'Content-Type': blob.type } })); } catch { /* no Cache API, or the device is full */ }
}

// Resolves to the file's path, or throws with a message fit for the user.
export async function uploadVaultFile(blob, ext) {
  const name = `${uid()}.${ext}`;
  let path = `local/${name}`;
  if (remote) {
    if (navigator.onLine === false) throw new Error('برای افزودن به صندوقچه به اینترنت وصل شوید.');
    const res = await remote.uploadVault(name, blob).catch(e => ({ error: e }));
    if (res.error) throw new Error(/exceed|too large|413/i.test(String(res.error.message || res.error.statusCode)) ? 'حجم این فایل بیشتر از حد مجاز است.' : 'آپلود نشد. اینترنت را بررسی کنید و دوباره امتحان کنید.');
    path = res.path;
  }
  await cacheVaultFile(path, blob);
  vaultUrls.set(path, URL.createObjectURL(blob));
  return path;
}

// An object URL for a vault file: from memory, this device's cache, or the server (once).
export async function vaultFileUrl(path) {
  if (vaultUrls.has(path)) return vaultUrls.get(path);
  let blob = null;
  try { blob = await (await (await caches.open(VAULT_CACHE)).match(vaultKey(path)))?.blob() || null; } catch { /* no Cache API */ }
  if (!blob) {
    if (!remote || path.startsWith('local/')) throw new Error('این فایل روی این دستگاه نیست.');
    const res = await remote.downloadVault(path).catch(e => ({ error: e }));
    if (res.error || !res.data) throw new Error('دریافت نشد. اینترنت را بررسی کنید.');
    blob = res.data;
    cacheVaultFile(path, blob);
  }
  if (!vaultUrls.has(path)) vaultUrls.set(path, URL.createObjectURL(blob));
  return vaultUrls.get(path);
}

export const vaultUrlCached = path => vaultUrls.get(path) || null;

// Called when the vault locks: nothing decoded stays reachable in the page.
export function forgetVaultFiles() {
  vaultUrls.forEach(u => URL.revokeObjectURL(u));
  vaultUrls.clear();
}

export function saveVaultItem(v) {
  const row = {
    id: uid(), kind: v.kind, path: v.path || null, thumb_path: v.thumb_path || null,
    url: v.url || null, title: (v.title || '').trim(), size: v.size || 0, created_at: now(),
  };
  put('vault', row);
  commit({ op: 'upsert', table: 'vault', row });
  return row;
}

export function deleteVaultItem(id) {
  const old = state.vault.find(x => x.id === id);
  if (!old) return;
  drop('vault', id);
  commit({ op: 'delete', table: 'vault', key: id });
  const paths = [old.path, old.thumb_path].filter(Boolean);
  paths.forEach(p => { const u = vaultUrls.get(p); if (u) URL.revokeObjectURL(u); vaultUrls.delete(p); });
  try { caches.open(VAULT_CACHE).then(c => paths.forEach(p => c.delete(vaultKey(p)))).catch(() => {}); } catch { /* no Cache API */ }
  const stored = paths.filter(p => !p.startsWith('local/'));
  if (remote && stored.length) remote.removeVault(stored).catch(() => {});
}

/*
  Hooshvareh (the AI): chat history and the notes it writes elsewhere (today's tip, week
  analysis, ...). Both sync like everything else; the AI itself never writes — the app does.
*/
export function saveChat(m) {
  const old = state.chat.find(x => x.id === m.id);
  const row = {
    id: m.id || uid(),
    thread: m.thread ?? old?.thread ?? null,
    role: m.role,
    content: m.content || '',
    actions: m.actions || [],
    created_at: old?.created_at || m.created_at || now(),
  };
  put('chat', row);
  commit({ op: 'upsert', table: 'chat', row });
  return row;
}

export function clearChat() {
  state.chat = [];
  persist(); emit();
  enqueue({ op: 'clear', table: 'chat' });
}

// Deletes one conversation. thread null is the conversation from before threads existed.
export function deleteThread(thread) {
  state.chat = state.chat.filter(m => (m.thread ?? null) !== thread);
  persist(); emit();
  enqueue({ op: 'deleteWhere', table: 'chat', col: 'thread', val: thread });
}

export const note = key => state.ai_notes.find(n => n.key === key) || null;

export function saveNote(n) {
  const row = { key: n.key, kind: n.kind, text: n.text || '', data: n.data || {}, created_at: now() };
  put('ai_notes', row);
  commit({ op: 'upsert', table: 'ai_notes', row });
  return row;
}

/* ---------------- export / import ---------------- */
export function exportData() {
  const strip = r => { const { user_id, ...rest } = r; return rest; };
  return {
    app: 'tanara',
    version: 1,
    exported_at: now(),
    data: {
      profile: state.profile ? strip(state.profile) : null,
      foods: state.foods.map(strip),
      entries: state.entries.map(strip),
      weights: state.weights.map(strip),
      waists: state.waists.map(strip),
      reviews: state.reviews.map(strip),
      motivations: state.motivations.map(strip),
      chat: state.chat.map(strip),
      ai_notes: state.ai_notes.map(strip),
    },
  };
}

export function validateImport(obj) {
  if (!obj || obj.app !== 'tanara' || !obj.data) return 'این فایل خروجی تن‌آرا نیست.';
  for (const t of ['foods', 'entries', 'weights', 'reviews']) {
    if (!Array.isArray(obj.data[t])) return 'فایل ناقص است.';
  }
  return null;
}

export function importData(obj) {
  const d = obj.data;
  const foodIds = new Set(d.foods.map(f => f.id));
  const data = {
    profile: d.profile || null,
    foods: d.foods,
    entries: d.entries.map(e => ({ ...e, food_id: foodIds.has(e.food_id) ? e.food_id : null })),
    weights: d.weights,
    waists: Array.isArray(d.waists) ? d.waists : [], // files from before waist was tracked have none
    reviews: d.reviews,
    motivations: Array.isArray(d.motivations) ? d.motivations : [],
    chat: Array.isArray(d.chat) ? d.chat : [],
    ai_notes: Array.isArray(d.ai_notes) ? d.ai_notes : [],
  };
  // the vault isn't part of an export (its files can't be), so it stays as it is
  state = { ...structuredClone(data), vault: state.vault };
  // a full replace supersedes anything still waiting to be sent
  queue = [];
  persist(); emit();
  if (remote) { queue.push({ op: 'replaceAll', data }); persist(); flush(); }
}

/* ---------------- this device's push subscription, and the AI's token use ---------------- */
// Neither is part of the synced state: a subscription belongs to one browser, and the usage
// rows are written by the Edge Function and only read here when the person asks.
export const canPush = () => !!remote;
export const savePush = sub => (remote ? remote.savePush(sub) : Promise.resolve({ error: { message: 'local' } }));
export const removePush = endpoint => (remote ? remote.removePush(endpoint) : Promise.resolve({}));
// Rows of ai_usage since an ISO time, or null when they can't be read.
export async function aiUsage(since) {
  if (!remote) return null;
  const res = await remote.usage(since).catch(() => null);
  return res && !res.error ? res.data : null;
}
