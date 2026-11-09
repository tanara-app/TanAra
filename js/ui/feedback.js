// «گزارش خرابی و انتقاد» (نمایه): a bug, a complaint or an idea, with up to 4 photos, straight to
// the server (table `feedback`). The Claudes working on the app read them and show the new ones to
// the person who decides what changes (FEEDBACK.md); the status and any answer come back here.
import * as store from '../data/store.js';
import { fa, esc } from '../lib/fa.js';
import { today, iso, faDMY } from '../lib/dates.js';
import { sheet, toast, icon } from './dom.js';
import { shrink } from './motivation.js';
import { getTheme, getPalette } from './theme.js';

const MAX = 4;
const KINDS = {
  bug: { label: 'خرابی', field: 'چه اتفاقی افتاد؟', ph: 'مثلاً: در «ثبت غذا» روی «ذخیره» زدم و چیزی ثبت نشد' },
  gripe: { label: 'انتقاد', field: 'از چه چیزی راضی نیستی؟', ph: 'مثلاً: پیدا کردن غذا در بانک غذا سخت است' },
  idea: { label: 'پیشنهاد', field: 'چه چیزی اضافه یا عوض شود؟', ph: 'مثلاً: کاش می‌شد آب خوردن را هم ثبت کرد' },
};
const STATUS = { new: 'رسید', seen: 'دیده شد', planned: 'در برنامه', done: 'انجام شد', declined: 'فعلاً نه' };

export const feedbackLine = () => 'خرابی، انتقاد یا پیشنهاد، با عکس';

export function openFeedback() {
  const d = { kind: 'bug', body: '' };
  let shots = []; // [{ blob, url }]
  let sending = false;
  let preparing = 0; // photos still being shrunk
  const local = !store.canPush();

  sheet.open(body => {
    const draw = () => {
      const k = KINDS[d.kind];
      body.innerHTML = `
        <div class="sheet-head"><span></span><h2>گزارش خرابی و انتقاد</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
        <form class="stack" novalidate>
          <div class="seg small" data-kind>${Object.entries(KINDS).map(([v, x]) => `<button type="button" data-v="${v}" class="${v === d.kind ? 'on' : ''}">${x.label}</button>`).join('')}</div>
          <label class="field"><span>${k.field}</span><textarea name="body" rows="5" maxlength="4000" placeholder="${k.ph}">${esc(d.body)}</textarea></label>
          <div class="field"><span>عکس یا اسکرین‌شات <em>اختیاری، تا ۴ تا</em></span>
            <div class="shot-thumbs fb-shots">
              ${shots.map((s, i) => `<div class="shot-thumb"><img src="${s.url}" alt=""><button type="button" class="shot-x" data-x="${i}" aria-label="برداشتن عکس">${icon.close}</button></div>`).join('')}
              ${shots.length < MAX ? `<label class="shot-more file-btn" aria-label="افزودن عکس">+<input type="file" accept="image/*" multiple hidden data-file></label>` : ''}
            </div>
          </div>
          <p class="muted small">${local ? 'در حالت آزمایشی محلی گزارش فرستاده نمی‌شود؛ اول وارد حساب شو.' : 'مدل مرورگر و اندازه‌ی صفحه‌ی گوشی هم همراه گزارش می‌رود تا خرابی راحت‌تر پیدا شود.'}</p>
          <p class="err" hidden></p>
          <button class="btn primary block big" data-send${local ? ' disabled' : ''}>${sending ? 'در حال فرستادن…' : 'فرستادن'}</button>
        </form>
        <h3 class="list-h">گزارش‌های قبلی من</h3>
        <div class="fb-list" data-list><p class="muted small">${local ? 'هنوز گزارشی نفرستاده‌ای.' : 'در حال بارگذاری…'}</p></div>`;
      const form = body.querySelector('form');
      const read = () => { d.body = form.elements.body.value; };
      body.querySelector('[data-close]').onclick = () => sheet.close();
      body.querySelector('[data-kind]').onclick = e => {
        const b = e.target.closest('[data-v]');
        if (!b || b.dataset.v === d.kind) return;
        read(); d.kind = b.dataset.v; draw();
      };
      body.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => {
        read();
        URL.revokeObjectURL(shots[+b.dataset.x].url);
        shots = shots.filter((_, i) => i !== +b.dataset.x);
        draw();
      }));
      body.querySelector('[data-file]')?.addEventListener('change', async e => {
        const files = [...(e.target.files || [])].slice(0, MAX - shots.length);
        preparing++;
        for (const f of files) {
          // 1600 px keeps the small text of a screenshot readable
          try { const blob = await shrink(f, 1600); if (shots.length < MAX) shots.push({ blob, url: URL.createObjectURL(blob) }); }
          catch { toast('یکی از عکس‌ها باز نشد'); }
        }
        preparing--;
        if (!body.isConnected || sending) return;
        read(); // after the wait, so whatever was typed meanwhile stays
        draw();
      });
      form.onsubmit = async e => {
        e.preventDefault();
        if (sending || local) return;
        read();
        const err = form.querySelector('.err');
        const text = d.body.trim();
        if (text.length < 3) { err.textContent = 'چند کلمه بنویس که چه شده.'; err.hidden = false; return; }
        if (preparing) { err.textContent = 'یک لحظه صبر کن تا عکس آماده شود.'; err.hidden = false; return; }
        sending = true; draw();
        const { error } = await store.sendFeedback({ kind: d.kind, body: text, context: context() }, shots.map(s => s.blob)).catch(x => ({ error: x }));
        sending = false;
        if (error) {
          draw();
          const el = body.querySelector('.err');
          el.textContent = navigator.onLine ? 'فرستاده نشد؛ دوباره امتحان کن.' : 'اینترنت وصل نیست؛ وقتی وصل شد دوباره بفرست.';
          el.hidden = false;
          return;
        }
        shots.forEach(s => URL.revokeObjectURL(s.url));
        shots = []; d.body = '';
        draw();
        toast('گزارش رسید؛ ممنون!');
      };
      if (!local) loadList(body);
    };
    draw();
  }, { tall: true, onClose: () => shots.forEach(s => URL.revokeObjectURL(s.url)) });
}

async function loadList(body) {
  const box = body.querySelector('[data-list]');
  const { data, error } = await store.myFeedback().catch(x => ({ error: x }));
  if (!box.isConnected) return;
  if (error) { box.innerHTML = '<p class="muted small">فهرست گزارش‌ها باز نشد.</p>'; return; }
  box.innerHTML = data.length ? data.map(r => `
    <div class="fb-item">
      <div class="row"><b class="grow">${KINDS[r.kind]?.label || ''} · ${faDMY(iso(new Date(r.created_at)))}${r.images.length ? ` · ${fa(r.images.length)} عکس` : ''}</b><span class="fb-st st-${r.status}">${STATUS[r.status] || ''}</span></div>
      <p>${esc(r.body)}</p>
      ${r.answer ? `<p class="fb-ans">${esc(r.answer)}</p>` : ''}
    </div>`).join('') : '<p class="muted small">هنوز گزارشی نفرستاده‌ای.</p>';
}

function context() {
  const p = store.profile() || {};
  return {
    day: today(),
    ua: navigator.userAgent,
    screen: `${innerWidth}x${innerHeight}`,
    standalone: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    theme: getTheme(),
    palette: getPalette(),
    phase: p.phase || null,
    online: navigator.onLine,
  };
}
