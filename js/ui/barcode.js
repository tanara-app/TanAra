/*
  Scanning a packaged food's barcode, and filling a food form from it.

  The camera is read with the browser's BarcodeDetector (Android Chrome has one); where it
  is missing (iPhone) a ZXing WebAssembly polyfill is loaded from the CDN on first use.
  The product is looked up on Open Food Facts; when it isn't there (most Iranian brands
  aren't) Hooshvareh can read a photo of the nutrition label instead.
*/
import { validBarcode, offFood, labelFood } from '../domain/barcode.js';
import { GRAM } from '../data/seedFoods.js';
import { fa, faDigits } from '../lib/fa.js';
import { toast, icon } from './dom.js';
import { ask, aiAvailable, sparkle } from '../ai/hooshvareh.js';
import { pickPhoto, foodPhoto, cameraIcon } from './photo.js';

const POLYFILL = 'https://cdn.jsdelivr.net/npm/barcode-detector@3.0.8/dist/es/ponyfill.js';
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

export const barcodeIcon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M3 7V5a1 1 0 0 1 1-1h2M18 4h2a1 1 0 0 1 1 1v2M21 17v2a1 1 0 0 1-1 1h-2M6 20H4a1 1 0 0 1-1-1v-2"/><path d="M7 8v8M10 8v8M13 8v8M17 8v8"/></svg>';

let detector = null;
async function getDetector() {
  if (detector) return detector;
  let D = globalThis.BarcodeDetector;
  if (!D || !(await D.getSupportedFormats?.().catch(() => []))?.includes('ean_13')) D = (await import(POLYFILL)).BarcodeDetector;
  return (detector = new D({ formats: FORMATS }));
}

/*
  Full-screen camera view. Resolves to the barcode's digits, or null when closed.
  The digits can also be typed (no camera, permission refused, a worn label).
*/
export function scanBarcode() {
  return new Promise(resolve => {
    const box = document.createElement('div');
    box.className = 'scan';
    box.innerHTML = `
      <video playsinline muted autoplay></video>
      <div class="scan-frame"></div>
      <div class="scan-top"><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button><span>بارکد را داخل کادر بگیر</span></div>
      <form class="scan-type" novalidate>
        <input name="code" inputmode="numeric" placeholder="یا عددهای زیر بارکد را بنویس" autocomplete="off">
        <button class="btn">برو</button>
      </form>`;
    document.body.append(box);
    const video = box.querySelector('video');
    let stream = null, done = false, timer = 0;

    const finish = code => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stream?.getTracks().forEach(t => t.stop());
      removeEventListener('popstate', close);
      box.remove();
      resolve(code);
    };
    const close = () => finish(null);
    box.querySelector('[data-close]').onclick = close;
    addEventListener('popstate', close);
    box.querySelector('form').onsubmit = e => {
      e.preventDefault();
      // Persian / Arabic digits too; kept as text, since a leading zero matters
      const code = e.target.elements.code.value.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');
      validBarcode(code) ? finish(code) : toast('این عدد بارکد درستی نیست');
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
        if (done) return stream.getTracks().forEach(t => t.stop());
        video.srcObject = stream;
        await video.play().catch(() => {});
        const det = await getDetector();
        const tick = async () => {
          if (done) return;
          try {
            if (video.readyState >= 2) {
              const hit = (await det.detect(video)).find(b => validBarcode(b.rawValue));
              if (hit) { navigator.vibrate?.(60); return finish(hit.rawValue); }
            }
          } catch { /* a frame that can't be read: try the next one */ }
          timer = setTimeout(tick, 200);
        };
        tick();
      } catch (e) {
        if (done) return;
        box.classList.add('no-cam');
        box.querySelector('.scan-top span').textContent = e?.name === 'NotAllowedError'
          ? 'اجازه‌ی دوربین داده نشد؛ عددهای زیر بارکد را بنویس'
          : 'دوربین باز نشد؛ عددهای زیر بارکد را بنویس';
        box.querySelector('input').focus();
      }
    })();
  });
}

// Open Food Facts: the product, or null when it isn't there. Throws when offline / unreachable.
export async function lookupBarcode(code) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_fa,generic_name,brands,nutriments,product_quantity,categories_tags`, { signal: ctl.signal });
    if (res.status === 404) return null;
    const j = await res.json();
    return j.status === 1 ? j.product : null;
  } finally { clearTimeout(t); }
}

// A note box under the name field of a food form that came from a barcode.
export const barcodeBox = code => `<div class="bc-box" data-bc><p class="small muted">${barcodeIcon} بارکد <bdi>${faDigits(code)}</bdi> <span data-bc-msg>· دارم دنبالش می‌گردم…</span></p></div>`;

/*
  Looks the code up and fills the form (name if empty, unit, weight, kcal, protein, and
  category / veg where the form has them). When the product or its numbers aren't found,
  offers to photograph the label for Hooshvareh. onFill(food) hears every fill (a form
  without a category field can keep the product's category that way).
*/
export async function fillFromBarcode(root, F, units, code, onFill) {
  const box = root.querySelector('[data-bc]');
  const msg = box.querySelector('[data-bc-msg]');
  const fill = (f, src) => {
    if (!box.isConnected) return;
    if (f.name && !F.name.value.trim()) F.name.value = f.name;
    units.set({ unit: f.unit, grams: f.unit === GRAM ? 1 : f.grams, kcal: f.kcal, protein: f.protein });
    if (F.category && f.category && f.category !== 'other') { F.category.value = f.category; F.category.dispatchEvent(new Event('change')); }
    if (f.is_veg) F.veg.checked = true;
    onFill?.(f);
    msg.textContent = `· ${src}: هر ۱۰۰ گرم ${fa(f.kcal100)} کالری، ${fa(f.protein100, 1)} گرم پروتئین. با برچسب بسته چک کن.`;
  };
  const offerLabel = text => {
    msg.textContent = `· ${text}`;
    if (!aiAvailable() || box.querySelector('[data-label]')) return;
    box.insertAdjacentHTML('beforeend', `<button type="button" class="btn ai-btn block" data-label>${cameraIcon} از جدول ارزش غذایی عکس بگیر؛ هوشواره بخواند</button><p class="muted small ai-est-note" hidden></p>`);
    const btn = box.querySelector('[data-label]');
    btn.onclick = async () => {
      const file = await pickPhoto();
      if (!file || !btn.isConnected) return;
      const label = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `${sparkle()} هوشواره دارد برچسب را می‌خواند…`;
      try {
        const shot = await foodPhoto(file);
        URL.revokeObjectURL(shot.url);
        const r = await ask('label', { image: shot.b64, name: F.name.value.trim() });
        const f = r.found && labelFood({ name: r.name, kcal100: r.kcal_100, protein100: r.protein_100, packG: r.pack_g, category: r.category, is_veg: r.is_veg });
        const note = box.querySelector('.ai-est-note');
        if (f) fill(f, 'از روی برچسب');
        if (note) { note.textContent = r.note; note.hidden = !r.note; }
        if (!f) toast('عددهای برچسب خوانده نشد');
      } catch (x) { toast(x.message || 'عکس خوانده نشد'); }
      btn.disabled = false;
      btn.innerHTML = label;
    };
  };

  let p;
  try { p = await lookupBarcode(code); } catch { return offerLabel('بانک جهانی محصولات در دسترس نبود.'); }
  const f = offFood(p);
  if (f) return fill(f, 'از Open Food Facts');
  if (p) {
    const named = offFood({ ...p, nutriments: { 'energy-kcal_100g': 0 } })?.name;
    if (named && !F.name.value.trim()) F.name.value = named;
  }
  offerLabel(p ? 'پیدا شد ولی کالری‌اش ثبت نشده.' : 'این محصول در بانک جهانی محصولات نیست.');
}
