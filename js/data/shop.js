/*
  «لیست خرید» of the whole family: one list, each item with who wants it (table family_shop,
  supabase/migrations/20261109_family_shop.sql). Items: { id, user_id, who, me, name, amount,
  food_id, done, at }.

  This device keeps a copy (so the list opens at once and works offline); changes show here
  straight away and go to the server through the store's offline queue. The copy is replaced
  by the server's list on refresh(), unless a change of this device is still waiting to be sent.
*/
import * as store from './store.js';

const TABLE = 'family_shop';
let items = null;
let itemsKey = null; // whose copy `items` is (another account may sign in on this device)
let reading = null;
const listeners = new Set();

const newId = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  }));
const uuid = v => (/^[0-9a-f-]{36}$/i.test(String(v || '')) ? v : null);

function load() {
  const k = store.localKey('shop');
  if (items && itemsKey === k) return items;
  itemsKey = k;
  try { items = JSON.parse(localStorage.getItem(k) || '[]'); } catch { items = []; }
  if (!Array.isArray(items)) items = [];
  return items;
}
function keep() {
  try { localStorage.setItem(store.localKey('shop'), JSON.stringify(items)); } catch { /* private mode */ }
  listeners.forEach(fn => fn());
}
// this member's name, as the family list last said it
const myName = () => load().find(i => i.me)?.who || 'من';

export const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const list = () => [...load()].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

// Re-reads the family's list from the server (after sending this device's waiting changes).
export function refresh() {
  if (!store.canPush()) return Promise.resolve();
  if (reading) return reading;
  reading = (async () => {
    await store.flush();
    if (store.pendingFor(TABLE)) return;
    const rows = await store.familyShop();
    if (!rows || store.pendingFor(TABLE)) return;
    load();
    items = rows;
    keep();
  })().finally(() => { reading = null; });
  return reading;
}

const send = op => { store.queueShared({ table: TABLE, ...op }); store.flush().then(() => refresh()); };

// A new item this member wants.
export function add({ name, amount = '', food_id = null, at = new Date().toISOString() }) {
  const row = { id: newId(), name, amount, food_id: uuid(food_id), done: false, at };
  load().push({ ...row, me: true, who: myName() });
  keep();
  send({ op: 'insert', row });
}

// Changes to an item already on the list (bought, a new amount).
export function change(id, patch) {
  const i = load().find(x => x.id === id);
  if (!i) return;
  Object.assign(i, patch);
  keep();
  send({ op: 'update', key: id, patch: { ...patch, updated_at: new Date().toISOString() } });
}

export function remove(id) {
  items = load().filter(x => x.id !== id);
  keep();
  send({ op: 'delete', key: id });
}
