// A tiny test harness: no build step and no dependencies, like the app itself.
// Runs in the browser (open tests/ on the site or a local server) and in Node (node tests/run.js).
const cases = [];
let group = '';

export function suite(name, fn) { group = name; fn(); group = ''; }
export function test(name, fn) { cases.push({ name: group ? `${group} › ${name}` : name, fn }); }

const show = v => (v instanceof Set ? JSON.stringify([...v]) : JSON.stringify(v));
export function eq(actual, expected, msg = '') {
  if (show(actual) !== show(expected)) throw new Error(`${msg ? msg + ': ' : ''}expected ${show(expected)}, got ${show(actual)}`);
}
export function ok(value, msg = 'expected a truthy value') { if (!value) throw new Error(msg); }
export function near(actual, expected, tol = 1e-6, msg = '') {
  if (!(Math.abs(actual - expected) <= tol)) throw new Error(`${msg ? msg + ': ' : ''}expected ${expected} ±${tol}, got ${actual}`);
}

export async function run() {
  const results = [];
  for (const c of cases) {
    try { await c.fn(); results.push({ name: c.name, ok: true }); }
    catch (e) { results.push({ name: c.name, ok: false, error: e?.message || String(e) }); }
  }
  return results;
}
