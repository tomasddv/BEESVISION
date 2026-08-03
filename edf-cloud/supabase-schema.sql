create extension if not exists "pgcrypto";

create table if not exists public.edf_assets (
  id uuid primary key default gen_random_uuid(),
  client_code text not null,
  client_name text default '',
  asset_number text not null,
  asset_type text default 'EDF',
  model text default '',
  contract text default '',
  status text default 'PDV',
  source_file text default '',
  source_sheet text default '',
  source_row integer,
  created_at timestamptz not null default now()
);

create table if not exists public.edf_surveys (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_name text default '',
  client_code text not null,
  client_name text default '',
  location_text text default '',
  note text default ''
);

create table if not exists public.edf_survey_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  survey_id uuid not null references public.edf_surveys(id) on delete cascade,
  asset_id uuid references public.edf_assets(id) on delete set null,
  client_code text not null,
  system_number text default '',
  found_number text default '',
  status text not null,
  comment text default ''
);

create index if not exists idx_edf_assets_client on public.edf_assets(client_code);
create index if not exists idx_edf_assets_number on public.edf_assets(asset_number);
create index if not exists idx_edf_surveys_client_created on public.edf_surveys(client_code, created_at desc);
create index if not exists idx_edf_items_survey on public.edf_survey_items(survey_id);

alter table public.edf_assets enable row level security;
alter table public.edf_surveys enable row level security;
alter table public.edf_survey_items enable row level security;

drop policy if exists "edf assets read" on public.edf_assets;
drop policy if exists "edf assets insert" on public.edf_assets;
drop policy if exists "edf assets delete" on public.edf_assets;
drop policy if exists "edf surveys read" on public.edf_surveys;
drop policy if exists "edf surveys insert" on public.edf_surveys;
drop policy if exists "edf items read" on public.edf_survey_items;
drop policy if exists "edf items insert" on public.edf_survey_items;

create policy "edf assets read" on public.edf_assets for select to anon using (true);
create policy "edf assets insert" on public.edf_assets for insert to anon with check (true);
create policy "edf assets delete" on public.edf_assets for delete to anon using (true);
create policy "edf surveys read" on public.edf_surveys for select to anon using (true);
create policy "edf surveys insert" on public.edf_surveys for insert to anon with check (true);
create policy "edf items read" on public.edf_survey_items for select to anon using (true);
create policy "edf items insert" on public.edf_survey_items for insert to anon with check (true);
