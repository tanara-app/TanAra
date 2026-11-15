/*
  «جوایز» (a tile in «بیشتر», beta `rewards`): what a member earns by keeping a habit. For now one
  reward, the «پرنیان» finish (js/domain/rewards.js, css/app.css [data-finish="parniyan"]): a live
  showcase of it in their own colours, the goal, and how far along they are; once earned, a switch
  to wear it. Earned rewards are kept in profile.data.rewards ({ key: day earned }).
*/
import * as store from '../data/store.js';
import { sheet, icon, toast } from './dom.js';
import { fa } from '../lib/fa.js';
import { today } from '../lib/dates.js';
import { REWARDS, fullRuns, earnedNow } from '../domain/rewards.js';
import { getFinish, setFinish } from './theme.js';

const LOCK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>';
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" fill="currentColor"/></svg>';

// A finish worn on a device whose member has not earned it (another account signed in) comes off.
export function guardFinish() {
  if (getFinish() && !store.profile()?.rewards?.parniyan) setFinish(null);
}

// The earned ones are written down the first time they are seen, so they stay earned.
function settle(runs) {
  const p = store.profile();
  const got = p.rewards || {};
  if (got.parniyan || !earnedNow('parniyan', runs, got)) return false;
  store.saveProfile({ ...p, rewards: { ...got, parniyan: today() } });
  return true;
}

// the showcase: a small phone in the «پرنیان» look, in the colours they use now
const showcase = locked => `
  <div class="pn-show${locked ? ' locked' : ''}">
    <i class="pn-star s1">${STAR}</i><i class="pn-star s2">${STAR}</i><i class="pn-star s3">${STAR}</i>
    <div class="pn-phone">
      <div class="pn-card pn-sum"><div class="pn-ring"><b>${fa(740)}</b></div><div class="pn-lines"><i></i><i></i><i></i></div></div>
      <div class="pn-card"><div class="pn-meal"><b>ناهار</b><span>${fa(410)} از ${fa(600)}</span></div><div class="pn-bar"><i></i></div></div>
      <div class="pn-btn">ثبت غذا</div>
    </div>
    ${locked ? `<span class="pn-lock">${LOCK}</span>` : ''}
  </div>`;

export function openRewards() {
  sheet.open(body => {
    const draw = () => {
      const s = store.get();
      const runs = fullRuns(s.entries, s.ai_notes, today());
      if (settle(runs)) toast(`${REWARDS.parniyan.name} باز شد`);
      const got = !!store.profile()?.rewards?.parniyan;
      const r = REWARDS.parniyan.run;
      const on = getFinish() === 'parniyan';
      body.innerHTML = `
        <div class="sheet-head"><h2>جوایز</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
        <div class="rw">
          ${showcase(!got)}
          <div class="rw-info">
            <h3>${REWARDS.parniyan.name}</h3>
            <p class="muted small">${fa(r)} روز پشت‌سرهم ثبت کامل</p>
            ${got
              ? `<button class="btn ${on ? '' : 'primary '}block" data-wear>${on ? 'برداشتن' : 'پوشیدن'}</button>`
              : `<div class="rw-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${r}" aria-valuenow="${runs.now}"><i style="width:${Math.min(100, runs.now / r * 100)}%"></i></div>
                 <p class="rw-count"><b>${fa(runs.now)}</b> از ${fa(r)}</p>`}
          </div>
        </div>`;
      body.querySelector('[data-close]').onclick = () => sheet.close();
      body.querySelector('[data-wear]')?.addEventListener('click', () => { setFinish(on ? null : 'parniyan'); draw(); });
    };
    draw();
  }, { tall: true });
}
