-- Minutes of activity (walking, sport, anything that gets the body moving) per day. Moving a
-- lot is one of the strongest habits of people who keep lost weight off, so the app keeps a
-- simple weekly count. Same shape as waists: user_id from the JWT, RLS owner-only.
create table public.activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  minutes integer not null check (minutes >= 0 and minutes <= 1440),
  created_at timestamptz not null default now(),
  unique (user_id, day)
);
alter table public.activity enable row level security;
create policy "owner only" on public.activity for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
