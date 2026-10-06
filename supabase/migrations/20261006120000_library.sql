-- Library (ห้องสมุดเสียง) for Satoru HUB.
-- Project: kufihbkjowmxivemmpds (shared by every app in the family).
--
-- Additive only: four new tables, one new private bucket, one read policy
-- on storage.objects scoped to that bucket. Nothing existing is touched.
--
-- Shape: shelf -> book -> track, plus per-owner listening progress.
-- Audio lives in the private bucket `library-audio`; the client only ever
-- gets short-lived signed URLs, and only for objects referenced by a track
-- row the signed-in owner owns.

create table if not exists public.library_shelves (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slug text not null,
  title text not null,
  description text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (owner, slug)
);

create table if not exists public.library_books (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  shelf_id uuid not null references public.library_shelves(id) on delete cascade,
  slug text not null,
  title text not null,
  subtitle text,
  author text,
  cover_label text,
  cloth text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (owner, slug)
);

create index if not exists library_books_shelf_idx on public.library_books (shelf_id, position);

create table if not exists public.library_tracks (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  book_id uuid not null references public.library_books(id) on delete cascade,
  title text not null,
  subtitle text,
  position integer not null default 0,
  audio_path text not null,
  duration_seconds numeric(10, 2),
  created_at timestamptz not null default now(),
  unique (owner, audio_path)
);

create index if not exists library_tracks_book_idx on public.library_tracks (book_id, position);

create table if not exists public.library_progress (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  track_id uuid not null references public.library_tracks(id) on delete cascade,
  position_seconds numeric(10, 2) not null default 0 check (position_seconds >= 0),
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (owner, track_id)
);

alter table public.library_shelves enable row level security;
alter table public.library_books enable row level security;
alter table public.library_tracks enable row level security;
alter table public.library_progress enable row level security;

drop policy if exists "own library shelves" on public.library_shelves;
create policy "own library shelves" on public.library_shelves
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "own library books" on public.library_books;
create policy "own library books" on public.library_books
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "own library tracks" on public.library_tracks;
create policy "own library tracks" on public.library_tracks
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "own library progress" on public.library_progress;
create policy "own library progress" on public.library_progress
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

-- Private bucket. 50 MB per file matches the free-plan upload ceiling.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'library-audio',
  'library-audio',
  false,
  52428800,
  array['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/x-m4a']
)
on conflict (id) do update set public = false;

-- Read (and therefore createSignedUrl) only for objects that a track row
-- owned by the caller points at. Uploads go through the CLI sync script, so
-- no client insert/update/delete policy exists for this bucket.
drop policy if exists "library audio readable by track owner" on storage.objects;
create policy "library audio readable by track owner" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'library-audio'
    and exists (
      select 1
      from public.library_tracks t
      where t.audio_path = storage.objects.name
        and t.owner = auth.uid()
    )
  );
