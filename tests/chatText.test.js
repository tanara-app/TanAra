import { suite, test, eq } from './harness.js';
import { hideCalls } from '../js/domain/chatText.js';

suite('chatText', () => {
  test('a proposal written as text is hidden, the rest stays', () => {
    eq(hideCalls('دیدم.\n\n<propose_log_food>\n{"day":"2026-11-11","qty":2}\n</propose_log_food>\n\nمنتظر تأیید توست.'), 'دیدم.\n\nمنتظر تأیید توست.');
  });

  test('two blocks are both hidden', () => {
    eq(hideCalls('a <propose_weight>{"kg":80}</propose_weight> b <propose_log_food>{}</propose_log_food> c'), 'a  b  c');
  });

  test('while streaming, an unfinished block is hidden', () => {
    eq(hideCalls('دیدم.\n\n<propose_log_food>\n{"day":"2026'), 'دیدم.');
    eq(hideCalls('دیدم.\n\n<propose_lo'), 'دیدم.');
  });

  test('ordinary text and other tags are left alone', () => {
    eq(hideCalls('۲ < ۳ و <b>پررنگ</b>'), '۲ < ۳ و <b>پررنگ</b>');
  });
});
