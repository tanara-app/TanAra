/* App-shell cache for تن‌آرا: makes the app installable and lets it open offline.
   The app's own code and pages (the non-picture files of SHELL) come straight from the phone's copy, so the
   app opens at once even on a slow or stuck connection (before 2026-11-19 they were network-first with no
   time limit: 86 requests on every open, and a connection that hung kept the screen blank). New versions
   come in the background: once the app has loaded it asks for a check ('refresh'); every code file is fetched
   again, and only when all of them arrived and something changed is the whole set put in the cache at once
   (never half a version), and the page is told ('updated'; app.js puts it on without interrupting anything).
   Pictures (.webp/.png) come from the cache and are refreshed behind it one by one. All of them skip the
   browser's HTTP cache (GitHub Pages sends max-age=600, which would hide a deploy for 10 min).
   Pinned CDN files are cache-first; other own files (sounds, the game's extras) are network-first.
   Supabase API calls are never touched. Bump CACHE when the shell list changes.
   Every other cache is cleared on activate (including «tanara-vault», from the removed vault).
   Also shows the push reminders sent by the `remind` Edge Function (see ui/reminders.js). */
const CACHE = 'tanara-shell-v124';
const SHELL = [
  './', './index.html', './manifest.json', './css/app.css',
  './js/app.js', './js/config.js',
  './js/lib/fa.js', './js/lib/dates.js',
  './js/domain/targets.js', './js/domain/stats.js', './js/domain/safety.js', './js/domain/plan.js', './js/domain/health.js',
  './js/domain/energy.js', './js/domain/phase.js', './js/domain/photo.js', './js/domain/recipe.js', './js/domain/shopping.js', './js/data/shop.js', './js/domain/barcode.js', './js/domain/occasions.js', './js/domain/drift.js', './js/domain/pattern.js', './js/domain/portion.js', './js/domain/fit.js', './js/data/usual.js', './js/domain/meals.js', './js/domain/quality.js', './js/domain/nutrients.js', './js/data/nutrients.js', './js/domain/combos.js', './js/data/combos.js', './js/domain/chatText.js',
  './js/data/store.js', './js/data/supabaseRemote.js', './js/data/seedFoods.js',
  './js/ui/dom.js', './js/ui/onboarding.js', './js/ui/today.js', './js/ui/eat.js', './js/ui/meal.js', './js/ui/packs.js', './js/ui/logFood.js', './js/ui/foodBank.js',
  './js/ui/progress.js', './js/ui/review.js', './js/ui/profile.js', './js/ui/login.js', './js/ui/chart.js', './js/ui/notices.js', './js/ui/motivation.js',
  './js/ai/hooshvareh.js', './js/ai/foodTags.js', './js/ui/chat.js', './js/ui/aiCards.js', './js/ui/tip.js', './js/domain/tips.js', './js/data/tips.js', './js/ui/units.js', './js/ui/plan.js', './js/ui/magazine.js',
  './js/ui/phase.js', './js/ui/reminders.js', './js/ui/usage.js', './js/ui/photo.js', './js/ui/recipes.js', './js/ui/measure.js', './js/ui/shopping.js', './js/ui/tools.js', './js/ui/barcode.js', './js/ui/theme.js', './js/ui/activity.js', './js/ui/checkin.js', './js/ui/mascot.js', './js/ui/buddies.js', './js/ui/celebrate.js', './js/ui/feedback.js', './js/ui/foodShare.js', './js/domain/foodMatch.js', './js/ui/family.js', './js/domain/family.js', './js/ui/landArt.js', './img/land/base-land.webp', './img/tools/shop.webp', './img/tools/bank.webp', './img/tools/recipes.webp', './img/tools/mag.webp', './img/tools/share.webp', './img/tools/rewards.webp', './js/ui/rewards.js', './js/ui/ttArt.js', './js/domain/rewards.js', './js/ui/labs.js', './js/domain/labs.js', './games/tangatang/index.html', './games/tangatang/game.js',
  './favicon-32-v2.png', './icon-192-v2.png', './icon-512-v2.png', './icon-maskable-192-v2.png', './icon-maskable-512-v2.png', './apple-touch-icon-v2.png', './badge-96.png',
  './img/mascot/happy.webp', './img/mascot/surprised.webp', './img/mascot/proud.webp', './img/mascot/wink.webp', './img/mascot/calm.webp', './img/mascot/thinking.webp',
  './img/mascot/caring.webp', './img/mascot/excited.webp', './img/mascot/wave.webp', './img/mascot/hello.webp', './img/mascot/sleepy.webp',
  './img/mascot/party.webp', './img/mascot/wave-blink.webp', './img/mascot/happy-blink.webp', './img/mascot/calm-blink.webp', './img/mascot/hello-blink.webp',
];
// fastly.jsdelivr.net: the barcode reader's WebAssembly (pinned version), for phones without a built-in one
const VENDOR_HOSTS = ['cdn.jsdelivr.net', 'fastly.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

// the app's code and pages: everything of SHELL but the pictures, each kept under its address without a query
const isPicture = u => /\.(webp|png)$/.test(u);
const CODE = SHELL.filter(u => !isPicture(u)).map(u => new URL(u, self.location).href);
const CODE_SET = new Set(CODE);
const refetch = u => fetch(new Request(u, { cache: 'no-cache' }));

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (VENDOR_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }

  if (url.origin !== self.location.origin) return;

  const key = url.origin + url.pathname;
  if (CODE_SET.has(key)) {
    e.respondWith(caches.match(key, { ignoreVary: true }).then(hit => hit || refetch(key).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
      return res;
    })).catch(() => (req.mode === 'navigate' ? caches.match(new URL('./index.html', self.location).href) : Response.error())));
    return;
  }

  if (isPicture(url.pathname)) {
    const fresh = fetch(req, { cache: 'no-cache' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    });
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
      if (!hit) return fresh;
      e.waitUntil(fresh.catch(() => {}));
      return hit;
    }));
    return;
  }

  e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  // offline: the cached copy; only a page load falls back to the app shell (a script or
  // stylesheet that isn't cached must fail, not be answered with HTML)
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});

/* ---------------- a new version, in the background ---------------- */

const same = (a, b) => {
  if (a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a), y = new Uint8Array(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
};

// Fetches every code file again; true when a new version was put in the cache (all of it or nothing).
async function update() {
  const got = await Promise.all(CODE.map(u => refetch(u).then(res => { if (!res.ok) throw new Error(`${res.status} ${u}`); return res; })));
  const cache = await caches.open(CACHE);
  let changed = false;
  for (let i = 0; i < CODE.length && !changed; i++) {
    const old = await cache.match(CODE[i], { ignoreVary: true });
    changed = !old || !same(await old.arrayBuffer(), await got[i].clone().arrayBuffer());
  }
  if (!changed) return false;
  await Promise.all(got.map((res, i) => cache.put(CODE[i], res)));
  return true;
}

let checking = null, checkedAt = 0;
self.addEventListener('message', e => {
  if (e.data !== 'refresh' || checking || Date.now() - checkedAt < 10e3) return; // not twice in a row (load and coming back)
  checkedAt = Date.now();
  checking = update()
    .then(changed => changed && self.clients.matchAll({ type: 'window' }).then(list => list.forEach(c => c.postMessage('updated'))))
    .catch(() => { checkedAt = 0; }) // offline or a file missing: the version on the phone stays, asked again next time
    .finally(() => { checking = null; });
  e.waitUntil(checking);
});

/* ---------------- reminders ---------------- */

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch { /* an empty push still has to show something */ }
  // badge is the small status-bar icon: Android keeps only its alpha channel, so it has to be
  // a transparent white silhouette (an opaque icon shows up as a plain white square)
  e.waitUntil(self.registration.showNotification(d.title || 'تن‌آرا', {
    body: d.body || '', tag: d.tag || 'tanara', icon: './icon-192-v2.png', badge: './badge-96.png',
    dir: 'rtl', lang: 'fa', data: { url: d.url || './' },
  }));
});

// Tapping a reminder opens the app on the screen it is about (or brings the open app there).
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.registration.scope));
    if (!open) return self.clients.openWindow(url);
    return open.focus().then(c => c.navigate(url)).catch(() => {});
  }));
});
