// Entry point: auth → store → router.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import * as store from './data/store.js';
import { createSupabaseRemote } from './data/supabaseRemote.js';
import { $, icon, sheet } from './ui/dom.js';
import { today } from './lib/dates.js';
import { renderOnboarding } from './ui/onboarding.js';
import { renderToday, setDay } from './ui/today.js';
import { renderProgress, resetWeighDay } from './ui/progress.js';
import { renderReview } from './ui/review.js';
import { renderProfile, setSession } from './ui/profile.js';
import { renderLogin } from './ui/login.js';
import { renderChat } from './ui/chat.js';
import { configureAI, sparkle } from './ai/hooshvareh.js';

const view = $('#view');
const nav = $('#nav');

const ROUTES = {
  today: { label: 'امروز', icon: icon.today, render: renderToday },
  progress: { label: 'پیشرفت', icon: icon.chart, render: renderProgress },
  ai: { label: 'هوشواره', icon: sparkle(24), render: renderChat },
  review: { label: 'مرور هفته', icon: icon.week, render: renderReview },
  profile: { label: 'نمایه', icon: icon.user, render: renderProfile },
};

nav.innerHTML = Object.entries(ROUTES).map(([k, r]) => `<a href="#/${k}" data-route="${k}" aria-label="${r.label}">${r.icon}<span>${r.label}</span></a>`).join('');

const route = () => (location.hash.replace('#/', '') in ROUTES ? location.hash.replace('#/', '') : 'today');

/*
  Back button: tabs don't pile up in history. From «امروز» a tab is pushed (back returns to
  امروز); between other tabs it's replaced; back on امروز leaves the app. Sheets add their
  own entries on top (see sheet in dom.js), so back closes a sheet first.
*/
nav.addEventListener('click', e => {
  const a = e.target.closest('a[data-route]');
  if (!a) return;
  e.preventDefault();
  const to = a.dataset.route, from = route();
  if (to === from) return;
  if (from === 'today') { location.hash = `#/${to}`; history.replaceState({ tab: true }, ''); }
  else if (to === 'today' && history.state?.tab) history.back();
  else location.replace(`#/${to}`);
});
// Opened straight on a tab (reload, shortcut): put امروز underneath so back goes there first.
if (route() !== 'today' && !history.state) {
  const h = location.hash;
  history.replaceState(null, '', '#/today');
  history.pushState({ tab: true }, '', h);
}

/*
  Keyboard: --app-h / --app-top follow the visible area (above the on-screen keyboard), and
  body.kb is set while it's open so the tab bar steps aside — the chat composer then sits
  right on the keyboard, like a messenger.
*/
let fullH = window.innerHeight;
function trackViewport() {
  const vv = window.visualViewport;
  const h = vv ? vv.height : window.innerHeight;
  fullH = Math.max(fullH, window.innerHeight);
  const root = document.documentElement.style;
  root.setProperty('--app-h', `${Math.round(h)}px`);
  root.setProperty('--app-top', `${Math.round(vv ? vv.offsetTop : 0)}px`);
  const typing = document.activeElement?.matches?.('input, textarea, [contenteditable]');
  document.body.classList.toggle('kb', !!typing && h < fullH * 0.8);
}
window.visualViewport?.addEventListener('resize', trackViewport);
window.visualViewport?.addEventListener('scroll', trackViewport);
window.addEventListener('resize', trackViewport);
window.addEventListener('orientationchange', () => { fullH = 0; setTimeout(trackViewport, 300); });
document.addEventListener('focusin', () => setTimeout(trackViewport, 50));
document.addEventListener('focusout', () => setTimeout(trackViewport, 50));
trackViewport();

let started = false;
function render() {
  if (!started) return;
  const p = store.profile();
  if (!p?.onboarded) {
    nav.hidden = true;
    document.body.classList.remove('chat-mode');
    view.classList.remove('chat-view');
    renderOnboarding(view, () => { location.hash = '#/today'; render(); });
    return;
  }
  nav.hidden = false;
  const r = route();
  document.body.classList.toggle('chat-mode', r === 'ai');
  view.classList.toggle('chat-view', r === 'ai');
  nav.querySelectorAll('a').forEach(a => a.classList.toggle('on', a.dataset.route === r));
  ROUTES[r].render(view);
}

// Don't redraw under someone's fingers: if a field in the page has focus, wait until they leave it.
let pending = false;
const isField = el => el && view.contains(el) && el.matches('input, textarea, select');
function requestRender() {
  if (!store.profile()?.onboarded && view.querySelector('.onb')) return; // questionnaire keeps its own state
  // the chat screen only redraws its message list, so typing there is never disturbed
  if (route() === 'ai' && view.querySelector('.chat-bar')) { render(); return; }
  if (isField(document.activeElement)) { pending = true; return; }
  render();
}
view.addEventListener('focusout', e => {
  if (pending && !isField(e.relatedTarget)) { pending = false; setTimeout(render, 0); }
});

window.addEventListener('hashchange', () => { sheet.closeAll({ history: false }); resetWeighDay(); render(); window.scrollTo(0, 0); });
store.subscribe(requestRender);

async function start(ns, remote) {
  store.init(ns, remote);
  if (remote && !store.profile()) {
    // nothing cached on this device yet — fetch first so we don't show the questionnaire by mistake
    view.innerHTML = '<div class="loading">در حال بارگذاری…</div>';
    await store.pull();
  }
  started = true;
  render();
  if (remote) {
    store.pull();
    window.addEventListener('online', () => store.pull());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') store.pull(); });
  }
}

// Midnight rollover: if the app stays open past midnight, "today" moves on.
let lastDay = new Date().toDateString();
setInterval(() => {
  const d = new Date().toDateString();
  if (d !== lastDay) { lastDay = d; setDay(today()); requestRender(); }
}, 60000);

/*
  ?local in the URL runs the whole app against this browser only, with no server —
  for trying things out without touching real data.
*/
const params = new URLSearchParams(location.search);
if (params.has('local')) {
  setSession({ local: true });
  start('local', null);
} else if (!window.supabase) {
  view.innerHTML = '<div class="onb"><h1>اتصال برقرار نشد</h1><p class="muted">اینترنت را بررسی کنید و صفحه را دوباره باز کنید.</p><button class="btn primary block" onclick="location.reload()">دوباره</button></div>';
} else {
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  let currentId; // undefined until the first auth event, then a user id or null
  const onSession = session => {
    const user = session?.user || null;
    if (currentId !== undefined && (user?.id ?? null) === currentId) return;
    currentId = user?.id ?? null;
    if (!user) {
      configureAI(null);
      started = false;
      nav.hidden = true;
      document.body.classList.remove('chat-mode');
      view.classList.remove('chat-view');
      renderLogin(view, sb);
      return;
    }
    configureAI(async () => (await sb.auth.getSession()).data.session?.access_token || null);
    setSession({
      local: false,
      email: user.email,
      signOut: async () => { store.clearLocal(); await sb.auth.signOut(); location.hash = '#/today'; },
    });
    start(user.id, createSupabaseRemote(sb));
  };
  // supabase-js advises against awaiting its calls inside this callback, so defer.
  sb.auth.onAuthStateChange((_e, session) => setTimeout(() => onSession(session), 0));
}

// Service worker: makes the app installable and lets it open without internet.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW register failed', e));
}
