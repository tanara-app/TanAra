-- Every push the `remind` function sent (to at least one of the person's devices): its kind, its mark
-- (the day, the magazine's week or the reward's key) and when. BAZGASHT.md: the pushes of an absence
-- (back3, back5, last, fresh) read it to know which step comes next, and phase 10 reads it to see
-- which pushes brought someone back. Row level security on and no policy: only the service role.
create table public.push_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  mark text not null default '',
  at timestamptz not null default now()
);
create index push_log_user_kind on public.push_log (user_id, kind, mark);
alter table public.push_log enable row level security;
