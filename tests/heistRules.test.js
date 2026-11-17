import { suite, test, eq, ok } from './harness.js';
import { payout, ending, kitOk, tehranDayStart, seedOf, FEE, START_COINS } from '../js/domain/heistRules.js';

suite('heist money', () => {
  test('a getaway takes a fifth of the owner\'s coins (half with the alarm), the fee comes back, and the owner gets a shield', () => {
    eq(payout('escaped', { ownerCoins: 500, fee: FEE }), { loot: 100, thief: 120, owner: -100, shield: true });
    eq(payout('escaped_alarm', { ownerCoins: 500, fee: FEE }), { loot: 50, thief: 70, owner: -50, shield: true });
    eq(payout('escaped', { ownerCoins: 5000, fee: FEE }).loot, 200, 'at most 200');
    eq(payout('escaped', { ownerCoins: 0, fee: FEE }), { loot: 0, thief: FEE, owner: 0, shield: true });
  });
  test('caught or out of time: the fee goes to the owner; fleeing empty-handed gets it back', () => {
    eq(payout('caught', { ownerCoins: 500, fee: FEE }), { loot: 0, thief: 0, owner: FEE, shield: false });
    eq(payout('timeout', { ownerCoins: 500, fee: FEE }), { loot: 0, thief: 0, owner: FEE, shield: false });
    eq(payout('fled', { ownerCoins: 500, fee: FEE }), { loot: 0, thief: FEE, owner: 0, shield: false });
  });
  test('practice pays ten coins a level, once a level a day, from the house', () => {
    eq(payout('escaped', { practice: 3 }), { loot: 30, thief: 30, owner: 0, shield: false });
    eq(payout('escaped_alarm', { practice: 3 }).loot, 15);
    eq(payout('escaped', { practice: 3, paid: true }).loot, 0);
    eq(payout('caught', { practice: 5 }).thief, 0);
  });
  test('moves that are not allowed are a caught thief; moves that stop short, a timeout', () => {
    eq([ending('escaped'), ending('invalid'), ending('unfinished'), ending('nonsense')], ['escaped', 'caught', 'timeout', 'caught']);
  });
  test('a raid takes two known gadgets at most, no repeats', () => {
    eq([kitOk([]), kitOk(['emp', 'decoy']), kitOk(['emp', 'emp']), kitOk(['emp', 'smoke', 'decoy']), kitOk(['bomb']), kitOk('emp')], [true, true, false, false, false, false]);
  });
  test('today starts at midnight in Tehran', () => {
    eq(tehranDayStart(new Date('2026-11-17T20:00:00Z')), '2026-11-16T20:30:00.000Z');   // 23:30 on the 17th in Tehran
    eq(tehranDayStart(new Date('2026-11-17T21:00:00Z')), '2026-11-17T20:30:00.000Z');   // 00:30 on the 18th
    eq(tehranDayStart(new Date('2026-11-17T12:00:00Z')), '2026-11-16T20:30:00.000Z');
  });
  test('the same account always gets the same first vault seed', () => {
    eq(seedOf('a-b-c'), seedOf('a-b-c'));
    ok(seedOf('a-b-c') !== seedOf('a-b-d'));
    ok(START_COINS > FEE);
  });
});
