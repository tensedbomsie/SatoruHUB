-- Run in Supabase SQL Editor (same project shared by all Github<Name> apps)
-- "Let's build yours" lead-capture form on the public PPchanDesignConcepts portfolio.
-- Anyone can submit; only Nont (authenticated) can read/manage submissions.

create table if not exists project_requests (
  id uuid primary key default gen_random_uuid(),
  style_choice text not null,
  business_name text not null,
  industry text,
  description text not null,
  email text,
  instagram text,
  facebook text,
  line text,
  preferred_contact text not null,
  reviewed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table project_requests enable row level security;

drop policy if exists "anyone can submit project request" on project_requests;
create policy "anyone can submit project request" on project_requests
  for insert
  with check (reviewed = false);

drop policy if exists "owner can read project requests" on project_requests;
create policy "owner can read project requests" on project_requests
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "owner can update project requests" on project_requests;
create policy "owner can update project requests" on project_requests
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "owner can delete project requests" on project_requests;
create policy "owner can delete project requests" on project_requests
  for delete
  using (auth.role() = 'authenticated');
