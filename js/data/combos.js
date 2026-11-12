/*
  Starter meal combinations for the single meal screen (beta «یکی»): foods only, never amounts —
  the app fits the amounts to what the meal has left (fitMeal in domain/portion.js). Foods are
  the starter bank's exact names; a combo whose food is no longer in someone's bank is skipped.
  A first set, to be widened later. `meals`: where it is offered.
*/
const BREAD = 'نان سنگک', BARBARI = 'نان بربری', LAVASH = 'نان لواش', TOAST = 'نان تست';
const RICE = 'برنج سفید (کته یا چلو)', OIL = 'روغن خورش / غذا';
const TEA = 'چای بدون قند', CHEESE = 'پنیر سفید', TOMATO = 'گوجه‌فرنگی', CUCUMBER = 'خیار';
const HERBS = 'سبزی خوردن', SHIRAZI = 'سالاد شیرازی (بدون روغن)', LETTUCE = 'سالاد کاهو و گوجه (بدون سس)';
const YOGURT = 'ماست کم‌چرب', DOOGH = 'دوغ', MILK = 'شیر کم‌چرب', GREEK = 'ماست چکیده (یونانی)';
const B = ['breakfast'], S = ['snack'], L = ['lunch'], D = ['dinner'], LD = ['lunch', 'dinner'];

export const COMBOS = [
  // صبحانه
  { id: 'b-cheese-tomato', meals: B, name: 'نان و پنیر و گوجه', foods: [BREAD, CHEESE, TOMATO, CUCUMBER, TEA] },
  { id: 'b-cheese-walnut', meals: B, name: 'نان و پنیر و گردو', foods: [BARBARI, CHEESE, 'گردو (مغز کامل)', TEA] },
  { id: 'b-cheese-herbs', meals: B, name: 'نان و پنیر و سبزی', foods: [BREAD, CHEESE, HERBS, TEA] },
  { id: 'b-egg', meals: B, name: 'تخم‌مرغ آب‌پز و نان', foods: ['تخم‌مرغ آب‌پز', BREAD, TOMATO, TEA] },
  { id: 'b-fried-egg', meals: B, name: 'نیمرو', foods: ['نیمرو', BREAD, TOMATO, TEA] },
  { id: 'b-omelette', meals: [...B, ...D], name: 'املت', foods: ['املت گوجه (۲ تخم‌مرغ)', BREAD, CUCUMBER] },
  { id: 'b-ardeh-date', meals: B, name: 'نان و ارده و خرما', foods: [BREAD, 'ارده', 'خرما', TEA] },
  { id: 'b-peanut-banana', meals: B, name: 'نان تست و کره بادام‌زمینی و موز', foods: [TOAST, 'کره بادام‌زمینی', 'موز', MILK] },
  { id: 'b-greek-banana', meals: B, name: 'ماست یونانی و موز و گردو', foods: [GREEK, 'موز', 'گردو (مغز کامل)'] },
  { id: 'b-butter-honey', meals: B, name: 'نان و کره و عسل', foods: [TOAST, 'کره', 'عسل', MILK] },
  { id: 'b-cream-honey', meals: B, name: 'نان و خامه و عسل', foods: [BARBARI, 'خامه صبحانه', 'عسل', TEA] },
  { id: 'b-jam-cheese', meals: B, name: 'نان و پنیر و مربا', foods: [BARBARI, CHEESE, 'مربا', TEA] },
  { id: 'b-halim', meals: B, name: 'حلیم', foods: ['حلیم (با شکر)', TEA] },
  { id: 'b-adasi', meals: [...B, ...D], name: 'عدسی و نان', foods: ['عدسی', BREAD, HERBS] },
  { id: 'b-cheese-melon', meals: [...B, ...D], name: 'نان و پنیر و هندوانه', foods: [LAVASH, CHEESE, 'هندوانه (خردشده)'] },

  // ناهار و شام
  { id: 'l-ghormeh', meals: LD, name: 'چلو قورمه‌سبزی', foods: [RICE, 'قورمه‌سبزی (بدون روغن رو)', OIL, SHIRAZI] },
  { id: 'l-gheymeh', meals: LD, name: 'چلو قیمه', foods: [RICE, 'قیمه (بدون روغن رو)', OIL, SHIRAZI] },
  { id: 'l-bademjan', meals: LD, name: 'چلو خورش بادمجان', foods: [RICE, 'خورش بادمجان (بدون روغن رو)', OIL, LETTUCE] },
  { id: 'l-karafs', meals: LD, name: 'چلو خورش کرفس', foods: [RICE, 'خورش کرفس (بدون روغن رو)', OIL, YOGURT] },
  { id: 'l-bamieh', meals: LD, name: 'چلو خورش بامیه', foods: [RICE, 'خورش بامیه (بدون روغن رو)', OIL, HERBS] },
  { id: 'l-fesenjan', meals: LD, name: 'چلو فسنجان', foods: [RICE, 'فسنجان', SHIRAZI] },
  { id: 'l-koobideh', meals: LD, name: 'چلوکباب کوبیده', foods: [RICE, 'کباب کوبیده', TOMATO, DOOGH] },
  { id: 'l-joojeh', meals: LD, name: 'چلوجوجه', foods: [RICE, 'جوجه‌کباب', TOMATO, SHIRAZI] },
  { id: 'l-barg', meals: LD, name: 'چلوکباب برگ', foods: [RICE, 'کباب برگ', TOMATO, HERBS] },
  { id: 'l-loobia-polo', meals: LD, name: 'لوبیاپلو', foods: ['لوبیاپلو', YOGURT, SHIRAZI] },
  { id: 'l-adas-polo', meals: LD, name: 'عدس‌پلو', foods: ['عدس‌پلو', YOGURT, HERBS] },
  { id: 'l-baghali', meals: LD, name: 'باقالی‌پلو با مرغ', foods: ['باقالی‌پلو', 'ران مرغ پخته', YOGURT] },
  { id: 'l-sabzi-mahi', meals: LD, name: 'سبزی‌پلو با ماهی', foods: ['سبزی‌پلو', 'ماهی قزل‌آلا گریل', LETTUCE] },
  { id: 'l-macaroni', meals: LD, name: 'ماکارونی', foods: ['ماکارونی با گوشت', LETTUCE, YOGURT] },
  { id: 'l-abgoosht', meals: L, name: 'آبگوشت', foods: ['آبگوشت با گوشت‌کوبیده', BREAD, HERBS] },
  { id: 'l-chicken-rice', meals: LD, name: 'مرغ گریل و برنج', foods: ['سینه مرغ آب‌پز یا گریل', RICE, 'سبزیجات بخارپز'] },
  { id: 'l-dal', meals: LD, name: 'دال عدس و برنج', foods: ['دال عدس', RICE, YOGURT] },
  { id: 'd-kotlet', meals: LD, name: 'کتلت و نان', foods: ['کتلت', LAVASH, TOMATO, CUCUMBER] },
  { id: 'd-kuku', meals: LD, name: 'کوکو سبزی', foods: ['کوکو سبزی', LAVASH, YOGURT, HERBS] },
  { id: 'd-soup', meals: D, name: 'سوپ جو و نان', foods: ['سوپ جو', BREAD, LETTUCE] },
  { id: 'd-ash', meals: D, name: 'آش رشته', foods: ['آش رشته (با کشک و پیاز داغ)'] },
  { id: 'd-loobia', meals: D, name: 'خوراک لوبیا', foods: ['خوراک لوبیا', BREAD, HERBS] },
  { id: 'd-olivieh', meals: D, name: 'ساندویچ الویه', foods: ['الویه', LAVASH, TOMATO] },
  { id: 'd-trout', meals: D, name: 'ماهی قزل‌آلا و سبزیجات', foods: ['ماهی قزل‌آلا گریل', 'سبزیجات بخارپز', BREAD] },
  { id: 'd-joojeh-salad', meals: D, name: 'جوجه و سالاد', foods: ['جوجه‌کباب', LETTUCE, LAVASH] },
  { id: 'd-tuna', meals: D, name: 'تن ماهی و سالاد', foods: ['تن ماهی (روغن آبکش‌شده)', LETTUCE, TOAST] },
  { id: 'd-borani', meals: D, name: 'بورانی و نان', foods: ['بورانی اسفناج', BREAD, 'تخم‌مرغ آب‌پز'] },
  { id: 'd-mast-khiar', meals: D, name: 'ماست‌وخیار و نان', foods: ['ماست‌وخیار', BREAD, 'گردو (مغز کامل)'] },
  { id: 'd-burger', meals: D, name: 'همبرگر خانگی', foods: ['همبرگر خانگی', TOAST, TOMATO, CUCUMBER] },

  // میان‌وعده
  { id: 's-apple-walnut', meals: S, name: 'سیب و گردو', foods: ['سیب', 'گردو (مغز کامل)'] },
  { id: 's-banana-milk', meals: S, name: 'موز و شیر', foods: ['موز', MILK] },
  { id: 's-orange-almond', meals: S, name: 'پرتقال و بادام', foods: ['پرتقال', 'بادام'] },
  { id: 's-date-milk', meals: S, name: 'خرما و شیر', foods: ['خرما', MILK] },
  { id: 's-biscuit-tea', meals: S, name: 'بیسکویت و چای', foods: ['بیسکویت ساده', TEA] },
  { id: 's-yogurt-kiwi', meals: S, name: 'ماست و کیوی', foods: [YOGURT, 'کیوی'] },
  { id: 's-bread-cheese', meals: S, name: 'لقمه نان و پنیر و خیار', foods: [LAVASH, CHEESE, CUCUMBER] },
  { id: 's-pistachio-tangerine', meals: S, name: 'پسته و نارنگی', foods: ['پسته', 'نارنگی'] },
  { id: 's-melon-cheese', meals: S, name: 'هندوانه و پنیر', foods: ['هندوانه (خردشده)', CHEESE] },
  { id: 's-raisin-walnut', meals: S, name: 'کشمش و گردو', foods: ['کشمش', 'گردو (مغز کامل)'] },
  { id: 's-egg-cucumber', meals: S, name: 'تخم‌مرغ و خیار', foods: ['تخم‌مرغ آب‌پز', CUCUMBER] },
  { id: 's-grape-cheese', meals: S, name: 'انگور و پنیر', foods: ['انگور', CHEESE] },
  { id: 's-greek-honey', meals: S, name: 'ماست یونانی و عسل', foods: [GREEK, 'عسل'] },
  { id: 's-mast-khiar', meals: S, name: 'ماست‌وخیار', foods: ['ماست‌وخیار'] },
  { id: 's-cookie-tea', meals: S, name: 'شیرینی و چای', foods: ['شیرینی خشک', TEA] },
];
