# بازبینی بالینی «سهم وعده» (فاز ۷، SAHM.md)

۲۰۲۶-۱۱-۲۰. کاربر کارشناس تغذیه ندارد؛ به‌جایش چهار لایه (SAHM.md فاز ۷). این فایل جدول قاعده‌ها، منبع‌ها، نتیجه‌ی هر لایه و
آنچه عوض شد را نگه می‌دارد. تست‌ها: [tests/clinical.test.js](../tests/clinical.test.js) (هر عددی که از راهنما بیرون برود، رد می‌شود).

## لایه‌ی ۱: هر قاعده‌ی عددی و منبع‌هایش

| # | قاعده در اپ | کجا | منبع ۱ | منبع ۲ | نتیجه |
|---|---|---|---|---|---|
| ۱ | پروتئین روز در کاهش وزن: ۱٫۴ گرم بر کیلوی وزنِ BMI ۲۵ | `targets.js` `PROTEIN_PER_KG`، `refWeight` | فراتحلیل Clin Nutr ESPEN ۲۰۲۴: بیشتر از ۱٫۳ گرم بر کیلو عضله را نگه می‌دارد، کمتر از ۱ خطر | ISSN ۲۰۱۷ و مرورها: ۱٫۲ تا ۱٫۶؛ در چاقی وزن تعدیل‌شده به‌جای وزن واقعی (مرور Amsterdam UMC) | درست |
| ۲ | کم شدن کارکرد کلیه: سقف ۰٫۸ گرم بر کیلوی وزنِ BMI ۲۵ | `targets.js` `KIDNEY_PROTEIN_PER_KG` | KDIGO ۲۰۲۴ CKD: ۰٫۸ برای G3 تا G5 (2C)، بیشتر از ۱٫۳ نه | KDIGO ۲۰۲۲ دیابت و کلیه: ۰٫۸ (2C)؛ KDOQI ۲۰۲۰: ۰٫۵۵ تا ۰٫۶ (بی‌دیابت) و ۰٫۶ تا ۰٫۸ (دیابت) بر وزن ایده‌آل، **فقط زیر نظر**، روش وزن با قضاوت بالینی | درست؛ سخت‌تر از KDIGO نیست. نکته‌ی وزن پایین‌تر |
| ۳ | پروتئین هر وعده‌ی اصلی: سهمش از روز، ۱۵ تا ۴۰ گرم | `nutrients.js` `mealLimits` | ISSN ۲۰۱۷: ۲۰ تا ۴۰ گرم در یک وعده بیشترین اثر | Schoenfeld و Aragon ۲۰۱۸: حدود ۰٫۴ گرم بر کیلو در هر وعده | درست (۱۵ برای آدم‌های ریزنقش) |
| ۴ | هدف پروتئین وعده حداکثر یک‌چهارم کالری آن (`fitPlate`) | `fit.js` `proteinPart` | IOM: AMDR پروتئین ۱۰ تا ۳۵٪ کالری | — (تنظیم الگوریتم، درون AMDR) | درست |
| ۵ | دیابت و پیش‌دیابت: کربوهیدرات ۴۰٪ کالری، هر وعده همان سهم از کالری خودش | `nutrients.js` `CARB_SHARE`، `carbLimit` | ADA Standards: درصد ایده‌آل نیست؛ کم کردن کربوهیدرات بیشترین شاهد را برای قند خون دارد؛ پخش یکنواخت با انسولین ثابت | آموزش شمارش کربوهیدرات: ۳۰ تا ۶۰ گرم هر وعده برای زن، ۴۵ تا ۷۵ برای مرد، ۱۵ تا ۳۰ میان‌وعده؛ اپ در روزهای ۱۶۰۰ تا ۲۴۰۰ کالری ۴۰ تا ۷۲ و ۱۶ تا ۲۴ می‌دهد. (Diabetes Canada ۴۵ تا ۶۰٪ می‌گوید؛ اپ کمتر و درون ADA) | درست |
| ۶ | نمک ۵ گرم (سدیم ۲۰۰۰ میلی‌گرم) با فشار خون، قلب، کلیه، سنگ کلیه؛ هر وعده سهمش | `nutrients.js` `SALT_MAX_G`، `mealLimits` | WHO ۲۰۱۲ (تأیید دوباره ۲۰۲۵): کمتر از ۲ گرم سدیم برای همه‌ی بزرگسالان | KDIGO ۲۰۲۱ فشار خون در CKD و KDIGO ۲۰۲۴: کمتر از ۲ گرم (2C). AUA سنگ کلیه: کم کردن سدیم، بی‌عدد | درست |
| ۷ | سبزی و میوه: ۵ سهم ۸۰ گرمی (۴۰۰ گرم) | `quality.js` | WHO: دست‌کم ۴۰۰ گرم | راهنمای غذایی آمریکا بیشتر توصیه می‌کند (۴۰۰ کمینه است) | درست |
| ۸ | قند افزوده کمتر از ۱۰٪ کالری | `quality.js` | WHO ۲۰۱۵ | DGA ۲۰۲۰ تا ۲۰۲۵ | درست |
| ۹ | رمضان: سحری ۴۰٪، افطار ۳۰٪، شام ۳۰٪؛ با دیابت، کلیه، سنگ کلیه یا نقرس یادداشت پزشک | `plan.js`، `today.js` | IDF-DAR ۲۰۲۱: کالری بین سحری و افطار (و ۱ تا ۲ میان‌وعده) پخش شود | درصد عددی در متن راهنما پیدا نشد | قرارداد اپ، با روح راهنما؛ یادداشت پزشک درست |
| ۱۰ | غذاهایی که هر بیماری کنار می‌گذارد (`AVOID`) | `health.js` | بازبینی ۲۰۲۶-۱۱-۱۳ با یک منبع برای هر کدام (ACR، ADA، ESC/EAS، EASL، AHA، DASH، AUA، KDIGO، AAD) | لایه‌ی ۳ | پایین‌تر |

**نکته‌ی وزن در قاعده‌ی ۲:** اپ برای همه وزنِ BMI ۲۵ را می‌گیرد. KDOQI وزن ایده‌آل می‌گوید و روشش را به پزشک یا کارشناس می‌سپارد؛ KDIGO
وزن را مشخص نمی‌کند و بیشتر از ۱٫۳ را نه می‌گوید. پس برای آدم چاق سقف کمتر از ۰٫۸ وزن واقعی است (مثل وزن تعدیل‌شده)، و برای کسی با BMI
کمتر از ۲۵ بیشتر از ۰٫۸ وزن واقعی (در BMI ۱۸ حدود ۱٫۱)، ولی تا BMI ۱۶ هیچ‌وقت بیشتر از ۱٫۳ نیست (تست). سقف کمتر برای آدم لاغر خطر
سوءتغذیه دارد که KDIGO از آن پرهیز می‌دهد. عدد پزشک خود آدم را می‌شود دستی گذاشت (`manualProtein`).

## لایه‌ی ۲: عددهای منتشرشده

منوهای نمونه‌ی DASH و بشقاب ADA به بشقاب‌های غذاهای اپ برگردانده **نشدند** (اندازه‌ها با پیمانه‌های ما جور نمی‌شد). به‌جایش عددهایی که
راهنماها برای یک وعده می‌دهند، روی روز مرجع، تست شدند ([tests/clinical.test.js](../tests/clinical.test.js)): کربوهیدرات هر وعده و میان‌وعده
با شمارش کربوهیدرات؛ جمع سهم پروتئین کلیه برابر سقف روز و بی‌هدف پروتئین؛ جمع سدیم وعده‌ها ۲۰۰۰؛ پروتئین هر وعده‌ی اصلی ۱۵ تا ۴۰ و
وعده‌ی کوچک بیشتر از ۳۵٪ کالری‌اش پروتئین نمی‌خواهد. همه سبز.

## لایه‌ی ۳: بازبین مستقل

(پایین‌تر، بعد از بازبینی.)

## لایه‌ی ۴: احتیاط

- اپ از هیچ راهنمایی سخت‌گیرتر نیست: سقف کلیه ۰٫۸ (نه ۰٫۵۵ تا ۰٫۶ KDOQI که فقط زیر نظر کارشناس است)، کربوهیدرات ۴۰٪ (نه کم‌کربوهیدرات زیر ۲۶٪).
- برنامه‌ی پزشک بالاتر از اپ: «کم شدن کارکرد کلیه (به تشخیص پزشک)»، عدد پروتئین دستی، یادداشت پزشک در رمضان، و هشدارهای داروی قند و بارداری (۲۰۲۶-۱۱-۱۳).

## منبع‌ها (پیوندهایی که در جست‌وجوی ۲۰۲۶-۱۱-۲۰ خوانده شد)

- KDIGO 2024 CKD: <https://www.guidelinecentral.com/guideline/25092>، <https://www.nephjc.com/news/kdigo-ckd-part2>، <https://kdigo.org/wp-content/uploads/2025/01/Key-Takeaways_KDIGO-2024-CKD-Guideline_People-Living-with-CKD.pdf>
- KDIGO 2022 دیابت و کلیه: <https://www.nursingcenter.com/getattachment/Clinical-Resources/Guideline-Summaries/Diabetes-and-Chronic-Kidney-Disease/Guideline-Summary_Diabetes-and-Chronic-Kidney-Disease_2022.pdf.aspx>، <https://diabetesonthenet.com/diabetes-primary-care/ada-kdigo-consensus-report>
- KDOQI 2020: <https://pmc.ncbi.nlm.nih.gov/articles/PMC8045140>، <https://pmc.ncbi.nlm.nih.gov/articles/PMC9303594>، <https://www.healio.com/news/nephrology/20200122/new-kdoqi-guidelines-offer-a-reset-on-nutrition>
- KDIGO 2021 فشار خون در CKD: <https://kdigo.org/wp-content/uploads/2021/03/Top-10-Takeaways-Clinicians-KDIGO-BP-Guideline.pdf>، <https://pmc.ncbi.nlm.nih.gov/articles/PMC8366157>
- WHO سدیم: <https://www.news-medical.net/news/20130131/Adults-should-consume-less-than-5-g-of-salt-and-at-least-3,510-mg-of-potassium-per-day-WHO.aspx>، <https://www.actiononsalt.org.uk/news/news/2025/2025-news-section/world-health-organisation-releases-guidelines-on-the-use-of-lower-sodium-salt-substitutes-.html>
- AUA سنگ کلیه: <https://www.auanet.org/guidelines/guidelines/kidney-stones-medical-mangement-guideline>
- ADA: <https://professional.diabetes.org/clinical-support/nutrition-wellness>، <https://diabetes.org/sites/default/files/2024-12/24.12.09-SOC%20release_FINAL.pdf>
- شمارش کربوهیدرات: <https://www.healthlinkbc.ca/healthwise/counting-carbohydrate-grams-or-servings>، <https://med.virginia.edu/vcdpe/wp-content/uploads/sites/287/2015/12/Basic-Carbohydrate-Counting.pdf>، <https://www.uhhospitals.org/services/clinical-nutrition-services/patient-resources/diet-information/carb-counting-nutrition-guide>
- پروتئین در کاهش وزن: <https://pubmed.ncbi.nlm.nih.gov/39002131/>، <https://pure.amsterdamumc.nl/ws/files/142148308/Protein-requirement-in-obesity.pdf>
- پروتئین هر وعده: <https://pubmed.ncbi.nlm.nih.gov/29497353/>، <https://link.springer.com/10.1186/s12970-017-0189-4>، <https://pmc.ncbi.nlm.nih.gov/articles/PMC4558471>
- AMDR و قند افزوده: <https://pmc.ncbi.nlm.nih.gov/articles/PMC5347101>، <https://www.dietaryguidelines.gov/top-10-things-you-need-know-about-dietary-guidelines-americans-2020-2025>
- IDF-DAR رمضان ۲۰۲۱: <https://idf.org/news-and-resources/resources/diabetes-and-ramadan-practical-guidelines-2021/>
