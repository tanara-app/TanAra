-- The magazine is shared: one article a week for everyone, instead of one per person.
-- The `magazine` Edge Function writes it (pg_cron wakes it on Saturday morning, Tehran time; the
-- owner can also write the week's article early, optionally on a topic), and `remind` pushes it
-- to every device that has notifications on. Each app copies the ready articles into its own
-- ai_notes (key 'mag:<week>:all'), so reading, «خوانده شد» and asking Hooshvareh about an
-- article work as before. The article is general: no member's data goes into it.

create table public.magazine (
  week date primary key,      -- the Saturday the week starts on
  status text not null default 'writing' check (status in ('writing', 'ready', 'failed')),
  data jsonb not null default '{}'::jsonb,  -- the article, as publish_article returned it
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.magazine enable row level security;
-- Everyone signed in reads the finished articles; only the service role (the function) writes.
create policy "signed in reads ready" on public.magazine for select to authenticated
  using (status = 'ready');

-- Saturday 07:00, 09:00 and 12:00 in Tehran (UTC+3:30). The later runs only matter when an
-- earlier one failed: the function does nothing once the week's article exists. It answers at
-- once and writes in the background, so pg_net's short timeout is fine.
select cron.schedule('tanara-magazine', '30 3,5,8 * * 6', $$
  select net.http_post(
    url := 'https://whmzjvmeyxdoqjtkukix.supabase.co/functions/v1/magazine',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', (select value from public.app_secrets where key = 'cron_key')),
    body := '{}'::jsonb
  );
$$);
