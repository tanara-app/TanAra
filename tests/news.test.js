import { suite, test, eq } from './harness.js';
import { NEWS } from '../js/data/news.js';

suite('news', () => {
  test('every entry has a unique id, a day, a title and one place to open', () => {
    eq(new Set(NEWS.map(n => n.id)).size, NEWS.length);
    eq(NEWS.filter(n => !/^\d{4}-\d{2}-\d{2}$/.test(n.day) || !n.title || !!n.go === !!n.tool).map(n => n.id), []);
  });
  test('newest first', () => {
    eq(NEWS.filter((n, i) => i && n.day > NEWS[i - 1].day).map(n => n.id), []);
  });
});
