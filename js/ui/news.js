/*
  «تازه‌ها» (#/news, a tile in «بیشتر»): the app's changes from js/data/news.js as cards, newest
  first. A card opens what it is about. Unread ones are marked; opening the page reads them all.
  The unread count sits on the tile and on the «بیشتر» tab. A `big` entry also comes up once,
  by itself, as a sheet when the app opens. Seen ids live in the profile (newsSeen, newsShown),
  so they are the same on every device of that member.
*/
import * as store from '../data/store.js';
import { NEWS } from '../data/news.js';
import { faDM } from '../lib/dates.js';
import { esc, fa } from '../lib/fa.js';
import { icon, sheet } from './dom.js';

export const NEWS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.8l1.9 4.6 4.9.4-3.7 3.2 1.1 4.8L12 13.2l-4.2 2.6 1.1-4.8L5.2 7.8l4.9-.4z"/><path d="M5 19.5h14M8 22h8"/></svg>';

const seen = () => store.profile()?.newsSeen || [];
export const unread = () => NEWS.filter(n => !seen().includes(n.id));

// The count on the «بیشتر» tab; called on every redraw.
export function markTab() {
  const a = document.querySelector('#nav a[data-route="tools"]');
  if (!a) return;
  const n = unread().length;
  let b = a.querySelector('.nav-count');
  if (!n) { b?.remove(); return; }
  if (!b) { b = document.createElement('b'); b.className = 'nav-count'; a.append(b); }
  b.textContent = fa(n);
}

let openTool = () => {};
export const setToolOpener = f => { openTool = f; };
function follow(n) {
  if (n.tool) openTool(n.tool);
  else if (n.go && location.hash !== n.go) {
    // from «امروز» a page is pushed, so back returns there (as with the tab bar in app.js)
    if (location.hash === '#/today' || !location.hash) location.hash = n.go; else location.replace(n.go);
  }
}

function markAll() {
  const p = store.profile();
  const ids = NEWS.map(n => n.id);
  if (ids.every(id => p.newsSeen?.includes(id))) return;
  store.saveProfile({ ...p, newsSeen: [...new Set([...(p.newsSeen || []), ...ids])] });
}

let fresh = null; // what was unread when the page opened, kept marked while it stays open
export function renderNews(root) {
  if (!fresh) { fresh = new Set(unread().map(n => n.id)); setTimeout(markAll, 0); }
  root.innerHTML = `
    <header class="page-head mag-head">
      <button class="link small mag-back" data-back>${icon.chevR} بیشتر</button>
      <h1>تازه‌ها</h1>
    </header>
    <div class="news-list">
      ${NEWS.map(n => `<button class="card news-card${fresh.has(n.id) ? ' fresh' : ''}" data-id="${n.id}">
        <small class="muted">${faDM(n.day)}</small>
        <b>${esc(n.title)}</b>
        ${n.body ? `<span>${esc(n.body)}</span>` : ''}
        ${n.go === '#/news' ? '' : icon.chevL}
      </button>`).join('')}
    </div>`;
  root.querySelector('[data-back]').onclick = () => location.replace('#/tools');
  root.querySelectorAll('.news-card').forEach(c => c.onclick = () => follow(NEWS.find(n => n.id === c.dataset.id)));
}
window.addEventListener('hashchange', () => { if (location.hash !== '#/news') fresh = null; });

// A big entry, once: a sheet with the news and «ببین» / «بعداً».
let timer;
export function maybeAnnounce() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const p = store.profile();
    if (!p?.onboarded || location.hash === '#/news' || location.hash === '#/game') return;
    if (document.querySelector('.sheet-wrap, .party') || document.body.classList.contains('kb') || document.body.classList.contains('chat-mode')) return;
    const n = unread().find(x => x.big && !(p.newsShown || []).includes(x.id));
    if (!n) return;
    store.saveProfile({ ...p, newsShown: [...(p.newsShown || []), n.id] });
    sheet.open(body => {
      body.innerHTML = `
        <div class="news-big">
          <i class="news-big-ic">${NEWS_ICON}</i>
          <h2>${esc(n.title)}</h2>
          ${n.body ? `<p>${esc(n.body)}</p>` : ''}
          <div class="row gap">
            <button class="btn grow" data-later>بعداً</button>
            <button class="btn primary grow" data-see>ببین</button>
          </div>
        </div>`;
      body.querySelector('[data-later]').onclick = () => sheet.close();
      body.querySelector('[data-see]').onclick = () => sheet.closeThen(() => follow(n));
    });
  }, 1500);
}
