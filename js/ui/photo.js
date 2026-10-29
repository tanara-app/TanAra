// Taking a photo of food for Hooshvareh: pick (camera or gallery), shrink, base64.
import { shrink } from './motivation.js';
import { choose } from './dom.js';

/*
  Resolves to the chosen File, or null when nothing was picked. Must be called from a tap.
  from: 'camera' opens the camera straight away (Android otherwise shows a file picker
  first), 'gallery' the photo picker, 'ask' lets them choose (for screenshots).
*/
export async function pickPhoto(from = 'camera') {
  return (await pickPhotos(from, false))[0] || null;
}

// Same, but from the gallery several can be chosen at once. Resolves to an array (empty when none).
export async function pickPhotos(from = 'ask', multiple = true) {
  if (from === 'ask') {
    from = await choose('عکس از کجا؟', [{ value: 'camera', label: 'گرفتن عکس با دوربین' }, { value: 'gallery', label: multiple ? 'انتخاب از گالری (یک یا چند عکس)' : 'انتخاب از گالری یا اسکرین‌شات' }]);
    if (!from) return [];
  }
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (from === 'camera') input.capture = 'environment';
    else input.multiple = multiple;
    input.onchange = () => resolve([...(input.files || [])]);
    input.addEventListener('cancel', () => resolve([]));
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
