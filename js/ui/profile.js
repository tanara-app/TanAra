// Profile & settings: the targets and the phase up front; everything else (my details,
// reminders, motivations, food bank, shopping list, AI use, data, account) is one list of rows that open sheets.
import * as store from '../data/store.js';
import { effectiveTargets, clampKcal, safeFloor, hasMedicalFlag, ACTIVITY, CONDITIONS } from '../domain/targets.js';
import { sortedWeights } from '../domain/stats.js';
import { nextTargets } from '../domain/energy.js';
import { fa, kcal50, parseNum, esc } from '../lib/fa.js';
import { today, faDMY } from '../lib/dates.js';
import { sheet, toast, confirmBox, icon } from './dom.js';
import { fieldsHtml, readFields, bindChoices, validate, medicalNoteHtml, targetsHtml } from './onboarding.js';
import { openFoodBank } from './foodBank.js';
import { openMotivationList } from './motivation.js';
import { bindVault } from './vault.js';
import { phaseCard, bindPhase } from './phase.js';
import { remindersLine, bindReminders } from './reminders.js';
import { openUsage } from './usage.js';
import { openShopping, shoppingLine } from './shopping.js';
import { aiAvailable } from '../ai/hooshvareh.js';

let session = { email: null, signOut: null, local: true };
export const setSession = s => { session = s; };

function latestWeight() {
  const w = sortedWeights(store.get().weights);
  return w.length ? Number(w[w.length - 1].kg) : null;
}

// Recompute from the latest logged weight — and from the measured energy use once the log
// is long enough for one (see energy.js). Manual overrides are cleared.
export function recalcTargets() {
  const p = store.profile();
  const s = store.get();
  const kg = latestWeight() ?? p.targets?.baseWeight;
  const { t } = nextTargets(p, s.entries, s.weights, kg, today());
  store.saveProfile({ ...p, targets: { kcal: t.kcal, protein: t.protein, baseWeight: kg, computedAt: today(), tdee: t.tdee, source: t.measured ? 'measured' : 'formula' } });
  return t;
}

const row = (attr, title, sub) => `<button class="set-row" ${attr}><span class="grow"><b>${title}</b>${sub ? `<small class="muted">${sub}</small>` : ''}</span>${icon.chevL}</button>`;

export function renderProfile(root) {
  const s = store.get();
  const p = store.profile();
  const eff = effectiveTargets(p);
  const st = store.syncStatus;

  root.innerHTML = `
    <header class="page-head"><h1>نمایه</h1></header>

    <section class="card">
      <h2 class="card-h">هدف‌های روزانه</h2>
      <div class="targets">
        <div class="tile big"><span>کالری</span><b>${kcal50(eff.kcal)}</b><small>${eff.phase !== 'loss' ? 'سطح نگهداری' : p.targets?.manualKcal ? 'دستی' : p.targets?.source === 'measured' ? 'از مصرف واقعی بدنت' : 'محاسبه‌شده'}</small></div>
        <div class="tile big"><span>پروتئین</span><b>${fa(eff.protein)}</b><small>گرم${p.targets?.manualProtein ? ' · دستی' : ''}</small></div>
      </div>
      <p class="muted small">آخرین محاسبه با وزن ${fa(p.targets?.baseWeight, 1)} کیلو${p.targets?.computedAt ? `، ${faDMY(p.targets.computedAt)}` : ''}.</p>
      <div class="row gap">
        <button class="btn grow" data-recalc>محاسبه‌ی دوباره</button>
        <button class="btn grow" data-manual>تنظیم دستی</button>
      </div>
    </section>

    ${phaseCard()}

    <section class="card set-list">
      ${row('data-edit', 'اطلاعات من', `${fa(p.age)} ساله · قد ${fa(p.heightCm, 1)} · ${ACTIVITY[p.activity]?.label || ''}${p.conditions?.length ? ` · ${p.conditions.map(c => CONDITIONS[c]).join('، ')}` : ''}`)}
      ${row('data-reminders', 'یادآورها', remindersLine())}
      ${row('data-mots', 'انگیزه‌ها', s.motivations.length ? `${fa(s.motivations.length)} مورد؛ بالای صفحه‌ی «امروز»` : 'هنوز چیزی اضافه نکرده‌ای')}
      ${row('data-vault-open', 'صندوقچه‌ی خصوصی', `${s.vault?.length ? `${fa(s.vault.length)} مورد · ` : ''}با رمز شش‌رقمی`)}
      ${row('data-bank', 'بانک غذا', `${fa(s.foods.length)} غذا`)}
      ${row('data-shopping', 'لیست خرید', shoppingLine())}
      ${aiAvailable() ? row('data-usage', 'مصرف هوشواره', 'هر کار هوشواره چقدر هزینه داشته') : ''}
      ${row('data-data', 'داده‌ها و پشتیبان', 'خروجی گرفتن، برگرداندن، غذاهای پیش‌فرض')}
      ${row('data-account', 'حساب', session.local ? 'حالت آزمایشی محلی' : `${esc(session.email || '')}${st.pending ? ` · ${fa(st.pending)} تغییر در صف` : ''}`)}
    </section>
    <p class="muted small center">تن‌آرا · نسخه‌ی ۱</p>`;

  root.querySelector('[data-recalc]').onclick = async () => {
    const msg = p.targets?.manualKcal || p.targets?.manualProtein
      ? 'هدف‌ها با آخرین وزن دوباره حساب شوند؟ تنظیم دستی پاک می‌شود.' : 'هدف‌ها با آخرین وزن دوباره حساب شوند؟';
    if (await confirmBox(msg, 'حساب کن')) { recalcTargets(); toast('هدف‌ها به‌روز شد'); }
  };
  root.querySelector('[data-manual]').onclick = () => openManual(p);
  root.querySelector('[data-edit]').onclick = () => openEdit(p);
  root.querySelector('[data-mots]').onclick = () => openMotivationList();
  bindVault(root);
  bindPhase(root);
  bindReminders(root);
  root.querySelector('[data-usage]')?.addEventListener('click', openUsage);
  root.querySelector('[data-bank]').onclick = () => openFoodBank();
  root.querySelector('[data-shopping]').onclick = () => openShopping();
  root.querySelector('[data-data]').onclick = openData;
  root.querySelector('[data-account]').onclick = openAccount;
}

function openData() {
  sheet.open(body => {
    body.innerHTML = `
      <div class="sheet-head"><h2>داده‌ها و پشتیبان</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <div class="stack">
        <p class="muted small">یک فایل از همه‌ی داده‌ها بگیر و جایی نگه دار. با وارد کردن همان فایل، همه چیز برمی‌گردد.</p>
        <button class="btn block" data-export>گرفتن خروجی</button>
        <label class="btn block file-btn">وارد کردن فایل<input type="file" accept="application/json,.json" hidden data-import></label>
        <button class="btn block" data-defaults>بازگرداندن غذاهای پیش‌فرض</button>
      </div>`;
    body.querySelector('[data-close]').onclick = () => sheet.close();
    body.querySelector('[data-export]').onclick = doExport;
    body.querySelector('[data-import]').onchange = async e => { if (await doImport(e.target)) sheet.close(); };
    body.querySelector('[data-defaults]').onclick = () => {
      const n = store.restoreDefaultFoods();
      toast(n ? `${fa(n)} غذا برگشت` : 'همه‌ی غذاهای پیش‌فرض در بانک هست');
    };
  });
}

function openAccount() {
  const st = store.syncStatus;
  sheet.open(body => {
    body.innerHTML = `
      <div class="sheet-head"><h2>حساب</h2><button class="icon-btn" data-close aria-label="بستن">${icon.close}</button></div>
      <div class="stack">
        ${session.local
          ? '<p class="muted small">حالت آزمایشی محلی — داده‌ها فقط روی همین مرورگر است.</p>'
          : `<p>${esc(session.email || '')}</p>
             <p class="muted small">${st.pending ? `${fa(st.pending)} تغییر در صف ارسال به سرور` : 'همه چیز روی سرور ذخیره شده'}${st.error ? ` · ${esc(st.error)}` : ''}</p>
             <button class="btn block" data-signout>خروج از حساب</button>`}
      </div>`;
    body.querySelector('[data-close]').onclick = () => sheet.close();
    body.querySelector('[data-signout]')?.addEventListener('click', async () => {
      if (store.syncStatus.pending && !(await confirmBox('هنوز چند تغییر به سرور نرسیده و با خروج از دست می‌رود. خارج می‌شوید؟', 'خروج'))) return;
      sheet.close();
      session.signOut?.();
    });
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
        ${fieldsHtml.body(d, false, false)}
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
  return true;
}
