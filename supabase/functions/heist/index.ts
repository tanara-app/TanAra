/*
  «سرقت بزرگ» on the server (phase 4, briefs/heist-4.md). POST with the member's JWT and { action, ... }:

    state   { vault? }                 my coins, my vault, the members I can raid, the raids on my vault I haven't watched, and today's
                                       raids left. The first call makes my player row (from `vault`, the one I drew on this phone, if it
                                       is acceptable; else a made-up one).
    save    { vault }                  my vault, if the game's rules accept it (budget 100 until phase 5)
    start   { target | practice, gadgets }   a raid begins: on a member (`target`, a user id: fee, shield and the daily limit apply)
                                       or on a practice vault (`practice`: { level, seed }, free). Returns the raid's id and the vault.
    finish  { raid, moves }            the raid is replayed with the game's own simulator; the coins move; the owner gets a notification
    seen    { ids }                    raids on my vault I have watched

  The rules are the app's own files (js/domain/heist.js, heistEdit.js, heistRules.js), imported, not copied. Coins move only in the
  SQL functions heist_begin and heist_settle (migration 20261117_heist.sql). Deployed with verify_jwt on.
*/
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
// @ts-ignore: plain JS modules shared with the app
import { simulate, generate, LEVELS } from "../../../js/domain/heist.js";
// @ts-ignore
import { check } from "../../../js/domain/heistEdit.js";
// @ts-ignore
import { START_COINS, FEE, RAIDS_PER_DAY, OPEN_MINUTES, payout, ending, kitOk, tehranDayStart, seedOf } from "../../../js/domain/heistRules.js";
import { notify } from "../_shared/push.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

class Refused extends Error { constructor(public code: string, public status = 400) { super(code); } }
const must = <T>(r: { data: T; error: unknown }) => { if (r.error) throw r.error; return r.data; };

async function names(ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = must(await admin.from("usage_members").select("user_id,name").in("user_id", ids)) as { user_id: string; name: string }[];
  return new Map(rows.map(r => [r.user_id, r.name]));
}

// My player row, made on first use.
async function player(uid: string, drawn?: unknown) {
  const read = async () => must(await admin.from("heist_players").select("*").eq("user_id", uid).maybeSingle()) as any;
  let me = await read(), created = false;
  if (!me) {
    const vault = drawn && check(drawn).ok ? drawn : generate(seedOf(uid), 2);
    const c = check(vault);
    must(await admin.from("heist_players").upsert({ user_id: uid, vault, cost: c.cost, grade: c.grade, coins: START_COINS }, { onConflict: "user_id", ignoreDuplicates: true }));
    me = await read();
    created = true;
  }
  return { me, created };
}

async function settle(raid: any, status: string, turns: number, moves: string[] | null) {
  let ownerCoins = 0, paid = false;
  if (raid.owner) ownerCoins = (must(await admin.from("heist_players").select("coins").eq("user_id", raid.owner).maybeSingle()) as any)?.coins ?? 0;
  if (raid.practice) {
    const { count } = await admin.from("heist_raids").select("id", { count: "exact", head: true })
      .eq("thief", raid.thief).eq("practice", raid.practice).gt("loot", 0).gte("started_at", tehranDayStart());
    paid = (count || 0) > 0;
  }
  const p = payout(status, { ownerCoins, fee: raid.fee, practice: raid.practice || 0, paid });
  const rows = must(await admin.rpc("heist_settle", {
    p_raid: raid.id, p_status: status, p_turns: turns, p_moves: moves, p_loot: p.loot, p_thief: p.thief, p_owner: p.owner, p_shield: p.shield,
  })) as { o_loot: number; o_coins: number }[];
  return { loot: rows[0]?.o_loot ?? 0, coins: rows[0]?.o_coins ?? 0, fee: raid.fee, owner: p.owner };
}

// Raids left open (the app was closed mid-raid) end as caught after a while; a thief's own open raid ends when they begin another.
async function closeOpen(filter: (q: any) => any, olderThan?: string) {
  let q = admin.from("heist_raids").select("*").eq("status", "open");
  q = filter(q);
  if (olderThan) q = q.lt("started_at", olderThan);
  for (const raid of (must(await q) as any[])) {
    try { await settle(raid, "timeout", 0, null); if (raid.owner) await tell(raid, "timeout", 0); } catch (e) { console.error("close failed", raid.id, e); }
  }
}

async function tell(raid: any, status: string, loot: number) {
  if (!raid.owner) return;
  const who = (await names([raid.thief])).get(raid.thief) || "یک عضو";
  const fa = (n: number) => n.toLocaleString("fa-IR");
  const body = status === "escaped" || status === "escaped_alarm"
    ? `${who} به گاوصندوقت دستبرد زد و ${fa(loot)} سکه برد.`
    : status === "fled" ? `${who} به گاوصندوقت زد و دست خالی بیرون رفت.`
    : `${who} در گاوصندوقت گیر افتاد؛ ${fa(raid.fee)} سکه به تو رسید.`;
  try { await notify(admin, raid.owner, { title: "سرقت بزرگ", body, tag: "heist", url: "./#/heist" }); } catch (e) { console.error("notify failed", e); }
}

async function raidsToday(uid: string) {
  const { count } = await admin.from("heist_raids").select("id", { count: "exact", head: true }).eq("thief", uid).not("owner", "is", null).gte("started_at", tehranDayStart());
  return Math.max(0, RAIDS_PER_DAY - (count || 0));
}

async function state(uid: string, body: any) {
  const stale = new Date(Date.now() - OPEN_MINUTES * 60000).toISOString();
  await closeOpen(q => q.or(`thief.eq.${uid},owner.eq.${uid}`), stale);
  const { me, created } = await player(uid, body.vault);
  const others = must(await admin.from("heist_players").select("user_id,vault,coins,grade,shield_until").neq("user_id", uid)) as any[];
  const inbox = must(await admin.from("heist_raids").select("id,thief,vault,gadgets,moves,status,turns,loot,fee,finished_at")
    .eq("owner", uid).eq("seen", false).neq("status", "open").order("finished_at", { ascending: true }).limit(20)) as any[];
  const who = await names([...new Set([...others.map(o => o.user_id), ...inbox.map(r => r.thief)])]);
  const paidRows = must(await admin.from("heist_raids").select("practice").eq("thief", uid).not("practice", "is", null).gt("loot", 0).gte("started_at", tehranDayStart())) as any[];
  return {
    me: { coins: me.coins, vault: me.vault, grade: me.grade, cost: me.cost, shield_until: me.shield_until, created },
    raidsLeft: await raidsToday(uid),
    practicePaid: [...new Set(paidRows.map(r => r.practice))],
    targets: others.map(o => ({ id: o.user_id, name: who.get(o.user_id) || "عضو", coins: o.coins, grade: o.grade, shield_until: o.shield_until, vault: o.vault })),
    inbox: inbox.map(r => ({ ...r, thief_name: who.get(r.thief) || "عضو" })),
    rules: { fee: FEE, raidsPerDay: RAIDS_PER_DAY },
  };
}

async function save(uid: string, body: any) {
  const c = check(body.vault);
  if (!c.ok) throw new Refused("vault");
  await player(uid);
  must(await admin.from("heist_players").update({ vault: body.vault, cost: c.cost, grade: c.grade, updated_at: new Date().toISOString() }).eq("user_id", uid));
  return { ok: true, cost: c.cost, grade: c.grade };
}

async function start(uid: string, body: any) {
  const gadgets = body.gadgets ?? [];
  if (!kitOk(gadgets)) throw new Refused("gadgets");
  await player(uid);
  await closeOpen(q => q.eq("thief", uid));
  let owner: string | null = null, practice: number | null = null, vault: unknown, fee = 0;
  if (body.practice) {
    const level = Number(body.practice.level), seed = Number(body.practice.seed);
    if (!Number.isInteger(level) || level < 1 || level > LEVELS || !Number.isInteger(seed) || seed < 1 || seed > 99999) throw new Refused("practice");
    practice = level;
    vault = generate(seed, level);
  } else {
    owner = String(body.target || "");
    if (!owner || owner === uid) throw new Refused("target");
    const t = must(await admin.from("heist_players").select("vault,shield_until").eq("user_id", owner).maybeSingle()) as any;
    if (!t) throw new Refused("target", 404);
    if (t.shield_until && Date.parse(t.shield_until) > Date.now()) throw new Refused("shield", 409);
    if (await raidsToday(uid) <= 0) throw new Refused("limit", 409);
    vault = t.vault;
    fee = FEE;
  }
  const id = must(await admin.rpc("heist_begin", { p_thief: uid, p_owner: owner, p_practice: practice, p_vault: vault, p_gadgets: gadgets, p_fee: fee }));
  if (id === null) throw new Refused("coins", 409);
  return { raid: id, vault, fee };
}

async function finish(uid: string, body: any) {
  const raid = must(await admin.from("heist_raids").select("*").eq("id", Number(body.raid)).eq("thief", uid).maybeSingle()) as any;
  if (!raid) throw new Refused("raid", 404);
  if (raid.status !== "open") throw new Refused("closed", 409);
  const moves = Array.isArray(body.moves) ? body.moves.slice(0, 40).map((m: unknown) => String(m).slice(0, 8)) : [];
  const r = simulate(raid.vault, moves, raid.gadgets);
  const status = ending(r.result);
  const out = await settle(raid, status, r.turns, moves);
  await tell(raid, status, out.loot);
  return { status, turns: r.turns, loot: out.loot, coins: out.coins, fee: raid.fee };
}

async function seen(uid: string, body: any) {
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Number.isInteger).slice(0, 50);
  if (ids.length) must(await admin.from("heist_raids").update({ seen: true }).eq("owner", uid).in("id", ids));
  return { ok: true };
}

const ACTIONS: Record<string, (uid: string, body: any) => Promise<unknown>> = { state, save, start, finish, seen };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "signin" }, 401);
    const body = await req.json().catch(() => ({}));
    const act = ACTIONS[String(body?.action)];
    if (!act) return json({ error: "action" }, 400);
    return json(await act(user.id, body));
  } catch (e) {
    if (e instanceof Refused) return json({ error: e.code }, e.status);
    console.error("heist failed", e);
    return json({ error: "server" }, 500);
  }
});
