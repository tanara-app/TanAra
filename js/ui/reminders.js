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
}

async function disable() {
  const sub = await subscription();
  if (!sub) return;
  await store.removePush(sub.endpoint);
  await sub.unsubscribe().catch(() => {});
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

/* ---------------- «نمایه»: the card and its sheet ---------------- */

export function remindersCard() {
  const s = settings();
  const line = !s.on ? 'اگر یادت برود غذا یا وزنت را ثبت کنی، تن‌آرا با یک اعلان خبرت می‌کند؛ حتی وقتی اپ بسته است.'
    : [s.log.on ? `ثبت غذا: ساعت ${faDigits(s.log.at)}` : null, s.weigh.on ? `وزن‌کشی: ${EVERY.find(e => e[0] === Number(s.weigh.every))?.[1] || 'هر هفته'}، ساعت ${faDigits(s.weigh.at)}` : null].filter(Boolean).join(' · ') || 'هر دو یادآور خاموش‌اند.';
  return `<section class="card">
    <h2 class="card-h">یادآورها</h2>
    <p class="muted small">${line}</p>
    <button class="btn block" data-reminders>${s.on ? 'تنظیم یادآورها' : 'روشن کردن یادآورها'}</button>
  </section>`;
}

export function bindReminders(root) {
  root.querySelector('[data-reminders]')?.addEventListener('click', openReminders);
}

const times = (list, cur) => (list.includes(cur) ? list : [...list, cur].sort()).map(t => `<option value="${t}" ${t === cur ? 'selected' : ''}>${faDigits(t)}</option>`).join('');

function openReminders() {
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
          <div class="note ${sub ? 'soft' : ''}">
            <strong>${sub ? 'این دستگاه اعلان می‌گیرد' : 'این دستگاه هنوز اعلان نمی‌گیرد'}</strong>
            <p>${sub ? 'یادآورها حتی وقتی تن‌آرا بسته است می‌رسند.' : denied ? 'اعلان‌های تن‌آرا در این مرورگر بسته شده. از تنظیمات مرورگر یا گوشی بازش کن و دوباره همین‌جا بیا.' : !supported() ? 'این مرورگر اعلان نمی‌فرستد. روی آیفون باید تن‌آرا را اول به صفحه‌ی اصلی اضافه کنی و از همان‌جا بازش کنی.' : 'هر گوشی یا مرورگر باید یک بار اجازه بدهد.'}</p>
            <div class="row gap">
              ${sub ? '<button class="btn sm" data-test>یک اعلان آزمایشی بفرست</button><button class="btn ghost sm" data-off>خاموش روی این دستگاه</button>'
                : `<button class="btn primary sm" data-on ${denied || !supported() ? 'disabled' : ''}>روشن کن</button>`}
            </div>
          </div>

          <label class="check"><input type="checkbox" name="log" ${s.log.on ? 'checked' : ''}><span>یادآور ثبت غذا <small class="muted">فقط اگر تا آن ساعت کمتر از دو وعده ثبت شده باشد</small></span></label>
          <label class="field"><span>ساعت</span><select name="logAt" aria-label="ساعت یادآور ثبت غذا">${times(LOG_TIMES, s.log.at)}</select></label>

          <label class="check"><input type="checkbox" name="weigh" ${s.weigh.on ? 'checked' : ''}><span>یادآور وزن‌کشی <small class="muted">فقط اگر در این فاصله وزنی ثبت نشده باشد</small></span></label>
          <div class="row gap">
            <label class="field grow"><span>هر چند وقت</span><select name="every" aria-label="فاصله‌ی وزن‌کشی">${EVERY.map(([v, l]) => `<option value="${v}" ${Number(s.weigh.every) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <label class="field grow"><span>ساعت</span><select name="weighAt" aria-label="ساعت یادآور وزن‌کشی">${times(WEIGH_TIMES, s.weigh.at)}</select></label>
          </div>
          <p class="muted small">وزن را صبح، ناشتا و بعد از دستشویی بکش تا عددها با هم قابل‌مقایسه باشند. اگر دو هفته از آخرین اندازه‌ی دور کمر گذشته باشد، همان اعلان آن را هم یادآوری می‌کند. اعلان تا ${fa(10)} دقیقه بعد از ساعتی که انتخاب کرده‌ای می‌رسد.</p>
        </div>`;
      const q = sel => body.querySelector(sel);
      q('[data-close]').onclick = () => sheet.close();
      const run = async (fn, ok) => {
        if (busy) return;
        busy = true;
        body.querySelectorAll('button[data-on], button[data-off], button[data-test]').forEach(b => { b.disabled = true; });
        try { const r = await fn(); toast(typeof ok === 'function' ? ok(r) : ok); } catch (e) { toast(e.message); }
        busy = false;
        draw();
      };
      q('[data-on]')?.addEventListener('click', () => run(async () => { await enable(); if (!settings().on) save({}); }, 'یادآورها روی این دستگاه روشن شد'));
      q('[data-off]')?.addEventListener('click', () => run(disable, 'روی این دستگاه خاموش شد'));
      q('[data-test]')?.addEventListener('click', () => run(test, r => (r.ok ? 'فرستاده شد؛ باید تا چند لحظه‌ی دیگر برسد' : 'سرویس اعلان این دستگاه آن را قبول نکرد')));
      const change = () => save({
        log: { on: q('[name=log]').checked, at: q('[name=logAt]').value },
        weigh: { on: q('[name=weigh]').checked, at: q('[name=weighAt]').value, every: Number(q('[name=every]').value) },
      });
      body.querySelectorAll('input[type=checkbox], select').forEach(el => el.addEventListener('change', change));
    }
    draw();
  }, { tall: true });
}
