/*
  «صندوقچه»: private photos, videos and links that motivate, behind a six-digit PIN.

  The PIN is a lock on the screen, for a phone that is already signed in: files are private
  to the account anyway (see the vault bucket), and the PIN keeps someone holding the phone
  out. Only its salted hash is stored (in the profile, so it follows the account). The vault
  locks whenever its sheet closes or the app goes to the background.
*/
import * as store from '../data/store.js';
import { fa, esc } from '../lib/fa.js';
import { today, diffDays } from '../lib/dates.js';
import { sheet, toast, confirmBox, choose, icon } from './dom.js';
import { dismissed, dismiss } from './notices.js';
import { shrink } from './motivation.js';

const PIN_LEN = 6;
const MAX_TRIES = 5;      // wrong PINs before a pause
const PAUSE_MS = 60000;
const EVERY = [[1, 'هر روز'], [3, 'هر ۳ روز'], [7, 'هر هفته'], [14, 'هر دو هفته'], [0, 'خاموش']];
const VIDEO_EXT = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };
const EXT_TYPE = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' };

let ctx = null;       // the vault's sheet while it is open
let picking = false;  // the system file picker is up (the page goes hidden on Android)
let busy = null;      // progress text while files upload
let verifyPassword = null; // async pw => 'ok' | 'wrong' | 'net'; null in ?local mode

export function configureVault(opts) { verifyPassword = opts?.verifyPassword || null; }

/* ---------------- settings kept with the profile / on the device ---------------- */
const settings = () => store.profile()?.vault || {};
const saveSettings = patch => store.saveProfile({ ...store.profile(), vault: { ...settings(), ...patch } });
const every = () => settings().every ?? 3;

const ls = {
  get(k, fb) { try { return JSON.parse(localStorage.getItem(`tanara:vault-${k}`)) ?? fb; } catch { return fb; } },
  set(k, v) { try { localStorage.setItem(`tanara:vault-${k}`, JSON.stringify(v)); } catch { /* ignore */ } },
};
const lastSeen = () => ls.get('seen', null);

// What Hooshvareh may know: that the vault exists and how long since it was opened, never what is in it.
export function vaultSummary() {
  const list = store.get().vault || [];
  if (!list.length) return null;
  const n = k => list.filter(v => v.kind === k).length;
  return { photos: n('image'), videos: n('video'), links: n('link'), lastOpened: lastSeen() };
}

/* ---------------- PIN ---------------- */
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function hashPin(pin, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 150000 }, key, 256));
}
async function setPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  saveSettings({ pin: { s: b64(salt), h: await hashPin(pin, salt) } });
  ls.set('tries', null);
}
async function checkPin(pin) {
  const p = settings().pin;
  return !!p && (await hashPin(pin, unb64(p.s))) === p.h;
}

/*
  The keypad. onFull(pin) runs when six digits are in and resolves to an error message to
  show (the dots clear and shake), or to nothing when the pad is done with.
*/
function pinPad(body, { title, hint = '', onFull, forgot = null }) {
  let pin = '';
  let locked = false;
  body.innerHTML = `
    <div class="sheet-head"><span></span><h2>صندوقچه</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
    <div class="pin">
      <div class="pin-lock">${icon.lock}</div>
      <strong>${title}</strong>
      <p class="muted small pin-hint">${hint}</p>
      <div class="pin-dots" aria-label="رمز">${'<i></i>'.repeat(PIN_LEN)}</div>
      <p class="err pin-err" role="alert"></p>
      <div class="pin-keys">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-k="${n}">${fa(n)}</button>`).join('')}
        ${forgot ? '<button type="button" class="pin-forgot" data-forgot>فراموش کردم</button>' : '<span></span>'}
        <button type="button" data-k="0">${fa(0)}</button>
        <button type="button" class="pin-back" data-back aria-label="پاک کردن">${icon.back}</button>
      </div>
    </div>`;
  const pad = body.querySelector('.pin');
  const dots = [...pad.querySelectorAll('.pin-dots i')];
  const err = pad.querySelector('.pin-err');
  const paint = () => dots.forEach((d, i) => d.classList.toggle('on', i < pin.length));
  const fail = msg => {
    pin = ''; paint();
    err.textContent = msg;
    pad.classList.remove('shake'); void pad.offsetWidth; pad.classList.add('shake');
  };
  const press = async k => {
    if (locked || pin.length >= PIN_LEN) return;
    pin += k; paint(); err.textContent = '';
    if (pin.length < PIN_LEN) return;
    locked = true;
    const msg = await onFull(pin);
    locked = false;
    if (msg && pad.isConnected) fail(msg);
  };
  const back = () => { if (!locked) { pin = pin.slice(0, -1); paint(); } };
  pad.querySelector('.pin-keys').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.k) press(b.dataset.k);
    else if ('back' in b.dataset) back();
    else if ('forgot' in b.dataset) forgot();
  });
  const onKey = e => {
    if (!pad.isConnected) { document.removeEventListener('keydown', onKey); return; }
    if (/^[0-9]$/.test(e.key)) press(e.key);
    else if (/^[۰-۹]$/.test(e.key)) press(String('۰۱۲۳۴۵۶۷۸۹'.indexOf(e.key)));
    else if (e.key === 'Backspace') back();
  };
  document.addEventListener('keydown', onKey);
  body.querySelector('[data-close]').onclick = () => sheet.close();
  return { fail };
}

// Choose a PIN: enter it, then once more.
function askNewPin(body, done, first = false) {
  const step1 = (error = '') => {
    const pad = pinPad(body, {
      title: 'یک رمز شش‌رقمی انتخاب کن',
      hint: first ? 'عکس‌ها و ویدیوهایی که اینجا می‌گذاری شخصی‌اند؛ هر بار برای باز کردن صندوقچه همین رمز را می‌خواهد.' : 'رمز تازه‌ی صندوقچه',
      onFull: async pin => { step2(pin); },
    });
    if (error) pad.fail(error);
  };
  const step2 = first_ => pinPad(body, {
    title: 'یک بار دیگر واردش کن',
    hint: 'برای اطمینان',
    onFull: async pin => {
      if (pin !== first_) { step1('دو رمز یکی نبودند؛ از اول.'); return; }
      await setPin(pin);
      done();
    },
  });
  step1();
}

function askPin(body, done) {
  const waitMsg = () => {
    const left = (ls.get('tries', null)?.until || 0) - Date.now();
    return left > 0 ? `چند بار اشتباه شد؛ ${fa(Math.ceil(left / 1000))} ثانیه‌ی دیگر امتحان کن.` : '';
  };
  const pad = pinPad(body, {
    title: 'رمز صندوقچه را وارد کن',
    forgot: () => forgotPin(body, done),
    onFull: async pin => {
      const w = waitMsg();
      if (w) return w;
      if (await checkPin(pin)) { ls.set('tries', null); done(); return; }
      const n = (ls.get('tries', null)?.n || 0) + 1;
      if (n >= MAX_TRIES) { ls.set('tries', { n: 0, until: Date.now() + PAUSE_MS }); return waitMsg(); }
      ls.set('tries', { n });
      return `رمز درست نیست. ${fa(MAX_TRIES - n)} بار دیگر می‌توانی امتحان کنی.`;
    },
  });
  const w = waitMsg();
  if (w) pad.fail(w);
}

// A forgotten PIN is replaced after proving who you are with the account's password.
function forgotPin(body, done) {
  if (!verifyPassword) { askNewPin(body, done); return; }
  body.innerHTML = `
    <div class="sheet-head"><span></span><h2>صندوقچه</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
    <form class="stack" novalidate>
      <p>برای ساختن رمز تازه، رمز ورود حساب تن‌آرا را وارد کن (همان که با ایمیل وارد اپ شدی).</p>
      <label class="field"><span>رمز حساب</span><input name="pw" type="password" autocomplete="current-password" dir="ltr"></label>
      <p class="err" hidden></p>
      <button class="btn primary block big">ادامه</button>
      <button type="button" class="btn ghost block" data-cancel>برگشت</button>
    </form>`;
  const form = body.querySelector('form');
  body.querySelector('[data-close]').onclick = () => sheet.close();
  body.querySelector('[data-cancel]').onclick = () => askPin(body, done);
  form.onsubmit = async e => {
    e.preventDefault();
    const btn = form.querySelector('button');
    const err = form.querySelector('.err');
    if (!form.elements.pw.value) return;
    btn.disabled = true; err.hidden = true;
    const r = await verifyPassword(form.elements.pw.value);
    if (!form.isConnected) return;
    btn.disabled = false;
    if (r === 'ok') { askNewPin(body, done); return; }
    err.textContent = r === 'wrong' ? 'رمز حساب درست نیست.' : 'اتصال برقرار نشد. اینترنت را بررسی کن.';
    err.hidden = false;
  };
}

/* ---------------- opening and locking ---------------- */
export function openVault() {
  if (ctx) return;
  let off = null;
  ctx = sheet.open(body => {
    const enter = () => {
      ls.set('seen', today());
      const draw = () => drawGrid(body);
      draw();
      off = store.subscribe(() => { if (body.isConnected) draw(); });
    };
    if (settings().pin) askPin(body, enter); else askNewPin(body, enter, true);
  }, {
    tall: true,
    onClose: () => { ctx = null; busy = null; off?.(); store.forgetVaultFiles(); },
  });
}

// Leaving the app locks the vault (unless it only went hidden for the file picker).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { setTimeout(() => { picking = false; }, 1500); return; }
  if (ctx && !picking) sheet.closeAll();
});

/* ---------------- the grid ---------------- */
const mb = bytes => fa(Math.max(bytes ? 0.1 : 0, Math.round(bytes / 104857.6) / 10), 1);
const host = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

function tell(message) {
  sheet.open(body => {
    body.innerHTML = `<p class="confirm-msg">${esc(message)}</p><button class="btn primary block" data-ok>باشه</button>`;
    body.querySelector('[data-ok]').onclick = () => sheet.close();
  });
}

function tileHtml(v) {
  if (v.kind === 'link') return `<button class="vault-tile k-link" data-id="${v.id}">${icon.link}<span>${esc(v.title || host(v.url))}</span></button>`;
  const p = v.thumb_path || (v.kind === 'image' ? v.path : '');
  const url = p && store.vaultUrlCached(p);
  return `<button class="vault-tile" data-id="${v.id}" aria-label="${v.kind === 'video' ? 'ویدیو' : 'عکس'}">
    ${p ? `<img ${url ? `src="${url}"` : `data-vf="${esc(p)}"`} alt="" decoding="async">` : ''}
    ${v.kind === 'video' ? `<i class="vault-play">${icon.play}</i>` : ''}
  </button>`;
}

function hydrate(root) {
  root.querySelectorAll('img[data-vf]').forEach(img => {
    store.vaultFileUrl(img.dataset.vf).then(u => { if (img.isConnected) { img.src = u; img.removeAttribute('data-vf'); } }).catch(() => {});
  });
}

function drawGrid(body) {
  const items = [...store.get().vault].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const used = store.vaultUsed();
  body.innerHTML = `
    <div class="sheet-head"><button class="icon-btn" data-set aria-label="تنظیمات صندوقچه">${icon.gear}</button><h2>صندوقچه</h2><button class="icon-btn" data-close aria-label="بستن و قفل کردن">${icon.close}</button></div>
    ${items.length
      ? `<div class="vault-grid">${items.map(tileHtml).join('')}</div>`
      : '<div class="empty vault-empty"><strong>اینجا فقط مال خودت است</strong><p>عکس‌ها و ویدیوهایی که هر بار می‌بینی‌شان دوباره راه می‌افتی را اینجا بگذار. بدون رمز باز نمی‌شود.</p></div>'}
    <div class="vault-use">
      <div class="vault-bar"><i style="width:${Math.min(100, (used / store.VAULT_QUOTA) * 100).toFixed(1)}%"></i></div>
      <small class="muted">${mb(used)} مگابایت از ۱ گیگابایت پر شده · هر ویدیو تا ۳۰ مگابایت</small>
    </div>
    <div class="sheet-foot">${busy
      ? `<p class="vault-busy">${esc(busy)}</p>`
      : `<div class="row gap">
          <label class="btn primary grow file-btn">${icon.plus} عکس یا ویدیو<input type="file" accept="image/*,video/*" multiple hidden data-file></label>
          <button class="btn" data-link>${icon.link} لینک</button>
        </div>`}</div>`;
  hydrate(body);
  body.querySelector('[data-close]').onclick = () => sheet.close();
  body.querySelector('[data-set]').onclick = openSettings;
  body.querySelector('[data-link]')?.addEventListener('click', openLinkEditor);
  body.querySelectorAll('[data-id]').forEach(b => b.onclick = () => openItem(b.dataset.id));
  const file = body.querySelector('[data-file]');
  if (file) {
    file.addEventListener('click', () => { picking = true; });
    file.addEventListener('cancel', () => { picking = false; });
    file.addEventListener('change', () => { picking = false; if (file.files?.length) addFiles([...file.files], () => { if (body.isConnected) drawGrid(body); }); });
  }
}

/* ---------------- adding ---------------- */
// A frame from near the start of a video, for its tile. Null when the browser can't decode it here.
function poster(file) {
  return new Promise(resolve => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    const end = blob => { clearTimeout(timer); URL.revokeObjectURL(url); v.removeAttribute('src'); resolve(blob); };
    const timer = setTimeout(() => end(null), 6000);
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.onerror = () => end(null);
    v.onloadeddata = () => { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); };
    v.onseeked = () => {
      try {
        const k = Math.min(1, 360 / Math.max(v.videoWidth, v.videoHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        c.toBlob(b => end(b), 'image/jpeg', 0.8);
      } catch { end(null); }
    };
    v.src = url;
  });
}

async function addFile(f) {
  const type = f.type || EXT_TYPE[f.name.split('.').pop().toLowerCase()] || '';
  const room = size => {
    if (store.vaultUsed() + size > store.VAULT_QUOTA * 0.95) throw new Error('صندوقچه تقریباً پر شده است. برای جا باز کردن، چند ویدیوی قدیمی را حذف کن.');
  };
  if (type.startsWith('video/')) {
    if (!VIDEO_EXT[type]) throw new Error('این نوع ویدیو پشتیبانی نمی‌شود؛ MP4، MOV یا WebM انتخاب کن.');
    if (f.size > store.VAULT_MAX_FILE) throw new Error(`این ویدیو ${mb(f.size)} مگابایت است و سقف هر ویدیو ۳۰ مگابایت. کوتاه‌ترش کن، یا اگر در اینترنت هست لینکش را ذخیره کن.`);
    room(f.size);
    const thumb = await poster(f);
    const path = await store.uploadVaultFile(f.type ? f : new Blob([f], { type }), VIDEO_EXT[type]);
    const thumbPath = thumb ? await store.uploadVaultFile(thumb, 'jpg').catch(() => null) : null;
    store.saveVaultItem({ kind: 'video', path, thumb_path: thumbPath, size: f.size + (thumbPath ? thumb.size : 0) });
  } else if (type.startsWith('image/')) {
    let big, small;
    try { big = await shrink(f, 1600); small = await shrink(big, 360); } catch { throw new Error('یکی از عکس‌ها باز نشد؛ عکس دیگری انتخاب کن.'); }
    room(big.size);
    const path = await store.uploadVaultFile(big, 'jpg');
    const thumbPath = await store.uploadVaultFile(small, 'jpg').catch(() => null);
    store.saveVaultItem({ kind: 'image', path, thumb_path: thumbPath, size: big.size + (thumbPath ? small.size : 0) });
  } else throw new Error('فقط عکس و ویدیو را می‌شود اینجا گذاشت.');
}

async function addFiles(files, redraw) {
  const errors = [];
  let ok = 0;
  for (let i = 0; i < files.length; i++) {
    busy = files.length > 1 ? `در حال افزودن ${fa(i + 1)} از ${fa(files.length)}…` : 'در حال افزودن…';
    redraw();
    try { await addFile(files[i]); ok++; } catch (x) { errors.push(x.message); }
    if (!ctx) return; // locked meanwhile; what was uploaded is saved
  }
  busy = null;
  redraw();
  if (errors.length) tell(ok ? `${fa(ok)} مورد اضافه شد؛ ${fa(errors.length)} مورد نه. ${errors[0]}` : errors[0]);
  else toast(ok > 1 ? `${fa(ok)} مورد اضافه شد` : 'اضافه شد');
}

function openLinkEditor() {
  sheet.open(body => {
    body.innerHTML = `
      <div class="sheet-head"><span></span><h2>لینک تازه</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <form class="stack" novalidate>
        <p class="muted small">برای ویدیوهای بلند (یوتیوب، اینستاگرام، آپارات و…): فقط نشانی ذخیره می‌شود و جایی نمی‌گیرد.</p>
        <label class="field"><span>نشانی</span><input name="url" type="url" inputmode="url" dir="ltr" placeholder="https://" autocomplete="off"></label>
        <label class="field"><span>عنوان <em>اختیاری</em></span><input name="title" autocomplete="off" placeholder="مثلاً ویدیوی تمرین موردعلاقه‌ام"></label>
        <p class="err" hidden></p>
        <button class="btn primary block big">ذخیره</button>
      </form>`;
    const form = body.querySelector('form');
    body.querySelector('[data-close]').onclick = () => sheet.close();
    form.onsubmit = e => {
      e.preventDefault();
      let raw = form.elements.url.value.trim();
      if (raw && !/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`;
      let url = null;
      try { const u = new URL(raw); if (/^https?:$/.test(u.protocol) && u.hostname.includes('.')) url = u.href; } catch { /* not a URL */ }
      if (!url) { const err = form.querySelector('.err'); err.textContent = 'این نشانی درست نیست.'; err.hidden = false; return; }
      store.saveVaultItem({ kind: 'link', url, title: form.elements.title.value });
      sheet.close();
      toast('اضافه شد');
    };
  });
}

/* ---------------- viewing ---------------- */
function openItem(id) {
  const v = store.get().vault.find(x => x.id === id);
  if (!v) return;
  sheet.open(body => {
    body.innerHTML = `
      <div class="sheet-head"><span></span><h2>${v.kind === 'link' ? 'لینک' : v.kind === 'video' ? 'ویدیو' : 'عکس'}</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      ${v.kind === 'link'
        ? `${v.title ? `<h3 class="mot-view-title">${esc(v.title)}</h3>` : ''}
          <p class="muted vault-url" dir="ltr">${esc(v.url)}</p>
          <a class="btn primary block" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">باز کردن</a>`
        : `<div class="vault-stage"><p class="muted">${v.kind === 'video' ? 'در حال آماده کردن ویدیو…' : 'در حال آماده کردن…'}</p></div>`}
      <button class="btn block" data-del>حذف</button>`;
    body.querySelector('[data-close]').onclick = () => sheet.close();
    body.querySelector('[data-del]').onclick = async () => {
      if (!(await confirmBox('از صندوقچه حذف شود؟', 'حذف'))) return;
      store.deleteVaultItem(v.id);
      sheet.close();
      toast('حذف شد');
    };
    const stage = body.querySelector('.vault-stage');
    if (!stage) return;
    store.vaultFileUrl(v.path).then(u => {
      if (!stage.isConnected) return;
      stage.innerHTML = v.kind === 'video'
        ? `<video class="vault-media" src="${u}" controls autoplay playsinline loop></video>`
        : `<img class="vault-media" src="${u}" alt="">`;
    }).catch(x => { if (stage.isConnected) stage.innerHTML = `<p class="err">${esc(x.message)}</p>`; });
  }, { tall: v.kind !== 'link' });
}

/* ---------------- settings ---------------- */
function openSettings() {
  sheet.open(body => {
    const draw = () => {
      const label = EVERY.find(([n]) => n === every())?.[1] || `هر ${fa(every())} روز`;
      body.innerHTML = `
        <div class="sheet-head"><span></span><h2>تنظیمات صندوقچه</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
        <div class="field"><span>یادآوری در صفحه‌ی «امروز»، اگر سری به صندوقچه نزده باشی</span>
          <button type="button" class="pick" data-every><span>${label}</span>${icon.chevD}</button></div>
        <button class="btn block" data-pin>عوض کردن رمز</button>`;
      body.querySelector('[data-close]').onclick = () => sheet.close();
      body.querySelector('[data-every]').onclick = async () => {
        const v = await choose('یادآوری', EVERY.map(([n, l]) => ({ value: String(n), label: l })), String(every()));
        if (v === null) return;
        saveSettings({ every: Number(v) });
        draw();
      };
      body.querySelector('[data-pin]').onclick = () => askNewPin(body, () => { sheet.close(); toast('رمز عوض شد'); });
    };
    draw();
  });
}

/* ---------------- the reminder on Today ---------------- */
const NUDGES = [
  'یک نگاه بینداز تا یادت بیاید چرا شروع کردی.',
  'دو دقیقه وقت بگذار؛ همان چیزهایی آنجاست که خودت گفتی حالت را عوض می‌کند.',
  'قبل از وعده‌ی بعدی یک سر بزن؛ انتخاب‌هایت راحت‌تر می‌شود.',
];

export function vaultNudge() {
  const t = today();
  if (!store.get().vault?.length || !settings().pin || !every() || dismissed('vault-nudge', t)) return '';
  const seen = lastSeen();
  const days = seen ? diffDays(t, seen) : null;
  if (days !== null && days < every()) return '';
  const since = days === null ? 'هنوز روی این گوشی صندوقچه‌ات را باز نکرده‌ای.' : `${fa(days)} روز است سری به صندوقچه‌ات نزده‌ای.`;
  return `<section class="note soft vault-nudge">
    <strong>${icon.lock} وقت سر زدن به صندوقچه است</strong>
    <p>${since} ${NUDGES[new Date().getDate() % NUDGES.length]}</p>
    <div class="row gap"><button class="btn primary sm" data-vault-open>باز کن</button><button class="btn ghost sm" data-vault-later>بعداً</button></div>
  </section>`;
}

// Wires every «صندوقچه» button under root (the reminder, and plain entry buttons).
export function bindVault(root) {
  root.querySelectorAll('[data-vault-open]').forEach(b => b.addEventListener('click', () => {
    b.closest('.vault-nudge')?.remove();
    openVault();
  }));
  root.querySelector('[data-vault-later]')?.addEventListener('click', e => {
    dismiss('vault-nudge', today());
    e.target.closest('.vault-nudge').remove();
  });
}
