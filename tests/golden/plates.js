/*
  The golden set of «سهم وعده» (SAHM.md, phase 2): Iranian plates of the app's starter foods, made up
  for this purpose (never copied from anyone's log: the repository is public). The scorer
  (score.js) fits each plate at five sizes and four conditions and judges the answer.

  For each plate:
  - `sane`: per food, the least and most that a careful eater would accept for it in one such meal,
    at any size the meal may be, in the food's own unit (seedFoods.js). An answer outside is not a
    realistic plate (SAHM.md, measure 5). Written by Claude on 2026-11-20 from household measures
    and the usual way these meals are served; checked again in phase 7.
  - `pairs`: [a, b, least, most]: the amount of a over the amount of b, in their own units, that keeps
    the plate natural (a کفگیر of rice to a کفگیر of stew, two palms of bread to a matchbox of cheese).
  Foods not in `sane` are drinks or foods with no calories, which keep their usual helping.
*/
export const PLATES = [
  // ---- breakfast ----
  { id: 'nan-panir-gerdoo', meal: 'breakfast', sane: { 'نان سنگک': [1, 4], 'پنیر سفید': [0.5, 2], 'گردو (مغز کامل)': [1, 6] }, pairs: [['نان سنگک', 'پنیر سفید', 1, 4]] },
  { id: 'barbari-panir-goje-khiar', meal: 'breakfast', sane: { 'نان بربری': [1, 4], 'پنیر سفید': [0.5, 2], 'گوجه‌فرنگی': [0.5, 2], 'خیار': [0.5, 2] }, pairs: [['نان بربری', 'پنیر سفید', 1, 4]] },
  { id: 'nan-kare-moraba', meal: 'breakfast', sane: { 'نان سنگک': [1, 4], 'کره': [0.5, 1.5], 'مربا': [0.5, 2] }, pairs: [['نان سنگک', 'کره', 1, 6], ['نان سنگک', 'مربا', 0.75, 6]] },
  { id: 'nan-kare-asal', meal: 'breakfast', sane: { 'نان سنگک': [1, 4], 'کره': [0.5, 1.5], 'عسل': [0.5, 1.5] }, pairs: [['نان سنگک', 'کره', 1, 6]] },
  { id: 'lavash-arde-asal', meal: 'breakfast', sane: { 'نان لواش': [0.5, 2.5], 'ارده': [1, 3], 'عسل': [0.5, 1.5] }, pairs: [['ارده', 'عسل', 1, 4]] },
  { id: 'tost-karebadam-moz', meal: 'breakfast', sane: { 'نان تست': [1, 3], 'کره بادام‌زمینی': [0.5, 2], 'موز': [0.5, 1.5] }, pairs: [['نان تست', 'کره بادام‌زمینی', 1, 4]] },
  { id: 'tokhmemorgh-nan-goje', meal: 'breakfast', sane: { 'تخم‌مرغ آب‌پز': [1, 3], 'نان سنگک': [1, 3], 'گوجه‌فرنگی': [0.5, 2] }, pairs: [['نان سنگک', 'تخم‌مرغ آب‌پز', 0.5, 3]] },
  { id: 'nimroo-barbari', meal: 'breakfast', sane: { 'نیمرو': [1, 3], 'نان بربری': [1, 4] }, pairs: [['نان بربری', 'نیمرو', 0.5, 3]] },
  { id: 'omlet-sangak', meal: 'breakfast', sane: { 'املت گوجه (۲ تخم‌مرغ)': [0.5, 1.5], 'نان سنگک': [1, 4] }, pairs: [] },
  { id: 'halim-chai', meal: 'breakfast', sane: { 'حلیم (با شکر)': [0.5, 1.5] }, pairs: [], also: ['چای بدون قند'] },
  { id: 'shir-tost-asal', meal: 'breakfast', sane: { 'شیر کم‌چرب': [0.5, 1.5], 'نان تست': [1, 3], 'عسل': [0.5, 1.5] }, pairs: [] },
  { id: 'mast-gerdoo-asal', meal: 'breakfast', sane: { 'ماست چکیده (یونانی)': [0.5, 1.5], 'گردو (مغز کامل)': [1, 6], 'عسل': [0.5, 1.5] }, pairs: [] },
  { id: 'taftoon-panir-sabzi-gerdoo', meal: 'breakfast', sane: { 'نان تافتون': [1, 4], 'پنیر سفید': [0.5, 2], 'سبزی خوردن': [0.5, 3], 'گردو (مغز کامل)': [1, 6] }, pairs: [['نان تافتون', 'پنیر سفید', 1, 4]] },
  { id: 'tost-tokhmemorgh-shir', meal: 'breakfast', sane: { 'نان تست': [1, 3], 'تخم‌مرغ آب‌پز': [1, 3], 'شیر کم‌چرب': [0.5, 1.5] }, pairs: [] },
  { id: 'barbari-khame-asal', meal: 'breakfast', sane: { 'نان بربری': [1, 4], 'خامه صبحانه': [0.5, 2], 'عسل': [0.5, 1.5] }, pairs: [['نان بربری', 'خامه صبحانه', 1, 6]] },

  // ---- lunch ----
  { id: 'chelo-ghorme-mastkhiar-shirazi', meal: 'lunch', sane: { 'برنج سفید (کته یا چلو)': [0.5, 3], 'قورمه‌سبزی (بدون روغن رو)': [0.75, 3], 'ماست‌وخیار': [0.25, 1], 'سالاد شیرازی (بدون روغن)': [0.5, 1.5] }, pairs: [['برنج سفید (کته یا چلو)', 'قورمه‌سبزی (بدون روغن رو)', 0.5, 2]] },
  { id: 'chelo-ghorme-mastkhiar', meal: 'lunch', sane: { 'برنج سفید (کته یا چلو)': [0.5, 3], 'قورمه‌سبزی (بدون روغن رو)': [0.75, 3], 'ماست‌وخیار': [0.25, 1.5] }, pairs: [['برنج سفید (کته یا چلو)', 'قورمه‌سبزی (بدون روغن رو)', 0.5, 2]] },
  { id: 'chelo-gheyme-shirazi', meal: 'lunch', sane: { 'برنج سفید (کته یا چلو)': [0.5, 3], 'قیمه (بدون روغن رو)': [0.75, 3], 'سالاد شیرازی (بدون روغن)': [0.5, 1.5] }, pairs: [['برنج سفید (کته یا چلو)', 'قیمه (بدون روغن رو)', 0.5, 2]] },
  { id: 'chelo-bademjan-doogh', meal: 'lunch', sane: { 'برنج سفید (کته یا چلو)': [0.5, 3], 'خورش بادمجان (بدون روغن رو)': [0.75, 3] }, pairs: [['برنج سفید (کته یا چلو)', 'خورش بادمجان (بدون روغن رو)', 0.5, 2]], also: ['دوغ'] },
  { id: 'chelo-karafs-mast', meal: 'lunch', sane: { 'برنج سفید (کته یا چلو)': [0.5, 3], 'خورش کرفس (بدون روغن رو)': [0.75, 3], 'ماست کم‌چرب': [0.25, 1] }, pairs: [['برنج سفید (کته یا چلو)', 'خورش کرفس (بدون روغن رو)', 0.5, 2]] },
  { id: 'chelo-fesenjan', meal: 'lunch', sane: { 'برنج سفید (کته یا چلو)': [0.5, 3], 'فسنجان': [0.5, 2] }, pairs: [['برنج سفید (کته یا چلو)', 'فسنجان', 0.75, 3]] },
  { id: 'chelo-joje-goje', meal: 'lunch', sane: { 'برنج سفید (کته یا چلو)': [0.5, 3], 'جوجه‌کباب': [0.5, 2], 'گوجه‌فرنگی': [0.5, 2] }, pairs: [['برنج سفید (کته یا چلو)', 'جوجه‌کباب', 0.75, 4]] },
  { id: 'chelo-koobide-sabzi-doogh', meal: 'lunch', sane: { 'برنج سفید (کته یا چلو)': [0.5, 3], 'کباب کوبیده': [0.5, 2], 'سبزی خوردن': [0.5, 3] }, pairs: [['برنج سفید (کته یا چلو)', 'کباب کوبیده', 0.75, 4]], also: ['دوغ'] },
  { id: 'loobiapolo-mast-shirazi', meal: 'lunch', sane: { 'لوبیاپلو': [1, 3.5], 'ماست کم‌چرب': [0.25, 1], 'سالاد شیرازی (بدون روغن)': [0.5, 1.5] }, pairs: [] },
  { id: 'adaspolo-mast', meal: 'lunch', sane: { 'عدس‌پلو': [1, 3.5], 'ماست کم‌چرب': [0.25, 1] }, pairs: [] },
  { id: 'sabzipolo-mahi', meal: 'lunch', sane: { 'سبزی‌پلو': [0.5, 3], 'ماهی قزل‌آلا گریل': [0.5, 2] }, pairs: [['سبزی‌پلو', 'ماهی قزل‌آلا گریل', 0.5, 4]] },
  { id: 'makaroni-salad-doogh', meal: 'lunch', sane: { 'ماکارونی با گوشت': [1, 3.5], 'سالاد کاهو و گوجه (بدون سس)': [0.5, 1.5] }, pairs: [], also: ['دوغ'] },
  { id: 'baghalipolo-morgh', meal: 'lunch', sane: { 'باقالی‌پلو': [0.5, 3], 'ران مرغ پخته': [0.5, 2] }, pairs: [['باقالی‌پلو', 'ران مرغ پخته', 0.75, 4]] },
  { id: 'chelo-sine-bokharpaz', meal: 'lunch', sane: { 'برنج سفید (کته یا چلو)': [0.5, 3], 'سینه مرغ آب‌پز یا گریل': [0.5, 2.5], 'سبزیجات بخارپز': [0.5, 2] }, pairs: [['برنج سفید (کته یا چلو)', 'سینه مرغ آب‌پز یا گریل', 0.5, 4]] },
  { id: 'abgoosht-nan-sabzi', meal: 'lunch', sane: { 'آبگوشت با گوشت‌کوبیده': [0.5, 1.5], 'نان سنگک': [1, 3], 'سبزی خوردن': [0.5, 3] }, pairs: [] },
  { id: 'chelo-tahdig-ghorme', meal: 'lunch', sane: { 'برنج سفید (کته یا چلو)': [0.5, 3], 'ته‌دیگ': [0.5, 1.5], 'قورمه‌سبزی (بدون روغن رو)': [0.75, 3] }, pairs: [['برنج سفید (کته یا چلو)', 'قورمه‌سبزی (بدون روغن رو)', 0.5, 2]] },
  { id: 'kookoo-lavash-mast', meal: 'lunch', sane: { 'کوکو سبزی': [1, 3], 'نان لواش': [0.5, 2], 'ماست کم‌چرب': [0.25, 1] }, pairs: [] },
  { id: 'chelo-ghorme-roghan', meal: 'lunch', sane: { 'برنج سفید (کته یا چلو)': [0.5, 3], 'قورمه‌سبزی (بدون روغن رو)': [0.75, 3], 'روغن خورش / غذا': [0.5, 1] }, pairs: [['برنج سفید (کته یا چلو)', 'قورمه‌سبزی (بدون روغن رو)', 0.5, 2]] },

  // ---- dinner ----
  { id: 'soopjo-nan', meal: 'dinner', sane: { 'سوپ جو': [1, 2.5], 'نان سنگک': [0.5, 2] }, pairs: [] },
  { id: 'adasi-nan', meal: 'dinner', sane: { 'عدسی': [1, 2.5], 'نان سنگک': [0.5, 3] }, pairs: [] },
  { id: 'kotlet-lavash-goje-khiar', meal: 'dinner', sane: { 'کتلت': [1, 4], 'نان لواش': [0.5, 2], 'گوجه‌فرنگی': [0.5, 2], 'خیار': [0.5, 2] }, pairs: [['کتلت', 'نان لواش', 1, 4]] },
  { id: 'tokhmemorgh-nan-khiar', meal: 'dinner', sane: { 'تخم‌مرغ آب‌پز': [1, 4], 'نان سنگک': [0.5, 3], 'خیار': [0.5, 2] }, pairs: [['نان سنگک', 'تخم‌مرغ آب‌پز', 0.25, 3]] },
  { id: 'omlet-barbari', meal: 'dinner', sane: { 'املت گوجه (۲ تخم‌مرغ)': [0.5, 1.5], 'نان بربری': [0.5, 3] }, pairs: [] },
  { id: 'mahi-chelo-salad', meal: 'dinner', sane: { 'ماهی قزل‌آلا گریل': [0.5, 2], 'برنج سفید (کته یا چلو)': [0.5, 2.5], 'سالاد کاهو و گوجه (بدون سس)': [0.5, 1.5] }, pairs: [['برنج سفید (کته یا چلو)', 'ماهی قزل‌آلا گریل', 0.5, 4]] },
  { id: 'olvie-lavash-goje', meal: 'dinner', sane: { 'الویه': [2, 8], 'نان لواش': [0.5, 2], 'گوجه‌فرنگی': [0.5, 2] }, pairs: [] },
  { id: 'soopmorgh-tost', meal: 'dinner', sane: { 'سوپ مرغ': [1, 2.5], 'نان تست': [1, 3] }, pairs: [] },
  { id: 'ashreshte', meal: 'dinner', sane: { 'آش رشته (با کشک و پیاز داغ)': [1, 2.5] }, pairs: [] },
  { id: 'khorakloobia-nan', meal: 'dinner', sane: { 'خوراک لوبیا': [1, 2], 'نان سنگک': [0.5, 3] }, pairs: [] },
  { id: 'hamberger-tost-salad', meal: 'dinner', sane: { 'همبرگر خانگی': [1, 2], 'نان تست': [1, 3], 'سالاد کاهو و گوجه (بدون سس)': [0.5, 1.5] }, pairs: [] },
  { id: 'nan-panir-hendevane', meal: 'dinner', sane: { 'نان سنگک': [1, 3], 'پنیر سفید': [0.5, 2], 'هندوانه (خردشده)': [1, 3] }, pairs: [['نان سنگک', 'پنیر سفید', 1, 4]] },
  { id: 'mastchekide-khiar-nan', meal: 'dinner', sane: { 'ماست چکیده (یونانی)': [0.5, 1.5], 'خیار': [0.5, 2], 'نان سنگک': [0.5, 3] }, pairs: [] },
  { id: 'pizza-noshabe-rejimi', meal: 'dinner', sane: { 'پیتزا': [1, 3] }, pairs: [], also: ['نوشابه رژیمی'] },
  { id: 'sine-sabzijat', meal: 'dinner', sane: { 'سینه مرغ آب‌پز یا گریل': [0.5, 2.5], 'سبزیجات بخارپز': [0.5, 2.5] }, pairs: [] },

  // ---- snacks ----
  { id: 'sib-gerdoo', meal: 'snack1', sane: { 'سیب': [0.5, 2], 'گردو (مغز کامل)': [1, 5] }, pairs: [] },
  { id: 'khorma-gerdoo', meal: 'snack2', sane: { 'خرما': [1, 6], 'گردو (مغز کامل)': [1, 5] }, pairs: [] },
  { id: 'moz-shir', meal: 'snack1', sane: { 'موز': [0.5, 1.5], 'شیر کم‌چرب': [0.5, 1.5] }, pairs: [] },
  { id: 'badam', meal: 'snack2', sane: { 'بادام': [0.5, 1] }, pairs: [] },
  { id: 'porteghal', meal: 'snack1', sane: { 'پرتقال': [0.5, 2] }, pairs: [] },
  { id: 'chai-khorma', meal: 'snack2', sane: { 'خرما': [1, 5] }, pairs: [], also: ['چای با یک حبه قند'] },
  { id: 'chai-shirinikhoshk', meal: 'snack2', sane: { 'شیرینی خشک': [1, 3] }, pairs: [], also: ['چای با یک حبه قند'] },
  { id: 'biskuit-shir', meal: 'snack2', sane: { 'بیسکویت ساده': [2, 8], 'شیر کم‌چرب': [0.5, 1.5] }, pairs: [] },
  { id: 'kikyazdi-chai', meal: 'snack2', sane: { 'کیک یزدی': [0.5, 2] }, pairs: [], also: ['چای بدون قند'] },
  { id: 'peste', meal: 'snack2', sane: { 'پسته': [0.5, 1] }, pairs: [] },
  { id: 'hendevane', meal: 'snack2', sane: { 'هندوانه (خردشده)': [1, 4] }, pairs: [] },
  { id: 'mast-keshmesh', meal: 'snack1', sane: { 'ماست کم‌چرب': [0.5, 1.5], 'کشمش': [0.5, 3] }, pairs: [] },
];

// The foods of a plate, in order: the ones it judges, then drinks and the like.
export const plateFoods = p => [...Object.keys(p.sane), ...(p.also || [])];

/*
  Personal helpings (SAHM.md, measure 8): someone who has their own usual amounts, given a meal of
  exactly their usual plate's calories, should get those amounts back.
*/
export const PERSONAL = [
  { id: 'big-bread', meal: 'breakfast', usual: { 'نان سنگک': 3, 'پنیر سفید': 1.5, 'گردو (مغز کامل)': 4 } },
  { id: 'little-bread', meal: 'breakfast', usual: { 'نان بربری': 1, 'پنیر سفید': 1, 'گوجه‌فرنگی': 1, 'خیار': 1 } },
  { id: 'more-rice', meal: 'lunch', usual: { 'برنج سفید (کته یا چلو)': 2.5, 'قورمه‌سبزی (بدون روغن رو)': 1, 'ماست‌وخیار': 0.5 } },
  { id: 'more-stew', meal: 'lunch', usual: { 'برنج سفید (کته یا چلو)': 1, 'قیمه (بدون روغن رو)': 2, 'سالاد شیرازی (بدون روغن)': 1 } },
  { id: 'two-skewers', meal: 'lunch', usual: { 'برنج سفید (کته یا چلو)': 2, 'کباب کوبیده': 2 } },
  { id: 'three-eggs', meal: 'dinner', usual: { 'تخم‌مرغ آب‌پز': 3, 'نان سنگک': 1, 'خیار': 1 } },
  { id: 'soup-only', meal: 'dinner', usual: { 'سوپ جو': 2, 'نان سنگک': 1 } },
  { id: 'arde-heavy', meal: 'breakfast', usual: { 'نان لواش': 1, 'ارده': 2.5, 'عسل': 1 } },
  { id: 'apple-walnuts', meal: 'snack1', usual: { 'سیب': 1, 'گردو (مغز کامل)': 5 } },
  { id: 'dates', meal: 'snack2', usual: { 'خرما': 4, 'گردو (مغز کامل)': 2 } },
];
