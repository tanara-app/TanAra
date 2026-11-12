/*
  «غذاهای تازه‌ی خانواده» (بیشتر), for the app's owner only: the foods members added to
  their own bank themselves (not the starting bank), newest first. For each one the owner can fix
  the name, category or numbers and send it to the members they pick, or keep it out («نه»).
  Members who already have a similar food (foodMatch.js) are shown it and are not ticked; a food
  every other member already has is not shown at all. Every decision is kept on the server
  (table food_share), so a food is offered once, and every decision can be taken back from
  «تأییدشده‌ها» / «ردشده‌ها» below the list. A member who joined after foods were shared gets
  them with one button. The copies reach each bank on its next pull. Everyone else sees nothing.
*/
import * as store from '../data/store.js';
import { SEED_FOODS, CATEGORIES, GRAM } from '../data/seedFoods.js';
import { fa, esc, parseNum } from '../lib/fa.js';
import { iso, faDMY } from '../lib/dates.js';
import { sheet, toast, icon } from './dom.js';
import { foodMeta } from './units.js';
import { foodKey, similar, similarIn, missingFor, everyoneHas, groupSimilar } from '../domain/foodMatch.js';
import { skipFoods } from './plan.js';

const SEED = new Set(SEED_FOODS.map(f => foodKey(f.name)));
const WAIT = '<p class="muted small ai-wait"><span class="typing"><i></i><i></i><i></i></span> در حال خواندن…</p>';

let admin = null; // true / false once the server answered; null: not yet (or offline)
let lastAsk = 0;
let counts = null; // { foods, members } waiting, once read
let asking = false;
let people = []; // every account: { id, name, joined, skip }

// the owner's tile shows at once from what the server said last time, before it answers again
const remembered = () => { try { return localStorage.getItem(store.localKey('share-admin')) === '1'; } catch { return false; } };
export const shareAdmin = () => admin === true || (admin == null && remembered());
export function shareLine() {
  if (!counts) return 'غذاهای اعضا، برای بانک همه';
  const parts = [];
  if (counts.foods) parts.push(`${fa(counts.foods)} غذا منتظر تأیید`);
  if (counts.members) parts.push(`${fa(counts.members)} عضو تازه`);
  return parts.join(' · ') || 'غذای تازه‌ای نیست';
}

/*
  Is this the owner, and how much waits. Asked once per app session, again after each visit to
  the sheet (again = true), and, while the server can't be reached, at most once a minute.
*/
export function checkShare(onChange, again = false) {
  if (asking || admin === false) return;
  if (admin && !again) return;
  if (admin == null && Date.now() - lastAsk < 60e3) return;
  asking = true;
  lastAsk = Date.now();
  (async () => {
    const was = [shareAdmin(), shareLine()];
    if (admin == null) {
      admin = await store.isUsageAdmin();
      if (admin != null) try { localStorage.setItem(store.localKey('share-admin'), admin ? '1' : '0'); } catch { /* private mode */ }
    }
    if (admin) {
      const [all, ms] = await Promise.all([store.shareFoods(), store.shareMembers()]);
      if (ms) people = ms.map(toPerson);
      counts = all && ms ? { foods: pending(all).length, members: newcomers(all).length } : null;
    }
    asking = false;
    if (was[0] !== shareAdmin() || was[1] !== shareLine()) onChange?.();
  })();
}

const toPerson = m => ({ id: m.user_id, name: m.name, joined: m.joined, skip: m.skip || [] });

// Members who joined after foods were shared and are missing some of them.
const newcomers = all => people.map(m => ({ m, miss: missingFor(m, all) })).filter(x => x.miss.length);

// Added by a member themselves, not decided yet, and not already in every other bank; the same
// food added by several members is one group, under the first one added. Newest first.
const pending = all => groupSimilar(all
  .filter(f => !f.decided && !SEED.has(foodKey(f.name)) && !everyoneHas(f, all, people.map(m => m.id)))
  .sort((a, b) => b.created_at.localeCompare(a.created_at)));

const bankOf = (all, id) => all.filter(f => f.user_id === id);
const when = t => (t ? faDMY(iso(new Date(t))) : '');

export function openFoodShare(onDone) {
  sheet.open(body => {
    body.innerHTML = `
      <div class="sheet-head"><h2>غذاهای تازه‌ی خانواده</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <p class="muted small">غذاهایی که اعضا خودشان به بانکشان اضافه کرده‌اند. هرکدام را تأیید کنی، به بانک غذای بقیه هم اضافه می‌شود؛ «نه» یعنی فقط در بانک خودش می‌ماند. هر دو را بعداً از پایین همین صفحه می‌شود برگرداند.</p>
      <div class="share-list" data-list>${WAIT}</div>`;
    body.querySelector('[data-close]').onclick = () => sheet.close();
    const box = body.querySelector('[data-list]');
    let all = [];
    let busy = false;
    const open = new Set(); // which of «تأییدشده‌ها» / «ردشده‌ها» is unfolded, kept across redraws

    const load = async () => {
      const [rows, ms] = await Promise.all([store.shareFoods(), store.shareMembers()]);
      if (!box.isConnected) return;
      if (!rows || !ms) {
        box.innerHTML = '<p class="muted small">فهرست باز نشد؛ اینترنت را نگاه کن.</p><button class="btn block" data-retry>دوباره</button>';
        return;
      }
      people = ms.map(toPerson);
      all = rows;
      paint();
    };
    // After any change on the server: the list again, and this phone's own bank, since the
    // owner may have got a copy, lost one, or had their food corrected.
    const changed = () => { load(); store.pull(); };

    const paint = () => {
      const list = pending(all);
      const fresh = newcomers(all);
      counts = { foods: list.length, members: fresh.length };
      box.innerHTML = fresh.map(({ m, miss }) => `
        <div class="share-new">
          <b>${esc(m.name)} تازه آمده</b>
          <small class="muted">${fa(miss.length)} غذا را که قبل از آمدنش برای همه فرستاده شده ندارد: ${miss.slice(0, 4).map(f => `«${esc(f.name)}»`).join('، ')}${miss.length > 4 ? ' و…' : ''}</small>
          <button class="btn sm primary" data-catch="${m.id}">غذاهای تأییدشده را به ${esc(m.name)} بده</button>
        </div>`).join('')
        + (list.length ? list.map(g => item(g, all)).join('') : '<div class="empty">غذای تازه‌ای منتظر تأیید نیست.</div>')
        + decidedList(all, 'shared', open.has('shared'))
        + decidedList(all, 'declined', open.has('declined'));
      box.querySelectorAll('details[data-fold]').forEach(d => d.addEventListener('toggle', () => {
        if (d.open) open.add(d.dataset.fold); else open.delete(d.dataset.fold);
      }));
    };

    box.onclick = async e => {
      if (e.target.closest('[data-retry]')) { box.innerHTML = WAIT; return load(); }
      const b = e.target.closest('[data-catch],[data-undo],[data-reopen],[data-ok],[data-no]');
      if (!b || busy) return;
      const { catch: who, undo, reopen, ok, no } = b.dataset;
      const food = all.find(f => f.id === (undo || reopen || ok || no));
      const act = async (run, done) => {
        busy = true; b.disabled = true;
        const r = await run();
        busy = false;
        if (r.error) { b.disabled = false; return toast(navigator.onLine ? 'انجام نشد؛ دوباره امتحان کن' : 'اینترنت وصل نیست'); }
        toast(done(r));
        changed();
      };
      if (who) {
        const m = people.find(x => x.id === who);
        return act(() => store.shareCatchUp(m.id, missingFor(m, all).map(f => f.id)), r => `${fa(r.made)} غذا به بانک ${m.name} اضافه شد`);
      }
      if (!food) return;
      if (no) {
        // the whole group: the same food added by others is kept out with it
        const group = pending(all).find(g => g.food.id === food.id);
        const ids = [food.id, ...(group?.also || []).map(f => f.id)];
        return act(async () => {
          for (const id of ids) { const r = await store.shareDecide(id, false); if (r.error) return r; }
          return {};
        }, () => (ids.length > 1 ? 'فقط در بانک خودشان ماند' : 'فقط در بانک خودش ماند'));
      }
      if (reopen) {
        // the same food kept out with it from other banks comes back too
        const ids = all.filter(f => f.decision === 'declined' && (f.id === food.id || similar(f, food))).map(f => f.id);
        return act(async () => {
          for (const id of ids) { const r = await store.shareUndo(id, null); if (r.error) return r; }
          return {};
        }, () => 'دوباره منتظر تأیید است');
      }
      if (undo) return openUndo(food, all, r => { toast(r.gone ? `از بانک ${fa(r.gone)} نفر برداشته شد` : 'دوباره منتظر تأیید است'); changed(); });
      openSend(food, all, made => {
        toast(made ? `به بانک ${fa(made)} نفر اضافه شد` : 'تأیید شد؛ به بانک کسی اضافه نشد');
        changed();
      });
    };
    load();
  }, { tall: true, onClose: () => onDone?.() });
}

// Who has a copy of a shared food: [{ id, name, copy }].
const holders = (food, all) => all.filter(c => c.source === food.id && c.decision === 'copy')
  .map(c => ({ id: c.user_id, name: c.member, copy: c }));

// «تأییدشده‌ها» (to whom, with «برگرداندن…») or «ردشده‌ها» (with «دوباره بررسی»), newest first.
function decidedList(all, decision, isOpen) {
  const rows = all.filter(f => f.decision === decision)
    .sort((a, b) => String(b.decided_at).localeCompare(String(a.decided_at)));
  if (!rows.length) return '';
  const shared = decision === 'shared';
  return `<details class="share-sent" data-fold="${decision}"${isOpen ? ' open' : ''}><summary>${shared ? 'تأییدشده‌ها' : 'ردشده‌ها'} (${fa(rows.length)})</summary>${rows.map(f => {
    const hs = shared ? holders(f, all) : [];
    return `
    <div class="share-item">
      <b>${esc(f.name)}</b>
      <small class="muted">از ${esc(f.member)} · ${shared ? 'تأیید' : 'رد'}: ${when(f.decided_at)}</small>
      ${shared ? `<small class="muted">${hs.length ? `در بانک: ${hs.map(h => esc(h.name)).join('، ')}` : 'در بانک کس دیگری نیست'}</small>` : ''}
      <div class="row gap">${shared
        ? `<button class="btn sm ghost" data-undo="${f.id}">برگرداندن…</button>`
        : `<button class="btn sm ghost" data-reopen="${f.id}">دوباره بررسی</button>`}</div>
    </div>`;
  }).join('')}</details>`;
}

// Take a shared food back from the members ticked (all of them at first).
function openUndo(food, all, onDone) {
  const hs = holders(food, all);
  sheet.open(body => {
    body.innerHTML = `
      <div class="sheet-head"><h2>برگرداندن «${esc(food.name)}»</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <form class="stack" novalidate>
        <p class="muted small">${hs.length ? 'غذا از بانک کسانی که تیک دارند برداشته می‌شود، حتی اگر خودشان عوضش کرده باشند. وعده‌هایی که قبلاً با آن ثبت شده دست نمی‌خورند. ' : ''}نسخه‌ی اصلی در بانک ${esc(food.member)} می‌ماند. ${hs.length ? 'اگر از بانک همه برداشته شود، غذا دوباره به فهرست منتظر تأیید برمی‌گردد.' : 'غذا دوباره به فهرست منتظر تأیید برمی‌گردد.'}</p>
        ${hs.length ? `<div class="field"><span>از بانک چه کسانی برداشته شود</span>
          ${hs.map(h => `<label class="check"><input type="checkbox" name="from" value="${h.id}" checked><span>${esc(h.name)}${h.copy.name !== food.name ? `<small class="muted">با اسم «${esc(h.copy.name)}»</small>` : ''}</span></label>`).join('')}
        </div>` : ''}
        <p class="err" hidden></p>
        <button class="btn primary block big" data-go>برگرداندن</button>
      </form>`;
    const form = body.querySelector('form');
    const err = form.querySelector('.err');
    const btn = body.querySelector('[data-go]');
    body.querySelector('[data-close]').onclick = () => sheet.close();
    const label = () => {
      const n = form.querySelectorAll('[name=from]:checked').length;
      btn.textContent = !hs.length || n === hs.length ? 'برگرداندن از بانک همه' : n ? `برگرداندن از بانک ${fa(n)} نفر` : 'کسی تیک ندارد';
      btn.disabled = hs.length > 0 && !n;
    };
    form.addEventListener('change', label);
    label();
    form.onsubmit = async e => {
      e.preventDefault();
      const from = [...form.querySelectorAll('[name=from]:checked')].map(x => x.value);
      if (hs.length && !from.length) return;
      btn.disabled = true;
      const r = await store.shareUndo(food.id, from.length === hs.length ? null : from);
      if (r.error) { label(); err.textContent = navigator.onLine ? 'انجام نشد؛ دوباره امتحان کن.' : 'اینترنت وصل نیست.'; err.hidden = false; return; }
      sheet.close();
      onDone(r);
    };
  }, { tall: true });
}

function likeNotes(food, all) {
  return people.filter(m => m.id !== food.user_id)
    .map(m => ({ m, like: similarIn(food, bankOf(all, m.id)) }))
    .filter(x => x.like.length)
    .map(({ m, like }) => `<small class="share-like">${esc(m.name)} دارد: ${like.slice(0, 2).map(x => `«${esc(x.name)}» (${foodMeta(x)})`).join('، ')}</small>`)
    .join('');
}

// One pending food (the others who added it show in its «… دارد» lines).
function item({ food: f }, all) {
  return `
    <div class="share-item">
      <b>${esc(f.name)}</b>
      <small class="muted">${foodMeta(f)} · ${CATEGORIES[f.category] || 'سایر'}${f.from_recipe ? ' · از رسپی خودش' : ''}</small>
      <small class="muted">از ${esc(f.member)} · ${when(f.created_at)}${f.barcode ? ' · بارکد دارد' : ''}</small>
      ${likeNotes(f, all)}
      <div class="row gap"><button class="btn sm primary grow" data-ok="${f.id}">برای همه…</button><button class="btn sm ghost" data-no="${f.id}">نه</button></div>
    </div>`;
}

// The food as it will go out, and who gets it.
function openSend(food, all, onSent) {
  const per100 = food.unit === GRAM;
  const k = per100 ? 100 : 1;
  const show = x => String(Math.round(Number(x) * k * 10) / 10);
  const per = per100 ? 'هر ۱۰۰ گرم' : `هر ${esc(food.unit)}`;
  const start = { name: food.name, category: food.category, kcal: show(food.kcal), protein: show(food.protein) };
  const others = people.filter(m => m.id !== food.user_id);
  const likeFor = (m, name) => similarIn({ ...food, name }, bankOf(all, m.id));
  sheet.open(body => {
    body.innerHTML = `
      <div class="sheet-head"><h2>برای همه</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <form class="stack" novalidate>
        <p class="muted small">از بانک ${esc(food.member)}. اگر چیزی را درست کنی، در بانک خودش هم درست می‌شود.${food.from_recipe ? ' این غذا از رسپی خودش ساخته شده؛ کالری هر واحدش به دیگ همان رسپی بستگی دارد.' : ''}</p>
        <label class="field"><span>اسم</span><input name="name" value="${esc(start.name)}"></label>
        <label class="field"><span>دسته</span><select name="category">${Object.entries(CATEGORIES).map(([v, l]) => `<option value="${v}" ${v === food.category ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <div class="row gap">
          <label class="field grow"><span>کالری ${per}</span><input name="kcal" inputmode="decimal" value="${start.kcal}"></label>
          <label class="field grow"><span>پروتئین (گرم) ${per}</span><input name="protein" inputmode="decimal" value="${start.protein}"></label>
        </div>
        <p class="muted small">واحد: ${foodMeta(food)}</p>
        <div class="field"><span>به بانک چه کسانی برود</span>
          ${others.map(m => `<label class="check"><input type="checkbox" name="to" value="${m.id}"><span>${esc(m.name)}<small class="muted" data-like="${m.id}"></small></span></label>`).join('') || '<p class="muted small">عضو دیگری نیست.</p>'}
        </div>
        <p class="err" hidden></p>
        <button class="btn primary block big" data-send>اضافه کن</button>
      </form>`;
    const form = body.querySelector('form');
    const F = form.elements;
    const err = form.querySelector('.err');
    const btn = body.querySelector('[data-send]');
    const touched = new Set(); // boxes the owner changed by hand keep their tick when the name changes
    const label = () => {
      const n = form.querySelectorAll('[name=to]:checked').length;
      btn.textContent = n ? `اضافه به بانک ${fa(n)} نفر` : 'فقط تأیید (به بانک کسی نرود)';
    };
    // «دارد: …» and the ticks follow the name as it is typed
    const refresh = () => {
      const name = F.name.value.trim() || food.name;
      for (const m of others) {
        const like = likeFor(m, name);
        form.querySelector(`[data-like="${m.id}"]`).innerHTML = like.length ? `دارد: «${esc(like[0].name)}» (${foodMeta(like[0])})` : '';
        const box = form.querySelector(`[name=to][value="${m.id}"]`);
        if (!touched.has(m.id)) box.checked = !like.length;
      }
      label();
    };
    body.querySelector('[data-close]').onclick = () => sheet.close();
    F.name.addEventListener('input', refresh);
    form.addEventListener('change', e => {
      if (e.target.name === 'to') { touched.add(e.target.value); label(); }
    });
    refresh();
    form.onsubmit = async e => {
      e.preventDefault();
      const fail = m => { err.textContent = m; err.hidden = false; };
      const name = F.name.value.trim();
      if (!name) return fail('اسم را بنویس.');
      // only what was changed goes out: a number shown rounded and left alone stays exact
      const fields = {};
      if (name !== start.name) fields.name = name;
      if (F.category.value !== start.category) fields.category = F.category.value;
      for (const key of ['kcal', 'protein']) {
        const v = F[key].value.trim();
        if (v === start[key]) continue;
        const n = parseNum(v || '0');
        if (!(n >= 0)) return fail('کالری و پروتئین را عدد بنویس.');
        fields[key] = +(n / k).toFixed(4);
      }
      const to = [...form.querySelectorAll('[name=to]:checked')].map(x => x.value);
      btn.disabled = true; btn.textContent = 'در حال فرستادن…';
      const r = await store.shareDecide(food.id, true, fields, to);
      if (r.error) {
        btn.disabled = false; label();
        return fail(/already/.test(r.error.message || '') ? 'این غذا قبلاً تأیید شده.' : navigator.onLine ? 'فرستاده نشد؛ دوباره امتحان کن.' : 'اینترنت وصل نیست.');
      }
      // one of the owner's own foods: already in their bank, so not «تازه» for their diet plan
      if (store.get().foods.some(f => f.id === food.id)) skipFoods([food.id]);
      sheet.close();
      onSent(r.made);
    };
  }, { tall: true });
}
