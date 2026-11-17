-- «سرقت بزرگ», phase 5 (briefs/heist-5.md): seasons and the diamond, coins for full-log days, gadgets earned for good.
-- What a member's habits earn is worked out by the `heist` Edge Function from their own entries, notes and activity
-- (js/domain/heistDiet.js); these functions only store it, under lock, so nothing is paid twice.

alter table public.heist_players
  add column unlocks smallint not null default 0 check (unlocks between 0 and 4),   -- 7-day full-log runs: decoy, lockpick, goggles, a 3rd slot
  add column trophies smallint not null default 0,                                  -- seasons won
  add column since date not null default ((now() at time zone 'Asia/Tehran')::date); -- runs count from the day they began playing

-- Full-log days already paid, so each pays once.
create table public.heist_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  coins integer not null default 0,
  primary key (user_id, day)
);
alter table public.heist_days enable row level security;
create policy "own days: read" on public.heist_days for select to authenticated using (user_id = (select auth.uid()));

-- The season today: the open one, or a new one when the last has ended or been won. A new season puts every player's coins back to
-- the start (trophies stay).
create function public.heist_season(p_today date, p_days integer, p_diamond integer, p_start_coins integer)
returns setof public.heist_seasons language plpgsql security definer set search_path = '' as $$
declare s public.heist_seasons;
begin
  perform pg_advisory_xact_lock(hashtext('heist_season'));
  select * into s from public.heist_seasons h where h.winner is null and p_today between h.starts and h.ends order by h.id desc limit 1;
  if not found then
    insert into public.heist_seasons (starts, ends, diamond) values (p_today, p_today + p_days - 1, p_diamond) returning * into s;
    update public.heist_players set coins = p_start_coins;
  end if;
  return next s;
end $$;

-- Coins for full-log days not paid yet. Returns how many days were paid.
create function public.heist_credit(p_user uuid, p_days date[], p_coins integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with paid as (
    insert into public.heist_days (user_id, day, coins) select p_user, d, p_coins from unnest(p_days) d
    on conflict (user_id, day) do nothing returning 1
  ) select count(*) into n from paid;
  if n > 0 then update public.heist_players set coins = coins + n * p_coins where user_id = p_user; end if;
  return n;
end $$;

-- The diamond: the first to pay its price wins the season. 'won', or why not: 'over' (no such open season), 'coins'.
create function public.heist_buy(p_user uuid, p_season smallint, p_today date)
returns text language plpgsql security definer set search_path = '' as $$
declare s public.heist_seasons; v_coins integer;
begin
  perform pg_advisory_xact_lock(hashtext('heist_season'));
  select * into s from public.heist_seasons h where h.id = p_season for update;
  if not found or s.winner is not null or p_today > s.ends then return 'over'; end if;
  select hp.coins into v_coins from public.heist_players hp where hp.user_id = p_user for update;
  if v_coins is null or v_coins < s.diamond then return 'coins'; end if;
  update public.heist_players hp set coins = hp.coins - s.diamond, trophies = hp.trophies + 1 where hp.user_id = p_user;
  update public.heist_seasons h set winner = p_user, won_at = now() where h.id = p_season;
  return 'won';
end $$;

revoke all on function public.heist_season(date, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.heist_credit(uuid, date[], integer) from public, anon, authenticated;
revoke all on function public.heist_buy(uuid, smallint, date) from public, anon, authenticated;
grant execute on function public.heist_season(date, integer, integer, integer) to service_role;
grant execute on function public.heist_credit(uuid, date[], integer) to service_role;
grant execute on function public.heist_buy(uuid, smallint, date) to service_role;
