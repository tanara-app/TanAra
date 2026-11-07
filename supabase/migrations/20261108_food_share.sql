-- «غذاهای تازه‌ی خانواده» for the app's owner: the foods members added to their own bank, so the
-- owner can send the good ones to everyone else's bank. Each person still reads and writes only
-- their own foods through RLS; the owner (usage_members.admin) works through the two
-- security-definer functions below. The members are the people in usage_members.
--
-- food_share remembers every decision, so a food is shown once: 'shared' (sent to others),
-- 'declined' (kept only in its owner's bank) and 'copy' (a copy made by sharing, never offered
-- again). RLS is on with no policy, so no client reads or changes it directly.

create table public.food_share (
  food_id uuid primary key,
  decision text not null check (decision in ('shared', 'declined', 'copy')),
  decided_at timestamptz not null default now()
);
alter table public.food_share enable row level security;

-- Every member's foods, with the member's name and whether the food was already decided.
create function public.food_share_all() returns table (
  id uuid, user_id uuid, member text, name text, category text, unit text, grams numeric,
  kcal numeric, protein numeric, is_veg boolean, barcode text, unit2 text, grams2 numeric,
  created_at timestamptz, decided boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_usage_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select f.id, f.user_id, m.name, f.name, f.category, f.unit, f.grams, f.kcal, f.protein, f.is_veg,
           f.barcode, f.unit2, f.grams2, f.created_at, (s.food_id is not null)
    from public.foods f
    join public.usage_members m on m.user_id = f.user_id
    left join public.food_share s on s.food_id = f.id
    order by f.created_at;
end;
$$;

-- Decide one food. Shared: the owner's corrections (name, category, kcal, protein) go to the food
-- itself and to a copy in the bank of each member in `targets` (never its own owner). Declined:
-- nothing else changes. Returns how many copies were made.
create function public.food_share_decide(food uuid, share boolean, fields jsonb, targets uuid[])
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  src public.foods;
  made integer := 0;
  t uuid;
  copy_id uuid;
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
    continue when t = src.user_id or not exists (select 1 from public.usage_members where user_id = t);
    copy_id := gen_random_uuid();
    insert into public.foods (id, user_id, name, category, unit, grams, kcal, protein, is_veg, barcode, unit2, grams2, created_at, updated_at)
    values (copy_id, t, src.name, src.category, src.unit, src.grams, src.kcal, src.protein, src.is_veg,
            -- one barcode per bank: a member who has it on another food keeps theirs
            case when exists (select 1 from public.foods where user_id = t and barcode = src.barcode) then null else src.barcode end,
            src.unit2, src.grams2, now(), now());
    insert into public.food_share (food_id, decision) values (copy_id, 'copy');
    made := made + 1;
  end loop;
  insert into public.food_share (food_id, decision) values (food, 'shared');
  return made;
end;
$$;

revoke all on function public.food_share_all() from public, anon;
revoke all on function public.food_share_decide(uuid, boolean, jsonb, uuid[]) from public, anon;
grant execute on function public.food_share_all() to authenticated;
grant execute on function public.food_share_decide(uuid, boolean, jsonb, uuid[]) to authenticated;
