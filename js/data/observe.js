// Once a day (per device), write down what the record shows (domain/signals.js). Runs after a
// pull, so it reads what is on the server; the upsert per (day, kind) keeps two devices from
// writing the same day twice.
import * as store from './store.js';
import { observe, SIGNALS_VERSION } from '../domain/signals.js';
import { adherence } from '../domain/plan.js';
import { today } from '../lib/dates.js';

export function recordSignals(day = today()) {
  const p = store.profile();
  if (!p?.onboarded || !store.canPush()) return;
  const k = store.localKey('signals');
  try { if (localStorage.getItem(k) === `${day}:${SIGNALS_VERSION}`) return; } catch { /* private mode */ }
  const s = store.get();
  let rows;
  try {
    rows = observe({
      p, entries: s.entries, weights: s.weights, waists: s.waists, activity: s.activity, notes: s.ai_notes, foods: s.foods,
      adherence: p.mode === 'plan' ? (from, to) => adherence(s.ai_notes, s.entries, from, to) : null,
    }, day);
  } catch (e) { console.warn('signals', e); return; } // never let this get in the way of the app
  store.saveSignals(day, rows, SIGNALS_VERSION);
  try { localStorage.setItem(k, `${day}:${SIGNALS_VERSION}`); } catch { /* ignore */ }
}
