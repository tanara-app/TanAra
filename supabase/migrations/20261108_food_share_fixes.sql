-- «غذاهای تازه‌ی خانواده», part four: fixes after using it end to end.
--
-- - A copy remembers whose bank it went to (food_share.member). Taking a copy back from some
--   members now leaves an 'undone' row instead of nothing, so the screen no longer offers those
--   members the same food again as «تازه آمده»; food_share_members() lists them per member.
-- - A «نه» can be taken back too: food_share_undo() on a declined food puts it back in the list.
-- - food_share_catch_up() never gives a member a second copy of the same food.
-- - food_share_all() says whether a food is the bank food of one of its owner's recipes.

alter table public.food_share add column member uuid;
alter table public.food_share drop constraint food_share_decision_check;
alter table public.food_share add constraint food_share_decision_check
  check (decision in ('shared', 'declined', 'copy', 'undone'));

create or replace function public.food_share_copy(src public.foods, target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  copy_id uuid := gen_random_uuid();
begin
  insert into public.foods (id, user_id, name, category, unit, grams, kcal, protein, is_veg, barcode, unit2, grams2, created_at, updated_at)
  values (copy_id, target, src.name, src.category, src.unit, src.grams, src.kcal, src.protein, src.is_veg,
          -- one barcode per bank: a member who has it on another food keeps theirs
          case when exists (select 1 from public.foods where user_id = target and barcode = src.barcode) then null else src.barcode end,
          src.unit2, src.grams2, now(), now());
  insert into public.food_share (food_id, decision, source, member) values (copy_id, 'copy', src.id, target);
end;
$$;
revoke all on function public.food_share_copy(public.foods, uuid) from public, anon, authenticated;

drop function public.food_share_members();
create function public.food_share_members() returns table (user_id uuid, name text, joined timestamptz, skip uuid[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_usage_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select u.id, coalesce(m.name, split_part(u.email, '@', 1), 'بی‌نام'), u.created_at,
           -- shared foods taken back from this member: not offered to them again
           coalesce((select array_agg(s.source) from public.food_share s where s.decision = 'undone' and s.member = u.id), '{}')
    from auth.users u left join public.usage_members m on m.user_id = u.id
    order by u.created_at;
end;
$$;

drop function public.food_share_all();
create function public.food_share_all() returns table (
  id uuid, user_id uuid, member text, name text, category text, unit text, grams numeric,
  kcal numeric, protein numeric, is_veg boolean, barcode text, unit2 text, grams2 numeric,
  created_at timestamptz, decided boolean, decision text, decided_at timestamptz, source uuid,
  from_recipe boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_usage_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select f.id, f.user_id, coalesce(m.name, split_part(u.email, '@', 1), 'بی‌نام'), f.name, f.category, f.unit,
           f.grams, f.kcal, f.protein, f.is_veg, f.barcode, f.unit2, f.grams2, f.created_at,
           (s.food_id is not null), s.decision, s.decided_at, s.source,
           exists (select 1 from public.ai_notes n where n.user_id = f.user_id and n.key like 'recipe:%' and n.data->>'food_id' = f.id::text)
    from public.foods f
    join auth.users u on u.id = f.user_id
    left join public.usage_members m on m.user_id = f.user_id
    left join public.food_share s on s.food_id = f.id
    order by f.created_at;
end;
$$;

create or replace function public.food_share_catch_up(member uuid, foods uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  src public.foods;
  made integer := 0;
begin
  if not public.is_usage_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- «member» is also a column of food_share, so the argument is always written in full
  if not exists (select 1 from auth.users where id = food_share_catch_up.member) then
    raise exception 'no such member' using errcode = 'P0002';
  end if;
  for src in
    select f.* from public.foods f join public.food_share s on s.food_id = f.id and s.decision = 'shared'
    where f.id = any(coalesce(food_share_catch_up.foods, '{}')) and f.user_id <> food_share_catch_up.member
      and not exists (
        select 1 from public.food_share c join public.foods cf on cf.id = c.food_id
        where c.source = f.id and c.decision = 'copy' and cf.user_id = food_share_catch_up.member)
  loop
    perform public.food_share_copy(src, food_share_catch_up.member);
    made := made + 1;
  end loop;
  return made;
end;
$$;

-- Shared: take the copies back from these members (null: everyone); the members left out keep
-- theirs, the ones it was taken from are remembered ('undone'), and when no copy is left the
-- food waits for a decision again. Declined: the «نه» is forgotten and the food waits again.
-- Returns how many copies were removed.
create or replace function public.food_share_undo(food uuid, members uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  gone integer := 0;
  d text;
begin
  if not public.is_usage_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select decision into d from public.food_share where food_id = food;
  if d = 'declined' then
    delete from public.food_share where food_id = food;
    return 0;
  end if;
  if d is distinct from 'shared' then
    raise exception 'not shared' using errcode = 'P0002';
  end if;
  with c as (
    update public.food_share s set decision = 'undone', decided_at = now(),
           member = coalesce(s.member, (select f.user_id from public.foods f where f.id = s.food_id))
    where s.source = food and s.decision = 'copy'
      and (members is null or exists (select 1 from public.foods f where f.id = s.food_id and f.user_id = any(members)))
    returning s.food_id
  )
  delete from public.foods where id in (select food_id from c);
  get diagnostics gone = row_count;
  -- copies a member already deleted themselves: nothing to keep
  delete from public.food_share s
    where s.source = food and s.decision = 'copy' and not exists (select 1 from public.foods f where f.id = s.food_id);
  if not exists (select 1 from public.food_share where source = food and decision = 'copy') then
    delete from public.food_share where source = food or food_id = food;
  end if;
  return gone;
end;
$$;

revoke all on function public.food_share_members() from public, anon;
revoke all on function public.food_share_all() from public, anon;
grant execute on function public.food_share_members() to authenticated;
grant execute on function public.food_share_all() to authenticated;
