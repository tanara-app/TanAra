-- «خانواده» on «پیشرفت»: each member's weekly habit score (js/domain/family.js).
-- Only these counts leave the device: days logged, minutes of activity and its goal, occasions
-- eaten as planned, and the score. No weight, calories, foods or conditions.
-- Each person writes and deletes only their own rows; everyone reads everyone's rows through
-- family_board(), which adds the member's name from usage_members (never their email).

create table public.family_week (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week date not null,
  log_days smallint not null default 0 check (log_days between 0 and 7),
  move_min integer not null default 0 check (move_min between 0 and 10080),
  move_goal integer not null default 0 check (move_goal between 0 and 10080),
  plan_done smallint not null default 0 check (plan_done >= 0),
  plan_of smallint not null default 0 check (plan_of >= 0),
  score smallint not null default 0 check (score between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, week)
);
alter table public.family_week enable row level security;

create policy "own rows: read" on public.family_week for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows: add" on public.family_week for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows: change" on public.family_week for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows: delete" on public.family_week for delete to authenticated using (user_id = (select auth.uid()));

-- Every member's rows from a week on, with their name and whether it is the caller.
create function public.family_board(since date) returns table (
  user_id uuid, name text, me boolean, week date, log_days smallint, move_min integer,
  move_goal integer, plan_done smallint, plan_of smallint, score smallint
)
language sql stable security definer set search_path = '' as $$
  select f.user_id, coalesce(m.name, 'عضو تازه'), f.user_id = (select auth.uid()), f.week,
         f.log_days, f.move_min, f.move_goal, f.plan_done, f.plan_of, f.score
  from public.family_week f
  left join public.usage_members m on m.user_id = f.user_id
  where f.week >= since and (select auth.uid()) is not null
  order by f.week, f.score desc
  limit 500;
$$;

revoke all on function public.family_board(date) from public, anon;
grant execute on function public.family_board(date) to authenticated;
