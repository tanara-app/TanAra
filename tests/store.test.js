import { suite, test, eq, ok } from './harness.js';
import * as store from '../js/data/store.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const DAY = '2026-11-28';

/*
  A server that answers fetchAll with what it held when the call came in, `slow` ms later (as a
  slow connection does), and takes writes at once. Ten foods of its own, so the store adds no
  starter foods of its own while the test runs.
*/
function fakeServer(slow) {
  const db = {
    profile: [{ data: { onboarded: true, goal: 1 }, updated_at: '2026-11-27T10:00:00Z' }],
    foods: Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, name: `test food ${i}`, unit: 'عدد', grams: 50, kcal: 100, protein: 1 })),
    entries: [{ id: 'old', day: DAY, meal: 'lunch', name: 'old', qty: 1, kcal: 100, protein: 0 }],
  };
  const copy = v => JSON.parse(JSON.stringify(v));
  const remote = {
    async fetchAll() {
      const s = copy(db);
      await sleep(slow);
      return { data: { profile: s.profile[0], foods: s.foods, entries: s.entries, weights: [], waists: [], activity: [], reviews: [], motivations: [], chat: [], ai_notes: [] } };
    },
    async upsert(table, row) {
      await sleep(1);
      if (table === 'profile') { db.profile = [copy(row)]; return {}; }
      const rows = [].concat(copy(row));
      db[table] = db[table].filter(r => !rows.some(x => x.id === r.id)).concat(rows);
      return {};
    },
    async remove(table, key) {
      await sleep(1);
      db[table] = db[table].filter(r => r.id !== key);
      return {};
    },
  };
  return { db, remote };
}

const names = list => list.map(e => e.name).sort();

suite('store', () => {
  test('what is done while a pull is on its way stays, on the screen and on the server (2026-11-28)', async () => {
    const { db, remote } = fakeServer(80);
    store.init('test-store', remote);
    try {
      await store.pull();
      eq(names(store.get().entries), ['old']);

      const pulling = store.pull(); // they come back to the app
      await sleep(10);
      db.entries.push({ id: 'other', day: DAY, meal: 'snack', name: 'other', qty: 1, kcal: 50, protein: 0 }); // from their other phone
      store.saveEntry({ day: DAY, meal: 'dinner', name: 'new', kcal: 500 }); // a meal logged at once
      store.deleteEntry('old');
      store.saveProfile({ ...store.profile(), goal: 2 });
      await store.flush(); // sent before the pull's answer arrives
      await pulling;

      eq(names(store.get().entries), ['new', 'other'], 'on the screen');
      eq(store.profile().goal, 2, 'the setting on the screen');
      eq(names(db.entries), ['new', 'other'], 'on the server');

      // a second, unrelated setting does not take the first one back
      store.saveProfile({ ...store.profile(), other: true });
      await store.flush();
      eq(db.profile[0].data.goal, 2, 'the first setting on the server');
      ok(db.profile[0].data.other, 'the second setting on the server');
    } finally {
      store.clearLocal();
    }
  });

  test('a pull with nothing done meanwhile brings the server copy', async () => {
    const { db, remote } = fakeServer(5);
    store.init('test-store', remote);
    try {
      await store.pull();
      db.entries.push({ id: 'other', day: DAY, meal: 'snack', name: 'other', qty: 1, kcal: 50, protein: 0 });
      db.profile[0].data.goal = 3;
      await store.pull();
      eq(names(store.get().entries), ['old', 'other']);
      eq(store.profile().goal, 3);
    } finally {
      store.clearLocal();
    }
  });
});
