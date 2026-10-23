// Remembers which gentle notices were dismissed on this device (a convenience, not data).
// Kept under the signed-in person's own prefix: the marks carry their dates (last weigh-in,
// start of maintenance, an event of theirs), and sign-out clears them with the rest.
import { localKey } from '../data/store.js';

try { localStorage.removeItem('tanara:dismissed'); } catch { /* the old, shared key */ }

const K = () => localKey('dismissed');
function read() {
  try { return JSON.parse(localStorage.getItem(K()) || '{}'); } catch { return {}; }
}
export const dismissed = (key, mark) => read()[key] === mark;
export function dismiss(key, mark) {
  const d = read();
  d[key] = mark;
  try { localStorage.setItem(K(), JSON.stringify(d)); } catch { /* ignore */ }
}
