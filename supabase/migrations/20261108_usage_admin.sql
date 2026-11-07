-- «مصرف هوشواره» for the app's owner: everyone's AI usage, by member and with names.
-- Each person still reads only their own rows through ai_usage's RLS; the owner reads all of them
-- through ai_usage_all(), which checks usage_members.admin for the caller.
--
-- Who is the owner and what each member is called live only in the database (the repo is public):
--   insert into public.usage_members (user_id, name, admin) values ('<uuid>', '<name>', true);
-- RLS is on with no policy, so no client can read or change this table directly.

create table public.usage_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  admin boolean not null default false
);
alter table public.usage_members enable row level security;

-- true when the signed-in person may see everyone's usage
create function public.is_usage_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select admin from public.usage_members where user_id = (select auth.uid())), false);
$$;

-- Every member's usage rows since a time, with the member's name. A member without a name in
-- usage_members shows with the start of their email, so a new account is never left out.
create function public.ai_usage_all(since timestamptz) returns table (
  user_id uuid, name text, at timestamptz, mode text,
  input integer, cache_read integer, cache_write integer, output integer, searches integer
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_usage_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select a.user_id, coalesce(m.name, split_part(u.email, '@', 1), 'بی‌نام'), a.at, a.mode,
           a.input, a.cache_read, a.cache_write, a.output, a.searches
    from public.ai_usage a
    left join public.usage_members m on m.user_id = a.user_id
    left join auth.users u on u.id = a.user_id
    where a.at >= since
    order by a.at
    limit 20000;
end;
$$;

revoke all on function public.is_usage_admin() from public, anon;
revoke all on function public.ai_usage_all(timestamptz) from public, anon;
grant execute on function public.is_usage_admin() to authenticated;
grant execute on function public.ai_usage_all(timestamptz) to authenticated;
