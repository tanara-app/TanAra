/*
  Reminders — web push for TanAra, so the app can nudge when it is closed.

    GET                    the public VAPID key browsers subscribe with
    POST + x-cron-key      the database calls this every 10 minutes (pg_cron, see the
                           migration); whoever is due gets a notification
    POST + user JWT        { test: true } sends a test notification to that person's devices
                           { family: true } lists who in the family land can get «به یادتم» now,
                           { nudge: id } sends it (BAZGASHT.md, phase 6)

  What is due comes from the profile (profile.data.reminders, set in «نمایه» ← «تنظیمات» ← «یادآورها»):
    log    at a chosen evening time (or, for one who never set it, half an hour after they usually
           finish logging: BAZGASHT.md phase 8), if fewer than two meals were logged that day — but not
           in maintenance with light logging on while the weight is in its band (the same
           rule as js/domain/phase.js → lightOn). The text changes every night. Someone with
           nothing recorded for 3 days or more gets the pushes of an absence instead
           (BAZGASHT.md, phase 1): day 3, day 5, a last one, then only the first of a Persian
           month; and no weigh-in reminder meanwhile. During a «مکث» (profile.data.pauses, phase 5)
           neither reminder goes; the day after it, the evening one says the pause is over. The last
           push opens «چه شد؟» (#/why, phase 7); one who answered «فعلاً نمی‌خواهم» gets nothing at all
           until profile.data.quietUntil
    weigh  at a chosen morning time, if the last weigh-in is `every` days old or more
           (the text also asks for the waist when that is two weeks old, and is warmer after
           a long gap: stopping weighing is how regain usually starts)
    mag    the week's shared magazine article (table magazine), once per device, between 9:00
           and 22:00, to everyone with a subscription
    reward a reward in «جوایز» they have not seen yet (profile.data.rewardsSeen), once per newest
           such reward and device, between 9:00 and 22:00, to everyone with a subscription
           (the owner's request, 2026-11-20); it opens «جوایز» (./#/rewards)
  Times are in the person's own time zone (reminders.tz). The texts are fixed: no AI call.
  Every push that reached at least one device is a row in push_log (kind, mark, time).

  Deployed with verify_jwt off: the cron call carries no JWT, so each path checks its own
  credential. The VAPID key pair is made here on first use and kept in app_secrets (service
  role only); the private key never leaves the server.
*/
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const APP_URL = "https://tanara-app.github.io";
const WINDOW_MIN = 120; // a reminder may go out up to this long after its time (covers a missed cron run)

/* ---------------- bytes ---------------- */

const enc = new TextEncoder();
const b64u = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), c => c.charCodeAt(0));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

/* ---------------- secrets ---------------- */

type Keys = { publicKey: string; privateKey: CryptoKey; cronKey: string };
let cached: Keys | null = null;

async function keys(): Promise<Keys> {
  if (cached) return cached;
  const read = async () => {
    const { data, error } = await admin.from("app_secrets").select("key,value");
    if (error) throw error;
    return Object.fromEntries((data || []).map(r => [r.key, r.value])) as Record<string, string>;
  };
  let s = await read();
  if (!s.vapid_private || !s.vapid_public) {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const rows = [
      { key: "vapid_private", value: JSON.stringify(await crypto.subtle.exportKey("jwk", pair.privateKey)) },
      { key: "vapid_public", value: b64u(await crypto.subtle.exportKey("raw", pair.publicKey)) },
    ];
    // two cold starts at once: the first insert wins and both then read the same pair
    await admin.from("app_secrets").upsert(rows, { onConflict: "key", ignoreDuplicates: true });
    s = await read();
  }
  const privateKey = await crypto.subtle.importKey("jwk", JSON.parse(s.vapid_private), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  cached = { publicKey: s.vapid_public, privateKey, cronKey: s.cron_key || "" };
  return cached;
}

/* ---------------- web push (RFC 8291 encryption, RFC 8292 VAPID) ---------------- */

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, len * 8));
}

// The message body in the aes128gcm content coding, readable only by that browser.
async function encrypt(sub: { p256dh: string; auth: string }, text: string) {
  const uaPublic = unb64u(sub.p256dh);
  const authSecret = unb64u(sub.auth);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plain = concat(enc.encode(text), new Uint8Array([2])); // 0x02: the last (only) record
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plain));
  const header = concat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([asPublic.length]), asPublic); // record size 4096
  return concat(header, cipher);
}

async function vapidHeader(endpoint: string, k: Keys) {
  const part = (o: unknown) => b64u(enc.encode(JSON.stringify(o)));
  const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: APP_URL })}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, k.privateKey, enc.encode(unsigned));
  return `vapid t=${unsigned}.${b64u(sig)}, k=${k.publicKey}`;
}

type Sub = { endpoint: string; user_id: string; p256dh: string; auth: string; sent: Record<string, string> };
type Note = { title: string; body: string; tag: string; url: string };

// Sends one notification. Returns the push service's status; a subscription the service no
// longer knows (404/410: uninstalled, permission withdrawn) is deleted.
async function push(sub: Sub, note: Note, k: Keys) {
  let status = 0;
  try {
    // only a real push service is ever called: https, and never an address on this network
    const u = new URL(sub.endpoint);
    if (u.protocol !== "https:" || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(u.hostname)) return 0;
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "7200", Urgency: "normal",
        Authorization: await vapidHeader(sub.endpoint, k),
      },
      body: await encrypt(sub, JSON.stringify(note)),
    });
    status = res.status;
    await res.body?.cancel();
  } catch (e) {
    console.error("push failed", e);
  }
  if (status === 404 || status === 410) await admin.from("push_subs").delete().eq("endpoint", sub.endpoint);
  return status;
}

/* ---------------- what is due ---------------- */

function localNow(tz: string) {
  const parts = (zone: string) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).map(p => [p.type, p.value]));
  let p: Record<string, string>;
  try { p = parts(tz); } catch { p = parts("Asia/Tehran"); }
  return { day: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}
const minutes = (hhmm: unknown, fallback: number) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86400000);
const inWindow = (now: number, at: number) => now >= at && now < at + WINDOW_MIN;
const BAND_KG = 1;     // js/domain/phase.js
const LAPSE_DAYS = 10; // js/domain/phase.js

// Light logging in force: in maintenance, chosen, and the 7-day average not above the band.
async function lightOn(data: any, user: string, day: string) {
  const kg = Number(data?.maintainFrom?.kg);
  if (data?.phase !== "maintain" || !data?.lightLog || !(kg > 0)) return false;
  const { data: rows } = await admin.from("weights").select("kg").eq("user_id", user).gte("day", addDays(day, -6)).lte("day", day);
  if (!rows?.length) return true;
  const avg = rows.reduce((s, r) => s + Number(r.kg), 0) / rows.length;
  return avg < kg + BAND_KG - 1e-9;
}
const addDays = (day: string, n: number) => {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function latest(table: string, user: string) {
  const { data } = await admin.from(table).select("day").eq("user_id", user).order("day", { ascending: false }).limit(1);
  return data?.[0]?.day as string | undefined;
}

// A text that changes every day, so the same one never comes two nights running (Duolingo found a
// repeated reminder loses its pull: Yancey & Settles, KDD 2020).
const pick = (list: string[], day: string) => list[Math.round(Date.parse(day + "T12:00:00Z") / 86400000) % list.length];

const LOG_NONE = [
  "امروز هنوز چیزی ثبت نکرده‌ای. همین حالا بنویس چه خوردی؛ دو دقیقه بیشتر وقت نمی‌گیرد.",
  "پیش از خواب، امروز را ثبت کن؛ تقریبی هم کافی است.",
  "ثبت تقریبی خیلی بهتر از ثبت نکردن است. امروز چه خوردی؟",
];
const LOG_SOME = [
  "ثبت امروزت هنوز کامل نیست. بقیه‌ی چیزهایی که خوردی را هم اضافه کن؛ یک دقیقه بیشتر وقت نمی‌گیرد.",
  "یک وعده ثبت شده؛ بقیه‌ی امروز را هم اضافه کن تا عددهای امروز درست باشند.",
  "چیزی نمانده: فقط بقیه‌ی وعده‌های امروز را اضافه کن.",
];

/* ---------------- the evening reminder's time (BAZGASHT.md, phase 8) ---------------- */

// A copy of dayEnds, usualLogTime and autoTime in js/domain/timing.js (tested there): change both together.
// For one who never set the time themselves, the reminder goes half an hour after they usually finish logging.
const DEFAULT_AT = "21:00", USUAL_DAYS = 28, USUAL_MIN = 7, AFTER_MIN = 30, EARLIEST = 19 * 60, LATEST = 23 * 60, STEP = 15;
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
function dayEnds(entries: { day: string; created_at: string }[], local: (iso: string) => { day: string; min: number }) {
  const last = new Map<string, number>();
  for (const e of entries) {
    if (!e.created_at || !e.day) continue;
    const t = local(e.created_at);
    const m = daysBetween(t.day, e.day) * 1440 + t.min;
    if (m < 5 * 60 || m > 29 * 60) continue;
    if (!last.has(e.day) || m > last.get(e.day)!) last.set(e.day, m);
  }
  return [...last].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, m]) => m);
}
function usualLogTime(ends: number[]) {
  const xs = ends.slice(-USUAL_DAYS).sort((a, b) => a - b);
  if (xs.length < USUAL_MIN) return null;
  const mid = xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
  const at = Math.round((mid + AFTER_MIN) / STEP) * STEP;
  return hhmm(Math.min(LATEST, Math.max(EARLIEST, at)));
}
const autoTime = (log: any) => log?.auto === true || (log?.auto === undefined && (!log?.at || log.at === DEFAULT_AT));
// the moment of an entry in the member's zone: its calendar day and minute
function localAt(tz: string) {
  let f: Intl.DateTimeFormat;
  const opts = { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" } as const;
  try { f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, ...opts }); } catch { f = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", ...opts }); }
  return (iso: string) => {
    const p = Object.fromEntries(f.formatToParts(new Date(iso)).map(x => [x.type, x.value]));
    return { day: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
  };
}
// The time tonight's log reminder goes: their own, or (never set) half an hour after they usually finish logging.
// Before EARLIEST no such time can be due yet, so their entries are not read then (every run counts: the cron
// call waits 5 s, and the function goes on after it, but runs should stay short).
async function logAtFor(user: string, r: any, nowMin: number) {
  if (!autoTime(r?.log)) return String(r?.log?.at || DEFAULT_AT);
  if (nowMin < EARLIEST) return DEFAULT_AT;
  const { data } = await admin.from("entries").select("day,created_at").eq("user_id", user).order("day", { ascending: false }).limit(1500);
  return usualLogTime(dayEnds((data || []) as any[], localAt(String(r?.tz || "Asia/Tehran")))) || DEFAULT_AT;
}

/* ---------------- an absence (BAZGASHT.md, phase 1) ---------------- */

// A copy of lapsePush and its constants in js/domain/lapse.js (tested there): change both together.
const BACK_DAYS = 3, BACK2_DAYS = 5, AWAY_DAYS = 7, FRESH_MAX = 3, FRESH_REST = 3, LAST_REST = 2;
const LAPSE_KINDS = ["back3", "back5", "last", "fresh"];
const J_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const JP = new Intl.DateTimeFormat("en-u-ca-persian-nu-latn", { timeZone: "UTC", year: "numeric", month: "numeric", day: "numeric" });
const jParts = (day: string) => {
  const p = Object.fromEntries(JP.formatToParts(new Date(day + "T12:00:00Z")).map(x => [x.type, x.value]));
  return { m: Number(p.month), d: Number(p.day) };
};
const freshDay = (day: string) => jParts(day).d === 1;
const freshSoon = (day: string) => {
  for (let k = 1; k <= FRESH_REST; k++) if (freshDay(addDays(day, k))) return true;
  return false;
};
function lapsePush(gap: number | null, sent: { kind: string; day: string }[], day: string) {
  if (gap === null || gap < BACK_DAYS) return null;
  const has = (k: string) => sent.some(s => s.kind === k);
  const lastSent = sent.reduce((m, s) => (s.day > m ? s.day : m), "");
  const since = lastSent ? daysBetween(day, lastSent) : Infinity;
  if (since < 1) return null;
  if (freshDay(day) && since >= FRESH_REST && sent.filter(s => s.kind === "fresh").length < FRESH_MAX) return "fresh";
  if (gap >= AWAY_DAYS) return !has("last") && since >= LAST_REST && !freshSoon(day) ? "last" : null;
  if (gap >= BACK2_DAYS) return !has("back5") && since >= 2 ? "back5" : null;
  return sent.length ? null : "back3";
}

/*
  «مکث» (BAZGASHT.md, phase 5): a copy of pauseOn and lastPauseEnd in js/domain/pause.js. While paused, no log
  or weigh-in reminder and no push of an absence; after it, an absence counts from its last day, and the day
  after it the evening reminder says the pause is over.
*/
const pauseList = (data: any): { from: string; to: string }[] =>
  (Array.isArray(data?.pauses) ? data.pauses : []).filter((x: any) => x && x.from && x.to && x.to >= x.from);
const pausedOn = (data: any, day: string) => pauseList(data).some(x => x.from <= day && day <= x.to);
const lastPauseEnd = (data: any, day: string) => pauseList(data).map(x => x.to).filter(t => t < day).sort().pop() || "";
const RESUME = "مکثت تمام شد. از همین امروز ادامه بده؛ یک وعده کافی است.";
// «فعلاً نمی‌خواهم» (BAZGASHT.md phase 7): a copy of quietOn in js/domain/why.js. Until quietUntil, nothing at all.
const quietOn = (data: any, day: string) => !!data?.quietUntil && day <= String(data.quietUntil);

// The last day with anything recorded (food, weight, waist or activity), or the end of the last pause when that
// is later, and how long ago; null if never.
async function awayDays(user: string, day: string, floor = "") {
  let last = floor;
  for (const table of ["entries", "weights", "waists", "activity"]) {
    const { data } = await admin.from(table).select("day").eq("user_id", user).lte("day", day).order("day", { ascending: false }).limit(1);
    const d = data?.[0]?.day as string | undefined;
    if (d && d > last) last = d;
  }
  return last ? { gap: daysBetween(day, last), last } : null;
}
// The pushes of this absence already sent: push_log rows after the last active day.
async function lapseSent(user: string, last: string) {
  const { data } = await admin.from("push_log").select("kind,mark").eq("user_id", user).in("kind", LAPSE_KINDS).gt("mark", last);
  return (data || []).map(r => ({ kind: String(r.kind), day: String(r.mark) }));
}
/*
  The texts: no blame, no count of the days missed, one small step from today (self-compassion after a
  lapse: Adams & Leary 2007; a missed day does not undo a habit: Lally et al. 2010; two logged meals are
  what counts: Turner-McGrievy et al. 2019). `last` picks a different one in the next absence; with a
  possible eating-disorder history the scale is never suggested.
*/
function lapseNote(kind: string, day: string, last: string, care: boolean): Note {
  const base = { tag: "log", url: "./#/today", title: "تن‌آرا" };
  if (kind === "back3") return { ...base, body: pick([
    "چند روزی است سر نزده‌ای؛ اشکالی ندارد، برای همه پیش می‌آید. برای برگشتن فقط یک وعده‌ی امروز را ثبت کن، همین.",
    "برگشتن از یک وعده شروع می‌شود، نه از یک روز کامل. امشب فقط یکی را ثبت کن.",
  ], last) };
  if (kind === "back5") return { ...base, body: care
    ? "لازم نیست چیزی را جبران کنی؛ از همین امروز ادامه بده. یک وعده کافی است."
    : pick([
      "چند روز جا انداختن، عادت را از بین نمی‌برد؛ برگشتن مهم است. اگر ثبت غذا حالا سخت است، فردا صبح فقط وزن کن.",
      "لازم نیست چیزی را جبران کنی؛ از همین امروز ادامه بده. یک وعده یا یک وزن‌کشی کافی است.",
    ], last) };
  // it opens «چه شد؟» over «امروز» (BAZGASHT.md phase 7)
  if (kind === "last") return { ...base, url: "./#/why", body: "انگار این یادآورها این روزها کمکی نمی‌کنند، پس فعلاً هر شب نمی‌فرستم. هر وقت خواستی، تن‌آرا همین‌جاست و از همان‌جا که هستی ادامه می‌دهیم." };
  const j = jParts(day);
  return { ...base, body: j.m === 1
    ? "سال نو مبارک. شروع سال وقت خوبی برای از سر گرفتن است: فقط امروز را ثبت کن و گذشته را کنار بگذار."
    : `اول ${J_MONTHS[j.m - 1]} است. شروع ماه وقت خوبی برای از سر گرفتن است: فقط امروز را ثبت کن و گذشته را کنار بگذار.` };
}

// This week's magazine article (table magazine, written by the `magazine` function), once it is
// ready: everyone gets it, whether or not they turned the other reminders on.
async function newArticle(): Promise<(Note & { week: string }) | null> {
  const week = (() => { const d = localNow("Asia/Tehran").day; return addDays(d, -((new Date(d + "T12:00:00Z").getUTCDay() + 1) % 7)); })();
  const { data } = await admin.from("magazine").select("week,data").eq("week", week).eq("status", "ready").maybeSingle();
  const title = String(data?.data?.title || "");
  return title ? { week, tag: "mag", url: "./#/mag", title: "مقاله‌ی این هفته‌ی مجله", body: title } : null;
}

// The rewards of «جوایز»: a copy of key, name and `since` of REWARDS in js/domain/rewards.js.
// Adding a reward there means adding it here too (and deploying this function).
const REWARDS = [
  { key: "parniyan", name: "پرنیان", since: "2026-11-15" },
  { key: "shab", name: "شب‌پر", since: "2026-11-17" },
  { key: "tangatang", name: "تنگاتنگ", since: "2026-11-19" },
  { key: "pfeffer", name: "پِفِردینگر", since: "2026-11-20" },
];
// Rewards out by `day` that they have not opened yet, newest first; the note names them.
function newRewards(data: any, day: string): (Note & { mark: string }) | null {
  const seen: string[] = Array.isArray(data?.rewardsSeen) ? data.rewardsSeen : [];
  const fresh = REWARDS.filter(r => r.since <= day && !seen.includes(r.key)).sort((a, b) => (a.since < b.since ? 1 : -1));
  if (!fresh.length) return null;
  const names = fresh.map(r => r.name);
  const body = fresh.length === 1
    ? `جایزه‌ی تازه در «جوایز»: ${names[0]}. انتخابش کن تا روزهایش شمرده شود.`
    : `${names.slice(0, -1).join("، ")} و ${names[names.length - 1]} در «جوایز» منتظرت هستند. یکی را انتخاب کن تا روزهایش شمرده شود.`;
  return { mark: fresh[0].key, tag: "reward", url: "./#/rewards", title: "جایزه‌ی تازه", body };
}

async function runDue(k: Keys) {
  const { data: subs, error } = await admin.from("push_subs").select("*");
  if (error) throw error;
  const byUser = new Map<string, Sub[]>();
  for (const s of (subs || []) as Sub[]) (byUser.get(s.user_id) || byUser.set(s.user_id, []).get(s.user_id)!).push(s);
  let sent = 0;
  const mag = await newArticle();

  for (const [user, list] of byUser) {
    const { data: prof } = await admin.from("profile").select("data").eq("user_id", user).maybeSingle();
    const data = prof?.data as any;
    const r = data?.reminders;
    const now = localNow(String(r?.tz || "Asia/Tehran"));
    if (quietOn(data, now.day)) continue;
    const notes: Record<string, Note> = {};
    // the week's shared magazine article, once per device, in the day (not at night)
    if (mag && now.min >= 9 * 60 && now.min < 22 * 60) notes.mag = mag;
    // a reward they have not seen, once per newest one, in the day
    const reward = now.min >= 9 * 60 && now.min < 22 * 60 ? newRewards(data, now.day) : null;
    if (reward) notes.reward = reward;

    const logAt = r?.log?.on ? await logAtFor(user, r, now.min) : r?.log?.at;
    const logWindow = inWindow(now.min, minutes(logAt, 21 * 60)), weighWindow = inWindow(now.min, minutes(r?.weigh?.at, 8 * 60));
    // the log reminder speaks for an absence too (BAZGASHT.md); light logging turns both off
    const paused = pausedOn(data, now.day), pauseEnd = lastPauseEnd(data, now.day);
    const lapseOn = !paused && !!r?.log?.on && (logWindow || (!!r?.weigh?.on && weighWindow)) && !(await lightOn(data, user, now.day));
    const away = lapseOn ? await awayDays(user, now.day, pauseEnd) : null;
    const isAway = !!away && away.gap >= BACK_DAYS;

    if (lapseOn && logWindow) {
      if (isAway) {
        const step = lapsePush(away!.gap, await lapseSent(user, away!.last), now.day);
        if (step) notes[step] = lapseNote(step, now.day, away!.last, ["yes", "unsure"].includes(data?.edHistory));
      } else {
        const { data: rows } = await admin.from("entries").select("meal").eq("user_id", user).eq("day", now.day);
        const meals = new Set((rows || []).map(x => x.meal)).size;
        // the day after a pause: say it is over (once), in place of the usual text
        const resumed = !!pauseEnd && daysBetween(now.day, pauseEnd) === 1;
        if (meals < 2) notes[resumed ? "resume" : "log"] = { tag: "log", url: "./#/today", title: "تن‌آرا", body: resumed ? RESUME : pick(meals ? LOG_SOME : LOG_NONE, now.day) };
      }
    }
    // while they are away, the evening's push of the absence is the only one (one push a day)
    if (r?.weigh?.on && weighWindow && !isAway && !paused) {
      const every = Math.max(1, Number(r.weigh.every) || 7);
      const lastW = await latest("weights", user);
      if (!lastW || daysBetween(now.day, lastW) >= every) {
        const lastWaist = await latest("waists", user);
        const waistToo = !lastWaist || daysBetween(now.day, lastWaist) >= 14;
        const gap = lastW ? daysBetween(now.day, lastW) : 0;
        notes.weigh = {
          tag: "weigh", url: "./#/progress", title: "تن‌آرا",
          body: gap >= Math.max(LAPSE_DAYS, every + 3)
            ? `${gap.toLocaleString("fa-IR")} روز است وزن ثبت نشده. یک وزن‌کشی صبح، ناشتا، کافی است تا دوباره بدانی کجایی؛ عددش هر چه باشد، بی‌خبری بدتر است.`
            : `وقت وزن‌کشی است: صبح، ناشتا${waistToo ? "؛ دور کمرت را هم اندازه بگیر" : ""}. یک عدد به‌تنهایی مهم نیست، روندش مهم است.`,
        };
      }
    }

    for (const [kind, note] of Object.entries(notes)) {
      // the magazine is marked with its week, a reward with its key, the reminders with the day
      const mark = kind === "mag" ? mag!.week : kind === "reward" ? reward!.mark : now.day;
      let took = false;
      for (const sub of list) {
        if (sub.sent?.[kind] === mark) continue;
        const status = await push(sub, note, k);
        if (status >= 200 && status < 300) {
          sent++;
          took = true;
          sub.sent = { ...(sub.sent || {}), [kind]: mark };
          await admin.from("push_subs").update({ sent: sub.sent }).eq("endpoint", sub.endpoint);
        }
      }
      // one row per person (not per device): the steps of an absence, and later what brought them back
      if (took) await admin.from("push_log").insert({ user_id: user, kind, mark });
    }
  }
  return { users: byUser.size, sent };
}

/* ---------------- «به یادتم» (BAZGASHT.md, phase 6) ---------------- */
/*
  A member of the family (usage_members) can send «به یادتم» to another member who has been away three days or
  more: one push with the sender's name, once a day per sender and recipient, in the recipient's day (9:00 to
  22:00). Who can get one: is not hidden from the family land (familyHidden), is not on a «مکث», has a device that
  takes pushes, and has recorded nothing for BACK_DAYS or more (counted from the end of a pause). A plot in the land
  is not needed (the owner's choice, 2026-11-21): one who has none is listed by name under the land. The app asks
  { family: true } for those ids (which of them it already reminded today, and the names of those with no plot),
  and sends with { nudge: id }. Nothing else about anyone goes back: only who can be reminded now (social support
  keeps people going: Wing & Jeffery 1999).
*/
async function nudgeable(caller: string) {
  const { data: members } = await admin.from("usage_members").select("user_id,name");
  const names = new Map((members || []).map(m => [String(m.user_id), String(m.name || "").trim().slice(0, 40)]));
  if (!names.has(caller)) return [];
  const { data: plots } = await admin.from("family_plot").select("user_id");
  const withPlot = new Set((plots || []).map(p => String(p.user_id)));
  const out: { id: string; day: string; min: number; name: string; plot: boolean }[] = [];
  for (const id of names.keys()) {
    if (id === caller) continue;
    const { count } = await admin.from("push_subs").select("endpoint", { count: "exact", head: true }).eq("user_id", id);
    if (!count) continue;
    const { data: prof } = await admin.from("profile").select("data").eq("user_id", id).maybeSingle();
    const data = prof?.data as any;
    if (data?.familyHidden) continue;
    const now = localNow(String(data?.reminders?.tz || "Asia/Tehran"));
    if (pausedOn(data, now.day) || quietOn(data, now.day)) continue;
    const away = await awayDays(id, now.day, lastPauseEnd(data, now.day));
    if (away && away.gap >= BACK_DAYS) out.push({ id, day: now.day, min: now.min, name: names.get(id) || "", plot: withPlot.has(id) });
  }
  return out;
}
const nudgeMark = (from: string, day: string) => `${from}:${day}`;
async function nudgedToday(from: string, to: string, day: string) {
  const { count } = await admin.from("push_log").select("id", { count: "exact", head: true })
    .eq("user_id", to).eq("kind", "nudge").eq("mark", nudgeMark(from, day));
  return !!count;
}
async function family(caller: string) {
  const list = await nudgeable(caller);
  const sent: string[] = [];
  for (const x of list) if (await nudgedToday(caller, x.id, x.day)) sent.push(x.id);
  return { away: list.map(x => x.id), sent, others: list.filter(x => !x.plot).map(x => ({ id: x.id, name: x.name || "عضو خانواده" })) };
}
async function nudge(caller: string, to: string, k: Keys) {
  const x = (await nudgeable(caller)).find(y => y.id === to);
  if (!x) return json({ error: "gone" }, 409);
  if (await nudgedToday(caller, to, x.day)) return json({ ok: true });
  if (x.min < 9 * 60 || x.min >= 22 * 60) return json({ error: "night" }, 409);
  const { data: me } = await admin.from("usage_members").select("name").eq("user_id", caller).maybeSingle();
  const name = String(me?.name || "").trim().slice(0, 40) || "یکی از خانواده";
  const note = { tag: "nudge", url: "./#/today", title: "تن‌آرا", body: `${name} به یادت است. هر وقت آماده بودی، یک وعده‌ی امروز کافی است.` };
  const { data: subs } = await admin.from("push_subs").select("*").eq("user_id", to);
  let took = false;
  for (const sub of (subs || []) as Sub[]) {
    const status = await push(sub, note, k);
    if (status >= 200 && status < 300) took = true;
  }
  if (!took) return json({ error: "push" }, 502);
  await admin.from("push_log").insert({ user_id: to, kind: "nudge", mark: nudgeMark(caller, x.day) });
  return json({ ok: true });
}

/* ---------------- handler ---------------- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const k = await keys();
    if (req.method === "GET") return json({ key: k.publicKey });
    if (req.method !== "POST") return json({ error: "method" }, 405);

    const cron = req.headers.get("x-cron-key");
    if (cron !== null) {
      if (!k.cronKey || cron !== k.cronKey) return json({ error: "forbidden" }, 403);
      return json(await runDue(k));
    }

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "دوباره وارد شو." }, 401);
    const body = await req.json().catch(() => ({}));
    if (body?.family) return json(await family(user.id));
    if (typeof body?.nudge === "string") return await nudge(user.id, body.nudge, k);
    if (!body?.test) return json({ error: "bad request" }, 400);
    const { data: subs } = await admin.from("push_subs").select("*").eq("user_id", user.id);
    const results: number[] = [];
    for (const sub of (subs || []) as Sub[]) {
      results.push(await push(sub, { tag: "test", url: "./#/profile", title: "تن‌آرا", body: "یادآورها روی این دستگاه کار می‌کنند." }, k));
    }
    return json({ devices: results.length, ok: results.filter(s => s >= 200 && s < 300).length, statuses: results });
  } catch (e) {
    console.error("remind failed", e);
    return json({ error: "یادآور فرستاده نشد." }, 500);
  }
});
