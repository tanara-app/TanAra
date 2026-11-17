-- «آزمایش خون» (LABS.md): the original PDF of each lab sheet, kept so the member can download it.
-- Private bucket, files under <user id>/<sheet id>.pdf; only the owner reads, adds or removes them.
-- The numbers themselves are ai_notes rows (key lab:<sheet id>), like the app's other notes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('labs', 'labs', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy "labs owner read" on storage.objects for select to authenticated
  using (bucket_id = 'labs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "labs owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'labs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "labs owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'labs' and (storage.foldername(name))[1] = (select auth.uid())::text);
