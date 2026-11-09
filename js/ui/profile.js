// Profile & settings: the targets (folded to one line) and the phase up front; everything else is rows
// that open sheets, in small titled groups so the eye finds the group first and then the row.
import * as store from '../data/store.js';
import { effectiveTargets, clampKcal, floorFor, hasMedicalFlag, ACTIVITY, CONDITIONS, correcting, rampKcal } from '../domain/targets.js';
import { sortedWeights } from '../domain/stats.js';
import { nextTargets } from '../domain/energy.js';
import { fa, kcal50, parseNum, esc } from '../lib/fa.js';
import { today, faDMY } from '../lib/dates.js';
import { sheet, toast, confirmBox, choose, icon } from './dom.js';
import { fieldsHtml, readFields, bindChoices, validate, medicalNoteHtml, targetsHtml } from './onboarding.js';
import { openFoodBank } from './foodBank.js';
import { openMotivationList } from './motivation.js';
import { phaseCard, bindPhase } from './phase.js';
import { remindersLine, bindReminders } from './reminders.js';
import { openUsage } from './usage.js';
import { shareAdmin, shareLine, checkShare, openFoodShare } from './foodShare.js';
import { openShopping, shoppingLine } from './shopping.js';
import { aiAvailable } from '../ai/hooshvareh.js';
import { THEMES, PALETTES, getTheme, setTheme, getPalette, setPalette } from './theme.js';
import { MODES, buddyMode, setBuddyMode } from './mascot.js';
import { openFeedback, feedbackLine } from './feedback.js';

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

// Line icons for the rows, drawn like the ones in dom.js.
const svg = d => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  me: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  mots: svg('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'),
  share: svg('<circle cx="7" cy="8" r="3"/><circle cx="17" cy="8" r="3"/><path d="M2 20a5 5 0 0 1 10 0M12 20a5 5 0 0 1 10 0"/>'),
  bank: svg('<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 7c0-1.5 1-2 1-3.5M12 7c0-1.5 1-2 1-3.5M16 7c0-1.5 1-2 1-3.5"/>'),
  cart: svg('<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h3l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.3a1.5 1.5 0 0 0 1.5-1.1L21 8H6.6"/>'),
  voice: svg('<path d="M4 5h16v11H9l-5 4z"/><path d="M9 10.5h6"/>'),
  usage: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  bell: svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>'),
  palette: svg('<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.3 0 1.8-.9 1.4-1.9-.5-1.2.3-2.3 1.6-2.3h1.8a3.7 3.7 0 0 0 3.7-3.7c0-5-3.8-9.1-8.5-9.1z"/><circle cx="8" cy="11" r="1.1" fill="currentColor"/><circle cx="11" cy="7.5" r="1.1" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.1" fill="currentColor"/>'),
  theme: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor"/>'),
  data: svg('<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'),
  report: svg('<path d="M5 21V4"/><path d="M5 4h12l-2.5 4.5L17 13H5"/>'),
  account: svg('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>'),
};
const row = (attr, ic, title, sub) => `<button class="set-row" ${attr}><i class="set-ic">${ICON[ic]}</i><span class="grow"><b>${title}</b>${sub ? `<small class="muted">${sub}</small>` : ''}</span>${icon.chevL}</button>`;
const group = (title, rows) => `<h2 class="set-h">${title}</h2><section class="card set-list">${rows}</section>`;
let targetsOpen = false;

export function renderProfile(root) {
  const s = store.get();
  const p = store.profile();
  const eff = effectiveTargets(p);
  const st = store.syncStatus;

  root.innerHTML = `
    <header class="page-head"><h1>نمایه</h1></header>

    <details class="card fold targets-fold"${targetsOpen ? ' open' : ''}>
      <summary><span><h2>هدف‌های روزانه</h2><small>${kcal50(eff.kcal)} کالری · ${fa(eff.protein)} گرم پروتئین</small></span></summary>
      <div class="targets">
        <div class="tile big"><span>کالری</span><b>${kcal50(eff.kcal)}</b><small>${correcting(p) ? 'اصلاح کوتاه' : rampKcal(p) ? 'رو به نگهداری' : eff.phase !== 'loss' ? 'سطح نگهداری' : p.targets?.manualKcal ? 'دستی' : p.targets?.source === 'measured' ? 'از مصرف واقعی بدنت' : 'محاسبه‌شده'}</small></div>
        <div class="tile big"><span>${eff.proteinMax ? 'پروتئین (حداکثر، برای کلیه)' : 'پروتئین'}</span><b>${fa(eff.protein)}</b><small>گرم${p.targets?.manualProtein ? ' · دستی' : ''}</small></div>
      </div>
      <p class="muted small">آخرین محاسبه با وزن ${fa(p.targets?.baseWeight, 1)} کیلو${p.targets?.computedAt ? `، ${faDMY(p.targets.computedAt)}` : ''}.</p>
      <div class="row gap">
        <button class="btn grow" data-recalc>محاسبه‌ی دوباره</button>
        <button class="btn grow" data-manual>تنظیم دستی</button>
      </div>
    </details>

    ${phaseCard()}

    ${group('من و برنامه‌ام', `
      ${row('data-edit', 'me', 'اطلاعات من', `${fa(p.age)} ساله · قد ${fa(p.heightCm, 1)}`)}
      ${row('data-mots', 'mots', 'انگیزه‌ها', s.motivations.length ? `${fa(s.motivations.length)} مورد` : 'هنوز خالی')}`)}
    ${group('ابزارها', `
      ${row('data-bank', 'bank', 'بانک غذا', `${fa(s.foods.length)} غذا`)}
      ${shareAdmin() ? row('data-share', 'share', 'غذاهای تازه‌ی خانواده', shareLine()) : ''}
      ${row('data-shopping', 'cart', 'لیست خرید', shoppingLine())}`)}
    ${group('هوشواره', `
      ${row('data-mascot', 'voice', 'جمله‌ها و صدای هوشواره', MODES.find(m => m.value === buddyMode()).label)}
      ${aiAvailable() ? row('data-usage', 'usage', 'مصرف هوشواره', 'هزینه‌ی ۳۰ روز اخیر') : ''}`)}
    ${group('تنظیمات', `
      ${row('data-reminders', 'bell', 'یادآورها', remindersLine())}
      ${row('data-palette', 'palette', 'تم رنگی', PALETTES.find(t => t.value === getPalette()).label)}
      ${row('data-theme', 'theme', 'روشن یا تیره', THEMES.find(t => t.value === getTheme()).label)}`)}
    ${group('پشتیبانی', `
      ${row('data-feedback', 'report', 'گزارش خرابی و انتقاد', feedbackLine())}`)}
    ${group('حساب و داده‌ها', `
      ${row('data-data', 'data', 'داده‌ها و پشتیبان', 'خروجی و برگرداندن')}
      ${row('data-account', 'account', 'حساب', session.local ? 'حالت آزمایشی محلی' : `${esc(session.email || '')}${st.pending ? ` · ${fa(st.pending)} تغییر در صف` : ''}`)}`)}
    <p class="muted small center">تن‌آرا · نسخه‌ی ۱</p>`;

  root.querySelector('.targets-fold').ontoggle = e => { targetsOpen = e.currentTarget.open; };
  root.querySelector('[data-recalc]').onclick = async () => {
    const msg = p.targets?.manualKcal || p.targets?.manualProtein
      ? 'هدف‌ها با آخرین وزن دوباره حساب شوند؟ تنظیم دستی پاک می‌شود.' : 'هدف‌ها با آخرین وزن دوباره حساب شوند؟';
    if (await confirmBox(msg, 'حساب کن')) { recalcTargets(); toast('هدف‌ها به‌روز شد'); }
  };
  root.querySelector('[data-manual]').onclick = () => openManual(p);
  root.querySelector('[data-edit]').onclick = () => openEdit(p);
  root.querySelector('[data-mots]').onclick = () => openMotivationList();
  bindPhase(root);
  bindReminders(root);
  root.querySelector('[data-usage]')?.addEventListener('click', openUsage);
  root.querySelector('[data-bank]').onclick = () => openFoodBank();
  // the owner only: is it them, and how many members' foods wait (asked once, then on each close)
  const again = () => { if (root.isConnected) renderProfile(root); };
  checkShare(again);
  root.querySelector('[data-share]')?.addEventListener('click', () => openFoodShare(() => checkShare(again, true)));
  root.querySelector('[data-shopping]').onclick = () => openShopping();
  root.querySelector('[data-theme]').onclick = async () => {
    const t = await choose('روشن یا تیره', THEMES, getTheme());
    if (t) { setTheme(t); renderProfile(root); }
  };
  root.querySelector('[data-palette]').onclick = async () => {
    const t = await choose('تم رنگی', PALETTES.map(x => ({ value: x.value, label: `${x.label} · ${x.hint}` })), getPalette());
    if (t) { setPalette(t); renderProfile(root); }
  };
  root.querySelector('[data-mascot]').onclick = async () => {
    const v = await choose('جمله‌ها و صدای هوشواره', MODES, buddyMode());
    if (v) { setBuddyMode(v); renderProfile(root); }
  };
  root.querySelector('[data-feedback]').onclick = openFeedback;
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
  const floor = floorFor(p);
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
      const kcal = clampKcal(p, k);
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
      // the health list they just saw has «سنگ کلیه» apart from reduced kidney function
      store.saveProfile({ ...clean, kidneyAsked: true });
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
