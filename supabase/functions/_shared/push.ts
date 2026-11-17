/*
  Web push for Edge Functions other than `remind` (RFC 8291 encryption, RFC 8292 VAPID), with the VAPID key pair `remind` keeps in
  app_secrets. A copy of `remind`'s code (supabase/functions/remind/index.ts), which still has its own; this one never makes keys: if
  there are none yet, nothing is sent.
*/
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

const APP_URL = "https://tanara-app.github.io";
const enc = new TextEncoder();
const b64u = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), c => c.charCodeAt(0));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

export type Note = { title: string; body: string; tag: string; url: string };
type Sub = { endpoint: string; p256dh: string; auth: string };
type Keys = { publicKey: string; privateKey: CryptoKey };
let cached: Keys | null = null;

async function keys(admin: SupabaseClient): Promise<Keys | null> {
  if (cached) return cached;
  const { data } = await admin.from("app_secrets").select("key,value").in("key", ["vapid_private", "vapid_public"]);
  const s = Object.fromEntries((data || []).map(r => [r.key, r.value])) as Record<string, string>;
  if (!s.vapid_private || !s.vapid_public) return null;
  const privateKey = await crypto.subtle.importKey("jwk", JSON.parse(s.vapid_private), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  cached = { publicKey: s.vapid_public, privateKey };
  return cached;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, len * 8));
}

async function encrypt(sub: Sub, text: string) {
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
  const plain = concat(enc.encode(text), new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plain));
  return concat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([asPublic.length]), asPublic, cipher);
}

async function vapidHeader(endpoint: string, k: Keys) {
  const part = (o: unknown) => b64u(enc.encode(JSON.stringify(o)));
  const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: APP_URL })}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, k.privateKey, enc.encode(unsigned));
  return `vapid t=${unsigned}.${b64u(sig)}, k=${k.publicKey}`;
}

// Only the browsers' own push services are ever called (an endpoint is written by the member's own device, so it is not trusted).
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/];
function pushService(endpoint: string) {
  try { const u = new URL(endpoint); return u.protocol === "https:" && !u.port && PUSH_HOSTS.some(h => h.test(u.hostname)); } catch { return false; }
}

// Sends a note to every device of a user. Returns how many push services took it. A subscription the service no longer knows is deleted.
export async function notify(admin: SupabaseClient, userId: string, note: Note) {
  const k = await keys(admin);
  if (!k) return 0;
  const { data: subs } = await admin.from("push_subs").select("endpoint,p256dh,auth").eq("user_id", userId);
  let ok = 0;
  for (const sub of (subs || []) as Sub[]) {
    let status = 0;
    try {
      if (!pushService(sub.endpoint)) continue;
      const res = await fetch(sub.endpoint, {
        method: "POST",
        headers: { "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "7200", Urgency: "normal", Authorization: await vapidHeader(sub.endpoint, k) },
        body: await encrypt(sub, JSON.stringify(note)),
      });
      status = res.status;
      await res.body?.cancel();
    } catch (e) {
      console.error("push failed", e);
    }
    if (status >= 200 && status < 300) ok++;
    if (status === 404 || status === 410) await admin.from("push_subs").delete().eq("endpoint", sub.endpoint);
  }
  return ok;
}
