-- «گزارش خرابی و انتقاد» (نمایه): bug reports, complaints and ideas from the people using the
-- app, with up to 4 photos. Each person can send and read only their own; the Claudes that work
-- on the app read all of them with the service role (SQL) and mark them, and fetch the photos
-- through the `feedback` Edge Function (see FEEDBACK.md). The person never changes status or answer.
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('bug', 'gripe', 'idea')),
  body text not null check (char_length(body) between 1 and 4000),
  images text[] not null default '{}' check (cardinality(images) <= 4),
  context jsonb not null default '{}'::jsonb,
  -- new: not shown to the user yet · seen: shown, no decision · planned / done / declined: decided
  status text not null default 'new' check (status in ('new', 'seen', 'planned', 'done', 'declined')),
  answer text check (char_length(answer) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index feedback_status on public.feedback (status, created_at);
create index feedback_user on public.feedback (user_id, created_at);
alter table public.feedback enable row level security;
create policy "owner reads" on public.feedback for select to authenticated
  using (user_id = (select auth.uid()));
create policy "owner sends" on public.feedback for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'new' and answer is null);

-- Photos: private, under <user id>/<feedback id>/.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback', 'feedback', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);
create policy "feedback owner read" on storage.objects for select to authenticated
  using (bucket_id = 'feedback' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "feedback owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback' and (storage.foldername(name))[1] = (select auth.uid())::text);
