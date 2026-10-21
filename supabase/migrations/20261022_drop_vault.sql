-- «صندوقچه» is removed from the app. Its table and bucket were emptied first; this drops what
-- is left: the table, the bucket's policies and its settings in the profile. The empty bucket
-- itself can only go through the Storage API (dashboard); without policies nobody can reach it.

drop table public.vault;

drop policy "vault owner read" on storage.objects;
drop policy "vault owner insert" on storage.objects;
drop policy "vault owner delete" on storage.objects;

update public.profile set data = data - 'vault' where data ? 'vault';
