-- «سرقت بزرگ»: the shield, the daily limit and «each practice level pays once a day» are checked inside the same locked transaction
-- that moves the coins (a security review found that two calls at once could slip past checks made beforehand in the Edge Function).
-- Both players' rows are locked in one order (by user id), so two members raiding each other at once can't deadlock.

drop function public.heist_begin(uuid, uuid, smallint, jsonb, text[], integer);
drop function public.heist_settle(bigint, text, smallint, text[], integer, integer, integer, boolean);

-- o_id > 0: the new raid, with the vault as it is now. Else why not: -1 not enough coins, -2 the owner's vault has a shield,
-- -3 no raids on members left today (since p_since), -4 no such owner.
create function public.heist_begin(p_thief uuid, p_owner uuid, p_practice smallint, p_vault jsonb, p_gadgets text[], p_fee integer, p_since timestamptz, p_per_day integer)
returns table (o_id bigint, o_vault jsonb) language plpgsql security definer set search_path = '' as $$
declare v_coins integer; v_shield timestamptz; v_vault jsonb := p_vault; v_found boolean;
begin
  perform 1 from public.heist_players hp where hp.user_id in (p_thief, p_owner) order by hp.user_id for update;
  select hp.coins into v_coins from public.heist_players hp where hp.user_id = p_thief;
  if v_coins is null or v_coins < p_fee then o_id := -1; return next; return; end if;
  if p_owner is not null then
    select true, hp.vault, hp.shield_until into v_found, v_vault, v_shield from public.heist_players hp where hp.user_id = p_owner;
    if v_found is null then o_id := -4; return next; return; end if;
    if v_shield is not null and v_shield > now() then o_id := -2; return next; return; end if;
    if (select count(*) from public.heist_raids h where h.thief = p_thief and h.owner is not null and h.started_at >= p_since) >= p_per_day then
      o_id := -3; return next; return;
    end if;
  end if;
  update public.heist_players hp set coins = hp.coins - p_fee where hp.user_id = p_thief;
  insert into public.heist_raids (thief, owner, practice, vault, gadgets, fee)
    values (p_thief, p_owner, p_practice, v_vault, p_gadgets, p_fee) returning id into o_id;
  o_vault := v_vault;
  return next;
end $$;

-- A raid ends: its result and the coins, at once. The loot never takes the owner below zero (it shrinks to what there is), and the
-- thief's gain shrinks with it. A practice level that already paid the thief today (since p_since) pays nothing.
create function public.heist_settle(p_raid bigint, p_status text, p_turns smallint, p_moves text[], p_loot integer, p_thief integer, p_owner integer, p_shield boolean, p_since timestamptz)
returns table (o_loot integer, o_coins integer) language plpgsql security definer set search_path = '' as $$
declare
  r public.heist_raids;
  v_take integer := greatest(p_loot, 0);
  v_have integer;
begin
  select * into r from public.heist_raids h where h.id = p_raid and h.status = 'open' for update;
  if not found then raise exception 'heist: raid % is not open', p_raid; end if;
  perform 1 from public.heist_players hp where hp.user_id in (r.thief, r.owner) order by hp.user_id for update;
  if r.practice is not null and exists (select 1 from public.heist_raids h where h.thief = r.thief and h.practice = r.practice
      and h.loot > 0 and h.started_at >= p_since and h.id <> p_raid) then
    v_take := 0;
  end if;
  if r.owner is not null then
    select hp.coins into v_have from public.heist_players hp where hp.user_id = r.owner;
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

revoke all on function public.heist_begin(uuid, uuid, smallint, jsonb, text[], integer, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.heist_settle(bigint, text, smallint, text[], integer, integer, integer, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.heist_begin(uuid, uuid, smallint, jsonb, text[], integer, timestamptz, integer) to service_role;
grant execute on function public.heist_settle(bigint, text, smallint, text[], integer, integer, integer, boolean, timestamptz) to service_role;
