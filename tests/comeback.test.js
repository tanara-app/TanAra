import { suite, test, eq, ok } from './harness.js';
import { CAUSES, PLANS, GOAL, offlinePlan, withCrisis, crisisSupport } from '../js/domain/comeback.js';

const all = CAUSES.flatMap(([, list]) => list);

suite('comeback', () => {
  test('every cause of the form has a plan: why, two steps or more, a step for today', () => {
    for (const c of all) {
      const p = PLANS[c];
      ok(p && p.why && p.steps.length >= 2 && p.first, c);
    }
    eq(Object.keys(PLANS).length, all.length);
  });

  test('three steps: the first of each cause, then the rest', () => {
    const r = offlinePlan({ causes: ['استرس', 'خواب کم یا بد'] });
    eq(r.steps.length, 3);
    eq(r.steps[0], PLANS['استرس'].steps[0]);
    eq(r.steps[1], PLANS['خواب کم یا بد'].steps[0]);
    eq(r.steps[2], PLANS['استرس'].steps[1]);
    eq(r.first_step, PLANS['استرس'].first);
    eq(r.goal, GOAL);
    ok(r.offline);
  });

  test('nothing picked: the simple plan', () => {
    const r = offlinePlan({ mood: 3 });
    eq(r.steps.length, 3);
    eq(r.goal, GOAL);
    eq(r.support, '');
  });

  test('after a plan that did not work: simpler, two steps', () => {
    eq(offlinePlan({ causes: ['استرس'] }, { follow: true }).steps.length, 2);
  });

  test('a cause with its own goal', () => {
    eq(offlinePlan({ causes: ['بیماری یا درد'] }).goal, PLANS['بیماری یا درد'].goal);
  });

  test('help: a very bad mood, binge eating, illness; harming oneself above all', () => {
    ok(offlinePlan({ mood: 1 }).support.includes('۱۴۸۰'));
    ok(offlinePlan({ causes: ['پرخوری بی‌اختیار'] }).support.length > 0);
    ok(offlinePlan({ causes: ['بیماری یا درد'] }).support.includes('پزشک'));
    for (const said of ['دیگه نمی‌خوام زنده باشم', 'به خودکشی فکر می‌کنم', 'می‌خوام به خودم آسیب بزنم']) {
      ok(offlinePlan({ causes: ['استرس'], said }).support.includes('۱۲۳'), said);
    }
    ok(!offlinePlan({ said: 'سرکار خیلی خسته‌ام' }).support.includes('۱۲۳'));
  });

  test('the crisis line whatever the keyboard or spacing', () => {
    for (const said of ['خودكشي', 'بميرم', 'آسيب به خودم', 'خودم رو  بکشم', 'نمي خوام زنده بمونم']) ok(crisisSupport(said), said);
    eq(crisisSupport('یه کم آسیب‌پذیر شدم'), '');
  });

  test("the crisis line goes on the assistant's plan too, once", () => {
    const c = crisisSupport('خودکشی');
    eq(withCrisis('با پزشکت مشورت کن.', 'به خودکشی فکر می‌کنم'), `${c}\n\nبا پزشکت مشورت کن.`);
    eq(withCrisis(c, 'خودکشی'), c);
    eq(withCrisis('', 'خوبم'), '');
  });

  test('a possible eating-disorder history: no weight, scale or calories in any field, for any pair of causes', () => {
    for (const a of all) for (const b of all) {
      const r = offlinePlan({ mood: 1, causes: a === b ? [a] : [a, b] }, { care: true });
      const said = [r.cause, ...r.steps, r.first_step, r.goal].join(' ');
      ok(!/وزن|ترازو|کالری/.test(said), `${a} + ${b}`);
      ok(r.steps.length === 3, `${a} + ${b}: three steps`);
    }
  });
});
