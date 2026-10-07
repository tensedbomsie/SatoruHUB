-- RLS check for the Library reader tables and the library-docs bucket.
-- Everything runs inside one transaction and is rolled back: nothing stays.
-- Expected: owner sees 1 file / progress / bookmark / object and 0 orphan
-- objects (no file row points at them); another user and anon see 0.
--   npx supabase db query --linked -f scripts/library/checks/reader-rls.sql
begin;
-- temporary fixture, rolled back at the end
create temp table _owner as select id from auth.users where email = 'blackmotion1245@gmail.com';
insert into public.library_shelves (owner, slug, title, position)
  select id, 'rls-check-shelf', 'rls check', 999 from _owner;
insert into public.library_books (owner, shelf_id, slug, title, position)
  select o.id, s.id, 'rls-check-book', 'rls check', 1 from _owner o join public.library_shelves s on s.owner = o.id and s.slug = 'rls-check-shelf';
insert into public.library_files (owner, book_id, kind, title, storage_path, position)
  select o.id, b.id, 'pdf', 'rls check', 'rls-check/test.pdf', 1 from _owner o join public.library_books b on b.owner = o.id and b.slug = 'rls-check-book';
insert into public.library_reading_progress (owner, file_id, locator, percent)
  select owner, id, '{"page":2}', 12.5 from public.library_files where storage_path = 'rls-check/test.pdf';
insert into public.library_bookmarks (owner, file_id, locator, label)
  select owner, id, '{"page":2}', 'rls' from public.library_files where storage_path = 'rls-check/test.pdf';
insert into storage.objects (bucket_id, name, owner_id) values ('library-docs', 'rls-check/test.pdf', null);
insert into storage.objects (bucket_id, name, owner_id) values ('library-docs', 'rls-check/orphan.pdf', null);

create temp table _result (who text, files int, progress int, bookmarks int, objects int, orphan int);
grant all on _result to anon, authenticated;

-- signed-in owner
select set_config('request.jwt.claims', json_build_object('sub', (select id from _owner)::text, 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _result select 'owner',
  (select count(*) from public.library_files where storage_path like 'rls-check/%'),
  (select count(*) from public.library_reading_progress),
  (select count(*) from public.library_bookmarks),
  (select count(*) from storage.objects where bucket_id = 'library-docs' and name = 'rls-check/test.pdf'),
  (select count(*) from storage.objects where bucket_id = 'library-docs' and name = 'rls-check/orphan.pdf');
reset role;

-- another signed-in user (random uuid)
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true);
set local role authenticated;
insert into _result select 'other user',
  (select count(*) from public.library_files),
  (select count(*) from public.library_reading_progress),
  (select count(*) from public.library_bookmarks),
  (select count(*) from storage.objects where bucket_id = 'library-docs'),
  0;
reset role;

-- not signed in
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
set local role anon;
insert into _result select 'anon',
  (select count(*) from public.library_files),
  (select count(*) from public.library_reading_progress),
  (select count(*) from public.library_bookmarks),
  (select count(*) from storage.objects where bucket_id = 'library-docs'),
  0;
reset role;

select * from _result;
rollback;
