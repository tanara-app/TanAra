-- Hooshvareh (the in-app AI): chat history and the short texts it writes elsewhere in the app.
-- Same shape as every other table: user_id filled from the JWT, RLS owner-only.

create table public.chat (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  actions jsonb not null default '[]'::jsonb, -- proposals shown under an assistant reply, with their status
  created_at timestamptz not null default now()
);
create index chat_user_created on public.chat (user_id, created_at);

-- One row per generated note: key is '<kind>:<ref>', e.g. 'tip:2026-10-08', 'review:2026-10-03'.
create table public.ai_notes (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null,
  kind text not null,
  text text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.chat enable row level security;
alter table public.ai_notes enable row level security;
create policy "owner only" on public.chat for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner only" on public.ai_notes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
