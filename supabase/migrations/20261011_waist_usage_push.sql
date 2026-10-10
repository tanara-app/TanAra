-- Waist measurements, Hooshvareh's token use, and push reminders.
-- Same shape as every other table: user_id filled from the JWT, RLS owner-only.

-- Waist in cm at the level of the navel, at most one per day (like weights).
create table public.waists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  cm numeric not null check (cm >= 40 and cm <= 250),
  created_at timestamptz not null default now(),
  unique (user_id, day)
);
alter table public.waists enable row level security;
create policy "owner only" on public.waists for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- One row per call Hooshvareh makes to the Claude API, written by the Edge Function with the
-- person's own JWT. The app adds them up to show what the AI costs (نمایه ← مصرف هوشواره).
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  at timestamptz not null default now(),
  mode text not null,
  input integer not null default 0,       -- uncached input tokens
  cache_read integer not null default 0,
  cache_write integer not null default 0,
  output integer not null default 0,
  searches integer not null default 0     -- web searches (magazine)
);
create index ai_usage_user_at on public.ai_usage (user_id, at);
alter table public.ai_usage enable row level security;
create policy "owner reads" on public.ai_usage for select to authenticated
  using (user_id = (select auth.uid()));
create policy "owner adds" on public.ai_usage for insert to authenticated
  with check (user_id = (select auth.uid()));

-- A browser's push subscription (one per device). `sent` remembers the last local day each
-- kind of reminder went to this device, so nothing is sent twice.
create table public.push_subs (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  sent jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index push_subs_user on public.push_subs (user_id);
alter table public.push_subs enable row level security;
create policy "owner only" on public.push_subs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Server-side secrets of the `remind` function (its VAPID key pair, the cron key). RLS is on
-- with no policy: only the service role can read or write them.
create table public.app_secrets (
  key text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;
insert into public.app_secrets (key, value) values ('cron_key', encode(extensions.gen_random_bytes(24), 'hex'));

-- Every 10 minutes the database wakes the `remind` function, which decides who is due.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('tanara-remind', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://whmzjvmeyxdoqjtkukix.supabase.co/functions/v1/remind',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select value from public.app_secrets where key = 'cron_key')),
    body := '{}'::jsonb
  );
$$);
