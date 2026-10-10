// Profile & settings: targets, questionnaire edit, data export/import, doctor guidance, account.
import * as store from '../data/store.js';
import { computeTargets, effectiveTargets, clampKcal, safeFloor, hasMedicalFlag, ACTIVITY, CONDITIONS } from '../domain/targets.js';
import { sortedWeights } from '../domain/stats.js';
import { DOCTOR_SIGNS } from '../domain/safety.js';
import { fa, kcal50, parseNum, esc } from '../lib/fa.js';
import { today, faDMY } from '../lib/dates.js';
import { sheet, toast, confirmBox, icon } from './dom.js';
import { fieldsHtml, readFields, bindChoices, validate, medicalNoteHtml, targetsHtml } from './onboarding.js';
import { openFoodBank } from './foodBank.js';
import { openMotivationList, openMotivationEditor } from './motivation.js';
import { bindVault } from './vault.js';

let session = { email: null, signOut: null, local: true };
export const setSession = s => { session = s; };

function latestWeight() {
  const w = sortedWeights(store.get().weights);
  return w.length ? Number(w[w.length - 1].kg) : null;
}

// Recompute from the latest logged weight. Manual overrides are cleared.
export function recalcTargets() {
  const p = store.profile();
  const kg = latestWeight() ?? p.targets?.baseWeight;
  const t = computeTargets({ ...p, weightKg: kg });
  store.saveProfile({ ...p, targets: { kcal: t.kcal, protein: t.protein, baseWeight: kg, computedAt: today() } });
  return t;
}

export function renderProfile(root) {
  const s = store.get();
  const p = store.profile();
  const eff = effectiveTargets(p);
  const kg = latestWeight();
  const st = store.syncStatus;

  root.innerHTML = `
    <header class="page-head"><h1>نمایه</h1></header>

    <section class="card">
      <h2 class="card-h">هدف‌های روزانه</h2>
      <div class="targets">
        <div class="tile big"><span>کالری</span><b>${kcal50(eff.kcal)}</b><small>${p.targets?.manualKcal ? 'دستی' : 'محاسبه‌شده'}</small></div>
        <div class="tile big"><span>پروتئین</span><b>${fa(eff.protein)}</b><small>گرم${p.targets?.manualProtein ? ' · دستی' : ''}</small></div>
      </div>
      <p class="muted small">آخرین محاسبه با وزن ${fa(p.targets?.baseWeight, 1)} کیلو${p.targets?.computedAt ? `، ${faDMY(p.targets.computedAt)}` : ''}.</p>
      <div class="row gap">
        <button class="btn grow" data-recalc>محاسبه‌ی دوباره</button>
        <button class="btn grow" data-manual>تنظیم دستی</button>
      </div>
    </section>

    <section class="card">
      <h2 class="card-h">اطلاعات من</h2>
      <dl class="calc">
        <div><dt>سن</dt><dd>${fa(p.age)}</dd></div>
        <div><dt>جنس</dt><dd>${p.sex === 'male' ? 'مرد' : 'زن'}</dd></div>
        <div><dt>قد</dt><dd>${fa(p.heightCm, 1)} سانتی‌متر</dd></div>
        <div><dt>آخرین وزن</dt><dd>${kg ? `${fa(kg, 1)} کیلو` : '—'}</dd></div>
        ${p.waistCm ? `<div><dt>دور کمر</dt><dd>${fa(p.waistCm, 1)} سانتی‌متر</dd></div>` : ''}
        <div><dt>فعالیت</dt><dd>${ACTIVITY[p.activity]?.label || '—'}</dd></div>
        <div><dt>بیماری‌ها</dt><dd>${p.conditions?.length ? p.conditions.map(c => CONDITIONS[c]).join('، ') : 'ندارم'}</dd></div>
        ${p.medications ? `<div><dt>داروها</dt><dd>${esc(p.medications)}</dd></div>` : ''}
      </dl>
      <button class="btn block" data-edit>${icon.edit} ویرایش اطلاعات</button>
    </section>

    <section class="card">
      <h2 class="card-h">انگیزه‌ها</h2>
      <p class="muted small">${s.motivations.length ? `${fa(s.motivations.length)} انگیزه ثبت کرده‌اید؛ هر روز بالای صفحه‌ی «امروز» نشان داده می‌شوند.` : 'رویدادی که منتظرش هستید، عکس بدنی که می‌خواهید، عکسی از خودتان یا یک جمله؛ هر روز بالای صفحه‌ی «امروز» می‌بینیدشان.'}</p>
      <div class="row gap">
        ${s.motivations.length ? '<button class="btn grow" data-mots>مدیریت انگیزه‌ها</button>' : ''}
        <button class="btn grow" data-mot-new>افزودن انگیزه</button>
      </div>
      <button class="btn block vault-entry" data-vault-open>${icon.lock} صندوقچه‌ی خصوصی${s.vault?.length ? ` · ${fa(s.vault.length)} مورد` : ''}</button>
      <p class="muted small">عکس‌ها و ویدیوهای شخصی‌ای که انگیزه می‌دهند؛ با رمز شش‌رقمی باز می‌شود.</p>
    </section>

    <section class="card doctor-box">
      <h2 class="card-h">چه وقت به پزشک مراجعه کنم</h2>
      <p class="small">اگر هر کدام از این‌ها را داشتید، با پزشک‌تان صحبت کنید:</p>
      <ul>${DOCTOR_SIGNS.map(s => `<li>${s}</li>`).join('')}</ul>
      ${hasMedicalFlag(p) ? '<p class="small muted">چون بیماری زمینه‌ای یا دارو را ثبت کرده‌اید، بهتر است پزشک‌تان در جریان رژیم باشد.</p>' : ''}
    </section>

    <section class="card">
      <h2 class="card-h">داده‌ها</h2>
      <p class="muted small">یک فایل از همه‌ی داده‌ها بگیرید و جایی نگه دارید. با وارد کردن همان فایل، همه چیز برمی‌گردد.</p>
      <div class="row gap">
        <button class="btn grow" data-export>گرفتن خروجی</button>
        <label class="btn grow file-btn">وارد کردن فایل<input type="file" accept="application/json,.json" hidden data-import></label>
      </div>
      <div class="row gap mt">
        <button class="btn grow" data-bank>بانک غذا</button>
        <button class="btn grow" data-defaults>بازگرداندن غذاهای پیش‌فرض</button>
      </div>
    </section>

    <section class="card">
      <h2 class="card-h">حساب</h2>
      ${session.local
        ? '<p class="muted small">حالت آزمایشی محلی — داده‌ها فقط روی همین مرورگر است.</p>'
        : `<p class="small">${esc(session.email || '')}</p>
           <p class="muted small">${st.pending ? `${fa(st.pending)} تغییر در صف ارسال به سرور` : 'همه چیز روی سرور ذخیره شده'}${st.error ? ` · ${esc(st.error)}` : ''}</p>
           <button class="btn block" data-signout>خروج از حساب</button>`}
    </section>
    <p class="muted small center">تن‌آرا · نسخه‌ی ۱</p>`;

  root.querySelector('[data-recalc]').onclick = async () => {
    const msg = p.targets?.manualKcal || p.targets?.manualProtein
      ? 'هدف‌ها با آخرین وزن دوباره حساب شوند؟ تنظیم دستی پاک می‌شود.' : 'هدف‌ها با آخرین وزن دوباره حساب شوند؟';
    if (await confirmBox(msg, 'حساب کن')) { recalcTargets(); toast('هدف‌ها به‌روز شد'); }
  };
  root.querySelector('[data-manual]').onclick = () => openManual(p);
  root.querySelector('[data-edit]').onclick = () => openEdit(p);
  root.querySelector('[data-export]').onclick = doExport;
  root.querySelector('[data-import]').onchange = e => doImport(e.target);
  root.querySelector('[data-mots]')?.addEventListener('click', () => openMotivationList());
  root.querySelector('[data-mot-new]').onclick = () => openMotivationEditor();
  bindVault(root);
  root.querySelector('[data-bank]').onclick = () => openFoodBank();
  root.querySelector('[data-defaults]').onclick = () => {
    const n = store.restoreDefaultFoods();
    toast(n ? `${fa(n)} غذا برگشت` : 'همه‌ی غذاهای پیش‌فرض در بانک هست');
  };
  root.querySelector('[data-signout]')?.addEventListener('click', async () => {
    if (store.syncStatus.pending && !(await confirmBox('هنوز چند تغییر به سرور نرسیده و با خروج از دست می‌رود. خارج می‌شوید؟', 'خروج'))) return;
    session.signOut?.();
  });
}

function openManual(p) {
  const floor = safeFloor(p.sex);
  const eff = effectiveTargets(p);
  sheet.open(body => {
    body.innerHTML = `
      <div class="sheet-head"><h2>تنظیم دستی هدف</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <form class="stack" novalidate>
        <label class="field"><span>کالری روزانه</span><input name="kcal" inputmode="numeric" value="${fa(eff.kcal)}"></label>
        <p class="muted small">کمتر از ${fa(floor)} کالری تنظیم نمی‌شود؛ این حداقل ایمن است.</p>
        <label class="field"><span>پروتئین روزانه (گرم)</span><input name="protein" inputmode="numeric" value="${fa(eff.protein)}"></label>
        <button class="btn primary block big">ذخیره</button>
      </form>`;
    body.querySelector('[data-close]').onclick = () => sheet.close();
    body.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const F = e.target.elements;
      const k = parseNum(F.kcal.value);
      const pr = parseNum(F.protein.value);
      if (!(k > 0) || !(pr > 0)) return toast('عددها را درست وارد کنید');
      const kcal = clampKcal(p.sex, k);
      store.saveProfile({ ...p, targets: { ...p.targets, manualKcal: kcal, manualProtein: Math.round(pr) } });
      sheet.close();
      toast(kcal > k ? `روی حداقل ایمن (${fa(kcal)}) گذاشته شد` : 'ذخیره شد');
    };
  });
}

function openEdit(p) {
  const d = structuredClone(p);
  sheet.open(body => {
    body.innerHTML = `
      <div class="sheet-head"><h2>ویرایش اطلاعات</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <form class="stack" novalidate>
        ${fieldsHtml.basics(d)}
        ${fieldsHtml.body(d, false)}
        <h3 class="list-h">فعالیت</h3>${fieldsHtml.activity(d)}
        <h3 class="list-h">سلامت</h3>${fieldsHtml.health(d)}
        ${fieldsHtml.ed(d)}
        <p class="err" hidden></p>
        <button class="btn primary block big">ذخیره و محاسبه‌ی دوباره</button>
      </form>`;
    const form = body.querySelector('form');
    bindChoices(form, d);
    body.querySelector('[data-close]').onclick = () => sheet.close();
    form.onsubmit = e => {
      e.preventDefault();
      readFields(form, d);
      const err = validate(d, false);
      if (err) { const el = form.querySelector('.err'); el.textContent = err; el.hidden = false; return; }
      const { weightKg, ...clean } = d;
      store.saveProfile(clean);
      const t = recalcTargets();
      sheet.close();
      if (hasMedicalFlag(clean) && !hasMedicalFlag(p)) {
        sheet.open(b => {
          b.innerHTML = `${medicalNoteHtml()}${targetsHtml(t)}<button class="btn primary block" data-ok>باشه</button>`;
          b.querySelector('[data-ok]').onclick = () => sheet.close();
        });
      } else toast('ذخیره شد');
    };
  }, { tall: true });
}

function doExport() {
  const data = store.exportData();
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tanara-${today()}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('فایل خروجی ساخته شد');
}

async function doImport(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  let obj;
  try { obj = JSON.parse(await file.text()); } catch { return toast('فایل خوانده نشد'); }
  const err = store.validateImport(obj);
  if (err) return toast(err);
  const n = obj.data.entries.length;
  if (!(await confirmBox(`همه‌ی داده‌های فعلی با محتوای این فایل (${fa(n)} ثبت غذا، ${fa(obj.data.weights.length)} وزن) جایگزین می‌شود. ادامه می‌دهید؟`, 'جایگزین کن'))) return;
  store.importData(obj);
  toast('داده‌ها برگشت');
}
