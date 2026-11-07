/*
  «غذاهای تازه‌ی خانواده» (نمایه ← ابزارها), for the app's owner only: the foods members added to
  their own bank themselves (not the starting bank), newest first. For each one the owner can fix
  the name, category or numbers and send it to the members they pick, or keep it out. Members who
  already have a similar food (foodMatch.js) are shown it and are not ticked. Every decision is
  kept on the server (table food_share), so a food is offered once; the copies reach each bank on
  its next pull. Everyone else sees nothing of this.
*/
import * as store from '../data/store.js';
import { SEED_FOODS, CATEGORIES, GRAM } from '../data/seedFoods.js';
import { fa, esc, parseNum } from '../lib/fa.js';
import { iso, faDMY } from '../lib/dates.js';
import { sheet, toast, icon } from './dom.js';
import { foodMeta } from './units.js';
import { foodKey, similarIn } from '../domain/foodMatch.js';

const SEED = new Set(SEED_FOODS.map(f => foodKey(f.name)));
const WAIT = '<p class="muted small ai-wait"><span class="typing"><i></i><i></i><i></i></span> در حال خواندن…</p>';

let admin = null; // null: not asked yet on this device session
let waiting = null; // how many foods wait, once read
let asking = null;

export const shareAdmin = () => admin === true;
export const shareLine = () => (waiting == null ? 'غذاهای اعضا، برای بانک همه' : waiting ? `${fa(waiting)} غذا منتظر تأیید` : 'غذای تازه‌ای نیست');

// Once per app session (and after each visit to the sheet): is this the owner, and how many wait.
export function checkShare(onChange, again = false) {
  if (asking || admin === false || (admin && !again)) return;
  asking = (async () => {
    const was = [admin, waiting];
    if (admin == null) admin = await store.isUsageAdmin();
    if (admin) { const all = await store.shareFoods(); waiting = all ? pending(all).length : null; }
    asking = null;
    if (was[0] !== admin || was[1] !== waiting) onChange?.();
  })();
}

const pending = all => all.filter(f => !f.decided && !SEED.has(foodKey(f.name)))
  .sort((a, b) => b.created_at.localeCompare(a.created_at));

export function openFoodShare(onDone) {
  sheet.open(body => {
    body.innerHTML = `
      <div class="sheet-head"><h2>غذاهای تازه‌ی خانواده</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <p class="muted small">غذاهایی که اعضا خودشان به بانکشان اضافه کرده‌اند. هرکدام را تأیید کنی، به بانک غذای بقیه هم اضافه می‌شود؛ «نه» یعنی فقط در بانک خودش می‌ماند.</p>
      <div class="share-list" data-list>${WAIT}</div>`;
    body.querySelector('[data-close]').onclick = () => sheet.close();
    const box = body.querySelector('[data-list]');
    let all = [];
    const load = async () => {
      const rows = await store.shareFoods();
      if (!box.isConnected) return;
      if (!rows) { box.innerHTML = '<p class="muted small">فهرست باز نشد؛ اینترنت را نگاه کن و دوباره باز کن.</p>'; return; }
      all = rows;
      paint();
    };
    const paint = () => {
      const list = pending(all);
      waiting = list.length;
      box.innerHTML = list.length ? list.map(f => item(f, all)).join('') : '<div class="empty">غذای تازه‌ای منتظر تأیید نیست.</div>';
    };
    box.onclick = async e => {
      const b = e.target.closest('[data-ok],[data-no]');
      if (!b) return;
      const food = all.find(f => f.id === (b.dataset.ok || b.dataset.no));
      if (!food) return;
      if (b.dataset.no) {
        b.disabled = true;
        const r = await store.shareDecide(food.id, false);
        if (r.error) { b.disabled = false; return toast('ثبت نشد؛ دوباره امتحان کن'); }
        food.decided = true;
        paint();
        return toast('فقط در بانک خودش ماند');
      }
      openSend(food, all, made => {
        food.decided = true;
        toast(made ? `به بانک ${fa(made)} نفر اضافه شد` : 'تأیید شد؛ به بانک کسی اضافه نشد');
        load(); // the copies are foods too, for the next ones' «already has»
        if (made) store.pull(); // the owner may be one of them
      });
    };
    load();
  }, { tall: true, onClose: () => onDone?.() });
}

function members(all) {
  const m = new Map();
  for (const f of all) if (!m.has(f.user_id)) m.set(f.user_id, f.member);
  return [...m].map(([id, name]) => ({ id, name }));
}

function item(f, all) {
  const has = members(all).filter(m => m.id !== f.user_id)
    .map(m => ({ m, like: similarIn(f, all.filter(x => x.user_id === m.id)) }))
    .filter(x => x.like.length);
  return `
    <div class="share-item">
      <b>${esc(f.name)}</b>
      <small class="muted">${foodMeta(f)} · ${CATEGORIES[f.category] || 'سایر'}</small>
      <small class="muted">از ${esc(f.member)} · ${faDMY(iso(new Date(f.created_at)))}${f.barcode ? ' · بارکد دارد' : ''}</small>
      ${has.map(({ m, like }) => `<small class="share-like">${esc(m.name)} دارد: ${like.slice(0, 2).map(x => `«${esc(x.name)}» (${foodMeta(x)})`).join('، ')}</small>`).join('')}
      <div class="row gap"><button class="btn sm primary grow" data-ok="${f.id}">برای همه…</button><button class="btn sm ghost" data-no="${f.id}">نه</button></div>
    </div>`;
}

// The food as it will go out, and who gets it.
function openSend(food, all, onSent) {
  const per100 = food.unit === GRAM;
  const k = per100 ? 100 : 1;
  const show = x => String(Math.round(Number(x) * k * 10) / 10);
  const others = members(all).filter(m => m.id !== food.user_id)
    .map(m => ({ ...m, like: similarIn(food, all.filter(x => x.user_id === m.id)) }));
  const per = per100 ? 'هر ۱۰۰ گرم' : `هر ${esc(food.unit)}`;
  sheet.open(body => {
    body.innerHTML = `
      <div class="sheet-head"><h2>برای همه</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <form class="stack" novalidate>
        <p class="muted small">از بانک ${esc(food.member)}. اگر چیزی را درست کنی، در بانک خودش هم درست می‌شود.</p>
        <label class="field"><span>اسم</span><input name="name" value="${esc(food.name)}"></label>
        <label class="field"><span>دسته</span><select name="category">${Object.entries(CATEGORIES).map(([v, l]) => `<option value="${v}" ${v === food.category ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <div class="row gap">
          <label class="field grow"><span>کالری ${per}</span><input name="kcal" inputmode="decimal" value="${show(food.kcal)}"></label>
          <label class="field grow"><span>پروتئین (گرم) ${per}</span><input name="protein" inputmode="decimal" value="${show(food.protein)}"></label>
        </div>
        <p class="muted small">واحد: ${foodMeta(food)}</p>
        <div class="field"><span>به بانک چه کسانی برود</span>
          ${others.map(m => `<label class="check"><input type="checkbox" name="to" value="${m.id}" ${m.like.length ? '' : 'checked'}><span>${esc(m.name)}${m.like.length ? `<small class="muted">دارد: «${esc(m.like[0].name)}»</small>` : ''}</span></label>`).join('') || '<p class="muted small">عضو دیگری نیست.</p>'}
        </div>
        <p class="err" hidden></p>
        <button class="btn primary block big" data-send>اضافه کن</button>
      </form>`;
    const form = body.querySelector('form');
    const F = form.elements;
    const err = form.querySelector('.err');
    body.querySelector('[data-close]').onclick = () => sheet.close();
    form.onsubmit = async e => {
      e.preventDefault();
      const name = F.name.value.trim();
      const kcal = parseNum(F.kcal.value);
      const protein = parseNum(F.protein.value || '0');
      const fail = m => { err.textContent = m; err.hidden = false; };
      if (!name) return fail('اسم را بنویس.');
      if (!(kcal >= 0) || !(protein >= 0)) return fail('کالری و پروتئین را عدد بنویس.');
      const to = [...form.querySelectorAll('[name=to]:checked')].map(x => x.value);
      const btn = body.querySelector('[data-send]');
      btn.disabled = true; btn.textContent = 'در حال فرستادن…';
      const r = await store.shareDecide(food.id, true, { name, category: F.category.value, kcal: +(kcal / k).toFixed(4), protein: +(protein / k).toFixed(4) }, to);
      if (r.error) {
        btn.disabled = false; btn.textContent = 'اضافه کن';
        return fail(/already/.test(r.error.message || '') ? 'این غذا قبلاً تأیید شده.' : 'فرستاده نشد؛ دوباره امتحان کن.');
      }
      sheet.close();
      onSent(r.made);
    };
  });
}
