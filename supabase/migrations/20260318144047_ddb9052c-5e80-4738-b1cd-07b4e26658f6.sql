create table public.focus_alignment_snapshots (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  member_id uuid not null references team_members(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  breakdown jsonb not null default '{}'::jsonb,
  total_activities int not null default 0,
  created_at timestamptz default now(),
  unique(team_id, member_id, period_start, period_end)
);

alter table public.focus_alignment_snapshots enable row level security;

create policy "Team members can read focus snapshots"
  on public.focus_alignment_snapshots for select to authenticated
  using (is_team_member(auth.uid(), team_id));
