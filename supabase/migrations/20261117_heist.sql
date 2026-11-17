-- «سرقت بزرگ», phase 4 (briefs/heist-4.md): vaults, raids and coins on the server.
-- A member reads only their own player row and the raids they made or suffered. Nothing is written from the phone: the `heist` Edge
-- Function (service role) checks every vault with the game's own rules, replays every raid, and moves coins only through the two
-- functions below, which lock the rows they touch.

create table public.heist_players (
  user_id uuid primary key references auth.users(id) on delete cascade,
  vault jsonb not null,
  cost smallint not null default 0,
  grade smallint not null default 0,
  coins integer not null default 500 check (coins >= 0),
  shield_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.heist_players enable row level security;
create policy "own row: read" on public.heist_players for select to authenticated using (user_id = (select auth.uid()));

create table public.heist_raids (
  id bigint generated always as identity primary key,
  thief uuid not null references auth.users(id) on delete cascade,
  owner uuid references auth.users(id) on delete cascade,          -- null: a practice vault
  practice smallint check (practice between 1 and 5),
  vault jsonb not null,                                             -- the vault as it was when the raid began
  gadgets text[] not null default '{}',
  moves text[],
  status text not null default 'open' check (status in ('open', 'escaped', 'escaped_alarm', 'fled', 'caught', 'timeout')),
  turns smallint,
  fee integer not null default 0 check (fee >= 0),
  loot integer not null default 0 check (loot >= 0),
  seen boolean not null default false,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index heist_raids_thief on public.heist_raids (thief, started_at desc);
create index heist_raids_owner on public.heist_raids (owner, started_at desc);
alter table public.heist_raids enable row level security;
create policy "own raids: read" on public.heist_raids for select to authenticated
  using (thief = (select auth.uid()) or owner = (select auth.uid()));

-- Seasons and the diamond (phase 5). Empty until then; everyone may read them.
create table public.heist_seasons (
  id smallint generated always as identity primary key,
  starts date not null,
  ends date not null,
  diamond integer not null check (diamond > 0),
  winner uuid references auth.users(id) on delete set null,
  won_at timestamptz
);
alter table public.heist_seasons enable row level security;
create policy "seasons: read" on public.heist_seasons for select to authenticated using (true);

-- A raid begins: the fee leaves the thief (if they have it) and the raid is written. Null if the thief can't pay.
create function public.heist_begin(p_thief uuid, p_owner uuid, p_practice smallint, p_vault jsonb, p_gadgets text[], p_fee integer)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  update public.heist_players set coins = coins - p_fee where user_id = p_thief and coins >= p_fee;
  if not found then return null; end if;
  insert into public.heist_raids (thief, owner, practice, vault, gadgets, fee)
    values (p_thief, p_owner, p_practice, p_vault, p_gadgets, p_fee) returning id into v_id;
  return v_id;
end $$;

-- A raid ends: its result and the coins, at once. The loot never takes the owner below zero (it shrinks to what there is), and the
-- thief's gain shrinks with it.
create function public.heist_settle(p_raid bigint, p_status text, p_turns smallint, p_moves text[], p_loot integer, p_thief integer, p_owner integer, p_shield boolean)
returns table (o_loot integer, o_coins integer) language plpgsql security definer set search_path = '' as $$
declare
  r public.heist_raids;
  v_take integer := greatest(p_loot, 0);
  v_have integer;
begin
  select * into r from public.heist_raids h where h.id = p_raid and h.status = 'open' for update;
  if not found then raise exception 'heist: raid % is not open', p_raid; end if;
  if r.owner is not null then
    select hp.coins into v_have from public.heist_players hp where hp.user_id = r.owner for update;
    v_take := least(v_take, coalesce(v_have, 0));
    update public.heist_players hp
      set coins = hp.coins + (case when p_owner < 0 then -v_take else p_owner end),
          shield_until = case when p_shield then now() + interval '12 hours' else hp.shield_until end
      where hp.user_id = r.owner;
  end if;
  update public.heist_players hp set coins = hp.coins + greatest(0, p_thief - (greatest(p_loot, 0) - v_take))
    where hp.user_id = r.thief returning hp.coins into o_coins;
  update public.heist_raids h set status = p_status, turns = p_turns, moves = p_moves, loot = v_take, finished_at = now() where h.id = p_raid;
  o_loot := v_take;
  return next;
end $$;

revoke all on function public.heist_begin(uuid, uuid, smallint, jsonb, text[], integer) from public, anon, authenticated;
revoke all on function public.heist_settle(bigint, text, smallint, text[], integer, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.heist_begin(uuid, uuid, smallint, jsonb, text[], integer) to service_role;
grant execute on function public.heist_settle(bigint, text, smallint, text[], integer, integer, integer, boolean) to service_role;
