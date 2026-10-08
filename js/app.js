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

const view = $('#view');
const nav = $('#nav');

const ROUTES = {
  today: { label: 'امروز', icon: icon.today, render: renderToday },
  progress: { label: 'پیشرفت', icon: icon.chart, render: renderProgress },
  review: { label: 'مرور هفته', icon: icon.week, render: renderReview },
  profile: { label: 'نمایه', icon: icon.user, render: renderProfile },
};

nav.innerHTML = Object.entries(ROUTES).map(([k, r]) => `<a href="#/${k}" data-route="${k}" aria-label="${r.label}">${r.icon}<span>${r.label}</span></a>`).join('');

const route = () => (location.hash.replace('#/', '') in ROUTES ? location.hash.replace('#/', '') : 'today');

let started = false;
function render() {
  if (!started) return;
  const p = store.profile();
  if (!p?.onboarded) {
    nav.hidden = true;
    renderOnboarding(view, () => { location.hash = '#/today'; render(); });
    return;
  }
  nav.hidden = false;
  const r = route();
  nav.querySelectorAll('a').forEach(a => a.classList.toggle('on', a.dataset.route === r));
  ROUTES[r].render(view);
}

// Don't redraw under someone's fingers: if a field in the page has focus, wait until they leave it.
let pending = false;
const isField = el => el && view.contains(el) && el.matches('input, textarea, select');
function requestRender() {
  if (!store.profile()?.onboarded && view.querySelector('.onb')) return; // questionnaire keeps its own state
  if (isField(document.activeElement)) { pending = true; return; }
  render();
}
view.addEventListener('focusout', e => {
  if (pending && !isField(e.relatedTarget)) { pending = false; setTimeout(render, 0); }
});

window.addEventListener('hashchange', () => { sheet.closeAll(); resetWeighDay(); render(); window.scrollTo(0, 0); });
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
      started = false;
      nav.hidden = true;
      renderLogin(view, sb);
      return;
    }
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
