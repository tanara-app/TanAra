/*
  Feedback photos for the Claudes that work on the app (FEEDBACK.md).

    POST + x-admin-key   { paths: ["<user id>/<feedback id>/1.jpg", ...] }
                         → { urls: [{ path, url }] }, signed for 10 minutes

  The reports themselves are read with SQL (service role); only the photos need this, because
  the files sit in the private `feedback` bucket. The key is a random 256-bit string that lives
  only in the git-ignored .claude/private/feedback-admin-key on the Mac; only its SHA-256 is
  here (a hash of a random key that long can't be turned back into it). To change the key, write
  a new one there and put its hash below. Deployed with verify_jwt off.
*/
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const KEY_SHA256 = "e86a30e0e0577368407434c7b976aa3dea407e6d8c387689f918a65a3a8f1e89";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async req => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const key = req.headers.get("x-admin-key") || "";
  if (key.length < 32 || (await sha256(key)) !== KEY_SHA256) return json({ error: "forbidden" }, 403);

  let paths: unknown;
  try { ({ paths } = await req.json()); } catch { return json({ error: "bad json" }, 400); }
  if (!Array.isArray(paths) || !paths.length || paths.length > 40 || !paths.every(p => typeof p === "string" && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/\d\.(jpg|png|webp)$/.test(p))) {
    return json({ error: "paths" }, 400);
  }
  const { data, error } = await admin.storage.from("feedback").createSignedUrls(paths as string[], 600);
  if (error) return json({ error: error.message }, 500);
  return json({ urls: data.map(d => ({ path: d.path, url: d.error ? null : d.signedUrl })) });
});
