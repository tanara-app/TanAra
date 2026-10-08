// Motivations: a swipeable card on Today, plus the sheets to view, add and edit them.
import * as store from '../data/store.js';
import { sortedWeights, projectWeight } from '../domain/stats.js';
import { fa, esc } from '../lib/fa.js';
import { today, addDays, diffDays, faDM, faDMY, jParts, fromJalali, J_MONTHS } from '../lib/dates.js';
import { sheet, toast, confirmBox, icon } from './dom.js';
import { dismissed, dismiss } from './notices.js';

export const KINDS = {
  event: { label: 'رویداد', long: 'رویداد پیش رو' },
  image: { label: 'عکس الهام', long: 'عکس الهام‌بخش' },
  before: { label: 'عکس قبل', long: 'عکس قبل از خودم' },
  quote: { label: 'جمله', long: 'جمله‌ی انگیزشی' },
};
const NEEDS_PHOTO = { image: true, before: true };

let slideIdx = 0;

// What Today shows: upcoming events first (nearest first), then everything else, newest first.
// Events that have passed stay in the list in Profile but leave Today.
function visible(list, t) {
  const events = list.filter(m => m.kind === 'event' && m.day && m.day >= t).sort((a, b) => (a.day < b.day ? -1 : 1));
  const rest = list.filter(m => m.kind !== 'event').sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return [...events, ...rest];
}

const daysLeft = day => {
  const n = diffDays(day, today());
  return n === 0 ? 'همین امروز!' : n === 1 ? 'فردا' : `${fa(n)} روز دیگر`;
};

// One line about where the weight trend lands on the event day.
function projectionLine(day) {
  const p = store.profile();
  const sorted = sortedWeights(store.get().weights);
  const t = today();
  const n = diffDays(day, t);
  if (n < 1) return '';
  const pr = projectWeight(sorted, t, day);
  if (pr.base === null) return 'وزنت را ثبت کن تا ببینی آن روز کجا هستی.';
  if (pr.rate === null) return 'چند هفته وزن ثبت کن تا تخمین بزنم آن روز چند کیلو هستی.';
  if (n > 365) return '';
  const kg = Math.round(pr.kg * 2) / 2;
  const floorKg = p?.heightCm ? 18.5 * (p.heightCm / 100) ** 2 : 0;
  if (kg < floorKg) return 'با همین روند، تا آن روز خیلی جلو رفته‌ای.';
  const less = Math.round((pr.base - pr.kg) * 2) / 2;
  return pr.rate <= -0.05 && less >= 0.5
    ? `با همین روند، آن روز حدود <b>${fa(kg, 1)}</b> کیلو هستی؛ <b>${fa(less, 1)}</b> کیلو سبک‌تر از الان.`
    : `با روند فعلی، آن روز حدود <b>${fa(kg, 1)}</b> کیلو هستی. هنوز ${fa(n)} روز وقت داری روند را عوض کنی.`;
}

// For a "before" photo: how far you've come since the day it was taken.
function sinceLine(day) {
  const sorted = sortedWeights(store.get().weights);
  if (!day || sorted.length < 2) return '';
  let near = null;
  for (const w of sorted) if (Math.abs(diffDays(w.day, day)) <= 10 && (!near || Math.abs(diffDays(w.day, day)) < Math.abs(diffDays(near.day, day)))) near = w;
  const latest = sorted[sorted.length - 1];
  if (!near || near === latest || latest.day <= near.day) return '';
  const lost = Math.round((Number(near.kg) - Number(latest.kg)) * 2) / 2;
  return lost >= 0.5 ? `از آن روز <b>${fa(lost, 1)}</b> کیلو کم کرده‌ای.` : `آن روز ${fa(Number(near.kg), 1)} کیلو بودی.`;
}

const img = (path, cls = '') => {
  const url = store.imageUrl(path);
  return `<img class="${cls}" data-img="${esc(path)}" ${url ? `src="${esc(url)}"` : ''} alt="" decoding="async">`;
};

function slideHtml(m) {
  const photo = m.image_path ? img(m.image_path, 'mot-bg') : '';
  let body;
  if (m.kind === 'event') {
    const proj = projectionLine(m.day);
    body = `<span class="mot-tag">${daysLeft(m.day)} · ${faDM(m.day)}</span>
      <strong class="mot-title">${esc(m.title)}</strong>
      ${proj ? `<p class="mot-line">${proj}</p>` : ''}`;
  } else if (m.kind === 'quote') {
    body = `<p class="mot-quote">${esc(m.title)}</p>`;
  } else if (m.kind === 'before') {
    const since = sinceLine(m.day);
    body = `<span class="mot-tag">من، ${m.day ? faDMY(m.day) : 'قبلاً'}</span>
      ${m.title ? `<strong class="mot-title sm">${esc(m.title)}</strong>` : ''}
      ${since ? `<p class="mot-line">${since}</p>` : ''}`;
  } else {
    body = m.title ? `<strong class="mot-title sm">${esc(m.title)}</strong>` : '';
  }
  return `<button class="mot-slide k-${m.kind}${photo ? ' has-photo' : ''}" data-mot="${m.id}">${photo}<div class="mot-body">${body}</div></button>`;
}

export function motivationCard() {
  const list = store.get().motivations || [];
  if (!list.length) {
    if (dismissed('mot-empty', '1')) return '';
    return `<section class="card mot-empty">
      <strong>چه چیزی به تو انگیزه می‌دهد؟</strong>
      <p class="muted small">یک رویداد پیش رو (مثل یک عروسی)، عکس بدنی که دوست داری، عکسی از خودت یا یک جمله. هر روز اینجا می‌بینی‌اش.</p>
      <div class="row gap"><button class="btn primary sm" data-mot-add>افزودن</button><button class="btn ghost sm" data-mot-later>بعداً</button></div>
    </section>`;
  }
  const v = visible(list, today());
  if (!v.length) return '';
  slideIdx = Math.min(slideIdx, v.length - 1);
  return `<section class="mot">
    <div class="mot-track">${v.map(slideHtml).join('')}</div>
    <div class="mot-foot">
      <div class="mot-dots">${v.length > 1 ? v.map((_, i) => `<i class="${i === slideIdx ? 'on' : ''}"></i>`).join('') : ''}</div>
      <button class="link small" data-mot-list>انگیزه‌ها</button>
    </div>
  </section>`;
}

// Fill in photos whose signed URL wasn't cached yet, without redrawing the page.
export function hydrateImages(root) {
  const paths = [...new Set([...root.querySelectorAll('img[data-img]:not([src])')].map(i => i.dataset.img))];
  if (!paths.length) return;
  store.loadImageUrls(paths).then(() => {
    document.querySelectorAll('img[data-img]:not([src])').forEach(i => {
      const u = store.imageUrl(i.dataset.img);
      if (u) i.src = u;
    });
  });
}

export function bindMotivation(root) {
  root.querySelector('[data-mot-add]')?.addEventListener('click', () => openMotivationEditor());
  root.querySelector('[data-mot-later]')?.addEventListener('click', e => { dismiss('mot-empty', '1'); e.target.closest('.mot-empty').remove(); });
  root.querySelector('[data-mot-list]')?.addEventListener('click', () => openMotivationList());
  const track = root.querySelector('.mot-track');
  if (!track) return;
  hydrateImages(track);
  track.querySelectorAll('[data-mot]').forEach(b => b.onclick = () => openMotivationView(b.dataset.mot));
  const dots = root.querySelectorAll('.mot-dots i');
  // RTL scrollers report negative scrollLeft
  const dir = getComputedStyle(track).direction === 'rtl' ? -1 : 1;
  if (slideIdx) track.scrollLeft = dir * slideIdx * track.clientWidth;
  let raf = 0;
  track.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      slideIdx = Math.round(Math.abs(track.scrollLeft) / track.clientWidth);
      dots.forEach((d, i) => d.classList.toggle('on', i === slideIdx));
    });
  }, { passive: true });
}

/* ---------------- sheets ---------------- */

export function openMotivationView(id) {
  const m = store.get().motivations.find(x => x.id === id);
  if (!m) return;
  sheet.open(body => {
    const extra = m.kind === 'event' ? projectionLine(m.day) : m.kind === 'before' ? sinceLine(m.day) : '';
    body.innerHTML = `
      <div class="sheet-head"><span></span><h2>${KINDS[m.kind].long}</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      ${m.image_path ? img(m.image_path, 'mot-full') : ''}
      ${m.kind === 'quote' ? `<p class="mot-quote big">${esc(m.title)}</p>` : m.title ? `<h3 class="mot-view-title">${esc(m.title)}</h3>` : ''}
      ${m.kind === 'event' ? `<p class="muted">${faDMY(m.day)} · ${m.day < today() ? 'گذشت' : daysLeft(m.day)}</p>` : ''}
      ${m.kind === 'before' && m.day ? `<p class="muted">${faDMY(m.day)}</p>` : ''}
      ${extra ? `<p>${extra}</p>` : ''}
      ${m.note ? `<p class="mot-note">${esc(m.note)}</p>` : ''}
      <div class="row gap"><button class="btn grow" data-edit>${icon.edit} ویرایش</button><button class="btn grow" data-del>حذف</button></div>`;
    hydrateImages(body);
    body.querySelector('[data-close]').onclick = () => sheet.close();
    body.querySelector('[data-edit]').onclick = () => { sheet.close(); openMotivationEditor(m); };
    body.querySelector('[data-del]').onclick = async () => {
      if (!(await confirmBox('این انگیزه حذف شود؟', 'حذف'))) return;
      store.deleteMotivation(m.id);
      sheet.close();
      toast('حذف شد');
    };
  });
}

export function openMotivationList() {
  sheet.open(body => {
    const draw = () => {
      const t = today();
      // upcoming events (nearest first), then the rest (newest first), then past events
      const group = m => (m.kind !== 'event' ? 1 : m.day >= t ? 0 : 2);
      const list = [...store.get().motivations].sort((a, b) => group(a) - group(b)
        || (group(a) === 0 ? (a.day < b.day ? -1 : 1) : group(a) === 2 ? (a.day < b.day ? 1 : -1) : (a.created_at < b.created_at ? 1 : -1)));
      body.innerHTML = `
        <div class="sheet-head"><span></span><h2>انگیزه‌های من</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
        <div class="mot-list">
          ${list.map(m => `<button class="mot-row" data-id="${m.id}">
            ${m.image_path ? img(m.image_path, 'mot-thumb') : `<span class="mot-thumb ph k-${m.kind}"></span>`}
            <span class="grow"><b>${esc(m.kind === 'quote' ? m.title : m.title || KINDS[m.kind].long)}</b>
            <small class="muted">${KINDS[m.kind].label}${m.kind === 'event' ? ` · ${faDM(m.day)}${m.day < t ? ' · گذشت' : ''}` : ''}</small></span>
          </button>`).join('') || '<div class="empty">هنوز چیزی اضافه نکرده‌ای.</div>'}
        </div>
        <button class="btn primary block" data-add>${icon.plus} افزودن انگیزه</button>`;
      hydrateImages(body);
      body.querySelector('[data-close]').onclick = () => sheet.close();
      body.querySelector('[data-add]').onclick = () => openMotivationEditor(null, draw);
      body.querySelectorAll('[data-id]').forEach(b => b.onclick = () => openMotivationView(b.dataset.id));
    };
    draw();
    // keep the list current while view/edit sheets open on top of it
    const off = store.subscribe(() => { if (body.isConnected) draw(); else off(); });
  }, { tall: true });
}

// Shrink photos before upload: phone cameras produce 4–12 MB files.
async function shrink(file, max = 1280) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {
    src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  }
  const k = Math.min(1, max / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', 0.82));
}

function dateFields(day, years) {
  const j = jParts(day);
  if (!years.includes(j.y)) years = [...years, j.y].sort();
  return `<div class="date3">
    <select name="jd" aria-label="روز">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${i + 1 === j.d ? 'selected' : ''}>${fa(i + 1)}</option>`).join('')}</select>
    <select name="jm" aria-label="ماه">${J_MONTHS.map((n, i) => `<option value="${i + 1}" ${i + 1 === j.m ? 'selected' : ''}>${n}</option>`).join('')}</select>
    <select name="jy" aria-label="سال">${years.map(y => `<option value="${y}" ${y === j.y ? 'selected' : ''}>${fa(y).replace(/٬/g, '')}</option>`).join('')}</select>
  </div>`;
}

export function openMotivationEditor(existing = null, onDone = null) {
  const d = existing ? { ...existing } : { kind: 'event', title: '', note: '', day: null, image_path: null };
  let blob = null; // newly picked photo, not uploaded yet
  let preview = null;
  let removePhoto = false;

  sheet.open(body => {
    const draw = () => {
      const t = today();
      const cy = jParts(t).y;
      const k = d.kind;
      const day = d.day || (k === 'event' ? addDays(t, 30) : t);
      const years = k === 'event' ? [cy, cy + 1, cy + 2] : [cy - 3, cy - 2, cy - 1, cy];
      const curPhoto = preview || (!removePhoto && d.image_path ? store.imageUrl(d.image_path) || '' : '');
      const hasPhoto = !!(blob || (!removePhoto && d.image_path));
      body.innerHTML = `
        <div class="sheet-head"><span></span><h2>${existing ? 'ویرایش انگیزه' : 'انگیزه‌ی تازه'}</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
        <form class="stack" novalidate>
          ${existing ? '' : `<div class="seg small" data-kind>${Object.entries(KINDS).map(([v, x]) => `<button type="button" data-v="${v}" class="${v === k ? 'on' : ''}">${x.label}</button>`).join('')}</div>`}
          ${k === 'quote'
            ? `<label class="field"><span>جمله</span><textarea name="title" rows="3" placeholder="مثلاً: می‌خواهم با بچه‌ها فوتبال بازی کنم و کم نیاورم">${esc(d.title)}</textarea></label>`
            : `<label class="field"><span>${k === 'event' ? 'چه رویدادی؟' : 'عنوان'} ${k === 'event' ? '' : '<em>اختیاری</em>'}</span><input name="title" value="${esc(d.title)}" placeholder="${k === 'event' ? 'مثلاً عروسی پسرخاله' : k === 'image' ? 'مثلاً بدنی که می‌خواهم' : 'مثلاً شروع راه'}" autocomplete="off"></label>`}
          ${k === 'event' || k === 'before' ? `<div class="field"><span>${k === 'event' ? 'تاریخ' : 'تاریخ عکس'}</span>${dateFields(day, years)}</div>` : ''}
          ${k !== 'quote' ? `<div class="field"><span>عکس ${NEEDS_PHOTO[k] ? '' : '<em>اختیاری</em>'}</span>
            <div class="photo-pick">
              ${hasPhoto ? `<img class="photo-prev" ${curPhoto ? `src="${esc(curPhoto)}"` : ''} ${!blob && d.image_path ? `data-img="${esc(d.image_path)}"` : ''} alt="">` : ''}
              <label class="btn grow file-btn">${hasPhoto ? 'عوض کردن عکس' : 'انتخاب عکس'}<input type="file" accept="image/*" hidden data-file></label>
              ${hasPhoto && !NEEDS_PHOTO[k] ? '<button type="button" class="btn ghost sm" data-nophoto>بدون عکس</button>' : ''}
            </div></div>` : ''}
          ${k === 'event' ? `<label class="field"><span>چرا برایت مهم است؟ <em>اختیاری</em></span><textarea name="note" rows="2" placeholder="مثلاً می‌خواهم کت‌وشلوار سایز کوچک‌تر بپوشم">${esc(d.note)}</textarea></label>` : ''}
          <p class="err" hidden></p>
          <button class="btn primary block big" data-save>ذخیره</button>
        </form>`;
      hydrateImages(body);
      const form = body.querySelector('form');
      const read = () => {
        const F = form.elements;
        d.title = F.title.value;
        if (F.note) d.note = F.note.value;
        if (F.jy) d.day = fromJalali(Number(F.jy.value), Number(F.jm.value), Number(F.jd.value)) || d.day;
      };
      body.querySelector('[data-close]').onclick = () => sheet.close();
      body.querySelector('[data-kind]')?.addEventListener('click', e => {
        const b = e.target.closest('[data-v]');
        if (!b || b.dataset.v === d.kind) return;
        read();
        d.kind = b.dataset.v; d.day = null;
        draw();
      });
      body.querySelector('[data-nophoto]')?.addEventListener('click', () => { read(); blob = null; preview = null; removePhoto = true; draw(); });
      body.querySelector('[data-file]')?.addEventListener('change', async e => {
        const f = e.target.files?.[0];
        if (!f) return;
        read();
        try {
          blob = await shrink(f);
          if (preview) URL.revokeObjectURL(preview);
          preview = URL.createObjectURL(blob);
          removePhoto = false;
          draw();
        } catch { toast('این عکس باز نشد؛ عکس دیگری انتخاب کنید'); }
      });
      form.onsubmit = async e => {
        e.preventDefault();
        const F = form.elements;
        const err = msg => { const el = form.querySelector('.err'); el.textContent = msg; el.hidden = false; };
        d.title = F.title.value.trim();
        if (F.note) d.note = F.note.value.trim();
        if (F.jy) {
          const day = fromJalali(Number(F.jy.value), Number(F.jm.value), Number(F.jd.value));
          if (!day) return err('این تاریخ در تقویم وجود ندارد.');
          if (d.kind === 'event' && day < today() && day !== existing?.day) return err('این تاریخ گذشته است.');
          if (d.kind === 'before' && day > today()) return err('تاریخ عکس نمی‌تواند در آینده باشد.');
          d.day = day;
        } else d.day = null;
        if ((d.kind === 'event' || d.kind === 'quote') && !d.title) return err(d.kind === 'event' ? 'بنویس چه رویدادی است.' : 'جمله را بنویس.');
        if (NEEDS_PHOTO[d.kind] && !blob && (removePhoto || !d.image_path)) return err('یک عکس انتخاب کن.');
        const btn = body.querySelector('[data-save]');
        btn.disabled = true;
        let path = d.kind === 'quote' || removePhoto ? null : d.image_path;
        if (blob && d.kind !== 'quote') {
          btn.textContent = 'در حال آپلود عکس…';
          try { path = await store.uploadImage(blob); } catch (x) { btn.disabled = false; btn.textContent = 'ذخیره'; return err(x.message); }
        }
        if (preview) URL.revokeObjectURL(preview);
        store.saveMotivation({ ...d, note: d.kind === 'event' ? d.note : '', image_path: path });
        sheet.close();
        toast('ذخیره شد');
        onDone?.();
      };
    };
    draw();
  }, { tall: true });
}
