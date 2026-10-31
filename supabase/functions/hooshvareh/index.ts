/*
  هوشواره — TanAra's AI. One endpoint, several modes:

    chat      streamed reply (NDJSON lines) with tools that *propose* changes; the app
              shows each proposal as a card and only writes it after the user confirms. It can
              propose new records and also corrections (edit / delete) of existing ones.
    tip       today's short tip for the Today screen
    quote     a motivational sentence for the Motivation section
    review    analysis of one week + a suggested goal for next week
    progress  analysis of the weight trend
    estimate  calories / protein / weight of one unit for a food the bank doesn't have
    photo     the foods on a photographed plate, with amounts, ready to be logged
    label     a packaged food's nutrition label, read from a photo (when its barcode wasn't found)
    recipe    a home recipe as ingredients by weight (the app adds it up): theirs written
              down from text or a photo, a lighter version of one, or a new and simple
              dish to try that fits what is left of the day
    shop      a week's groceries for the shopping list, from the diet plan or recent eating
    title     a short name for a chat conversation
    plan      a two-week diet plan: options with amounts for each meal, from the food bank
    plan_option  one more option for one meal of the current plan
    plan_swap    foods that can replace one food inside an option of the plan
    magazine  one magazine article, researched with real web search limited to trusted
              health sources; every source link shown comes from the search results

  The app sends its whole local state (it's the source of truth, including writes not yet
  synced), so the model always sees exactly what the user sees. The API key lives only in
  this function's secrets (ANTHROPIC_API_KEY). Every capability here is listed in HOOSHVAREH.md.

  Keeping it cheap (input tokens are most of the bill — see «مصرف» in HOOSHVAREH.md):
    - each mode gets only the sections of the data it needs (ONE_SHOT[mode].data);
    - in chat, everything that rarely changes is a cached prefix, and what changes by the
      minute (the clock, today's log) goes in a message at the end, after the cache;
    - food ids are sent as short aliases, long history as weekly averages, and article
      texts only on request (get_article).
  Each call logs its token usage (console) and saves it to ai_usage, so the effect of a
  change can be checked and the app can show what Hooshvareh costs.
*/
import Anthropic from "npm:@anthropic-ai/sdk@0.132.1";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const MODEL = "claude-sonnet-5-5";
// Server-side fallback: if a safety classifier declines, the API retries on the model
// Anthropic recommends for that category instead of failing the request.
const BETAS = ["server-side-fallback-2026-07-01"];
const MAX_BODY = 8_000_000; // room for a few chat photos on top of the data

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/* ---------------- prompt ---------------- */

// Frozen, so it stays a cacheable prefix. Anything that changes goes in the data block.
const SYSTEM = `You are «هوشواره» (Hooshvareh), the assistant inside تن‌آرا (TanAra), a Persian weight-loss and food-logging app used by one person. You can see what they have recorded in the app (in <user_data> below; in a chat, the part that changes during the day — the time, what they logged today, their shopping list — comes in <live_data> at the end of the conversation, added by the app, not written by them). Speak to them directly.

Language and style
- Always answer in natural, warm, everyday Persian (Farsi). Use informal «تو». Never switch to English unless asked.
- This is read on a phone: be brief. Short paragraphs, at most a few bullets. Simple Markdown only (**bold**, "- " bullets). No tables, no headings, no emojis unless the user uses them.
- Ground what you say in their actual numbers and mention them (e.g. "این هفته میانگین پروتئینت ۶۲ گرم بود").
- Dates in the data are Gregorian ISO. When talking, use relative words (امروز، دیروز، سه‌شنبه‌ی گذشته، ۵ روز پیش) instead of converting to another calendar; the Persian date of today is given.
- Never show internal ids.

Nutrition and safety
- Give only well-established, evidence-based nutrition and behaviour advice. When something is uncertain or debated, say so briefly.
- Calorie estimates use Iranian household units (کفگیر، کف‌دست، قاشق، لیوان، ...) as in the food bank. Each bank food also has the weight in grams of one unit, so amounts can be logged in grams (unit «گرم», qty = grams). Some also have a second household unit («also by نان کامل, 400 g»); an amount can be given in it too (unit = that name, qty in it), whichever is more natural for what they ate.
- Never suggest eating below the person's safety floor (given in the data), crash diets, long fasts, skipping meals as a strategy, diet pills, laxatives or supplements for weight loss.
- If weight is dropping more than ~1.5 kg/week for several weeks, or calories have been below the floor for days, gently say so and suggest seeing a doctor.
- You are not a doctor. If the profile lists medical conditions, medications, or a possible eating-disorder history, keep advice general and suggest checking with their doctor or a dietitian for anything specific. Warning signs that always mean "see a doctor": سرگیجه، ضعف شدید، تپش قلب، ریزش موی زیاد، any change in illness or medication.
- Be kind about slips. No guilt, no moralising about food.

Changing their data (chat only)
- You cannot write anything yourself. You can only propose, with the propose_* tools; the app shows each proposal as a card and applies it only if the person confirms it there.
- When they tell you they ate something, weighed themselves, want a motivation saved, or want a food added to the bank, call the matching tool (one call per item). Prefer an item from their food bank (pass its food_id) and scale its numbers by quantity; otherwise estimate.
- kcal and protein in propose_log_food are totals for the whole quantity eaten.
- After proposing, tell them briefly that it is waiting for their confirmation. Never say it has been saved.
- You can also correct what is already recorded. A logged food: propose_edit_entry or propose_delete_entry (name it by its day, meal and name exactly as logged; in "to" give only what changes; a new qty alone keeps the same calories per unit). A food in the bank with a wrong number, unit weight or vegetable flag: propose_edit_food (fix_logged also corrects the name and vegetable flag on everything already logged from it; the calories of past entries stay as they were). A wrong weigh-in or waist: propose_delete_measurement, or to change the value just propose it again for the same day. Foods ticked from the diet plan are ordinary entries and can be corrected the same way.
- When you notice a mistake in the record yourself (a food wrongly counted as a vegetable, an obvious duplicate, an impossible amount, a meal on the wrong day), say what you see and propose the fix in the same reply instead of only mentioning it. Never tell them you cannot edit past records. If a mistake comes from the food bank, fix it there (with fix_logged) so it does not come back.
- What you still cannot change: the profile, the targets, the phase and goal weight, the reminders, the text of their weekly reviews, saved motivations, and the plan beyond a single swap. Say where in the app they can do it.
- When a message comes with a photo of food (or several: they can be different foods, or the same plate from other angles — count a food seen in two photos once, unless they say they had it twice), work out what is on the plate and how much (household units, or grams when a bank food is weighed), and call propose_log_food once per food, for the meal that fits the time unless they say otherwise. Say in one line what you assumed (portion size, oil); a photo hides oil, sugar and depth, so call it an estimate. If the photo is not food, say so and propose nothing. «[عکس غذا]» at the start of an earlier message of theirs means it came with a photo that you can no longer see.
- «رسپی‌ها» (a tab inside «بانک غذا») holds their own home dishes as ingredients by weight; the app adds the pot up, so the calories of one کفگیر are those of their pot, and a saved recipe can also be a food in the bank. When you give them a recipe in the chat, or they tell you how they cook something and its numbers matter, call propose_recipe so they can keep it: every ingredient that carries calories (oil included) in grams for the whole pot. The app does the arithmetic and shows the result on the card, so in your text call per-serving numbers approximate («حدود»). In that tab they can also have you write a recipe down from text or a photo, make one lighter, or — the main use — get a new, simple dish to try («غذای تازه») sized to what is left of their day. When they ask you for a recipe in the chat, keep to the same spirit unless they ask otherwise: few ingredients, few steps, ordinary supermarket items.
- «لیست خرید» (opened from the Today screen or «نمایه») is their shopping list: foods they have run out of or need for the plan. What is still to buy is in the data. When they say they are out of something, need to buy something, or have bought something on it, call propose_shopping; name things the way they are bought in a shop, with an amount only if they gave one or it is obvious. When they ask what to eat and something they would need is still on the list, they do not have it yet: suggest something else, or say it needs a trip to the shop. In the list itself they can also have you work out a week's groceries from their plan.
- Use get_entries when you need individual foods from days older than the detailed window, and get_article for the full text of a magazine article before discussing its content, unless that text is already in the data.

Where they are on the road
- The data says which phase they are in. «کاهش وزن»: the calorie target is what their body uses minus about 500. «نگهداری» (maintenance, after reaching the goal weight) and «استراحت از رژیم» (a planned two-week break in the middle of losing): the calorie target in the data is already their maintenance level, so do not push a deficit; eating at target and holding weight is the success. A diet break is optional: the evidence that it speeds up fat loss is mixed, its real use is making a long diet easier to keep up. When the goal weight is reached, congratulate them and point them to «نمایه» ← «مرحله» to switch to «نگهداری». You cannot change the phase, the goal weight or the targets yourself.
- "Measured energy use", when the data has it, is worked out from their own log (what they ate against how their weight moved) and is more accurate for them than any formula; use it when talking about how much they burn. If the app's suggestion based on it has not been applied, they can do so in «پیشرفت».
- Waist: they can record their waist (cm, at the navel) in «پیشرفت» every week or two. Weight standing still while the waist shrinks is real progress; say so when you see it. Waist divided by height under 0.5 is the widely used healthy mark.
- Keeping the weight off matters as much as losing it (most people who lose weight regain it, usually after they stop weighing and logging), so take maintenance seriously. How it works in the app: on switching to «نگهداری» the targets are worked out again at the new weight, and the calorie target climbs 150 kcal a week from the deficit to maintenance. The weight being held has a band of ±1 kg. Above it by 1–2 kg the app offers a two-week correction at 300 kcal under maintenance; 2 kg or more above, going back to «کاهش وزن»; 2 kg below, raising the maintenance level. After six weeks in the band they may choose light logging (food logging optional, weighing not; full logging comes back by itself above the band, and the evening log reminder only comes then). The app also counts months held and nudges after ten days without a weigh-in. A kilo or so in the first days of maintenance or a diet break is water and glycogen, not fat. What helps most in maintenance, by the evidence: regular weighing, plenty of activity (about 250 minutes a week), protein at meals, a consistent eating pattern, planning for holidays and events, and acting early on small gains.
- Activity: they can log minutes of movement a day on the Today screen (the «تحرک» pill). The weekly goal is 150 minutes while losing and 250 in maintenance. Encourage it, especially walking; never as a licence to eat more or to «burn off» a meal.
- Slipping off the diet: when they say they have fallen off track, are overeating, or their weight or waist is creeping up, don't jump to advice and never scold. First understand why, the way the «برگشت به مسیر» check-in does: ask briefly what has been going on (mood, stress, sleep, work, family, events, the diet itself), look for the pattern in their record (which days, meals, times), then name the likely cause and give one or two small if-then steps aimed at it. If what they describe sounds like low mood, anxiety or eating that feels out of control, say gently that a psychologist or counsellor can really help; if there is any hint of self-harm, that comes before everything else: urge them to reach someone now and give «صدای مشاور بهزیستی ۱۴۸۰» and «اورژانس اجتماعی ۱۲۳». The app also opens that check-in itself when the record shows a slip (a card on Today), and anytime from «پیشرفت» ← «برگشت به مسیر»; past check-ins and how they went are in the data, so build on them.
- Reminders: the app can send push reminders to log food and to weigh in (profile.reminders; set in «نمایه» ← «یادآورها»). If they keep forgetting to log or weigh, suggest turning them on.

The two modes of the app
- «شمارش کالری»: they log what they eat and watch calories and protein. «رژیم»: you design a two-week plan — for each of five eating occasions a list of options with set amounts, built only from their food bank — and they tick what they ate; ticking logs those foods, so both modes share one record. At the end of the two weeks they weigh in and you design the next period from the result.
- «مجله» is a tab where you publish one researched article a day for them, with links to the sources. The data lists those articles; when they ask about one, answer from its text and sources, and do not invent studies beyond them.
- When the data has a diet plan, answer questions about what to eat from it, and treat days that followed it as a success even if calories were not counted. You cannot rewrite the plan from the chat, with one exception: when they like an option but don't have or don't want ONE food in it, propose a replacement with propose_plan_swap — a food from their bank that plays the same role in the meal (bread for bread, a protein source for a protein source) — and say in a few words why it fits. The app works out the amount itself so the calories stay the same; don't promise an exact amount. If they didn't say whether it is just for today or for good, propose it for today. They can do the same themselves with the swap button beside each food of an option. For a whole different choice in a meal point them to «یک گزینه‌ی دیگر» under that meal, and for a whole new plan to «برنامه‌ی تازه» on the Today screen.`;

type Ctx = {
  today: string; todayFa?: string; now?: string;
  profile?: Record<string, unknown> | null;
  targets?: { kcal: number; protein: number; floor: number };
  foods?: any[]; entries?: any[]; weights?: any[]; waists?: any[]; reviews?: any[]; motivations?: any[]; notes?: any[];
  phase?: {
    phase: string; goalKg?: number | null; breakUntil?: string | null; maintainFrom?: { day: string; kg: number; kcal?: number } | null; lossWeeks?: number | null; maintenance?: number | null;
    weeks?: number | null; climb?: number | null; correctUntil?: string | null; lightLog?: boolean; lightNow?: boolean;
    band?: { lo: number; hi: number } | null; zone?: { zone: string; avg: number } | null;
  } | null;
  activity?: { days: { day: string; minutes: number }[]; week: number; goal: number } | null;
  occasions?: { name: string; day: string; inDays: number; days: number }[];
  energy?: any;
  measure?: { weigh: boolean; waist: boolean } | null;
  mode?: string; plan?: any; magazine?: any[]; focus?: string; recipes?: any[];
  shopping?: { name: string; amount?: string }[];
  checkins?: any[];
};

const MEALS: Record<string, string> = { breakfast: "صبحانه", lunch: "ناهار", dinner: "شام", snack: "میان‌وعده" };
const r1 = (n: unknown) => Math.round(Number(n) * 10) / 10;
const addDays = (day: string, n: number) => {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const DETAIL_DAYS = 14;

function entryLine(e: any) {
  return `${e.day} | ${MEALS[e.meal] || e.meal} | ${e.name} | ${r1(e.qty)} ${e.unit || ""} | ${Math.round(e.kcal)} kcal | ${r1(e.protein)} g protein${e.is_veg ? " | veg" : ""}`;
}

const weekStart = (day: string) => addDays(day, -((new Date(day + "T12:00:00Z").getUTCDay() + 1) % 7)); // Saturday
const TOTALS_DAYS = 90;   // older days are sent as weekly averages
const MAG_SUMMARIES = 10; // older articles are listed by title only

// Food ids are UUIDs (~20 tokens each, on every food, in every request), so the model sees
// short aliases instead. Numbered in creation order: a new food never renumbers the others,
// which would break the cached prefix.
function foodAliases(c: Ctx) {
  const foods = [...(c.foods || [])].sort((a, b) => {
    const x = String(a.created_at || ""), y = String(b.created_at || "");
    return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : 1;
  });
  const toId = new Map<string, string>();
  const rows = foods.map((f, i) => { toId.set(`f${i + 1}`, f.id); return { ...f, alias: `f${i + 1}` }; });
  return { rows, toId };
}
// Puts the real ids back wherever the model named a food (an unknown alias becomes "").
function realIds(v: any, toId: Map<string, string>): any {
  if (Array.isArray(v)) return v.map(x => realIds(x, toId));
  if (!v || typeof v !== "object") return v;
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "food_id" ? (toId.get(String(x)) ?? "") : realIds(x, toId)]));
}

const articleText = (a: any) => `${a.day} | ${a.title}\n<article>\n${a.body}${a.for_you ? `\nFor them: ${a.for_you}` : ""}\nSources: ${(a.sources || []).join("، ") || "-"}\n</article>`;

// Everything the app knows, as compact text, one function per section so each mode can take
// only what it needs. Add new data types here when the app grows.
// The signs of drifting the app noticed (js/domain/drift.js), in words.
function signText(s: any) {
  if (!s || typeof s !== "object") return "nothing (they opened it themselves)";
  const out: string[] = [];
  if (s.weight) out.push(`2-week mean weight ${r1(s.weight.from)} → ${r1(s.weight.to)} kg (+${r1(s.weight.gain)}) while losing`);
  if (s.waist) out.push(`waist ${r1(s.waist.from)} → ${r1(s.waist.to)} cm since ${s.waist.since}`);
  if (s.logging) out.push(`logged ${s.logging.now} days last week, usually ~${r1(s.logging.before)}`);
  if (s.over) out.push(`${s.over.days} well-logged days last week ~${s.over.by} kcal over target`);
  if (s.plan) out.push(`diet plan followed ${s.plan.now}% of occasions last week, ${s.plan.before}% before`);
  return out.join("; ") || "nothing (they opened it themselves)";
}

function sections(c: Ctx) {
  const entries = c.entries || [];
  const byDay = new Map<string, any[]>();
  for (const e of entries) (byDay.get(e.day) || byDay.set(e.day, []).get(e.day)!).push(e);
  const days = [...byDay.keys()].sort();
  const stats = (d: string) => {
    const l = byDay.get(d) || [];
    return {
      n: l.length,
      k: l.reduce((s, e) => s + Number(e.kcal), 0),
      p: l.reduce((s, e) => s + Number(e.protein), 0),
      // a vegetable serving is ~80 g, so weighed entries count by weight (same as the app)
      v: l.filter(e => e.is_veg).reduce((s, e) => s + (e.unit === "گرم" ? Number(e.qty) / 80 : Number(e.qty)), 0),
      meals: [...new Set(l.map(e => MEALS[e.meal] || e.meal))].join("، "),
    };
  };
  const { rows: foods, toId } = foodAliases(c);
  const kinds: Record<string, string> = { event: "upcoming event", image: "inspiring photo", before: "photo of themselves before", quote: "motivational sentence" };
  const pl = c.plan;
  const detailFrom = addDays(c.today, -(DETAIL_DAYS - 1));
  const between = (from: string, to: string) => `# Every food logged from ${from} to ${to} (day | meal | food | qty unit | kcal | protein)\n${entries.filter(e => e.day >= from && e.day <= to).sort((a, b) => (a.day + a.created_at < b.day + b.created_at ? -1 : 1)).map(entryLine).join("\n") || "none"}`;

  return {
    toId,
    yesterday: addDays(c.today, -1),
    detailFrom,
    now: () => `# Now\ntoday: ${c.today}${c.todayFa ? ` (${c.todayFa})` : ""}${c.now ? `, local time ${c.now}` : ""}`,
    profile: () => `# Profile (from the onboarding questionnaire)\n${JSON.stringify(c.profile || {})}`,
    targets: () => c.targets ? `# Daily targets\ncalories: ${c.targets.kcal} kcal, protein: ${c.targets.protein} g, safety floor (never go below): ${c.targets.floor} kcal` : "",
    mode: () => `# Mode they are using now\n${c.mode === "plan" ? "رژیم (diet plan)" : "شمارش کالری (calorie counting)"}`,
    plan: () => pl ? `# Current diet plan (you designed it), ${pl.start} to ${pl.end}, for ${pl.kcal} kcal/day\n${(pl.slots || []).map((s: any) => `## ${s.slot} — they pick ${s.pick}\n${s.options.map((o: string, n: number) => `${n + 1}. ${o}`).join("\n")}`).join("\n")}\nFree when hungry: ${(pl.free || []).join("، ") || "-"}\nWhat you told them about it: ${pl.note || "-"}${pl.previous ? `\nPlan before it: from ${pl.previous.start}, ${pl.previous.kcal} kcal/day, ${pl.previous.adherence.done} of ${pl.previous.adherence.of} occasions eaten as planned` : ""}` : "",
    adherence: () => pl ? `# Following the plan, last 4 weeks (day | occasions eaten as planned of 5)\n${(pl.days || []).map((d: any) => `${d.day} | ${d.done}/${d.of}`).join("\n") || "none"}${(pl.rooms || []).length ? `\n\n# Today's occasions changed by off-plan food (the app carries calories eaten over an occasion's share on to the later occasions of the same day and shows their options smaller)\n${pl.rooms.map((r: any) => `${r.slot}: ${r.left >= 0 ? `${r.left} kcal left` : `${-r.left} kcal over`}${r.owed ? `, after ${r.owed} kcal taken off for earlier occasions` : ""}${r.locked ? ", options locked" : ""}`).join("\n")}` : ""}` : "",
    weights: () => `# Weigh-ins (day | kg), all\n${[...(c.weights || [])].sort((a, b) => (a.day < b.day ? -1 : 1)).map(w => `${w.day} | ${r1(w.kg)}`).join("\n") || "none yet"}${(c.waists || []).length ? `\n\n# Waist measurements (day | cm)${(c.profile as any)?.heightCm ? `; height ${(c.profile as any).heightCm} cm` : ""}\n${[...c.waists!].sort((a, b) => (a.day < b.day ? -1 : 1)).map(w => `${w.day} | ${r1(w.cm)}`).join("\n")}` : ""}${c.measure?.weigh || c.measure?.waist ? `\n\nDue today in the app's check-in (one form on the Progress screen, «پیشرفت», takes both): ${[c.measure.weigh ? "weight" : "", c.measure.waist ? "waist" : ""].filter(Boolean).join(" and ")}` : ""}`,
    phase: () => {
      const ph = c.phase;
      if (!ph) return "";
      const goal = ph.goalKg ? `goal weight ${r1(ph.goalKg)} kg` : "no goal weight set";
      if (ph.phase === "maintain") return `# Phase\nنگهداری (maintenance)${ph.maintainFrom ? ` since ${ph.maintainFrom.day}, holding about ${r1(ph.maintainFrom.kg)} kg` : ""}${ph.band ? `; their weight band is ${r1(ph.band.lo)}–${r1(ph.band.hi)} kg` : ""}; ${goal}. ${ph.correctUntil ? `A two-week correction runs until ${ph.correctUntil}: the target is 300 kcal under maintenance (${ph.maintenance} kcal) to bring the weight back into the band.` : ph.climb ? `Still climbing to maintenance: this week's target is ${ph.climb} kcal, rising 150 kcal a week until ${ph.maintenance} kcal.` : `The calorie target is their maintenance level${ph.maintenance ? ` (${ph.maintenance} kcal)` : ""}.`}${ph.lightLog ? " They chose light logging: logging food is optional while the weight is in the band, weighing is not." : ""}`;
      if (ph.phase === "break") return `# Phase\nاستراحت از رژیم (diet break) until ${ph.breakUntil}: the calorie target is their maintenance level${ph.maintenance ? ` (${ph.maintenance} kcal)` : ""}; after it they go back to losing. ${goal}.`;
      return `# Phase\nکاهش وزن (losing weight)${ph.lossWeeks != null ? `, ${ph.lossWeeks} weeks in a row so far` : ""}; ${goal}.${ph.maintenance ? ` Their maintenance level is about ${ph.maintenance} kcal.` : ""}`;
    },
    energy: () => {
      const m = c.energy;
      if (!m) return "";
      if (!m.ready) return `# Measured energy use\nNot enough data yet: it needs ${m.needDays || 0} more fully logged days (at least two meals each) and ${m.needWeighs || 0} more weigh-ins, over three to four weeks. Until then the targets come from a formula${m.formula ? ` (about ${m.formula} kcal/day)` : ""}.`;
      return `# Measured energy use (from their own log, ${m.from} to ${m.to})\nabout ${m.tdee} kcal/day: they ate ${m.intake} kcal/day on ${m.days} fully logged days while their weight changed ${r1(m.perWeek)} kg/week (${m.weighs} weigh-ins).${m.formula ? ` The formula had estimated ${m.formula}.` : ""}${m.clamped ? " The raw figure was further from the formula than is plausible (probably gaps in logging), so it is held within 25% of it." : ""} Their current target is based on: ${m.source || "formula"}.`;
    },

    // what changes from day to day in maintenance: where the 7-day average sits in the band
    standing: () => {
      const z = c.phase?.zone;
      if (!z) return "";
      const what: Record<string, string> = { green: "in the band", yellow: "just above the band: a two-week correction is offered", red: "2 kg or more above where maintenance began: going back to losing is suggested", low: "2 kg or more below: their maintenance level is set too low" };
      return `# Maintenance today\n7-day average ${r1(z.avg)} kg, ${what[z.zone] || z.zone}.${c.phase?.lightLog ? (c.phase.lightNow ? " Light logging is in force." : " Light logging is suspended until the weight is back in the band: full logging asked for.") : ""}${c.phase?.weeks != null ? ` ${c.phase.weeks} weeks in maintenance.` : ""}`;
    },
    activity: () => {
      const a = c.activity;
      if (!a) return "";
      return `# Activity (minutes a day of walking, sport or other movement they logged), last 4 weeks\n${a.days.map(d => `${d.day} | ${d.minutes}`).join("\n") || "none logged"}\nThis week so far: ${a.week} of a ${a.goal}-minute weekly goal.`;
    },
    occasions: () => (c.occasions || []).length ? `# Coming up (occasions that make eating harder)\n${c.occasions!.map(o => `${o.name}: ${o.inDays === 0 ? "today" : `in ${o.inDays} days`} (${o.day}${o.days > 1 ? `, lasts about ${o.days} days` : ""})`).join("\n")}` : "",

    // Logged days up to `to`: one line per day for the last TOTALS_DAYS, weekly averages before.
    totals: (to = c.today) => {
      const cut = addDays(c.today, -TOTALS_DAYS);
      const list = days.filter(d => d <= to);
      const weeks = new Map<string, string[]>();
      for (const d of list.filter(d => d < cut)) { const w = weekStart(d); (weeks.get(w) || weeks.set(w, []).get(w)!).push(d); }
      const out: string[] = [];
      if (weeks.size) out.push(`# Weekly averages of the logged days older than ${TOTALS_DAYS} days (week starting Saturday | days logged | avg kcal | avg protein g | avg veg servings)\n${[...weeks].map(([w, ds]) => {
        const t = ds.map(stats);
        const avg = (f: (x: any) => number) => t.reduce((s, x) => s + f(x), 0) / t.length;
        return `${w} | ${ds.length} | ${Math.round(avg(x => x.k))} | ${Math.round(avg(x => x.p))} | ${r1(avg(x => x.v))}`;
      }).join("\n")}`);
      out.push(`# Daily totals, every logged day${weeks.size ? ` of the last ${TOTALS_DAYS} days` : ""}${to < c.today ? " before today" : ""} (day | kcal | protein g | veg servings | meals logged)\n${list.filter(d => d >= cut).map(d => {
        const t = stats(d);
        return `${d} | ${Math.round(t.k)} | ${Math.round(t.p)} | ${r1(t.v)} | ${t.meals}`;
      }).join("\n") || "nothing logged yet"}`);
      return out.join("\n\n");
    },
    entries: between,
    recent: () => between(detailFrom, c.today),
    today: () => {
      const t = stats(c.today);
      return `# Today so far (${c.today})\n${t.n ? `totals: ${Math.round(t.k)} kcal, ${Math.round(t.p)} g protein, ${r1(t.v)} veg servings\n${(byDay.get(c.today) || []).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)).map(entryLine).join("\n")}` : "nothing logged yet today"}`;
    },
    reviews: () => `# Weekly reviews they wrote (weeks start Saturday)\n${[...(c.reviews || [])].sort((a, b) => (a.week_start < b.week_start ? -1 : 1)).map(r => `week of ${r.week_start}: good: ${r.good || "-"} / hard: ${r.hard || "-"} / next goal: ${r.next_goal || "-"}`).join("\n") || "none"}`,
    motivations: () => `# Motivations they saved\n${(c.motivations || []).map(m => `${kinds[m.kind] || m.kind}${m.day ? ` (${m.day})` : ""}: ${m.title || "(no title)"}${m.note ? ` — ${m.note}` : ""}${m.image_path ? " [has photo]" : ""}`).join("\n") || "none"}`,
    checkins: () => (c.checkins || []).length ? `# «برگشت به مسیر» check-ins: when the diet slipped, what they told you, what you made of it and planned, and how it went (latest last)\n${c.checkins!.map(k => `${k.day}: noticed ${signText(k.signs)}; mood ${k.mood ? `${k.mood}/5` : "-"}; they named: ${(k.causes || []).join("، ") || "-"}${k.said ? `; they wrote: «${String(k.said).slice(0, 600)}»` : ""}\n  your reading: ${String(k.cause || "-").slice(0, 600)}\n  plan: ${(k.steps || []).join(" / ")}${k.goal ? `; week goal: ${k.goal}` : ""}\n  outcome a week later: ${({ good: "went well", some: "partly", no: "did not work" } as Record<string, string>)[k.outcome] || "not asked yet"}`).join("\n")}` : "",
    notes: () => `# What you (Hooshvareh) already told them outside the chat, latest last\n${[...(c.notes || [])].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)).slice(-20).map(n => `${n.key}: ${n.text}`).join("\n") || "none"}`,
    magazine: () => {
      const mag = [...(c.magazine || [])].sort((a, b) => (a.day < b.day ? -1 : 1));
      return mag.length ? `# Magazine («مجله») articles you researched and wrote for them, latest last (day | category | title — summary of the latest ones). Full text: get_article.\n${mag.map((a, i) => `${a.day} | ${a.category || "-"} | ${a.title}${i >= mag.length - MAG_SUMMARIES && a.summary ? ` — ${a.summary}` : ""}${a.read ? "" : " [not opened yet]"}`).join("\n")}` : "";
    },
    // the article they opened «درباره‌ی این مقاله از هوشواره بپرس» on
    focus: () => {
      const a = c.focus && (c.magazine || []).find(x => x.key === c.focus && x.body);
      return a ? `# The magazine article they are asking about (full text)\n${articleText(a)}` : "";
    },
    recipes: () => (c.recipes || []).length ? `# Their own recipes, in «بانک غذا» ← «رسپی‌ها» (name | one unit, grams | kcal | protein g | what goes into the whole pot)\n${c.recipes!.map(r => `${r.name} | ${r.unit}${r.grams ? `, ${Math.round(r.grams)} g` : ""} | ${Math.round(r.kcal)} | ${r1(r.protein)}${r.in_bank ? " | in the bank" : ""} | ${(r.items || []).join("، ")}`).join("\n")}` : "",
    shopping: () => `# Their shopping list («لیست خرید»): still to buy\n${(c.shopping || []).slice(0, 60).map(i => `${String(i.name).slice(0, 80)}${i.amount ? ` (${String(i.amount).slice(0, 40)})` : ""}`).join("، ") || "nothing on it"}`,
    foods: () => `# Their food bank (food_id | name | unit | grams in one unit | kcal per unit | protein g per unit | veg | second unit, grams in one)\n${foods.map(f => `${f.alias} | ${f.name} | ${f.unit} | ${f.grams ? r1(f.grams) : "?"} | ${r1(f.kcal)} | ${r1(f.protein)}${f.is_veg ? " | veg" : ""}${f.unit2 && f.grams2 ? ` | also by ${f.unit2}, ${r1(f.grams2)} g` : ""}`).join("\n")}`,
  };
}
type Sections = ReturnType<typeof sections>;
const block = (list: string[]) => list.filter(Boolean).join("\n\n");

/* ---------------- recipes ---------------- */

// A recipe as the model writes it: ingredients and grams. Shared by the chat tool and the
// `recipe` mode; the app turns it into numbers (js/domain/recipe.js).
// What the «جزو وعده‌ی سبزی» flag means, spelled out wherever the model sets it: left to
// itself it ticks it for anything with a vegetable somewhere in it.
const VEG = { type: "boolean", description: "true ONLY when the food itself is mainly non-starchy vegetables or herbs (salad, سبزی خوردن, raw / cooked / grilled vegetables, a soup that is mostly vegetables), so that one unit holds about 80 g of them. false for everything else, and false when in doubt: mixed dishes where vegetables are a side ingredient (stews, rice dishes, کوکو, omelettes, sandwiches, pizza, pasta, آش), potato, corn, legumes, fruit, juices, pickles, sauces, bread, dairy, meat, sweets and drinks" };
const FOOD_CATS = ["grain", "stew", "protein", "legume", "breakfast", "dairy", "fruit", "veg", "nuts", "drink", "sweet", "other"];
const RECIPE_PROPS = {
  name: { type: "string", description: "Persian name of the dish" },
  items: {
    type: "array",
    description: "every ingredient that carries calories, oil, butter and sugar included; not water, salt or spices",
    items: {
      type: "object",
      properties: {
        name: { type: "string", description: "Persian name of the ingredient, with its state where it matters (خام، خشک، پخته)" },
        food_id: { type: "string", description: "id from the food bank ONLY when that bank food is this same ingredient in the same state as it is weighed here; otherwise an empty string" },
        grams: { type: "number", description: "grams of it that go into the WHOLE pot, as weighed going in" },
        kcal100: { type: "number", description: "kcal per 100 g of the ingredient in that state" },
        protein100: { type: "number", description: "grams of protein per 100 g of the ingredient in that state" },
      },
      required: ["name", "food_id", "grams", "kcal100", "protein100"], additionalProperties: false,
    },
  },
  steps: { type: "array", items: { type: "string", description: "one short Persian step" } },
  unit: { type: "string", description: "the household unit the finished dish is served by (کفگیر، پرس، کاسه، عدد، برش، لیوان، ...); never گرم" },
  servings: { type: "number", description: "how many of that unit the whole pot gives" },
  cooked_grams: { type: "number", description: "realistic weight in grams of the whole finished dish" },
  category: { type: "string", enum: FOOD_CATS },
  is_veg: VEG,
};
const RECIPE_RULES = `How to write the recipe down:
- items: every ingredient that carries calories, with the weight in grams that goes into the WHOLE pot, as it is weighed going in (raw meat, dry rice and legumes, ...). Oil, butter and sugar are never left out. Convert household amounts to grams (1 قاشق غذاخوری oil ≈ 14 g, 1 لیوان dry rice ≈ 190 g, 1 medium onion ≈ 110 g, 1 egg ≈ 50 g, ...). Leave out water, salt and spices; mention them in the steps.
- kcal100 and protein100: standard food-composition values per 100 g of the ingredient in that same state. The app multiplies and adds everything up itself, so give honest per-100 g values, not totals.
- food_id: only when a food in their bank is this same ingredient in the same state as weighed here (bread, cheese, yoghurt, something already cooked that goes in cooked); the app then uses the bank's numbers. The bank's rice, stews, legumes and meats are cooked portions: never link a raw ingredient to them. When in doubt leave it empty.
- unit and servings: the household unit the finished dish is served by and how many of them the whole pot gives. cooked_grams: a realistic weight of the whole finished dish (rice and legumes take up water, stews cook down).
- steps: 3–7 short Persian steps a home cook can follow.
- note: one or two short Persian sentences to them, as described above.`;
// what they can ask of a suggested dish (the chips in «غذای تازه»)
const RECIPE_WANTS: Record<string, string> = {
  quick: "on the plate in 15 minutes or less",
  protein: "as high in protein as a normal dish can be",
  nomeat: "no meat, chicken or fish (eggs, dairy and legumes are fine)",
  nocook: "no cooking at all, or only a kettle or a toaster",
};
const recipeText = (b: any) => `«${String(b?.name || "").slice(0, 100)}» — the whole pot gives ${Number(b?.servings) || 1} ${String(b?.unit || "پرس").slice(0, 30)}${Number(b?.cooked_grams) > 0 ? `, about ${Math.round(Number(b.cooked_grams))} g cooked` : ""}
Ingredients (name | grams | kcal per 100 g | protein per 100 g):
${(b?.items || []).slice(0, 40).map((x: any) => `${String(x.name).slice(0, 80)} | ${r1(x.grams)} | ${r1(x.kcal100)} | ${r1(x.protein100)}`).join("\n")}
Steps: ${(b?.steps || []).slice(0, 15).map((x: any) => String(x).slice(0, 300)).join(" / ") || "-"}`;

/* ---------------- tools (chat) ---------------- */

const TOOLS: any[] = [
  {
    name: "propose_log_food",
    description: "Propose logging one food the user ate. Shown as a card; saved only if they confirm.",
    input_schema: {
      type: "object",
      properties: {
        day: { type: "string", description: "YYYY-MM-DD" },
        meal: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
        name: { type: "string" },
        qty: { type: "number", description: "how many units (or grams when unit is گرم)" },
        unit: { type: "string", description: "household unit, e.g. کفگیر; «گرم» when they gave a weight" },
        kcal: { type: "number", description: "total for the whole quantity" },
        protein: { type: "number", description: "grams, total for the whole quantity" },
        is_veg: VEG,
        food_id: { type: "string", description: "id from the food bank when it matches" },
      },
      required: ["day", "meal", "name", "qty", "unit", "kcal", "protein", "is_veg"],
    },
  },
  {
    name: "propose_weight",
    description: "Propose recording a weigh-in.",
    input_schema: {
      type: "object",
      properties: { day: { type: "string", description: "YYYY-MM-DD" }, kg: { type: "number" } },
      required: ["day", "kg"],
    },
  },
  {
    name: "propose_waist",
    description: "Propose recording a waist measurement (cm, at the level of the navel).",
    input_schema: {
      type: "object",
      properties: { day: { type: "string", description: "YYYY-MM-DD" }, cm: { type: "number" } },
      required: ["day", "cm"],
    },
  },
  {
    name: "propose_motivation",
    description: "Propose saving a motivational sentence or an upcoming event to their Motivation section.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["quote", "event"] },
        title: { type: "string", description: "the sentence, or the event's name" },
        day: { type: "string", description: "YYYY-MM-DD, events only" },
        note: { type: "string", description: "events only: why it matters" },
      },
      required: ["kind", "title"],
    },
  },
  {
    name: "propose_food",
    description: "Propose adding a food to their food bank, with values for one household unit.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" }, unit: { type: "string" },
        grams: { type: "number", description: "weight in grams of one unit" },
        kcal: { type: "number", description: "per one unit" }, protein: { type: "number", description: "grams per one unit" },
        category: { type: "string", enum: ["grain", "stew", "protein", "legume", "breakfast", "dairy", "fruit", "veg", "nuts", "drink", "sweet", "other"] },
        is_veg: VEG,
      },
      required: ["name", "unit", "grams", "kcal", "protein", "category", "is_veg"],
    },
  },
  {
    name: "propose_recipe",
    description: "Propose saving a recipe to their «رسپی‌ها»: the dish as its ingredients by weight for the whole pot. The app computes the calories and protein of the pot and of one unit itself. Shown as a card; saved only if they confirm.",
    input_schema: { type: "object", properties: RECIPE_PROPS, required: Object.keys(RECIPE_PROPS) },
  },
  {
    name: "propose_shopping",
    description: "Propose changes to their shopping list («لیست خرید»): things to add to it, and / or items on it that they have now bought. Shown as one card; applied only if they confirm.",
    input_schema: {
      type: "object",
      properties: {
        add: {
          type: "array",
          description: "things to buy; empty when nothing is added",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Persian name as it is bought in a shop (the bank food's own name when it is one)" },
              amount: { type: "string", description: "short Persian amount as said in a shop («۲ بسته», «نیم کیلو»); empty when they gave none and it is not obvious" },
            },
            required: ["name", "amount"],
          },
        },
        bought: { type: "array", items: { type: "string" }, description: "names of items on the list, exactly as listed, that they have bought; empty when none" },
      },
      required: ["add", "bought"],
    },
  },
  {
    name: "propose_review_goal",
    description: "Propose setting the 'next week goal' of a weekly review.",
    input_schema: {
      type: "object",
      properties: { week_start: { type: "string", description: "Saturday, YYYY-MM-DD" }, next_goal: { type: "string" } },
      required: ["week_start", "next_goal"],
    },
  },
  {
    name: "propose_plan_swap",
    description: "Propose replacing ONE food inside one option of their current diet plan with another food from their food bank; the rest of the option stays. The app sets the amount itself (same calories as the food it replaces). Shown as a card; applied only if they confirm.",
    input_schema: {
      type: "object",
      properties: {
        slot: { type: "string", enum: ["breakfast", "snack1", "lunch", "snack2", "dinner"], description: "the eating occasion; snack1 is میان‌وعده‌ی صبح, snack2 is میان‌وعده‌ی عصر" },
        option: { type: "integer", description: "the option's number in that occasion, as listed in the plan" },
        from: { type: "string", description: "name of the food to replace, exactly as written in the option" },
        food_id: { type: "string", description: "id of the replacement, from the food bank" },
        name: { type: "string", description: "the replacement's name, as in the food bank" },
        scope: { type: "string", enum: ["today", "plan"], description: "today: only today's version of the option; plan: the option changes for the rest of the plan" },
      },
      required: ["slot", "option", "from", "food_id", "name", "scope"],
    },
  },
  {
    name: "propose_edit_entry",
    description: "Propose correcting one food that is already logged: its amount, calories, protein, vegetable flag, meal, day or name. Shown as a card with before and after; applied only if they confirm.",
    input_schema: {
      type: "object",
      properties: {
        day: { type: "string", description: "the day it is logged on now, YYYY-MM-DD" },
        meal: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"], description: "the meal it is logged in now" },
        name: { type: "string", description: "its name exactly as logged" },
        qty: { type: "number", description: "its current qty; only needed when the same food is logged more than once in that meal" },
        to: {
          type: "object",
          description: "only the fields that change",
          properties: {
            day: { type: "string", description: "YYYY-MM-DD" },
            meal: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
            name: { type: "string" },
            qty: { type: "number" },
            unit: { type: "string" },
            kcal: { type: "number", description: "total for the whole quantity; leave out to scale with qty" },
            protein: { type: "number", description: "grams, total for the whole quantity; leave out to scale with qty" },
            is_veg: VEG,
          },
        },
      },
      required: ["day", "meal", "name", "to"],
    },
  },
  {
    name: "propose_delete_entry",
    description: "Propose deleting one logged food (a duplicate, or something they did not eat). Shown as a card; deleted only if they confirm.",
    input_schema: {
      type: "object",
      properties: {
        day: { type: "string", description: "YYYY-MM-DD" },
        meal: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
        name: { type: "string", description: "its name exactly as logged" },
        qty: { type: "number", description: "its qty; only needed when the same food is logged more than once in that meal" },
      },
      required: ["day", "meal", "name"],
    },
  },
  {
    name: "propose_edit_food",
    description: "Propose correcting a food in their food bank (values are for one unit). Shown as a card with before and after; applied only if they confirm.",
    input_schema: {
      type: "object",
      properties: {
        food_id: { type: "string", description: "id from the food bank" },
        to: {
          type: "object",
          description: "only the fields that change",
          properties: {
            name: { type: "string" }, unit: { type: "string" },
            grams: { type: "number", description: "weight in grams of one unit" },
            kcal: { type: "number", description: "per one unit" }, protein: { type: "number", description: "grams per one unit" },
            category: { type: "string", enum: ["grain", "stew", "protein", "legume", "breakfast", "dairy", "fruit", "veg", "nuts", "drink", "sweet", "other"] },
            is_veg: VEG,
          },
        },
        fix_logged: { type: "boolean", description: "also apply a changed name or vegetable flag to everything already logged from this food" },
      },
      required: ["food_id", "to", "fix_logged"],
    },
  },
  {
    name: "propose_delete_measurement",
    description: "Propose deleting a wrong weigh-in or waist measurement. To change its value instead, call propose_weight / propose_waist for the same day.",
    input_schema: {
      type: "object",
      properties: { kind: { type: "string", enum: ["weight", "waist"] }, day: { type: "string", description: "YYYY-MM-DD" } },
      required: ["kind", "day"],
    },
  },
  {
    name: "get_entries",
    description: "Every food logged between two days (inclusive), for days older than the detailed window. At most 62 days per call.",
    input_schema: {
      type: "object",
      properties: { from: { type: "string" }, to: { type: "string" } },
      required: ["from", "to"],
    },
  },
  {
    name: "get_article",
    description: "Full text and sources of the magazine article(s) published on one day.",
    input_schema: {
      type: "object",
      properties: { day: { type: "string", description: "YYYY-MM-DD, as listed in the magazine section" } },
      required: ["day"],
    },
  },
];

// Corrections name an existing record the way the model sees it (day, meal, name; a bank
// alias; a day). Each is resolved here against what the app sent, so the card carries the
// real id and the values before the change, and a miss goes back to the model as an error
// it can fix. Returns null for any other tool.
const ISO = /^\d{4}-\d{2}-\d{2}$/;
// same folding as the app's search (norm in js/lib/fa.js), so a retyped name still matches
const fold = (s: unknown) => String(s ?? "").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[ۀة]/g, "ه").replace(/[أإآ]/g, "ا").replace(/[\u064B-\u0652\u200C\s-]/g, "").toLowerCase();
const ENTRY_FIELDS = ["day", "meal", "name", "qty", "unit", "kcal", "protein", "is_veg"];
const FOOD_FIELDS = ["name", "unit", "grams", "kcal", "protein", "category", "is_veg"];
const pick = (o: any, fields: string[]) => Object.fromEntries(fields.map(f => [f, o[f] ?? null]));
// the fields of `to` that really differ from the record
function changed(was: any, to: any, fields: string[]) {
  const same = (a: any, b: any) => typeof b === "number" ? Math.abs(Number(a) - b) < 0.05 : typeof b === "boolean" ? !!a === b : String(a ?? "").trim() === String(b).trim();
  return Object.fromEntries(fields.filter(f => to?.[f] != null && !same(was[f], to[f])).map(f => [f, typeof to[f] === "string" ? to[f].trim() : to[f]]));
}
function findEntry(c: Ctx, q: any) {
  const named = (c.entries || []).filter(e => e.id && e.day === q?.day && fold(e.name) === fold(q?.name));
  const pool = named.some(e => e.meal === q?.meal) ? named.filter(e => e.meal === q.meal) : named;
  return pool.find(e => Number(e.qty) === Number(q?.qty)) || pool[0] || null;
}
function correction(tool: string, input: any, c: Ctx, toId: Map<string, string>): { action?: any; error?: string } | null {
  if (tool === "propose_edit_entry" || tool === "propose_delete_entry") {
    const e = findEntry(c, input);
    if (!e) {
      const that = (c.entries || []).filter(x => x.day === input?.day);
      return { error: `No logged food with that name on ${input?.day}. Logged on that day:\n${that.map(entryLine).join("\n") || "nothing"}` };
    }
    const was = pick(e, ENTRY_FIELDS);
    if (tool === "propose_delete_entry") return { action: { type: "delete_entry", entry_id: e.id, was } };
    const to = { ...(input.to || {}) };
    // a new amount on its own keeps the same calories and protein per unit
    const k = to.qty != null && (to.unit == null || to.unit === e.unit) && Number(e.qty) > 0 ? Number(to.qty) / Number(e.qty) : null;
    if (k != null && to.kcal == null) to.kcal = Math.round(Number(e.kcal) * k);
    if (k != null && to.protein == null) to.protein = r1(Number(e.protein) * k);
    const set = changed(e, to, ENTRY_FIELDS);
    if (!Object.keys(set).length) return { error: "Nothing would change: the entry already has these values." };
    if (set.day && (!ISO.test(set.day) || set.day > c.today)) return { error: "day must be YYYY-MM-DD and not in the future." };
    if (set.meal && !MEALS[set.meal]) return { error: "Unknown meal." };
    return { action: { type: "edit_entry", entry_id: e.id, was, set } };
  }
  if (tool === "propose_edit_food") {
    const f = (c.foods || []).find(x => x.id === toId.get(String(input?.food_id)));
    if (!f) return { error: "No food with that id in the food bank." };
    const set = changed(f, input.to, FOOD_FIELDS);
    if (!Object.keys(set).length) return { error: "Nothing would change: the food already has these values." };
    return { action: { type: "edit_food", food_id: f.id, was: pick(f, FOOD_FIELDS), set, fix_logged: !!input.fix_logged && ("is_veg" in set || "name" in set) } };
  }
  if (tool === "propose_delete_measurement") {
    const waist = input?.kind === "waist";
    const row = ((waist ? c.waists : c.weights) || []).find(w => w.day === input?.day);
    if (!row) return { error: `No ${waist ? "waist measurement" : "weigh-in"} on ${input?.day}.` };
    return { action: waist ? { type: "delete_waist", day: row.day, cm: row.cm } : { type: "delete_weight", day: row.day, kg: row.kg } };
  }
  return null;
}

/* ---------------- one-shot modes ---------------- */

const str = (d = "") => ({ type: "string", description: d });
const planItems = {
  type: "array",
  items: {
    type: "object",
    properties: { food_id: str("exact id from the food bank"), qty: { type: "number", description: "in that food's own unit, a multiple of 0.5; grams when its unit is گرم" } },
    required: ["food_id", "qty"], additionalProperties: false,
  },
};
const planOption = {
  type: "object",
  properties: { title: str("2–4 Persian words naming the option"), items: planItems },
  required: ["title", "items"], additionalProperties: false,
};
const planSlot = {
  type: "object",
  properties: { pick: { type: "integer", enum: [1, 2], description: "how many of the options they eat at this occasion" }, options: { type: "array", items: planOption } },
  required: ["pick", "options"], additionalProperties: false,
};
const PLAN_RULES = `Rules for every option:
- Use ONLY foods from their food bank, by exact food_id. Quantity is in that food's own unit (as listed in the bank), in multiples of 0.5 — or in grams (multiples of 10) for foods whose unit is «گرم».
- Work out the calories from the bank (kcal per unit × qty) and land within ±10% of the budget. The app recomputes every number and drops options that miss, so do the arithmetic.
- Every option must be a meal an Iranian household would actually put on the table together at that time of day — the way it is really eaten, not a list of foods that only adds up on paper. Before keeping an option, ask: would someone serve these on one tray? If not, drop it.
  - A ready dish is a meal on its own: حلیم، عدسی، آش، کله‌پاچه، خوراک لوبیا، املت، کوکو، خورش with rice, کباب with rice or bread. Pair it only with what traditionally goes beside it (bread, the usual garnish, salad, yogurt, دوغ, tea) — never with another protein that has nothing to do with it (حلیم with egg, عدسی with chicken, آش with tuna). If a dish is short on protein, lower its amount and choose another option for protein, don't bolt on an unrelated protein.
  - Respect the time of day: breakfast foods (نان و پنیر، تخم‌مرغ، عدسی، حلیم، املت، کره و مربا) at breakfast; rice and خورش at lunch or dinner, not at breakfast or as a snack.
  - Keep the parts of an option from the same kind of meal: نان و پنیر و گردو، نان و پنیر و گوجه و خیار، املت با نان، برنج و خورش و سالاد، ساندویچ مرغ و خیارشور، ماست و میوه. Not bread with fruit and tuna, not rice with egg and cheese.
  - The title names the meal as people call it (e.g. «عدسی با نان»، «چلو جوجه و سالاد»), not a list of ingredients.
- Household amounts a person can measure without a scale; 1–4 foods per option.
- Respect profile.planPrefs (dislikes, allergies, notes) strictly, and medical conditions in the profile in the general, well-established way (e.g. diabetes: no sugary items or juice, prefer whole grains and legumes; blood pressure / heart: avoid salty and fried; kidney disease: do not push protein above the target). Prefer foods they actually log and like over foods they never eat.`;

// `data`: the sections this mode needs — nothing else is sent. `shared`: sections that stay
// the same between calls made in a row (the food bank); only those are worth caching.
// `image`: the request carries a photo (input.image, base64 JPEG) for the model to look at;
// "optional" when the mode also works without one.
type OneShot = {
  effort: string; max_tokens?: number; schema: any; prompt: (i: any, c: Ctx) => string; image?: boolean | "optional";
  system?: string; shared?: (S: Sections) => string[]; data?: (S: Sections, i: any) => string[];
};
// «نکته‌ی امروز»: one topic a day, in turn (see ONE_SHOT.tip).
const TIP_TOPICS = [
  "water: drinking water before meals and fullness; thirst mistaken for hunger",
  "protein: why it is the most filling macronutrient and protects muscle while losing",
  "fibre and vegetables: volume, slower digestion, fullness",
  "energy density: eating a larger volume of food for fewer calories",
  "liquid calories: sweet drinks, juice and why the body barely compensates for them",
  "sleep and appetite: ghrelin, leptin and cravings after a short night",
  "eating speed: how long fullness signals take and what slowing down does",
  "daily movement (NEAT): steps and everyday activity versus formal exercise",
  "strength training while losing weight: keeping muscle and metabolism",
  "water weight: why the scale jumps day to day (salt, carbohydrate, glycogen) and why weekly averages matter",
  "plateaus and metabolic adaptation: what really happens and what to do",
  "ultra-processed foods: what the controlled trial showed about how much people eat",
  "breakfast and meal timing: what the evidence does and doesn't show",
  "cooking oil and hidden calories in Iranian cooking (stews, rice, frying)",
  "bread and rice: refined versus whole grains, portion and fullness",
  "fruit versus fruit juice and dried fruit",
  "nuts: healthy but energy-dense; how much is a portion",
  "dairy and yoghurt in a weight-loss diet",
  "self-monitoring: what logging food and weighing do for weight loss, by the evidence",
  "stress, cortisol and emotional eating: the mechanism and what helps",
  "the slow pace: why 0.5–1 kg a week keeps the weight off better than crash diets",
  "salt, bloating and blood pressure",
  "sugar cravings: how they work, and how they fade when sugar is cut back gradually",
  "the waist: why waist size says more about health than weight alone",
];
const TIP_TOPICS_CARE = [
  "water and hydration: how it helps energy, digestion and concentration",
  "protein at meals: steady energy and keeping muscle strong",
  "fibre, vegetables and fruit: digestion, gut health and feeling well",
  "regular meals: why skipping meals backfires on energy and mood",
  "sleep and appetite: how a short night changes hunger signals",
  "movement for mood: what research shows about walking and wellbeing",
  "whole grains versus refined: steady blood sugar and energy",
  "calcium, dairy and bone health",
  "iron and tiredness: foods that help and what helps absorb them",
  "healthy fats: nuts, olive oil and fish",
  "stress and eating: how stress affects appetite and gentle ways to wind down",
  "water weight: why the body's weight naturally swings from day to day",
];

const ONE_SHOT: Record<string, OneShot> = {
  plan: {
    effort: "medium",
    max_tokens: 20000,
    data: (S) => [S.now(), S.profile(), S.targets(), S.phase(), S.energy(), S.mode(), S.foods(), S.plan(), S.adherence(), S.weights(), S.totals(), S.recent(), S.reviews(), S.checkins()],
    schema: {
      type: "object",
      properties: {
        note: str("2–3 short Persian sentences for the person"),
        slots: {
          type: "object",
          properties: { breakfast: planSlot, snack1: planSlot, lunch: planSlot, snack2: planSlot, dinner: planSlot },
          required: ["breakfast", "snack1", "lunch", "snack2", "dinner"], additionalProperties: false,
        },
        free: { type: "array", items: { type: "object", properties: { food_id: str() }, required: ["food_id"], additionalProperties: false } },
      },
      required: ["note", "slots", "free"], additionalProperties: false,
    },
    prompt: (i) => `Design their diet plan for the next ${Number(i.days) || 14} days, the way a dietitian's choice list works: not a day-by-day menu, but one fixed pattern — for each of five eating occasions a list of interchangeable options, each with exact amounts. They choose among the options every day, so the options of one occasion must be nutritionally equivalent.

Daily target: ${i.kcal} kcal, protein at least ${i.protein} g. Calorie budget per occasion: breakfast ${i.budgets?.breakfast}, snack1 (morning) ${i.budgets?.snack1}, lunch ${i.budgets?.lunch}, snack2 (afternoon) ${i.budgets?.snack2}, dinner ${i.budgets?.dinner}.

For each occasion:
- pick: 1 means they eat one option, and each option equals the whole budget. 2 means they eat any two, and each option equals HALF the budget (use this where mixing two small things is natural, e.g. snacks, or a breakfast of two parts). Decide per occasion.
- options: 5–6 for breakfast, lunch and dinner; 4–5 for each snack. Make them genuinely different from each other (different protein source, different base), so two weeks don't get boring.
- Breakfast, lunch and dinner options each contain a real protein source, and lunch and dinner options include a vegetable or salad from the bank, so that any combination they choose reaches the protein target and at least 3 vegetable servings a day. Snacks: fruit, dairy, nuts and the like; one modest treat option is fine.

${PLAN_RULES}

free: up to 8 foods from the bank that are so low in calories they can be eaten freely when hungry (raw or cooked non-starchy vegetables, salad without dressing, unsweetened tea, ...). Nothing above roughly 40 kcal per unit.

note: 2–3 short Persian sentences to them: the idea behind this plan. ${i.include?.length ? `They just added these foods to the bank and want them in the plan: ${i.include.map((n: string) => `«${n}»`).join("، ")} — work each into at least one suitable option and say so. Keep the rest close to the current plan in the data.` : "If the data has an earlier plan, look at the weight change over it and how closely it was followed (the adherence table and what they logged), keep what worked, change what they skipped, and say in the note what you changed and why."}`,
  },
  plan_option: {
    effort: "low",
    shared: (S) => [S.profile(), S.targets(), S.foods()],
    data: (S) => [S.plan()],
    schema: planOption,
    prompt: (i) => `They have none of the current options for «${i.slot}» at hand or don't feel like them. Give ONE more option for that occasion of their diet plan, worth about ${i.kcal} kcal, clearly different from these existing ones:\n${(i.existing || []).map((o: string) => `- ${o}`).join("\n")}\n\n${PLAN_RULES}`,
  },
  plan_swap: {
    effort: "low",
    shared: (S) => [S.profile(), S.targets(), S.foods()],
    schema: {
      type: "object",
      properties: {
        foods: {
          type: "array",
          items: { type: "object", properties: { food_id: str("exact id from the food bank"), why: str("2–5 Persian words: why it fits") }, required: ["food_id", "why"], additionalProperties: false },
        },
      },
      required: ["foods"], additionalProperties: false,
    },
    prompt: (i) => `In their diet plan, one option for «${i.slot}» is: ${i.option}. They like it but don't have «${i.food}» or don't want it, and want to replace only that food (about ${Math.round(Number(i.kcal)) || "?"} kcal of it); the rest stays. Suggest up to 3 foods from their food bank that can take its place: the same role in the meal (bread for bread, a protein source for a protein source, fruit for fruit), something an Iranian would really eat together with the rest of the option (no egg next to حلیم, no tuna next to آش), and not already in it. Best first. The app sets the amounts itself (same calories), so give only the foods. Respect profile.planPrefs (dislikes, allergies, notes) and medical conditions in the profile strictly. If nothing in the bank fits, return an empty list.`,
  },
  tip: {
    effort: "low",
    max_tokens: 3000,
    data: (S) => [S.now(), S.profile(), S.phase(), S.mode(), S.notes()],
    schema: { type: "object", properties: { text: str("Persian, simple Markdown") }, required: ["text"], additionalProperties: false },
    // A topic a day from a fixed rotation, so the tips stay on diet science and don't repeat.
    // With a (possible) eating-disorder history the rotation is about nourishment, not restriction.
    prompt: (i, c) => {
      const care = ["yes", "unsure"].includes((c.profile as any)?.edHistory);
      const list = care ? TIP_TOPICS_CARE : TIP_TOPICS;
      // «یک نکته‌ی دیگر» asks again with shift 1, 2, …: the next topics in the rotation
      const n = Math.floor(Date.parse(c.today + "T12:00:00Z") / 86400000) + (Math.floor(Number(i.shift)) || 0);
      const topic = list[((n % list.length) + list.length) % list.length];
      return `Write today's tip for the top of the Today screen: one useful, scientifically grounded fact about nutrition and dieting, explained so they learn something. Today's topic: ${topic}.

Shape (Persian, about 60–90 words, simple Markdown, no greeting):
- First line: a short bold title of 3–6 words that states the fact (e.g. «**آب قبل از غذا، سیرتر سر سفره**»).
- Then 2–3 sentences: what research has found, with one concrete number or finding where it is solid (e.g. how much, how long, by how much), and WHY it works (the body mechanism, in plain words).
- Last sentence: exactly how to use it today, practical and specific to Iranian food and habits.
Only what is well supported by systematic reviews or solid trials; if the effect is modest, say so honestly instead of overselling. No fads, no supplements or pills, nothing below their safe minimum, nothing against a medical condition in their profile.${care ? " They may have a history of disordered eating: frame everything as nourishing the body and feeling well; nothing about cutting, restricting, calorie numbers, weighing or compensating." : ""}${c.phase?.phase === "maintain" ? " They are in maintenance: where the topic allows, frame it as keeping the weight off." : ""}
This is NOT an analysis of their data: don't mention their numbers, logs or progress. Don't repeat a fact from your earlier tips (in the data, keys tip:…); take a different angle on the topic if needed.`;
    },
  },
  quote: {
    effort: "low",
    data: (S) => [S.now(), S.profile(), S.targets(), S.weights(), S.totals(), S.reviews(), S.motivations()],
    schema: { type: "object", properties: { text: str() }, required: ["text"], additionalProperties: false },
    prompt: (i) => `Write one motivational sentence for their Motivation section, in the first person as if they wrote it to themselves (max ~22 words), personal to their goals, events and progress. Not a cliché, not one they already have.${i?.draft ? ` They started writing: «${i.draft}» — build on it.` : ""} Only the sentence, without quotation marks.`,
  },
  review: {
    effort: "medium",
    data: (S, i) => [S.now(), S.profile(), S.targets(), S.phase(), S.standing(), S.activity(), S.mode(), S.plan(), S.adherence(), S.weights(), S.totals(), S.entries(String(i.week_start), addDays(String(i.week_start), 6)), S.reviews(), S.checkins()],
    schema: {
      type: "object",
      properties: { analysis: str("Persian, simple Markdown, max ~110 words"), next_goal: str("one small, concrete goal, max ~14 words") },
      required: ["analysis", "next_goal"], additionalProperties: false,
    },
    prompt: (i) => `Analyse their week from ${i.week_start} to ${addDays(String(i.week_start), 6)} (Saturday to Friday): how consistently they logged, calories vs target, protein, vegetables, activity minutes, weight change, and what they wrote in that week's review if anything. Start with what went well, then the one pattern most worth changing, then why. Then suggest one small, concrete, achievable goal for next week.`,
  },
  progress: {
    effort: "medium",
    data: (S) => [S.now(), S.profile(), S.targets(), S.phase(), S.standing(), S.energy(), S.mode(), S.adherence(), S.weights(), S.totals(), S.reviews(), S.checkins()],
    schema: { type: "object", properties: { text: str("Persian, simple Markdown, max ~110 words") }, required: ["text"], additionalProperties: false },
    prompt: () => `Analyse their weight trend for the Progress screen: the overall direction and pace (use weekly averages, not single weigh-ins — daily water swings are normal), how it relates to their eating, whether the pace is healthy (0.25–1 kg/week is a good range while losing; in maintenance or on a diet break, holding steady is the aim), and one encouraging, practical next step. If there are waist measurements, read them together with the weight: a shrinking waist with a flat weight is progress. If measured energy use is in the data and differs from the formula by more than about 150 kcal, say in one sentence what that means for their target. If there are too few weigh-ins, say what's needed.`,
  },
  // once a month in maintenance, on «پیشرفت»
  maintain: {
    effort: "medium",
    data: (S) => [S.now(), S.profile(), S.targets(), S.phase(), S.standing(), S.energy(), S.activity(), S.weights(), S.totals(), S.reviews(), S.checkins(), S.notes()],
    schema: { type: "object", properties: { text: str("Persian, simple Markdown, max ~120 words") }, required: ["text"], additionalProperties: false },
    prompt: () => `Write this month's maintenance review for the Progress screen. They lost weight and are now keeping it off; this is the part where most people regain, so it matters. Cover briefly: how the weight has held against its band over the last month (weekly averages, not single weigh-ins), how steady their weighing and logging have been, activity minutes against the weekly goal, and whether the measured energy use suggests the maintenance level needs moving. Start with what is going well. Then the one habit most worth protecting or fixing next month, as something concrete. If an occasion is coming up, a line on it. Kind and plain; no alarm over normal swings of a kilo.`,
  },
  // «برگشت به مسیر»: the diet is slipping; find out why with them, and plan the way back
  checkin: {
    effort: "medium",
    max_tokens: 6000,
    data: (S) => [S.now(), S.profile(), S.targets(), S.phase(), S.standing(), S.mode(), S.plan(), S.adherence(), S.activity(), S.occasions(), S.weights(), S.totals(), S.recent(), S.reviews(), S.motivations(), S.checkins()],
    schema: {
      type: "object",
      properties: {
        cause: str("Persian, simple Markdown, max ~90 words: what most likely lies behind the slip, and what in their own record and words points to it"),
        steps: { type: "array", items: str("one Persian step, max ~22 words, as «اگر/وقتی …، …»"), description: "exactly 3" },
        first_step: str("one tiny Persian action for today, max ~14 words"),
        goal: str("one small, concrete, checkable goal for this week, max ~14 words"),
        support: str("Persian, max ~60 words, or empty: only when professional or medical help is warranted (see the rules)"),
      },
      required: ["cause", "steps", "first_step", "goal", "support"], additionalProperties: false,
    },
    prompt: (i, c) => {
      const mood = Number(i.mood) || 0;
      const care = ["yes", "unsure"].includes((c.profile as any)?.edHistory);
      const f = i.follow;
      return `They are slipping off their diet, and this is the «برگشت به مسیر» check-in: the app does not want to just warn them, but to find out WHY with them and help them back before a small slip becomes a regain. Work like a skilled, warm behavioural coach (cognitive-behavioural and motivational-interviewing informed), not a calorie counter.

What the app noticed in their record: ${signText(i.signs)}.
How they say they feel these days: ${mood ? `${mood} of 5 (1 = very bad, 5 = very good)` : "not given"}.
What they say has been going on: ${(Array.isArray(i.causes) ? i.causes : []).map((x: unknown) => `«${String(x).slice(0, 60)}»`).join("، ") || "nothing picked"}.
In their own words: ${i.said ? `«${String(i.said).slice(0, 1500)}»` : "-"}
${f ? `This follows the check-in of ${f.day}, whose plan ${f.outcome === "some" ? "only partly worked" : "did not work"} (plan: ${(f.steps || []).join(" / ")}; goal: ${f.goal || "-"}). Find what got in the way; keep what helped, change or shrink what didn't — a smaller, easier plan beats a better one they won't do.` : ""}

1. cause: Find the most likely root cause (or two that feed each other), not the symptom. "Eating more" is a symptom; tiredness, stress or low mood, poor sleep, boredom, loneliness, a changed routine, social pressure, a monotonous diet, all-or-nothing thinking after one bad day, hunger from too strict a target, or results that seem to stall are causes. Put what they said next to the record: which days, meals and times went over or went unlogged (evenings? weekends? after a certain date?), whether logging stopped first, sleep- or work-related patterns, how activity changed, what their weekly reviews said was hard, events around those dates. Quote one or two concrete facts from the data. If their words and the data point different ways, say so gently. If they picked «نمی‌دانم چرا», offer your best reading from the data as a question to consider. If the data is thin, say what you are inferring from. Kind, no blame; a slip is information, not failure.
2. steps: exactly 3, each an "if/when …, then I …" plan aimed at THAT cause, small enough to do this week and specific to their life and food (their food bank, plan, schedule). Examples of matching a cause: stress or low mood → a non-food way to wind down at the hour it hits, and a planned satisfying snack instead of grazing; poor sleep → a sleep anchor plus a protein-rich breakfast; boredom or evening grazing → a plan for that hour; a monotonous diet → new options («برنامه‌ی تازه» or «یک گزینه‌ی دیگر» in «رژیم», a new recipe in «رسپی‌ها»); tired of logging → make it lighter (a photo of the plate, or just the main meals, for now); social events → a plan for the next one; lost motivation → reconnect with their own saved motivations (quote one if they have it), and a visible small win; no visible results → remind that the waist and the weekly mean matter more than one weigh-in; too hungry → check the target is not too strict, more protein and volume. Use app features where they truly help (photo logging, reminders, the «تحرک» pill, «انگیزه‌ها», the diet plan), by their names.
3. first_step: one tiny thing to do today that starts it.
4. goal: one small checkable goal for the week, connected to the cause.
Never suggest eating less to "make up" for the slip, skipping meals, or anything under the safety floor. In maintenance, the aim is back into the band, not a new diet.${care ? " They may have a history of disordered eating: no restriction, counting, compensating or weighing advice at all; focus on regular meals, feelings, self-kindness and support, and suggest staying in touch with a professional in support." : ""}

support: leave it EMPTY unless one of these applies, then write it warmly and plainly:
- Signs of something heavier than a rough patch (mood 1–2 together with sadness, anxiety or loneliness; or words of hopelessness, not enjoying anything, weeks of feeling low): say that how they feel matters more than the diet right now, and that talking to a psychologist or counsellor helps and is a strength; the diet can wait or go gentler.
- Anything suggesting thoughts of self-harm or not wanting to live: put that first and only, with no diet advice in support: ask them to reach out now to someone they trust, and give the Iranian lines: «صدای مشاور بهزیستی ۱۴۸۰» and «اورژانس اجتماعی ۱۲۳» (or ۱۱۵ in an emergency). In that case also keep cause and steps very gentle and short.
- Repeated eating that feels out of control («پرخوری بی‌اختیار»), or compensating behaviour: it is common and treatable; suggest a psychologist or dietitian experienced with eating behaviour.
- Illness, pain, a medication change or a possible hormonal cause: suggest checking with their doctor.`;
    },
  },
  // a few days before an occasion that makes eating harder (یلدا، نوروز، رمضان، their own events)
  occasion: {
    effort: "low",
    data: (S) => [S.now(), S.profile(), S.targets(), S.phase(), S.mode()],
    schema: { type: "object", properties: { text: str("Persian, simple Markdown, max ~90 words") }, required: ["text"], additionalProperties: false },
    prompt: (i, c) => `«${i.name}» is ${Number(i.inDays) === 0 ? "today" : `in ${i.inDays} days`} (${i.day}${Number(i.days) > 1 ? `, lasting about ${i.days} days` : ""}). Write them a short, practical plan for it as 3–4 "if this happens, I will…" lines (implementation intentions), specific to this occasion and to Iranian customs around it (e.g. آجیل و شیرینی و میوه‌ی شب یلدا، دید و بازدید نوروز، افطار و سحری), plus one line on what to do the day after if it went over: back to the usual routine, no making up for it by eating less. ${["yes", "unsure"].includes((c.profile as any)?.edHistory) ? "They may have a history of disordered eating: nothing about restricting, counting, compensating or weighing; focus on regular meals, enjoying the occasion and being kind to themselves." : "Enjoying the occasion is part of the plan; no banning foods."} Fit it to their phase. No greeting.`,
  },
  estimate: {
    effort: "low",
    shared: (S) => [S.foods()],
    schema: {
      type: "object",
      properties: {
        name: str("cleaned-up Persian name"),
        unit: str("the most natural Iranian household unit for it (or the unit given)"),
        grams: { type: "number", description: "typical weight in grams of one such unit of this food, as served" },
        kcal: { type: "number", description: "per one unit" },
        protein: { type: "number", description: "grams per one unit" },
        category: { type: "string", enum: ["grain", "stew", "protein", "legume", "breakfast", "dairy", "fruit", "veg", "nuts", "drink", "sweet", "other"] },
        is_veg: VEG,
        note: str("one short Persian line on what was assumed (portion size, oil, ...)"),
      },
      required: ["name", "unit", "grams", "kcal", "protein", "category", "is_veg", "note"], additionalProperties: false,
    },
    prompt: (i) => `Estimate calories, protein and the weight in grams for this food, for one household unit${i.unit ? ` (unit: ${i.unit}${i.unit === "گرم" ? " — then grams is 1 and kcal/protein are per gram" : ""})` : ""}, the way it is usually prepared and served in Iran: «${i.name}». Be realistic, slightly conservative-high rather than low. Keep kcal consistent with grams (realistic energy density). Use their food bank for consistency with similar items. is_veg is false unless the food is itself mainly non-starchy vegetables.`,
  },
  label: {
    effort: "low",
    image: true,
    system: "You read nutrition labels on packaged foods for تن‌آرا, a Persian food-logging app. Exact numbers only.",
    schema: {
      type: "object",
      properties: {
        found: { type: "boolean", description: "false when no nutrition table (or no energy value) can be read" },
        name: str("Persian name of the product with its brand, as on the pack; empty if not visible"),
        kcal_100: { type: "number", description: "kcal per 100 g (or 100 ml)" },
        protein_100: { type: "number", description: "grams of protein per 100 g (or 100 ml)" },
        pack_g: { type: "number", description: "net weight (g) or volume (ml) of the whole pack if printed, else 0" },
        category: { type: "string", enum: ["grain", "stew", "protein", "legume", "breakfast", "dairy", "fruit", "veg", "nuts", "drink", "sweet", "other"] },
        is_veg: VEG,
        note: str("one short Persian line: anything converted or unclear (kJ to kcal, per-serving to per-100 g), or why it could not be read"),
      },
      required: ["found", "name", "kcal_100", "protein_100", "pack_g", "category", "is_veg", "note"], additionalProperties: false,
    },
    prompt: (i) => `This is a photo of a packaged food's nutrition label (Iranian labels: «ارزش غذایی», «انرژی», «پروتئین»; often a traffic-light panel per serving).${i.name ? ` They call it «${String(i.name).slice(0, 80)}».` : ""} Read the energy and protein and give them per 100 g (or 100 ml): when the label gives them only per serving or per pack, convert using the weight printed for that serving or pack; when energy is only in kJ, divide by 4.184. Read the digits exactly; do not estimate from what the product usually is. If there is no readable energy value, set found to false, the numbers to 0 and say why in the note.`,
  },
  photo: {
    effort: "medium",
    image: true,
    shared: (S) => [S.foods()],
    schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: str("Persian name of the food (the bank's name when food_id is set)"),
              food_id: str("id from the food bank when it clearly matches, otherwise an empty string"),
              qty: { type: "number", description: "amount in `unit`: a multiple of 0.5, or grams when unit is گرم" },
              unit: str("the bank food's own unit, or «گرم»; for foods not in the bank, a natural Iranian household unit"),
              kcal: { type: "number", description: "total for the whole amount" },
              protein: { type: "number", description: "grams, total for the whole amount" },
              is_veg: VEG,
            },
            required: ["name", "food_id", "qty", "unit", "kcal", "protein", "is_veg"], additionalProperties: false,
          },
        },
        note: str("one or two short Persian sentences: what was assumed (portion sizes, oil), or why nothing could be listed"),
      },
      required: ["items", "note"], additionalProperties: false,
    },
    prompt: (i) => `This is a photo of what they are eating${MEALS[i.meal] ? ` for ${MEALS[i.meal]}` : ""}. List each distinct food on it with a realistic estimate of how much is there, so the app can log it.${i.hint ? ` They added: «${String(i.hint).slice(0, 300)}» — trust this over what you see.` : ""}

- Judge portions from the plate, cutlery, hands and other objects of known size. When a food is in their food bank, use its food_id, its exact name and its own unit (qty in multiples of 0.5), or unit «گرم» with qty in grams if weight is the more natural estimate; the app then takes the calories from the bank. For anything not in the bank leave food_id empty, pick a natural Iranian household unit and estimate kcal and protein yourself for the whole amount, the way it is usually cooked in Iran.
- A photo hides oil, butter, sugar and how deep a dish is: be realistic, slightly on the high side rather than low. Mixed dishes (e.g. rice with stew) are separate items when the bank has them separately.
- Do not list things that are not being eaten (cutlery, garnish, an empty dish), and do not guess at foods you cannot make out.
- If the photo does not show food or drink, return an empty list and say so in the note.`,
  },
  recipe: {
    effort: "medium",
    image: "optional",
    shared: (S) => [S.foods()],
    data: (S, i) => i.base ? [S.profile(), S.targets()] : i.have != null ? [S.recipes(), S.now(), S.profile(), S.targets(), S.phase(), S.today()] : [],
    schema: {
      type: "object",
      properties: {
        ...RECIPE_PROPS,
        note: str("one or two short Persian sentences to them"),
        minutes: { type: "integer", description: "total time from start to plate, in minutes" },
        changes: { type: "array", items: str("one change, a short Persian line"), description: "only for a lighter / higher-protein version; otherwise empty" },
      },
      required: [...Object.keys(RECIPE_PROPS), "note", "minutes", "changes"], additionalProperties: false,
    },
    prompt: (i) => {
      if (i.base) return `This is one of their own recipes:
${recipeText(i.base)}

Make a ${i.goal === "protein" ? "higher-protein version of it: more protein in one unit, without more calories" : "lighter version of it: fewer calories in one unit"}. It must stay recognisably the same dish and something they would still enjoy: change what matters most (the oil, a fatty cut, sugar, the share of rice or bread, more vegetables or a leaner protein) and leave the rest alone. No extremes: roughly 15–30% better is the aim. Keep the same name, the same unit and a similar yield. In "changes" list each change as one short Persian line («روغن از ۶ قاشق به ۳ قاشق»), most important first. Respect allergies, dislikes (profile.planPrefs) and medical conditions in the profile. note: what stays the same in taste, or what to watch while cooking it this way.

${RECIPE_RULES}`;
      if (i.have != null) {
        const want = (i.want || []).map((k: string) => RECIPE_WANTS[k]).filter(Boolean);
        return `They want a NEW and SIMPLE dish to cook for ${MEALS[i.meal] || "a meal"} today, for ${Math.round(Number(i.people)) || 2} ${Number(i.people) === 1 ? "person" : "people"}: something they do not already make, that an ordinary home cook gets right the first time.${String(i.have).trim() ? ` They wrote (what they have at home, or what they feel like): «${String(i.have).slice(0, 600)}» — build on it.` : ""}${want.length ? ` They asked for: ${want.join("; ")}.` : ""}

Suggest ONE dish:
- New to them: not a dish that is already in their food bank or their recipes (both are in the data; those are what they eat now), and not just one of them renamed. It may come from any cuisine as long as it suits an Iranian palate.
- Simple: at most 6 ingredients that carry calories (pantry basics — oil, onion, garlic, spices, salt, tomato paste, lemon — do not count), all sold in an ordinary Iranian supermarket, one pan or pot, 3–5 steps, no special equipment or technique. minutes: the honest total time from start to plate, 30 or less unless the dish cannot be done faster.
- Fits their day: write it with unit «پرس» and servings = the number of people, so that one پرس is one person's whole meal of about ${Math.round(Number(i.kcal)) || 450} kcal (within 10%: do the arithmetic, the app recomputes it). If rice or bread normally goes with it, put it in the recipe so the پرس is the complete meal. As much protein as the dish realistically allows, looking at what is left of today's protein target, and vegetables where they fit. Go easy on the oil and say the amount in the steps.${(i.avoid || []).length ? `\n- Not any of these, which you already suggested: ${i.avoid.slice(0, 10).map((n: string) => `«${String(n).slice(0, 60)}»`).join("، ")}. Go for a clearly different kind of dish.` : ""}
Respect profile.planPrefs (dislikes, allergies, notes) and medical conditions in the profile strictly. note: one sentence on why it is worth trying and how it fits their day. "changes": empty.

${RECIPE_RULES}`;
      }
      return `They cook this at home and want to know what it really holds: ${String(i.text || "").trim() ? `«${String(i.text).slice(0, 2000)}»` : "(see the photo)"}${i.image ? "\nThe photo that comes with it shows the recipe (handwritten, a screenshot, a page of a book) or the ingredients; read it together with the text, and trust the text where they differ." : ""}

Write it down exactly as they make it: keep every amount they gave and do not make it healthier. Where an amount is missing, assume what an Iranian home cook would usually use for that many people (be realistic about oil: slightly high rather than low). If they gave only the name of a dish, write the usual home recipe for 4 people. note: say which amounts you assumed, so they can correct them. If this is not a dish or a recipe at all, return an empty items list and say so in the note. "changes": empty.

${RECIPE_RULES}`;
    },
  },
  shop: {
    effort: "low",
    data: (S) => [S.now(), S.profile(), S.mode(), S.plan(), S.recipes(), S.recent(), S.shopping()],
    schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: str("Persian name of the thing as it is bought in a shop"),
              amount: str("how much to buy for the week, short, the way it is sold («۲ بسته», «نیم کیلو», «۶ عدد»)"),
              why: str("2–5 Persian words: what it is for («صبحانه‌های رژیم», «سالاد ناهار و شام»)"),
            },
            required: ["name", "amount", "why"], additionalProperties: false,
          },
        },
        note: str("one short Persian sentence to them: what the list is built on, or why it is empty"),
      },
      required: ["items", "note"], additionalProperties: false,
    },
    prompt: (i) => `Write their grocery list for the next 7 days, for the shopping list («لیست خرید») inside the app. If the data has a diet plan, the list must let them eat by it for a week: cover the options they are most likely to pick (the ones they have been ticking or logging, otherwise a sensible spread), not every option of every meal. Without a plan, base it on what they have actually been eating over the last two weeks, and on their recipes where they cook them.${String(i.have || "").trim() ? `\nThey wrote about what is at home or has run out: «${String(i.have).slice(0, 600)}» — leave out what they have, make sure what has run out is on the list.` : ""}

- Things as they are bought in an ordinary Iranian shop, not dishes: for a cooked dish list what it is made from (for قورمه‌سبزی: گوشت خورشتی، سبزی قورمه، لوبیا قرمز), merged across dishes into one line per thing.
- Mostly what runs out within a week: dairy, eggs, bread, fruit, vegetables and salad, meat, chicken and fish, plus anything the plan leans on. Leave out pantry staples that a kitchen normally has (oil, salt, spices, tea, sugar, rice, tomato paste) unless they wrote that they are out of them.
- Amounts for ONE person for one week, rounded to how the thing is sold (a pack, a bottle, half a kilo, a count), on the modest side: food that spoils is waste.
- Nothing that is already on their shopping list (in the data). Nothing against profile.planPrefs (dislikes, allergies) or the medical conditions in the profile. No supplements, no diet products.
- At most 18 lines, ordered the way one walks a shop: fruit and vegetables, then dairy and eggs, then meat, chicken and fish, then bread and grains, then the rest.
If there is neither a plan nor anything logged, return an empty list and say in the note that it needs a plan or a few logged days first.`,
  },
  title: {
    effort: "low",
    system: "You name chat conversations for the list of past conversations in تن‌آرا, a Persian weight-loss and food-logging app.",
    schema: { type: "object", properties: { title: str("2–5 Persian words") }, required: ["title"], additionalProperties: false },
    prompt: (i) => `Give a short Persian title (2–5 words, no quotes, no trailing punctuation) for the chat conversation that starts like this, for a list of past conversations:\n${(i.messages || []).slice(0, 2).map((m: any) => `${m.role === "assistant" ? "Hooshvareh" : "User"}: ${String(m.content || "").slice(0, 1500)}`).join("\n")}`,
  },
};

/* ---------------- handler ---------------- */

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

const CACHE = { type: "ephemeral" };
const NOTE = "Only the parts of their data that this task needs are included.";

// The frozen prompt, then data that is the same between calls close together (cached), then
// data that isn't (not cached: writing a cache entry nobody reads costs 25% extra).
function systemBlocks(stable: string, rest = "", note = "") {
  const out: any[] = [{ type: "text", text: SYSTEM }];
  if (stable) out.push({ type: "text", text: `<user_data>\n${note ? note + "\n\n" : ""}${stable}\n</user_data>`, cache_control: CACHE });
  if (rest) out.push({ type: "text", text: `<user_data>\n${note && !stable ? note + "\n\n" : ""}${rest}\n</user_data>` });
  return out;
}

// Token use of one request to this function: logged per API call, and saved in one go as rows
// of ai_usage (through the caller's own client, so RLS files them under the right person).
type Use = { add: (mode: string, msg: any) => void; save: () => Promise<void> };
function usageLog(sb: any): Use {
  const rows: any[] = [];
  return {
    add(mode, msg) {
      console.log(JSON.stringify({ mode, stop: msg?.stop_reason, usage: msg?.usage }));
      const u = msg?.usage;
      if (u) rows.push({
        mode, input: u.input_tokens || 0, cache_read: u.cache_read_input_tokens || 0, cache_write: u.cache_creation_input_tokens || 0,
        output: u.output_tokens || 0, searches: u.server_tool_use?.web_search_requests || 0,
      });
    },
    async save() {
      if (!rows.length) return;
      try {
        const { error } = await sb.from("ai_usage").insert(rows.splice(0));
        if (error) console.error("usage not saved:", error.message);
      } catch (e) { console.error("usage not saved", e); }
    },
  };
}

// A photo from the app: base64 JPEG, already shrunk on the phone.
const okImage = (v: unknown) => typeof v === "string" && v.length > 200 && v.length < 3_000_000 && /^[A-Za-z0-9+/]+=*$/.test(v);
const MAX_CHAT_PHOTOS = 6;
const imageBlock = (data: string) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } });

// Chat history from the app: plain text turns, oldest first. Keep it valid: starts with
// the user, alternates, ends with the user. Long conversations drop their oldest turns
// HISTORY_STEP at a time (not one per message), so the start — and the cached prefix —
// stays the same for many turns in a row.
const HISTORY_MAX = 40, HISTORY_STEP = 20;
function cleanHistory(list: any[]) {
  const all = list || [];
  const start = all.length > HISTORY_MAX ? Math.ceil((all.length - HISTORY_MAX) / HISTORY_STEP) * HISTORY_STEP : 0;
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of all.slice(start)) {
    const role = m?.role === "assistant" ? "assistant" : "user";
    const text = String(m?.content ?? "").slice(0, 8000).trim();
    if (!text) continue;
    if (!out.length && role === "assistant") continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += "\n\n" + text;
    else out.push({ role, content: text });
  }
  return out;
}

function refusalText() {
  return "متأسفم، نمی‌توانم به این یکی جواب بدهم. می‌توانی سؤالت را جور دیگری بپرسی؟";
}

async function runOneShot(mode: string, ctx: Ctx, input: any, use: Use) {
  const m = ONE_SHOT[mode];
  const image = m.image && input?.image != null;
  if ((m.image === true || image) && !okImage(input?.image)) return json({ error: "عکس درست نرسید؛ دوباره امتحان کن." }, 400);
  const S = sections(ctx);
  const prompt = m.prompt(input || {}, ctx);
  const res: any = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: m.max_tokens || 8000,
    betas: BETAS,
    fallbacks: "default",
    system: m.system || systemBlocks(block(m.shared?.(S) || []), block(m.data?.(S, input || {}) || []), NOTE),
    output_config: { effort: m.effort, format: { type: "json_schema", schema: m.schema } },
    messages: [{ role: "user", content: image ? [imageBlock(input.image), { type: "text", text: prompt }] : prompt }],
  } as any);
  use.add(mode, res);
  if (res.stop_reason === "refusal") return json({ error: refusalText() }, 422);
  const text = res.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  try { return json({ result: realIds(JSON.parse(text), S.toId) }); } catch { return json({ error: "پاسخ هوشواره ناقص بود؛ دوباره امتحان کن." }, 502); }
}

/* ---------------- magazine ---------------- */

// The only places a magazine article may cite. Subdomains are included (nih.gov covers PubMed).
const MAG_DOMAINS = [
  "who.int", "nih.gov", "cdc.gov", "nhs.uk", "nice.org.uk", "cochranelibrary.com", "cochrane.org",
  "health.harvard.edu", "hsph.harvard.edu", "mayoclinic.org", "bmj.com", "thelancet.com", "jamanetwork.com",
  "nejm.org", "nature.com", "ajcn.nutrition.org", "eatright.org", "heart.org", "diabetes.org", "efsa.europa.eu",
];
const MAG_CATEGORIES: Record<string, string> = {
  nutrition: "nutrition and food composition (protein, fibre, energy density, satiety, specific food groups)",
  activity: "physical activity for weight loss and health (walking, resistance training, NEAT, muscle retention)",
  sleep_stress: "sleep, stress and appetite",
  habits: "the psychology of eating and habit change (cravings, emotional eating, self-monitoring, relapse)",
  myths: "a common weight-loss belief, checked against the evidence",
  body: "how the body works during weight loss (metabolism, plateaus, water weight, hormones, weight maintenance)",
  practical: "practical everyday eating (eating out, gatherings, shopping, cooking methods, drinks)",
  maintain: "keeping lost weight off (what long-term studies and the US National Weight Control Registry show, why weight comes back, the habits of people who keep it off, handling a regain early)",
};

const PUBLISH_TOOL = {
  name: "publish_article",
  description: "Publish the finished magazine article to the app. Call exactly once, after researching.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      topic: str("short English slug of the subject, e.g. protein-and-satiety"),
      category: { type: "string", enum: Object.keys(MAG_CATEGORIES) },
      title: str("Persian headline, max ~9 words, accurate, not clickbait"),
      summary: str("Persian, 1–2 sentences: what the reader will learn"),
      minutes: { type: "integer", description: "reading time in minutes" },
      body: str("the article in Persian Markdown: paragraphs, 2–4 «## » subheadings, **bold**, «- » bullets. 350–550 words."),
      key_points: { type: "array", items: str("one short Persian sentence"), description: "exactly 3 takeaways" },
      for_you: str("Persian, 2–3 sentences tying the article to this person's own recent numbers and one concrete thing to try"),
      evidence: { type: "string", enum: ["strong", "moderate", "limited"], description: "how solid the evidence behind the main claim is" },
      sources: {
        type: "array",
        description: "2–5 pages you actually opened in search results and relied on",
        items: {
          type: "object",
          properties: { title: str("page or paper title, in its original language"), publisher: str("e.g. WHO, NIH, Cochrane, Harvard Health"), url: str("exact URL from the search results") },
          required: ["title", "publisher", "url"], additionalProperties: false,
        },
      },
    },
    required: ["topic", "category", "title", "summary", "minutes", "body", "key_points", "for_you", "evidence", "sources"],
    additionalProperties: false,
  },
};

const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
const trusted = (u: string) => { const h = hostOf(u); return /^https:/.test(u) && MAG_DOMAINS.some(d => h === d || h.endsWith("." + d)); };
const normUrl = (u: string) => u.replace(/[#?].*$/, "").replace(/\/+$/, "").toLowerCase();

function magazinePrompt(i: any) {
  const cat = MAG_CATEGORIES[i.category] ? i.category : "nutrition";
  const asked = String(i.topic || "").slice(0, 300).trim();
  return `Write one article for their personal magazine («مجله») inside the app. For this task the "be brief, no headings" style rules do not apply to the article body; everything else (Persian, «تو», safety rules) does.

${asked ? `They asked for an article about: «${asked}». If that is not about weight, nutrition, activity, sleep, habits or health around them, pick the closest topic that is and say so in the summary.` : `Today's section: ${MAG_CATEGORIES[cat]}. Within it, choose the single topic most useful to this person right now, judging from their data (what they eat and skip, protein and vegetables vs target, weight trend, plan adherence, what they wrote in reviews, their conditions).`}
Do not repeat a subject already covered: ${(i.previous || []).slice(0, 80).map((t: string) => `«${String(t).slice(0, 80)}»`).join("، ") || "nothing yet"}.

Research first, with web_search. Two or three focused searches are usually enough: stop once you have 2–4 solid sources. Results are limited to major health bodies, systematic-review publishers and leading journals. Prefer guidelines, systematic reviews and meta-analyses over single studies, and recent over old. Base every factual claim on what you actually read in the results; if the evidence is mixed or weak, say so plainly and set "evidence" accordingly. Do not cite anything from memory. Numbers (effect sizes, amounts) only when a source gives them.

Then call publish_article once. Write it like a good science journalist writing to one reader: a concrete opening, what the evidence shows, what it means in an Iranian everyday kitchen and routine, and what is still uncertain. No medical diagnosis, nothing below their safety floor, no supplements or drugs as weight-loss advice (an article may explain what the evidence says about them, including that it is weak). Name the source body in the text where it matters (e.g. «مرور کاکرین در ۲۰۲۳»), and list in "sources" only pages that appeared in your search results, with their exact URLs. Do not write the article as plain text.`;
}

async function runMagazine(ctx: Ctx, input: any, use: Use) {
  const messages: any[] = [{ role: "user", content: magazinePrompt(input || {}) }];
  const S = sections(ctx);
  // No food bank and no article list (the prompt already names the earlier titles). Cached:
  // the search loop re-reads this prefix on every step.
  const system = systemBlocks(block([S.now(), S.profile(), S.targets(), S.phase(), S.energy(), S.mode(), S.plan(), S.adherence(), S.weights(), S.totals(), S.recent(), S.reviews()]), "", NOTE);
  const seen = new Set<string>(); // every URL the search really returned
  for (let turn = 0; turn < 5; turn++) {
    const msg: any = await (anthropic.beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      betas: BETAS,
      fallbacks: "default",
      system,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4, allowed_domains: MAG_DOMAINS }, PUBLISH_TOOL],
      output_config: { effort: "medium" },
      // a follow-up turn re-sends the search results: read them from the cache
      ...(turn ? { cache_control: CACHE } : {}),
      messages,
    } as any) as any).finalMessage();
    use.add("magazine", msg);
    if (msg.stop_reason === "refusal") return json({ error: refusalText() }, 422);

    // Collect URLs from server-tool results and citations — never from the model's own prose.
    for (const b of msg.content) {
      if (b.type === "tool_use" || b.type === "thinking") continue;
      const raw = JSON.stringify(b.type === "text" ? (b.citations || []) : b);
      for (const u of raw.match(/https:\/\/[^\s"\\<>)]+/g) || []) seen.add(normUrl(u));
    }

    const call = msg.content.find((b: any) => b.type === "tool_use" && b.name === "publish_article");
    if (call) {
      const a = call.input || {};
      const sources = (a.sources || []).filter((s: any) => s?.url && trusted(s.url) && (!seen.size || seen.has(normUrl(s.url))));
      if (!sources.length || !a.title || !a.body) return json({ error: "برای این موضوع منبع معتبری پیدا نشد؛ دوباره امتحان کن." }, 502);
      return json({ result: { ...a, sources } });
    }
    messages.push({ role: "assistant", content: msg.content });
    // pause_turn: the server-side search loop wants to go on; resending continues it.
    if (msg.stop_reason !== "pause_turn") messages.push({ role: "user", content: "Now call publish_article with the finished article." });
  }
  return json({ error: "مقاله آماده نشد؛ دوباره امتحان کن." }, 502);
}

function runChat(ctx: Ctx, history: any[], images: unknown, use: Use) {
  const turns = cleanHistory(history);
  if (!turns.length || turns[turns.length - 1].role !== "user") return json({ error: "پیامی نیست." }, 400);
  const enc = new TextEncoder();
  const S = sections(ctx);

  // Cached prefix: tools, prompt, and everything that doesn't change while they chat.
  const system = systemBlocks(block([S.profile(), S.targets(), S.phase(), S.energy(), S.mode(), S.foods(), S.recipes(), S.magazine(), S.motivations(), S.reviews(), S.checkins(), S.notes(), S.plan(), S.weights(), S.totals(S.yesterday), S.entries(S.detailFrom, S.yesterday)]));
  // What changes by the minute goes after the conversation, so it never breaks the cache:
  // the next message finds everything up to this one already cached.
  const live = `<live_data>\n${block([S.now(), S.today(), S.standing(), S.activity(), S.occasions(), S.adherence(), S.shopping(), S.focus()])}\n</live_data>`;
  // Photos ride only on the message they were sent with; later turns see the «[عکس غذا]» mark.
  const list = Array.isArray(images) ? images : images != null ? [images] : [];
  const photo = list.filter(okImage).slice(0, MAX_CHAT_PHOTOS).map(v => imageBlock(v as string));
  const base: any[] = turns.map((m, i) => ({ role: m.role, content: i === turns.length - 1 ? [...photo, { type: "text", text: m.content, cache_control: CACHE }] : [{ type: "text", text: m.content }] }));
  const withLive = (asSystem: boolean) => asSystem
    ? [...base, { role: "system", content: live }]
    : [...base.slice(0, -1), { role: "user", content: [...base[base.length - 1].content, { type: "text", text: live }] }];
  let messages = withLive(true);

  const body = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      const ask = () => {
        const stream: any = anthropic.beta.messages.stream({
          model: MODEL,
          max_tokens: 16000,
          betas: BETAS,
          fallbacks: "default",
          system,
          tools: TOOLS,
          output_config: { effort: "medium" },
          // inside a tool loop, also cache the growing tail (the first request marks the
          // last user message itself)
          ...(messages.length > base.length + 1 ? { cache_control: CACHE } : {}),
          messages,
        } as any);
        stream.on("text", (d: string) => send({ t: "text", v: d }));
        return stream.finalMessage();
      };
      try {
        for (let turn = 0; turn < 6; turn++) {
          let msg: any;
          try { msg = await ask(); } catch (e) {
            // A system message inside the conversation is rejected: send the live data as
            // part of the user's message instead (same caching, nothing has streamed yet).
            if (turn || !(e instanceof Anthropic.BadRequestError)) throw e;
            console.error("chat: retrying with live data in the user turn", e);
            messages = withLive(false);
            msg = await ask();
          }
          use.add("chat", msg);
          if (msg.stop_reason === "refusal") { send({ t: "text", v: "\n\n" + refusalText() }); break; }
          if (msg.stop_reason !== "tool_use") break;

          // Append the assistant turn unchanged (thinking blocks included), then answer every tool call.
          messages.push({ role: "assistant", content: msg.content });
          const results: any[] = [];
          for (const b of msg.content) {
            if (b.type !== "tool_use") continue;
            if (b.name === "get_entries") {
              const { from, to } = b.input || {};
              const ok = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to && to <= addDays(from, 61);
              const rows = ok ? (ctx.entries || []).filter(e => e.day >= from && e.day <= to).sort((a, c) => (a.day < c.day ? -1 : 1)) : [];
              results.push({ type: "tool_result", tool_use_id: b.id, is_error: !ok, content: ok ? (rows.map(entryLine).join("\n") || "nothing logged in that range") : "Invalid range: use YYYY-MM-DD, from <= to, at most 62 days." });
            } else if (b.name === "get_article") {
              const found = (ctx.magazine || []).filter(a => a.day === b.input?.day);
              const full = found.filter(a => a.body);
              results.push({ type: "tool_result", tool_use_id: b.id, is_error: !found.length, content: full.length ? full.map(articleText).join("\n\n") : found.length ? "The full text of this older article is not loaded here; you only have its title and summary. They can open it in «مجله» and tap «درباره‌ی این مقاله از هوشواره بپرس»." : "No article on that day." });
            } else if (b.name.startsWith("propose_")) {
              const fix = correction(b.name, b.input, ctx, S.toId);
              if (fix?.error) { results.push({ type: "tool_result", tool_use_id: b.id, is_error: true, content: fix.error }); continue; }
              send({ t: "action", v: fix ? { id: b.id, ...fix.action } : { id: b.id, type: b.name.slice(8), ...realIds(b.input, S.toId) } });
              results.push({ type: "tool_result", tool_use_id: b.id, content: "Shown to the user as a card. Nothing changes until they confirm it there." });
            } else {
              results.push({ type: "tool_result", tool_use_id: b.id, is_error: true, content: "Unknown tool." });
            }
          }
          messages.push({ role: "user", content: results });
        }
        send({ t: "done" });
      } catch (e) {
        console.error("chat failed", e);
        send({ t: "error", v: errorText(e) });
      } finally {
        await use.save();
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { ...CORS, "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" } });
}

function errorText(e: unknown) {
  if (e instanceof Anthropic.AuthenticationError) return "کلید API هوشواره درست نیست.";
  if (e instanceof Anthropic.RateLimitError) return "هوشواره الان شلوغ است؛ چند لحظه بعد دوباره امتحان کن.";
  if (e instanceof Anthropic.APIError && (e.status ?? 0) >= 500) return "سرور هوشواره موقتاً در دسترس نیست.";
  return "هوشواره جواب نداد؛ دوباره امتحان کن.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ error: "کلید API هوشواره هنوز تنظیم نشده." }, 503);

  // Only the signed-in owner, not just anyone holding the public key.
  const auth = req.headers.get("Authorization") || "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!user) return json({ error: "دوباره وارد شو." }, 401);

  if (Number(req.headers.get("content-length") || 0) > MAX_BODY) return json({ error: "too large" }, 413);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const ctx: Ctx = body?.ctx;
  if (!ctx?.today || !/^\d{4}-\d{2}-\d{2}$/.test(ctx.today)) return json({ error: "bad ctx" }, 400);

  const use = usageLog(sb);
  try {
    if (body.mode === "chat") return runChat(ctx, body.messages, body.images ?? body.image, use); // saves its usage when the stream ends
    const res = body.mode === "magazine" ? await runMagazine(ctx, body.input, use)
      : ONE_SHOT[body.mode] ? await runOneShot(body.mode, ctx, body.input, use)
      : json({ error: "unknown mode" }, 400);
    await use.save();
    return res;
  } catch (e) {
    console.error(body.mode, "failed", e);
    await use.save();
    return json({ error: errorText(e) }, 502);
  }
});
