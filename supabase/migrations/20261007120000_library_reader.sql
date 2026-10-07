-- Library reader (โซนอ่านหนังสือ) for Satoru HUB.
-- Project: kufihbkjowmxivemmpds (shared by every app in the family).
--
-- Additive only: three new tables, one new private bucket, one read policy
-- on storage.objects scoped to that bucket. The audio tables, the
-- `library-audio` bucket and its policy are not touched.
--
-- A book (library_books) can now carry readable files next to (or instead
-- of) its audio tracks. Files live in the private bucket `library-docs`; the
-- client only ever gets short-lived signed URLs, and only for objects that a
-- library_files row owned by the signed-in user points at.
--
-- This is a private shelf for files the owner is entitled to use (DRM-free
-- purchases, free releases, own work). There is no sharing path: every row
-- and object is visible to its owner only.

create table if not exists public.library_files (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  book_id uuid not null references public.library_books(id) on delete cascade,
  kind text not null check (kind in ('epub', 'pdf', 'html')),
  title text not null,
  storage_path text not null,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  -- reading-length hints computed by scripts/library/sync.ts so the shelf can
  -- show "how long is this" before the file is ever opened
  char_count integer check (char_count is null or char_count >= 0),
  page_count integer check (page_count is null or page_count >= 0),
  est_minutes integer check (est_minutes is null or est_minutes >= 0),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (owner, storage_path)
);

create index if not exists library_files_book_idx on public.library_files (book_id, position);

create table if not exists public.library_reading_progress (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  file_id uuid not null references public.library_files(id) on delete cascade,
  -- engine-specific position: EPUB {cfi}, PDF {page, offset}, HTML {fraction}
  locator jsonb not null default '{}'::jsonb,
  percent numeric(6, 3) not null default 0 check (percent >= 0 and percent <= 100),
  updated_at timestamptz not null default now(),
  unique (owner, file_id)
);

create table if not exists public.library_bookmarks (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  file_id uuid not null references public.library_files(id) on delete cascade,
  kind text not null default 'bookmark' check (kind in ('bookmark', 'highlight')),
  locator jsonb not null,
  label text,
  excerpt text,
  percent numeric(6, 3) check (percent is null or (percent >= 0 and percent <= 100)),
  created_at timestamptz not null default now()
);

create index if not exists library_bookmarks_file_idx on public.library_bookmarks (owner, file_id, created_at);

alter table public.library_files enable row level security;
alter table public.library_reading_progress enable row level security;
alter table public.library_bookmarks enable row level security;

drop policy if exists "own library files" on public.library_files;
create policy "own library files" on public.library_files
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "own library reading progress" on public.library_reading_progress;
create policy "own library reading progress" on public.library_reading_progress
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "own library bookmarks" on public.library_bookmarks;
create policy "own library bookmarks" on public.library_bookmarks
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

-- Private bucket. 50 MB per file matches the free-plan upload ceiling.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'library-docs',
  'library-docs',
  false,
  52428800,
  array['application/epub+zip', 'application/pdf', 'text/html']
)
on conflict (id) do update set public = false;

-- Read (and therefore createSignedUrl) only for objects that a file row
-- owned by the caller points at. Uploads go through the CLI sync script, so
-- no client insert/update/delete policy exists for this bucket.
drop policy if exists "library docs readable by file owner" on storage.objects;
create policy "library docs readable by file owner" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'library-docs'
    and exists (
      select 1
      from public.library_files f
      where f.storage_path = storage.objects.name
        and f.owner = auth.uid()
    )
  );
