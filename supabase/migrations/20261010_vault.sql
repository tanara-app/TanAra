-- «صندوقچه»: the private, PIN-locked collection of motivating photos, videos and links.
-- Rows follow the same shape as every other table; files live in their own private bucket
-- under <user id>/, apart from the photos shown on the Today screen.

create table public.vault (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('image', 'video', 'link')),
  path text,        -- the photo or video in the bucket
  thumb_path text,  -- small preview for the grid (a video's poster frame)
  url text,         -- kind = link
  title text not null default '',
  size bigint not null default 0, -- bytes stored for this item, for the usage meter
  created_at timestamptz not null default now()
);
create index vault_user_created on public.vault (user_id, created_at);

alter table public.vault enable row level security;
create policy "owner only" on public.vault for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 30 MB per file: the free plan stores 1 GB in total and refuses files over 50 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vault', 'vault', false, 31457280, array['image/jpeg', 'video/mp4', 'video/quicktime', 'video/webm']);

create policy "vault owner read" on storage.objects for select to authenticated
  using (bucket_id = 'vault' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "vault owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'vault' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "vault owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'vault' and (storage.foldername(name))[1] = (select auth.uid())::text);
