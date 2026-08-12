-- Dynamic QR V2 lifecycle, tenant isolation, and append-only attendance verification.
-- Run only against Supabase local. All fixtures are rolled back.

begin;

create table public.dynamic_qr_test_state (key text primary key, value text not null);
grant select, insert on public.dynamic_qr_test_state to authenticated;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '17000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'dynamic-manager@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '17000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'dynamic-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '17000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'dynamic-outsider@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '17000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'dynamic-suspended@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('27000000-0000-0000-0000-000000000001', '動態 QR 管理者', 'dynamic-manager@example.test'),
  ('27000000-0000-0000-0000-000000000002', '動態 QR 社員', 'dynamic-member@example.test'),
  ('27000000-0000-0000-0000-000000000003', '動態 QR 外社社員', 'dynamic-outsider@example.test'),
  ('27000000-0000-0000-0000-000000000004', '動態 QR 停權帳號', 'dynamic-suspended@example.test');

insert into public.app_accounts (id, auth_user_id, person_id, login_email, account_display_name, account_status) values
  ('37000000-0000-0000-0000-000000000001', '17000000-0000-0000-0000-000000000001', '27000000-0000-0000-0000-000000000001', 'dynamic-manager@example.test', '動態 QR 管理者', 'active'),
  ('37000000-0000-0000-0000-000000000002', '17000000-0000-0000-0000-000000000002', '27000000-0000-0000-0000-000000000002', 'dynamic-member@example.test', '動態 QR 社員', 'active'),
  ('37000000-0000-0000-0000-000000000003', '17000000-0000-0000-0000-000000000003', '27000000-0000-0000-0000-000000000003', 'dynamic-outsider@example.test', '動態 QR 外社社員', 'active'),
  ('37000000-0000-0000-0000-000000000004', '17000000-0000-0000-0000-000000000004', '27000000-0000-0000-0000-000000000004', 'dynamic-suspended@example.test', '動態 QR 停權帳號', 'suspended');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('57000000-0000-4000-8000-000000000001', 'DYNAMIC-A', '動態 QR 測試甲社', 'active', now()),
  ('57000000-0000-4000-8000-000000000002', 'DYNAMIC-B', '動態 QR 測試乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status) values
  ('67000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000001', '27000000-0000-0000-0000-000000000001', 'active'),
  ('67000000-0000-4000-8000-000000000002', '57000000-0000-4000-8000-000000000001', '27000000-0000-0000-0000-000000000002', 'active'),
  ('67000000-0000-4000-8000-000000000003', '57000000-0000-4000-8000-000000000002', '27000000-0000-0000-0000-000000000003', 'active'),
  ('67000000-0000-4000-8000-000000000004', '57000000-0000-4000-8000-000000000001', '27000000-0000-0000-0000-000000000004', 'active');

insert into public.club_role_assignments (id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id) values
  ('77000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000001', '37000000-0000-0000-0000-000000000001', 'president', 'active', '37000000-0000-0000-0000-000000000001');

insert into public.club_events (
  id, club_id, event_type, title, starts_at, ends_at, registration_deadline,
  counts_for_attendance, event_status, created_by_app_account_id, updated_by_app_account_id, published_at
) values
  ('87000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000001', 'regular_meeting', '動態 QR 有效活動', now() + interval '1 hour', now() + interval '3 hours', now() + interval '30 minutes', true, 'published', '37000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', now()),
  ('87000000-0000-4000-8000-000000000002', '57000000-0000-4000-8000-000000000001', 'regular_meeting', '動態 QR 草稿活動', now() + interval '1 hour', now() + interval '3 hours', now() + interval '30 minutes', true, 'draft', '37000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', null),
  ('87000000-0000-4000-8000-000000000003', '57000000-0000-4000-8000-000000000001', 'regular_meeting', '動態 QR 未計入活動', now() + interval '1 hour', now() + interval '3 hours', now() + interval '30 minutes', false, 'published', '37000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', now()),
  ('87000000-0000-4000-8000-000000000004', '57000000-0000-4000-8000-000000000002', 'regular_meeting', '動態 QR 外社活動', now() + interval '1 hour', now() + interval '3 hours', now() + interval '30 minutes', true, 'published', '37000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', now());

-- Ordinary users cannot open a dynamic session, including a cross-club event.
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000002', true);
do $$
begin
  begin
    perform public.open_dynamic_event_checkin('57000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001');
    raise exception 'ordinary member opened dynamic session';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000001', true);
do $$
declare opened jsonb; initial jsonb; automatic jsonb; emergency jsonb;
begin
  begin
    perform public.open_dynamic_event_checkin('57000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000002');
    raise exception 'draft event opened dynamic session';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.open_dynamic_event_checkin('57000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000003');
    raise exception 'attendance-disabled event opened dynamic session';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.open_dynamic_event_checkin('57000000-0000-4000-8000-000000000002', '87000000-0000-4000-8000-000000000004');
    raise exception 'cross-club manager opened dynamic session';
  exception when insufficient_privilege then null;
  end;

  opened := public.open_dynamic_event_checkin('57000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001');
  initial := public.issue_dynamic_event_checkin_credential('57000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001', 'initial');
  automatic := public.issue_dynamic_event_checkin_credential('57000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001', 'automatic');
  emergency := public.issue_dynamic_event_checkin_credential('57000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001', 'emergency');
  if length(initial->>'credential') <> 64 or length(automatic->>'credential') <> 64 or length(emergency->>'credential') <> 64 then
    raise exception 'dynamic credential lacks 256-bit hex entropy';
  end if;
  insert into public.dynamic_qr_test_state (key, value) values
    ('session_id', opened->>'session_id'), ('initial_credential', initial->>'credential'),
    ('automatic_credential', automatic->>'credential'), ('emergency_credential', emergency->>'credential');
end $$;
reset role;

-- Hash-only storage, fixed TTL, bounded automatic overlap, and emergency invalidation.
do $$
declare initial_credential text; automatic_credential text; emergency_credential text;
begin
  select value into initial_credential from public.dynamic_qr_test_state where key = 'initial_credential';
  select value into automatic_credential from public.dynamic_qr_test_state where key = 'automatic_credential';
  select value into emergency_credential from public.dynamic_qr_test_state where key = 'emergency_credential';
  if exists (select 1 from public.event_checkin_qr_credentials where credential_hash in (initial_credential, automatic_credential, emergency_credential)) then
    raise exception 'raw dynamic credential was stored';
  end if;
  if exists (select 1 from public.audit_logs where metadata::text like '%' || initial_credential || '%') then
    raise exception 'raw dynamic credential reached audit metadata';
  end if;
  if exists (
    select 1 from public.event_checkin_qr_credentials
    where expires_at - issued_at > interval '60 seconds' or expires_at - issued_at <= interval '0 seconds'
  ) then raise exception 'dynamic credential TTL violates policy'; end if;
  if not exists (
    select 1 from public.event_checkin_qr_credentials
    where credential_hash = encode(extensions.digest(initial_credential, 'sha256'), 'hex')
      and valid_until <= now() + interval '30 seconds'
  ) then raise exception 'automatic rotation did not bound prior credential overlap'; end if;
  if not exists (
    select 1 from public.event_checkin_qr_credentials
    where credential_hash = encode(extensions.digest(automatic_credential, 'sha256'), 'hex')
      and revoked_at is not null and revoke_reason = 'emergency_rotation'
  ) then raise exception 'emergency rotation did not invalidate prior credential'; end if;
end $$;

-- Member check-in derives the active same-club membership and remains idempotent.
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000002', true);
do $$
declare credential text; first_result jsonb; second_result jsonb;
begin
  select value into credential from public.dynamic_qr_test_state where key = 'emergency_credential';
  first_result := public.check_in_to_dynamic_event(credential);
  second_result := public.check_in_to_dynamic_event(credential);
  if (first_result->>'idempotent')::boolean or not (second_result->>'idempotent')::boolean
     or first_result->>'attendance_id' <> second_result->>'attendance_id' then
    raise exception 'dynamic duplicate check-in was not idempotent';
  end if;
  begin
    perform 1 from public.event_checkin_qr_credentials;
    raise exception 'browser role selected dynamic credential rows directly';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000003', true);
do $$
declare credential text;
begin
  select value into credential from public.dynamic_qr_test_state where key = 'emergency_credential';
  begin
    perform public.check_in_to_dynamic_event(credential);
    raise exception 'other-club member consumed dynamic credential';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000004', true);
do $$
declare credential text;
begin
  select value into credential from public.dynamic_qr_test_state where key = 'emergency_credential';
  begin
    perform public.check_in_to_dynamic_event(credential);
    raise exception 'inactive account consumed dynamic credential';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Close invalidates all children, manual/revoke remain append-only, and terminal events close V2 sessions.
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000001', true);
do $$
declare manual_result jsonb; reopened jsonb; fresh jsonb;
begin
  manual_result := public.manual_check_in_event('57000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001', '67000000-0000-4000-8000-000000000001', '現場核對名冊');
  perform public.revoke_event_attendance('57000000-0000-4000-8000-000000000001', (manual_result->>'attendance_id')::uuid, '誤登測試');
  perform public.close_event_checkin('57000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001', '測試關閉');
  reopened := public.open_dynamic_event_checkin('57000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001');
  fresh := public.issue_dynamic_event_checkin_credential('57000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001', 'initial');
  insert into public.dynamic_qr_test_state (key, value) values ('terminal_credential', fresh->>'credential');
  perform public.cancel_club_event(
    '57000000-0000-4000-8000-000000000001',
    '87000000-0000-4000-8000-000000000001',
    '動態 QR 終止測試'
  );
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000002', true);
do $$
declare credential text;
begin
  select value into credential from public.dynamic_qr_test_state where key = 'emergency_credential';
  begin
    perform public.check_in_to_dynamic_event(credential);
    raise exception 'closed session credential remained usable';
  exception when invalid_parameter_value then null;
  end;
  select value into credential from public.dynamic_qr_test_state where key = 'terminal_credential';
  begin
    perform public.check_in_to_dynamic_event(credential);
    raise exception 'terminal event credential remained usable';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;

do $$
begin
  if not exists (select 1 from public.event_attendances where checkin_note = '現場核對名冊' and attendance_status = 'revoked' and revoke_reason = '誤登測試') then
    raise exception 'manual/revoke history was not preserved';
  end if;
  if exists (select 1 from public.event_checkin_sessions where event_id = '87000000-0000-4000-8000-000000000001' and session_status = 'active') then
    raise exception 'terminal event retained active dynamic session';
  end if;
  if not has_function_privilege('authenticated', 'public.open_dynamic_event_checkin(uuid, uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.issue_dynamic_event_checkin_credential(uuid, uuid, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.check_in_to_dynamic_event(text)', 'execute') then
    raise exception 'intended dynamic RPC grants are missing';
  end if;
end $$;

rollback;
