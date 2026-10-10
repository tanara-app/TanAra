// Loads every test file, runs them, and reports: on the page in a browser, on the console
// (with a failing exit code) in Node.
import { run } from './harness.js';
import './targets.test.js';
import './energy.test.js';
import './phase.test.js';
import './stats.test.js';
import './safety.test.js';
import './plan.test.js';
import './photo.test.js';

const results = await run();
const failed = results.filter(r => !r.ok);
const summary = `${results.length - failed.length} of ${results.length} passed`;

if (typeof document !== 'undefined') {
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  document.title = `${failed.length ? '✗' : '✓'} ${summary}`;
  document.body.innerHTML = `<h1 id="summary" data-failed="${failed.length}">${failed.length ? '✗' : '✓'} ${summary}</h1><ul>${results.map(r =>
    `<li class="${r.ok ? 'ok' : 'bad'}">${r.ok ? '✓' : '✗'} ${esc(r.name)}${r.ok ? '' : `<pre>${esc(r.error)}</pre>`}</li>`).join('')}</ul>`;
} else {
  for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n    ${r.error}`}`);
  console.log(summary);
  if (failed.length) globalThis.process?.exit(1);
}
