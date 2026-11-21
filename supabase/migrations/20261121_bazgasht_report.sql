-- BAZGASHT.md, phase 10: what to measure, so the pushes of an absence can be judged after four weeks.

-- A notification subscription that goes (the push service no longer knows it, or the member turned reminders off on
-- a device) is a push_log row 'unsub': turning notifications off is the cost of sending too much.
create function public.push_subs_gone() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.push_log (user_id, kind, mark)
  values (old.user_id, 'unsub', to_char(now() at time zone 'Asia/Tehran', 'YYYY-MM-DD'));
  return old;
end;
$$;
revoke all on function public.push_subs_gone() from public, anon, authenticated;
create trigger push_subs_gone after delete on public.push_subs for each row execute function public.push_subs_gone();

/*
  The review, from `since` on: only counts, never who.
  - push:  each kind of push sent (push_log), how many, and after how many the member recorded anything (food,
           weight, waist, activity) within 48 hours. Not proof the push did it: they may have logged anyway.
  - state: for each week (Saturday on), the members in each state at its end (today for this week): new (nothing
           yet), current (0 to 2 days away), lapsed (3 to 6), away (7 to 29), gone (30 or more); js/domain/lapse.js.
  - unsub: subscriptions that went, per week.
  The «چه شد؟» answers are not in it: they are the member's own (phase 7).
  Only the service role may run it (Claude through the Supabase connector): select * from public.bazgasht_report();
*/
create function public.bazgasht_report(since date default '2026-11-20')
returns table (section text, item text, n int, back int, pct int)
language sql stable security definer set search_path = '' as $$
  with recs as (
    select user_id, day, created_at from public.entries
    union all select user_id, day, created_at from public.weights
    union all select user_id, day, created_at from public.waists
    union all select user_id, day, created_at from public.activity
  ),
  pushes as (
    select l.kind, count(*)::int as n,
      count(*) filter (where exists (
        select 1 from recs r where r.user_id = l.user_id and r.created_at > l.at and r.created_at <= l.at + interval '48 hours'
      ))::int as back
    from public.push_log l
    where l.kind <> 'unsub' and l.at >= since
    group by l.kind
  ),
  weeks as (
    select g::date as ws, least(g::date + 6, (now() at time zone 'Asia/Tehran')::date) as d
    from generate_series(since - ((extract(dow from since)::int + 1) % 7), (now() at time zone 'Asia/Tehran')::date, interval '7 days') g
  ),
  gaps as (
    select w.ws, (select w.d - max(r.day) from recs r where r.user_id = m.user_id and r.day <= w.d) as gap
    from weeks w cross join public.usage_members m
  ),
  states as (
    select ws, case when gap is null then 'new' when gap < 3 then 'current' when gap < 7 then 'lapsed'
                    when gap < 30 then 'away' else 'gone' end as state, count(*)::int as n
    from gaps group by 1, 2
  ),
  unsubs as (
    select (l.at at time zone 'Asia/Tehran')::date as d, count(*)::int as n from public.push_log l
    where l.kind = 'unsub' and l.at >= since group by 1
  )
  select 'push', kind, n, back, (round(100.0 * back / nullif(n, 0)))::int from pushes
  union all
  select 'state', ws::text || ' ' || state, n, null, null from states
  union all
  select 'unsub', (d - ((extract(dow from d)::int + 1) % 7))::text, sum(n)::int, null, null from unsubs group by 2
  order by 1, 2;
$$;
revoke all on function public.bazgasht_report(date) from public, anon, authenticated;
