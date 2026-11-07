// Downloads the photos of feedback reports so a Claude can look at them (FEEDBACK.md).
//   node tools/feedback-photos.mjs <out dir> <path> [<path> ...]
// The paths are the `images` of rows in public.feedback. The key comes from the git-ignored
// .claude/private/feedback-admin-key; the files land in <out dir> (use the scratchpad, never the repo).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [out, ...paths] = process.argv.slice(2);
if (!out || !paths.length) { console.error('usage: node tools/feedback-photos.mjs <out dir> <path>...'); process.exit(1); }
const key = readFileSync(join(root, '.claude/private/feedback-admin-key'), 'utf8').trim();
const url = readFileSync(join(root, 'js/config.js'), 'utf8').match(/SUPABASE_URL = '([^']+)'/)[1];

const res = await fetch(`${url}/functions/v1/feedback`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-key': key }, body: JSON.stringify({ paths }),
});
if (!res.ok) { console.error(res.status, await res.text()); process.exit(1); }
mkdirSync(out, { recursive: true });
for (const { path, url: signed } of (await res.json()).urls) {
  if (!signed) { console.log(`missing  ${path}`); continue; }
  const file = join(out, path.split('/').slice(1).join('-'));
  writeFileSync(file, Buffer.from(await (await fetch(signed)).arrayBuffer()));
  console.log(file);
}
