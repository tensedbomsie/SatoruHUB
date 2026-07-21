-- Run in Supabase SQL Editor (same project shared by all Github<Name> apps)
-- Public testimonials for the ?portfolio=1 page — anyone can submit, only Nont approves before it shows publicly.

create table if not exists testimonials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  message text not null,
  rating int check (rating between 1 and 5),
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

alter table testimonials enable row level security;

drop policy if exists "anyone can submit testimonial" on testimonials;
create policy "anyone can submit testimonial" on testimonials
  for insert
  with check (approved = false);

drop policy if exists "anyone can read approved testimonials" on testimonials;
create policy "anyone can read approved testimonials" on testimonials
  for select
  using (approved = true);

drop policy if exists "owner can read all testimonials" on testimonials;
create policy "owner can read all testimonials" on testimonials
  for select
  using (auth.role() = 'authenticated');

drop policy if exists "owner can update testimonials" on testimonials;
create policy "owner can update testimonials" on testimonials
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "owner can delete testimonials" on testimonials;
create policy "owner can delete testimonials" on testimonials
  for delete
  using (auth.role() = 'authenticated');
