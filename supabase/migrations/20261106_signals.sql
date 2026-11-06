-- Observations (js/domain/signals.js, SIGNALS.md): patterns the app finds in each person's
-- record, one row per kind per day, so the people running the app can later see where it
-- falls short and add a fix only where it is needed. Never shown in the app and never a
-- diagnosis. The app only writes them; reading across people is done with the service role.
create table public.signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  kind text not null check (char_length(kind) <= 40),
  data jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  unique (user_id, day, kind)
);
create index signals_kind_day on public.signals (kind, day);
alter table public.signals enable row level security;
create policy "owner only" on public.signals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
