/*
  Reminders: push notifications to log food (evening) and to weigh in (morning), sent by the
  `remind` Edge Function even when the app is closed. The times and switches live in the
  profile (they follow the account); the subscription belongs to this browser and is stored
  in push_subs. The texts are fixed, so a reminder costs nothing in AI use.
*/
import * as store from '../data/store.js';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';
import { authToken } from '../ai/hooshvareh.js';
import { fa, faDigits } from '../lib/fa.js';
import { sheet, toast, icon } from './dom.js';
import { quietOn } from '../domain/why.js';
import { today, faDM, iso } from '../lib/dates.js';
import { dayEnds, logTimeFor, autoTime } from '../domain/timing.js';

const URL_ = `${SUPABASE_URL}/functions/v1/remind`;
const DEFAULTS = { log: { on: true, at: '21:00' }, weigh: { on: true, at: '08:00', every: 7 } };
const LOG_TIMES = ['18:00', '19:00', '20:00', '21:00', '22:00', '23:00'];
const WEIGH_TIMES = ['05:00', '06:00', '07:00', '08:00', '09:00', '10:00'];
const EVERY = [[1, 'هر روز'], [3, 'هر ۳ روز'], [7, 'هر هفته'], [14, 'هر دو هفته']];

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const settings = () => {
  const r = store.profile()?.reminders || {};
  return { log: { ...DEFAULTS.log, ...r.log }, weigh: { ...DEFAULTS.weigh, ...r.weigh }, tz: r.tz || null, on: !!store.profile()?.reminders };
};
const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tehran'; } catch { return 'Asia/Tehran'; } };
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));

async function subscription() {
  if (!supported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

// Turns reminders on for this browser. Throws with a message fit for the user.
async function enable() {
  if (!supported()) throw new Error('این مرورگر اعلان نمی‌فرستد. روی آیفون باید تن‌آرا را اول به صفحه‌ی اصلی اضافه کنی و از همان‌جا بازش کنی.');
  if (!store.canPush()) throw new Error('یادآورها فقط وقتی وارد حساب شده‌ای کار می‌کنند.');
  if (navigator.onLine === false) throw new Error('برای روشن کردن یادآور به اینترنت وصل شو.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('اجازه‌ی اعلان داده نشد. از تنظیمات مرورگر یا گوشی، اعلان‌های تن‌آرا را مجاز کن.');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const res = await fetch(URL_, { headers: { apikey: SUPABASE_KEY } }).then(r => r.json()).catch(() => null);
    if (!res?.key) throw new Error('به سرور یادآور وصل نشد؛ دوباره امتحان کن.');
    try { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(res.key) }); }
    catch { throw new Error('این دستگاه اشتراک اعلان را قبول نکرد.'); }
  }
  const { error } = await store.savePush({ endpoint: sub.endpoint, p256dh: b64u(sub.getKey('p256dh')), auth: b64u(sub.getKey('auth')) });
  if (error) throw new Error('اشتراک این دستگاه ذخیره نشد؛ دوباره امتحان کن.');
  try { localStorage.removeItem(OFF()); } catch { /* private mode */ }
}

/*
  Each time the app opens: this device's subscription goes to the server again, so one the push
  service renewed, or one the server dropped after a refusal, is current again (a «به یادتم» that
  the push service took but never showed, owner's report 2026-11-22). If the browser lost it but still
  allows notifications, and reminders are on and were not switched off on this device, a new one is
  made without asking. Silent: nothing is shown if any of it fails.
*/
const OFF = () => store.localKey('push-off');
export async function resyncPush() {
  try {
    if (!supported() || !store.canPush() || !settings().on || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      if (localStorage.getItem(OFF()) === '1') return;
      const res = await fetch(URL_, { headers: { apikey: SUPABASE_KEY } }).then(r => r.json());
      if (!res?.key) return;
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(res.key) });
    }
    await store.savePush({ endpoint: sub.endpoint, p256dh: b64u(sub.getKey('p256dh')), auth: b64u(sub.getKey('auth')) });
  } catch { /* offline, or the browser said no: the reminders sheet still shows the way */ }
}

// Also run on sign-out, so this device stops getting the reminders of whoever signed out.
export async function disable() {
  const sub = await subscription();
  if (!sub) return;
  // the browser's subscription goes even if the server can't be reached: a dead endpoint
  // left in push_subs only gets a refusal from the push service
  try { await store.removePush(sub.endpoint); } finally { await sub.unsubscribe().catch(() => {}); }
}

// Sends a test notification to this person's devices. Resolves to how many accepted it.
async function test() {
  const token = await authToken();
  if (!token) throw new Error('دوباره وارد شو.');
  const res = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY }, body: JSON.stringify({ test: true }) })
    .then(r => r.json()).catch(() => null);
  if (!res || res.error) throw new Error(res?.error || 'یادآور آزمایشی فرستاده نشد.');
  return res;
}

function save(patch) {
  const cur = settings();
  store.saveProfile({ ...store.profile(), reminders: { log: cur.log, weigh: cur.weigh, ...patch, tz: tz() } });
}

/* ---------------- the evening reminder's time (BAZGASHT.md phase 8, domain/timing.js) ---------------- */

// the moment of an entry in this device's zone: its calendar day and minute
const localAt = s => { const d = new Date(s); return { day: iso(d), min: d.getHours() * 60 + d.getMinutes() }; };
// the time the evening reminder goes: their habit's (if they never set one) or their own
const logTime = log => logTimeFor(log, dayEnds(store.get().entries, localAt));

/* ---------------- «نمایه»: the row and its sheet ---------------- */

// One line for the settings list: what is on, and when.
export function remindersLine() {
  const s = settings();
  if (!s.on) return 'خاموش';
  // «فعلاً نمی‌خواهم» (domain/why.js): a month with nothing sent
  if (quietOn(store.profile(), today())) return `ساکت تا ${faDM(store.profile().quietUntil)}`;
  if (supported() && Notification.permission !== 'granted') return 'روی این دستگاه بسته است';
  return [s.log.on ? `ثبت غذا ${autoTime(s.log) ? 'خودکار، ' : ''}${faDigits(logTime(s.log))}` : null, s.weigh.on ? `اندازه‌گیری ${EVERY.find(e => e[0] === Number(s.weigh.every))?.[1] || 'هر هفته'}، ${faDigits(s.weigh.at)}` : null].filter(Boolean).join(' · ') || 'هر دو خاموش';
}

export function bindReminders(root) {
  root.querySelector('[data-reminders]')?.addEventListener('click', openReminders);
}

const times = (list, cur) => (list.includes(cur) ? list : [...list, cur].sort()).map(t => `<option value="${t}" ${t === cur ? 'selected' : ''}>${faDigits(t)}</option>`).join('');

export function openReminders() {
  sheet.open(body => {
    let busy = false;
    async function draw() {
      const s = settings();
      const sub = await subscription().catch(() => null);
      if (!body.isConnected) return;
      const denied = supported() && Notification.permission === 'denied';
      body.innerHTML = `
        <div class="sheet-head"><h2>یادآورها</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
        <div class="stack">
          ${quietOn(store.profile(), today()) ? `<div class="note soft"><strong>ساکت تا ${faDM(store.profile().quietUntil)}</strong>
            <div class="row gap"><button class="btn sm" data-unquiet>دوباره روشن کن</button></div></div>` : ''}
          <div class="note ${sub ? 'soft' : ''}">
            <strong>${sub ? 'این دستگاه اعلان می‌گیرد' : 'این دستگاه هنوز اعلان نمی‌گیرد'}</strong>
            <p>${sub ? 'یادآورها حتی وقتی تن‌آرا بسته است می‌رسند.' : denied ? 'اعلان‌های تن‌آرا در این مرورگر بسته شده. از تنظیمات مرورگر یا گوشی بازش کن و دوباره همین‌جا بیا.' : !supported() ? 'این مرورگر اعلان نمی‌فرستد. روی آیفون باید تن‌آرا را اول به صفحه‌ی اصلی اضافه کنی و از همان‌جا بازش کنی.' : 'هر گوشی یا مرورگر باید یک بار اجازه بدهد.'}</p>
            <div class="row gap">
              ${sub ? '<button class="btn sm" data-test>یک اعلان آزمایشی بفرست</button><button class="btn ghost sm" data-off>خاموش روی این دستگاه</button>'
                : `<button class="btn primary sm" data-on ${denied || !supported() ? 'disabled' : ''}>روشن کن</button>`}
            </div>
          </div>

          <label class="check"><input type="checkbox" name="log" ${s.log.on ? 'checked' : ''}><span>یادآور ثبت غذا <small class="muted">فقط اگر تا آن ساعت کمتر از دو وعده ثبت شده باشد</small></span></label>
          <label class="field"><span>ساعت</span><select name="logAt" aria-label="ساعت یادآور ثبت غذا"><option value="auto" ${autoTime(s.log) ? 'selected' : ''}>خودکار (${faDigits(logTime({ auto: true }))})</option>${autoTime(s.log) ? LOG_TIMES.map(t => `<option value="${t}">${faDigits(t)}</option>`).join('') : times(LOG_TIMES, s.log.at)}</select></label>

          <label class="check"><input type="checkbox" name="weigh" ${s.weigh.on ? 'checked' : ''}><span>یادآور اندازه‌گیری (وزن و دور کمر) <small class="muted">فقط اگر در این فاصله وزنی ثبت نشده باشد</small></span></label>
          <div class="row gap">
            <label class="field grow"><span>وزن‌کشی</span><select name="every" aria-label="فاصله‌ی وزن‌کشی">${EVERY.map(([v, l]) => `<option value="${v}" ${Number(s.weigh.every) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <label class="field grow"><span>ساعت</span><select name="weighAt" aria-label="ساعت یادآور وزن‌کشی">${times(WEIGH_TIMES, s.weigh.at)}</select></label>
          </div>
          <p class="muted small">این فاصله برای وزن است؛ دور کمر هر دو هفته یک بار، در همان اعلان و همان فرم ثبت خواسته می‌شود. اعلان تا ${fa(10)} دقیقه بعد از ساعتی که انتخاب کرده‌ای می‌رسد.</p>
        </div>`;
      const q = sel => body.querySelector(sel);
      q('[data-close]').onclick = () => sheet.close();
      q('[data-unquiet]')?.addEventListener('click', () => { const { quietUntil, ...p } = store.profile(); store.saveProfile(p); draw(); });
      const run = async (fn, ok) => {
        if (busy) return;
        busy = true;
        body.querySelectorAll('button[data-on], button[data-off], button[data-test]').forEach(b => { b.disabled = true; });
        try { const r = await fn(); toast(typeof ok === 'function' ? ok(r) : ok); } catch (e) { toast(e.message); }
        busy = false;
        draw();
      };
      q('[data-on]')?.addEventListener('click', () => run(async () => { await enable(); if (!settings().on) save({}); }, 'یادآورها روی این دستگاه روشن شد'));
      q('[data-off]')?.addEventListener('click', () => run(async () => {
        await disable();
        try { localStorage.setItem(OFF(), '1'); } catch { /* private mode */ }
      }, 'روی این دستگاه خاموش شد'));
      q('[data-test]')?.addEventListener('click', () => run(test, r => (r.ok ? 'فرستاده شد؛ باید تا چند لحظه‌ی دیگر برسد' : 'سرویس اعلان این دستگاه آن را قبول نکرد')));
      const change = () => save({
        // «خودکار»: the time follows their habit (domain/timing.js); a time picked here is theirs from then on
        log: { on: q('[name=log]').checked, at: q('[name=logAt]').value === 'auto' ? s.log.at : q('[name=logAt]').value, auto: q('[name=logAt]').value === 'auto' },
        weigh: { on: q('[name=weigh]').checked, at: q('[name=weighAt]').value, every: Number(q('[name=every]').value) },
      });
      body.querySelectorAll('input[type=checkbox], select').forEach(el => el.addEventListener('change', change));
    }
    draw();
  }, { tall: true });
}
