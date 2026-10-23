// Light/dark theme: «auto» follows the phone, or a fixed choice. Kept on this device only
// (not per account), so it survives sign-out. index.html applies it before first paint.
const KEY = 'tanara:theme';
const BAR = { dark: '#0f1315', light: '#f3f5f6' };
const mq = matchMedia('(prefers-color-scheme: light)');

export const THEMES = [
  { value: 'auto', label: 'خودکار (مثل گوشی)' },
  { value: 'light', label: 'روشن' },
  { value: 'dark', label: 'تیره' },
];

export function getTheme() {
  try { const t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : 'auto'; } catch { return 'auto'; }
}

export function applyTheme() {
  const t = getTheme();
  const on = t === 'auto' ? (mq.matches ? 'light' : 'dark') : t;
  document.documentElement.dataset.theme = on;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[on]);
}

export function setTheme(t) {
  try { t === 'auto' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, t); } catch { /* private mode */ }
  applyTheme();
}

mq.addEventListener('change', () => { if (getTheme() === 'auto') applyTheme(); });
