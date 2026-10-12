-- Run once in the new Supabase project (SQL Editor)

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  project_name text,
  client_name text,
  reported_by text,
  report_date date,
  location text,
  weather text,
  observations text,
  report_number text,
  disclaimer text,
  photos jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

alter table public.reports enable row level security;

create policy "own reports" on public.reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
