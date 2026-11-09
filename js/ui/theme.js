// Theme: «auto» follows the phone (light/dark), or a fixed choice, including the two colour themes
// «زرشکی» (light, barberry red with gold and navy) and «لاجوردی» (dark, lapis blue with gold).
// Kept on this device only (not per account), so it survives sign-out. index.html applies it before first paint.
const KEY = 'tanara:theme';
const BAR = { dark: '#0f1315', light: '#f3f5f6', crimson: '#f7f1ec', lapis: '#0d1424' };
const LIGHT = new Set(['light', 'crimson']);
const mq = matchMedia('(prefers-color-scheme: light)');

export const THEMES = [
  { value: 'auto', label: 'خودکار (مثل گوشی)' },
  { value: 'light', label: 'روشن' },
  { value: 'dark', label: 'تیره' },
  { value: 'crimson', label: 'زرشکی' },
  { value: 'lapis', label: 'لاجوردی' },
];

export function getTheme() {
  try { const t = localStorage.getItem(KEY); return Object.hasOwn(BAR, t) ? t : 'auto'; } catch { return 'auto'; }
}

export function applyTheme() {
  const t = getTheme();
  const on = t === 'auto' ? (mq.matches ? 'light' : 'dark') : t;
  document.documentElement.dataset.theme = on;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[on]);
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute('content', LIGHT.has(on) ? 'default' : 'black-translucent');
}

export function setTheme(t) {
  try { t === 'auto' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, t); } catch { /* private mode */ }
  applyTheme();
}

mq.addEventListener('change', () => { if (getTheme() === 'auto') applyTheme(); });
