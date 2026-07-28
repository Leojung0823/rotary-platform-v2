-- Event check-in token, tenant, lifecycle, idempotency, and history verification.
-- Run only against Supabase local. All fixtures are rolled back.

begin;

create table public.checkin_test_state (
  key text primary key,
  value text not null
);
grant select on public.checkin_test_state to authenticated;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '16000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'checkin-manager@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '16000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'checkin-member-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '16000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'checkin-member-b@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '16000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'checkin-outsider@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '16000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'checkin-suspended@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('26000000-0000-0000-0000-000000000001', '簽到管理者', 'checkin-manager@example.test'),
  ('26000000-0000-0000-0000-000000000002', '簽到社員甲', 'checkin-member-a@example.test'),
  ('26000000-0000-0000-0000-000000000003', '簽到社員乙', 'checkin-member-b@example.test'),
  ('26000000-0000-0000-0000-000000000004', '外社簽到社員', 'checkin-outsider@example.test'),
  ('26000000-0000-0000-0000-000000000005', '停權簽到社員', 'checkin-suspended@example.test'),
  ('26000000-0000-0000-0000-000000000006', '未綁定帳號社員', null);

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('36000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000001', '26000000-0000-0000-0000-000000000001', 'checkin-manager@example.test', '簽到管理者', 'active'),
  ('36000000-0000-0000-0000-000000000002', '16000000-0000-0000-0000-000000000002', '26000000-0000-0000-0000-000000000002', 'checkin-member-a@example.test', '簽到社員甲', 'active'),
  ('36000000-0000-0000-0000-000000000003', '16000000-0000-0000-0000-000000000003', '26000000-0000-0000-0000-000000000003', 'checkin-member-b@example.test', '簽到社員乙', 'active'),
  ('36000000-0000-0000-0000-000000000004', '16000000-0000-0000-0000-000000000004', '26000000-0000-0000-0000-000000000004', 'checkin-outsider@example.test', '外社簽到社員', 'active'),
  ('36000000-0000-0000-0000-000000000005', '16000000-0000-0000-0000-000000000005', '26000000-0000-0000-0000-000000000005', 'checkin-suspended@example.test', '停權簽到社員', 'suspended');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('56000000-0000-4000-8000-000000000001', 'CHECKIN-A', '簽到測試甲社', 'active', now()),
  ('56000000-0000-4000-8000-000000000002', 'CHECKIN-B', '簽到測試乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status) values
  ('66000000-0000-4000-8000-000000000001', '56000000-0000-4000-8000-000000000001', '26000000-0000-0000-0000-000000000001', 'active'),
  ('66000000-0000-4000-8000-000000000002', '56000000-0000-4000-8000-000000000001', '26000000-0000-0000-0000-000000000002', 'active'),
  ('66000000-0000-4000-8000-000000000003', '56000000-0000-4000-8000-000000000001', '26000000-0000-0000-0000-000000000003', 'active'),
  ('66000000-0000-4000-8000-000000000004', '56000000-0000-4000-8000-000000000002', '26000000-0000-0000-0000-000000000004', 'active'),
  ('66000000-0000-4000-8000-000000000005', '56000000-0000-4000-8000-000000000001', '26000000-0000-0000-0000-000000000005', 'active'),
  ('66000000-0000-4000-8000-000000000006', '56000000-0000-4000-8000-000000000001', '26000000-0000-0000-0000-000000000006', 'active');

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values (
  '76000000-0000-4000-8000-000000000001',
  '56000000-0000-4000-8000-000000000001',
  '36000000-0000-0000-0000-000000000001',
  'president', 'active', '36000000-0000-0000-0000-000000000001'
);

insert into public.club_events (
  id, club_id, event_type, title, starts_at, ends_at, registration_deadline,
  counts_for_attendance, event_status, created_by_app_account_id,
  updated_by_app_account_id, published_at
) values (
  '86000000-0000-4000-8000-000000000001',
  '56000000-0000-4000-8000-000000000001',
  'regular_meeting', '安全簽到測試例會',
  now() + interval '1 hour', now() + interval '3 hours', now() + interval '30 minutes',
  true, 'published',
  '36000000-0000-0000-0000-000000000001',
  '36000000-0000-0000-0000-000000000001', now()
);

-- Manager opens a short-lived session. Only the raw token returned by the RPC is stored in test state.
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);
do $$
declare opened jsonb;
begin
  opened := public.open_event_checkin(
    '56000000-0000-4000-8000-000000000001',
    '86000000-0000-4000-8000-000000000001',
    30
  );
  if length(opened->>'token') <> 64 then raise exception 'raw check-in token was not returned once'; end if;
  insert into public.checkin_test_state (key, value) values
    ('old_token', opened->>'token'),
    ('old_session_id', opened->>'session_id');

  begin
    perform public.open_event_checkin(
      '56000000-0000-4000-8000-000000000001',
      '86000000-0000-4000-8000-000000000001',
      30
    );
    raise exception 'second active check-in session was opened';
  exception when unique_violation then null;
  end;
end $$;
reset role;

-- Database stores only the hash, never the raw token.
do $$
declare raw_token text; stored_hash text;
begin
  select value into raw_token from public.checkin_test_state where key = 'old_token';
  select token_hash into stored_hash from public.event_checkin_sessions
  where id = (select value::uuid from public.checkin_test_state where key = 'old_session_id');
  if stored_hash = raw_token or length(stored_hash) <> 64 then
    raise exception 'raw token was stored or token hash is malformed';
  end if;
end $$;

-- Ordinary member cannot manage sessions, can self check in, and duplicate scans are idempotent.
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000002', true);
do $$
declare first_result jsonb; second_result jsonb; raw_token text;
begin
  select value into raw_token from public.checkin_test_state where key = 'old_token';
  begin
    perform public.rotate_event_checkin_token(
      '56000000-0000-4000-8000-000000000001',
      '86000000-0000-4000-8000-000000000001',
      30
    );
    raise exception 'ordinary member rotated a check-in token';
  exception when insufficient_privilege then null;
  end;

  first_result := public.check_in_to_event(raw_token);
  second_result := public.check_in_to_event(raw_token);
  if (first_result->>'idempotent')::boolean then raise exception 'first check-in was marked idempotent'; end if;
  if not (second_result->>'idempotent')::boolean then raise exception 'duplicate check-in was not idempotent'; end if;
  if first_result->>'attendance_id' <> second_result->>'attendance_id' then
    raise exception 'duplicate check-in created a second active attendance';
  end if;

  begin
    perform 1 from public.event_attendances;
    raise exception 'authenticated role selected event attendances directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.event_checkin_sessions set expires_at = now() + interval '1 day';
    raise exception 'authenticated role updated check-in sessions directly';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Cross-club and suspended accounts cannot consume a valid token.
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000004', true);
do $$
declare raw_token text;
begin
  select value into raw_token from public.checkin_test_state where key = 'old_token';
  begin
    perform public.check_in_to_event(raw_token);
    raise exception 'cross-club member checked in';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000005', true);
do $$
declare raw_token text;
begin
  select value into raw_token from public.checkin_test_state where key = 'old_token';
  begin
    perform public.check_in_to_event(raw_token);
    raise exception 'suspended account checked in';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Rotation invalidates the old token immediately and returns a new one only once.
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);
do $$
declare rotated jsonb;
begin
  rotated := public.rotate_event_checkin_token(
    '56000000-0000-4000-8000-000000000001',
    '86000000-0000-4000-8000-000000000001',
    45
  );
  insert into public.checkin_test_state (key, value) values
    ('new_token', rotated->>'token'),
    ('new_session_id', rotated->>'session_id');
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000003', true);
do $$
declare old_token text; new_token text; checked jsonb;
begin
  select value into old_token from public.checkin_test_state where key = 'old_token';
  select value into new_token from public.checkin_test_state where key = 'new_token';
  begin
    perform public.check_in_to_event(old_token);
    raise exception 'rotated token remained valid';
  exception when invalid_parameter_value then null;
  end;
  checked := public.check_in_to_event(new_token);
  if checked->>'event_id' <> '86000000-0000-4000-8000-000000000001' then
    raise exception 'new token did not check in the intended event';
  end if;
end $$;
reset role;

-- Manager can manually check in an active member without an app account, cannot target another club, and can revoke without deleting history.
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);
do $$
declare manual_result jsonb; attendance_id uuid; original_time timestamptz;
begin
  manual_result := public.manual_check_in_event(
    '56000000-0000-4000-8000-000000000001',
    '86000000-0000-4000-8000-000000000001',
    '66000000-0000-4000-8000-000000000006',
    '現場核對社員名冊'
  );
  attendance_id := (manual_result->>'attendance_id')::uuid;
  select checked_in_at into original_time from public.event_attendances where id = attendance_id;

  begin
    perform public.manual_check_in_event(
      '56000000-0000-4000-8000-000000000001',
      '86000000-0000-4000-8000-000000000001',
      '66000000-0000-4000-8000-000000000004',
      '跨社補登'
    );
    raise exception 'manager manually checked in another club membership';
  exception when insufficient_privilege then null;
  end;

  perform public.revoke_event_attendance(
    '56000000-0000-4000-8000-000000000001',
    attendance_id,
    '現場確認誤登'
  );

  if not exists (
    select 1 from public.event_attendances
    where id = attendance_id
      and attendance_status = 'revoked'
      and checked_in_at = original_time
      and checkin_method = 'manual'
      and revoke_reason = '現場確認誤登'
  ) then
    raise exception 'revocation did not preserve the original attendance history';
  end if;

  begin
    delete from public.event_attendances where id = attendance_id;
    raise exception 'attendance history was hard deleted';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Cancelling the event automatically closes the active session and keeps all attendance rows.
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);
do $$
begin
  perform public.cancel_club_event(
    '56000000-0000-4000-8000-000000000001',
    '86000000-0000-4000-8000-000000000001',
    '測試取消活動'
  );
end $$;
reset role;

do $$
begin
  if exists (
    select 1 from public.event_checkin_sessions
    where event_id = '86000000-0000-4000-8000-000000000001'
      and session_status = 'active'
  ) then
    raise exception 'terminal event retained an active check-in session';
  end if;
  if not exists (
    select 1 from public.event_checkin_sessions
    where id = (select value::uuid from public.checkin_test_state where key = 'new_session_id')
      and session_status = 'closed'
      and close_reason = 'event_terminal'
  ) then
    raise exception 'event cancellation did not close the session with terminal reason';
  end if;
  if (select count(*) from public.event_attendances where event_id = '86000000-0000-4000-8000-000000000001') < 3 then
    raise exception 'event cancellation removed attendance history';
  end if;
  if not exists (
    select 1 from public.audit_logs
    where action_key in (
      'attendance.session_opened', 'attendance.session_rotated',
      'attendance.self_checked_in', 'attendance.manual_checked_in', 'attendance.revoked'
    )
  ) then
    raise exception 'attendance audit records were not written';
  end if;
end $$;

rollback;
