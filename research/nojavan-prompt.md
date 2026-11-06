# Research brief: making a weight-management / nutrition-tracking app safe and appropriate for a 16-year-old

## Who is asking and why

I'm building **TanAra**, a Persian-language (Iran) progressive web app for adults who want to lose weight and keep it off. It currently blocks anyone under 18 at sign-up. A **16-year-old** now wants to use it. Before I change anything, I need an evidence-based answer to:

1. **Should** a weight-focused app like this be offered to a 16-year-old at all, and under what conditions?
2. If yes, **what exactly must change**, feature by feature, so that it helps and does not harm?

Please do deep research and give me concrete, implementable recommendations, not general advice. Where the evidence is weak or experts disagree, say so plainly.

**About the teen:**
- **Girl, 16.** Height **170 cm**. Weight: not known yet, so I can't say whether she is in the healthy, overweight or obesity range. Please make every recommendation explicit for each BMI-for-age category.
- **Her goal:** to lose weight.
- **Medical:** no doctor has assessed her weight. She has **heartburn (likely reflux/GERD)**, and a doctor prescribed a medication whose name we don't remember (possibly a PPI such as omeprazole/pantoprazole, an H2 blocker like famotidine, or an antacid).
- **Eating and body image:** "ordinary" dissatisfaction with how her body looks, and episodes her family calls «پرخوری عصبی» (*"nervous/emotional overeating"*). In everyday Persian this usually means stress or emotional overeating, possibly binge-like episodes. It has **not** been clinically assessed, and we don't know whether there is any compensating behaviour (vomiting, fasting, laxatives).
- **Periods:** unknown whether they are regular.
- **Activity:** low; mostly sedentary.
- **Parents:** aware of and agree with her using the app.

**These details raise specific questions. Please treat them as central, not as side notes:**
- For a 16-year-old girl with emotional/binge-like overeating and body dissatisfaction, is a calorie-tracking, weight-loss app likely to help or to make the overeating worse (the restraint→binge cycle)? What does the evidence say? What should she use or do instead (e.g. a CBT-E or CBT-guided self-help approach for binge eating, adapted for adolescents, or family-based approaches)?
- How can the app tell ordinary emotional eating apart from **binge-eating disorder** or **bulimia nervosa**, and what should it do in each case? Must it insist on a clinical assessment first?
- What does reflux/GERD change: meal timing and size, late eating, trigger foods, and how weight relates to reflux? If the medication is a PPI, what are its effects on **iron, calcium, magnesium and B12** absorption, which already matter for a teenage girl?
- Because her periods are unknown: what should the app ask about menstrual regularity, and how should it react to missed or irregular periods (RED-S / low energy availability)?

## What the app does today (all designed for adults)

- **Calorie target:** Mifflin–St Jeor BMR × activity factor = TDEE, minus a fixed deficit. The target never goes below a "safe floor" of 1200 kcal (female) / 1500 kcal (male). Later, the app replaces the formula with the person's measured TDEE (from logged intake vs. weight trend).
- **Protein target:** 1.4 g × the weight at which BMI = 25 for their height.
- **Phases:** weight loss → 2-week "diet breaks" at maintenance → maintenance with a weight band and a gradual +150 kcal/week ramp up.
- **Goal weight** chosen by the user; a full-screen confetti celebration when the 7-day average reaches it.
- **Tracking:** food logging (text, barcode, nutrition-label photo, AI meal-photo estimation), daily calorie/protein totals, frequent weighing with 7-day averages and 4-week rate of loss, waist circumference, activity minutes (150–300 min/week goal).
- **AI assistant (Claude via API):** chat that sees all logged data, daily nutrition tips, weekly reviews, AI-generated diet plans built from the person's usual foods, recipes, a magazine of articles, "back on track" check-ins after lapses, plans for occasions (Nowruz, Ramadan, Yalda).
- **Motivation & gamification:** a mascot with pre-written encouraging lines and voice, logging streaks (3, 7, 14… days), motivation photos/events, push reminders.
- **Existing safety rules:** the AI never goes below the calorie floor, never suggests crash diets, long fasts, or diet pills; refers to a doctor for rapid loss, multi-day under-eating, illness/medication, or warning signs (dizziness, weakness, palpitations, hair loss). An onboarding question about possible eating-disorder history switches the app to a "care" mode: no celebration, no streak or scale talk from the mascot, tips about healthy eating without restriction.

## Questions to research

### A. Should it be offered at all?
1. What do major guidelines say about weight management, calorie counting, and dieting in adolescents (~15–17)? Cover at least: **AAP 2023 Clinical Practice Guideline on obesity**, **AAP 2016 "Preventing Obesity and Eating Disorders in Adolescents"**, **WHO**, **NICE (UK)**, **Endocrine Society**, **USPSTF**, and anything relevant from **Iran's Ministry of Health**. Where do they agree and disagree?
2. What does the evidence say about **self-monitoring apps, calorie counting, and frequent self-weighing in teens**: benefit for weight outcomes vs. risk of disordered eating? Separate RCTs from observational studies and note effect sizes.
3. At 16, how risky is **eating-disorder onset** (peak age, sex differences), and which app features are linked to higher risk? Which teens should **never** use a weight-loss mode?
4. How does the answer change by **BMI-for-age category** (underweight / healthy / overweight / obesity / severe obesity)? Is "lose weight" ever an appropriate goal for a healthy-weight 16-year-old?

### B. Energy, nutrition and growth
5. Is Mifflin–St Jeor valid for 16-year-olds? Which equations are recommended for adolescents (e.g. **IOM/NASEM 2023 DRI EER equations**, Schofield, Henry/Oxford)? Give the formulas with coefficients.
6. Is a calorie **deficit** ever appropriate for a 16-year-old? If so, how large, and what rate of weight change is safe? Or should the goal be **weight maintenance while growing** (BMI percentile falling as height increases)? Has growth (in height) usually finished at 16 for girls vs. boys, and how does that change the advice?
7. What minimums matter at this age: energy (is 1200/1500 kcal too low?), **protein (g/kg)**, **calcium, vitamin D, iron, zinc**, and in girls the risk of **RED-S / missed periods**? What should trigger an immediate stop and referral?
8. How should "**weight status**" be measured and shown: **BMI-for-age percentile / z-score (WHO 2007 vs. CDC 2000/2022 extended)**? Is waist circumference or waist-to-height ratio useful in teens? Should the app show weight at all?
9. Specific cases: a teen who wants to **build muscle / play sports**, or **Ramadan fasting** at 16 (rulings aside, what is medically sensible?).

### C. Feature-by-feature verdict
For each feature listed above, say **keep as is / change / hide / remove** for a 16-year-old, with the reason and a source. Specifically:
- calorie targets and the daily calorie number on the home screen
- goal weight and the goal-reached celebration
- weighing frequency (daily? weekly? monthly? hidden?) and rate-of-loss charts
- AI meal-photo calorie estimates and barcode calorie lookup
- streaks, mascot praise, push reminders
- the AI assistant: what topics must it avoid, what tone, what red flags must it detect, and what it must say when it detects them
- AI diet plans and the weekly review
- the "back on track" check-ins after a lapse
- the magazine/tips: which topics are appropriate for teens?

### D. Family, consent, privacy and law
10. Is **parental consent or involvement** recommended or required (clinically and legally)? What does family-based treatment research say about involving parents vs. teen autonomy at 16?
11. Privacy and legal rules for collecting **health data from a 16-year-old**: GDPR Art. 8 (age 13–16), COPPA (under 13, for contrast), UK Age Appropriate Design Code, Apple App Store / Google Play rules for health apps and minors, and any Iranian law. What must the app do differently (consent flow, data minimisation, what the AI provider may receive)?
12. How do established apps handle teens? Look at **Kurbo by WW** (and the criticism and FTC settlement in 2022), **Noom** (age limit), **MyFitnessPal** (13+), **Lose It!**, **Yazio**, and any teen-specific or pediatric-clinic apps. What worked, what backfired?

### E. Mental health and red flags
13. Which **validated screening questions** for disordered eating are suitable for teens inside an app (e.g. **SCOFF**, **EAT-26**, **ChEAT**, **BEDS-7**)? Their sensitivity/specificity at this age, and how should an app act on a positive screen?
14. What **language and framing** is recommended for teens (weight-neutral, health-focused, non-stigmatising)? Give example phrases to use and to avoid, ideally from published guidance.
15. Where should a teen in Iran be referred (types of specialists, any national helplines)?

## What I want back

1. **A one-paragraph bottom line** first: should I offer a teen mode, and if so, the safest version.
2. A **decision rule** I can code: e.g. "age 16–17 + BMI-for-age percentile X → mode Y; requires Z".
3. The **feature table** from section C (feature · verdict · what exactly to change · source).
4. **Formulas and numbers** I can put straight into code (energy equation, minimums, safe rate of change, weighing frequency, percentile thresholds), each with its source.
5. **AI assistant rules** for teens: a list of must / must-not rules I can paste into the system prompt, plus red-flag triggers and the exact response for each.
6. **Consent and privacy requirements**.
7. **Open questions and uncertainties**, and anything I should ask a pediatrician before launching.
8. A **source list** with links, preferring guidelines, systematic reviews and RCTs from the last 10 years; flag anything older or low quality.

Write the report in **Persian**, keeping technical terms, formulas and source titles in English. Please don't pad it; precise and sourced beats long.
