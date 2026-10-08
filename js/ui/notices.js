// Remembers which gentle notices were dismissed on this device (a convenience, not data).

const K = 'tanara:dismissed';
function read() {
  try { return JSON.parse(localStorage.getItem(K) || '{}'); } catch { return {}; }
}
export const dismissed = (key, mark) => read()[key] === mark;
export function dismiss(key, mark) {
  const d = read();
  d[key] = mark;
  try { localStorage.setItem(K, JSON.stringify(d)); } catch { /* ignore */ }
}
