# «مصرف واقعی بدن»: the scientific review (2026-11-23)

The user asked (2026-11-23) to make sure this part is scientifically right and its algorithm accurate
enough to rely on, «نه یه داده الکی». What was checked, what was found, what changed. Code:
`js/domain/energy.js`; tests: `tests/energy.test.js`; simulation: `tests/energy-sim.js` and
`node tools/energy-eval.mjs`.

## The method

Energy used = energy eaten − energy stored, with the stores read from the weight trend. This is the
"intake-balance" method; with measured intake and body composition it agrees with doubly labelled
water within a few percent (e.g. [validation of an intake-balance method](https://pubmed.ncbi.nlm.nih.gov/28651559/),
[PMC5486561](https://pmc.ncbi.nlm.nih.gov/articles/PMC5486561)). The app's intake is the
member's own log, so the result is in their own logging units: a steady habit of under-logging
moves the result and the target together. That part was right and stays.

## What was found and changed

1. **Today's weigh-in didn't count** (fixed earlier the same day, commit cf5e716), and six weekly
   weigh-ins in six weeks kept the card asking for «one more». Weigh-ins now count up to today and six
   weeks need five.
2. **7700 kcal per kg for everyone.** A kg of weight change is part fat (39.5 MJ = 9440 kcal/kg) and
   part lean tissue (7.6 MJ = 1816 kcal/kg), and the lean share is larger the less body fat there is
   (Forbes; [Hall, Int J Obes 2008](https://pubmed.ncbi.nlm.nih.gov/17848938/)). Now: body fat from BMI,
   age and sex (Deurenberg 1991; the children's equation under 16), lean share = 10.4 / (10.4 + fat kg),
   energy per kg from that. About 8000 kcal for a body with much fat, about 6200 for a lean one.
3. **No measure of how sure the result is.** The slope of a few weigh-ins carries the day-to-day swing
   of body weight, about 0.5% of it as one SD ([Khosla & Billewicz 1964](https://www.cambridge.org/core/services/aop-cambridge-core/content/view/4E78A0DB251133BEF39D73EB50C2F8A2/S0007114564000228a.pdf/div-class-title-measurement-of-change-in-body-weight-div.pdf);
   more with weighing at different times of day). Now the standard error of the slope comes from the
   scatter around the line (never below 0.5%), plus the error of the mean of the logged days and 7% on
   the energy per kg. The card shows the 95% range (`± …`).
4. **The formula was used only as a hard 25% bound.** Now measurement and formula are combined by
   precision weighting: the formula counts as ±15% (Mifflin-St Jeor is within 10% of measured resting
   energy for 70–80% of people, Frankenfield 2005; the activity factor and unlogged food add to it).
   Noisy or short data stays nearer the formula; good data is almost all measurement. The hard bound is
   now 30% (with ±20% formula error, 25% cut off real metabolisms in the simulation).
5. **A new target was offered at any 100 kcal difference**, even inside the measurement's own error.
   Now the difference must be at least 100 and at least half the ± (one SD).

## The simulation (`node tools/energy-eval.mjs`, 2000 people a case)

People with a known true energy use, eating with a 25% daily swing, logging 85–100% of what they eat,
weigh-ins off by 0.4–1% of body weight. Error in kcal/day (median / 90th percentile); «in ±» is how
often the truth is inside the range shown (it should be about 95%).

| case | formula | before | now | in ± |
|---|---|---|---|---|
| weighs every 7–9 days, logs 75% of days | 219 / 537 | 121 / 304 | 104 / 275 | 94% |
| weighs every 2–3 days | 213 / 515 | 132 / 326 | 113 / 286 | 96% |
| logs only half the days | 219 / 537 | 126 / 309 | 105 / 273 | 95% |
| a fifth of logged days miss a meal | 219 / 537 | 126 / 324 | 112 / 295 | 92% |
| formula further off (±20%) | 315 / 783 | 133 / 349 | 125 / 356 | 87% |
| weekly, six weeks after starting | 208 / 525 | 134 / 337 | 116 / 300 | 94% |

`tests/energy.test.js` fails if the new way falls behind the old one or the formula, or the ± stops
holding the truth about 95% of the time.

## What it still cannot know

- **Days logged as full that weren't.** A day with two meals counts as full unless the member marked
  it «ثبت ناقص». A missed meal on such a day makes the body look hungrier than it is (lower result).
  On one real log (2026-11-23) counting only days with three meals or more raised the raw figure by
  about 10%, so this is the largest remaining source of error. The «ثبت کامل / ناقص» marks
  fix it; the two-meal rule is shared with the under-eating check and was not changed.
- **Weighing at different times of day** adds noise (up to 1–2 kg in a day); it shows as a wider ±.
- The figures of the simulation are assumptions (the 12% spread of true use around the formula, the 7%
  on the energy per kg); the sources above support their size, not their exact value.
