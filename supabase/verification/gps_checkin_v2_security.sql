-- GPS check-in V2: geofence correctness, tenant isolation, and the privacy
-- boundary that no member coordinate is ever persisted.
-- Run only against Supabase local. All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '19000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'gps-manager@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '19000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'gps-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '19000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'gps-outsider@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '19000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'gps-suspended@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('29000000-0000-0000-0000-000000000001', 'GPS 管理者', 'gps-manager@example.test'),
  ('29000000-0000-0000-0000-000000000002', 'GPS 社員', 'gps-member@example.test'),
  ('29000000-0000-0000-0000-000000000003', 'GPS 外社社員', 'gps-outsider@example.test'),
  ('29000000-0000-0000-0000-000000000004', 'GPS 停權社員', 'gps-suspended@example.test');

insert into public.app_accounts (id, auth_user_id, person_id, login_email, account_display_name, account_status) values
  ('39000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', 'gps-manager@example.test', 'GPS 管理者', 'active'),
  ('39000000-0000-0000-0000-000000000002', '19000000-0000-0000-0000-000000000002', '29000000-0000-0000-0000-000000000002', 'gps-member@example.test', 'GPS 社員', 'active'),
  ('39000000-0000-0000-0000-000000000003', '19000000-0000-0000-0000-000000000003', '29000000-0000-0000-0000-000000000003', 'gps-outsider@example.test', 'GPS 外社社員', 'active'),
  ('39000000-0000-0000-0000-000000000004', '19000000-0000-0000-0000-000000000004', '29000000-0000-0000-0000-000000000004', 'gps-suspended@example.test', 'GPS 停權社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('59000000-0000-4000-8000-000000000001', 'GPS-A', 'GPS 測試甲社', 'active', now()),
  ('59000000-0000-4000-8000-000000000002', 'GPS-B', 'GPS 測試乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status) values
  ('69000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000001', '29000000-0000-0000-0000-000000000001', 'active'),
  ('69000000-0000-4000-8000-000000000002', '59000000-0000-4000-8000-000000000001', '29000000-0000-0000-0000-000000000002', 'active'),
  ('69000000-0000-4000-8000-000000000003', '59000000-0000-4000-8000-000000000002', '29000000-0000-0000-0000-000000000003', 'active'),
  ('69000000-0000-4000-8000-000000000004', '59000000-0000-4000-8000-000000000001', '29000000-0000-0000-0000-000000000004', 'suspended');

insert into public.club_role_assignments (id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id) values
  ('79000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000001', '39000000-0000-0000-0000-000000000001', 'president', 'active', '39000000-0000-0000-0000-000000000001');

-- Venue is Taipei 101. 0.0009 degrees of latitude is roughly 100m (inside the
-- 200m radius); 0.005 degrees is roughly 555m (outside it).
insert into public.club_events (
  id, club_id, event_type, title, starts_at, ends_at, registration_deadline,
  counts_for_attendance, event_status, venue_latitude, venue_longitude,
  created_by_app_account_id, updated_by_app_account_id, published_at
) values
  ('89000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000001', 'regular_meeting', 'GPS 有座標活動', now() + interval '1 hour', now() + interval '3 hours', now() + interval '30 minutes', true, 'published', 25.033964, 121.564468, '39000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000001', now()),
  ('89000000-0000-4000-8000-000000000002', '59000000-0000-4000-8000-000000000001', 'regular_meeting', 'GPS 無座標活動', now() + interval '1 hour', now() + interval '3 hours', now() + interval '30 minutes', true, 'published', null, null, '39000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000001', now()),
  ('89000000-0000-4000-8000-000000000003', '59000000-0000-4000-8000-000000000002', 'regular_meeting', 'GPS 外社活動', now() + interval '1 hour', now() + interval '3 hours', now() + interval '30 minutes', true, 'published', 25.033964, 121.564468, '39000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000001', now());

-- Distance helper must be a real great-circle metric, not a placeholder.
do $$
begin
  if public.event_checkin_gps_radius_meters() <> 200 then
    raise exception 'gps radius policy drifted from 200 meters';
  end if;
  if public.event_checkin_distance_meters(25.033964, 121.564468, 25.033964, 121.564468) <> 0 then
    raise exception 'identical coordinates did not measure zero distance';
  end if;
  if public.event_checkin_distance_meters(25.033964, 121.564468, 25.034864, 121.564468) not between 90 and 110 then
    raise exception 'great-circle distance is inaccurate at ~100m';
  end if;
  if public.event_checkin_distance_meters(25.033964, 121.564468, 25.038964, 121.564468) not between 500 and 610 then
    raise exception 'great-circle distance is inaccurate at ~555m';
  end if;
end $$;

-- A half-configured venue can never be stored.
do $$
begin
  begin
    insert into public.club_events (
      club_id, event_type, title, starts_at, ends_at, registration_deadline,
      counts_for_attendance, event_status, venue_latitude, venue_longitude,
      created_by_app_account_id, updated_by_app_account_id
    ) values (
      '59000000-0000-4000-8000-000000000001', 'regular_meeting', 'GPS 半套座標', now() + interval '1 hour',
      now() + interval '3 hours', now() + interval '30 minutes', true, 'draft', 25.033964, null,
      '39000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000001'
    );
    raise exception 'a latitude without a longitude was accepted';
  exception when check_violation then null;
  end;
end $$;

-- No session open yet: even a member standing at the venue cannot check in.
set local role authenticated;
select set_config('request.jwt.claim.sub', '19000000-0000-0000-0000-000000000002', true);
do $$
begin
  begin
    perform public.check_in_to_event_by_location(
      '59000000-0000-4000-8000-000000000001', '89000000-0000-4000-8000-000000000001', 25.034864, 121.564468);
    raise exception 'gps check-in succeeded without an active session';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '19000000-0000-0000-0000-000000000001', true);
select public.open_dynamic_event_checkin('59000000-0000-4000-8000-000000000001', '89000000-0000-4000-8000-000000000001');
reset role;

-- Geofence, tenancy, membership and input gates.
set local role authenticated;
select set_config('request.jwt.claim.sub', '19000000-0000-0000-0000-000000000002', true);
do $$
begin
  begin
    perform public.check_in_to_event_by_location(
      '59000000-0000-4000-8000-000000000001', '89000000-0000-4000-8000-000000000001', 25.038964, 121.564468);
    raise exception 'gps check-in succeeded from outside the radius';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.check_in_to_event_by_location(
      '59000000-0000-4000-8000-000000000001', '89000000-0000-4000-8000-000000000002', 25.034864, 121.564468);
    raise exception 'gps check-in succeeded for an event with no venue';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.check_in_to_event_by_location(
      '59000000-0000-4000-8000-000000000001', '89000000-0000-4000-8000-000000000001', 91, 121.564468);
    raise exception 'an out-of-domain latitude was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.check_in_to_event_by_location(
      '59000000-0000-4000-8000-000000000001', '89000000-0000-4000-8000-000000000001', null, null);
    raise exception 'a null coordinate was accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;

-- Another club's member cannot use this club's venue.
set local role authenticated;
select set_config('request.jwt.claim.sub', '19000000-0000-0000-0000-000000000003', true);
do $$
begin
  begin
    perform public.check_in_to_event_by_location(
      '59000000-0000-4000-8000-000000000001', '89000000-0000-4000-8000-000000000001', 25.034864, 121.564468);
    raise exception 'cross-club member completed a gps check-in';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- A suspended membership cannot check in even from the venue.
set local role authenticated;
select set_config('request.jwt.claim.sub', '19000000-0000-0000-0000-000000000004', true);
do $$
begin
  begin
    perform public.check_in_to_event_by_location(
      '59000000-0000-4000-8000-000000000001', '89000000-0000-4000-8000-000000000001', 25.034864, 121.564468);
    raise exception 'suspended membership completed a gps check-in';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Happy path plus idempotency.
set local role authenticated;
select set_config('request.jwt.claim.sub', '19000000-0000-0000-0000-000000000002', true);
do $$
declare first_result jsonb; second_result jsonb;
begin
  first_result := public.check_in_to_event_by_location(
    '59000000-0000-4000-8000-000000000001', '89000000-0000-4000-8000-000000000001', 25.034864, 121.564468);
  if coalesce((first_result->>'idempotent')::boolean, true) then
    raise exception 'first gps check-in was not recorded as new';
  end if;
  second_result := public.check_in_to_event_by_location(
    '59000000-0000-4000-8000-000000000001', '89000000-0000-4000-8000-000000000001', 25.034864, 121.564468);
  if not coalesce((second_result->>'idempotent')::boolean, false) then
    raise exception 'repeated gps check-in created a duplicate attendance';
  end if;
  if first_result->>'attendance_id' is distinct from second_result->>'attendance_id' then
    raise exception 'repeated gps check-in returned a different attendance';
  end if;
end $$;
reset role;

-- Canonical attendance shape, and the privacy boundary.
do $$
begin
  if not exists (
    select 1 from public.event_attendances
    where event_id = '89000000-0000-4000-8000-000000000001'
      and membership_id = '69000000-0000-4000-8000-000000000002'
      and checkin_method = 'gps'
      and attendance_status = 'active'
      and checkin_session_id is not null
  ) then
    raise exception 'gps attendance was not written to the canonical table';
  end if;
  if (select count(*) from public.event_attendances where event_id = '89000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'gps check-in produced more than one attendance row';
  end if;

  -- The member reported 25.034864 / 121.564468. Neither that position nor a
  -- derived distance may survive anywhere the platform can read back.
  if exists (
    select 1 from public.event_attendances
    where event_id = '89000000-0000-4000-8000-000000000001'
      and (checkin_note like '%25.0348%' or checkin_note like '%121.5644%')
  ) then
    raise exception 'member coordinates were stored on the attendance row';
  end if;
  if exists (
    select 1 from public.audit_logs
    where metadata::text like '%25.0348%' or metadata::text like '%121.5644%'
  ) then
    raise exception 'member coordinates reached audit metadata';
  end if;
  if exists (
    select 1 from public.audit_logs
    where subject_type = 'event_attendance'
      and (metadata ? 'distance_meters' or metadata ? 'latitude' or metadata ? 'longitude'
           or metadata ? 'accuracy_meters' or metadata ? 'coordinates')
  ) then
    raise exception 'a member-derived location measurement reached audit metadata';
  end if;
end $$;

-- The venue column exists for events only; no table may hold a member position.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_attendances'
      and column_name in ('latitude', 'longitude', 'venue_latitude', 'venue_longitude', 'distance_meters', 'accuracy_meters')
  ) then
    raise exception 'event_attendances gained a column able to hold a member position';
  end if;
end $$;

rollback;
