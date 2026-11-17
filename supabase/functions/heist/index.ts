/*
  «سرقت بزرگ» on the server (phase 4, briefs/heist-4.md). POST with the member's JWT and { action, ... }:

    state   { vault? }                 my coins, my vault, the members I can raid, the raids on my vault I haven't watched, today's raids
                                       left, the season and the diamond, and what my diet habits give (phase 5: coins for full-log days,
                                       gadgets for 7-day runs, defence budget for weeks at 100). The first call makes my player row (from
                                       `vault`, the one I drew on this phone, if it is acceptable; else a made-up one).
    save    { vault }                  my vault, if the game's rules accept it within my budget
    buy     { season }                 the season's diamond: the first to pay its price wins the season
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
import { START_COINS, FEE, RAIDS_PER_DAY, OPEN_MINUTES, payout, ending, kitOk, tehranDayStart, tehranDay, seedOf } from "../../../js/domain/heistRules.js";
// @ts-ignore
import { diet, kitOf, fullDays, FULL_DAY_COINS, SEASON_DAYS, DIAMOND } from "../../../js/domain/heistDiet.js";
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

// The season today (a new one, with every player's coins back to the start, when the last has ended or been won).
async function season(today: string) {
  const rows = must(await admin.rpc("heist_season", { p_today: today, p_days: SEASON_DAYS, p_diamond: DIAMOND, p_start_coins: START_COINS })) as any[];
  return rows[0];
}

// What my habits give today, worked out from my own data on the server (never weight, waist or calories): heistDiet.js.
async function habits(uid: string, me: any, seasonStart: string, today: string) {
  const from = [me.since, seasonStart].sort()[0];
  const [entries, notes, activity, prof] = await Promise.all([
    admin.from("entries").select("day,meal").eq("user_id", uid).gte("day", from).lte("day", today).limit(20000),
    admin.from("ai_notes").select("key,kind,data").eq("user_id", uid).eq("kind", "logday").gte("key", `logday:${from}`).lte("key", `logday:${today}`),
    admin.from("activity").select("day,minutes").eq("user_id", uid).gte("day", from).lte("day", today),
    admin.from("profile").select("data").eq("user_id", uid).maybeSingle(),
  ]);
  for (const r of [entries, notes, activity, prof]) if (r.error) throw r.error;
  const p = (prof.data as any)?.data || {};
  return diet({ entries: entries.data, notes: notes.data, activity: activity.data, profile: { phase: p.phase, breakUntil: p.breakUntil, breakFrom: p.breakFrom } },
    today, { since: me.since, season: seasonStart });
}

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
    paid = (count || 0) > 0 || !(await fullToday(raid.thief));
  }
  // `paid` is only a first guess: heist_settle checks it again under lock (two finishes at once can't both be paid)
  const p = payout(status, { ownerCoins, fee: raid.fee, practice: raid.practice || 0, paid });
  const rows = must(await admin.rpc("heist_settle", {
    p_raid: raid.id, p_status: status, p_turns: turns, p_moves: moves, p_loot: p.loot, p_thief: p.thief, p_owner: p.owner, p_shield: p.shield,
    p_since: tehranDayStart(),
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

async function raidsUsed(uid: string) {
  const { count } = await admin.from("heist_raids").select("id", { count: "exact", head: true }).eq("thief", uid).not("owner", "is", null).gte("started_at", tehranDayStart());
  return count || 0;
}

// Is today a full-log day (practice pays only then)?
async function fullToday(uid: string) {
  const today = tehranDay();
  const [e, n] = await Promise.all([
    admin.from("entries").select("day,meal").eq("user_id", uid).eq("day", today),
    admin.from("ai_notes").select("key,kind,data").eq("user_id", uid).eq("key", `logday:${today}`),
  ]);
  return fullDays(e.data || [], n.data || [], today, today).has(today);
}

async function state(uid: string, body: any) {
  const stale = new Date(Date.now() - OPEN_MINUTES * 60000).toISOString();
  await closeOpen(q => q.or(`thief.eq.${uid},owner.eq.${uid}`), stale);
  const today = tehranDay();
  const s = await season(today);
  let { me, created } = await player(uid, body.vault);
  const d = await habits(uid, me, s.starts, today);
  // coins for full-log days not paid yet, and gadgets earned (kept for good, even if a day is later marked «ثبت ناقص»)
  const paid = must(await admin.rpc("heist_credit", { p_user: uid, p_days: d.credit, p_coins: FULL_DAY_COINS })) as number;
  const unlocks = Math.min(4, Math.max(me.unlocks || 0, d.runs));
  if (unlocks !== me.unlocks) must(await admin.from("heist_players").update({ unlocks }).eq("user_id", uid));
  if (paid || unlocks !== me.unlocks) me = (await player(uid)).me;
  const others = must(await admin.from("heist_players").select("user_id,vault,coins,grade,shield_until,trophies").neq("user_id", uid)) as any[];
  const inbox = must(await admin.from("heist_raids").select("id,thief,vault,gadgets,moves,status,turns,loot,fee,finished_at")
    .eq("owner", uid).eq("seen", false).neq("status", "open").order("finished_at", { ascending: true }).limit(20)) as any[];
  const last = must(await admin.from("heist_seasons").select("id,winner,won_at").not("winner", "is", null).order("id", { ascending: false }).limit(1)) as any[];
  const who = await names([...new Set([...others.map(o => o.user_id), ...inbox.map(r => r.thief), ...last.map(x => x.winner)])]);
  const paidRows = must(await admin.from("heist_raids").select("practice").eq("thief", uid).not("practice", "is", null).gt("loot", 0).gte("started_at", tehranDayStart())) as any[];
  const kit = kitOf(unlocks);
  return {
    me: { coins: me.coins, vault: me.vault, grade: me.grade, cost: me.cost, shield_until: me.shield_until, trophies: me.trophies, created },
    raidsLeft: Math.max(0, d.raids - await raidsUsed(uid)),
    practicePaid: d.full ? [...new Set(paidRows.map(r => r.practice))] : [1, 2, 3, 4, 5],   // practice pays only on a full-log day
    targets: others.map(o => ({ id: o.user_id, name: who.get(o.user_id) || "عضو", coins: o.coins, grade: o.grade, shield_until: o.shield_until, trophies: o.trophies, vault: o.vault })),
    inbox: inbox.map(r => ({ ...r, thief_name: who.get(r.thief) || "عضو" })),
    diet: { full: d.full, moved: d.moved, raids: d.raids, toNext: d.toNext, weeksHit: d.weeksHit, budget: d.budget, paidToday: paid },
    kit: { gadgets: kit.gadgets, slots: kit.slots, unlocks },
    season: { id: s.id, starts: s.starts, ends: s.ends, diamond: s.diamond, today },
    lastWinner: last[0] && last[0].id !== s.id ? { name: who.get(last[0].winner) || "عضو", me: last[0].winner === uid } : null,
    rules: { fee: FEE, raidsPerDay: RAIDS_PER_DAY },
  };
}

async function save(uid: string, body: any) {
  const today = tehranDay();
  const { me } = await player(uid);
  const d = await habits(uid, me, (await season(today)).starts, today);
  const c = check(body.vault, d.budget);
  if (!c.ok) throw new Refused("vault");
  must(await admin.from("heist_players").update({ vault: body.vault, cost: c.cost, grade: c.grade, updated_at: new Date().toISOString() }).eq("user_id", uid));
  return { ok: true, cost: c.cost, grade: c.grade };
}

async function start(uid: string, body: any) {
  const gadgets = body.gadgets ?? [];
  const today = tehranDay();
  const { me } = await player(uid);
  const kit = kitOf(me.unlocks);
  if (!kitOk(gadgets, kit.gadgets, kit.slots)) throw new Refused("gadgets");
  await closeOpen(q => q.eq("thief", uid));
  let owner: string | null = null, practice: number | null = null, vault: unknown, fee = 0;
  if (body.practice) {
    const level = Number(body.practice.level), seed = Number(body.practice.seed);
    if (!Number.isInteger(level) || level < 1 || level > LEVELS || !Number.isInteger(seed) || seed < 1 || seed > 99999) throw new Refused("practice");
    practice = level;
    vault = generate(seed, level);
  } else {
    owner = String(body.target || "");
    if (!/^[0-9a-f-]{36}$/.test(owner) || owner === uid) throw new Refused("target");
    vault = null;   // the owner's vault as it is now, read under lock by heist_begin
    fee = FEE;
  }
  // The coins, the shield and the daily limit are all checked inside heist_begin, under lock with the fee taken.
  const perDay = owner ? (await habits(uid, me, (await season(today)).starts, today)).raids : RAIDS_PER_DAY;
  const rows = must(await admin.rpc("heist_begin", {
    p_thief: uid, p_owner: owner, p_practice: practice, p_vault: vault, p_gadgets: gadgets, p_fee: fee, p_since: tehranDayStart(), p_per_day: perDay,
  })) as { o_id: number; o_vault: unknown }[];
  const id = Number(rows[0]?.o_id);
  if (!(id > 0)) throw new Refused(({ "-1": "coins", "-2": "shield", "-3": "limit", "-4": "target" } as Record<string, string>)[String(id)] || "server", id === -4 ? 404 : 409);
  return { raid: id, vault: rows[0].o_vault, fee };
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

async function buy(uid: string, body: any) {
  const today = tehranDay();
  const s = await season(today);
  if (Number(body.season) !== s.id) throw new Refused("over", 409);
  const r = must(await admin.rpc("heist_buy", { p_user: uid, p_season: s.id, p_today: today })) as string;
  if (r !== "won") throw new Refused(r, 409);
  // everyone else hears who won
  const who = (await names([uid])).get(uid) || "یک عضو";
  const others = must(await admin.from("heist_players").select("user_id").neq("user_id", uid)) as any[];
  for (const o of others) {
    try { await notify(admin, o.user_id, { title: "سرقت بزرگ", body: `${who} الماس فصل را خرید و برنده شد. فصل تازه شروع شد.`, tag: "heist-season", url: "./#/heist" }); } catch (e) { console.error("notify failed", e); }
  }
  return { won: true };
}

async function seen(uid: string, body: any) {
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Number.isInteger).slice(0, 50);
  if (ids.length) must(await admin.from("heist_raids").update({ seen: true }).eq("owner", uid).in("id", ids));
  return { ok: true };
}

const ACTIONS: Record<string, (uid: string, body: any) => Promise<unknown>> = { state, save, start, finish, seen, buy };

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
