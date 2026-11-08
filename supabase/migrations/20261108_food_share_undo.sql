-- «غذاهای تازه‌ی خانواده», part three: undo a food sent to everyone, for all members or some.
--
-- A copy now remembers the food it came from (food_share.source), so the owner can see who got
-- each shared food and take the copies back. Undoing removes the copies from those members'
-- banks; past entries keep their own name and numbers (entries.food_id goes null). When no copy
-- is left, the food goes back to the list waiting for a decision. The owner's corrections to the
-- original food stay.

alter table public.food_share add column source uuid;
create index food_share_source on public.food_share (source) where source is not null;

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
  insert into public.food_share (food_id, decision, source) values (copy_id, 'copy', src.id);
end;
$$;
revoke all on function public.food_share_copy(public.foods, uuid) from public, anon, authenticated;

drop function public.food_share_all();
create function public.food_share_all() returns table (
  id uuid, user_id uuid, member text, name text, category text, unit text, grams numeric,
  kcal numeric, protein numeric, is_veg boolean, barcode text, unit2 text, grams2 numeric,
  created_at timestamptz, decided boolean, decision text, decided_at timestamptz, source uuid
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_usage_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select f.id, f.user_id, coalesce(m.name, split_part(u.email, '@', 1), 'بی‌نام'), f.name, f.category, f.unit,
           f.grams, f.kcal, f.protein, f.is_veg, f.barcode, f.unit2, f.grams2, f.created_at,
           (s.food_id is not null), s.decision, s.decided_at, s.source
    from public.foods f
    join auth.users u on u.id = f.user_id
    left join public.usage_members m on m.user_id = f.user_id
    left join public.food_share s on s.food_id = f.id
    order by f.created_at;
end;
$$;

-- Take back the copies of a shared food from these members (null: from everyone). Returns how
-- many were removed.
create function public.food_share_undo(food uuid, members uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  gone integer;
begin
  if not public.is_usage_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.food_share where food_id = food and decision = 'shared') then
    raise exception 'not shared' using errcode = 'P0002';
  end if;
  with c as (
    delete from public.food_share s
    where s.source = food and s.decision = 'copy'
      and (members is null or exists (select 1 from public.foods f where f.id = s.food_id and f.user_id = any(members)))
    returning s.food_id
  )
  delete from public.foods where id in (select food_id from c);
  get diagnostics gone = row_count;
  -- copies a member already deleted themselves leave only their food_share row
  delete from public.food_share s
    where s.source = food and s.decision = 'copy' and not exists (select 1 from public.foods f where f.id = s.food_id);
  if not exists (select 1 from public.food_share where source = food) then
    delete from public.food_share where food_id = food;
  end if;
  return gone;
end;
$$;

revoke all on function public.food_share_all() from public, anon;
revoke all on function public.food_share_undo(uuid, uuid[]) from public, anon;
grant execute on function public.food_share_all() to authenticated;
grant execute on function public.food_share_undo(uuid, uuid[]) to authenticated;
