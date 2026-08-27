-- Attendance page defaults must use the selected club's local calendar date.
-- Run only against Supabase local. All synthetic fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '1b000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'att-local-date@example.test', '', now(),
  '{}', '{}', now(), now()
), (
  '00000000-0000-0000-0000-000000000000',
  '1b000000-0000-4000-8000-000000000002',
  'authenticated', 'authenticated', 'att-local-date-outsider@example.test', '', now(),
  '{}', '{}', now(), now()
);

insert into public.people (id, canonical_name, primary_email) values
  ('2b000000-0000-4000-8000-000000000001', '時區測試社員', 'att-local-date@example.test'),
  ('2b000000-0000-4000-8000-000000000002', '時區測試外部帳號', 'att-local-date-outsider@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values (
  '3b000000-0000-4000-8000-000000000001',
  '1b000000-0000-4000-8000-000000000001',
  '2b000000-0000-4000-8000-000000000001',
  'att-local-date@example.test', '時區測試社員', 'active'
), (
  '3b000000-0000-4000-8000-000000000002',
  '1b000000-0000-4000-8000-000000000002',
  '2b000000-0000-4000-8000-000000000002',
  'att-local-date-outsider@example.test', '時區測試外部帳號', 'active'
);

insert into public.clubs (
  id, club_code, club_name, timezone_name, club_status, activated_at
) values (
  '5b000000-0000-4000-8000-000000000001',
  'ATT-TZ', '出席時區測試社', 'Asia/Taipei', 'active', now()
);

insert into public.club_memberships (
  id, club_id, person_id, membership_status, joined_on, ended_on
) values (
  '6b000000-0000-4000-8000-000000000001',
  '5b000000-0000-4000-8000-000000000001',
  '2b000000-0000-4000-8000-000000000001',
  'active', current_date - 1000, null
);

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values (
  '7b000000-0000-4000-8000-000000000001',
  '5b000000-0000-4000-8000-000000000001',
  '3b000000-0000-4000-8000-000000000001',
  'president', 'active', '3b000000-0000-4000-8000-000000000001'
);

do $grants$
begin
  if has_function_privilege('anon', 'public.current_attendance_club_local_date(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.current_attendance_club_local_date(uuid)', 'execute')
     or has_function_privilege('anon', 'public.get_my_attendance_page(uuid, date, date)', 'execute')
     or has_function_privilege('anon', 'public.get_club_attendance_page(uuid, date, date, uuid)', 'execute') then
    raise exception 'Attendance page projections are executable by anon.';
  end if;
end $grants$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '1b000000-0000-4000-8000-000000000001', true);

do $local_date$
declare
  my_page jsonb;
  club_page jsonb;
  expected_today date := (now() at time zone 'Asia/Taipei')::date;
begin
  my_page := public.get_my_attendance_page(null, null, null);
  club_page := public.get_club_attendance_page(null, null, null, null);

  if my_page ->> 'date_to' <> expected_today::text
     or club_page ->> 'date_to' <> expected_today::text then
    raise exception 'Attendance page did not use the club local date: my %, club %, expected %',
      my_page ->> 'date_to', club_page ->> 'date_to', expected_today;
  end if;
  if my_page ->> 'date_from' <> public.current_rotary_year_start(expected_today)::text
     or club_page ->> 'date_from' <> public.current_rotary_year_start(expected_today)::text then
    raise exception 'Attendance page did not derive the Rotary year from the club local date.';
  end if;
  if my_page ->> 'selected_club_id' <> '5b000000-0000-4000-8000-000000000001'
     or club_page ->> 'selected_club_id' <> '5b000000-0000-4000-8000-000000000001' then
    raise exception 'Attendance page selected the wrong club.';
  end if;

  if public.current_attendance_club_local_date('5b000000-0000-4000-8000-000000000001') <> expected_today then
    raise exception 'Local-date helper returned the wrong date.';
  end if;
end $local_date$;

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '1b000000-0000-4000-8000-000000000002', true);
do $outsider$
begin
  begin
    perform public.current_attendance_club_local_date('5b000000-0000-4000-8000-000000000001');
    raise exception 'An unrelated account read the club local date.';
  exception when insufficient_privilege then
    null;
  end;
end $outsider$;
reset role;

rollback;
