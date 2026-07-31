-- V0.8 attendance adjustment, statistics, export, tenant, and lifecycle verification.
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
  ('00000000-0000-0000-0000-000000000000', '17000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'attendance-operator@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('27000000-0000-0000-0000-000000000001', '出席管理者', 'attendance-manager@example.test'),
  ('27000000-0000-0000-0000-000000000002', '=出席社員', 'attendance-member@example.test'),
  ('27000000-0000-0000-0000-000000000003', '第二社員', 'attendance-other@example.test'),
  ('27000000-0000-0000-0000-000000000004', '外社社員', 'attendance-cross@example.test'),
  ('27000000-0000-0000-0000-000000000005', '停權帳號社員', 'attendance-suspended-account@example.test'),
  ('27000000-0000-0000-0000-000000000006', '停權社籍社員', 'attendance-suspended-membership@example.test'),
  ('27000000-0000-0000-0000-000000000007', '執行秘書', 'attendance-operator@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('37000000-0000-0000-0000-000000000001', '17000000-0000-0000-0000-000000000001', '27000000-0000-0000-0000-000000000001', 'attendance-manager@example.test', '出席管理者', 'active'),
  ('37000000-0000-0000-0000-000000000002', '17000000-0000-0000-0000-000000000002', '27000000-0000-0000-0000-000000000002', 'attendance-member@example.test', '=出席社員', 'active'),
  ('37000000-0000-0000-0000-000000000003', '17000000-0000-0000-0000-000000000003', '27000000-0000-0000-0000-000000000003', 'attendance-other@example.test', '第二社員', 'active'),
  ('37000000-0000-0000-0000-000000000004', '17000000-0000-0000-0000-000000000004', '27000000-0000-0000-0000-000000000004', 'attendance-cross@example.test', '外社社員', 'active'),
  ('37000000-0000-0000-0000-000000000005', '17000000-0000-0000-0000-000000000005', '27000000-0000-0000-0000-000000000005', 'attendance-suspended-account@example.test', '停權帳號社員', 'suspended'),
  ('37000000-0000-0000-0000-000000000006', '17000000-0000-0000-0000-000000000006', '27000000-0000-0000-0000-000000000006', 'attendance-suspended-membership@example.test', '停權社籍社員', 'active'),
  ('37000000-0000-0000-0000-000000000007', '17000000-0000-0000-0000-000000000007', '27000000-0000-0000-0000-000000000007', 'attendance-operator@example.test', '執行秘書', 'active');

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
  ('67000000-0000-4000-8000-000000000007', '57000000-0000-4000-8000-000000000003', '27000000-0000-0000-0000-000000000001', 'active', current_date - 1000, null);

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
  ('87000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000001', 'regular_meeting', '原始簽到例會', now() - interval '14 days', now() - interval '14 days' + interval '2 hours', now() - interval '15 days', true, 'completed', '37000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', now() - interval '20 days', null, null),
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
  ('87000000-0000-4000-8000-000000000012', '57000000-0000-4000-8000-000000000001', 'regular_meeting', '未來資格例會', now() + interval '10 days', now() + interval '10 days' + interval '2 hours', now() + interval '9 days', true, 'published', '37000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', now(), null, null);

insert into public.event_attendances (
  id, club_id, event_id, membership_id, checkin_method,
  checked_in_by_app_account_id, checkin_note, checked_in_at
) values (
  '97000000-0000-4000-8000-000000000001',
  '57000000-0000-4000-8000-000000000001',
  '87000000-0000-4000-8000-000000000001',
  '67000000-0000-4000-8000-000000000002',
  'manual', '37000000-0000-0000-0000-000000000001', '原始簽到不可覆蓋', now() - interval '14 days'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000001', true);
do $$
declare created jsonb; duplicate_rejected boolean := false;
begin
  perform public.set_attendance_adjustment('57000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001', '67000000-0000-4000-8000-000000000002', 'exempt', '原始簽到優先');
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
end $$;
reset role;

-- The explicit V0.8 policy excludes official leave from the denominator.
do $$
begin
  if public.attendance_official_leave_counts_in_denominator() then
    raise exception 'official leave policy unexpectedly counts in denominator';
  end if;
end;
$$;

-- Ordinary members can read only their own bounded history and summary.
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
  if history::text like '%取消例會%' then raise exception 'cancelled event entered attendance statistics'; end if;
  if history::text like '%不計出席活動%' then raise exception 'counts_for_attendance false event entered denominator'; end if;
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
end $$;
reset role;

-- Cross-club, suspended account, and suspended membership reads fail closed.
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

-- A suspended club blocks management mutations even when historical role rows remain.
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000001', true);
do $$ begin
  begin
    perform public.set_attendance_adjustment('57000000-0000-4000-8000-000000000003', '87000000-0000-4000-8000-000000000011', '67000000-0000-4000-8000-000000000007', 'leave', '停權社異動');
    raise exception 'suspended club accepted an attendance mutation';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Roster, club summary, export privacy, operator exclusion, and history preservation.
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000001', true);
do $$
declare roster jsonb; club_summary jsonb; export_rows jsonb; exported_text text;
begin
  roster := public.get_event_attendance_roster('57000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001');
  if jsonb_array_length(roster->'members') <> 5 then
    raise exception 'roster included operator or excluded eligible club membership';
  end if;
  if roster::text like '%執行秘書%' then raise exception 'executive secretary entered member denominator'; end if;
  if not exists (
    select 1 from jsonb_array_elements(roster->'members') as member
    where member->>'membership_id' = '67000000-0000-4000-8000-000000000002'
      and member->>'final_status' = 'present'
      and (member->>'in_denominator')::boolean
      and member->>'raw_checkin_method' = 'manual'
      and member->>'adjustment_type' = 'exempt'
  ) then raise exception 'original attendance did not retain priority over adjustment'; end if;

  club_summary := public.get_club_attendance_summary('57000000-0000-4000-8000-000000000001', current_date - 30, current_date);
  if (club_summary->>'pending_absences')::integer = 0
     or (club_summary->>'unconfirmed_records')::integer = 0 then
    raise exception 'club dashboard summary omitted pending or unconfirmed records';
  end if;

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

  begin
    perform public.get_event_attendance_roster('57000000-0000-4000-8000-000000000002', '87000000-0000-4000-8000-000000000010');
    raise exception 'Club A manager read Club B roster';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$
declare revoked_count integer;
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

  begin
    update public.attendance_adjustments
    set club_id = '57000000-0000-4000-8000-000000000002'
    where event_id = '87000000-0000-4000-8000-000000000004'
      and membership_id = '67000000-0000-4000-8000-000000000002';
    raise exception 'immutable tenant field was changed';
  exception when check_violation then null;
  end;

  begin
    insert into public.attendance_adjustments (
      club_id, event_id, membership_id, adjustment_type, reason,
      effective_status, created_by_app_account_id
    ) values (
      '57000000-0000-4000-8000-000000000002',
      '87000000-0000-4000-8000-000000000001',
      '67000000-0000-4000-8000-000000000004',
      'leave', '跨社關聯', 'leave', '37000000-0000-0000-0000-000000000001'
    );
    raise exception 'cross-club attendance adjustment was inserted';
  exception when foreign_key_violation then null;
  end;

  if not exists (select 1 from public.audit_logs where action_key = 'attendance.adjustment_set')
     or not exists (select 1 from public.audit_logs where action_key = 'attendance.adjustment_revoked') then
    raise exception 'attendance adjustment mutation audit is missing';
  end if;
end $$;

rollback;
