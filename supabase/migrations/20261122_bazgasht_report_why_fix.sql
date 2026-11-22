-- From the automatic security review of 20261122_bazgasht_report_why.sql (2026-11-22): the «چه شد؟» counts now hold back
-- each reason on its own until at least 2 different members picked it (the earlier gate was for all answers together,
-- so a reason only one member picked could show); members are counted, not answers, so no one can swell a number; and only
-- the six known reasons are named, anything else is 'other'. 'members' is how many members answered at all.
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
    select distinct a.user_id,
      case when a.data->>'reason' in ('time', 'hard', 'results', 'mood', 'forgot', 'notnow') then a.data->>'reason' else 'other' end as reason
    from public.ai_notes a
    where a.kind = 'why' and a.created_at >= since
  )
  select 'push', kind, n, back, (round(100.0 * back / nullif(n, 0)))::int from pushes
  union all
  select 'state', ws::text || ' ' || state, n, null, null from states
  union all
  select 'unsub', (d - ((extract(dow from d)::int + 1) % 7))::text, sum(n)::int, null, null from unsubs group by 2
  union all
  select 'why', 'members', (select count(distinct user_id) from whys)::int, null, null
  union all
  select 'why', reason, count(distinct user_id)::int, null, null from whys group by reason having count(distinct user_id) >= 2
  order by 1, 2;
$$;
revoke all on function public.bazgasht_report(date) from public, anon, authenticated;
