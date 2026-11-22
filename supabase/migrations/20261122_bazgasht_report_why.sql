-- BAZGASHT.md, phase 7 and 10 (2026-11-22, the owner: «موارد باقیمانده رو هم انجام بده», after being offered the reasons as
-- counts with no names): the review also gives how often each «چه شد؟» reason was picked. Only counts, and only once there are
-- at least 3 answers from at least 2 members, so one member's answer cannot be told apart; before that only how many there are.
create or replace function public.bazgasht_report(since date default '2026-11-20')
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
  ),
  whys as (
    select a.user_id, a.data->>'reason' as reason from public.ai_notes a
    where a.kind = 'why' and a.created_at >= since
  ),
  enough as (select count(*) >= 3 and count(distinct user_id) >= 2 as ok, count(*)::int as n from whys)
  select 'push', kind, n, back, (round(100.0 * back / nullif(n, 0)))::int from pushes
  union all
  select 'state', ws::text || ' ' || state, n, null, null from states
  union all
  select 'unsub', (d - ((extract(dow from d)::int + 1) % 7))::text, sum(n)::int, null, null from unsubs group by 2
  union all
  select 'why', 'answers', n, null, null from enough
  union all
  select 'why', w.reason, count(*)::int, null, null from whys w, enough e where e.ok group by w.reason
  order by 1, 2;
$$;
revoke all on function public.bazgasht_report(date) from public, anon, authenticated;
