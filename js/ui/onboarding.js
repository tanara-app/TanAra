// First-run questionnaire. Also exports the shared profile fields used by the profile screen.
import * as store from '../data/store.js';
import { ACTIVITY, CONDITIONS, computeTargets, hasMedicalFlag } from '../domain/targets.js';
import { fa, kcal50, parseNum, esc } from '../lib/fa.js';
import { today } from '../lib/dates.js';
import { toast } from './dom.js';

export function validate(d, needWeight = true) {
  if (!(d.age >= 18 && d.age <= 100)) return 'سن را بین ۱۸ تا ۱۰۰ وارد کنید.';
  if (!d.sex) return 'جنس را انتخاب کنید.';
  if (!(d.heightCm >= 120 && d.heightCm <= 230)) return 'قد را به سانتی‌متر وارد کنید (مثلاً ۱۷۵).';
  if (needWeight && !(d.weightKg >= 35 && d.weightKg <= 350)) return 'وزن را به کیلوگرم وارد کنید.';
  if (d.waistCm && !(d.waistCm >= 40 && d.waistCm <= 250)) return 'دور کمر را به سانتی‌متر وارد کنید یا خالی بگذارید.';
  if (!d.activity) return 'سطح فعالیت را انتخاب کنید.';
  return null;
}

export const fieldsHtml = {
  basics: d => `
    <label class="field"><span>سن</span><input name="age" inputmode="numeric" value="${d.age ? fa(d.age) : ''}" placeholder="مثلاً ۳۵"></label>
    <div class="field"><span>جنس</span>
      <div class="seg" data-name="sex">
        <button type="button" data-v="male" class="${d.sex === 'male' ? 'on' : ''}">مرد</button>
        <button type="button" data-v="female" class="${d.sex === 'female' ? 'on' : ''}">زن</button>
      </div>
    </div>`,
  body: (d, withWeight = true) => `
    <label class="field"><span>قد (سانتی‌متر)</span><input name="heightCm" inputmode="decimal" value="${d.heightCm ? fa(d.heightCm, 1) : ''}" placeholder="مثلاً ۱۷۵"></label>
    ${withWeight ? `<label class="field"><span>وزن فعلی (کیلوگرم)</span><input name="weightKg" inputmode="decimal" value="${d.weightKg ? fa(d.weightKg, 1) : ''}" placeholder="مثلاً ۱۱۰"></label>` : ''}
    <label class="field"><span>دور کمر (سانتی‌متر) <em>اختیاری</em></span><input name="waistCm" inputmode="decimal" value="${d.waistCm ? fa(d.waistCm, 1) : ''}" placeholder="اندازه در سطح ناف"></label>`,
  activity: d => `
    <div class="choices" data-name="activity">
      ${Object.entries(ACTIVITY).map(([k, a]) => `
        <button type="button" class="choice ${d.activity === k ? 'on' : ''}" data-v="${k}">
          <strong>${a.label}</strong><small>${a.hint}</small>
        </button>`).join('')}
    </div>`,
  health: d => `
    <p class="muted small">اگر هر کدام را دارید تیک بزنید.</p>
    <div class="checks" data-name="conditions">
      ${Object.entries(CONDITIONS).map(([k, l]) => `
        <label class="check"><input type="checkbox" value="${k}" ${d.conditions?.includes(k) ? 'checked' : ''}><span>${l}</span></label>`).join('')}
    </div>
    <label class="field"><span>داروهایی که مصرف می‌کنید <em>اختیاری</em></span><textarea name="medications" rows="2" placeholder="مثلاً متفورمین، لوزارتان…">${esc(d.medications || '')}</textarea></label>`,
  ed: d => `
    <p class="muted small">سابقه‌ی اختلال خوردن (مثل پرخوری عصبی، بی‌اشتهایی یا بولیمیا) دارید؟</p>
    <div class="choices" data-name="edHistory">
      ${[['no', 'نه'], ['yes', 'بله'], ['unsure', 'مطمئن نیستم']].map(([k, l]) => `
        <button type="button" class="choice ${d.edHistory === k ? 'on' : ''}" data-v="${k}"><strong>${l}</strong></button>`).join('')}
    </div>`,
};

// Reads every known field present in root into d.
export function readFields(root, d) {
  root.querySelectorAll('input[name], textarea[name]').forEach(el => {
    if (el.type === 'checkbox') return;
    const v = el.value;
    if (['age', 'heightCm', 'weightKg', 'waistCm'].includes(el.name)) {
      const n = parseNum(v);
      d[el.name] = Number.isNaN(n) ? null : n;
    } else d[el.name] = v;
  });
  const conds = root.querySelector('[data-name="conditions"]');
  if (conds) d.conditions = [...conds.querySelectorAll('input:checked')].map(i => i.value);
  return d;
}

// Single-choice buttons (seg / choices) write straight into d.
export function bindChoices(root, d) {
  root.querySelectorAll('[data-name]').forEach(group => {
    if (group.dataset.name === 'conditions') return;
    group.addEventListener('click', e => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      group.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      d[group.dataset.name] = b.dataset.v;
    });
  });
}

export function medicalNoteHtml() {
  return `<div class="note doctor">
    <strong>قبل از شروع، با پزشک‌تان مشورت کنید</strong>
    <p>چون به یکی از سؤال‌های سلامت جواب «بله» داده‌اید، بهتر است پزشک‌تان در جریان کم‌کردن کالری باشد؛ مخصوصاً اگر دارو مصرف می‌کنید. می‌توانید همین حالا هم از اپ استفاده کنید.</p>
  </div>`;
}

export function targetsHtml(t) {
  return `<div class="targets">
    <div class="tile big"><span>هدف کالری روزانه</span><b>${kcal50(t.kcal)}</b><small>کیلوکالری</small></div>
    <div class="tile big"><span>هدف پروتئین روزانه</span><b>${fa(t.protein)}</b><small>گرم</small></div>
  </div>
  <dl class="calc">
    <div><dt>سوخت‌وساز پایه</dt><dd>${kcal50(t.bmr)}</dd></div>
    <div><dt>مصرف روزانه با فعالیت</dt><dd>${kcal50(t.tdee)}</dd></div>
    <div><dt>کسری روزانه</dt><dd>${fa(500)}</dd></div>
    <div><dt>وزن مرجع برای پروتئین</dt><dd>${fa(t.refWeight, 1)} کیلو</dd></div>
  </dl>
  ${t.hitFloor ? `<p class="muted small">عدد محاسبه‌شده از حداقل ایمن (${fa(t.floor)}) کمتر بود، برای همین روی حداقل ایمن گذاشته شد.</p>` : ''}
  <p class="muted small">همه‌ی این عددها تخمینی‌اند و کالری‌ها به نزدیک‌ترین ۵۰ گرد شده‌اند.</p>`;
}

const STEPS = [
  { title: 'سلام! چند سؤال کوتاه', sub: 'برای اینکه هدف‌ها را درست حساب کنیم.', html: d => fieldsHtml.basics(d), check: d => (!(d.age >= 18 && d.age <= 100) ? 'سن را بین ۱۸ تا ۱۰۰ وارد کنید.' : !d.sex ? 'جنس را انتخاب کنید.' : null) },
  { title: 'قد و وزن', sub: 'عددها را تقریبی هم وارد کنید اشکالی ندارد.', html: d => fieldsHtml.body(d), check: d => validate({ ...d, activity: 'x', age: 30, sex: 'm' }) },
  { title: 'روزهای‌تان چقدر پرتحرک است؟', sub: '', html: d => fieldsHtml.activity(d), check: d => (!d.activity ? 'یکی را انتخاب کنید.' : null) },
  { title: 'سلامت', sub: 'این‌ها فقط برای این است که اگر لازم بود، پیشنهاد مشورت با پزشک بدهیم.', html: d => fieldsHtml.health(d), check: () => null },
  { title: 'یک سؤال دیگر', sub: '', html: d => fieldsHtml.ed(d), check: d => (!d.edHistory ? 'یکی را انتخاب کنید.' : null) },
];

export function renderOnboarding(root, onDone) {
  const d = { conditions: [], medications: '' };
  let step = 0;

  function draw() {
    if (step >= STEPS.length) return drawResult();
    const s = STEPS[step];
    root.innerHTML = `
      <div class="onb">
        <div class="progress-dots">${STEPS.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>
        <h1>${s.title}</h1>
        ${s.sub ? `<p class="muted">${s.sub}</p>` : ''}
        <form class="stack" novalidate>${s.html(d)}<p class="err" hidden></p></form>
        <div class="onb-actions">
          <button class="btn primary grow" data-next>${step === STEPS.length - 1 ? 'دیدن هدف‌ها' : 'بعدی'}</button>
          ${step > 0 ? '<button class="btn ghost" data-back>قبلی</button>' : ''}
        </div>
      </div>`;
    const form = root.querySelector('form');
    bindChoices(form, d);
    form.addEventListener('submit', e => { e.preventDefault(); next(); });
    root.querySelector('[data-next]').onclick = next;
    root.querySelector('[data-back]')?.addEventListener('click', () => { readFields(form, d); step--; draw(); });
    function next() {
      readFields(form, d);
      const err = s.check(d);
      const p = form.querySelector('.err');
      if (err) { p.textContent = err; p.hidden = false; return; }
      step++; draw();
      window.scrollTo(0, 0);
    }
  }

  function drawResult() {
    const t = computeTargets(d);
    root.innerHTML = `
      <div class="onb">
        <h1>هدف‌های شما</h1>
        ${hasMedicalFlag(d) ? medicalNoteHtml() : ''}
        ${targetsHtml(t)}
        <div class="onb-actions">
          <button class="btn primary grow" data-start>شروع کنیم</button>
          <button class="btn ghost" data-back>قبلی</button>
        </div>
      </div>`;
    root.querySelector('[data-back]').onclick = () => { step--; draw(); };
    root.querySelector('[data-start]').onclick = () => {
      const start = today();
      store.saveProfile({
        sex: d.sex, age: d.age, heightCm: d.heightCm, waistCm: d.waistCm || null,
        activity: d.activity, conditions: d.conditions, medications: (d.medications || '').trim(), edHistory: d.edHistory,
        startDate: start, onboarded: true,
        targets: { kcal: t.kcal, protein: t.protein, baseWeight: d.weightKg, computedAt: start, tdee: t.tdee, source: 'formula' },
      });
      store.setWeight(start, d.weightKg);
      if (!store.get().foods.length) store.seedFoods();
      toast('آماده‌ست!');
      onDone();
    };
  }

  draw();
}
