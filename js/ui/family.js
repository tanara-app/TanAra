/*
  «خانواده» on «پیشرفت» (the «من | خانواده» switch at the top): the family land. One floating
  land with four fenced plots (Persian garden, farm, northern forest, lakeside); each member picks
  a free plot once and grows it. Every PIECE_POINTS of their weekly habit scores, added up over all
  weeks (js/domain/family.js), opens the next of its 20 pieces; a plot never shrinks. The art is in
  img/land/ and where each piece stands in landArt.js.

  Tapping a plot zooms in on it, with whose it is, this week's score and its pieces. Nothing is
  added to «امروز»: a small dot shows on the «پیشرفت» tab when this member's plot has new pieces,
  and those pieces pop in the next time the land is seen.

  This device sends its own weekly rows (this week and last, which late logging can still change) a
  few seconds after anything changes, and only when they changed. «من را نشان نده» takes them back
  from the server and stops sending.
*/
import * as store from '../data/store.js';
import { weekRow, board, totals, pieces, LOG_GOAL, PIECE_POINTS, PIECES, PLOTS } from '../domain/family.js';
import { LAND_W, LAND_H, SCALE, WIDTH, SPOT, PLOT_BOX, TAG, PLOT_NAME, pieceOrder } from './landArt.js';
import { fa, esc } from '../lib/fa.js';
import { today, addDays, weekStart } from '../lib/dates.js';
import { toast, sheet, icon, confirmBox } from './dom.js';

const SINCE = '2026-01-01'; // every week of the family land
let rows = null;       // everyone's weekly rows, or null until read
let plots = null;      // [{ user_id, name, me, plot }], or null until read
let failed = false;    // the last read didn't work (offline, or the server can't answer)
let reading = null;
let lastRead = 0;
let sendTimer = 0;
let zoom = null;       // the plot zoomed in on, or null for the whole land
let from = undefined;  // while zooming: the view it starts from (a plot, or null), so it can glide

const weeks = (t = today()) => { const ws = weekStart(t); return { ws, prev: addDays(ws, -7) }; };
const hidden = () => !!store.profile()?.familyHidden;
const mem = {
  get(k) { try { return localStorage.getItem(store.localKey(`family:${k}`)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(store.localKey(`family:${k}`), v); } catch { /* private mode */ } },
};

function myRows(t = today()) {
  const s = store.get();
  const p = store.profile();
  const { ws, prev } = weeks(t);
  const data = { entries: s.entries, activity: s.activity, notes: s.ai_notes, profile: p };
  return [weekRow(data, prev), weekRow(data, ws, t)];
}

/* ---------------- sending this member's rows ---------------- */

async function send() {
  if (!store.canPush() || !store.profile()?.onboarded) return;
  if (hidden()) {
    if (mem.get('sent') === 'left') return;
    const r = await store.familyLeave();
    if (!r.error) { mem.set('sent', 'left'); read(true); }
    return;
  }
  const mine = myRows();
  const key = JSON.stringify(mine);
  if (mem.get('sent') === key) return;
  const r = await store.familySave(mine);
  if (r.error) return;
  mem.set('sent', key);
  read(true);
}
const sendSoon = () => { clearTimeout(sendTimer); sendTimer = setTimeout(send, 4000); };

/* ---------------- reading everyone's rows and plots ---------------- */

export function read(force = false) {
  if (!store.canPush()) return Promise.resolve();
  if (reading) return reading;
  if (!force && Date.now() - lastRead < 60000) return Promise.resolve();
  reading = Promise.all([store.familyBoard(SINCE), store.familyPlots()]).then(([data, ps]) => {
    lastRead = Date.now();
    failed = !data || !ps;
    if (data) rows = data;
    if (ps) plots = ps;
    reading = null;
    markNews();
    if (location.hash === '#/progress') redraw?.();
  });
  return reading;
}

// Called once the app has a signed-in member: read now, send after every change, read again on return.
export function startFamily() {
  if (!store.canPush()) return;
  store.subscribe(sendSoon);
  sendSoon();
  read(true);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') read(); });
}

/* ---------------- who has which plot, and how far it has grown ---------------- */

function members() {
  const local = !store.canPush();
  const rs = local ? myRows().map(r => ({ ...r, user_id: 'me' })) : rows;
  const ps = local ? (store.profile()?.familyPlot ? [{ user_id: 'me', name: 'تو', me: true, plot: store.profile().familyPlot }] : []) : plots;
  if (!rs || !ps) return null;
  const tot = totals(rs);
  const week = Object.fromEntries(board(rs, weeks().ws).map(r => [r.user_id, r.score]));
  return ps.map(m => ({ ...m, total: tot[m.user_id] || 0, ...pieces(tot[m.user_id]), week: week[m.user_id] ?? 0 }));
}

/* ---------------- the dot on «پیشرفت»: new pieces in my plot ---------------- */

function news() {
  const mine = members()?.find(m => m.me);
  return !!mine && mine.open > Number(mem.get(`seen:${mine.plot}`) ?? mine.open);
}
function markNews() {
  document.querySelector('#nav a[data-route="progress"]')?.classList.toggle('news', news());
}

/* ---------------- the view ---------------- */

let redraw = null;
const pct = (v, total) => `${(v / total) * 100}%`;

function landHtml(list, chooseFree) {
  const byPlot = Object.fromEntries(list.map(m => [m.plot, m]));
  let html = '';
  for (const plot of PLOTS) {
    const m = byPlot[plot];
    if (!m) continue;
    const seen = Number(mem.get(`seen:${plot}`) ?? m.open);
    Object.entries(SPOT).filter(([k]) => k.startsWith(plot + '-') && pieceOrder(k) < m.open)
      .forEach(([k, [x, y, s = 1]]) => {
        const w = WIDTH[k] * SCALE[plot] * s;
        const at = `left:${pct(x, LAND_W)};top:${pct(y, LAND_H)};`;
        html += `<i class="piece-shadow" style="${at}width:${pct(w * .85, LAND_W)};height:${pct(w * .24, LAND_H)}"></i>`
          + `<img class="piece${pieceOrder(k) >= seen ? ' new' : ''}" src="img/land/obj/${k}.webp" alt="" loading="lazy" style="${at}width:${pct(w, LAND_W)};z-index:${y}">`;
      });
  }
  if (!zoom) {
    for (const plot of PLOTS) {
      const m = byPlot[plot];
      const [x, y] = TAG[plot];
      const label = m ? `<b>${m.me ? 'تو' : esc(m.name)}</b> ${fa(m.week)}٪` : chooseFree ? 'انتخاب کن' : PLOT_NAME[plot];
      html += `<span class="plot-tag${m ? (m.me ? ' me' : '') : ' free'}" style="left:${pct(x, LAND_W)};top:${pct(y, LAND_H)}">${label}</span>`;
    }
  }
  return html;
}

function zoomStyle(plot = zoom) {
  if (!plot) return '';
  const [x0, y0, x1, y1] = PLOT_BOX[plot];
  const s = Math.min(LAND_W / (x1 - x0), LAND_H / (y1 - y0));
  const tx = -(x0 + (x1 - x0) / 2) + LAND_W / (2 * s);
  const ty = -(y0 + (y1 - y0) / 2) + LAND_H / (2 * s);
  return `transform:scale(${s}) translate(${pct(tx, LAND_W)},${pct(ty, LAND_H)})`;
}

export function familyView() {
  const list = members();
  if (!list) {
    return `<section class="card"><p class="muted small ai-wait">${failed ? 'الان در دسترس نیست.'
      : '<span class="typing"><i></i><i></i><i></i></span>'}</p></section>`;
  }
  const mine = list.find(m => m.me);
  const z = zoom && list.find(m => m.plot === zoom);
  return `
    ${!mine ? '<p class="land-hint">روی یک قطعه‌ی خالی بزن تا مال تو شود.</p>' : ''}
    <div class="land-view${zoom ? ' zoomed' : ''}" data-land>
      <div class="land" style="${zoomStyle(from === undefined ? zoom : from)}">${landHtml(list, !mine)}</div>
      ${zoom ? `<button class="land-back" data-unzoom aria-label="همه‌ی سرزمین">${icon.close}</button>` : ''}
    </div>
    ${z ? `<section class="card plot-info">
      <div><small class="muted">${PLOT_NAME[z.plot]}</small><b>${z.me ? 'تو' : esc(z.name)}</b></div>
      <div><small class="muted">این هفته</small><b class="num">${fa(z.week)}٪</b></div>
      <div><small class="muted">تکه‌ها</small><b class="num">${fa(z.open)}<small> از ${fa(PIECES)}</small></b></div>
    </section>
    ${z.next ? `<p class="land-next">${fa(z.next)} امتیاز تا تکه‌ی بعد</p>` : ''}` : ''}
    <button class="link small fam-how-link" data-fam-how>سرزمین چطور رشد می‌کند؟</button>`;
}

// The explanation and the opt-out, in a sheet instead of on the page.
function openHow() {
  sheet.open(body => {
    const local = !store.canPush();
    body.innerHTML = `
      <div class="sheet-head"><h2>سرزمین خانواده</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <p class="small">امتیاز هر هفته از این‌هاست، هر کدام با هدف خودت:</p>
      <ul class="fam-how">
        <li>ثبت غذا: ${fa(LOG_GOAL)} روز در هفته</li>
        <li>تحرک: هدف هفتگی خودت</li>
        <li>رژیم: وعده‌های طبق برنامه، اگر رژیم داری</li>
      </ul>
      <p class="small">هر ${fa(PIECE_POINTS)} امتیاز یک تکه‌ی تازه در قطعه‌ات باز می‌کند. قطعه هیچ‌وقت کوچک نمی‌شود.</p>
      <p class="muted small">وزن و کالری دیده نمی‌شود.</p>
      ${local ? '' : hidden() ? '<button class="btn block" data-fam-join>من را هم نشان بده</button>'
        : '<button class="btn block" data-fam-leave>من را نشان نده</button>'}`;
    body.querySelector('[data-close]').onclick = () => sheet.close();
    body.querySelector('[data-fam-leave]')?.addEventListener('click', () => { setHidden(true); sheet.close(); });
    body.querySelector('[data-fam-join]')?.addEventListener('click', () => { setHidden(false); sheet.close(); });
  });
}

function setHidden(on) {
  const { familyHidden, ...p } = store.profile();
  store.saveProfile(on ? { ...p, familyHidden: true } : p);
  mem.set('sent', '');
  send();
  toast(on ? 'دیگر در جدول نیستی' : 'دوباره در جدول هستی');
}

// Which plot a tap on the land fell in (whole-land view only).
function plotAt(e, el) {
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * LAND_W, y = (e.clientY - r.top) / r.height * LAND_H;
  return PLOTS.find(p => { const [x0, y0, x1, y1] = PLOT_BOX[p]; return x >= x0 && x <= x1 && y >= y0 + 40 && y <= y1; }) || null;
}

async function choose(plot) {
  if (!(await confirmBox(`«${PLOT_NAME[plot]}» قطعه‌ی تو شود؟ بعداً عوض نمی‌شود.`, 'مال من'))) return;
  if (!store.canPush()) {
    store.saveProfile({ ...store.profile(), familyPlot: plot });
    return;
  }
  const r = await store.familyChoose(plot);
  if (r.error) toast(r.error.code === '23505' ? 'این قطعه را کس دیگری برداشته' : 'الان نشد؛ دوباره امتحان کن');
  await read(true);
}

export function bindFamily(root, rerender) {
  redraw = rerender;
  root.querySelector('[data-fam-how]')?.addEventListener('click', openHow);
  root.querySelector('[data-unzoom]')?.addEventListener('click', e => { e.stopPropagation(); from = zoom; zoom = null; rerender(); });
  // glide from where the view was to where it is going
  if (from !== undefined) {
    const land = root.querySelector('.land');
    from = undefined;
    if (land) requestAnimationFrame(() => requestAnimationFrame(() => { land.style.transform = zoomStyle().replace('transform:', '') || 'none'; }));
  }
  const view = root.querySelector('[data-land]');
  view?.addEventListener('click', e => {
    if (zoom) return;
    const plot = plotAt(e, view);
    if (!plot) return;
    const list = members() || [];
    if (list.some(m => m.plot === plot)) { from = null; zoom = plot; rerender(); }
    else if (!list.some(m => m.me)) choose(plot);
  });
  // the pieces that just popped in are seen now
  const list = members();
  if (list) {
    list.forEach(m => mem.set(`seen:${m.plot}`, String(m.open)));
    markNews();
  }
  if (store.canPush() && !rows) read();
}
