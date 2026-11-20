/*
  «جوایز» (a tile in «بیشتر», for everyone): every reward of js/domain/rewards.js as one card the
  same way — a live showcase, its name, a few words on what it is, the goal, and the progress bar, or
  once earned a mark that says so. A finish is then worn from «ظاهر» (profile.js), not from here.
  Every card opens the reward's own page (openPromo, below): a poster, the goal day by day, and its
  rules in plain words (goalRules in domain/rewards.js), so everyone knows what counts (the owner's
  request, 2026-11-20). A game (kind 'game') is, once earned, a tile in «بیشتر» (tools.js) that opens
  the game in a tall sheet (openGame). A companion (kind 'buddy') is picked in «تنظیمات» ← «همراه»
  once earned (profile.js, mascot.js).
  Earned rewards are written down in profile.data.rewards the first time they are seen.
*/
import * as store from '../data/store.js';
import { sheet, icon, toast } from './dom.js';
import { fa } from '../lib/fa.js';
import { today, faDM } from '../lib/dates.js';
import { progress, goalText, goalRules, rewardOf } from '../domain/rewards.js';
import { getFinish, setFinish } from './theme.js';
import { ttArt } from './ttArt.js';
import { tasteLines, sayAloud, hush } from './mascot.js';

const LOCK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>';
const MOON = '<svg viewBox="0 0 48 48" aria-hidden="true"><mask id="sb-moon-cut"><rect width="48" height="48" fill="#fff"/><circle cx="32" cy="17" r="15" fill="#000"/></mask><circle cx="24" cy="24" r="18" fill="currentColor" mask="url(#sb-moon-cut)"/></svg>';
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" fill="currentColor"/></svg>';

/*
  Trying a reward before it is earned (the owner's request, 2026-11-20): a finish is worn for two
  minutes, the game is played for two minutes, a companion says a few of its lines when tapped. The
  finish and the game can each be tried once a day on this device, so the trial never stands in for
  the reward; the companion as often as they like.
*/
const TRIAL_MS = 2 * 60 * 1000;
const TRIED = 'tanara:trial:day';        // { day, keys: [...] }: tried today
const WEARING = 'tanara:trial:finish';   // { key, until, prev }: a finish being tried, and the one to go back to
const readJson = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const writeJson = (k, v) => { try { v ? localStorage.setItem(k, JSON.stringify(v)) : localStorage.removeItem(k); } catch { /* private mode */ } };
const triedToday = key => { const t = readJson(TRIED); return t?.day === today() && t.keys.includes(key); };
function markTried(key) {
  const t = readJson(TRIED);
  writeJson(TRIED, { day: today(), keys: [...(t?.day === today() ? t.keys : []), key] });
}

let wearTimer = 0;
function endWear(quiet = false) {
  const w = readJson(WEARING);
  clearTimeout(wearTimer);
  if (!w) return;
  writeJson(WEARING, null);
  if (getFinish() === w.key) setFinish(w.prev && store.profile()?.rewards?.[w.prev] ? w.prev : null);
  if (!quiet) toast(`امتحان ${rewardOf(w.key)?.name || ''} تمام شد`);
}
// true while a finish is being tried; its end is (re)scheduled
function watchWear(quiet = false) {
  const w = readJson(WEARING);
  clearTimeout(wearTimer);
  if (!w) return false;
  const left = w.until - Date.now();
  if (left <= 0) { endWear(quiet); return false; }
  wearTimer = setTimeout(() => endWear(), left);
  return true;
}
// a phone may sleep through the timer: look again when the app comes back
document.addEventListener('visibilitychange', () => { if (!document.hidden) watchWear(); });
function wear(key) {
  markTried(key);
  writeJson(WEARING, { key, until: Date.now() + TRIAL_MS, prev: readJson(WEARING)?.prev ?? getFinish() });
  setFinish(key);
  sheet.closeAll();
  watchWear();
  toast(`${rewardOf(key).name} تا ۲ دقیقه روشن است`);
}

// A finish worn on a device whose member has not earned it (another account signed in) comes off,
// unless it is being tried (its two minutes are kept, also across a reload).
export function guardFinish() {
  if (watchWear(true)) return;
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

// «تنگاتنگ»: the poster's picture (ttArt.js), cropped to the card
SHOWCASE.tangatang = () => ttArt('ttc');
// «پِفِردینگر»: herself, waving
SHOWCASE.pfeffer = () => '<img class="rw-buddy" src="img/pfeffer/wave.webp" alt="" width="210" height="210">';
const WHERE = { game: 'در «بیشتر»', finish: 'در «ظاهر»', buddy: 'در «تنظیمات»' };

const PLAY = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';
const SPEAK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';

function card({ reward: r, earned, now, of }) {
  return `<article class="rw-card tap${earned ? ' got' : ''}" role="button" tabindex="0" data-promo="${r.key}">
    <div class="rw-show rw-${r.key}">${SHOWCASE[r.key]?.() || ''}${earned ? '' : `<span class="rw-lock">${LOCK}</span>`}</div>
    <div class="rw-info">
      <div class="rw-title"><h3>${r.name}</h3><small>${r.about}</small></div>
      <p class="rw-goal">${goalText(r, fa)}</p>
      ${earned
        ? `<p class="rw-got">${icon.check}<span>${WHERE[r.kind]}</span></p>`
        : `<div class="rw-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${of}" aria-valuenow="${now}"><i style="width:${now / of * 100}%"></i></div>
           <p class="rw-count"><b>${fa(now)}</b> از ${fa(of)}</p>`}
    </div>
  </article>`;
}

/*
  A game's own page in «جوایز»: a poster (picture, a badge, the name, two lines), then while locked the goal as
  one cell per day with how many are left, or once earned «بازی کن»; three things about the game; who made it.
  Design 1 «سفر به خانه» of art/promo/tangatang.html, chosen by the owner on 2026-11-18.
  Since 2026-11-20 every reward has this page: the others show their card's showcase as the poster,
  their `about` as the kicker and one line under the name; all of them end with «قانون‌ها».
*/
const SPARK = '<svg viewBox="-10 -10 20 20" width="12" height="12" aria-hidden="true"><path d="M0-10C1-3 3-1 10 0C3 1 1 3 0 10C-1 3-3 1-10 0C-3-1-1-3 0-10Z" fill="currentColor"/></svg>';
const FEAT = {
  modes: '<svg viewBox="0 0 24 24" fill="none" stroke="#ffd166" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="2.5"/><rect x="13" y="3" width="8" height="8" rx="2.5"/><rect x="3" y="13" width="8" height="8" rx="2.5"/><rect x="13" y="13" width="8" height="8" rx="2.5" fill="#ffd166"/></svg>',
  endless: '<svg viewBox="0 0 24 24" fill="none" stroke="#ff7ac8" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M7 8.5c-2 0-3.5 1.6-3.5 3.5S5 15.5 7 15.5c3.5 0 6.5-7 10-7 2 0 3.5 1.6 3.5 3.5S19 15.5 17 15.5c-3.5 0-6.5-7-10-7z"/></svg>',
  calm: '<svg viewBox="0 0 24 24" fill="none" stroke="#7ff0d0" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"/></svg>',
};
const PROMO = {
  tangatang: {
    art: () => ttArt('ttp'),
    kicker: 'جایزه‌ی تازه',
    lines: ['بلوکی‌ها توی کهکشان گم شده‌اند.', 'جایشان بده، ببرشان خانه.'],
    feats: [['modes', '۵ حالت بازی'], ['endless', 'بی‌پایان'], ['calm', 'بدون عجله']],
    credit: '<bdi>Mattia Fortunati</bdi> · <bdi>js13kGames 2021</bdi>',
  },
  parniyan: { lines: ['یک لباس تازه برای همه‌ی رنگ‌های اپ.'] },
  shab: { lines: ['آسمان شب و ماه و ستاره، روی هر رنگی.'] },
  pfeffer: { lines: ['آشپز کوچولوی زبان‌دراز، به جای هایمردینگر.'] },
};

function openPromo(key) {
  const r = rewardOf(key), p = PROMO[key] || {};
  if (!r) return;
  const game = r.kind === 'game';
  sheet.open(body => {
    const x = listNow().find(y => y.reward.key === key);
    const art = p.art ? p.art() : `<div class="rw-show rw-${key}">${SHOWCASE[key]?.() || ''}</div>`;
    body.innerHTML = `
      <div class="sheet-head"><span></span><h2 class="sr-only">${r.name}</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <div class="promo">
        <div class="promo-poster${p.art ? '' : ' show'}">
          ${art}
          ${x.earned ? '' : `<span class="promo-lock">${LOCK}<span>قفل</span></span>`}
          <span class="promo-kicker">${SPARK}${p.kicker || r.about}</span>
          <div class="promo-titles"><div class="promo-title">${r.name}</div>${p.lines ? `<p>${p.lines.join('<br>')}</p>` : ''}</div>
        </div>
        ${x.earned
          ? (game ? `<button class="promo-play" data-play>${PLAY}<span>بازی کن</span></button>`
            : `<p class="promo-got">${icon.check}<span>مال توست · ${WHERE[r.kind]}</span></p>`)
          : `<div class="promo-goal">
              <div class="row"><span>${goalText(r, fa)}</span><span class="left"><b>${fa(x.of - x.now)}</b> روز مانده</span></div>
              <div class="promo-days" role="progressbar" aria-valuemin="0" aria-valuemax="${x.of}" aria-valuenow="${x.now}">${Array.from({ length: x.of }, (_, i) => `<i${i < x.now ? ' class="on"' : ''}></i>`).join('')}</div>
            </div>
            ${tryButton(r)}`}
        <section class="promo-rules"><h3>قانون‌ها</h3><ul>${goalRules(r, fa, faDM).map(t => `<li>${t}</li>`).join('')}</ul></section>
        ${p.feats ? `<div class="promo-feats">${p.feats.map(([k, t]) => `<div>${FEAT[k]}<span>${t}</span></div>`).join('')}</div>` : ''}
        ${p.credit ? `<p class="promo-credit">${p.credit}</p>` : ''}
      </div>`;
    body.querySelector('[data-close]').onclick = () => sheet.close();
    body.querySelector('[data-play]')?.addEventListener('click', () => openGame(key));
    bindTry(body, r);
  }, { tall: true, onClose: hush });
}

const TRY = {
  finish: [SPARK, '۲ دقیقه امتحانش کن'],
  game: [PLAY, '۲ دقیقه بازی کن'],
  buddy: [SPEAK, 'صدایش را بشنو'],
};
const triedLabel = () => `${icon.check}<span>امتحان امروز انجام شد</span>`;
function tryButton(r) {
  const [ic, label] = TRY[r.kind] || [];
  if (!label) return '';
  const used = r.kind !== 'buddy' && triedToday(r.key);
  return `<button class="promo-try" data-try${used ? ' disabled' : ''}>${used ? triedLabel() : `${ic}<span>${label}</span>`}</button>`;
}
function bindTry(body, r) {
  const btn = body.querySelector('[data-try]');
  if (!btn) return;
  if (r.kind === 'finish') btn.onclick = () => wear(r.key);
  if (r.kind === 'game') btn.onclick = () => {
    markTried(r.key);
    btn.disabled = true;
    btn.innerHTML = triedLabel();
    openGame(r.key, { trial: true });
  };
  if (r.kind === 'buddy') {
    // each tap (on the button or on her) says the next line, with its face, under her name
    const lines = tasteLines(r.key), img = body.querySelector('.promo-poster .rw-buddy'), say = body.querySelector('.promo-titles p');
    let i = 0;
    const talk = () => {
      const l = lines[i++ % lines.length];
      sayAloud(r.key, l.file);
      if (say) say.textContent = l.text;
      if (img) {
        img.src = l.src;
        img.classList.remove('talk');
        void img.offsetWidth; // restart the hop
        img.classList.add('talk');
        img.addEventListener('animationend', () => img.classList.remove('talk'), { once: true }); // back to breathing
      }
    };
    btn.onclick = talk;
    if (img) { img.dataset.taste = ''; img.setAttribute('role', 'button'); img.setAttribute('aria-label', 'صدایش را بشنو'); img.onclick = talk; }
  }
}

// The game itself, full height in a sheet; closing the sheet removes the frame and its sound with it.
// A trial (from its page, before it is earned) lasts two minutes, counted down in the head.
export function openGame(key, { trial = false } = {}) {
  const r = rewardOf(key);
  if (!r || r.kind !== 'game') return;
  const fresh = settle(listNow());
  if (fresh.length) toast(`${fresh.join('، ')} باز شد`);
  let tick = 0;
  sheet.open(body => {
    body.innerHTML = `
      <div class="sheet-head">${trial ? '<span class="trial-clock" data-clock></span>' : '<span></span>'}<h2>${r.name}</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <iframe class="game-frame" src="games/${key}/index.html" title="${r.name}" allow="autoplay"></iframe>`;
    body.querySelector('[data-close]').onclick = () => sheet.close();
    if (!trial) return;
    const end = Date.now() + TRIAL_MS, clock = body.querySelector('[data-clock]');
    const draw = () => {
      const s = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      clock.textContent = `${fa(Math.floor(s / 60))}:${fa(Math.floor((s % 60) / 10))}${fa(s % 10)}`;
      if (!s) { clearInterval(tick); sheet.close(); toast('۲ دقیقه‌ی امتحان تمام شد'); }
    };
    draw();
    tick = setInterval(draw, 1000);
  }, { tall: true, onClose: () => clearInterval(tick) });
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
