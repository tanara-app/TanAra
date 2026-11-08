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
  Same barcode, same words, or every word of a name of two words or more in the other one, both
  starting with the same word. A one-word name is a generic food (the bank's «مربا», «بادام»,
  «نوشابه»), so it matches only itself: «مربا آلبالو» is not the bank's «مربا». The first word
  is the food itself and the rest describe it, so «کره بادام‌زمینی» is not «بادام زمینی», while
  «سس مایونز تیفانی» is «سس مایونز».
*/
export function similar(a, b) {
  if (a.barcode && b.barcode && a.barcode === b.barcode) return true;
  const na = words(a.name);
  const nb = words(b.name);
  const wa = new Set(na);
  const wb = new Set(nb);
  if (!wa.size || !wb.size) return false;
  const [s, l] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  if (![...s].every(w => l.has(w))) return false;
  if (s.size === l.size) return true;
  return s.size >= 2 && na[0] === nb[0];
}

export const similarIn = (food, bank) => bank.filter(f => f.id !== food.id && similar(food, f));

/*
  The foods shared with everyone before this member joined, which they have nothing similar to
  and which were not taken back from them. member: { id, joined, skip: [food ids taken back] };
  all: every member's foods with user_id, decision and decided_at.
*/
export function missingFor(member, all) {
  const mine = all.filter(f => f.user_id === member.id);
  const joined = new Date(member.joined);
  return all.filter(f => f.decision === 'shared' && f.user_id !== member.id
    && new Date(f.decided_at) < joined && !(member.skip || []).includes(f.id) && !similarIn(f, mine).length);
}

/*
  The same food added by several members shows once: [{ food, also: [the others] }], the food
  being the first one added, groups in the order of the list. Two foods in one bank stay apart:
  someone who keeps both «مربا آلبالو» and «مربای آلبالو (مجید)» means two different things.
*/
export function groupSimilar(list) {
  const byAge = [...list].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const groups = [];
  for (const f of byAge) {
    const g = groups.find(x => similar(x.food, f) && ![x.food, ...x.also].some(y => y.user_id === f.user_id));
    if (g) g.also.push(f); else groups.push({ food: f, also: [] });
  }
  const at = new Map(list.map((f, i) => [f.id, i]));
  const first = g => Math.min(...[g.food, ...g.also].map(f => at.get(f.id)));
  return groups.sort((a, b) => first(a) - first(b));
}

// Every other member already has a food like this one: there is nothing to send.
export const everyoneHas = (food, all, memberIds) => memberIds.filter(id => id !== food.user_id)
  .every(id => similarIn(food, all.filter(f => f.user_id === id)).length > 0);
