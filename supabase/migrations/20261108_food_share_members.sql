-- «غذاهای تازه‌ی خانواده», part two: every account is a member, and a member who joins later can
-- get the foods shared before they came.
--
-- A member is any account in auth.users. Its name comes from usage_members, or the start of its
-- email until it has one there, so a new account is never left out. food_share_all() now also
-- says which foods were shared and when, so the screen can tell what a newer member is missing,
-- and food_share_catch_up() copies those foods to them.

-- One copy of a food into a member's bank, recorded as a copy. Internal: no client can call it.
create function public.food_share_copy(src public.foods, target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  copy_id uuid := gen_random_uuid();
begin
  insert into public.foods (id, user_id, name, category, unit, grams, kcal, protein, is_veg, barcode, unit2, grams2, created_at, updated_at)
  values (copy_id, target, src.name, src.category, src.unit, src.grams, src.kcal, src.protein, src.is_veg,
          -- one barcode per bank: a member who has it on another food keeps theirs
          case when exists (select 1 from public.foods where user_id = target and barcode = src.barcode) then null else src.barcode end,
          src.unit2, src.grams2, now(), now());
  insert into public.food_share (food_id, decision) values (copy_id, 'copy');
end;
$$;
revoke all on function public.food_share_copy(public.foods, uuid) from public, anon, authenticated;

-- Every account, with its name and when it joined.
create function public.food_share_members() returns table (user_id uuid, name text, joined timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_usage_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select u.id, coalesce(m.name, split_part(u.email, '@', 1), 'بی‌نام'), u.created_at
    from auth.users u left join public.usage_members m on m.user_id = u.id
    order by u.created_at;
end;
$$;

drop function public.food_share_all();
create function public.food_share_all() returns table (
  id uuid, user_id uuid, member text, name text, category text, unit text, grams numeric,
  kcal numeric, protein numeric, is_veg boolean, barcode text, unit2 text, grams2 numeric,
  created_at timestamptz, decided boolean, decision text, decided_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_usage_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select f.id, f.user_id, coalesce(m.name, split_part(u.email, '@', 1), 'بی‌نام'), f.name, f.category, f.unit,
           f.grams, f.kcal, f.protein, f.is_veg, f.barcode, f.unit2, f.grams2, f.created_at,
           (s.food_id is not null), s.decision, s.decided_at
    from public.foods f
    join auth.users u on u.id = f.user_id
    left join public.usage_members m on m.user_id = f.user_id
    left join public.food_share s on s.food_id = f.id
    order by f.created_at;
end;
$$;

-- Same as before, but any account can be a target, and the copy goes through food_share_copy().
create or replace function public.food_share_decide(food uuid, share boolean, fields jsonb, targets uuid[])
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  src public.foods;
  made integer := 0;
  t uuid;
begin
  if not public.is_usage_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.food_share where food_id = food) then
    raise exception 'already decided' using errcode = '23505';
  end if;
  select * into src from public.foods where id = food;
  if not found then
    raise exception 'no such food' using errcode = 'P0002';
  end if;
  if not share then
    insert into public.food_share (food_id, decision) values (food, 'declined');
    return 0;
  end if;

  src.name := coalesce(nullif(btrim(fields->>'name'), ''), src.name);
  src.category := coalesce(fields->>'category', src.category);
  src.kcal := coalesce((fields->>'kcal')::numeric, src.kcal);
  src.protein := coalesce((fields->>'protein')::numeric, src.protein);
  update public.foods
    set name = src.name, category = src.category, kcal = src.kcal, protein = src.protein, updated_at = now()
    where id = food
      and (name, category, kcal, protein) is distinct from (src.name, src.category, src.kcal, src.protein);

  foreach t in array coalesce(targets, '{}') loop
    continue when t = src.user_id or not exists (select 1 from auth.users where id = t);
    perform public.food_share_copy(src, t);
    made := made + 1;
  end loop;
  insert into public.food_share (food_id, decision) values (food, 'shared');
  return made;
end;
$$;

-- Copy foods already shared with everyone into one member's bank (the screen leaves out the ones
-- they have a similar food for). Foods that were not shared, or are theirs, are skipped.
create function public.food_share_catch_up(member uuid, foods uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  src public.foods;
  made integer := 0;
begin
  if not public.is_usage_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = member) then
    raise exception 'no such member' using errcode = 'P0002';
  end if;
  for src in
    select f.* from public.foods f join public.food_share s on s.food_id = f.id and s.decision = 'shared'
    where f.id = any(coalesce(foods, '{}')) and f.user_id <> member
  loop
    perform public.food_share_copy(src, member);
    made := made + 1;
  end loop;
  return made;
end;
$$;

revoke all on function public.food_share_members() from public, anon;
revoke all on function public.food_share_all() from public, anon;
revoke all on function public.food_share_catch_up(uuid, uuid[]) from public, anon;
grant execute on function public.food_share_members() to authenticated;
grant execute on function public.food_share_all() to authenticated;
grant execute on function public.food_share_catch_up(uuid, uuid[]) to authenticated;
