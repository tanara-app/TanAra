// Appearance = a named colour theme (palette) × a mode (auto follows the phone, or light/dark).
// Every palette has a light and a dark version (css/app.css: [data-palette] × [data-theme]).
// Both are kept on this device only (not per account), so they survive sign-out.
// index.html applies them before first paint; keep its inline script in step with BAR here.
const KEY = 'tanara:theme';     // mode: 'light' | 'dark' | missing = auto
const PKEY = 'tanara:palette';  // palette: 'anar' | 'kashi' | missing = نعنا (the original green)
const BAR = {
  nana: { dark: '#0f1315', light: '#f3f5f6' },
  anar: { dark: '#160d0f', light: '#f7f1ec' },
  kashi: { dark: '#0d1424', light: '#eef2f8' },
};
const mq = matchMedia('(prefers-color-scheme: light)');

export const THEMES = [
  { value: 'auto', label: 'خودکار (مثل گوشی)' },
  { value: 'light', label: 'روشن' },
  { value: 'dark', label: 'تیره' },
];

// sw: swatch colours for the picker [background, accent, second colour], same as css/app.css
export const PALETTES = [
  { value: 'nana', label: 'نعنا', hint: 'سبز نعنایی', sw: { light: ['#f3f5f6', '#0c8460', '#a86b12'], dark: ['#0f1315', '#5fd3a8', '#e9b872'] } },
  { value: 'anar', label: 'انار', hint: 'زرشکی کلاسیک با طلایی و سرمه‌ای', sw: { light: ['#f7f1ec', '#841728', '#a8741a'], dark: ['#160d0f', '#bd2139', '#e6b25c'] } },
  { value: 'kashi', label: 'کاشی', hint: 'لاجوردی با طلایی و فیروزه‌ای', sw: { light: ['#eef2f8', '#1f3f8f', '#a8741a'], dark: ['#0d1424', '#e6b85c', '#7fd0e6'] } },
];

// light or dark right now (auto resolved)
export const shownMode = () => (getTheme() === 'auto' ? (mq.matches ? 'light' : 'dark') : getTheme());

function read(k) { try { return localStorage.getItem(k); } catch { return null; } }
function write(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* private mode */ } }

export function getTheme() {
  const t = read(KEY);
  return t === 'light' || t === 'dark' ? t : 'auto';
}

export function getPalette() {
  const p = read(PKEY);
  return p === 'anar' || p === 'kashi' ? p : 'nana';
}

export function applyTheme() {
  const p = getPalette(), on = shownMode();
  const html = document.documentElement;
  html.dataset.theme = on;
  if (p === 'nana') delete html.dataset.palette; else html.dataset.palette = p;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[p][on]);
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute('content', on === 'light' ? 'default' : 'black-translucent');
}

export function setTheme(t) { write(KEY, t === 'auto' ? null : t); applyTheme(); }
export function setPalette(p) { write(PKEY, p === 'nana' ? null : p); applyTheme(); }

mq.addEventListener('change', () => { if (getTheme() === 'auto') applyTheme(); });
