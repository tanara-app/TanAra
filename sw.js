/* App-shell cache for تن‌آرا: makes the app installable and lets it open offline.
   Own files are network-first, so a new deploy shows up on the next online open;
   the cache is only the fallback. Pinned CDN files are cache-first.
   Supabase API calls are never touched. Bump CACHE when the shell list changes. */
const CACHE = 'tanara-shell-v5';
const SHELL = [
  './', './index.html', './manifest.json', './css/app.css',
  './js/app.js', './js/config.js',
  './js/lib/fa.js', './js/lib/dates.js',
  './js/domain/targets.js', './js/domain/stats.js', './js/domain/safety.js',
  './js/data/store.js', './js/data/supabaseRemote.js', './js/data/seedFoods.js',
  './js/ui/dom.js', './js/ui/onboarding.js', './js/ui/today.js', './js/ui/logFood.js', './js/ui/foodBank.js',
  './js/ui/progress.js', './js/ui/review.js', './js/ui/profile.js', './js/ui/login.js', './js/ui/chart.js', './js/ui/notices.js', './js/ui/motivation.js',
  './favicon-32-v2.png', './icon-192-v2.png', './icon-512-v2.png', './icon-maskable-192-v2.png', './icon-maskable-512-v2.png', './apple-touch-icon-v2.png',
];
const VENDOR_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
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

  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html'))));
});
