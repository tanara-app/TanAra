/*
  «سرزمین»: the game's icons (GAME.md §13b). Chunky, glossy SVGs in the genre's feel: a gradient
  body, a thick dark outline and a small highlight. Our own drawings; no emoji (a rule for the whole app).
  Every icon is a function of its size in pixels and returns an SVG string.
*/
// Each drawing gets its own gradient ids: with shared ids the first one in the page wins, and when that
// one sits in a hidden part (the village bar during a battle) the browser paints nothing.
let n = 0;
const svg = (s, body, vb = 24) => {
  const k = ++n;
  body = body.replace(/id="(\w+)"/g, `id="$1_${k}"`).replace(/url\(#(\w+)\)/g, `url(#$1_${k})`);
  return `<svg class="gi" viewBox="0 0 ${vb} ${vb}" width="${s}" height="${s}" aria-hidden="true">${body}</svg>`;
};
const grad = (id, a, b) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`;
const LINE = '#2b1a0c';
const shine = (x, y, rx, ry, rot = -30) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${x} ${y})" fill="#fff" opacity=".55"/>`;

export const I = {
  coin: (s = 24) => svg(s, `${grad('gCoin', '#ffe58a', '#e0a21b')}<circle cx="12" cy="12" r="10" fill="url(#gCoin)" stroke="${LINE}" stroke-width="1.6"/>
    <circle cx="12" cy="12" r="6.6" fill="none" stroke="#b67a0e" stroke-width="1.4"/><path d="M12 8.2l1.1 2.4 2.6.3-1.9 1.8.5 2.6L12 14l-2.3 1.3.5-2.6-1.9-1.8 2.6-.3z" fill="#fff3c0" stroke="#b67a0e" stroke-width=".7"/>${shine(8, 6.5, 2.6, 1.3)}`),
  water: (s = 24) => svg(s, `${grad('gWat', '#8fe0ff', '#1f7fcf')}<path d="M12 2C9 6.6 5 10.4 5 14.6a7 7 0 0 0 14 0C19 10.4 15 6.6 12 2z" fill="url(#gWat)" stroke="${LINE}" stroke-width="1.6" stroke-linejoin="round"/>${shine(9.2, 12.5, 1.6, 3, 20)}`),
  gem: (s = 24) => svg(s, `${grad('gGem', '#7cf2b8', '#13945e')}<path d="M6 3h12l4 6.2-10 12.3L2 9.2z" fill="url(#gGem)" stroke="${LINE}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M2 9.2h20M8.5 3L12 21.5 15.5 3M6 3l2.5 6.2L12 3l3.5 6.2L18 3" fill="none" stroke="#0d6b43" stroke-width=".9"/>${shine(8, 6.4, 2, 1)}`),
  builder: (s = 24) => svg(s, `${grad('gHat', '#ffd75a', '#e39a12')}<circle cx="12" cy="15" r="5.5" fill="#f2c9a0" stroke="${LINE}" stroke-width="1.5"/>
    <path d="M5 11.5a7 7 0 0 1 14 0z" fill="url(#gHat)" stroke="${LINE}" stroke-width="1.5" stroke-linejoin="round"/><rect x="3.5" y="11" width="17" height="2.2" rx="1.1" fill="#e39a12" stroke="${LINE}" stroke-width="1.3"/>
    <circle cx="10" cy="15.5" r=".9" fill="${LINE}"/><circle cx="14" cy="15.5" r=".9" fill="${LINE}"/>`),
  shield: (s = 24) => svg(s, `${grad('gShd', '#9fdcff', '#2a78c2')}<path d="M12 2l8.5 3.2v6.2c0 5.2-3.6 8.8-8.5 10.6C7.1 20.2 3.5 16.6 3.5 11.4V5.2z" fill="url(#gShd)" stroke="${LINE}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M12 5v14M7 9.5h10" stroke="#e8f6ff" stroke-width="1.6" stroke-linecap="round"/>${shine(7.5, 6.5, 2, 1)}`),
  medal: (s = 24) => svg(s, `${grad('gMed', '#ffe58a', '#d8901a')}<path d="M7 1.5h4l1.5 6.5-4.2 1.3zM17 1.5h-4l-1.5 6.5 4.2 1.3z" fill="#c83a2a" stroke="${LINE}" stroke-width="1.2" stroke-linejoin="round"/>
    <circle cx="12" cy="15" r="7" fill="url(#gMed)" stroke="${LINE}" stroke-width="1.6"/><path d="M12 11l1.2 2.5 2.7.3-2 1.9.6 2.7L12 17l-2.5 1.4.6-2.7-2-1.9 2.7-.3z" fill="#fff6d6"/>`),
  star: (s = 24, on = true) => svg(s, `${grad(on ? 'gStar' : 'gStarOff', on ? '#ffe67a' : '#8a7a62', on ? '#f0a412' : '#5a4a36')}<path d="M12 1.8l3 6.3 6.9.8-5.1 4.8 1.4 6.9L12 17.2l-6.2 3.4 1.4-6.9L2.1 8.9 9 8.1z" fill="url(#${on ? 'gStar' : 'gStarOff'})" stroke="${LINE}" stroke-width="1.5" stroke-linejoin="round"/>${on ? shine(9.5, 7.5, 1.8, .9) : ''}`),
  xp: (s = 40) => svg(s, `${grad('gXp', '#8fd0ff', '#2c5fbf')}<path d="M12 1l2.9 3.8 4.7-.7.7 4.7L24 12l-3.7 2.9.7 4.7-4.7.7L12 24l-2.9-3.7-4.7.7-.7-4.7L0 12l3.7-2.9-.7-4.7 4.7-.7z" fill="url(#gXp)" stroke="${LINE}" stroke-width="1.3" stroke-linejoin="round"/>`),
  swords: (s = 40) => svg(s, `${grad('gBlade', '#ffffff', '#9fb3c4')}${grad('gHilt', '#ffd75a', '#c07a10')}
    <path d="M4 3l11 11-2 2L2 5V3z" fill="url(#gBlade)" stroke="${LINE}" stroke-width="1.4" stroke-linejoin="round"/><path d="M20 3L9 14l2 2L22 5V3z" fill="url(#gBlade)" stroke="${LINE}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M10.5 15.5l-3 3M13.5 15.5l3 3" stroke="url(#gHilt)" stroke-width="3.2" stroke-linecap="round"/><path d="M10.5 15.5l-3 3M13.5 15.5l3 3" stroke="${LINE}" stroke-width="1" stroke-linecap="round" fill="none" opacity=".5"/>
    <circle cx="6.5" cy="19.5" r="1.8" fill="url(#gHilt)" stroke="${LINE}" stroke-width="1.1"/><circle cx="17.5" cy="19.5" r="1.8" fill="url(#gHilt)" stroke="${LINE}" stroke-width="1.1"/>
    <path d="M6 11.5l3 3M18 11.5l-3 3" stroke="#8a5a2b" stroke-width="2.4" stroke-linecap="round"/>`),
  shop: (s = 40) => svg(s, `${grad('gAwn', '#ff6a55', '#c4321f')}<rect x="4" y="11" width="16" height="10" rx="1.5" fill="#d9a066" stroke="${LINE}" stroke-width="1.5"/>
    <rect x="9.5" y="14" width="5" height="7" fill="#7a4a22" stroke="${LINE}" stroke-width="1.2"/>
    <path d="M2.5 11.5L4.5 4h15l2 7.5c0 1.4-1.2 2.3-2.5 2.3s-2.5-.9-2.5-2.3c0 1.4-1.2 2.3-2.5 2.3S11.5 12.9 11.5 11.5c0 1.4-1.2 2.3-2.5 2.3S6.5 12.9 6.5 11.5c0 1.4-1.2 2.3-2.5 2.3-.9 0-1.5-.6-1.5-2.3z" fill="url(#gAwn)" stroke="${LINE}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M8.5 4l-2 7.5M12 4v7.5M15.5 4l2 7.5" stroke="#fff3e0" stroke-width="1.6"/>`),
  trophy: (s = 30) => svg(s, `${grad('gCup', '#ffe58a', '#d38a12')}<path d="M7 3h10v5a5 5 0 0 1-10 0z" fill="url(#gCup)" stroke="${LINE}" stroke-width="1.5"/>
    <path d="M7 5H4.5a3 3 0 0 0 3 4.5M17 5h2.5a3 3 0 0 1-3 4.5" fill="none" stroke="${LINE}" stroke-width="1.5"/><path d="M10.5 13h3l.6 4h-4.2z" fill="url(#gCup)" stroke="${LINE}" stroke-width="1.3"/>
    <rect x="7.5" y="17" width="9" height="4" rx="1" fill="#8a5a2b" stroke="${LINE}" stroke-width="1.3"/>${shine(9.5, 5.5, 1.3, 2, 0)}`),
  info: (s = 30) => svg(s, `<circle cx="12" cy="12" r="10" fill="#3d7fd6" stroke="${LINE}" stroke-width="1.6"/><circle cx="12" cy="7" r="1.6" fill="#fff"/><rect x="10.6" y="10" width="2.8" height="8" rx="1.2" fill="#fff"/>`),
  up: (s = 30) => svg(s, `${grad('gUp', '#a6ef6a', '#3c9a22')}<path d="M12 2.5l8.5 9h-5v10h-7v-10h-5z" fill="url(#gUp)" stroke="${LINE}" stroke-width="1.6" stroke-linejoin="round"/>${shine(10, 8, 1.4, 2.4, 30)}`),
  clock: (s = 16) => svg(s, `<circle cx="12" cy="12" r="9.5" fill="#fff8e6" stroke="${LINE}" stroke-width="1.8"/><path d="M12 6.5V12l3.5 2.2" stroke="${LINE}" stroke-width="2" stroke-linecap="round" fill="none"/>`),
  lock: (s = 18) => svg(s, `<path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="${LINE}" stroke-width="2.4"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="#c9c2b3" stroke-width="1.2"/>
    <rect x="5" y="10.5" width="14" height="11" rx="2" fill="#f2c14e" stroke="${LINE}" stroke-width="1.6"/><circle cx="12" cy="15.5" r="1.6" fill="${LINE}"/>`),
  flag: (s = 26) => svg(s, `<path d="M5 22V3" stroke="${LINE}" stroke-width="2.4" stroke-linecap="round"/><path d="M5.8 3.5h12.5l-2.6 4.3 2.6 4.3H5.8z" fill="#fff" stroke="${LINE}" stroke-width="1.5" stroke-linejoin="round"/>`),
  close: (s = 22) => svg(s, `<path d="M6 6l12 12M18 6L6 18" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/>`),
  check: (s = 26) => svg(s, `<path d="M4.5 12.5l5 5 10-11" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`),
  back: (s = 22) => svg(s, `<path d="M9 5l7 7-7 7" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`),
  play: (s = 22) => svg(s, `<path d="M7 4.5v15l12-7.5z" fill="#fff" stroke="${LINE}" stroke-width="1.2" stroke-linejoin="round"/>`),
  hammer: (s = 30) => svg(s, `${grad('gHam', '#c9d3dc', '#6f7d8a')}<path d="M13.5 9.5l-9 9a2 2 0 0 0 2.8 2.8l9-9z" fill="#b5793d" stroke="${LINE}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M10.5 6.5l4-4 7 7-4 4-2-2-2.5 1-1.5-1.5 1-2.5z" fill="url(#gHam)" stroke="${LINE}" stroke-width="1.4" stroke-linejoin="round"/>`),
  sword: (s = 30) => svg(s, `${grad('gSw', '#ffffff', '#9fb3c4')}<path d="M19.5 2.5L21.5 4.5 10 16l-2-2z" fill="url(#gSw)" stroke="${LINE}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M6 12l6 6" stroke="#c07a10" stroke-width="3" stroke-linecap="round"/><path d="M8 16l-4.5 4.5" stroke="#7a4a22" stroke-width="2.6" stroke-linecap="round"/>`),
  army: (s = 20) => svg(s, `<circle cx="8" cy="8" r="3.5" fill="#f2c9a0" stroke="${LINE}" stroke-width="1.4"/><circle cx="16" cy="8" r="3.5" fill="#f2c9a0" stroke="${LINE}" stroke-width="1.4"/>
    <path d="M2 20c0-4 2.7-6.5 6-6.5s6 2.5 6 6.5zM10 20c0-4 2.7-6.5 6-6.5s6 2.5 6 6.5z" fill="#c83a2a" stroke="${LINE}" stroke-width="1.4" stroke-linejoin="round"/>`),
  stats: (s = 18) => svg(s, `<path d="M4 20V11M10 20V6M16 20v-6M22 20H2" stroke="${LINE}" stroke-width="2.6" stroke-linecap="round"/>`),
  dps: (s = 18) => svg(s, `<path d="M12 2l2 6h6l-5 4 2 7-5-4-5 4 2-7-5-4h6z" fill="#e0533d" stroke="${LINE}" stroke-width="1.4" stroke-linejoin="round"/>`),
  heart: (s = 18) => svg(s, `<path d="M12 20s-8-4.6-8-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 8 2.8C20 15.4 12 20 12 20z" fill="#e0533d" stroke="${LINE}" stroke-width="1.5"/>`),
  range: (s = 18) => svg(s, `<circle cx="12" cy="12" r="9" fill="none" stroke="${LINE}" stroke-width="1.8" stroke-dasharray="3 2"/><circle cx="12" cy="12" r="2.5" fill="#e0533d" stroke="${LINE}" stroke-width="1.2"/>`),
};

// A troop's portrait: a coloured badge with its weapon (or wings) drawn on it.
const GLYPH = {
  sword: '<path d="M16 6l2 2-7 7-2-2z" fill="#fff" stroke="#2b1a0c" stroke-width="1"/><path d="M8.5 13.5l2 2M7 17l2.5-2.5" stroke="#7a4a22" stroke-width="2" stroke-linecap="round"/>',
  archer: '<path d="M8 4a10 10 0 0 1 0 16" fill="none" stroke="#7a4a22" stroke-width="2.2"/><path d="M8 4v16" stroke="#fff" stroke-width="1"/><path d="M6 12h11l-2.5-2M17 12l-2.5 2" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  mace: '<path d="M8 17l6-6" stroke="#7a4a22" stroke-width="2.6" stroke-linecap="round"/><circle cx="15.5" cy="8.5" r="3.6" fill="#c9d3dc" stroke="#2b1a0c" stroke-width="1.2"/><path d="M15.5 3.8v1.4M20.2 8.5h-1.4M15.5 13.2v-1.4M10.8 8.5h1.4" stroke="#2b1a0c" stroke-width="1.4"/>',
  ayyar: '<path d="M7 17l9-9 1.5 1.5-9 9z" fill="#fff" stroke="#2b1a0c" stroke-width="1"/><circle cx="16.5" cy="16.5" r="3" fill="#ffd75a" stroke="#2b1a0c" stroke-width="1.1"/>',
  sapper: '<circle cx="11" cy="13.5" r="5.5" fill="#3a3a3a" stroke="#2b1a0c" stroke-width="1"/><path d="M14.5 9.5l2-2.5" stroke="#7a4a22" stroke-width="1.6"/><path d="M17 6l1.2-1.2" stroke="#ffb347" stroke-width="2" stroke-linecap="round"/>',
  simorgh: '<path d="M3 12c3-4 6-4 9 0 3-4 6-4 9 0-3 1-6 2-9 6-3-4-6-5-9-6z" fill="#fff" stroke="#2b1a0c" stroke-width="1" stroke-linejoin="round"/>',
  magus: '<path d="M12 4c2.5 3 4.5 5 4.5 8.2a4.5 4.5 0 0 1-9 0C7.5 9 9.5 7 12 4z" fill="#ffd25a" stroke="#2b1a0c" stroke-width="1"/><path d="M12 9c1.2 1.5 2 2.5 2 3.8a2 2 0 0 1-4 0c0-1.3.8-2.3 2-3.8z" fill="#fff"/>',
  healer: '<path d="M10 5h4v5h5v4h-5v5h-4v-5H5v-4h5z" fill="#fff" stroke="#2b1a0c" stroke-width="1"/>',
};
export function troopIcon(t, color, s = 40) {
  return svg(s, `<defs><radialGradient id="gT${t}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="${color}"/><stop offset="1" stop-color="${color}"/></radialGradient></defs>
    <circle cx="12" cy="12" r="10.5" fill="url(#gT${t})" stroke="${LINE}" stroke-width="1.6"/>${GLYPH[t] || ''}`);
}
