/*
  «سرقت بزرگ», phase 4 (briefs/heist-4.md): the money rules between members, pure and shared by the app and the `heist` Edge Function.
  The numbers are phase 4's; phase 5 ties the daily raids and the coins to the diet (briefs/heist.md, section 3).
*/
import { lootOf, GADGETS } from './heist.js';

export const START_COINS = 500;      // every player's first coins
export const FEE = 20;               // a raid on a member: back to the thief on a getaway, the owner's if he is caught
export const RAIDS_PER_DAY = 3;      // raids on members, per day (Tehran time); practice is free and unlimited
export const PRACTICE_PAY = 10;      // × the practice level, the first getaway from each level a day
export const KIT_MAX = 2;            // gadgets a raid takes
export const OPEN_MINUTES = 30;      // a raid still open after this long counts as caught
export const SHIELD_HOURS = 12;

const WON = new Set(['escaped', 'escaped_alarm']);
export const ENDINGS = ['escaped', 'escaped_alarm', 'fled', 'caught', 'timeout'];

/*
  Who gets what when a raid ends. `thief` and `owner` are the changes to their coins (the fee was already taken from the thief when the
  raid began); `loot` is what the thief took from the owner (or from the house, on practice); `shield` is whether the owner's vault gets
  its 12 hours' shield.
*/
export function payout(status, { ownerCoins = 0, fee = 0, practice = 0, paid = false } = {}) {
  const won = WON.has(status);
  if (practice) {
    const full = paid ? 0 : PRACTICE_PAY * practice;
    const loot = won ? (status === 'escaped' ? full : Math.floor(full / 2)) : 0;
    return { loot, thief: loot, owner: 0, shield: false };
  }
  if (won) { const loot = lootOf(status, ownerCoins); return { loot, thief: loot + fee, owner: -loot, shield: true }; }
  if (status === 'fled') return { loot: 0, thief: fee, owner: 0, shield: false };
  return { loot: 0, thief: 0, owner: fee, shield: false };
}

// What a finished raid's moves amount to: a move list that isn't allowed is a caught thief, one that stops short is a timeout.
export function ending(result) {
  if (ENDINGS.includes(result)) return result;
  return result === 'unfinished' ? 'timeout' : 'caught';
}

export function kitOk(gadgets) {
  return Array.isArray(gadgets) && gadgets.length <= KIT_MAX && gadgets.every((g, i) => GADGETS.includes(g) && gadgets.indexOf(g) === i);
}

// The start of today in Tehran, as an ISO time (for "raids today").
export function tehranDayStart(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map(x => [x.type, x.value]));
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const offset = local - Math.floor(now.getTime() / 1000) * 1000;   // Tehran is ahead of UTC by this much
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day) - offset).toISOString();
}

// A player's first vault, the same for the same account every time.
export function seedOf(id) {
  let h = 2166136261;
  for (const ch of String(id)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 100000 + 1;
}
