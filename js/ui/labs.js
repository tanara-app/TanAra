/*
  «آزمایش خون» (a tile in «بیشتر», beta `labs`; LABS.md): the member adds a lab sheet as a PDF,
  Hooshvareh reads it twice and js/domain/labs.js checks the numbers, so the confirm sheet shows
  only what is doubtful (both reads, the reason) and folds the rest under one line. The tests are
  tiles by group, each with its newest value and the change since the time before; a tile opens
  the test's trend with the healthy range as a band. The original PDFs are behind the folder icon,
  to download or delete. The numbers can point to a condition the profile does not have: one card
  offers to add it.
*/
import * as store from '../data/store.js';
import { sheet, icon, toast, confirmBox } from './dom.js';
import { fa, esc } from '../lib/fa.js';
import { today, faDMY, faDM, faShort } from '../lib/dates.js';
import { ask } from '../ai/hooshvareh.js';
import { GROUPS, TESTS, TEXT_FA, mergeReads, toSaved, sheetsOf, latest, series, rangeOf, status, suggestions, parseValue } from '../domain/labs.js';
import { CONDITIONS } from '../domain/targets.js';
import { recalcTargets } from './profile.js';

const MAX_PDF = 5 * 1024 * 1024;
const FOLDER = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
const UPLOAD = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4M7 9l5-5 5 5M5 20h14"/></svg>';
const DOWN = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>';
const DOC = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4" stroke-linecap="round"/></svg>';
const ARROW = up => `<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="${up ? 'M6 2l4 6H2z' : 'M6 10l4-6H2z'}" fill="currentColor"/></svg>`;
const CHEV = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
// the tile in «بیشتر»: a test tube and a drop of blood
export const LAB_ICON = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="20" y="6" width="18" height="6" rx="2.5" fill="#f7efe2"/><path d="M22.5 12h13v36a6.5 6.5 0 0 1-13 0z" fill="#f7efe2"/><path d="M22.5 30h13v18a6.5 6.5 0 0 1-13 0z" fill="#c9363a"/><path d="M47 30c0 0-7.5 8-7.5 12.5a7.5 7.5 0 0 0 15 0C54.5 38 47 30 47 30z" fill="#c9363a"/><circle cx="44.5" cy="42" r="1.8" fill="#fff" opacity=".6"/></svg>';

const closeBtn = '<button class="icon-btn" data-close aria-label="بستن">' + icon.close + '</button>';
const sexOf = () => store.profile()?.sex;
// up to the test's decimals, or 2 (a lab prints 88.32 or 0.95; whole numbers stay whole)
const dec = k => TESTS[k]?.dec ?? 2;
// a value as shown: Persian digits, the test's decimals, «<» kept, a qualitative word in Persian
export function shown(k, x) {
  if (!x) return '';
  if (x.v != null) return `${x.q === '<' ? '<' : x.q === '>' ? '>' : ''}${fa(x.v, dec(k, x.v))}`;
  return esc(TEXT_FA[x.t] || x.t || '');
}
const unitOf = (k, u) => esc(TESTS[k] && !TESTS[k].text ? TESTS[k].u : u || '');
function rangeText(r) {
  const [lo, hi] = r;
  if (lo != null && hi != null) return `${fa(lo, 2)} تا ${fa(hi, 2)}`;
  if (lo != null) return `بالای ${fa(lo, 2)}`;
  if (hi != null) return `زیر ${fa(hi, 2)}`;
  return '';
}
const sheets = () => sheetsOf(store.get().ai_notes);

const open = new Set(); // groups whose in-range minor tests are shown
let suggestionCard = null;

export function openLabs() {
  sheet.open(body => {
    const draw = () => {
      const list = latest(sheets(), sexOf());
      body.innerHTML = `
        <div class="sheet-head"><button class="icon-btn" data-files aria-label="برگه‌ها">${FOLDER}</button><h2>آزمایش خون</h2>${closeBtn}</div>
        <button class="btn primary block" data-add>${UPLOAD}افزودن برگه‌ی آزمایش (PDF)</button>
        ${suggest(list)}
        ${GROUPS.map(([g, name]) => group(g, name, list.filter(l => l.g === g))).join('')}`;
      body.querySelector('[data-close]').onclick = () => sheet.close();
      body.querySelector('[data-files]').onclick = () => openFiles(draw);
      body.querySelector('[data-add]').onclick = () => pickPdf(draw);
      body.querySelectorAll('[data-test]').forEach(b => b.onclick = () => openTest(b.dataset.test));
      body.querySelectorAll('[data-more]').forEach(b => b.onclick = () => { open.add(b.dataset.more); draw(); });
      body.querySelector('[data-cond-yes]')?.addEventListener('click', () => {
        const p = store.profile();
        store.saveProfile({ ...p, conditions: [...new Set([...(p.conditions || []), suggestionCard.cond])] });
        recalcTargets();
        toast('به بیماری‌هایت اضافه شد');
        draw();
      });
      body.querySelector('[data-cond-no]')?.addEventListener('click', () => {
        const p = store.profile();
        store.saveProfile({ ...p, labNo: { ...(p.labNo || {}), [suggestionCard.cond]: sheets()[0]?.key } });
        draw();
      });
    };
    draw();
  }, { tall: true });
}

// One condition at a time; «نه» is remembered until a newer sheet.
function suggest(list) {
  const p = store.profile();
  const newest = sheets()[0]?.key;
  const s = suggestions(list, p).find(x => p?.labNo?.[x.cond] !== newest);
  suggestionCard = s || null;
  if (!s) return '';
  const names = s.keys.map(k => TESTS[k].fa);
  const label = CONDITIONS[s.cond].replace(/\s*\(.*\)$/, '');
  return `<div class="lb-ask"><p>${esc(names.join(' و '))} بیرون از محدوده${names.length > 1 ? '‌اند' : ' است'}. «${esc(label)}» را به بیماری‌هایت اضافه کنم؟</p>
    <div class="acts"><button class="btn sm primary" data-cond-yes>اضافه کن</button><button class="btn sm" data-cond-no>نه</button></div></div>`;
}

// The group's main tests, and any out of range, as tiles; the rest behind «n آزمایش دیگر».
function group(g, name, items) {
  if (!items.length) return '';
  const showAll = open.has(g) || g === 'other';
  const shownItems = items.filter(l => showAll || TESTS[l.k]?.main || (l.status && l.status !== 'ok'));
  const hidden = items.length - shownItems.length;
  return `<div class="lb-sec">${name}</div>
    <div class="lb-grid">${shownItems.map(tile).join('')}</div>
    ${hidden ? `<button class="lb-more" data-more="${g}">${fa(hidden)} آزمایش دیگر ${CHEV}</button>` : ''}`;
}

function tile(l) {
  const off = l.status === 'high' || l.status === 'low';
  let d = '';
  if (l.before) {
    if (l.last.v != null && l.before.v != null) {
      const diff = Math.round((l.last.v - l.before.v) * 10 ** dec(l.k, l.last.v)) / 10 ** dec(l.k, l.last.v);
      d = diff === 0 ? 'بدون تغییر' : `${ARROW(diff > 0)} ${fa(Math.abs(diff), dec(l.k, l.last.v))}`;
    } else d = `قبلاً ${shown(l.k, l.before)}`;
  }
  return `<button class="lb-tile${off ? ' off' : ''}" data-test="${esc(l.id)}">
    <span class="t">${esc(l.name)}</span>
    <span class="v"><b>${shown(l.k, l.last)}</b><small>${unitOf(l.k, l.u)}</small></span>
    <span class="d">${d || faDM(l.last.day)}</span>
  </button>`;
}

/* ---------- one test over time ---------- */

function openTest(id) {
  const all = sheets();
  const item = latest(all, sexOf()).find(l => l.id === id);
  if (!item) return;
  const pts = series(all, id);
  const last = item.last;
  const range = rangeOf(item.k, sexOf(), last.row.lo != null || last.row.hi != null ? [last.row.lo, last.row.hi] : null);
  const off = item.status === 'high' || item.status === 'low';
  sheet.open(body => {
    body.innerHTML = `
      <div class="sheet-head"><span></span><h2>${esc(item.name)}</h2>${closeBtn}</div>
      <div class="lb-big${off ? ' off' : ''}"><div class="num"><b>${shown(item.k, last)}</b><small>${unitOf(item.k, item.u)}</small></div>
        ${range && rangeText(range.r) ? `<div>محدوده‌ی سالم: ${rangeText(range.r)}</div>` : ''}</div>
      ${pts.filter(p => p.v != null).length >= 2 ? `<div class="lb-chart">${chart(item.k, pts.filter(p => p.v != null), range?.r)}</div>` : ''}
      <div class="lb-list">${pts.slice().reverse().map(p => {
        const s = all.find(x => x.key === p.sheet);
        const pOff = ['high', 'low'].includes(status({ ...p.row, v: p.v, t: p.t }, sexOf()));
        return `<div class="lb-hrow"><div><b>${faDMY(p.day)}</b><span>${p.prev ? `از برگه‌ی ${faDMY(s.day)}` : esc(s?.lab || '')}</span></div>
          <span class="lb-val${pOff ? ' off' : ''}"><b>${shown(item.k, p)}</b></span>
          ${!p.prev && s?.file ? `<button class="icon-btn" data-dl="${esc(s.key)}" aria-label="دانلود برگه">${DOWN}</button>` : '<span></span>'}</div>`;
      }).join('')}</div>`;
    body.querySelector('[data-close]').onclick = () => sheet.close();
    body.querySelectorAll('[data-dl]').forEach(b => b.onclick = () => download(all.find(x => x.key === b.dataset.dl)));
  }, { tall: true });
}

// Time runs left → right as in the weight chart; the healthy range is a band, a point out of it amber.
function chart(k, pts, r) {
  const W = 340, H = 170, L = 38, R = 18, T = 14, B = 26, IN = 14;
  const vals = pts.map(p => p.v);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  // the band's edges are in view too, so a value below a «above 40» range shows how far it is
  if (r) for (const b of r) if (b != null) { lo = Math.min(lo, b); hi = Math.max(hi, b); }
  const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.1 || 1;
  lo -= pad; hi += pad;
  const t0 = Date.parse(pts[0].day), t1 = Date.parse(pts[pts.length - 1].day), span = t1 - t0 || 1;
  const x = d => L + IN + (Date.parse(d) - t0) / span * (W - L - R - 2 * IN);
  const y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  const band = r ? (() => { const top = y(r[1] ?? hi), bot = y(r[0] ?? lo); return `<rect x="${L}" y="${top}" width="${W - L - R}" height="${Math.max(0, bot - top)}" rx="4" class="lb-band"/>`; })() : '';
  // labels where they mean something: the band's edges, the lowest and the highest value
  const marks = [];
  for (const v of [...(r || []), Math.min(...vals), Math.max(...vals)]) {
    if (v != null && v >= lo && v <= hi && marks.every(m => Math.abs(y(m) - y(v)) >= 14)) marks.push(v);
  }
  const ticks = marks.map(v => `<text x="${L - 8}" y="${y(v) + 4}" class="ax" text-anchor="end">${fa(v, dec(k))}</text>`).join('');
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const offAt = p => ['high', 'low'].includes(status({ ...p.row, v: p.v, t: p.t }, sexOf()));
  const labels = (pts.length > 2 ? [pts[0], pts[pts.length - 1]] : pts).map(p => `<text x="${x(p.day)}" y="${H - 6}" class="ax" text-anchor="middle">${faDM(p.day)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" dir="ltr" role="img" aria-label="روند">${band}${ticks}<path d="${line}" class="lb-line"/>${pts.map(p => `<circle cx="${x(p.day)}" cy="${y(p.v)}" r="5" class="lb-dot${offAt(p) ? ' off' : ''}"/>`).join('')}${labels}</svg>`;
}

/* ---------- the sheets themselves ---------- */

function openFiles(redraw) {
  sheet.open(body => {
    const draw = () => {
      const all = sheets();
      body.innerHTML = `<div class="sheet-head"><span></span><h2>برگه‌ها</h2>${closeBtn}</div>
        ${all.length ? `<div class="lb-list">${all.map(s => `<div class="lb-file"><i class="lb-doc">${DOC}</i>
          <div><b>${faDMY(s.day)}</b><span>${esc([s.lab, `${fa(s.rows.length)} آزمایش`].filter(Boolean).join('، '))}</span></div>
          ${s.file ? `<button class="icon-btn" data-dl="${esc(s.key)}" aria-label="دانلود">${DOWN}</button>` : '<span></span>'}
          <button class="icon-btn" data-del="${esc(s.key)}" aria-label="پاک کردن">${icon.trash}</button></div>`).join('')}</div>` : '<p class="muted center">هنوز برگه‌ای نیست.</p>'}`;
      body.querySelector('[data-close]').onclick = () => sheet.close();
      body.querySelectorAll('[data-dl]').forEach(b => b.onclick = () => download(all.find(x => x.key === b.dataset.dl)));
      body.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
        if (!await confirmBox('این برگه و عددهایش پاک شود؟', 'پاک کن')) return;
        store.deleteLabSheet(b.dataset.del);
        draw(); redraw();
      });
    };
    draw();
  });
}

async function download(s) {
  if (!s?.file) return;
  const name = `آزمایش-${s.day}.pdf`;
  try {
    const url = await store.labFileUrl(s.file, name);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  } catch { toast('دانلود نشد؛ اینترنت را بررسی کن.'); }
}

/* ---------- adding a sheet ---------- */

function pickPdf(redraw) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/pdf,.pdf';
  input.onchange = () => {
    const f = input.files?.[0];
    if (!f) return;
    if (f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) return toast('این فایل PDF نیست.');
    if (f.size > MAX_PDF) return toast('فایل بزرگ‌تر از ۵ مگابایت است.');
    readSheet(f, redraw);
  };
  input.click();
}

const toBase64 = file => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = () => reject(new Error('فایل خوانده نشد.'));
  r.readAsDataURL(file);
});

async function readSheet(file, redraw) {
  let gone = false;
  const ctx = sheet.open(body => {
    body.innerHTML = `<div class="sheet-head"><span></span><h2>آزمایش خون</h2>${closeBtn}</div>
      <p class="muted small ai-wait"><span class="typing"><i></i><i></i><i></i></span> هوشواره دارد برگه را می‌خواند…</p>`;
    body.querySelector('[data-close]').onclick = () => sheet.close();
  }, { onClose: () => { gone = true; } });
  let merged = null, error = null;
  try {
    const pdf = await toBase64(file);
    if (!pdf.startsWith('JVBER')) throw new Error('این فایل PDF نیست.');
    const res = await ask('lab', { pdf });
    merged = mergeReads(res?.reads, { today: today() });
    if (!merged) throw new Error('در این فایل آزمایشی پیدا نشد.');
  } catch (e) { error = e.message || 'برگه خوانده نشد؛ دوباره امتحان کن.'; }
  if (gone) return;
  if (error) {
    ctx.body.querySelector('.ai-wait').outerHTML = `<p class="center">${esc(error)}</p>`;
    return;
  }
  sheet.close();
  showConfirm(merged, file, redraw);
}

// For tests and screenshots: the confirm sheet for reads given by hand.
export function confirmReads(reads, file = null) {
  const merged = mergeReads(reads, { today: today() });
  if (merged) showConfirm(merged, file, () => {});
  return merged;
}

/*
  What came out of the sheet. Doubtful rows first, each with why and the values to pick from (the
  first read, the second, or one typed in); every other row folded under one line, still there to
  look at and untick. «ثبت» saves the ticked rows and, with a connection, the PDF.
*/
function showConfirm(merged, file, redraw) {
  const rows = merged.rows.map((r, i) => ({ ...r, i, keep: true, pick: 0 }));
  let foldOpen = false, editing = null, saving = false;
  const p = store.profile();
  const other = merged.person?.sex && p?.sex && merged.person.sex !== p.sex;
  const label = r => TESTS[r.k]?.fa || r.n;
  const cands = r => [r, ...(r.alts || [])];
  const chosen = r => (r.typed ? r.typed : cands(r)[r.pick]);
  // the PDF itself, to look at while deciding
  const pdfUrl = file ? URL.createObjectURL(file) : null;
  sheet.open(body => {
    const draw = () => {
      const bad = rows.filter(r => !r.ok), good = rows.filter(r => r.ok);
      const n = rows.filter(r => r.keep).length;
      body.innerHTML = `
        <div class="sheet-head">${pdfUrl ? `<a class="icon-btn" href="${pdfUrl}" target="_blank" rel="noopener" aria-label="دیدن برگه">${DOC}</a>` : '<span></span>'}<h2>برگه‌ی ${merged.day ? faDMY(merged.day) : ''}</h2>${closeBtn}</div>
        <div class="lb-meta">${esc([merged.lab, merged.person?.name, merged.person?.age ? `${fa(merged.person.age)} ساله` : ''].filter(Boolean).join('، '))}</div>
        ${other ? '<p class="lb-warn">این برگه مال خودت است؟</p>' : ''}
        ${merged.dayAlt ? `<div class="lb-fix"><div class="lb-fix-h"><b>تاریخ برگه</b><span class="lb-why">دو بار خواندن فرق داشت</span></div>
          <div class="lb-chips">${[merged.day, merged.dayAlt].map(d => `<button class="chip${merged.day === d ? ' on' : ''}" data-day="${d}">${faDMY(d)}</button>`).join('')}</div></div>` : ''}
        ${bad.length ? `<div class="lb-sec">${fa(bad.length)} مورد را نگاه کن</div>${bad.map(fixRow).join('')}` : ''}
        ${good.length ? `<button class="lb-fold${foldOpen ? ' open' : ''}" data-fold>${icon.check}<span>${fa(good.length)} مورد خوانده و چک شد</span>${CHEV}</button>
          ${foldOpen ? `<div class="lb-list">${good.map(okRow).join('')}</div>` : ''}` : ''}
        <div class="lb-foot"><button class="btn primary block big" data-save ${n && !saving ? '' : 'disabled'}>${saving ? 'در حال ثبت…' : `ثبت ${fa(n)} آزمایش`}</button></div>`;
      bind();
    };
    const fixRow = r => {
      const c = cands(r);
      const prevOf = x => (x.p != null || x.pt != null ? shown(r.k, { v: x.p, q: x.pq, t: x.pt }) : '');
      const diffPrev = c.length > 1 && prevOf(c[0]) !== prevOf(c[1]);
      return `<div class="lb-fix${r.keep ? '' : ' dropped'}" data-row="${r.i}">
        <div class="lb-fix-h"><b>${esc(label(r))}</b><span class="lb-why">${esc(r.why)}</span></div>
        ${editing === r.i ? `<div class="lb-chips"><input class="lb-input" inputmode="decimal" enterkeyhint="done" value="${shown(r.k, chosen(r)).replace(/<|>/g, '')}" aria-label="عدد درست"><span class="muted small">${unitOf(r.k, r.u)}</span><button class="chip on" data-typed>${icon.check}</button></div>`
        : `<div class="lb-chips">${c.map((x, j) => `<button class="chip${r.keep && !r.typed && r.pick === j ? ' on' : ''}" data-pick="${j}">${shown(r.k, x)}${diffPrev ? `<small> · قبلی ${prevOf(x) || '-'}</small>` : ''}</button>`).join('')}
            ${r.typed ? `<button class="chip on">${shown(r.k, r.typed)}</button>` : ''}
            <button class="chip" data-edit aria-label="عدد دیگر">${icon.edit}</button>
            <button class="chip${r.keep ? '' : ' on'}" data-drop aria-label="ثبت نکن">${icon.trash}</button>
            <span class="muted small">${unitOf(r.k, r.u)}</span></div>`}
      </div>`;
    };
    const okRow = r => `<button class="lb-crow${r.keep ? '' : ' dropped'}" data-tog="${r.i}"><i class="lb-chk${r.keep ? '' : ' no'}">${r.keep ? icon.check : ''}</i>
      <span class="n">${esc(label(r))}${r.p != null || r.pt != null ? `<span class="p">${merged.prevDay ? faDM(merged.prevDay) : 'قبلی'}: ${shown(r.k, { v: r.p, q: r.pq, t: r.pt })}</span>` : ''}</span>
      <span class="lb-val${['high', 'low'].includes(status(r, p?.sex)) ? ' off' : ''}"><b>${shown(r.k, r)}</b><small>${unitOf(r.k, r.u)}</small></span></button>`;
    const bind = () => {
      body.querySelector('[data-close]').onclick = () => sheet.close();
      body.querySelector('[data-fold]')?.addEventListener('click', () => { foldOpen = !foldOpen; draw(); });
      body.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { merged.day = b.dataset.day; draw(); });
      body.querySelectorAll('[data-tog]').forEach(b => b.onclick = () => { const r = rows[b.dataset.tog]; r.keep = !r.keep; draw(); });
      body.querySelectorAll('[data-row]').forEach(el => {
        const r = rows[el.dataset.row];
        el.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { r.pick = Number(b.dataset.pick); r.typed = null; r.keep = true; draw(); });
        el.querySelector('[data-drop]')?.addEventListener('click', () => { r.keep = !r.keep; draw(); });
        el.querySelector('[data-edit]')?.addEventListener('click', () => { editing = r.i; draw(); body.querySelector('.lb-input')?.focus(); });
        const input = el.querySelector('.lb-input');
        const done = () => {
          const val = parseValue(input.value);
          editing = null;
          if (val) {
            const t = TESTS[r.k];
            r.typed = val.n != null && !t?.text ? { ...chosen(r), v: val.n, q: val.q, t: undefined } : { ...chosen(r), v: undefined, t: val.t ?? String(val.n) };
            r.keep = true;
          }
          draw();
        };
        if (input) { el.querySelector('[data-typed]').onclick = done; input.onkeydown = e => { if (e.key === 'Enter') done(); }; }
      });
      body.querySelector('[data-save]')?.addEventListener('click', save);
    };
    const save = async () => {
      saving = true; draw();
      const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      // a number typed by hand is in the unit shown, which is the app's own
      const keep = rows.filter(r => r.keep).map(r => ({ ...chosen(r), k: r.k, n: r.n, u: r.u }));
      const data = toSaved(merged, keep);
      try {
        if (file) data.file = await store.uploadLabPdf(id, file);
      } catch (e) { saving = false; draw(); return toast(e.message); }
      store.saveNote({ key: `lab:${id}`, kind: 'lab', data });
      sheet.close();
      toast('برگه ثبت شد');
      redraw();
    };
    draw();
  }, { tall: true, onClose: () => { if (pdfUrl) setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000); } });
}
