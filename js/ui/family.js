/*
  «خانواده» on «پیشرفت» (the «من | خانواده» switch at the top): this week's shared activity goal
  and each member's habit score against their own goals (js/domain/family.js), last week folded.
  Nothing is added to «امروز»: when there is news (the shared goal reached, last week's result
  in) a small dot shows on the «پیشرفت» tab, and the mascot says one line when the goal is reached.

  This device sends its own rows (this week and last, which late logging can still change) a
  few seconds after anything changes, and only when they changed. «من را در خانواده نشان نده»
  takes them back from the server and stops sending.
*/
import * as store from '../data/store.js';
import { weekRow, teamGoal, board, LOG_GOAL } from '../domain/family.js';
import { fa, esc } from '../lib/fa.js';
import { today, addDays, weekStart } from '../lib/dates.js';
import { toast, sheet, icon } from './dom.js';
import { cheer } from './mascot.js';

let rows = null;       // everyone's rows from last week on, or null until read
let failed = false;    // the last read didn't work (offline, or the server can't answer)
let reading = null;
let lastRead = 0;
let sendTimer = 0;

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
    if (!r.error) { mem.set('sent', 'left'); rows = rows?.filter(x => !x.me) || rows; markNews(); }
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

/* ---------------- reading everyone's rows ---------------- */

export function read(force = false) {
  if (!store.canPush()) return Promise.resolve();
  if (reading) return reading;
  if (!force && Date.now() - lastRead < 60000) return Promise.resolve();
  reading = store.familyBoard(weeks().prev).then(data => {
    lastRead = Date.now();
    failed = !data;
    if (data) rows = data;
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

/* ---------------- the dot on «پیشرفت» and the mascot's line ---------------- */

function news() {
  if (!rows || hidden()) return [];
  const { ws, prev } = weeks();
  const out = [];
  const now = board(rows, ws);
  if (now.length > 1 && teamGoal(now).done) out.push(`goal:${ws}`);
  if (board(rows, prev).length > 1) out.push(`week:${prev}`);
  return out.filter(k => !mem.get(`seen:${k}`));
}
function markNews() {
  const n = news();
  document.querySelector('#nav a[data-route="progress"]')?.classList.toggle('news', n.length > 0);
  const { ws } = weeks();
  if (n.includes(`goal:${ws}`) && !mem.get(`cheered:${ws}`)) { mem.set(`cheered:${ws}`, '1'); cheer('family'); }
}
function seeNews() {
  news().forEach(k => mem.set(`seen:${k}`, '1'));
  markNews();
}

/* ---------------- the view: numbers, almost no words ---------------- */

let redraw = null;

const memberRow = (r, rank) => `<li class="fam-row${r.me ? ' me' : ''}">
    <span class="fam-rank">${fa(rank)}</span>
    <b class="fam-name">${r.me ? 'تو' : esc(r.name)}</b>
    <span class="bar"><i style="width:${r.score}%"></i></span>
    <b class="fam-score">${fa(r.score)}٪</b>
  </li>`;

const teamLine = list => {
  const g = teamGoal(list);
  return `<div class="fam-team${g.done ? ' done' : ''}">
    <div class="fam-team-top"><span>هدف مشترک تحرک</span><b>${fa(g.min)} <small>/ ${fa(g.goal)} دقیقه</small>${g.done ? ' ✓' : ''}</b></div>
    <div class="bar"><i style="width:${Math.round(g.pct * 100)}%"></i></div>
  </div>`;
};

export function familyView() {
  const { ws, prev } = weeks();
  const local = !store.canPush();
  // without a server (?local), only this member's own rows, so the screen can be tried out
  const all = local ? myRows().map(r => ({ ...r, me: true, name: 'تو' })) : rows;
  if (!all) {
    return `<section class="card"><p class="muted small ai-wait">${failed ? 'الان در دسترس نیست.'
      : '<span class="typing"><i></i><i></i><i></i></span>'}</p></section>`;
  }
  const now = board(all, ws);
  const before = board(all, prev);
  return `
    ${hidden() ? '<div class="note soft"><p>تو در جدول نیستی.</p><button class="btn sm" data-fam-join>من را هم نشان بده</button></div>' : ''}
    <section class="card fam-card">
      <h2>این هفته</h2>
      ${now.length ? `${teamLine(now)}<ol class="fam-list">${now.map((r, i) => memberRow(r, i + 1)).join('')}</ol>`
        : '<p class="muted small">هنوز کسی چیزی ثبت نکرده.</p>'}
    </section>
    ${before.length ? `<details class="card fold fam-card">
      <summary><span><h2>هفته‌ی گذشته</h2></span></summary>
      ${teamLine(before)}<ol class="fam-list">${before.map((r, i) => memberRow(r, i + 1)).join('')}</ol>
    </details>` : ''}
    <button class="link small fam-how-link" data-fam-how>امتیاز چطور حساب می‌شود؟</button>`;
}

// The explanation and the opt-out, in a sheet instead of on the page.
function openHow() {
  sheet.open(body => {
    const local = !store.canPush();
    body.innerHTML = `
      <div class="sheet-head"><h2>امتیاز</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <ul class="fam-how">
        <li>ثبت غذا: ${fa(LOG_GOAL)} روز در هفته</li>
        <li>تحرک: هدف هفتگی خودت</li>
        <li>رژیم: وعده‌های طبق برنامه، اگر رژیم داری</li>
      </ul>
      <p class="muted small">هر کس با هدف خودش. وزن و کالری دیده نمی‌شود.</p>
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

export function bindFamily(root, rerender) {
  redraw = rerender;
  root.querySelector('[data-fam-how]')?.addEventListener('click', openHow);
  root.querySelector('[data-fam-join]')?.addEventListener('click', () => setHidden(false));
  if (!store.canPush()) return;
  if (rows) seeNews(); else read();
}
