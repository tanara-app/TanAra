/*
  Is this food already in that bank under another spelling? Used by «غذاهای تازه‌ی خانواده»
  (foodShare.js), where the owner sends a member's food to everyone else's bank: a member who
  already has a similar food is shown it and is left out unless the owner ticks them.

  Names are compared as sets of words: Arabic ي/ك become Persian, the half space splits words
  like a space, brackets and punctuation go, and «مربای» counts as «مربا». So «نان بادام کریسپی»
  matches «نان کریسپی بادام (Crispy almond bread)» and «مربا آلبالو» matches «مربای آلبالو ( مجید )».
*/

export function words(name) {
  return String(name || '')
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[ۀة]/g, 'ه').replace(/[أإآ]/g, 'ا')
    .replace(/[ً-ْ]/g, '')
    .toLowerCase()
    .split(/[\s‌()[\]{}،,.:;\-_/«»"'+]+/)
    .filter(Boolean)
    .map(w => (w.length > 3 && /[اوی]ی$/.test(w) && !/یی$/.test(w) ? w.slice(0, -1) : w));
}

export const foodKey = name => [...new Set(words(name))].sort().join(' ');

/*
  Same barcode, same words, or every word of the shorter name in the longer one. A one-word
  name only counts when the word is long enough to mean something (not «نان» or «شیر») and the
  longer name adds at most two words to it.
*/
export function similar(a, b) {
  if (a.barcode && b.barcode && a.barcode === b.barcode) return true;
  const wa = new Set(words(a.name));
  const wb = new Set(words(b.name));
  if (!wa.size || !wb.size) return false;
  const [s, l] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  if (![...s].every(w => l.has(w))) return false;
  if (s.size === l.size) return true;
  if (s.size === 1) return [...s][0].length >= 4 && l.size - s.size <= 2;
  return true;
}

export const similarIn = (food, bank) => bank.filter(f => f.id !== food.id && similar(food, f));
