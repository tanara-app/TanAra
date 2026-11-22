-- More from the automatic security review of 20261121_bazgasht_report_fix.sql (2026-11-21):
-- 1. Safe to run again: duplicates are removed before the unique index, which is made only if missing.
-- 2. The 'unsub' log can never stop anything: the account check can lose a race with its deletion, so an insert
--    that would point at a deleted account is simply dropped (foreign_key_violation caught).
delete from public.push_log p using public.push_log q
  where p.kind = 'unsub' and q.kind = 'unsub' and p.user_id = q.user_id and p.mark = q.mark and p.id > q.id;
create unique index if not exists push_log_unsub_once on public.push_log (user_id, mark) where kind = 'unsub';

create or replace function public.push_subs_gone() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from auth.users where id = old.user_id) then
    return old;
  end if;
  begin
    insert into public.push_log (user_id, kind, mark)
    values (old.user_id, 'unsub', to_char(now() at time zone 'Asia/Tehran', 'YYYY-MM-DD'))
    on conflict (user_id, mark) where kind = 'unsub' do nothing;
  exception when foreign_key_violation then
    null; -- the account is going: nothing to log
  end;
  return old;
end;
$$;
revoke all on function public.push_subs_gone() from public, anon, authenticated;
