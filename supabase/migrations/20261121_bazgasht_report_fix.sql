-- Two fixes to the 'unsub' trigger of 20261121_bazgasht_report.sql (from the automatic security review, 2026-11-21):
-- 1. When an account is deleted, its subscriptions go with it; logging them then would point at an account that is
--    gone and stop the deletion. So nothing is logged once the account is gone.
-- 2. Turning reminders off and on again and again must not fill push_log: one 'unsub' per member and day.
create unique index push_log_unsub_once on public.push_log (user_id, mark) where kind = 'unsub';

create or replace function public.push_subs_gone() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from auth.users where id = old.user_id) then
    return old;
  end if;
  insert into public.push_log (user_id, kind, mark)
  values (old.user_id, 'unsub', to_char(now() at time zone 'Asia/Tehran', 'YYYY-MM-DD'))
  on conflict (user_id, mark) where kind = 'unsub' do nothing;
  return old;
end;
$$;
revoke all on function public.push_subs_gone() from public, anon, authenticated;
