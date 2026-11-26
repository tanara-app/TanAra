/*
  «مصرف هوشواره»: what the AI has cost, from the token counts the Edge Function saves after
  every call (table ai_usage). The dollar figures are an estimate from the list prices below;
  the real bill is in the Anthropic console.
  Everyone sees their own usage. The app's owner (usage_members.admin in the database) also gets
  «همه‌ی اعضا»: every member's usage with their name, all billed to the owner's API key.
*/
import * as store from '../data/store.js';
import { fa, esc } from '../lib/fa.js';
import { sheet, icon } from './dom.js';
import { iso, jParts, fromJalali, J_MONTHS } from '../lib/dates.js';

// Claude Sonnet 5.5, US dollars per million tokens (cache write: the 5-minute rate), and per web search.
// Change these when the model or its prices change.
const PRICE = { input: 2, cache_read: 0.1, cache_write: 2.5, output: 10, search: 0.01 };
// modes that run on another model: «خواندن آزمایش» reads a lab PDF twice with Claude Opus 5.5
const MODE_PRICE = { lab: { input: 4, cache_read: 0.2, cache_write: 5, output: 20, search: 0 } };
const MODES = {
  chat: 'گفت‌وگو', magazine: 'مجله', plan: 'چیدن رژیم', plan_option: 'گزینه‌ی دیگر رژیم', plan_swap: 'جایگزین در رژیم', food_tags: 'برچسب سلامت غذاها', tip: 'نکته‌ی امروز',
  review: 'تحلیل هفته', progress: 'تحلیل روند', maintain: 'مرور ماهانه‌ی نگهداری', checkin: 'برگشت به مسیر', occasion: 'برنامه‌ی مناسبت', estimate: 'تخمین غذا', photo: 'عکس غذا', label: 'برچسب بسته', recipe: 'رسپی', shop: 'لیست خرید', quote: 'جمله‌ی انگیزشی', title: 'اسم گفت‌وگو', lab: 'خواندن آزمایش',
};
const cost = r => { const P = MODE_PRICE[r.mode] || PRICE; return (r.input * P.input + r.cache_read * P.cache_read + r.cache_write * P.cache_write + r.output * P.output) / 1e6 + r.searches * P.search; };
const usd = x => `${fa(x < 0.995 ? Math.round(x * 100) / 100 : Math.round(x * 10) / 10, 2)} دلار`;

/*
  Month by month (owner's idea, 2026-11-24; design 2 of three, 2026-11-27): this Jalali month on
  top (so far, and where it is heading), then every month, newest first, each opening to its kinds
  of work (or, in «همه‌ی اعضا», its members; this month's open again to their kinds of work).
  Every row is kept on the server, so old months stay here.
*/
const monthOf = at => { const j = jParts(iso(new Date(at))); return { key: j.y * 100 + j.m, y: j.y, m: j.m, d: j.d }; };
const monthName = (y, m) => `${J_MONTHS[m - 1]} ${fa(y, 0).replace(/٬/g, '')}`;
const monthDays = (y, m) => (m <= 6 ? 31 : m <= 11 ? 30 : fromJalali(y, 12, 30) ? 30 : 29);
function byMonth(rows) {
  const map = new Map();
  for (const r of rows) {
    const { key, y, m, d } = monthOf(r.at);
    const g = map.get(key) || { key, y, m, first: d, rows: [] };
    g.rows.push(r);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.key - a.key);
}

export function openUsage() {
  sheet.open(async body => {
    body.innerHTML = `
      <div class="sheet-head"><h2>مصرف هوشواره</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <div data-who></div>
      <div data-usage>${WAIT}</div>`;
    body.querySelector('[data-close]').onclick = () => sheet.close();
    const since = new Date(0).toISOString();
    const [mine, admin] = await Promise.all([store.aiUsage(since), store.isUsageAdmin()]);
    const box = body.querySelector('[data-usage]');
    if (!box) return;
    let all; // everyone's rows, read the first time the owner opens «همه‌ی اعضا»
    const show = async who => {
      if (who === 'all') {
        if (!all) { box.innerHTML = WAIT; all = await store.aiUsageAll(since); }
        if (!box.isConnected) return;
        box.innerHTML = months(all, true);
      } else box.innerHTML = months(mine, false);
    };
    if (admin) {
      const seg = body.querySelector('[data-who]');
      seg.innerHTML = '<div class="seg small usage-who"><button type="button" data-v="me" class="on">خودم</button><button type="button" data-v="all">همه‌ی اعضا</button></div>';
      seg.onclick = e => {
        const b = e.target.closest('button');
        if (!b || b.classList.contains('on')) return;
        seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
        show(b.dataset.v);
      };
    }
    show('me');
  }, { tall: true });
}

const WAIT = '<p class="muted small ai-wait"><span class="typing"><i></i><i></i><i></i></span> در حال خواندن…</p>';
const sum = list => list.reduce((s, r) => s + cost(r), 0);
const NOTE = 'عددها تخمینی‌اند (از روی تعداد توکن و قیمت رسمی مدل)؛ صورت‌حساب واقعی در کنسول Anthropic است. یادآورها هزینه‌ای ندارند.';

// This month so far, and where it is heading (in its first two days, last month instead).
function tiles(cur, prev) {
  const now = jParts(iso(new Date()));
  const rows = cur?.rows || [];
  const total = sum(rows);
  const name = J_MONTHS[now.m - 1];
  const second = now.d < 3 && prev
    ? `<div class="tile"><span>${J_MONTHS[prev.m - 1]}</span><b>${usd(sum(prev.rows))}</b><small>${fa(prev.rows.length)} درخواست</small></div>`
    : `<div class="tile"><span>آخر ${name} حدود</span><b>${usd(total / now.d * monthDays(now.y, now.m))}</b><small>با همین روند</small></div>`;
  return `
      <section class="tiles">
        <div class="tile"><span>${name} تا امروز</span><b>${usd(total)}</b><small>${fa(rows.length)} درخواست</small></div>
        ${second}
      </section>`;
}

// Cost per kind of work, biggest first, as rows with bars.
function modes(rows) {
  const total = sum(rows) || 1;
  const byMode = new Map();
  for (const r of rows) {
    const m = byMode.get(r.mode) || { n: 0, cost: 0 };
    m.n++; m.cost += cost(r);
    byMode.set(r.mode, m);
  }
  return `<div class="wlist usage-list">${[...byMode].sort((a, b) => b[1].cost - a[1].cost).map(([mode, m]) => `
        <div class="wrow"><span>${MODES[mode] || mode} <small class="muted">${fa(m.n)} بار · هر بار ${usd(m.cost / m.n)}</small></span><b>${usd(m.cost)}</b></div>
        <div class="bar usage-bar"><i style="width:${Math.max(2, Math.round(m.cost / total * 100))}%"></i></div>`).join('')}</div>`;
}

// Each member's cost in these rows, biggest first; open: each one opens to their kinds of work.
function members(rows, open) {
  const total = sum(rows) || 1;
  const byUser = new Map();
  for (const r of rows) {
    const u = byUser.get(r.user_id) || { name: r.name, rows: [] };
    u.rows.push(r);
    byUser.set(r.user_id, u);
  }
  const list = [...byUser.values()].map(u => ({ ...u, cost: sum(u.rows) })).sort((a, b) => b.cost - a.cost);
  const head = u => `
            <div class="wrow"><span>${esc(u.name)} <small class="muted">${fa(u.rows.length)} درخواست</small></span><b>${usd(u.cost)} <small class="muted">${fa(Math.round(u.cost / total * 100))}٪</small></b></div>
            <div class="bar usage-bar"><i style="width:${Math.max(2, Math.round(u.cost / total * 100))}%"></i></div>`;
  if (!open) return `<div class="wlist usage-list">${list.map(head).join('')}</div>`;
  return `<div class="usage-members">${list.map(u => `
        <details class="usage-member"><summary>${head(u)}</summary>${modes(u.rows)}</details>`).join('')}</div>`;
}

export function months(rows, everyone) { // exported for .claude/usage-check.html
  if (!rows) return `<div class="empty">${everyone ? 'مصرف اعضا' : 'مصرف'} خوانده نشد. اینترنت را بررسی کن.</div>`;
  if (!rows.length) return '<div class="empty">هنوز مصرفی ثبت نشده. از این به بعد هر بار که هوشواره کاری بکند، این‌جا حساب می‌شود.</div>';
  const now = jParts(iso(new Date()));
  const list = byMonth(rows);
  const cur = list[0].key === now.y * 100 + now.m ? list[0] : null;
  const first = list[list.length - 1];
  const top = Math.max(...list.map(g => sum(g.rows))) || 1;
  const input = rows.reduce((s, r) => s + r.input + r.cache_read + r.cache_write, 0);
  const cached = rows.reduce((s, r) => s + r.cache_read, 0);
  const when = g => (g === cur ? 'تا امروز · ' : g === first && g.first > 1 ? `از ${fa(g.first)} ${J_MONTHS[g.m - 1]} · ` : '');
  return `${tiles(cur, cur ? list[1] : list[0])}
      <h3 class="list-h">ماه به ماه</h3>
      <div class="usage-members">${list.map(g => `
        <details class="usage-member">
          <summary>
            <div class="wrow"><span>${monthName(g.y, g.m)} <small class="muted">${when(g)}${fa(g.rows.length)} درخواست</small></span><b>${usd(sum(g.rows))}</b></div>
            <div class="bar usage-bar"><i style="width:${Math.max(2, Math.round(sum(g.rows) / top * 100))}%"></i></div>
          </summary>
          ${everyone ? members(g.rows, g === cur) : modes(g.rows)}
        </details>`).join('')}</div>
      <p class="muted small">${everyone ? 'همه‌ی این مصرف از حساب API خودت پرداخت می‌شود. فقط تو این بخش را می‌بینی؛ هر عضو فقط مصرف خودش را می‌بیند. ' : input ? `${fa(Math.round(cached / input * 100))}٪ از ورودی‌ها از کش خوانده شده (ده برابر ارزان‌تر). ` : ''}${NOTE}</p>`;
}
