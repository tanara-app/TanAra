/*
  هوشواره — TanAra's AI. One endpoint, several modes:

    chat      streamed reply (NDJSON lines) with tools that *propose* changes; the app
              shows each proposal as a card and only writes it after the user taps «ثبت».
    tip       today's short tip for the Today screen
    quote     a motivational sentence for the Motivation section
    review    analysis of one week + a suggested goal for next week
    progress  analysis of the weight trend
    estimate  calories / protein for a food the bank doesn't have

  The app sends its whole local state (it's the source of truth, including writes not yet
  synced), so the model always sees exactly what the user sees. The API key lives only in
  this function's secrets (ANTHROPIC_API_KEY). Every capability here is listed in HOOSHVAREH.md.
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
const SYSTEM = `You are «هوشواره» (Hooshvareh), the assistant inside تن‌آرا (TanAra), a Persian weight-loss and food-logging app used by one person. You can see everything they have recorded in the app (below). Speak to them directly.

Language and style
- Always answer in natural, warm, everyday Persian (Farsi). Use informal «تو». Never switch to English unless asked.
- This is read on a phone: be brief. Short paragraphs, at most a few bullets. Simple Markdown only (**bold**, "- " bullets). No tables, no headings, no emojis unless the user uses them.
- Ground what you say in their actual numbers and mention them (e.g. "این هفته میانگین پروتئینت ۶۲ گرم بود").
- Dates in the data are Gregorian ISO. When talking, use relative words (امروز، دیروز، سه‌شنبه‌ی گذشته، ۵ روز پیش) instead of converting to another calendar; the Persian date of today is given.
- Never show internal ids.

Nutrition and safety
- Give only well-established, evidence-based nutrition and behaviour advice. When something is uncertain or debated, say so briefly.
- Calorie estimates use Iranian household units (کفگیر، کف‌دست، قاشق، لیوان، ...) as in the food bank.
- Never suggest eating below the person's safety floor (given in the data), crash diets, long fasts, skipping meals as a strategy, diet pills, laxatives or supplements for weight loss.
- If weight is dropping more than ~1.5 kg/week for several weeks, or calories have been below the floor for days, gently say so and suggest seeing a doctor.
- You are not a doctor. If the profile lists medical conditions, medications, or a possible eating-disorder history, keep advice general and suggest checking with their doctor or a dietitian for anything specific. Warning signs that always mean "see a doctor": سرگیجه، ضعف شدید، تپش قلب، ریزش موی زیاد، any change in illness or medication.
- Be kind about slips. No guilt, no moralising about food.

Changing their data (chat only)
- You cannot write anything yourself. You can only propose, with the propose_* tools; the app shows each proposal as a card and saves it only if the person taps «ثبت».
- When they tell you they ate something, weighed themselves, want a motivation saved, or want a food added to the bank, call the matching tool (one call per item). Prefer an item from their food bank (pass its food_id) and scale its numbers by quantity; otherwise estimate.
- kcal and protein in propose_log_food are totals for the whole quantity eaten.
- After proposing, tell them briefly that it is waiting for their confirmation. Never say it has been saved.
- Use get_entries when you need individual foods from days older than the detailed window.`;

type Ctx = {
  today: string; todayFa?: string; now?: string;
  profile?: Record<string, unknown> | null;
  targets?: { kcal: number; protein: number; floor: number };
  foods?: any[]; entries?: any[]; weights?: any[]; reviews?: any[]; motivations?: any[]; notes?: any[];
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

// Everything the app knows, as compact text. Add new data types here when the app grows.
function snapshot(c: Ctx) {
  const entries = c.entries || [];
  const byDay = new Map<string, any[]>();
  for (const e of entries) (byDay.get(e.day) || byDay.set(e.day, []).get(e.day)!).push(e);
  const days = [...byDay.keys()].sort();
  const from = addDays(c.today, -(DETAIL_DAYS - 1));
  const out: string[] = [];

  out.push(`# Now\ntoday: ${c.today}${c.todayFa ? ` (${c.todayFa})` : ""}${c.now ? `, local time ${c.now}` : ""}`);
  out.push(`# Profile (from the onboarding questionnaire)\n${JSON.stringify(c.profile || {})}`);
  if (c.targets) out.push(`# Daily targets\ncalories: ${c.targets.kcal} kcal, protein: ${c.targets.protein} g, safety floor (never go below): ${c.targets.floor} kcal`);

  const weights = [...(c.weights || [])].sort((a, b) => (a.day < b.day ? -1 : 1));
  out.push(`# Weigh-ins (day | kg), all\n${weights.map(w => `${w.day} | ${r1(w.kg)}`).join("\n") || "none yet"}`);

  out.push(`# Daily totals, every logged day (day | kcal | protein g | veg servings | meals logged)\n${days.map(d => {
    const l = byDay.get(d)!;
    const k = l.reduce((s, e) => s + Number(e.kcal), 0);
    const p = l.reduce((s, e) => s + Number(e.protein), 0);
    const v = l.filter(e => e.is_veg).reduce((s, e) => s + Number(e.qty), 0);
    const meals = [...new Set(l.map(e => MEALS[e.meal] || e.meal))].join("، ");
    return `${d} | ${Math.round(k)} | ${Math.round(p)} | ${r1(v)} | ${meals}`;
  }).join("\n") || "nothing logged yet"}`);

  const recent = entries.filter(e => e.day >= from).sort((a, b) => (a.day + a.created_at < b.day + b.created_at ? -1 : 1));
  out.push(`# Every food logged in the last ${DETAIL_DAYS} days (day | meal | food | qty unit | kcal | protein)\n${recent.map(entryLine).join("\n") || "none"}`);

  const reviews = [...(c.reviews || [])].sort((a, b) => (a.week_start < b.week_start ? -1 : 1));
  out.push(`# Weekly reviews they wrote (weeks start Saturday)\n${reviews.map(r => `week of ${r.week_start}: good: ${r.good || "-"} / hard: ${r.hard || "-"} / next goal: ${r.next_goal || "-"}`).join("\n") || "none"}`);

  const kinds: Record<string, string> = { event: "upcoming event", image: "inspiring photo", before: "photo of themselves before", quote: "motivational sentence" };
  out.push(`# Motivations they saved\n${(c.motivations || []).map(m => `${kinds[m.kind] || m.kind}${m.day ? ` (${m.day})` : ""}: ${m.title || "(no title)"}${m.note ? ` — ${m.note}` : ""}${m.image_path ? " [has photo]" : ""}`).join("\n") || "none"}`);

  const notes = [...(c.notes || [])].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)).slice(-20);
  out.push(`# What you (Hooshvareh) already told them outside the chat, latest last\n${notes.map(n => `${n.key}: ${n.text}`).join("\n") || "none"}`);

  out.push(`# Their food bank (food_id | name | unit | kcal per unit | protein g per unit | veg)\n${(c.foods || []).map(f => `${f.id} | ${f.name} | ${f.unit} | ${Math.round(f.kcal)} | ${r1(f.protein)}${f.is_veg ? " | veg" : ""}`).join("\n")}`);
  return out.join("\n\n");
}

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
        qty: { type: "number", description: "how many units" },
        unit: { type: "string", description: "household unit, e.g. کفگیر" },
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
        kcal: { type: "number", description: "per one unit" }, protein: { type: "number", description: "grams per one unit" },
        category: { type: "string", enum: ["grain", "stew", "protein", "legume", "breakfast", "dairy", "fruit", "veg", "nuts", "drink", "sweet", "other"] },
        is_veg: { type: "boolean" },
      },
      required: ["name", "unit", "kcal", "protein", "category", "is_veg"],
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
];

/* ---------------- one-shot modes ---------------- */

const str = (d = "") => ({ type: "string", description: d });
const ONE_SHOT: Record<string, { effort: string; schema: any; prompt: (i: any) => string }> = {
  tip: {
    effort: "low",
    schema: { type: "object", properties: { text: str() }, required: ["text"], additionalProperties: false },
    prompt: () => `Write today's tip for the top of the Today screen: one or two short sentences (max ~35 words), one practical, evidence-based nutrition or habit tip tailored to what their recent data shows (e.g. protein below target, few vegetables, late-night snacking, gaps in logging, weight trend, an upcoming event). If there is little data, give a good general tip for starting out. Different in topic from your earlier tips. No greeting.`,
  },
  quote: {
    effort: "low",
    schema: { type: "object", properties: { text: str() }, required: ["text"], additionalProperties: false },
    prompt: (i) => `Write one motivational sentence for their Motivation section, in the first person as if they wrote it to themselves (max ~22 words), personal to their goals, events and progress. Not a cliché, not one they already have.${i?.draft ? ` They started writing: «${i.draft}» — build on it.` : ""} Only the sentence, without quotation marks.`,
  },
  review: {
    effort: "medium",
    schema: {
      type: "object",
      properties: { analysis: str("Persian, simple Markdown, max ~110 words"), next_goal: str("one small, concrete goal, max ~14 words") },
      required: ["analysis", "next_goal"], additionalProperties: false,
    },
    prompt: (i) => `Analyse their week from ${i.week_start} to ${addDays(String(i.week_start), 6)} (Saturday to Friday): how consistently they logged, calories vs target, protein, vegetables, weight change, and what they wrote in that week's review if anything. Start with what went well, then the one pattern most worth changing, then why. Then suggest one small, concrete, achievable goal for next week.`,
  },
  progress: {
    effort: "medium",
    schema: { type: "object", properties: { text: str("Persian, simple Markdown, max ~110 words") }, required: ["text"], additionalProperties: false },
    prompt: () => `Analyse their weight trend for the Progress screen: the overall direction and pace (use weekly averages, not single weigh-ins — daily water swings are normal), how it relates to their eating, whether the pace is healthy (0.25–1 kg/week is a good range), and one encouraging, practical next step. If there are too few weigh-ins, say what's needed.`,
  },
  estimate: {
    effort: "low",
    schema: {
      type: "object",
      properties: {
        name: str("cleaned-up Persian name"),
        unit: str("the most natural Iranian household unit for it"),
        kcal: { type: "number", description: "per one unit" },
        protein: { type: "number", description: "grams per one unit" },
        category: { type: "string", enum: ["grain", "stew", "protein", "legume", "breakfast", "dairy", "fruit", "veg", "nuts", "drink", "sweet", "other"] },
        is_veg: { type: "boolean" },
        note: str("one short Persian line on what was assumed (portion size, oil, ...)"),
      },
      required: ["name", "unit", "kcal", "protein", "category", "is_veg", "note"], additionalProperties: false,
    },
    prompt: (i) => `Estimate calories and protein for this food, for one household unit${i.unit ? ` (unit: ${i.unit})` : ""}, the way it is usually prepared and served in Iran: «${i.name}». Be realistic, slightly conservative-high rather than low. Use their food bank for consistency with similar items.`,
  },
};

/* ---------------- handler ---------------- */

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

function systemBlocks(ctx: Ctx) {
  return [
    { type: "text", text: SYSTEM },
    // The data changes whenever they log something; cached between chat turns.
    { type: "text", text: `<user_data>\n${snapshot(ctx)}\n</user_data>`, cache_control: { type: "ephemeral" } },
  ];
}

// Chat history from the app: plain text turns, oldest first. Keep it valid: starts with
// the user, alternates, ends with the user.
function cleanHistory(list: any[]) {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of (list || []).slice(-40)) {
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
  const res: any = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    betas: BETAS,
    fallbacks: "default",
    system: systemBlocks(ctx),
    output_config: { effort: m.effort, format: { type: "json_schema", schema: m.schema } },
    messages: [{ role: "user", content: m.prompt(input || {}) }],
  } as any);
  if (res.stop_reason === "refusal") return json({ error: refusalText() }, 422);
  const text = res.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  try { return json({ result: JSON.parse(text) }); } catch { return json({ error: "پاسخ هوشواره ناقص بود؛ دوباره امتحان کن." }, 502); }
}

function runChat(ctx: Ctx, history: any[]) {
  const messages: any[] = cleanHistory(history);
  if (!messages.length || messages[messages.length - 1].role !== "user") return json({ error: "پیامی نیست." }, 400);
  const enc = new TextEncoder();

  const body = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        for (let turn = 0; turn < 6; turn++) {
          const stream: any = anthropic.beta.messages.stream({
            model: MODEL,
            max_tokens: 16000,
            betas: BETAS,
            fallbacks: "default",
            system: systemBlocks(ctx),
            tools: TOOLS,
            output_config: { effort: "medium" },
            cache_control: { type: "ephemeral" },
            messages,
          } as any);
          stream.on("text", (d: string) => send({ t: "text", v: d }));
          const msg: any = await stream.finalMessage();
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
            } else if (b.name.startsWith("propose_")) {
              send({ t: "action", v: { id: b.id, type: b.name.slice(8), ...b.input } });
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
    if (ONE_SHOT[body.mode]) return await runOneShot(body.mode, ctx, body.input);
    return json({ error: "unknown mode" }, 400);
  } catch (e) {
    console.error(body.mode, "failed", e);
    return json({ error: errorText(e) }, 502);
  }
});
