-- Attendance Domain Core security, tenant isolation, formula, lifecycle, and CSV verification.
-- Run only against Supabase local. All synthetic fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '17000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'attendance-manager@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '17000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'attendance-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '17000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'attendance-other@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '17000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'attendance-cross@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '17000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'attendance-suspended-account@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '17000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'attendance-suspended-membership@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '17000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'attendance-operator@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '17000000-0000-0000-0000-000000000008', 'authenticated', 'authenticated', 'attendance-multiclub@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('27000000-0000-0000-0000-000000000001', '出席管理者', 'attendance-manager@example.test'),
  ('27000000-0000-0000-0000-000000000002', '=出席社員', 'attendance-member@example.test'),
  ('27000000-0000-0000-0000-000000000003', '第二社員', 'attendance-other@example.test'),
  ('27000000-0000-0000-0000-000000000004', '外社社員', 'attendance-cross@example.test'),
  ('27000000-0000-0000-0000-000000000005', '停權帳號社員', 'attendance-suspended-account@example.test'),
  ('27000000-0000-0000-0000-000000000006', '停權社籍社員', 'attendance-suspended-membership@example.test'),
  ('27000000-0000-0000-0000-000000000007', '執行秘書', 'attendance-operator@example.test'),
  ('27000000-0000-0000-0000-000000000008', '多社社員', 'attendance-multiclub@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('37000000-0000-0000-0000-000000000001', '17000000-0000-0000-0000-000000000001', '27000000-0000-0000-0000-000000000001', 'attendance-manager@example.test', '出席管理者', 'active'),
  ('37000000-0000-0000-0000-000000000002', '17000000-0000-0000-0000-000000000002', '27000000-0000-0000-0000-000000000002', 'attendance-member@example.test', '=出席社員', 'active'),
  ('37000000-0000-0000-0000-000000000003', '17000000-0000-0000-0000-000000000003', '27000000-0000-0000-0000-000000000003', 'attendance-other@example.test', '第二社員', 'active'),
  ('37000000-0000-0000-0000-000000000004', '17000000-0000-0000-0000-000000000004', '27000000-0000-0000-0000-000000000004', 'attendance-cross@example.test', '外社社員', 'active'),
  ('37000000-0000-0000-0000-000000000005', '17000000-0000-0000-0000-000000000005', '27000000-0000-0000-0000-000000000005', 'attendance-suspended-account@example.test', '停權帳號社員', 'suspended'),
  ('37000000-0000-0000-0000-000000000006', '17000000-0000-0000-0000-000000000006', '27000000-0000-0000-0000-000000000006', 'attendance-suspended-membership@example.test', '停權社籍社員', 'active'),
  ('37000000-0000-0000-0000-000000000007', '17000000-0000-0000-0000-000000000007', '27000000-0000-0000-0000-000000000007', 'attendance-operator@example.test', '執行秘書', 'active'),
  ('37000000-0000-0000-0000-000000000008', '17000000-0000-0000-0000-000000000008', '27000000-0000-0000-0000-000000000008', 'attendance-multiclub@example.test', '多社社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at, suspended_at) values
  ('57000000-0000-4000-8000-000000000001', 'ATT-A', '出席測試甲社', 'active', now(), null),
  ('57000000-0000-4000-8000-000000000002', 'ATT-B', '出席測試乙社', 'active', now(), null),
  ('57000000-0000-4000-8000-000000000003', 'ATT-C', '停權出席測試社', 'suspended', now() - interval '1 day', now());

insert into public.club_memberships (
  id, club_id, person_id, membership_status, joined_on, ended_on
) values
  ('67000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000001', '27000000-0000-0000-0000-000000000001', 'active', current_date - 1000, null),
  ('67000000-0000-4000-8000-000000000002', '57000000-0000-4000-8000-000000000001', '27000000-0000-0000-0000-000000000002', 'active', current_date - 1000, null),
  ('67000000-0000-4000-8000-000000000003', '57000000-0000-4000-8000-000000000001', '27000000-0000-0000-0000-000000000003', 'active', current_date - 1000, null),
  ('67000000-0000-4000-8000-000000000004', '57000000-0000-4000-8000-000000000002', '27000000-0000-0000-0000-000000000004', 'active', current_date - 1000, null),
  ('67000000-0000-4000-8000-000000000005', '57000000-0000-4000-8000-000000000001', '27000000-0000-0000-0000-000000000005', 'active', current_date - 1000, null),
  ('67000000-0000-4000-8000-000000000006', '57000000-0000-4000-8000-000000000001', '27000000-0000-0000-0000-000000000006', 'suspended', current_date - 1000, null),
  ('67000000-0000-4000-8000-000000000007', '57000000-0000-4000-8000-000000000003', '27000000-0000-0000-0000-000000000001', 'active', current_date - 1000, null),
  ('67000000-0000-4000-8000-000000000008', '57000000-0000-4000-8000-000000000001', '27000000-0000-0000-0000-000000000008', 'active', current_date - 1000, null),
  ('67000000-0000-4000-8000-000000000009', '57000000-0000-4000-8000-000000000002', '27000000-0000-0000-0000-000000000008', 'active', current_date - 1000, null);

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values
  ('77000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000001', '37000000-0000-0000-0000-000000000001', 'president', 'active', '37000000-0000-0000-0000-000000000001'),
  ('77000000-0000-4000-8000-000000000002', '57000000-0000-4000-8000-000000000003', '37000000-0000-0000-0000-000000000001', 'president', 'active', '37000000-0000-0000-0000-000000000001');

insert into public.club_operator_permissions (
  id, club_id, app_account_id, permission_level, assignment_status, starts_at
) values (
  '78000000-0000-4000-8000-000000000001',
  '57000000-0000-4000-8000-000000000001',
  '37000000-0000-0000-0000-000000000007',
  'club_manager', 'active', now() - interval '1 day'
);

insert into public.club_events (
  id, club_id, event_type, title, starts_at, ends_at, registration_deadline,
  counts_for_attendance, event_status, created_by_app_account_id,
  updated_by_app_account_id, published_at, cancelled_at, cancellation_reason
) values
  ('87000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000001', 'regular_meeting', '+原始簽到例會', now() - interval '14 days', now() - interval '14 days' + interval '2 hours', now() - interval '15 days', true, 'completed', '37000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', now() - interval '20 days', null, null),
  ('87000000-0000-4000-8000-000000000002', '57000000-0000-4000-8000-000000000001', 'regular_meeting', '補出席例會', now() - interval '12 days', now() - interval '12 days' + interval '2 hours', now() - interval '13 days', true, 'completed', '37000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', now() - interval '20 days', null, null),
  ('87000000-0000-4000-8000-000000000003', '57000000-0000-4000-8000-000000000001', 'regular_meeting', '公假例會', now() - interval '10 days', now() - interval '10 days' + interval '2 hours', now() - interval '11 days', true, 'completed', '37000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', now() - interval '20 days', null, null),
  ('87000000-0000-4000-8000-000000000004', '57000000-0000-4000-8000-000000000001', 'regular_meeting', '請假例會', now() - interval '8 days', now() - interval '8 days' + interval '2 hours', now() - interval '9 days', true, 'completed', '37000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', now() - interval '20 days', null, null),
  ('87000000-0000-4000-8000-000000000005', '57000000-0000-4000-8000-000000000001', 'regular_meeting', '免計例會', now() - interval '6 days', now() - interval '6 days' + interval '2 hours', now() - interval '7 days', true, 'completed', '37000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', now() - interval '20 days', null, null),
  ('87000000-0000-4000-8000-000000000006', '57000000-0000-4000-8000-000000000001', 'regular_meeting', '缺席例會', now() - interval '4 days', now() - interval '4 days' + interval '2 hours', now() - interval '5 days', true, 'completed', '37000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', now() - interval '20 days', null, null),
  ('87000000-0000-4000-8000-000000000007', '57000000-0000-4000-8000-000000000001', 'regular_meeting', '取消例會', now() - interval '3 days', now() - interval '3 days' + interval '2 hours', now() - interval '4 days', true, 'cancelled', '37000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', now() - interval '20 days', now() - interval '2 days', '測試取消'),
  ('87000000-0000-4000-8000-000000000008', '57000000-0000-4000-8000-000000000001', 'other', '不計出席活動', now() - interval '2 days', now() - interval '2 days' + interval '2 hours', now() - interval '3 days', false, 'completed', '37000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', now() - interval '20 days', null, null),
  ('87000000-0000-4000-8000-000000000009', '57000000-0000-4000-8000-000000000001', 'regular_meeting', '尚未確認例會', now() - interval '1 day', now() - interval '1 day' + interval '2 hours', now() - interval '2 days', true, 'published', '37000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', now() - interval '20 days', null, null),
  ('87000000-0000-4000-8000-000000000010', '57000000-0000-4000-8000-000000000002', 'regular_meeting', '乙社例會', now() - interval '1 day', now() - interval '1 day' + interval '2 hours', now() - interval '2 days', true, 'completed', '37000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', now() - interval '20 days', null, null),
  ('87000000-0000-4000-8000-000000000011', '57000000-0000-4000-8000-000000000003', 'regular_meeting', '停權社例會', now() - interval '1 day', now() - interval '1 day' + interval '2 hours', now() - interval '2 days', true, 'completed', '37000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', now() - interval '20 days', null, null),
  ('87000000-0000-4000-8000-000000000012', '57000000-0000-4000-8000-000000000001', 'regular_meeting', '未來資格例會', now() + interval '10 days', now() + interval '10 days' + interval '2 hours', now() + interval '9 days', true, 'published', '37000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', now(), null, null),
  ('87000000-0000-4000-8000-000000000013', '57000000-0000-4000-8000-000000000001', 'other', '不納入其他活動', now() - interval '9 days', now() - interval '9 days' + interval '2 hours', now() - interval '10 days', true, 'completed', '37000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', now() - interval '20 days', null, null),
  ('87000000-0000-4000-8000-000000000014', '57000000-0000-4000-8000-000000000001', 'service', '不納入服務活動', now() - interval '7 days', now() - interval '7 days' + interval '2 hours', now() - interval '8 days', true, 'completed', '37000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', now() - interval '20 days', null, null),
  ('87000000-0000-4000-8000-000000000015', '57000000-0000-4000-8000-000000000001', 'board_meeting', '不納入理事會', now() - interval '5 days', now() - interval '5 days' + interval '2 hours', now() - interval '6 days', true, 'completed', '37000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', now() - interval '20 days', null, null);

insert into public.event_attendances (
  id, club_id, event_id, membership_id, checkin_method,
  checked_in_by_app_account_id, checkin_note, checked_in_at
) values
(
  '97000000-0000-4000-8000-000000000001',
  '57000000-0000-4000-8000-000000000001',
  '87000000-0000-4000-8000-000000000001',
  '67000000-0000-4000-8000-000000000002',
  'manual', '37000000-0000-0000-0000-000000000001', '原始簽到不可覆蓋', now() - interval '14 days'
),
(
  '97000000-0000-4000-8000-000000000002',
  '57000000-0000-4000-8000-000000000001',
  '87000000-0000-4000-8000-000000000013',
  '67000000-0000-4000-8000-000000000002',
  'manual', '37000000-0000-0000-0000-000000000001', '非例會原始簽到仍應保留', now() - interval '9 days'
);

-- The manager creates all four adjustment types, proves the partial unique index,
-- and revokes one record without erasing it.
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000001', true);
do $immutable$
declare
  created jsonb;
  duplicate_rejected boolean := false;
  nonregular_event_id uuid;
begin
  perform public.set_attendance_adjustment('57000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001', '67000000-0000-4000-8000-000000000002', 'exempt', '@原始簽到優先');
  perform public.set_attendance_adjustment('57000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000002', '67000000-0000-4000-8000-000000000002', 'makeup', '完成跨社補出席');
  perform public.set_attendance_adjustment('57000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000003', '67000000-0000-4000-8000-000000000002', 'official_leave', '代表扶輪社出席公務');
  perform public.set_attendance_adjustment('57000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000004', '67000000-0000-4000-8000-000000000002', 'leave', '事前請假');
  created := public.set_attendance_adjustment('57000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000005', '67000000-0000-4000-8000-000000000002', 'exempt', '本場免計');

  begin
    perform public.set_attendance_adjustment('57000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000005', '67000000-0000-4000-8000-000000000002', 'leave', '重複有效調整');
  exception when unique_violation then duplicate_rejected := true;
  end;
  if not duplicate_rejected then raise exception 'duplicate active adjustment was accepted'; end if;

  perform public.revoke_attendance_adjustment('57000000-0000-4000-8000-000000000001', (created->>'adjustment_id')::uuid, '重新確認社員資格');
  perform public.set_attendance_adjustment('57000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000005', '67000000-0000-4000-8000-000000000002', 'exempt', '確認仍為免計');

  foreach nonregular_event_id in array array[
    '87000000-0000-4000-8000-000000000013'::uuid,
    '87000000-0000-4000-8000-000000000014'::uuid,
    '87000000-0000-4000-8000-000000000015'::uuid
  ] loop
    begin
      perform public.set_attendance_adjustment(
        '57000000-0000-4000-8000-000000000001', nonregular_event_id,
        '67000000-0000-4000-8000-000000000002', 'leave', '非例會不得調整'
      );
      raise exception 'non-regular event accepted an attendance adjustment: %', nonregular_event_id;
    exception when invalid_parameter_value then
      null;
    end;
  end loop;
end $immutable$;
reset role;

-- Ordinary members have own-history access only and cannot invoke management RPCs,
-- read adjustments directly, or exceed date bounds.
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000002', true);
do $$
declare history jsonb; summary jsonb;
begin
  history := public.list_my_attendance_history('57000000-0000-4000-8000-000000000001', current_date - 30, current_date);
  summary := public.get_my_attendance_summary('57000000-0000-4000-8000-000000000001', current_date - 30, current_date);
  if jsonb_array_length(history->'records') <> 7 then raise exception 'member history did not apply event eligibility rules'; end if;
  if exists (
    select 1 from jsonb_array_elements(history->'records') as record
    where jsonb_typeof(record->'attendance_credit') <> 'boolean'
       or jsonb_typeof(record->'in_denominator') <> 'boolean'
  ) then raise exception 'attendance history returned a nullable boolean projection'; end if;
  if history::text like '%取消例會%'
     or history::text like '%不計出席活動%'
     or history::text like '%不納入其他活動%'
     or history::text like '%不納入服務活動%'
     or history::text like '%不納入理事會%' then
    raise exception 'ineligible event entered attendance history';
  end if;
  if (summary->>'denominator')::integer <> 5
     or (summary->>'attended')::integer <> 2
     or (summary->>'attendance_rate')::numeric <> 40.0
     or (summary->>'present')::integer <> 1
     or (summary->>'makeup')::integer <> 1
     or (summary->>'official_leave')::integer <> 1
     or (summary->>'leave')::integer <> 1
     or (summary->>'exempt')::integer <> 1
     or (summary->>'absent')::integer <> 2 then
    raise exception 'attendance status or denominator calculation is incorrect: %', summary;
  end if;
  begin
    perform public.get_event_attendance_roster('57000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001');
    raise exception 'ordinary member read the club roster';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.export_event_attendance_csv('57000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001');
    raise exception 'ordinary member exported the club roster';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_attendance_adjustment('57000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000006', '67000000-0000-4000-8000-000000000002', 'leave', '無權異動');
    raise exception 'ordinary member created an adjustment';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.list_my_attendance_history('57000000-0000-4000-8000-000000000001', current_date - 500, current_date);
    raise exception 'unbounded attendance query was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform 1 from public.attendance_adjustments;
    raise exception 'browser role directly read adjustments';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.attendance_adjustments (
      club_id, event_id, membership_id, adjustment_type, reason, created_by_app_account_id
    ) values (
      '57000000-0000-4000-8000-000000000001',
      '87000000-0000-4000-8000-000000000006',
      '67000000-0000-4000-8000-000000000002',
      'leave', '不應可直接寫入', '37000000-0000-0000-0000-000000000002'
    );
    raise exception 'browser role directly inserted an adjustment';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.attendance_adjustments set revoked_at = now();
    raise exception 'browser role directly updated an adjustment';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.attendance_adjustments;
    raise exception 'browser role directly deleted an adjustment';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Club A and suspended callers fail closed against Club B/A respectively.
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000004', true);
do $$ begin
  begin
    perform public.list_my_attendance_history('57000000-0000-4000-8000-000000000001', current_date - 30, current_date);
    raise exception 'Club B member read Club A attendance';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000005', true);
do $$ begin
  begin
    perform public.get_my_attendance_summary('57000000-0000-4000-8000-000000000001', current_date - 30, current_date);
    raise exception 'suspended account read attendance';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000006', true);
do $$ begin
  begin
    perform public.get_my_attendance_summary('57000000-0000-4000-8000-000000000001', current_date - 30, current_date);
    raise exception 'suspended membership read new attendance data';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000001', true);
do $$ begin
  begin
    perform public.set_attendance_adjustment('57000000-0000-4000-8000-000000000002', '87000000-0000-4000-8000-000000000010', '67000000-0000-4000-8000-000000000004', 'leave', '跨社異動');
    raise exception 'Club A manager changed Club B adjustment';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_attendance_adjustment('57000000-0000-4000-8000-000000000003', '87000000-0000-4000-8000-000000000011', '67000000-0000-4000-8000-000000000007', 'leave', '停權社異動');
    raise exception 'suspended club accepted an attendance mutation';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- A manager sees a safe club roster and server-neutralized CSV projection. An
-- operator without a membership can manage but never becomes a roster member.
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000001', true);
do $$
declare
  roster jsonb;
  export_rows jsonb;
  exported_text text;
  club_summary jsonb;
  nonregular_event_id uuid;
begin
  club_summary := public.get_club_attendance_summary(
    '57000000-0000-4000-8000-000000000001', current_date - 30, current_date
  );
  if (club_summary->>'denominator')::integer <> 40
     or (club_summary->>'attended')::integer <> 2 then
    raise exception 'non-regular event entered the club attendance summary: %', club_summary;
  end if;

  roster := public.get_event_attendance_roster('57000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001');
  if jsonb_array_length(roster->'members') <> 6 then
    raise exception 'roster did not retain the expected membership-only projection';
  end if;
  if roster::text like '%執行秘書%' then raise exception 'operator without membership entered member denominator'; end if;
  if not exists (
    select 1 from jsonb_array_elements(roster->'members') as member
    where member->>'membership_id' = '67000000-0000-4000-8000-000000000002'
      and member->>'final_status' = 'present'
      and (member->>'in_denominator')::boolean
      and member->>'raw_checkin_method' = 'manual'
      and member->>'adjustment_type' = 'exempt'
  ) then raise exception 'original attendance did not retain priority over adjustment'; end if;

  export_rows := public.export_event_attendance_csv('57000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001');
  exported_text := export_rows::text;
  if exported_text like '%auth_user_id%'
     or exported_text like '%person_id%'
     or exported_text like '%provider_subject%'
     or exported_text like '%token_hash%'
     or exported_text like '%service_role%'
     or exported_text like '%session_id%'
     or exported_text like '%device%' then
    raise exception 'attendance export projection leaked a forbidden privacy field';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(export_rows->'rows') as row
    where row->>'member_name' = '''=出席社員'
      and row->>'event_title' = '''+原始簽到例會'
      and row->>'adjustment_reason' = '''@原始簽到優先'
  ) then raise exception 'CSV formula prefixes were not neutralized by the server projection'; end if;

  foreach nonregular_event_id in array array[
    '87000000-0000-4000-8000-000000000013'::uuid,
    '87000000-0000-4000-8000-000000000014'::uuid,
    '87000000-0000-4000-8000-000000000015'::uuid
  ] loop
    begin
      perform public.get_event_attendance_roster(
        '57000000-0000-4000-8000-000000000001', nonregular_event_id
      );
      raise exception 'non-regular event produced an attendance roster: %', nonregular_event_id;
    exception when no_data_found then
      null;
    end;
    begin
      perform public.export_event_attendance_csv(
        '57000000-0000-4000-8000-000000000001', nonregular_event_id
      );
      raise exception 'non-regular event produced an attendance CSV: %', nonregular_event_id;
    exception when no_data_found then
      null;
    end;
  end loop;
end $$;
reset role;

do $$
begin
  if public.attendance_csv_safe_cell('=formula') <> '''=formula'
     or public.attendance_csv_safe_cell('+formula') <> '''+formula'
     or public.attendance_csv_safe_cell('-formula') <> '''-formula'
     or public.attendance_csv_safe_cell('@formula') <> '''@formula'
     or public.attendance_csv_safe_cell(chr(9) || 'formula') <> '''' || chr(9) || 'formula'
     or public.attendance_csv_safe_cell(chr(13) || 'formula') <> '''' || chr(13) || 'formula' then
    raise exception 'CSV formula prefix regression';
  end if;
end $$;

-- Multi-club history keeps memberships independent; future suspended membership,
-- cancelled events, and counts_for_attendance=false never enter the denominator.
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000008', true);
do $$
declare clubs jsonb; a_summary jsonb; b_summary jsonb;
begin
  select jsonb_agg(to_jsonb(item)) into clubs from public.list_my_attendance_clubs() as item;
  if jsonb_array_length(clubs) <> 2 then raise exception 'multi-club person was not projected as distinct memberships'; end if;
  a_summary := public.get_my_attendance_summary('57000000-0000-4000-8000-000000000001', current_date - 30, current_date);
  b_summary := public.get_my_attendance_summary('57000000-0000-4000-8000-000000000002', current_date - 30, current_date);
  if (a_summary->>'denominator')::integer <> 7 or (b_summary->>'denominator')::integer <> 1 then
    raise exception 'multi-club attendance was not calculated per membership: %, %', a_summary, b_summary;
  end if;
end $$;
reset role;

do $immutable$
declare revoked_count integer; statement text;
begin
  if public.attendance_membership_is_eligible(
    '87000000-0000-4000-8000-000000000012',
    '67000000-0000-4000-8000-000000000006'
  ) then raise exception 'non-active membership entered a future denominator'; end if;

  if not exists (
    select 1 from public.event_attendances
    where id = '97000000-0000-4000-8000-000000000001'
      and attendance_status = 'active'
      and checkin_note = '原始簽到不可覆蓋'
  ) then raise exception 'adjustment overwrote original attendance'; end if;

  if not exists (
    select 1
    from public.attendance_result_for_member(
      '87000000-0000-4000-8000-000000000013',
      '67000000-0000-4000-8000-000000000002'
    ) as outcome
    where outcome.final_status = 'present'
      and not outcome.in_denominator
      and outcome.attendance_credit
  ) then
    raise exception 'non-regular raw check-in was lost or entered the denominator';
  end if;

  if not exists (
    select 1 from public.event_attendances
    where id = '97000000-0000-4000-8000-000000000002'
      and attendance_status = 'active'
      and checkin_note = '非例會原始簽到仍應保留'
  ) then raise exception 'non-regular raw attendance record was not retained'; end if;

  select count(*) into revoked_count
  from public.attendance_adjustments
  where event_id = '87000000-0000-4000-8000-000000000005'
    and membership_id = '67000000-0000-4000-8000-000000000002'
    and revoked_at is not null
    and revocation_reason = '重新確認社員資格';
  if revoked_count <> 1 then raise exception 'revoked adjustment history was not retained'; end if;

  begin
    delete from public.attendance_adjustments
    where event_id = '87000000-0000-4000-8000-000000000005';
    raise exception 'attendance adjustment was hard deleted';
  exception when insufficient_privilege then null;
  end;

  foreach statement in array array[
    $$update public.attendance_adjustments set id = '99000000-0000-4000-8000-000000000001' where event_id = '87000000-0000-4000-8000-000000000004'$$,
    $$update public.attendance_adjustments set club_id = '57000000-0000-4000-8000-000000000002' where event_id = '87000000-0000-4000-8000-000000000004'$$,
    $$update public.attendance_adjustments set event_id = '87000000-0000-4000-8000-000000000006' where event_id = '87000000-0000-4000-8000-000000000004'$$,
    $$update public.attendance_adjustments set membership_id = '67000000-0000-4000-8000-000000000003' where event_id = '87000000-0000-4000-8000-000000000004'$$,
    $$update public.attendance_adjustments set adjustment_type = 'makeup' where event_id = '87000000-0000-4000-8000-000000000004'$$,
    $$update public.attendance_adjustments set created_by_app_account_id = '37000000-0000-0000-0000-000000000003' where event_id = '87000000-0000-4000-8000-000000000004'$$,
    $$update public.attendance_adjustments set created_at = now() + interval '1 day' where event_id = '87000000-0000-4000-8000-000000000004'$$
  ] loop
    begin
      execute statement;
      raise exception 'attendance adjustment immutable field was changed: %', statement;
    exception when check_violation then null;
    end;
  end loop;

  begin
    insert into public.attendance_adjustments (
      club_id, event_id, membership_id, adjustment_type, reason, created_by_app_account_id
    ) values (
      '57000000-0000-4000-8000-000000000002',
      '87000000-0000-4000-8000-000000000001',
      '67000000-0000-4000-8000-000000000004',
      'leave', '跨社關聯', '37000000-0000-0000-0000-000000000001'
    );
    raise exception 'cross-club attendance adjustment was inserted';
  exception when foreign_key_violation then null;
  end;

  if not exists (
    select 1
    from public.audit_logs
    where action_key = 'attendance.adjustment_set'
      and actor_app_account_id = '37000000-0000-0000-0000-000000000001'
      and metadata ? 'event_id'
      and metadata ? 'membership_id'
      and metadata ? 'adjustment_type'
      and metadata->'reason' = jsonb_build_object('present', true, 'length', 7)
  ) then raise exception 'attendance adjustment create audit is incomplete'; end if;
  if not exists (
    select 1 from public.audit_logs
    where action_key = 'attendance.adjustment_revoked'
      and actor_app_account_id = '37000000-0000-0000-0000-000000000001'
      and metadata->'reason' = jsonb_build_object('present', true, 'length', 8)
  ) then raise exception 'attendance adjustment revoke audit is incomplete'; end if;
  if exists (
    select 1 from public.audit_logs
    where action_key like 'attendance.adjustment_%'
      and metadata::text like '%重新確認社員資格%'
  ) then raise exception 'attendance audit retained raw reason text'; end if;
end $immutable$;

rollback;
