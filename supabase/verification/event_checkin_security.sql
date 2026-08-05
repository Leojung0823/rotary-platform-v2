-- Event check-in V2 GPS, dynamic QR, authorization, idempotency, and audit verification.
-- Run only against Supabase local. All fixtures are rolled back.

begin;

create temporary table checkin_v2_state (key text primary key, value text not null);
grant select, insert on checkin_v2_state to authenticated;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '16100000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'v2-manager@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '16100000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'v2-member-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '16100000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'v2-member-b@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '16100000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'v2-outsider@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('26100000-0000-0000-0000-000000000001', '簽到管理者', 'v2-manager@example.test'),
  ('26100000-0000-0000-0000-000000000002', '動態 QR 社員', 'v2-member-a@example.test'),
  ('26100000-0000-0000-0000-000000000003', '定位簽到社員', 'v2-member-b@example.test'),
  ('26100000-0000-0000-0000-000000000004', '外社社員', 'v2-outsider@example.test'),
  ('26100000-0000-0000-0000-000000000005', '無手機社員', null);

insert into public.app_accounts (id, auth_user_id, person_id, login_email, account_display_name, account_status) values
  ('36100000-0000-0000-0000-000000000001', '16100000-0000-0000-0000-000000000001', '26100000-0000-0000-0000-000000000001', 'v2-manager@example.test', '簽到管理者', 'active'),
  ('36100000-0000-0000-0000-000000000002', '16100000-0000-0000-0000-000000000002', '26100000-0000-0000-0000-000000000002', 'v2-member-a@example.test', '動態 QR 社員', 'active'),
  ('36100000-0000-0000-0000-000000000003', '16100000-0000-0000-0000-000000000003', '26100000-0000-0000-0000-000000000003', 'v2-member-b@example.test', '定位簽到社員', 'active'),
  ('36100000-0000-0000-0000-000000000004', '16100000-0000-0000-0000-000000000004', '26100000-0000-0000-0000-000000000004', 'v2-outsider@example.test', '外社社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('56100000-0000-4000-8000-000000000001', 'CHECKIN-V2-A', '簽到 V2 甲社', 'active', now()),
  ('56100000-0000-4000-8000-000000000002', 'CHECKIN-V2-B', '簽到 V2 乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_number, membership_status) values
  ('66100000-0000-4000-8000-000000000001', '56100000-0000-4000-8000-000000000001', '26100000-0000-0000-0000-000000000001', 'M001', 'active'),
  ('66100000-0000-4000-8000-000000000002', '56100000-0000-4000-8000-000000000001', '26100000-0000-0000-0000-000000000002', 'M002', 'active'),
  ('66100000-0000-4000-8000-000000000003', '56100000-0000-4000-8000-000000000001', '26100000-0000-0000-0000-000000000003', 'M003', 'active'),
  ('66100000-0000-4000-8000-000000000004', '56100000-0000-4000-8000-000000000002', '26100000-0000-0000-0000-000000000004', 'M004', 'active'),
  ('66100000-0000-4000-8000-000000000005', '56100000-0000-4000-8000-000000000001', '26100000-0000-0000-0000-000000000005', 'M005', 'active');

insert into public.club_role_assignments (id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id) values
  ('76100000-0000-4000-8000-000000000001', '56100000-0000-4000-8000-000000000001', '36100000-0000-0000-0000-000000000001', 'president', 'active', '36100000-0000-0000-0000-000000000001');

insert into public.club_events (id, club_id, event_type, title, location, starts_at, ends_at, registration_deadline, counts_for_attendance, event_status, created_by_app_account_id, updated_by_app_account_id, published_at) values (
  '86100000-0000-4000-8000-000000000001', '56100000-0000-4000-8000-000000000001', 'regular_meeting', '八月份例會', '台北測試會館', now() + interval '30 minutes', now() + interval '2 hours', now() + interval '10 minutes', true, 'published', '36100000-0000-0000-0000-000000000001', '36100000-0000-0000-0000-000000000001', now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '16100000-0000-0000-0000-000000000001', true);
do $$
declare session_result jsonb; qr_result jsonb;
begin
  perform public.configure_event_checkin(
    '56100000-0000-4000-8000-000000000001', '86100000-0000-4000-8000-000000000001',
    true, true, 25.033964, 121.564468, 200, 100,
    now() - interval '5 minutes', now() + interval '2 hours', 30
  );
  session_result := public.start_event_checkin_session('56100000-0000-4000-8000-000000000001', '86100000-0000-4000-8000-000000000001');
  qr_result := public.issue_event_checkin_qr('56100000-0000-4000-8000-000000000001', '86100000-0000-4000-8000-000000000001');
  if length(qr_result->>'token') <> 64 or (qr_result->>'rotation_seconds')::integer <> 30 then raise exception 'dynamic QR credential malformed'; end if;
  insert into checkin_v2_state (key, value) values ('credential', qr_result->>'token'), ('session_id', session_result->>'session_id');

  begin
    perform public.configure_event_checkin('56100000-0000-4000-8000-000000000001', '86100000-0000-4000-8000-000000000001', true, true, 25, 121, 100, 100, now(), now() + interval '1 hour', 45);
    raise exception 'active check-in configuration was modified';
  exception when object_not_in_prerequisite_state then null;
  end;
end $$;
reset role;

do $$
declare raw_credential text;
begin
  select value into raw_credential from checkin_v2_state where key = 'credential';
  if exists (select 1 from public.event_checkin_qr_credentials where token_hash = raw_credential) then raise exception 'raw QR credential was stored'; end if;
  if not exists (select 1 from public.event_checkin_qr_credentials where length(token_hash) = 64 and expires_at <= created_at + interval '30 seconds') then raise exception 'short-lived QR credential was not stored correctly'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '16100000-0000-0000-0000-000000000002', true);
do $$
declare token text; preview jsonb; first_result jsonb; duplicate_result jsonb;
begin
  select value into token from checkin_v2_state where key = 'credential';
  preview := public.preview_event_qr_checkin(token);
  if preview->>'status' <> 'ready' or preview->>'title' <> '八月份例會' then raise exception 'QR preview did not return member-safe event details'; end if;
  first_result := public.confirm_event_qr_checkin(token);
  duplicate_result := public.confirm_event_qr_checkin(token);
  if first_result->>'status' <> 'success' or duplicate_result->>'status' <> 'already_checked_in' then raise exception 'QR idempotency failed'; end if;
  if first_result->>'attendance_id' <> duplicate_result->>'attendance_id' then raise exception 'duplicate QR created a second attendance'; end if;

  begin perform public.issue_event_checkin_qr('56100000-0000-4000-8000-000000000001', '86100000-0000-4000-8000-000000000001'); raise exception 'member issued a QR'; exception when insufficient_privilege then null; end;
  begin perform public.check_in_to_event(token); raise exception 'legacy fixed credential RPC remained executable'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.event_checkin_qr_credentials; raise exception 'member selected QR credentials directly'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '16100000-0000-0000-0000-000000000003', true);
do $$
declare result jsonb; duplicate_result jsonb;
begin
  result := public.check_in_by_gps('86100000-0000-4000-8000-000000000001', 25.033964, 121.564468, 500);
  if result->>'status' <> 'accuracy_insufficient' then raise exception 'inaccurate GPS was accepted'; end if;
  result := public.check_in_by_gps('86100000-0000-4000-8000-000000000001', 25.050000, 121.564468, 20);
  if result->>'status' <> 'outside_radius' then raise exception 'outside GPS was accepted'; end if;
  result := public.check_in_by_gps('86100000-0000-4000-8000-000000000001', 25.033964, 121.564468, 20);
  duplicate_result := public.check_in_by_gps('86100000-0000-4000-8000-000000000001', 25.033964, 121.564468, 20);
  if result->>'status' <> 'success' or duplicate_result->>'status' <> 'already_checked_in' then raise exception 'GPS idempotency failed'; end if;
  perform public.record_client_checkin_failure('86100000-0000-4000-8000-000000000001', 'gps', 'location_timeout');
  begin perform public.record_client_checkin_failure('86100000-0000-4000-8000-000000000001', 'gps', 'arbitrary_failure'); raise exception 'arbitrary client failure was recorded'; exception when invalid_parameter_value then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '16100000-0000-0000-0000-000000000004', true);
do $$
declare token text; result jsonb;
begin
  select value into token from checkin_v2_state where key = 'credential';
  result := public.preview_event_qr_checkin(token);
  if result->>'status' <> 'not_eligible' then raise exception 'cross-club member previewed a QR'; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '16100000-0000-0000-0000-000000000001', true);
do $$
declare result jsonb; attendance_id uuid;
begin
  result := public.manual_check_in_event('56100000-0000-4000-8000-000000000001', '86100000-0000-4000-8000-000000000001', '66100000-0000-4000-8000-000000000005', '社員沒有手機，現場核對社員編號');
  if result->>'status' <> 'success' then raise exception 'manual fallback failed'; end if;
  attendance_id := (result->>'attendance_id')::uuid;
  perform public.revoke_event_attendance('56100000-0000-4000-8000-000000000001', attendance_id, '現場確認誤登');
  perform public.close_event_checkin('56100000-0000-4000-8000-000000000001', '86100000-0000-4000-8000-000000000001', '活動現場簽到結束');
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '16100000-0000-0000-0000-000000000003', true);
do $$
declare token text; result jsonb;
begin
  select value into token from checkin_v2_state where key = 'credential';
  result := public.preview_event_qr_checkin(token);
  if result->>'status' not in ('credential_expired', 'session_closed') then raise exception 'closed QR remained usable'; end if;
end $$;
reset role;

do $$
declare required_action text;
begin
  if exists (select 1 from public.event_checkin_qr_credentials where invalidated_at is null) then raise exception 'close left an active QR credential'; end if;
  if exists (select 1 from public.event_checkin_settings where event_id = '86100000-0000-4000-8000-000000000001' and closes_at > now()) then raise exception 'close left GPS window open'; end if;
  if not exists (select 1 from public.event_checkin_attempts where result_code = 'accuracy_insufficient') then raise exception 'accuracy failure was not audited'; end if;
  if not exists (select 1 from public.event_checkin_attempts where result_code = 'outside_radius') then raise exception 'distance failure was not audited'; end if;
  if not exists (select 1 from public.event_checkin_attempts where result_code = 'location_timeout') then raise exception 'client location failure was not audited'; end if;
  foreach required_action in array array['attendance.settings_updated', 'attendance.session_opened', 'attendance.self_checked_in', 'attendance.manual_checked_in', 'attendance.revoked', 'attendance.session_closed'] loop
    if not exists (select 1 from public.audit_logs where action_key = required_action) then raise exception 'missing audit action: %', required_action; end if;
  end loop;
end $$;

rollback;
