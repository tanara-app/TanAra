import { suite, test, eq, ok } from './harness.js';
import { TIPS } from '../js/data/tips.js';
import { fits, tipPerson, rotation, sharedTip, tipFor, seasonsOn, isGroup, EPOCH } from '../js/domain/tips.js';
import { addDays, fromJalali, parse } from '../js/lib/dates.js';
import { isRamadan } from '../js/domain/occasions.js';

const KNOWN = /^(care|loss|adult|!kidney|cond:(diabetes|prediabetes|lipids|heart|bp|liver|gout|stones|kidney|gallstone|reflux|constipation|ms|eczema)|med:glucose|stage:(pregnant|nursing|teen|senior)|sex:female|phase:maintain|season:(ramadan|nowruz|yalda|summer|winter))$/;
const days = (from, n) => Array.from({ length: n }, (_, i) => addDays(from, i));
const ORDER = rotation(TIPS);
const person = (over = {}) => ({ ...tipPerson({ sex: 'male' }, {}), ...over });
const ADULT = person();
const nextFriday = day => { let d = day; while (parse(d).getDay() !== 5) d = addDays(d, 1); return d; };
const notFriday = day => (parse(day).getDay() === 5 ? addDays(day, 1) : day);

suite('tips', () => {
  test('the list: 365 tips in order, every tag known', () => {
    eq(TIPS.length, 365);
    TIPS.forEach((t, i) => {
      eq(t.n, i + 1);
      ok(t.title && t.body.length > 150, `tip ${t.n} has a title and a text`);
      t.t.forEach(x => ok(KNOWN.test(x), `tip ${t.n}: ${x}`));
    });
  });

  test('the shared order has every tip for everyone once, and no group or season tip', () => {
    const plain = TIPS.filter(t => !isGroup(t) && !t.t.some(x => x.startsWith('season:')));
    eq(ORDER.length, plain.length);
    eq(new Set(ORDER).size, ORDER.length);
    ok(ORDER.every(t => !isGroup(t)));
    // the same section never twice in a row in the first round
    ok(ORDER.slice(0, 20).every((t, i, a) => i === 0 || t.c !== a[i - 1].c));
  });

  test('who sees what', () => {
    const tip = (...t) => ({ n: 0, c: 1, t, title: '', body: '' });
    ok(fits(tip('loss'), ADULT));
    ok(!fits(tip('loss'), person({ ed: true })), 'a possible eating-disorder history: only «مراقبتی»');
    ok(fits(tip('care'), person({ ed: true })));
    ok(!fits(tip('loss'), person({ teen: true })) && !fits(tip('adult'), person({ teen: true })));
    ok(!fits(tip('loss'), person({ hold: true })), 'pregnant or underweight: no weight loss');
    ok(!fits(tip('!kidney'), person({ conditions: ['kidney'] })));
    ok(fits(tip('cond:diabetes', 'cond:prediabetes'), person({ conditions: ['prediabetes'] })), 'one kind: any of them');
    ok(!fits(tip('cond:diabetes'), ADULT));
    ok(!fits(tip('season:ramadan', 'cond:diabetes'), person({ conditions: ['diabetes'] }), []), 'two kinds: both');
    ok(fits(tip('season:ramadan', 'cond:diabetes'), person({ conditions: ['diabetes'] }), [{ id: 'ramadan' }]));
    ok(fits(tip('sex:female'), person({ sex: 'female' })) && !fits(tip('sex:female'), ADULT));
    ok(fits(tip('phase:maintain'), person({ phase: 'maintain' })) && !fits(tip('phase:maintain'), ADULT));
  });

  test('from the profile', () => {
    const w = tipPerson({ sex: 'female', edHistory: 'unsure', pregnancy: 'breastfeeding', conditions: ['bp'], glucoseMeds: true }, { teen: true, nursing: true }, { phase: 'maintain', age: 17 });
    eq(w, { ed: true, teen: true, hold: false, conditions: ['bp'], glucoseMeds: true, stages: ['nursing', 'teen'], sex: 'female', phase: 'maintain' });
    eq(tipPerson({}, {}, { age: 70 }).stages, ['senior']);
  });

  test('the whole family sees the same tip, a new one each day', () => {
    const woman = person({ sex: 'female' });
    const all = days(notFriday('2027-05-02'), 6).filter(d => parse(d).getDay() !== 5);
    for (const d of all) eq(tipFor(TIPS, ADULT, d, ORDER), tipFor(TIPS, woman, d, ORDER));
    const shown = days(EPOCH, ORDER.length).map(d => sharedTip(TIPS, d, ORDER, []));
    eq(new Set(shown).size, ORDER.length, 'each tip once a round');
  });

  test('a possible eating-disorder history: only «مراقبتی» tips, never the same two days running', () => {
    const who = person({ ed: true });
    let prev = null;
    for (const d of days(EPOCH, 400)) {
      const t = tipFor(TIPS, who, d, ORDER);
      ok(t && t.t.includes('care'), `${d}: ${t?.n}`);
      ok(t !== prev, `${d}: tip ${t.n} again`);
      prev = t;
    }
  });

  test('teens, pregnancy and kidney disease never get a tip that doesn\'t suit them', () => {
    const teen = person({ teen: true, stages: ['teen'] });
    const pregnant = person({ hold: true, sex: 'female', stages: ['pregnant'] });
    const kidney = person({ conditions: ['kidney'] });
    for (const d of days(EPOCH, 400)) {
      const a = tipFor(TIPS, teen, d, ORDER), b = tipFor(TIPS, pregnant, d, ORDER), c = tipFor(TIPS, kidney, d, ORDER);
      ok(!a.t.includes('loss') && !a.t.includes('adult'), `teen ${d}: ${a.n}`);
      ok(!b.t.includes('loss'), `pregnant ${d}: ${b.n}`);
      ok(!c.t.includes('!kidney'), `kidney ${d}: ${c.n}`);
    }
  });

  test('their group tips come on Fridays, each once a round', () => {
    const diabetic = person({ conditions: ['diabetes'] });
    const weeks = Math.ceil(ORDER.length / 7);
    const fridays = Array.from({ length: weeks }, (_, k) => addDays(nextFriday(EPOCH), 7 * k)).filter(d => !seasonsOn(d).some(s => s.id === 'ramadan'));
    const group = fridays.map(d => tipFor(TIPS, diabetic, d, ORDER)).filter(t => isGroup(t));
    const theirs = TIPS.filter(t => isGroup(t) && fits(t, diabetic) && !t.t.some(x => x.startsWith('season:')));
    eq(group.map(t => t.n).sort((a, b) => a - b), theirs.map(t => t.n), 'each of them once');
    const fri = fridays.find(d => !isGroup(tipFor(TIPS, diabetic, d, ORDER)));
    eq(tipFor(TIPS, diabetic, fri, ORDER), tipFor(TIPS, ADULT, fri, ORDER), 'the other Fridays: the shared tip');
    eq(tipFor(TIPS, ADULT, fridays[0], ORDER), sharedTip(TIPS, fridays[0], ORDER), 'nothing changes for those without a group');
  });

  test('Ramadan and diabetes: on the first Friday of Ramadan', () => {
    let ram = '2027-01-01';
    while (!isRamadan(ram) && ram < '2027-12-31') ram = addDays(ram, 1);
    if (!isRamadan(ram)) return; // no Islamic calendar here
    const t = tipFor(TIPS, person({ conditions: ['diabetes'] }), nextFriday(ram), ORDER);
    ok(t.t.includes('season:ramadan') && t.t.includes('cond:diabetes'), `${t.n}`);
  });

  test('seasons: Nowruz, Yalda and Ramadan open with their own tips', () => {
    const nowruz = fromJalali(1406, 1, 1);
    ok(sharedTip(TIPS, nowruz).t.includes('season:nowruz'));
    eq(seasonsOn(fromJalali(1406, 1, 14)).some(s => s.id === 'nowruz'), false);
    ok(sharedTip(TIPS, fromJalali(1405, 9, 30)).t.includes('season:yalda'));
    let ram = '2027-01-01';
    while (!isRamadan(ram)) ram = addDays(ram, 1);
    if (isRamadan('2027-01-01') === false && ram < '2027-12-31') {
      ok(sharedTip(TIPS, ram).t.includes('season:ramadan'), `first day of Ramadan ${ram}`);
      // its seven tips spread over the month, each once
      const r = days(ram, 30).map(d => sharedTip(TIPS, d)).filter(t => t.t.includes('season:ramadan'));
      eq(new Set(r).size, TIPS.filter(t => t.t.includes('season:ramadan') && !isGroup(t)).length);
    }
    ok(sharedTip(TIPS, fromJalali(1406, 4, 1)).t.includes('season:summer'));
  });

  test('everyone gets a tip every day of a year', () => {
    const kinds = [ADULT, person({ ed: true }), person({ teen: true, stages: ['teen'] }), person({ hold: true, sex: 'female', stages: ['pregnant'] }),
      person({ conditions: ['kidney', 'diabetes'], glucoseMeds: true }), person({ phase: 'maintain', sex: 'female', stages: ['senior'] })];
    for (const d of days('2027-01-01', 365)) for (const w of kinds) ok(tipFor(TIPS, w, d, ORDER), `${d}`);
  });
});
