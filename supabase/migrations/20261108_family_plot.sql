-- The family land (js/ui/family.js): which plot each member chose. One plot per member and one
-- member per plot; the first to pick a plot keeps it. Everyone reads everyone's choice through
-- family_plots(), with the member's name from usage_members (never their email).

create table public.family_plot (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  plot text not null unique check (plot in ('garden', 'farm', 'forest', 'lake')),
  chosen_at timestamptz not null default now()
);
alter table public.family_plot enable row level security;

create policy "own plot: read" on public.family_plot for select to authenticated using (user_id = (select auth.uid()));
create policy "own plot: choose" on public.family_plot for insert to authenticated with check (user_id = (select auth.uid()));

create function public.family_plots() returns table (user_id uuid, name text, me boolean, plot text)
language sql stable security definer set search_path = '' as $$
  select p.user_id, coalesce(m.name, 'عضو تازه'), p.user_id = (select auth.uid()), p.plot
  from public.family_plot p
  left join public.usage_members m on m.user_id = p.user_id
  where (select auth.uid()) is not null;
$$;

revoke all on function public.family_plots() from public, anon;
grant execute on function public.family_plots() to authenticated;
