// Taking a photo of food for Hooshvareh: pick (camera or gallery), shrink, base64.
import { shrink } from './motivation.js';

// Opens the system picker. Resolves to the chosen File, or null when nothing was picked.
// Must be called from a tap.
export function pickPhoto() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => resolve(input.files?.[0] || null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

// { b64, url }: the JPEG as base64 for the request, and an object URL to show it. 1024 px is
// plenty for telling foods and portions apart, and keeps the request (and its cost) small.
export async function foodPhoto(file) {
  const blob = await shrink(file, 1024);
  const b64 = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(new Error('read'));
    r.readAsDataURL(blob);
  });
  if (!b64) throw new Error('read');
  return { b64, url: URL.createObjectURL(blob) };
}

export const cameraIcon = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/></svg>';
