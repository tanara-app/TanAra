/*
  «جوایز» (a tile in «بیشتر», for everyone): every reward of js/domain/rewards.js as one card the
  same way — a live showcase, its name, a few words on what it is, the goal, and the progress bar, or
  once earned a mark that says so. A finish is then worn from «ظاهر» (profile.js), not from here.
  Earned rewards are written down in profile.data.rewards the first time they are seen.
*/
import * as store from '../data/store.js';
import { sheet, icon, toast } from './dom.js';
import { fa } from '../lib/fa.js';
import { today } from '../lib/dates.js';
import { progress, goalText } from '../domain/rewards.js';
import { getFinish, setFinish } from './theme.js';

const LOCK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>';
const MOON = '<svg viewBox="0 0 48 48" aria-hidden="true"><mask id="sb-moon-cut"><rect width="48" height="48" fill="#fff"/><circle cx="32" cy="17" r="15" fill="#000"/></mask><circle cx="24" cy="24" r="18" fill="currentColor" mask="url(#sb-moon-cut)"/></svg>';
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" fill="currentColor"/></svg>';

// A finish worn on a device whose member has not earned it (another account signed in) comes off.
export function guardFinish() {
  const f = getFinish();
  if (f && !store.profile()?.rewards?.[f]) setFinish(null);
}

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

function card({ reward: r, earned, now, of }) {
  return `<article class="rw-card${earned ? ' got' : ''}">
    <div class="rw-show rw-${r.key}">${SHOWCASE[r.key]?.() || ''}${earned ? '' : `<span class="rw-lock">${LOCK}</span>`}</div>
    <div class="rw-info">
      <div class="rw-title"><h3>${r.name}</h3><small>${r.about}</small></div>
      <p class="rw-goal">${goalText(r, fa)}</p>
      ${earned
        ? `<p class="rw-got">${icon.check}<span>در «ظاهر»</span></p>`
        : `<div class="rw-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${of}" aria-valuenow="${now}"><i style="width:${now / of * 100}%"></i></div>
           <p class="rw-count"><b>${fa(now)}</b> از ${fa(of)}</p>`}
    </div>
  </article>`;
}

export function openRewards() {
  sheet.open(body => {
    const s = store.get();
    const list = progress({ entries: s.entries, notes: s.ai_notes, earned: store.profile()?.rewards }, today());
    const fresh = settle(list);
    if (fresh.length) toast(`${fresh.join('، ')} باز شد`);
    body.innerHTML = `
      <div class="sheet-head"><h2>جوایز</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <div class="rw-list">${list.map(card).join('')}</div>`;
    body.querySelector('[data-close]').onclick = () => sheet.close();
  }, { tall: true });
}
