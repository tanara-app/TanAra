/*
  Reminders — web push for TanAra, so the app can nudge when it is closed.

    GET                    the public VAPID key browsers subscribe with
    POST + x-cron-key      the database calls this every 10 minutes (pg_cron, see the
                           migration); whoever is due gets a notification
    POST + user JWT        { test: true } sends a test notification to that person's devices

  What is due comes from the profile (profile.data.reminders, set in «نمایه» ← «یادآورها»):
    log    at a chosen evening time, if fewer than two meals were logged that day
    weigh  at a chosen morning time, if the last weigh-in is `every` days old or more
           (the text also asks for the waist when that is two weeks old)
  Times are in the person's own time zone (reminders.tz). The texts are fixed: no AI call.

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

async function latest(table: string, user: string) {
  const { data } = await admin.from(table).select("day").eq("user_id", user).order("day", { ascending: false }).limit(1);
  return data?.[0]?.day as string | undefined;
}

async function runDue(k: Keys) {
  const { data: subs, error } = await admin.from("push_subs").select("*");
  if (error) throw error;
  const byUser = new Map<string, Sub[]>();
  for (const s of (subs || []) as Sub[]) (byUser.get(s.user_id) || byUser.set(s.user_id, []).get(s.user_id)!).push(s);
  let sent = 0;

  for (const [user, list] of byUser) {
    const { data: prof } = await admin.from("profile").select("data").eq("user_id", user).maybeSingle();
    const r = (prof?.data as any)?.reminders;
    if (!r) continue;
    const now = localNow(String(r.tz || "Asia/Tehran"));
    const notes: Record<string, Note> = {};

    if (r.log?.on && inWindow(now.min, minutes(r.log.at, 21 * 60))) {
      const { data: rows } = await admin.from("entries").select("meal").eq("user_id", user).eq("day", now.day);
      const meals = new Set((rows || []).map(x => x.meal)).size;
      if (meals < 2) notes.log = {
        tag: "log", url: "./#/today", title: "تن‌آرا",
        body: meals ? "ثبت امروزت هنوز کامل نیست. بقیه‌ی چیزهایی که خوردی را هم اضافه کن؛ یک دقیقه بیشتر وقت نمی‌گیرد." : "امروز هنوز چیزی ثبت نکرده‌ای. همین حالا بنویس چه خوردی؛ دو دقیقه بیشتر وقت نمی‌گیرد.",
      };
    }
    if (r.weigh?.on && inWindow(now.min, minutes(r.weigh.at, 8 * 60))) {
      const every = Math.max(1, Number(r.weigh.every) || 7);
      const lastW = await latest("weights", user);
      if (!lastW || daysBetween(now.day, lastW) >= every) {
        const lastWaist = await latest("waists", user);
        const waistToo = !lastWaist || daysBetween(now.day, lastWaist) >= 14;
        notes.weigh = {
          tag: "weigh", url: "./#/progress", title: "تن‌آرا",
          body: `وقت وزن‌کشی است: صبح، ناشتا${waistToo ? "؛ دور کمرت را هم اندازه بگیر" : ""}. یک عدد به‌تنهایی مهم نیست، روندش مهم است.`,
        };
      }
    }

    for (const [kind, note] of Object.entries(notes)) {
      for (const sub of list) {
        if (sub.sent?.[kind] === now.day) continue;
        const status = await push(sub, note, k);
        if (status >= 200 && status < 300) {
          sent++;
          sub.sent = { ...(sub.sent || {}), [kind]: now.day };
          await admin.from("push_subs").update({ sent: sub.sent }).eq("endpoint", sub.endpoint);
        }
      }
    }
  }
  return { users: byUser.size, sent };
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
