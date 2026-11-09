-- «لیست خرید» is one list for the whole family (js/data/shop.js). Every item says who wants it
-- (the member who added it); anyone can tick what they bought, or clear what has been bought.
-- Only the one who added a waiting item can take it off. Names come from usage_members through
-- family_shop_list(), never emails.
--
-- The items still waiting in each member's own list (ai_notes with kind 'shop') move here.

create table public.family_shop (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  amount text not null default '' check (char_length(amount) <= 40),
  food_id uuid,          -- the adder's bank food of the same name, if any
  done boolean not null default false,
  at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index family_shop_at on public.family_shop (at);
alter table public.family_shop enable row level security;

create policy "family shop: read" on public.family_shop for select to authenticated using (true);
create policy "family shop: add" on public.family_shop for insert to authenticated with check (user_id = (select auth.uid()));
create policy "family shop: tick" on public.family_shop for update to authenticated using (true) with check (true);
create policy "family shop: remove" on public.family_shop for delete to authenticated
  using (user_id = (select auth.uid()) or done);

-- who added an item never changes
revoke update on public.family_shop from authenticated;
grant update (name, amount, food_id, done, at, updated_at) on public.family_shop to authenticated;

-- the others can only tick an item (bought / not bought); its name and amount are the adder's
create function public.family_shop_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.user_id is distinct from (select auth.uid())
     and (new.name, new.amount, new.food_id, new.at) is distinct from (old.name, old.amount, old.food_id, old.at) then
    raise exception 'only the one who added it can change it'; -- P0001: the app's queue drops it instead of retrying
  end if;
  return new;
end;
$$;
create trigger family_shop_guard before update on public.family_shop
  for each row execute function public.family_shop_guard();
revoke all on public.family_shop from anon;

create function public.family_shop_list() returns table (
  id uuid, user_id uuid, who text, me boolean, name text, amount text, food_id uuid, done boolean, at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select s.id, s.user_id, coalesce(m.name, 'عضو تازه'), s.user_id = (select auth.uid()),
         s.name, s.amount, s.food_id, s.done, s.at
  from public.family_shop s
  left join public.usage_members m on m.user_id = s.user_id
  where (select auth.uid()) is not null
  order by s.at;
$$;
revoke all on function public.family_shop_list() from public, anon;
grant execute on function public.family_shop_list() to authenticated;

insert into public.family_shop (user_id, name, amount, food_id, done, at)
select n.user_id, left(btrim(n.data->>'name'), 80), left(coalesce(n.data->>'amount', ''), 40),
       case when n.data->>'food_id' ~ '^[0-9a-f-]{36}$' then (n.data->>'food_id')::uuid end,
       false, coalesce((n.data->>'at')::timestamptz, n.created_at)
from public.ai_notes n
where n.kind = 'shop' and coalesce((n.data->>'done')::boolean, false) = false
  and btrim(coalesce(n.data->>'name', '')) <> '';
delete from public.ai_notes where kind = 'shop';
