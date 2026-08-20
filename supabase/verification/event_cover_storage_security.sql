-- Event cover images: the browser uploads straight to Storage, so these
-- policies are the authorization boundary rather than any application check.
-- Run only against Supabase local. All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '1c000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'cover-manager@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1c000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'cover-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1c000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'cover-outsider@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('2c000000-0000-0000-0000-000000000001', '封面管理者', 'cover-manager@example.test'),
  ('2c000000-0000-0000-0000-000000000002', '封面社員', 'cover-member@example.test'),
  ('2c000000-0000-0000-0000-000000000003', '外社社員', 'cover-outsider@example.test');

insert into public.app_accounts (id, auth_user_id, person_id, login_email, account_display_name, account_status) values
  ('3c000000-0000-0000-0000-000000000001', '1c000000-0000-0000-0000-000000000001', '2c000000-0000-0000-0000-000000000001', 'cover-manager@example.test', '封面管理者', 'active'),
  ('3c000000-0000-0000-0000-000000000002', '1c000000-0000-0000-0000-000000000002', '2c000000-0000-0000-0000-000000000002', 'cover-member@example.test', '封面社員', 'active'),
  ('3c000000-0000-0000-0000-000000000003', '1c000000-0000-0000-0000-000000000003', '2c000000-0000-0000-0000-000000000003', 'cover-outsider@example.test', '外社社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('5c000000-0000-4000-8000-000000000001', 'COVER-A', '封面測試甲社', 'active', now()),
  ('5c000000-0000-4000-8000-000000000002', 'COVER-B', '封面測試乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status) values
  ('6c000000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000001', '2c000000-0000-0000-0000-000000000001', 'active'),
  ('6c000000-0000-4000-8000-000000000002', '5c000000-0000-4000-8000-000000000001', '2c000000-0000-0000-0000-000000000002', 'active'),
  ('6c000000-0000-4000-8000-000000000003', '5c000000-0000-4000-8000-000000000002', '2c000000-0000-0000-0000-000000000003', 'active');

insert into public.club_role_assignments (id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id) values
  ('7c000000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000001', '3c000000-0000-0000-0000-000000000001', 'president', 'active', '3c000000-0000-0000-0000-000000000001');

insert into public.club_events (
  id, club_id, event_type, title, starts_at, ends_at, registration_deadline,
  counts_for_attendance, event_status, created_by_app_account_id, updated_by_app_account_id, published_at
) values
  ('8c000000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000001', 'regular_meeting', '封面測試例會', now() + interval '1 hour', now() + interval '3 hours', now() + interval '30 minutes', true, 'published', '3c000000-0000-0000-0000-000000000001', '3c000000-0000-0000-0000-000000000001', now());

-- The bucket must stay private: a public bucket would serve every club's
-- pictures to anyone holding a URL.
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'event-covers' and public = false) then
    raise exception 'the event-covers bucket is missing or public';
  end if;
  if not exists (
    select 1 from storage.buckets
    where id = 'event-covers'
      and file_size_limit is not null
      and allowed_mime_types is not null
  ) then
    raise exception 'the event-covers bucket has no size or mime limit';
  end if;
end $$;

-- A key that is not "<uuid>/..." must resolve to no club rather than raise,
-- otherwise a malformed upload path would error inside a policy.
do $$
begin
  if public.storage_object_club_id('not-a-uuid/whatever') is not null then
    raise exception 'a malformed object key resolved to a club';
  end if;
  if public.storage_object_club_id('') is not null then
    raise exception 'an empty object key resolved to a club';
  end if;
  if public.storage_object_club_id('5c000000-0000-4000-8000-000000000001/8c000000-0000-4000-8000-000000000001')
     <> '5c000000-0000-4000-8000-000000000001' then
    raise exception 'a well-formed object key did not resolve to its club';
  end if;
end $$;

-- An ordinary member of the club may not upload.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-0000-0000-000000000002', true);
do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('event-covers', '5c000000-0000-4000-8000-000000000001/8c000000-0000-4000-8000-000000000001', null);
    raise exception 'an ordinary member uploaded an event cover';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Another club's member may not upload into this club's folder.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-0000-0000-000000000003', true);
do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('event-covers', '5c000000-0000-4000-8000-000000000001/8c000000-0000-4000-8000-000000000001', null);
    raise exception 'a cross-club member uploaded an event cover';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- The club's event manager may upload.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-0000-0000-000000000001', true);
insert into storage.objects (bucket_id, name, owner)
values ('event-covers', '5c000000-0000-4000-8000-000000000001/8c000000-0000-4000-8000-000000000001', null);
reset role;

-- The club's members may read it; an outsider may not.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-0000-0000-000000000002', true);
do $$
begin
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'event-covers'
      and name = '5c000000-0000-4000-8000-000000000001/8c000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'a club member could not read their own club''s event cover';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-0000-0000-000000000003', true);
do $$
begin
  if exists (
    select 1 from storage.objects
    where bucket_id = 'event-covers'
      and name = '5c000000-0000-4000-8000-000000000001/8c000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'an outsider could read another club''s event cover';
  end if;
end $$;
reset role;

-- Recording the key is authorised separately and must reject a key that names
-- another club or another event.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-0000-0000-000000000002', true);
do $$
begin
  begin
    perform public.set_club_event_cover(
      '5c000000-0000-4000-8000-000000000001', '8c000000-0000-4000-8000-000000000001',
      '5c000000-0000-4000-8000-000000000001/8c000000-0000-4000-8000-000000000001');
    raise exception 'an ordinary member recorded an event cover';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-0000-0000-000000000001', true);
do $$
begin
  begin
    perform public.set_club_event_cover(
      '5c000000-0000-4000-8000-000000000001', '8c000000-0000-4000-8000-000000000001',
      '5c000000-0000-4000-8000-000000000002/8c000000-0000-4000-8000-000000000001');
    raise exception 'a key naming another club was accepted';
  exception when invalid_parameter_value then null;
  end;

  perform public.set_club_event_cover(
    '5c000000-0000-4000-8000-000000000001', '8c000000-0000-4000-8000-000000000001',
    '5c000000-0000-4000-8000-000000000001/8c000000-0000-4000-8000-000000000001');
end $$;
reset role;

-- Asserted outside the member session: `authenticated` deliberately cannot read
-- club_events directly, the application goes through RPCs.
do $$
begin
  if not exists (
    select 1 from public.club_events
    where id = '8c000000-0000-4000-8000-000000000001'
      and cover_image_path = '5c000000-0000-4000-8000-000000000001/8c000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'the manager could not record the event cover';
  end if;
end $$;

-- Clearing must always be possible, so a bad picture can be taken down.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-0000-0000-000000000001', true);
select public.set_club_event_cover(
  '5c000000-0000-4000-8000-000000000001', '8c000000-0000-4000-8000-000000000001', null);
reset role;

do $$
begin
  if exists (
    select 1 from public.club_events
    where id = '8c000000-0000-4000-8000-000000000001' and cover_image_path is not null
  ) then
    raise exception 'the manager could not clear the event cover';
  end if;
end $$;

-- The stored value is a key, never a URL: a URL would outlive its signature
-- and pin the app to one storage provider.
do $$
begin
  if exists (
    select 1 from public.club_events
    where cover_image_path is not null and cover_image_path like 'http%'
  ) then
    raise exception 'an event cover was stored as a URL';
  end if;
end $$;

rollback;
