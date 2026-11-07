/*
  مجله — the shared weekly article of TanAra. One article a week (Saturday → Friday, Tehran
  time) for everyone in the app, so it costs one article a week in all instead of one per person.

    POST + x-cron-key   pg_cron, Saturday morning (20261108_magazine_shared.sql): writes this
                        week's article if it doesn't exist yet. Answers at once (202) and writes
                        in the background.
    POST + user JWT     the owner only (usage_members.admin): { topic? } writes this week's
                        article now, optionally on a topic. Waits for it (about a minute).

  The article is researched with Claude's web search, limited to MAG_DOMAINS, and is general:
  no member's data is sent, since everyone reads the same text (each person can still ask
  Hooshvareh about it in the chat, which sees their own data). Stored in the `magazine` table;
  every app copies the ready ones into its own ai_notes, and `remind` pushes the new one to every
  device with notifications on. Token use goes to ai_usage under the owner, mode 'magazine'.

  Deployed with verify_jwt off: the cron call carries no JWT, so each path checks its own
  credential (the cron key in app_secrets, or a signed-in owner).
*/
import Anthropic from "npm:@anthropic-ai/sdk@0.132.1";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const MODEL = "claude-sonnet-5-5";
const BETAS = ["server-side-fallback-2026-07-01"];
const STALE_MS = 10 * 60_000; // a 'writing' row older than this was left by a run that died

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

/* ---------------- the week ---------------- */

function tehranDay() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const addDays = (day: string, n: number) => {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekStart = (day: string) => addDays(day, -((new Date(day + "T12:00:00Z").getUTCDay() + 1) % 7)); // Saturday

/* ---------------- what an article may be ---------------- */

// The only places an article may cite. Subdomains are included (nih.gov covers PubMed).
const MAG_DOMAINS = [
  "who.int", "nih.gov", "cdc.gov", "nhs.uk", "nice.org.uk", "cochranelibrary.com", "cochrane.org",
  "health.harvard.edu", "hsph.harvard.edu", "mayoclinic.org", "bmj.com", "thelancet.com", "jamanetwork.com",
  "nejm.org", "nature.com", "ajcn.nutrition.org", "eatright.org", "heart.org", "diabetes.org", "efsa.europa.eu",
];
// Same order as CATS in js/ui/magazine.js: the section of the week rotates through them.
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
const KEYS = Object.keys(MAG_CATEGORIES);
const categoryFor = (week: string) => KEYS[Math.round(Date.parse(week + "T00:00:00Z") / 6048e5) % KEYS.length];

const str = (d = "") => ({ type: "string", description: d });
const PUBLISH_TOOL = {
  name: "publish_article",
  description: "Publish the finished magazine article to the app. Call exactly once, after researching.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      topic: str("short English slug of the subject, e.g. protein-and-satiety"),
      category: { type: "string", enum: KEYS },
      title: str("Persian headline, max ~9 words, accurate, not clickbait"),
      summary: str("Persian, 1–2 sentences: what the reader will learn"),
      minutes: { type: "integer", description: "reading time in minutes" },
      body: str("the article in Persian Markdown: paragraphs, 2–4 «## » subheadings, **bold**, «- » bullets. 350–550 words."),
      key_points: { type: "array", items: str("one short Persian sentence"), description: "exactly 3 takeaways" },
      try_this: str("Persian, 1–2 sentences: one small, concrete thing any reader can try this week"),
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
    required: ["topic", "category", "title", "summary", "minutes", "body", "key_points", "try_this", "evidence", "sources"],
    additionalProperties: false,
  },
};

const SYSTEM = `You are «هوشواره» (Hooshvareh), the assistant inside تن‌آرا (TanAra), a Persian weight-loss and food-logging app. Here you write the app's weekly magazine («مجله»): one article a week that every member of the app reads, a small group of Iranian adults (and possibly 16–17-year-olds) who are losing weight or keeping it off, some with conditions such as diabetes, high blood fats, high blood pressure, fatty liver, gout, kidney stones or reflux. You know nothing about any one reader, so never write as if you do.

- Write in natural, warm, everyday Persian (Farsi), addressing the reader with informal «تو». Never switch to English.
- Give only well-established, evidence-based nutrition and behaviour information. When something is uncertain or debated, say so plainly.
- Never suggest crash diets, very low calorie intakes, long fasts, skipping meals as a strategy, diet pills, laxatives or supplements for weight loss (an article may explain what the evidence says about them, including that it is weak).
- You are not a doctor: no diagnosis. When advice would differ for a medical condition, pregnancy, medication or a teenager, say in one line that they should check with their doctor or a dietitian.
- Be kind: no guilt, no moralising about food or bodies.
- Ground it in an Iranian everyday kitchen and routine (نان، برنج، خورش، چای، مهمانی، ...).`;

const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
const trusted = (u: string) => { const h = hostOf(u); return /^https:/.test(u) && MAG_DOMAINS.some(d => h === d || h.endsWith("." + d)); };
const normUrl = (u: string) => u.replace(/[#?].*$/, "").replace(/\/+$/, "").toLowerCase();

function prompt(category: string, topic: string, previous: string[]) {
  return `Write this week's article.

${topic ? `The app's owner asked for an article about: «${topic}». If that is not about weight, nutrition, activity, sleep, habits or health around them, pick the closest topic that is and say so in the summary.` : `This week's section: ${MAG_CATEGORIES[category]}. Within it, choose the single topic most useful to most people losing weight or keeping it off.`}
Do not repeat a subject already covered: ${previous.slice(0, 80).map(t => `«${t.slice(0, 80)}»`).join("، ") || "nothing yet"}.

Research first, with web_search. Two or three focused searches are usually enough: stop once you have 2–4 solid sources. Results are limited to major health bodies, systematic-review publishers and leading journals. Prefer guidelines, systematic reviews and meta-analyses over single studies, and recent over old. Base every factual claim on what you actually read in the results; if the evidence is mixed or weak, say so plainly and set "evidence" accordingly. Do not cite anything from memory. Numbers (effect sizes, amounts) only when a source gives them.

Then call publish_article once. Write it like a good science journalist: a concrete opening, what the evidence shows, what it means day to day, and what is still uncertain. Name the source body in the text where it matters (e.g. «مرور کاکرین در ۲۰۲۳»), and list in "sources" only pages that appeared in your search results, with their exact URLs. Do not write the article as plain text.`;
}

type Usage = Record<string, unknown>;

async function write(category: string, topic: string, previous: string[], use: Usage[]) {
  const messages: any[] = [{ role: "user", content: prompt(category, topic, previous) }];
  const system = [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }];
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
      ...(turn ? { cache_control: { type: "ephemeral" } } : {}),
      messages,
    } as any) as any).finalMessage();
    console.log(JSON.stringify({ mode: "magazine", stop: msg?.stop_reason, usage: msg?.usage }));
    const u = msg?.usage;
    if (u) use.push({
      mode: "magazine", input: u.input_tokens || 0, cache_read: u.cache_read_input_tokens || 0, cache_write: u.cache_creation_input_tokens || 0,
      output: u.output_tokens || 0, searches: u.server_tool_use?.web_search_requests || 0,
    });
    if (msg.stop_reason === "refusal") throw new Error("هوشواره این مقاله را ننوشت؛ موضوع دیگری امتحان کن.");

    // URLs from server-tool results and citations only — never from the model's own prose.
    for (const b of msg.content) {
      if (b.type === "tool_use" || b.type === "thinking") continue;
      const raw = JSON.stringify(b.type === "text" ? (b.citations || []) : b);
      for (const x of raw.match(/https:\/\/[^\s"\\<>)]+/g) || []) seen.add(normUrl(x));
    }

    const call = msg.content.find((b: any) => b.type === "tool_use" && b.name === "publish_article");
    if (call) {
      const a = call.input || {};
      const sources = (a.sources || []).filter((s: any) => s?.url && trusted(s.url) && (!seen.size || seen.has(normUrl(s.url))));
      if (!sources.length || !a.title || !a.body) throw new Error("برای این موضوع منبع معتبری پیدا نشد؛ دوباره امتحان کن.");
      return { ...a, sources, shared: true };
    }
    messages.push({ role: "assistant", content: msg.content });
    // pause_turn: the server-side search loop wants to go on; resending continues it.
    if (msg.stop_reason !== "pause_turn") messages.push({ role: "user", content: "Now call publish_article with the finished article." });
  }
  throw new Error("مقاله آماده نشد؛ دوباره امتحان کن.");
}

/* ---------------- one article per week ---------------- */

// Takes the week for this run. False when it is already written or another run is writing it.
async function claim(week: string) {
  const { data: made } = await admin.from("magazine").insert({ week }).select("week");
  if (made?.length) return true;
  const { data: row } = await admin.from("magazine").select("status,updated_at").eq("week", week).maybeSingle();
  if (!row || row.status === "ready") return false;
  if (row.status === "writing" && Date.now() - Date.parse(row.updated_at) < STALE_MS) return false;
  const { data: took } = await admin.from("magazine")
    .update({ status: "writing", error: null, updated_at: new Date().toISOString() })
    .eq("week", week).eq("updated_at", row.updated_at).select("week");
  return !!took?.length;
}

async function run(week: string, topic: string, owner: string | null) {
  const use: Usage[] = [];
  try {
    const { data: prev } = await admin.from("magazine").select("data").eq("status", "ready").order("week", { ascending: false }).limit(80);
    const previous = (prev || []).map(r => String(r.data?.title || "")).filter(Boolean);
    const article = await write(categoryFor(week), topic.slice(0, 300).trim(), previous, use);
    await admin.from("magazine").update({ status: "ready", data: article, error: null, updated_at: new Date().toISOString() }).eq("week", week);
    return { article };
  } catch (e) {
    console.error("magazine failed", e);
    const error = e instanceof Error && /[؀-ۿ]/.test(e.message) ? e.message : "مقاله آماده نشد؛ دوباره امتحان کن.";
    await admin.from("magazine").update({ status: "failed", error, updated_at: new Date().toISOString() }).eq("week", week);
    return { error };
  } finally {
    if (owner && use.length) {
      const { error } = await admin.from("ai_usage").insert(use.map(r => ({ ...r, user_id: owner })));
      if (error) console.error("usage not saved:", error.message);
    }
  }
}

const firstOwner = async () => {
  const { data } = await admin.from("usage_members").select("user_id").eq("admin", true).limit(1);
  return (data?.[0]?.user_id as string) || null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ error: "کلید API هوشواره هنوز تنظیم نشده." }, 503);
  const week = weekStart(tehranDay());

  const cron = req.headers.get("x-cron-key");
  if (cron !== null) {
    const { data: key } = await admin.from("app_secrets").select("value").eq("key", "cron_key").maybeSingle();
    if (!key?.value || cron !== key.value) return json({ error: "forbidden" }, 403);
    if (!(await claim(week))) return json({ week, skipped: true });
    EdgeRuntime.waitUntil(firstOwner().then(owner => run(week, "", owner)));
    return json({ week, started: true }, 202);
  }

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return json({ error: "دوباره وارد شو." }, 401);
  const { data: me } = await admin.from("usage_members").select("admin").eq("user_id", user.id).maybeSingle();
  if (!me?.admin) return json({ error: "مقاله‌ی مجله را فقط صاحب اپ می‌تواند زودتر بنویسد." }, 403);
  const body = await req.json().catch(() => ({}));
  if (!(await claim(week))) {
    const { data: row } = await admin.from("magazine").select("status").eq("week", week).maybeSingle();
    return row?.status === "ready" ? json({ week, ready: true }) : json({ error: "مقاله‌ی این هفته همین الان در حال نوشته شدن است." }, 409);
  }
  const res = await run(week, String(body?.topic || ""), user.id);
  return res.error ? json({ error: res.error }, 502) : json({ week, ready: true });
});
