create extension if not exists "pgcrypto";

create table if not exists public.nps_cases (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_code text not null,
  client_name text default '',
  promoter text default '',
  zone text default '',
  nps_score text default '',
  reason text default '',
  segment text default '',
  status text default 'Pendiente'
);

create table if not exists public.nps_actions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  case_id uuid references public.nps_cases(id) on delete set null,
  user_name text default '',
  client_code text not null,
  client_name text default '',
  promoter text default '',
  root_cause text default '',
  action_plan text default '',
  owner_name text default '',
  due_date date,
  status text default 'Pendiente',
  comment text default ''
);

create index if not exists idx_nps_cases_client on public.nps_cases(client_code);
create index if not exists idx_nps_actions_client_created on public.nps_actions(client_code, created_at desc);
create index if not exists idx_nps_actions_status on public.nps_actions(status);

alter table public.nps_cases enable row level security;
alter table public.nps_actions enable row level security;

drop policy if exists "nps cases read" on public.nps_cases;
drop policy if exists "nps cases insert" on public.nps_cases;
drop policy if exists "nps cases delete" on public.nps_cases;
drop policy if exists "nps actions read" on public.nps_actions;
drop policy if exists "nps actions insert" on public.nps_actions;

create policy "nps cases read" on public.nps_cases for select to anon using (true);
create policy "nps cases insert" on public.nps_cases for insert to anon with check (true);
create policy "nps cases delete" on public.nps_cases for delete to anon using (true);
create policy "nps actions read" on public.nps_actions for select to anon using (true);
create policy "nps actions insert" on public.nps_actions for insert to anon with check (true);
