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

// Claude Sonnet 5.5, US dollars per million tokens (cache write: the 5-minute rate), and per web search.
// Change these when the model or its prices change.
const PRICE = { input: 2, cache_read: 0.2, cache_write: 2.5, output: 10, search: 0.01 };
const MODES = {
  chat: 'گفت‌وگو', magazine: 'مجله', plan: 'چیدن رژیم', plan_option: 'گزینه‌ی دیگر رژیم', plan_swap: 'جایگزین در رژیم', food_tags: 'برچسب سلامت غذاها', tip: 'نکته‌ی امروز',
  review: 'تحلیل هفته', progress: 'تحلیل روند', maintain: 'مرور ماهانه‌ی نگهداری', checkin: 'برگشت به مسیر', occasion: 'برنامه‌ی مناسبت', estimate: 'تخمین غذا', photo: 'عکس غذا', label: 'برچسب بسته', recipe: 'رسپی', shop: 'لیست خرید', quote: 'جمله‌ی انگیزشی', title: 'اسم گفت‌وگو',
};
const DAYS = 30;

const cost = r => (r.input * PRICE.input + r.cache_read * PRICE.cache_read + r.cache_write * PRICE.cache_write + r.output * PRICE.output) / 1e6 + r.searches * PRICE.search;
const usd = x => `${fa(x < 0.995 ? Math.round(x * 100) / 100 : Math.round(x * 10) / 10, 2)} دلار`;

export function openUsage() {
  sheet.open(async body => {
    body.innerHTML = `
      <div class="sheet-head"><h2>مصرف هوشواره</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <div data-who></div>
      <div data-usage>${WAIT}</div>`;
    body.querySelector('[data-close]').onclick = () => sheet.close();
    const since = new Date(Date.now() - DAYS * 864e5).toISOString();
    const [mine, admin] = await Promise.all([store.aiUsage(since), store.isUsageAdmin()]);
    const box = body.querySelector('[data-usage]');
    if (!box) return;
    let all; // everyone's rows, read the first time the owner opens «همه‌ی اعضا»
    const show = async who => {
      if (who === 'all') {
        if (!all) { box.innerHTML = WAIT; all = await store.aiUsageAll(since); }
        if (!box.isConnected) return;
        box.innerHTML = everyone(all);
      } else box.innerHTML = own(mine);
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
const week = () => Date.now() - 7 * 864e5;
const spanOf = rows => Math.max(1, Math.min(DAYS, Math.ceil((Date.now() - new Date(rows[0].at)) / 864e5)));
const NOTE = 'عددها تخمینی‌اند (از روی تعداد توکن و قیمت رسمی مدل)؛ صورت‌حساب واقعی در کنسول Anthropic است. یادآورها هزینه‌ای ندارند.';

function tiles(rows) {
  const total = sum(rows), span = spanOf(rows);
  return `
      <section class="tiles">
        <div class="tile"><span>${fa(span)} روز اخیر</span><b>${usd(total)}</b><small>${fa(rows.length)} درخواست</small></div>
        <div class="tile"><span>۷ روز اخیر</span><b>${usd(sum(rows.filter(r => new Date(r.at) >= week())))}</b><small>با این روند، ماهی حدود ${usd(total / span * 30)}</small></div>
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

function own(rows) {
  if (!rows) return '<div class="empty">مصرف خوانده نشد. اینترنت را بررسی کن.</div>';
  if (!rows.length) return '<div class="empty">هنوز مصرفی ثبت نشده. از این به بعد هر بار که هوشواره کاری بکند، این‌جا حساب می‌شود.</div>';
  const input = rows.reduce((s, r) => s + r.input + r.cache_read + r.cache_write, 0);
  const cached = rows.reduce((s, r) => s + r.cache_read, 0);
  return `${tiles(rows)}
      <h3 class="list-h">به تفکیک کار</h3>
      ${modes(rows)}
      <p class="muted small">${input ? `${fa(Math.round(cached / input * 100))}٪ از ورودی‌ها از کش خوانده شده (ده برابر ارزان‌تر). ` : ''}${NOTE}</p>`;
}

// The owner's view: the whole family's total, then each member (tap to see their kinds of work).
function everyone(rows) {
  if (!rows) return '<div class="empty">مصرف اعضا خوانده نشد. اینترنت را بررسی کن.</div>';
  if (!rows.length) return '<div class="empty">در ۳۰ روز اخیر هیچ عضوی از هوشواره استفاده نکرده.</div>';
  const total = sum(rows);
  const byUser = new Map();
  for (const r of rows) {
    const u = byUser.get(r.user_id) || { name: r.name, rows: [] };
    u.rows.push(r);
    byUser.set(r.user_id, u);
  }
  const list = [...byUser.values()].map(u => ({ ...u, cost: sum(u.rows) })).sort((a, b) => b.cost - a.cost);
  return `${tiles(rows)}
      <h3 class="list-h">به تفکیک عضو</h3>
      <div class="usage-members">${list.map(u => `
        <details class="usage-member">
          <summary>
            <div class="wrow"><span>${esc(u.name)} <small class="muted">${fa(u.rows.length)} درخواست · ۷ روز اخیر ${usd(sum(u.rows.filter(r => new Date(r.at) >= week())))}</small></span><b>${usd(u.cost)} <small class="muted">${fa(Math.round(u.cost / (total || 1) * 100))}٪</small></b></div>
            <div class="bar usage-bar"><i style="width:${Math.max(2, Math.round(u.cost / (total || 1) * 100))}%"></i></div>
          </summary>
          ${modes(u.rows)}
        </details>`).join('')}</div>
      <p class="muted small">همه‌ی این مصرف از حساب API خودت پرداخت می‌شود. فقط تو این بخش را می‌بینی؛ هر عضو فقط مصرف خودش را می‌بیند. ${NOTE}</p>`;
}
