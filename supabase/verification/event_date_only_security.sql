-- Date-only events stay tenant-scoped, feature-gated, and ineligible for
-- self-service QR/GPS check-in. Manual officer attendance remains available.
-- Run only against Supabase local. All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'a7100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'date-only-admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a7100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'date-only-manager@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a7100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'date-only-member@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('a8100000-0000-4000-8000-000000000001', '日期活動平台管理員', 'date-only-admin@example.test'),
  ('a8100000-0000-4000-8000-000000000002', '日期活動社務幹部', 'date-only-manager@example.test'),
  ('a8100000-0000-4000-8000-000000000003', '日期活動社員', 'date-only-member@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('a9100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000001', 'date-only-admin@example.test', '日期活動平台管理員', 'active'),
  ('a9100000-0000-4000-8000-000000000002', 'a7100000-0000-4000-8000-000000000002', 'a8100000-0000-4000-8000-000000000002', 'date-only-manager@example.test', '日期活動社務幹部', 'active'),
  ('a9100000-0000-4000-8000-000000000003', 'a7100000-0000-4000-8000-000000000003', 'a8100000-0000-4000-8000-000000000003', 'date-only-member@example.test', '日期活動社員', 'active');

insert into public.platform_roles (app_account_id, role_key)
values ('a9100000-0000-4000-8000-000000000001', 'platform_admin');

insert into public.clubs (id, club_code, club_name, club_status, activated_at)
values
  ('aa100000-0000-4000-8000-000000000001', 'DATE-ONLY', '日期活動測試社', 'active', now()),
  ('aa100000-0000-4000-8000-000000000002', 'DATE-OTHER', '日期活動外社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status, joined_on) values
  ('ab100000-0000-4000-8000-000000000001', 'aa100000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000002', 'active', current_date - 365),
  ('ab100000-0000-4000-8000-000000000002', 'aa100000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000003', 'active', current_date - 365);

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values (
  'ac100000-0000-4000-8000-000000000001', 'aa100000-0000-4000-8000-000000000001',
  'a9100000-0000-4000-8000-000000000002', 'president', 'active', 'a9100000-0000-4000-8000-000000000001'
);

do $$
begin
  if has_function_privilege('authenticated', 'public.create_club_event_with_time_mode(uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,boolean,numeric,numeric,boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.update_club_event_with_time_mode(uuid,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,boolean,numeric,numeric,integer,boolean)', 'EXECUTE') then
    raise exception 'date-only mutation RPCs must be unavailable until the flag is explicitly enabled';
  end if;
end $$;

-- Explicit enablement restores only the date-only mutation RPCs.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7100000-0000-4000-8000-000000000001', true);
select * from public.set_platform_feature_flag(
  'event_date_only_v1', true, array['local']::text[], 100
);
reset role;

do $$
declare
  created jsonb;
  created_event_id uuid;
  past_created jsonb;
  past_event_id uuid;
  day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Taipei') at time zone 'Asia/Taipei';
  day_end timestamptz := (date_trunc('day', now() at time zone 'Asia/Taipei') + interval '1 day') at time zone 'Asia/Taipei';
begin
  if not has_function_privilege('authenticated', 'public.create_club_event_with_time_mode(uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,boolean,numeric,numeric,boolean)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.update_club_event_with_time_mode(uuid,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,boolean,numeric,numeric,integer,boolean)', 'EXECUTE') then
    raise exception 'enabling the date-only flag did not grant its mutation RPCs';
  end if;

  created := public.create_club_event_with_time_mode(
    'aa100000-0000-4000-8000-000000000001', 'regular_meeting', '時間未定測試例會',
    '資料庫驗證', '本機測試會館', day_start, day_end, null, null, true,
    25.033964, 121.564468, true
  );
  created_event_id := (created->>'event_id')::uuid;
  perform public.publish_club_event('aa100000-0000-4000-8000-000000000001', created_event_id);
  perform set_config('date_only.event_id', created_event_id::text, true);

  begin
    update public.club_events
    set starts_at = day_start + interval '1 hour'
    where id = created_event_id;
    raise exception 'date-only boundary constraint accepted an invented start time';
  exception when check_violation then null;
  end;

  -- Publish a future fixture, then move it to yesterday as the test owner to
  -- model elapsed time. The normal RPC must still reject publishing an event
  -- whose date has ended; this fixture exercises settlement, not that bypass.
  past_created := public.create_club_event_with_time_mode(
    'aa100000-0000-4000-8000-000000000001', 'regular_meeting', '昨日時間未定測試例會',
    '資料庫驗證', '本機測試會館', day_start + interval '1 day', day_end + interval '1 day', null, null, true,
    25.033964, 121.564468, true
  );
  past_event_id := (past_created->>'event_id')::uuid;
  perform public.publish_club_event('aa100000-0000-4000-8000-000000000001', past_event_id);
  update public.club_events
  set starts_at = day_start - interval '1 day', ends_at = day_start
  where id = past_event_id;
  perform set_config('date_only.past_event_id', past_event_id::text, true);

  if not public.event_registration_is_open(null, day_start, day_end) then
    raise exception 'date-only registration did not stay open through the selected day';
  end if;

  begin
    perform public.create_club_event_with_time_mode(
      'aa100000-0000-4000-8000-000000000001', 'service', '錯誤日期模式',
      '', '', day_start + interval '1 hour', day_end, null, null, false, null, null, true
    );
    raise exception 'date-only RPC accepted clock times instead of one full Taipei day';
  exception when sqlstate '22023' then null;
  end;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7100000-0000-4000-8000-000000000003', true);
do $$
declare
  event_id uuid := current_setting('date_only.event_id')::uuid;
  listed jsonb;
  location_events jsonb;
  event_date date := (now() at time zone 'Asia/Taipei')::date;
  summary jsonb;
  history jsonb;
  detail jsonb;
begin
  begin
    perform public.create_club_event_with_time_mode(
      'aa100000-0000-4000-8000-000000000001', 'service', '社員越權建立',
      '', '', now(), now() + interval '1 day', null, null, false, null, null, true
    );
    raise exception 'ordinary member created an event';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.update_club_event_with_time_mode(
      'aa100000-0000-4000-8000-000000000001', event_id, 'service', '社員越權修改',
      '', '', now(), now() + interval '1 day', null, null, false, null, null, null, true
    );
    raise exception 'ordinary member updated an event';
  exception when insufficient_privilege then null;
  end;

  listed := public.list_club_events('aa100000-0000-4000-8000-000000000001', false);
  if not exists (
    select 1 from jsonb_array_elements(listed->'events') as item
    where item->>'id' = event_id::text and item->>'time_unspecified' = 'true'
      and item->>'registration_open' = 'true'
  ) then
    raise exception 'member event projection omitted date-only state or open registration';
  end if;
  detail := public.get_my_club_event(event_id, true);
  if detail->>'happening_now' is distinct from 'false'
     or detail->'event'->>'time_unspecified' is distinct from 'true' then
    raise exception 'date-only detail incorrectly invited self-service check-in';
  end if;

  perform public.set_my_event_registration(
    'aa100000-0000-4000-8000-000000000001', event_id, 'attending', 0, ''
  );

  summary := public.get_my_attendance_summary(
    'aa100000-0000-4000-8000-000000000001', event_date, event_date
  );
  if (summary->>'denominator')::integer is distinct from 0
     or (summary->>'absent')::integer is distinct from 0
     or (summary->>'unconfirmed_records')::integer is distinct from 0 then
    raise exception 'date-only meeting created an absence before the local event date ended: %', summary;
  end if;
  history := public.list_my_attendance_history(
    'aa100000-0000-4000-8000-000000000001', event_date, event_date
  );
  if exists (
    select 1 from jsonb_array_elements(history->'records') as item
    where item->>'event_title' = '時間未定測試例會'
  ) then
    raise exception 'member history included the current date-only event before settlement';
  end if;
  history := public.list_my_attendance_history(
    'aa100000-0000-4000-8000-000000000001', event_date - 1, event_date - 1
  );
  if not exists (
    select 1 from jsonb_array_elements(history->'records') as item
    where item->>'event_title' = '昨日時間未定測試例會'
      and item->>'final_status' = 'absent'
      and item->>'in_denominator' = 'true'
  ) then
    raise exception 'member history omitted settlement after the date-only event ended';
  end if;

  location_events := public.list_my_location_checkin_events();
  if exists (
    select 1 from jsonb_array_elements(location_events->'events') as item
    where item->>'event_id' = event_id::text
  ) then
    raise exception 'date-only event appeared in the GPS self-check-in list';
  end if;
  begin
    perform public.check_in_to_event_by_location(
      'aa100000-0000-4000-8000-000000000001', event_id, 25.033964, 121.564468
    );
    raise exception 'direct GPS RPC accepted a date-only event';
  exception when sqlstate '22023' then null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7100000-0000-4000-8000-000000000002', true);
do $$
declare
  event_id uuid := current_setting('date_only.event_id')::uuid;
  opened_session jsonb;
  manual_attendance jsonb;
  roster jsonb;
  club_summary jsonb;
  my_summary jsonb;
  event_date date := (now() at time zone 'Asia/Taipei')::date;
begin
  begin
    opened_session := public.open_event_checkin(
      'aa100000-0000-4000-8000-000000000001', event_id, 30
    );
    raise exception 'QR session opened for a date-only event';
  exception when sqlstate '22023' then null;
  end;

  manual_attendance := public.manual_check_in_event(
    'aa100000-0000-4000-8000-000000000001', event_id,
    'ab100000-0000-4000-8000-000000000002', '時間未定活動人工簽到驗證'
  );
  if manual_attendance->>'event_id' is distinct from event_id::text then
    raise exception 'officer manual attendance did not remain available';
  end if;

  roster := public.get_event_attendance_roster(
    'aa100000-0000-4000-8000-000000000001', event_id
  );
  if roster->'event'->>'time_unspecified' is distinct from 'true'
     or not exists (
       select 1 from jsonb_array_elements(roster->'members') as item
       where item->>'membership_id' = 'ab100000-0000-4000-8000-000000000001'
         and item->>'final_status' = 'pending'
     ) then
    raise exception 'current date-only roster did not show the date-only event and pending members';
  end if;

  club_summary := public.get_club_attendance_summary(
    'aa100000-0000-4000-8000-000000000001', event_date - 1, event_date
  );
  if (club_summary->>'denominator')::integer is distinct from 2
     or (club_summary->>'unconfirmed_records')::integer is distinct from 2
     or (club_summary->>'pending_absences')::integer is distinct from 0 then
    raise exception 'attendance was not settled after the local event date ended: %', club_summary;
  end if;

  my_summary := public.get_my_attendance_summary(
    'aa100000-0000-4000-8000-000000000001', event_date - 1, event_date - 1
  );
  if (my_summary->>'denominator')::integer is distinct from 1
     or (my_summary->>'absent')::integer is distinct from 1 then
    raise exception 'member absence was not settled after the local event date ended: %', my_summary;
  end if;
end $$;
reset role;

-- Editing a published timed event must revoke its existing QR session and
-- credentials when the officer changes it to date-only. Changing it back
-- preserves optimistic locking and does not resurrect the revoked QR code.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7100000-0000-4000-8000-000000000002', true);
do $$
declare
  created jsonb;
  event_id uuid;
  listed jsonb;
  day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Taipei') at time zone 'Asia/Taipei';
  day_end timestamptz := (date_trunc('day', now() at time zone 'Asia/Taipei') + interval '1 day') at time zone 'Asia/Taipei';
begin
  created := public.create_club_event_with_time_mode(
    'aa100000-0000-4000-8000-000000000001', 'regular_meeting', '可編輯時間模式',
    '', '', now() + interval '1 hour', now() + interval '2 hours', null, null, true, null, null, false
  );
  event_id := (created->>'event_id')::uuid;
  perform public.publish_club_event('aa100000-0000-4000-8000-000000000001', event_id);
  perform public.open_dynamic_event_checkin('aa100000-0000-4000-8000-000000000001', event_id);
  perform public.issue_dynamic_event_checkin_credential('aa100000-0000-4000-8000-000000000001', event_id, 'initial');
  perform public.update_club_event_with_time_mode(
    'aa100000-0000-4000-8000-000000000001', event_id, 'regular_meeting', '可編輯時間模式',
    '', '', day_start, day_end, null, null, true, null, null, null, true
  );
  listed := public.list_club_events('aa100000-0000-4000-8000-000000000001', false);
  if not exists (
    select 1 from jsonb_array_elements(listed->'events') as item
    where item->>'id' = event_id::text and item->>'time_unspecified' = 'true'
  ) then raise exception 'timed-to-date-only edit did not persist its time mode'; end if;

  begin
    perform public.update_club_event_with_time_mode(
      'aa100000-0000-4000-8000-000000000001', event_id, 'regular_meeting', '過期版本',
      '', '', day_start, day_end, null, null, true, null, null, 1, true
    );
    raise exception 'time-mode update bypassed optimistic locking';
  exception when serialization_failure then null;
  end;
  perform public.update_club_event_with_time_mode(
    'aa100000-0000-4000-8000-000000000001', event_id, 'regular_meeting', '可編輯時間模式',
    '', '', now() + interval '1 hour', now() + interval '2 hours', null, null, true, null, null, null, false
  );
  listed := public.list_club_events('aa100000-0000-4000-8000-000000000001', false);
  if not exists (
    select 1 from jsonb_array_elements(listed->'events') as item
    where item->>'id' = event_id::text and item->>'time_unspecified' = 'false'
  ) then raise exception 'date-only-to-timed edit did not persist its time mode'; end if;
  perform set_config('date_only.edited_event_id', event_id::text, true);

  begin
    perform public.create_club_event_with_time_mode(
      'aa100000-0000-4000-8000-000000000002', 'service', '外社越權建立',
      '', '', day_start, day_end, null, null, false, null, null, true
    );
    raise exception 'manager created an event in another club';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.update_club_event_with_time_mode(
      'aa100000-0000-4000-8000-000000000002', event_id, 'service', '外社越權修改',
      '', '', day_start, day_end, null, null, false, null, null, null, true
    );
    raise exception 'manager updated an event using another club';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$
begin
  if exists (
    select 1 from public.event_checkin_sessions
    where event_id = current_setting('date_only.edited_event_id')::uuid and session_status = 'active'
  ) or exists (
    select 1 from public.event_checkin_qr_credentials
    where event_id = current_setting('date_only.edited_event_id')::uuid and revoked_at is null
  ) then raise exception 'changing time mode left a QR session or credential active'; end if;
  if not exists (
    select 1 from public.event_checkin_qr_credentials
    where event_id = current_setting('date_only.edited_event_id')::uuid and revoke_reason = 'event_time_unspecified'
  ) then raise exception 'time-mode edit did not revoke its existing QR credential'; end if;
end $$;

update public.app_accounts set account_status = 'suspended'
where id = 'a9100000-0000-4000-8000-000000000002';
set local role authenticated;
do $$
begin
  begin
    perform public.create_club_event_with_time_mode(
      'aa100000-0000-4000-8000-000000000001', 'service', '停權帳號建立',
      '', '', now(), now() + interval '1 day', null, null, false, null, null, true
    );
    raise exception 'suspended manager created an event';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.update_club_event_with_time_mode(
      'aa100000-0000-4000-8000-000000000001', current_setting('date_only.event_id')::uuid,
      'service', '停權帳號修改', '', '', now(), now() + interval '1 day', null, null, false, null, null, null, true
    );
    raise exception 'suspended manager updated an event';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a7100000-0000-4000-8000-000000000001', true);
select * from public.set_platform_feature_flag(
  'event_date_only_v1', false, array['local']::text[], 100
);
reset role;

do $$
begin
  if has_function_privilege('authenticated', 'public.create_club_event_with_time_mode(uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,boolean,numeric,numeric,boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.update_club_event_with_time_mode(uuid,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,boolean,numeric,numeric,integer,boolean)', 'EXECUTE') then
    raise exception 'disabling the date-only flag did not revoke its mutation RPCs';
  end if;
end $$;

rollback;
