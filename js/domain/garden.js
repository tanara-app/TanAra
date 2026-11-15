/*
  «باغ» (GARDEN.md): the garden's sky follows the phone's clock. `daylight` says where the sun or the
  moon is for a moment: `e` runs from 1 (noon) through 0 (sunrise, sunset) to -1 (the middle of the
  night), and `p` is how far through the day (or the night) that moment is, 0 to 1. The day's length
  follows the season at Tehran's latitude (about 9.8 hours at Yalda, 14.4 at the start of summer).
*/
export function daylight(date = new Date()) {
  const doy = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 864e5);
  const len = 12.1 - 2.3 * Math.cos(2 * Math.PI * (doy + 10) / 365);
  const rise = 12 - len / 2, set = 12 + len / 2;
  const h = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  if (h >= rise && h <= set) { const p = (h - rise) / len; return { day: true, p, e: Math.sin(Math.PI * p) }; }
  const p = ((h < rise ? h + 24 : h) - set) / (24 - len);
  return { day: false, p, e: -Math.sin(Math.PI * p) };
}

/*
  The game's rules (GARDEN.md «قانون بازی»). Water is earned only by logging: one drop for each meal
  logged in a day (at most three) and one for a day with activity logged. Never by how much was eaten
  or by weight, and nothing is ever taken back. Drops are spent on the pomegranate in the garden
  (five steps) and on the desert round it, one square of land («cell») at a time: the first drop turns
  it green, the second brings shrubs and flowers, the third a tree or a building. Water only reaches
  land next to the garden, the qanat's channel, or land that is already green, so the green spreads
  outward. What was spent is kept in `profile.garden` = { tree: 1..6, cells: { 'i,j': 1..3 } }.
*/
import { baseMeal } from './meals.js';

export const CELL = 2.6;          // a cell's side, in the scene's units
export const FULL = 3;            // a cell's last level
export const TREE_STEPS = 6;      // the pomegranate: sapling (1) to fruit (6)
export const cellKey = (i, j) => `${i},${j}`;

// { meals: 0..3, move: 0|1 } for each day that earned anything
export function dropsByDay(entries = [], activity = []) {
  const meals = new Map();
  for (const e of entries) (meals.get(e.day) || meals.set(e.day, new Set()).get(e.day)).add(baseMeal(e.meal));
  const days = new Map([...meals].map(([d, m]) => [d, { meals: Math.min(3, m.size), move: 0 }]));
  for (const a of activity) if (a.minutes > 0) (days.get(a.day) || days.set(a.day, { meals: 0, move: 0 }).get(a.day)).move = 1;
  return days;
}
export function earned(entries, activity, day) {
  let n = 0;
  for (const [d, x] of dropsByDay(entries, activity)) if (d <= day) n += x.meals + x.move;
  return n;
}
export const spent = g => Math.max(0, (g?.tree || 1) - 1) + Object.values(g?.cells || {}).reduce((a, b) => a + b, 0);

// the qanat's shaft mounds (scene units), and the land that can never be watered
export const SHAFTS = Array.from({ length: 10 }, (_, i) => [-16 - i * 2.4, -i * 3.8]);
const inGarden = (i, j) => Math.abs(i) <= 2 && Math.abs(j) <= 2;
const inChannel = (i, j) => j === 0 && i <= -3 && i >= -6;
const wet = (i, j) => inGarden(i, j) || inChannel(i, j);
export function isLand(i, j) {
  if (wet(i, j)) return false;
  const x = i * CELL, z = j * CELL;
  if (Math.hypot(x, z) > 92) return false; // the mountains
  return !SHAFTS.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 2.1);
}
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export function canWater(cells, i, j) {
  if (!isLand(i, j)) return false;
  const lv = cells[cellKey(i, j)] || 0;
  if (lv >= FULL) return false;
  return lv > 0 || SIDES.some(([a, b]) => wet(i + a, j + b) || cells[cellKey(i + a, j + b)] > 0);
}
// every cell water can reach now: the green ones that are not full, and the dry ones at the edge
export function frontier(cells) {
  const out = new Map();
  const add = (i, j) => { if (canWater(cells, i, j)) out.set(cellKey(i, j), [i, j]); };
  for (let i = -7; i <= 3; i++) for (let j = -3; j <= 3; j++) add(i, j); // round the garden and the channel
  for (const k of Object.keys(cells)) {
    const [i, j] = k.split(',').map(Number);
    add(i, j);
    for (const [a, b] of SIDES) add(i + a, j + b);
  }
  return [...out.values()];
}
// where the next drop goes when the player has not chosen: finish what is started, then the nearest dry land
export function nextCell(cells) {
  const rank = ([i, j]) => (cells[cellKey(i, j)] ? 0 : 1000) + Math.hypot(i, j) + (Math.atan2(j, i) + Math.PI) / 100;
  return frontier(cells).sort((a, b) => rank(a) - rank(b))[0] || null;
}

// what a cell grows at its last level: always the same for the same cell, so it is a small surprise
export function hash(i, j) {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0);
}
export function plantOf(i, j) {
  const h = hash(i, j) % 100, far = Math.max(Math.abs(i), Math.abs(j)) >= 4;
  if (far && h < 4) return 'badgir';
  if (far && h < 8) return 'kabootar';
  return h < 40 ? 'palm' : h < 57 ? 'anar' : h < 72 ? 'narenj' : h < 86 ? 'toot' : 'sarv';
}

// who lives in the garden, by how much water has been given in all (spent)
export const GUESTS = [
  { key: 'fish', need: 6 },        // goldfish in the pool, once the pomegranate has its first water
  { key: 'butterfly', need: 14 },  // by day
  { key: 'hoopoe', need: 30 },
  { key: 'bolbol', need: 55 },     // a nightingale on the pomegranate
  { key: 'cat', need: 90 },
];
export const guests = n => GUESTS.filter(g => n >= g.need).map(g => g.key);
