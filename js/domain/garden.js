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
