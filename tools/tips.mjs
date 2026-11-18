// Writes js/data/tips.js from TIPS.md, the list of daily tips («نکته‌ی امروز»).
// TIPS.md is the source: change a tip there, then run `node tools/tips.mjs`.
// `node tools/tips.mjs --check` only says whether js/data/tips.js is still in step with TIPS.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'TIPS.md');
const OUT = path.join(root, 'js/data/tips.js');

// TIPS.md's tag words → the short tags js/domain/tips.js reads.
const PLAIN = { 'همه': null, 'مراقبتی': 'care', 'کاهش': 'loss', 'بزرگسال': 'adult', 'نه کلیه': '!kidney' };
const ONLY = {
  'دیابت': 'cond:diabetes', 'قند مرزی': 'cond:prediabetes', 'چربی خون': 'cond:lipids', 'قلب': 'cond:heart',
  'فشار خون': 'cond:bp', 'کبد چرب': 'cond:liver', 'نقرس': 'cond:gout', 'سنگ کلیه': 'cond:stones', 'کلیه': 'cond:kidney',
  'سنگ صفرا': 'cond:gallstone', 'ریفلاکس': 'cond:reflux', 'یبوست': 'cond:constipation', 'ام‌اس': 'cond:ms', 'اگزما': 'cond:eczema',
  'داروی قند': 'med:glucose',
  'بارداری': 'stage:pregnant', 'شیردهی': 'stage:nursing', 'نوجوان': 'stage:teen', '۶۵+': 'stage:senior',
  'زنان': 'sex:female', 'نگهداری': 'phase:maintain',
  'رمضان': 'season:ramadan', 'نوروز': 'season:nowruz', 'یلدا': 'season:yalda', 'تابستان': 'season:summer', 'زمستان': 'season:winter',
};
const num = s => Number(String(s).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

export function parse(text) {
  const tips = [];
  let section = 0, cur = null;
  const done = () => {
    if (!cur) return;
    if (!cur.body || !cur.tagged) throw new Error(`tip ${cur.n}: no text or no tags`);
    tips.push({ n: cur.n, c: cur.c, t: cur.t, title: cur.title, body: cur.body });
    cur = null;
  };
  for (const line of text.split('\n')) {
    const sec = line.match(/^## ([۰-۹]+)\. /);
    if (sec) { done(); section = num(sec[1]); continue; }
    const head = line.match(/^### ([۰-۹]+)\. (.+)$/);
    if (head) { done(); cur = { n: num(head[1]), c: section, title: head[2].trim(), body: '', t: [], tagged: false }; continue; }
    if (!cur) continue;
    if (line.startsWith('- برچسب: ')) {
      for (const w of line.slice('- برچسب: '.length).split('، ').map(s => s.trim())) {
        if (w in PLAIN) { if (PLAIN[w]) cur.t.push(PLAIN[w]); continue; }
        const only = w.startsWith('فقط ') && ONLY[w.slice(4)];
        if (!only) throw new Error(`tip ${cur.n}: unknown tag «${w}»`);
        cur.t.push(only);
      }
      cur.tagged = true;
    } else if (!line.startsWith('- ') && line.trim() && !cur.tagged) {
      cur.body += (cur.body ? '\n' : '') + line.trim();
    }
  }
  done();
  tips.forEach((t, i) => { if (t.n !== i + 1) throw new Error(`tip ${t.n} is in place ${i + 1}`); });
  return tips;
}

export function render(tips) {
  const q = s => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  return `// Generated from TIPS.md by tools/tips.mjs: change TIPS.md, then run \`node tools/tips.mjs\`.
// n: the tip's number in TIPS.md; c: its section there; t: who sees it (js/domain/tips.js reads these).
export const TIPS = [
${tips.map(x => `  { n: ${x.n}, c: ${x.c}, t: [${x.t.map(q).join(', ')}], title: ${q(x.title)}, body: ${q(x.body)} },`).join('\n')}
];
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = render(parse(fs.readFileSync(SRC, 'utf8')));
  if (process.argv.includes('--check')) {
    const same = fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8') === out;
    console.log(same ? 'js/data/tips.js is in step with TIPS.md' : 'js/data/tips.js is out of date: run node tools/tips.mjs');
    process.exit(same ? 0 : 1);
  }
  fs.writeFileSync(OUT, out);
  console.log(`wrote ${path.relative(root, OUT)}`);
}
