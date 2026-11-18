/*
  The poster of «تنگاتنگ» (the game in «جوایز», design 1 «سفر به خانه», chosen by the owner on 2026-11-18;
  the three options are in art/promo/tangatang.html): a rocket full of blocky creatures flying home through a
  nebula, more of them floating around it and one being pulled in. Drawn here as SVG, no pictures. The motion
  is in css/app.css (.tt-*), off with «کاهش حرکت».

  ttArt(id): the picture alone, for the card in «جوایز» and the top of the game's page. Every id inside starts
  with `id`, so two copies on screen (the card under the page) never share a gradient or filter.
*/

// cells of each creature
const SHAPES = {
  L: [[0, 0], [0, 1], [0, 2], [1, 2]], T: [[0, 0], [1, 0], [2, 0], [1, 1]], S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  O: [[0, 0], [1, 0], [0, 1], [1, 1]], I: [[0, 0], [1, 0], [2, 0], [3, 0]],
};
// [highlight, body, shade]
const C = {
  sun: ['#FFF09A', '#FFC23D', '#E8890C'], pink: ['#FFC2E2', '#FF5FAE', '#D62F84'], sky: ['#B6F4FF', '#41C8FF', '#2577F0'],
  lime: ['#DDFFA8', '#7FE35A', '#2FAE4E'], grape: ['#E3D2FF', '#A47BFF', '#6A3FE0'], peach: ['#FFD8C2', '#FF8A5C', '#E2543A'],
};
const INK = '#2a1640';

// A glossy candy-cube creature: `face` 'happy' | 'wow' | 'wink'; `look` -1..1 moves the pupils.
function creature(id, shape, col, s, faceCell = 0, face = 'happy', look = 0) {
  const g = `${id}-${shape}${col}`, cells = SHAPES[shape], [hi, mid, lo] = C[col], gap = s * .07, r = s * .3;
  let out = `<defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset=".45" stop-color="${mid}"/><stop offset="1" stop-color="${lo}"/></linearGradient></defs><g filter="url(#${id}-ds)">`;
  for (const [x, y] of cells) {
    const px = x * s + gap / 2, py = y * s + gap / 2, w = s - gap;
    out += `<rect x="${px}" y="${py}" width="${w}" height="${w}" rx="${r}" fill="url(#${g})"/>`
      + `<rect x="${px + w * .16}" y="${py + w * .1}" width="${w * .68}" height="${w * .24}" rx="${w * .12}" fill="#fff" opacity=".55"/>`
      + `<rect x="${px + w * .12}" y="${py + w * .78}" width="${w * .76}" height="${w * .1}" rx="${w * .05}" fill="${lo}" opacity=".55"/>`;
  }
  out += '</g>';
  const [fx, fy] = cells[faceCell], cx = fx * s + s / 2, cy = fy * s + s / 2 + s * .04, ex = s * .17, er = s * .15, pr = s * .085;
  const eye = (x, wink) => (wink
    ? `<path d="M${x - er} ${cy}q${er} ${-er * .9} ${er * 2} 0" fill="none" stroke="${INK}" stroke-width="${s * .06}" stroke-linecap="round"/>`
    : `<circle cx="${x}" cy="${cy}" r="${er}" fill="#fff"/><circle cx="${x + look * er * .35}" cy="${cy + er * .12}" r="${pr}" fill="${INK}"/><circle cx="${x + look * er * .35 - pr * .4}" cy="${cy - pr * .3}" r="${pr * .38}" fill="#fff"/>`);
  out += eye(cx - ex, false) + eye(cx + ex, face === 'wink');
  out += `<ellipse cx="${cx - s * .3}" cy="${cy + s * .2}" rx="${s * .08}" ry="${s * .05}" fill="#ff4f8b" opacity=".45"/><ellipse cx="${cx + s * .3}" cy="${cy + s * .2}" rx="${s * .08}" ry="${s * .05}" fill="#ff4f8b" opacity=".45"/>`;
  out += face === 'wow'
    ? `<ellipse cx="${cx}" cy="${cy + s * .24}" rx="${s * .06}" ry="${s * .075}" fill="${INK}"/>`
    : `<path d="M${cx - s * .08} ${cy + s * .2}q${s * .08} ${s * .08} ${s * .16} 0" fill="none" stroke="${INK}" stroke-width="${s * .05}" stroke-linecap="round"/>`;
  return out;
}
const put = (x, y, rot, html, cls) => `<g transform="translate(${x} ${y}) rotate(${rot})"><g class="${cls}">${html}</g></g>`;

// the same stars every time (seeded)
function stars(n, w, h, seed) {
  let a = seed, out = '';
  const rnd = () => (a = (a * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < n; i++) {
    const r = rnd() < .1 ? 1.6 : rnd() * .9 + .3;
    out += `<circle cx="${(rnd() * w).toFixed(1)}" cy="${(rnd() * h).toFixed(1)}" r="${r.toFixed(2)}" fill="#fff" opacity="${(.35 + rnd() * .6).toFixed(2)}"${i % 7 === 0 ? ` class="tt-tw${i % 3 ? ' b' : ''}"` : ''}/>`;
  }
  return out;
}
const sparkle = (x, y, s, fill, cls) => `<path class="${cls}" transform="translate(${x} ${y}) scale(${s})" d="M0-10C1-3 3-1 10 0C3 1 1 3 0 10C-1 3-3 1-10 0C-3-1-1-3 0-10Z" fill="${fill}"/>`;

function rocket(id) {
  const win = [['sun', 0], ['pink', 1], ['sky', 0], ['lime', 1], ['grape', 0], ['peach', 1], ['sky', 1], ['sun', 0], ['pink', 0]]
    .map(([c, f], i) => {
      const x = -22 + (i % 3) * 15, y = -27 + Math.floor(i / 3) * 15;
      return `<rect x="${x}" y="${y}" width="13.5" height="13.5" rx="4" fill="${C[c][1]}"/>${f ? `<circle cx="${x + 4.5}" cy="${y + 7}" r="1.6" fill="${INK}"/><circle cx="${x + 9}" cy="${y + 7}" r="1.6" fill="${INK}"/>` : ''}`;
    }).join('');
  return `<defs>
      <linearGradient id="${id}-body" x1="0" x2="1"><stop offset="0" stop-color="#9aa0e6"/><stop offset=".35" stop-color="#fff"/><stop offset=".7" stop-color="#e3e5ff"/><stop offset="1" stop-color="#7b80cf"/></linearGradient>
      <linearGradient id="${id}-nose" x1="0" x2="1"><stop offset="0" stop-color="#d6337f"/><stop offset=".4" stop-color="#ff7ac0"/><stop offset="1" stop-color="#b8226a"/></linearGradient>
      <radialGradient id="${id}-glass" cx=".35" cy=".3"><stop offset="0" stop-color="#3b2f9e"/><stop offset="1" stop-color="#120c3a"/></radialGradient>
      <linearGradient id="${id}-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#8a8fd6"/></linearGradient>
      <linearGradient id="${id}-trail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd166" stop-opacity=".9"/><stop offset=".4" stop-color="#ff7ac8" stop-opacity=".5"/><stop offset="1" stop-color="#8d5bff" stop-opacity="0"/></linearGradient>
      <clipPath id="${id}-win"><circle r="27"/></clipPath>
    </defs>
    <path d="M-30 96L30 96L70 330L-70 330Z" fill="url(#${id}-trail)" filter="url(#${id}-b8)" opacity=".85"/>
    <g transform="translate(0 92)"><g class="tt-flame"><path d="M-26 0Q0 170 26 0Z" fill="#ff8a3d" filter="url(#${id}-b3)" opacity=".9"/><path d="M-17 0Q0 110 17 0Z" fill="#ffd34d"/><path d="M-8 0Q0 62 8 0Z" fill="#fff"/></g></g>
    <path d="M-42 26L-82 92Q-86 100-76 100L-40 84Z" fill="url(#${id}-nose)"/><path d="M42 26L82 92Q86 100 76 100L40 84Z" fill="url(#${id}-nose)"/>
    <rect x="-26" y="80" width="52" height="16" rx="5" fill="#5b5fa8"/>
    <path d="M0-118C40-88 48-26 46 40L46 76Q46 86 36 86L-36 86Q-46 86-46 76L-46 40C-48-26-40-88 0-118Z" fill="url(#${id}-body)"/>
    <path d="M0-118C30-95 40-70 43-54L-43-54C-40-70-30-95 0-118Z" fill="url(#${id}-nose)"/>
    <rect x="-46" y="58" width="92" height="9" fill="#ff7ac0" opacity=".9"/>
    <circle r="33" fill="url(#${id}-ring)"/><circle r="27" fill="url(#${id}-glass)"/>
    <g clip-path="url(#${id}-win)">${win}<path d="M-30-8A30 30 0 0 1 8-30L14-24A24 24 0 0 0-24-2Z" fill="#fff" opacity=".28"/></g>
    <path d="M-30-40C-34 0-34 40-32 76" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".55" fill="none"/>`;
}

export function ttArt(id = 'tt') {
  return `<svg class="tt-art" viewBox="0 0 375 470" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <filter id="${id}-ds" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#14062e" flood-opacity=".45"/></filter>
      <filter id="${id}-b8"><feGaussianBlur stdDeviation="8"/></filter>
      <filter id="${id}-b24" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="24"/></filter>
      <filter id="${id}-b3"><feGaussianBlur stdDeviation="2.5"/></filter>
      <filter id="${id}-grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .07 0"/></filter>
      <radialGradient id="${id}-sp" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="#2d1a78"/><stop offset=".6" stop-color="#140c45"/><stop offset="1" stop-color="#07061c"/></radialGradient>
      <radialGradient id="${id}-pl" cx=".35" cy=".2" r=".9"><stop offset="0" stop-color="#7c5cff"/><stop offset=".45" stop-color="#3a1f9a"/><stop offset="1" stop-color="#120a3a"/></radialGradient>
      <linearGradient id="${id}-fade" x1="0" y1="0" x2="0" y2="1"><stop offset=".45" stop-color="#07061c" stop-opacity="0"/><stop offset="1" stop-color="#07061c" stop-opacity=".9"/></linearGradient>
    </defs>
    <rect width="375" height="470" fill="url(#${id}-sp)"/>
    <ellipse cx="40" cy="90" rx="150" ry="90" fill="#ff3fa4" opacity=".42" filter="url(#${id}-b24)"/>
    <ellipse cx="350" cy="140" rx="130" ry="90" fill="#22c8ff" opacity=".35" filter="url(#${id}-b24)"/>
    <ellipse cx="190" cy="260" rx="170" ry="110" fill="#8d5bff" opacity=".45" filter="url(#${id}-b24)"/>
    ${stars(120, 375, 470, 7)}
    ${sparkle(318, 58, 1.1, '#fff', 'tt-tw')}${sparkle(56, 210, .7, '#ffe9a8', 'tt-tw b')}${sparkle(300, 300, .6, '#c9f6ff', 'tt-tw c')}
    <g transform="translate(330 70)"><ellipse rx="34" ry="9" fill="none" stroke="#ffd9a8" stroke-width="3" opacity=".6" transform="rotate(-18)"/><circle r="18" fill="#ffb36b"/><circle cx="-5" cy="-5" r="6" fill="#fff" opacity=".25"/></g>
    <circle cx="150" cy="700" r="330" fill="url(#${id}-pl)"/>
    <circle cx="150" cy="700" r="332" fill="none" stroke="#7ef0ff" stroke-width="3" opacity=".7" filter="url(#${id}-b3)"/>
    <g transform="translate(210 205) rotate(16)"><g class="tt-hover">${rocket(id)}</g></g>
    <path class="tt-beam" d="M180 228L40 330L105 352Z" fill="#fff6c2" opacity=".35" filter="url(#${id}-b8)"/>
    ${put(64, 300, 0, creature(id, 'T', 'sun', 22, 1, 'wow', 1), 'tt-pull')}
    ${put(22, 128, -14, creature(id, 'L', 'pink', 24, 3, 'happy', 1), 'tt-drift')}
    ${put(300, 225, 12, creature(id, 'O', 'lime', 24, 0, 'wink', -1), 'tt-drift b')}
    ${put(270, 320, -8, creature(id, 'S', 'sky', 20, 2, 'happy', -1), 'tt-drift c')}
    ${put(110, 60, 18, creature(id, 'I', 'grape', 13, 1, 'happy'), 'tt-drift d')}
    <rect width="375" height="470" fill="url(#${id}-fade)"/>
    <rect width="375" height="470" filter="url(#${id}-grain)"/>
  </svg>`;
}
