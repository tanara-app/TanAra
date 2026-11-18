/*
  «جوایز» (a tile in «بیشتر», for everyone): every reward of js/domain/rewards.js as one card the
  same way — a live showcase, its name, a few words on what it is, the goal, and the progress bar, or
  once earned a mark that says so. A finish is then worn from «ظاهر» (profile.js), not from here.
  A game (kind 'game') is a card that opens its own page (promo, below); once earned it is a tile in
  «بیشتر» (tools.js) that opens the game in a tall sheet (openGame).
  Earned rewards are written down in profile.data.rewards the first time they are seen.
*/
import * as store from '../data/store.js';
import { sheet, icon, toast } from './dom.js';
import { fa } from '../lib/fa.js';
import { today } from '../lib/dates.js';
import { progress, goalText, rewardOf } from '../domain/rewards.js';
import { getFinish, setFinish } from './theme.js';

const LOCK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>';
const MOON = '<svg viewBox="0 0 48 48" aria-hidden="true"><mask id="sb-moon-cut"><rect width="48" height="48" fill="#fff"/><circle cx="32" cy="17" r="15" fill="#000"/></mask><circle cx="24" cy="24" r="18" fill="currentColor" mask="url(#sb-moon-cut)"/></svg>';
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" fill="currentColor"/></svg>';

// A finish worn on a device whose member has not earned it (another account signed in) comes off.
export function guardFinish() {
  const f = getFinish();
  if (f && !store.profile()?.rewards?.[f]) setFinish(null);
}

const listNow = () => {
  const s = store.get();
  return progress({ entries: s.entries, notes: s.ai_notes, foods: s.foods, earned: store.profile()?.rewards }, today());
};

// Whether a reward is theirs: written down, or its goal met now (written down when they next open «جوایز» or the game).
export const hasReward = key => !!listNow().find(x => x.reward.key === key)?.earned;

// Rewards met but not written down yet are written down now (once); returns their names.
function settle(list) {
  const p = store.profile();
  const got = p.rewards || {};
  const fresh = list.filter(x => x.earned && !got[x.reward.key]);
  if (!fresh.length) return [];
  store.saveProfile({ ...p, rewards: { ...got, ...Object.fromEntries(fresh.map(x => [x.reward.key, today()])) } });
  return fresh.map(x => x.reward.name);
}

// each reward's showcase, drawn live in the colours they use now
const SHOWCASE = {
  parniyan: () => `
    <i class="pn-star s1">${STAR}</i><i class="pn-star s2">${STAR}</i><i class="pn-star s3">${STAR}</i>
    <div class="pn-phone">
      <div class="pn-card pn-sum"><div class="pn-ring"><b>${fa(740)}</b></div><div class="pn-lines"><i></i><i></i><i></i></div></div>
      <div class="pn-card"><div class="pn-meal"><b>ناهار</b><span>${fa(410)} از ${fa(600)}</span></div><div class="pn-bar"><i></i></div></div>
      <div class="pn-btn">ثبت غذا</div>
    </div>`,
  shab: () => `
    <i class="sb-moon">${MOON}</i><i class="sb-shoot"></i><i class="sb-tw t1"></i><i class="sb-tw t2"></i><i class="sb-tw t3"></i>
    <div class="sb-phone">
      <div class="sb-card sb-sum"><div class="sb-ring"><b>${fa(740)}</b></div><div class="sb-lines"><i></i><i></i><i></i></div></div>
      <div class="sb-card"><div class="sb-meal"><b>شام</b><span>${fa(520)} از ${fa(600)}</span></div><div class="sb-bar"><i></i></div></div>
      <div class="sb-btn">ثبت غذا</div>
    </div>`,
};

/*
  «تنگاتنگ»: its creatures in the game's own look (dark outline #5D4E51, pastel fills, two eyes), one
  dropping into the rocket over and over while the others float. Drawn here, no pictures.
*/
const INK = '#5D4E51';
const BLOCKY = {
  L: 'M0 0h16v32h16v16H0z', T: 'M0 0h48v16H32v16H16V16H0z', S: 'M16 0h32v16H32v16H0V16h16z', O: 'M0 0h32v32H0z',
};
const blocky = (shape, fill, ex, ey) => `<path d="${BLOCKY[shape]}" fill="${fill}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/>
  <circle cx="${ex}" cy="${ey}" r="2.8" fill="${INK}"/><circle cx="${ex + 7}" cy="${ey}" r="2.8" fill="${INK}"/>
  <circle cx="${ex - .8}" cy="${ey - 1}" r="1" fill="#fff"/><circle cx="${ex + 6.2}" cy="${ey - 1}" r="1" fill="#fff"/>`;
const ttScene = () => `<svg class="tt-scene" viewBox="0 0 360 250" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <rect width="360" height="250" fill="#94DEC3"/>
  <circle cx="180" cy="470" r="300" fill="#FED1E6"/>
  <ellipse cx="180" cy="300" rx="230" ry="90" fill="none" stroke="#000" stroke-opacity=".04" stroke-width="26"/>
  <circle cx="300" cy="52" r="30" fill="#FDF3BD"/><circle cx="286" cy="42" r="30" fill="#94DEC3"/>
  <ellipse cx="62" cy="62" rx="26" ry="8" fill="#000" fill-opacity=".05"/><circle cx="62" cy="62" r="14" fill="#FFC886"/><ellipse cx="62" cy="58" rx="14" ry="5" fill="#FFC886"/>
  <g fill="#fff"><circle class="tt-tw" cx="30" cy="30" r="2.2"/><circle cx="120" cy="22" r="1.6"/><circle class="tt-tw d2" cx="210" cy="40" r="2"/>
    <circle cx="250" cy="110" r="1.4"/><circle class="tt-tw d3" cx="96" cy="118" r="1.8"/><circle cx="335" cy="140" r="1.6"/><circle cx="24" cy="160" r="1.4"/></g>
  <g transform="translate(180 120)">
    <g class="tt-rocket">
      <path d="M-34 70l-22 26h22zM34 70l22 26H34z" fill="${INK}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
      <g class="tt-fire"><ellipse cx="0" cy="104" rx="11" ry="24" fill="#FF9E67"/><ellipse cx="0" cy="102" rx="6" ry="15" fill="#FEE66C"/></g>
      <path d="M-14 88h28l4 10h-36z" fill="${INK}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M-36 90V-4Q-36-12-30-14L0-44L30-14Q36-12 36-4V90z" fill="#7DC864" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
      <path d="M-33-12L0-42L33-12z" fill="${INK}"/>
      <g fill="#000" fill-opacity=".1" stroke="${INK}" stroke-width="2">
        ${[0, 1, 2, 3].map(r => [0, 1, 2].map(c => `<rect x="${-25 + c * 17}" y="${4 + r * 19}" width="15" height="17" rx="3"/>`).join('')).join('')}
      </g>
    </g>
  </g>
  <g transform="translate(152 4) scale(1.15)"><g class="tt-drop">${blocky('S', '#C2FDFF', 4, 26)}</g></g>
  <g transform="translate(62 112) scale(1.25)"><g class="tt-bob">${blocky('L', '#FFEA7E', 3, 40)}</g></g>
  <g transform="translate(250 118) scale(1.2)"><g class="tt-bob d2">${blocky('T', '#FF7E64', 20, 8)}</g></g>
  <g transform="translate(262 190) scale(1.2)"><g class="tt-bob d3">${blocky('O', '#A09CF1', 9, 12)}</g></g>
</svg>`;
SHOWCASE.tangatang = ttScene;

const PLAY = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';

function card({ reward: r, earned, now, of }) {
  const game = r.kind === 'game';
  return `<article class="rw-card${earned ? ' got' : ''}${game ? ' tap' : ''}"${game ? ` role="button" tabindex="0" data-promo="${r.key}"` : ''}>
    <div class="rw-show rw-${r.key}">${SHOWCASE[r.key]?.() || ''}${earned ? '' : `<span class="rw-lock">${LOCK}</span>`}</div>
    <div class="rw-info">
      <div class="rw-title"><h3>${r.name}</h3><small>${r.about}</small></div>
      <p class="rw-goal">${goalText(r, fa)}</p>
      ${earned
        ? `<p class="rw-got">${icon.check}<span>${game ? 'در «بیشتر»' : 'در «ظاهر»'}</span></p>`
        : `<div class="rw-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${of}" aria-valuenow="${now}"><i style="width:${now / of * 100}%"></i></div>
           <p class="rw-count"><b>${fa(now)}</b> از ${fa(of)}</p>`}
    </div>
  </article>`;
}

// what each game's page says about it, beside the showcase
const PROMO = {
  tangatang: {
    line: 'بلوکی‌های بامزه توی کهکشان گم شده‌اند. تنگاتنگ توی موشک جایشان بده و برسانشان خانه.',
    tags: ['پنج حالت', 'بی‌عجله', 'بی‌اینترنت'],
    credit: '<bdi>Mattia Fortunati</bdi> · <bdi>js13kGames 2021</bdi>',
  },
};

// A game's own page in «جوایز»: a big showcase, a line about it, the goal and how far along, or «بازی کن».
function openPromo(key) {
  const r = rewardOf(key), p = PROMO[key];
  sheet.open(body => {
    const x = listNow().find(y => y.reward.key === key);
    body.innerHTML = `
      <div class="sheet-head"><span></span><h2>${r.name}</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <div class="promo">
        <div class="promo-show rw-show rw-${key}">${SHOWCASE[key]()}${x.earned ? '' : `<span class="rw-lock">${LOCK}</span>`}</div>
        <p class="promo-line">${p.line}</p>
        <div class="promo-tags">${p.tags.map(t => `<span>${t}</span>`).join('')}</div>
        ${x.earned
          ? `<button class="btn primary promo-play" data-play>${PLAY}<span>بازی کن</span></button>`
          : `<div class="promo-goal">
              <p class="rw-goal">${goalText(r, fa)}</p>
              <div class="rw-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${x.of}" aria-valuenow="${x.now}"><i style="width:${x.now / x.of * 100}%"></i></div>
              <p class="rw-count"><b>${fa(x.now)}</b> از ${fa(x.of)}</p>
            </div>`}
        <p class="promo-credit">${p.credit}</p>
      </div>`;
    body.querySelector('[data-close]').onclick = () => sheet.close();
    body.querySelector('[data-play]')?.addEventListener('click', () => openGame(key));
  }, { tall: true });
}

// The game itself, full height in a sheet; closing the sheet removes the frame and its sound with it.
export function openGame(key) {
  const r = rewardOf(key);
  if (!r || r.kind !== 'game') return;
  const fresh = settle(listNow());
  if (fresh.length) toast(`${fresh.join('، ')} باز شد`);
  sheet.open(body => {
    body.innerHTML = `
      <div class="sheet-head"><span></span><h2>${r.name}</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <iframe class="game-frame" src="games/${key}/index.html" title="${r.name}" allow="autoplay"></iframe>`;
    body.querySelector('[data-close]').onclick = () => sheet.close();
  }, { tall: true });
}

export function openRewards() {
  sheet.open(body => {
    const list = listNow();
    const fresh = settle(list);
    if (fresh.length) toast(`${fresh.join('، ')} باز شد`);
    body.innerHTML = `
      <div class="sheet-head"><h2>جوایز</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <div class="rw-list">${list.map(card).join('')}</div>`;
    body.querySelector('[data-close]').onclick = () => sheet.close();
    body.querySelectorAll('[data-promo]').forEach(el => {
      el.addEventListener('click', () => openPromo(el.dataset.promo));
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPromo(el.dataset.promo); } });
    });
  }, { tall: true });
}
