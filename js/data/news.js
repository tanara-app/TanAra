/*
  «تازه‌ها»: what changed in the app, newest first, shown in «بیشتر» ← «تازه‌ها» (js/ui/news.js).

  Rules for both Claudes (see CLAUDE.md):
  - Every change members can see gets an entry here, in the same commit. Fixes behind the scenes
    (tests, docs, server-only) don't.
  - Nothing that is still a beta («آزمایشی», only in some profiles' `beta`). It gets its entry
    on the day it opens to everyone.
  - Show the user the title and the line before pushing; they approve every word.
  - Short: a title of a few words and at most one line under it.

  Fields: id (unique, never reused), day (YYYY-MM-DD), title, body (one line, optional),
  go (a hash such as '#/profile') or tool (a tile key in tools.js) to open it from the card,
  big: true for a large feature — it also comes up once, by itself, as a sheet when the app opens.
*/
export const NEWS = [
  { id: 'news', day: '2026-11-12', big: true, title: '«تازه‌ها»', body: 'هر چیز تازه‌ی اپ این‌جاست.', go: '#/news' },
  { id: 'profile-tiles', day: '2026-11-12', title: 'نمایه‌ی تازه', go: '#/profile' },
  { id: 'family-shop', day: '2026-11-09', title: 'لیست خرید خانوادگی', tool: 'shop' },
];
