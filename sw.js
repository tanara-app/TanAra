/* App-shell cache for تن‌آرا: makes the app installable and lets it open offline.
   Own files are network-first, so a new deploy shows up on the next online open;
   the cache is only the fallback. Pinned CDN files are cache-first.
   Supabase API calls are never touched. Bump CACHE when the shell list changes.
   Only old shell caches are cleared on activate: «tanara-vault» (see store.js) must survive.
   Also shows the push reminders sent by the `remind` Edge Function (see ui/reminders.js). */
const CACHE = 'tanara-shell-v12';
const SHELL = [
  './', './index.html', './manifest.json', './css/app.css',
  './js/app.js', './js/config.js',
  './js/lib/fa.js', './js/lib/dates.js',
  './js/domain/targets.js', './js/domain/stats.js', './js/domain/safety.js', './js/domain/plan.js',
  './js/domain/energy.js', './js/domain/phase.js', './js/domain/photo.js',
  './js/data/store.js', './js/data/supabaseRemote.js', './js/data/seedFoods.js',
  './js/ui/dom.js', './js/ui/onboarding.js', './js/ui/today.js', './js/ui/logFood.js', './js/ui/foodBank.js',
  './js/ui/progress.js', './js/ui/review.js', './js/ui/profile.js', './js/ui/login.js', './js/ui/chart.js', './js/ui/notices.js', './js/ui/motivation.js', './js/ui/vault.js',
  './js/ai/hooshvareh.js', './js/ui/chat.js', './js/ui/aiCards.js', './js/ui/units.js', './js/ui/plan.js', './js/ui/magazine.js',
  './js/ui/phase.js', './js/ui/reminders.js', './js/ui/usage.js', './js/ui/photo.js',
  './favicon-32-v2.png', './icon-192-v2.png', './icon-512-v2.png', './icon-maskable-192-v2.png', './icon-maskable-512-v2.png', './apple-touch-icon-v2.png',
];
const VENDOR_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('tanara-shell-') && k !== CACHE).map(k => caches.delete(k)))));
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

  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  // offline: the cached copy; only a page load falls back to the app shell (a script or
  // stylesheet that isn't cached must fail, not be answered with HTML)
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});

/* ---------------- reminders ---------------- */

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch { /* an empty push still has to show something */ }
  e.waitUntil(self.registration.showNotification(d.title || 'تن‌آرا', {
    body: d.body || '', tag: d.tag || 'tanara', icon: './icon-192-v2.png', badge: './icon-maskable-192-v2.png',
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
