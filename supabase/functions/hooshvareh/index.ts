/*
  هوشواره — TanAra's AI. One endpoint, several modes:

    chat      streamed reply (NDJSON lines) with tools that *propose* changes; the app
              shows each proposal as a card and only writes it after the user taps «ثبت».
    tip       today's short tip for the Today screen
    quote     a motivational sentence for the Motivation section
    review    analysis of one week + a suggested goal for next week
    progress  analysis of the weight trend
    estimate  calories / protein / weight of one unit for a food the bank doesn't have
    title     a short name for a chat conversation
    plan      a two-week diet plan: options with amounts for each meal, from the food bank
    plan_option  one more option for one meal of the current plan
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
  Each call logs its token usage (console) so the effect of a change can be checked.
*/
import Anthropic from "npm:@anthropic-ai/sdk@0.132.1";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const MODEL = "claude-sonnet-5-5";
// Server-side fallback: if a safety classifier declines, the API retries on the model
// Anthropic recommends for that category instead of failing the request.
const BETAS = ["server-side-fallback-2026-07-01"];
const MAX_BODY = 4_000_000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/* ---------------- prompt ---------------- */

// Frozen, so it stays a cacheable prefix. Anything that changes goes in the data block.
const SYSTEM = `You are «هوشواره» (Hooshvareh), the assistant inside تن‌آرا (TanAra), a Persian weight-loss and food-logging app used by one person. You can see what they have recorded in the app (in <user_data> below; in a chat, the part that changes during the day — the time, what they logged today — comes in <live_data> at the end of the conversation, added by the app, not written by them). Speak to them directly.

Language and style
- Always answer in natural, warm, everyday Persian (Farsi). Use informal «تو». Never switch to English unless asked.
- This is read on a phone: be brief. Short paragraphs, at most a few bullets. Simple Markdown only (**bold**, "- " bullets). No tables, no headings, no emojis unless the user uses them.
- Ground what you say in their actual numbers and mention them (e.g. "این هفته میانگین پروتئینت ۶۲ گرم بود").
- Dates in the data are Gregorian ISO. When talking, use relative words (امروز، دیروز، سه‌شنبه‌ی گذشته، ۵ روز پیش) instead of converting to another calendar; the Persian date of today is given.
- Never show internal ids.

Nutrition and safety
- Give only well-established, evidence-based nutrition and behaviour advice. When something is uncertain or debated, say so briefly.
- Calorie estimates use Iranian household units (کفگیر، کف‌دست، قاشق، لیوان، ...) as in the food bank. Each bank food also has the weight in grams of one unit, so amounts can be logged in grams (unit «گرم», qty = grams).
- Never suggest eating below the person's safety floor (given in the data), crash diets, long fasts, skipping meals as a strategy, diet pills, laxatives or supplements for weight loss.
- If weight is dropping more than ~1.5 kg/week for several weeks, or calories have been below the floor for days, gently say so and suggest seeing a doctor.
- You are not a doctor. If the profile lists medical conditions, medications, or a possible eating-disorder history, keep advice general and suggest checking with their doctor or a dietitian for anything specific. Warning signs that always mean "see a doctor": سرگیجه، ضعف شدید، تپش قلب، ریزش موی زیاد، any change in illness or medication.
- Be kind about slips. No guilt, no moralising about food.

Changing their data (chat only)
- You cannot write anything yourself. You can only propose, with the propose_* tools; the app shows each proposal as a card and saves it only if the person taps «ثبت».
- When they tell you they ate something, weighed themselves, want a motivation saved, or want a food added to the bank, call the matching tool (one call per item). Prefer an item from their food bank (pass its food_id) and scale its numbers by quantity; otherwise estimate.
- kcal and protein in propose_log_food are totals for the whole quantity eaten.
- After proposing, tell them briefly that it is waiting for their confirmation. Never say it has been saved.
- Use get_entries when you need individual foods from days older than the detailed window, and get_article for the full text of a magazine article before discussing its content, unless that text is already in the data.
- «صندوقچه» is their private, PIN-locked collection of motivating photos and videos (opened from the motivation card on Today, or from «نمایه»). You only know how many items it holds and when it was last opened. When they sound discouraged, tempted to quit, or it has not been opened for a week or more, you may suggest a look inside; otherwise do not bring it up, and never guess what is in it.

The two modes of the app
- «شمارش کالری»: they log what they eat and watch calories and protein. «رژیم»: you design a two-week plan — for each of five eating occasions a list of options with set amounts, built only from their food bank — and they tick what they ate; ticking logs those foods, so both modes share one record. At the end of the two weeks they weigh in and you design the next period from the result.
- «مجله» is a tab where you publish one researched article a day for them, with links to the sources. The data lists those articles; when they ask about one, answer from its text and sources, and do not invent studies beyond them.
- When the data has a diet plan, answer questions about what to eat from it, and treat days that followed it as a success even if calories were not counted. You cannot change the plan from the chat: for another choice in a meal point them to «یک گزینه‌ی دیگر» under that meal, and for a whole new plan to «برنامه‌ی تازه» on the Today screen.`;

type Ctx = {
  today: string; todayFa?: string; now?: string;
  profile?: Record<string, unknown> | null;
  targets?: { kcal: number; protein: number; floor: number };
  foods?: any[]; entries?: any[]; weights?: any[]; reviews?: any[]; motivations?: any[]; notes?: any[];
  vault?: { photos: number; videos: number; links: number; lastOpened: string | null } | null;
  mode?: string; plan?: any; magazine?: any[]; focus?: string;
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
    plan: () => pl ? `# Current diet plan (you designed it), ${pl.start} to ${pl.end}, for ${pl.kcal} kcal/day\n${(pl.slots || []).map((s: any) => `## ${s.slot} — they pick ${s.pick}\n${s.options.map((o: string) => `- ${o}`).join("\n")}`).join("\n")}\nFree when hungry: ${(pl.free || []).join("، ") || "-"}\nWhat you told them about it: ${pl.note || "-"}${pl.previous ? `\nPlan before it: from ${pl.previous.start}, ${pl.previous.kcal} kcal/day, ${pl.previous.adherence.done} of ${pl.previous.adherence.of} occasions eaten as planned` : ""}` : "",
    adherence: () => pl ? `# Following the plan, last 4 weeks (day | occasions eaten as planned of 5)\n${(pl.days || []).map((d: any) => `${d.day} | ${d.done}/${d.of}`).join("\n") || "none"}` : "",
    weights: () => `# Weigh-ins (day | kg), all\n${[...(c.weights || [])].sort((a, b) => (a.day < b.day ? -1 : 1)).map(w => `${w.day} | ${r1(w.kg)}`).join("\n") || "none yet"}`,

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
    motivations: () => `# Motivations they saved\n${(c.motivations || []).map(m => `${kinds[m.kind] || m.kind}${m.day ? ` (${m.day})` : ""}: ${m.title || "(no title)"}${m.note ? ` — ${m.note}` : ""}${m.image_path ? " [has photo]" : ""}`).join("\n") || "none"}${c.vault ? `\nPrivate «صندوقچه» (PIN-locked; you cannot see inside): ${c.vault.photos} photos, ${c.vault.videos} videos, ${c.vault.links} links; last opened ${c.vault.lastOpened || "never on this phone"}` : ""}`,
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
    foods: () => `# Their food bank (food_id | name | unit | grams in one unit | kcal per unit | protein g per unit | veg)\n${foods.map(f => `${f.alias} | ${f.name} | ${f.unit} | ${f.grams ? r1(f.grams) : "?"} | ${r1(f.kcal)} | ${r1(f.protein)}${f.is_veg ? " | veg" : ""}`).join("\n")}`,
  };
}
type Sections = ReturnType<typeof sections>;
const block = (list: string[]) => list.filter(Boolean).join("\n\n");

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
        is_veg: { type: "boolean", description: "counts as a vegetable serving" },
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
        is_veg: { type: "boolean" },
      },
      required: ["name", "unit", "grams", "kcal", "protein", "category", "is_veg"],
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
- Realistic Iranian combinations and household amounts a person can measure without a scale; 1–4 foods per option.
- Respect profile.planPrefs (dislikes, allergies, notes) strictly, and medical conditions in the profile in the general, well-established way (e.g. diabetes: no sugary items or juice, prefer whole grains and legumes; blood pressure / heart: avoid salty and fried; kidney disease: do not push protein above the target). Prefer foods they actually log and like over foods they never eat.`;

// `data`: the sections this mode needs — nothing else is sent. `shared`: sections that stay
// the same between calls made in a row (the food bank); only those are worth caching.
type OneShot = {
  effort: string; max_tokens?: number; schema: any; prompt: (i: any) => string;
  system?: string; shared?: (S: Sections) => string[]; data?: (S: Sections, i: any) => string[];
};
const ONE_SHOT: Record<string, OneShot> = {
  plan: {
    effort: "medium",
    max_tokens: 20000,
    data: (S) => [S.now(), S.profile(), S.targets(), S.mode(), S.foods(), S.plan(), S.adherence(), S.weights(), S.totals(), S.recent(), S.reviews()],
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
  tip: {
    effort: "low",
    data: (S) => [S.now(), S.profile(), S.targets(), S.mode(), S.plan(), S.adherence(), S.weights(), S.totals(), S.recent(), S.reviews(), S.motivations(), S.notes()],
    schema: { type: "object", properties: { text: str() }, required: ["text"], additionalProperties: false },
    prompt: () => `Write today's tip for the top of the Today screen: one or two short sentences (max ~35 words), one practical, evidence-based nutrition or habit tip tailored to what their recent data shows (e.g. protein below target, few vegetables, late-night snacking, gaps in logging, weight trend, an upcoming event). If there is little data, give a good general tip for starting out. Different in topic from your earlier tips. No greeting.`,
  },
  quote: {
    effort: "low",
    data: (S) => [S.now(), S.profile(), S.targets(), S.weights(), S.totals(), S.reviews(), S.motivations()],
    schema: { type: "object", properties: { text: str() }, required: ["text"], additionalProperties: false },
    prompt: (i) => `Write one motivational sentence for their Motivation section, in the first person as if they wrote it to themselves (max ~22 words), personal to their goals, events and progress. Not a cliché, not one they already have.${i?.draft ? ` They started writing: «${i.draft}» — build on it.` : ""} Only the sentence, without quotation marks.`,
  },
  review: {
    effort: "medium",
    data: (S, i) => [S.now(), S.profile(), S.targets(), S.mode(), S.plan(), S.adherence(), S.weights(), S.totals(), S.entries(String(i.week_start), addDays(String(i.week_start), 6)), S.reviews()],
    schema: {
      type: "object",
      properties: { analysis: str("Persian, simple Markdown, max ~110 words"), next_goal: str("one small, concrete goal, max ~14 words") },
      required: ["analysis", "next_goal"], additionalProperties: false,
    },
    prompt: (i) => `Analyse their week from ${i.week_start} to ${addDays(String(i.week_start), 6)} (Saturday to Friday): how consistently they logged, calories vs target, protein, vegetables, weight change, and what they wrote in that week's review if anything. Start with what went well, then the one pattern most worth changing, then why. Then suggest one small, concrete, achievable goal for next week.`,
  },
  progress: {
    effort: "medium",
    data: (S) => [S.now(), S.profile(), S.targets(), S.mode(), S.adherence(), S.weights(), S.totals(), S.reviews()],
    schema: { type: "object", properties: { text: str("Persian, simple Markdown, max ~110 words") }, required: ["text"], additionalProperties: false },
    prompt: () => `Analyse their weight trend for the Progress screen: the overall direction and pace (use weekly averages, not single weigh-ins — daily water swings are normal), how it relates to their eating, whether the pace is healthy (0.25–1 kg/week is a good range), and one encouraging, practical next step. If there are too few weigh-ins, say what's needed.`,
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
        is_veg: { type: "boolean" },
        note: str("one short Persian line on what was assumed (portion size, oil, ...)"),
      },
      required: ["name", "unit", "grams", "kcal", "protein", "category", "is_veg", "note"], additionalProperties: false,
    },
    prompt: (i) => `Estimate calories, protein and the weight in grams for this food, for one household unit${i.unit ? ` (unit: ${i.unit}${i.unit === "گرم" ? " — then grams is 1 and kcal/protein are per gram" : ""})` : ""}, the way it is usually prepared and served in Iran: «${i.name}». Be realistic, slightly conservative-high rather than low. Keep kcal consistent with grams (realistic energy density). Use their food bank for consistency with similar items.`,
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

const logUsage = (mode: string, msg: any) => console.log(JSON.stringify({ mode, stop: msg?.stop_reason, usage: msg?.usage }));

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

async function runOneShot(mode: string, ctx: Ctx, input: any) {
  const m = ONE_SHOT[mode];
  const S = sections(ctx);
  const res: any = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: m.max_tokens || 8000,
    betas: BETAS,
    fallbacks: "default",
    system: m.system || systemBlocks(block(m.shared?.(S) || []), block(m.data?.(S, input || {}) || []), NOTE),
    output_config: { effort: m.effort, format: { type: "json_schema", schema: m.schema } },
    messages: [{ role: "user", content: m.prompt(input || {}) }],
  } as any);
  logUsage(mode, res);
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

async function runMagazine(ctx: Ctx, input: any) {
  const messages: any[] = [{ role: "user", content: magazinePrompt(input || {}) }];
  const S = sections(ctx);
  // No food bank and no article list (the prompt already names the earlier titles). Cached:
  // the search loop re-reads this prefix on every step.
  const system = systemBlocks(block([S.now(), S.profile(), S.targets(), S.mode(), S.plan(), S.adherence(), S.weights(), S.totals(), S.recent(), S.reviews()]), "", NOTE);
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
    logUsage("magazine", msg);
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

function runChat(ctx: Ctx, history: any[]) {
  const turns = cleanHistory(history);
  if (!turns.length || turns[turns.length - 1].role !== "user") return json({ error: "پیامی نیست." }, 400);
  const enc = new TextEncoder();
  const S = sections(ctx);

  // Cached prefix: tools, prompt, and everything that doesn't change while they chat.
  const system = systemBlocks(block([S.profile(), S.targets(), S.mode(), S.foods(), S.magazine(), S.motivations(), S.reviews(), S.notes(), S.plan(), S.weights(), S.totals(S.yesterday), S.entries(S.detailFrom, S.yesterday)]));
  // What changes by the minute goes after the conversation, so it never breaks the cache:
  // the next message finds everything up to this one already cached.
  const live = `<live_data>\n${block([S.now(), S.today(), S.adherence(), S.focus()])}\n</live_data>`;
  const base: any[] = turns.map((m, i) => ({ role: m.role, content: [{ type: "text", text: m.content, ...(i === turns.length - 1 ? { cache_control: CACHE } : {}) }] }));
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
          logUsage("chat", msg);
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
              send({ t: "action", v: { id: b.id, type: b.name.slice(8), ...realIds(b.input, S.toId) } });
              results.push({ type: "tool_result", tool_use_id: b.id, content: "Shown to the user as a card. Nothing is saved until they tap «ثبت»." });
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

  try {
    if (body.mode === "chat") return runChat(ctx, body.messages);
    if (body.mode === "magazine") return await runMagazine(ctx, body.input);
    if (ONE_SHOT[body.mode]) return await runOneShot(body.mode, ctx, body.input);
    return json({ error: "unknown mode" }, 400);
  } catch (e) {
    console.error(body.mode, "failed", e);
    return json({ error: errorText(e) }, 502);
  }
});
