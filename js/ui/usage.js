/*
  «مصرف هوشواره»: what the AI has cost, from the token counts the Edge Function saves after
  every call (table ai_usage). The dollar figures are an estimate from the list prices below;
  the real bill is in the Anthropic console.
*/
import * as store from '../data/store.js';
import { fa } from '../lib/fa.js';
import { sheet, icon } from './dom.js';

// Claude Sonnet 5.5, US dollars per million tokens (cache write: the 5-minute rate), and per web search.
// Change these when the model or its prices change.
const PRICE = { input: 2, cache_read: 0.2, cache_write: 2.5, output: 10, search: 0.01 };
const MODES = {
  chat: 'گفت‌وگو', magazine: 'مجله', plan: 'چیدن رژیم', plan_option: 'گزینه‌ی دیگر رژیم', tip: 'نکته‌ی امروز',
  review: 'تحلیل هفته', progress: 'تحلیل روند', estimate: 'تخمین غذا', photo: 'عکس غذا', quote: 'جمله‌ی انگیزشی', title: 'اسم گفت‌وگو',
};
const DAYS = 30;

const cost = r => (r.input * PRICE.input + r.cache_read * PRICE.cache_read + r.cache_write * PRICE.cache_write + r.output * PRICE.output) / 1e6 + r.searches * PRICE.search;
const usd = x => `${fa(x < 0.995 ? Math.round(x * 100) / 100 : Math.round(x * 10) / 10, 2)} دلار`;

export function openUsage() {
  sheet.open(async body => {
    body.innerHTML = `
      <div class="sheet-head"><h2>مصرف هوشواره</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <div data-usage><p class="muted small ai-wait"><span class="typing"><i></i><i></i><i></i></span> در حال خواندن…</p></div>`;
    body.querySelector('[data-close]').onclick = () => sheet.close();
    const since = new Date(Date.now() - DAYS * 864e5);
    const rows = await store.aiUsage(since.toISOString());
    const box = body.querySelector('[data-usage]');
    if (!box) return;
    if (!rows) { box.innerHTML = '<div class="empty">مصرف خوانده نشد. اینترنت را بررسی کن.</div>'; return; }
    if (!rows.length) { box.innerHTML = '<div class="empty">هنوز مصرفی ثبت نشده. از این به بعد هر بار که هوشواره کاری بکند، این‌جا حساب می‌شود.</div>'; return; }

    const week = Date.now() - 7 * 864e5;
    const sum = list => list.reduce((s, r) => s + cost(r), 0);
    const total = sum(rows);
    const first = new Date(rows[0].at);
    const span = Math.max(1, Math.min(DAYS, Math.ceil((Date.now() - first) / 864e5)));
    const byMode = new Map();
    for (const r of rows) {
      const m = byMode.get(r.mode) || { n: 0, cost: 0 };
      m.n++; m.cost += cost(r);
      byMode.set(r.mode, m);
    }
    const list = [...byMode].sort((a, b) => b[1].cost - a[1].cost);
    const input = rows.reduce((s, r) => s + r.input + r.cache_read + r.cache_write, 0);
    const cached = rows.reduce((s, r) => s + r.cache_read, 0);

    box.innerHTML = `
      <section class="tiles">
        <div class="tile"><span>${fa(span)} روز اخیر</span><b>${usd(total)}</b><small>${fa(rows.length)} درخواست</small></div>
        <div class="tile"><span>۷ روز اخیر</span><b>${usd(sum(rows.filter(r => new Date(r.at) >= week)))}</b><small>با این روند، ماهی حدود ${usd(total / span * 30)}</small></div>
      </section>
      <h3 class="list-h">به تفکیک کار</h3>
      <div class="wlist usage-list">${list.map(([mode, m]) => `
        <div class="wrow"><span>${MODES[mode] || mode} <small class="muted">${fa(m.n)} بار · هر بار ${usd(m.cost / m.n)}</small></span><b>${usd(m.cost)}</b></div>
        <div class="bar usage-bar"><i style="width:${Math.max(2, Math.round(m.cost / total * 100))}%"></i></div>`).join('')}</div>
      <p class="muted small">${input ? `${fa(Math.round(cached / input * 100))}٪ از ورودی‌ها از کش خوانده شده (ده برابر ارزان‌تر). ` : ''}عددها تخمینی‌اند (از روی تعداد توکن و قیمت رسمی مدل)؛ صورت‌حساب واقعی در کنسول Anthropic است. یادآورها و یادآور صندوقچه هزینه‌ای ندارند.</p>`;
  }, { tall: true });
}
