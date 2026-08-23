-- Attendance page projection verification: club scoping, manage-only access,
-- and the roster guard that keeps a forged event id from raising or leaking.
-- Run only against Supabase local. All synthetic fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '1a000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'att-page-manager@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1a000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'att-page-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1a000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'att-page-cross@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('2a000000-0000-4000-8000-000000000001', '投影管理者', 'att-page-manager@example.test'),
  ('2a000000-0000-4000-8000-000000000002', '投影社員', 'att-page-member@example.test'),
  ('2a000000-0000-4000-8000-000000000003', '投影外社社員', 'att-page-cross@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('3a000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', 'att-page-manager@example.test', '投影管理者', 'active'),
  ('3a000000-0000-4000-8000-000000000002', '1a000000-0000-4000-8000-000000000002', '2a000000-0000-4000-8000-000000000002', 'att-page-member@example.test', '投影社員', 'active'),
  ('3a000000-0000-4000-8000-000000000003', '1a000000-0000-4000-8000-000000000003', '2a000000-0000-4000-8000-000000000003', 'att-page-cross@example.test', '投影外社社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at, suspended_at) values
  ('5a000000-0000-4000-8000-000000000001', 'ATP-A', '投影測試甲社', 'active', now(), null),
  ('5a000000-0000-4000-8000-000000000002', 'ATP-B', '投影測試乙社', 'active', now(), null);

insert into public.club_memberships (
  id, club_id, person_id, membership_status, joined_on, ended_on
) values
  ('6a000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', 'active', current_date - 1000, null),
  ('6a000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000002', 'active', current_date - 1000, null),
  ('6a000000-0000-4000-8000-000000000003', '5a000000-0000-4000-8000-000000000002', '2a000000-0000-4000-8000-000000000003', 'active', current_date - 1000, null);

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values
  ('7a000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000001', '3a000000-0000-4000-8000-000000000001', 'president', 'active', '3a000000-0000-4000-8000-000000000001');

-- One regular meeting in each club, plus all non-regular event types in club A.
-- Fixed dates rather than
-- now()-relative ones so the assertions below do not depend on which side of
-- 1 July the verification happens to run on.
insert into public.club_events (
  id, club_id, event_type, title, starts_at, ends_at, registration_deadline,
  counts_for_attendance, event_status, created_by_app_account_id,
  updated_by_app_account_id, published_at, cancelled_at, cancellation_reason
) values
  ('8a000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000001', 'regular_meeting', '投影甲社例會',
   timestamptz '2026-03-10 10:00+08', timestamptz '2026-03-10 12:00+08', timestamptz '2026-03-09 10:00+08',
   true, 'completed', '3a000000-0000-4000-8000-000000000001', '3a000000-0000-4000-8000-000000000001', timestamptz '2026-03-01 10:00+08', null, null),
  ('8a000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-000000000002', 'regular_meeting', '投影乙社例會',
   timestamptz '2026-03-11 10:00+08', timestamptz '2026-03-11 12:00+08', timestamptz '2026-03-10 10:00+08',
   true, 'completed', '3a000000-0000-4000-8000-000000000001', '3a000000-0000-4000-8000-000000000001', timestamptz '2026-03-01 10:00+08', null, null),
  ('8a000000-0000-4000-8000-000000000003', '5a000000-0000-4000-8000-000000000001', 'service', '不計出席活動',
   timestamptz '2026-03-12 10:00+08', timestamptz '2026-03-12 12:00+08', timestamptz '2026-03-11 10:00+08',
   false, 'completed', '3a000000-0000-4000-8000-000000000001', '3a000000-0000-4000-8000-000000000001', timestamptz '2026-03-01 10:00+08', null, null),
  ('8a000000-0000-4000-8000-000000000004', '5a000000-0000-4000-8000-000000000001', 'other', '其他活動仍勾選出席',
   timestamptz '2026-03-13 10:00+08', timestamptz '2026-03-13 12:00+08', timestamptz '2026-03-12 10:00+08',
   true, 'completed', '3a000000-0000-4000-8000-000000000001', '3a000000-0000-4000-8000-000000000001', timestamptz '2026-03-01 10:00+08', null, null),
  ('8a000000-0000-4000-8000-000000000005', '5a000000-0000-4000-8000-000000000001', 'service', '服務活動仍勾選出席',
   timestamptz '2026-03-14 10:00+08', timestamptz '2026-03-14 12:00+08', timestamptz '2026-03-13 10:00+08',
   true, 'completed', '3a000000-0000-4000-8000-000000000001', '3a000000-0000-4000-8000-000000000001', timestamptz '2026-03-01 10:00+08', null, null),
  ('8a000000-0000-4000-8000-000000000006', '5a000000-0000-4000-8000-000000000001', 'board_meeting', '理事會仍勾選出席',
   timestamptz '2026-03-15 10:00+08', timestamptz '2026-03-15 12:00+08', timestamptz '2026-03-14 10:00+08',
   true, 'completed', '3a000000-0000-4000-8000-000000000001', '3a000000-0000-4000-8000-000000000001', timestamptz '2026-03-01 10:00+08', null, null);

-- The projection functions must not be reachable without a session.
do $grants$
begin
  if has_function_privilege('anon', 'public.get_my_attendance_page(uuid, date, date)', 'execute')
     or has_function_privilege('anon', 'public.get_club_attendance_page(uuid, date, date, uuid)', 'execute')
     or has_function_privilege('anon', 'public.list_club_attendance_events(uuid, date, date)', 'execute')
     or has_function_privilege('anon', 'public.current_rotary_year_start(date)', 'execute') then
    raise exception 'Attendance projection functions are executable by anon.';
  end if;
end $grants$;

-- A plain member holds no attendance.manage anywhere.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1a000000-0000-4000-8000-000000000002', true);
do $member$
declare
  page jsonb;
begin
  page := public.get_club_attendance_page(
    '5a000000-0000-4000-8000-000000000001', date '2026-03-01', date '2026-03-31', null
  );
  if jsonb_array_length(page -> 'clubs') <> 0 then
    raise exception 'Plain member was offered a club to manage attendance for.';
  end if;
  if page ->> 'selected_club_id' is not null or page -> 'roster' <> 'null'::jsonb then
    raise exception 'Plain member received attendance management data.';
  end if;

  begin
    perform public.list_club_attendance_events(
      '5a000000-0000-4000-8000-000000000001', date '2026-03-01', date '2026-03-31'
    );
    raise exception 'Plain member listed attendance events directly.';
  exception when insufficient_privilege then
    null;
  end;

  -- The member's own attendance is scoped to the club they belong to.
  page := public.get_my_attendance_page(null, date '2026-03-01', date '2026-03-31');
  if jsonb_array_length(page -> 'clubs') <> 1
     or page -> 'clubs' -> 0 ->> 'club_id' <> '5a000000-0000-4000-8000-000000000001' then
    raise exception 'Member attendance club list was not scoped to their own club.';
  end if;
  if (page -> 'summary') = 'null'::jsonb
     or (page -> 'summary' ->> 'denominator')::integer <> 1 then
    raise exception 'Member summary included a non-regular event: %', page -> 'summary';
  end if;

  -- Asking for another club must not switch the answer to that club.
  page := public.get_my_attendance_page(
    '5a000000-0000-4000-8000-000000000002', date '2026-03-01', date '2026-03-31'
  );
  if page ->> 'selected_club_id' <> '5a000000-0000-4000-8000-000000000001' then
    raise exception 'Member attendance page honoured a club they do not belong to.';
  end if;
end $member$;
reset role;

-- A member of the other club must not see club A at all.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1a000000-0000-4000-8000-000000000003', true);
do $cross$
declare
  page jsonb;
begin
  page := public.get_my_attendance_page(
    '5a000000-0000-4000-8000-000000000001', date '2026-03-01', date '2026-03-31'
  );
  if page::text like '%5a000000-0000-4000-8000-000000000001%' then
    raise exception 'Cross-club member saw another club in the attendance projection.';
  end if;
end $cross$;
reset role;

-- The president holds attendance.manage on club A only.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1a000000-0000-4000-8000-000000000001', true);
do $manager$
declare
  page jsonb;
  events jsonb;
  nonregular_event_id uuid;
begin
  page := public.get_club_attendance_page(
    null, date '2026-03-01', date '2026-03-31', null
  );
  if jsonb_array_length(page -> 'clubs') <> 1
     or page -> 'clubs' -> 0 ->> 'club_id' <> '5a000000-0000-4000-8000-000000000001' then
    raise exception 'Manager attendance page was not scoped to the managed club.';
  end if;
  if (page -> 'summary') = 'null'::jsonb
     or (page -> 'summary' ->> 'denominator')::integer <> 2 then
    raise exception 'Manager summary included a non-regular event: %', page -> 'summary';
  end if;

  events := page -> 'events';
  if jsonb_array_length(events) <> 1
     or events -> 0 ->> 'event_id' <> '8a000000-0000-4000-8000-000000000001' then
    raise exception 'Attendance event list did not contain exactly the eligible event.';
  end if;
  if events::text like '%8a000000-0000-4000-8000-000000000003%'
     or events::text like '%8a000000-0000-4000-8000-000000000004%'
     or events::text like '%8a000000-0000-4000-8000-000000000005%'
     or events::text like '%8a000000-0000-4000-8000-000000000006%' then
    raise exception 'A non-regular event was listed for Attendance.';
  end if;

  -- A listed event yields a roster.
  page := public.get_club_attendance_page(
    '5a000000-0000-4000-8000-000000000001', date '2026-03-01', date '2026-03-31',
    '8a000000-0000-4000-8000-000000000001'
  );
  if page ->> 'selected_event_id' <> '8a000000-0000-4000-8000-000000000001'
     or (page -> 'roster') = 'null'::jsonb then
    raise exception 'Roster was not returned for an event the same call listed.';
  end if;

  foreach nonregular_event_id in array array[
    '8a000000-0000-4000-8000-000000000004'::uuid,
    '8a000000-0000-4000-8000-000000000005'::uuid,
    '8a000000-0000-4000-8000-000000000006'::uuid
  ] loop
    page := public.get_club_attendance_page(
      '5a000000-0000-4000-8000-000000000001', date '2026-03-01', date '2026-03-31',
      nonregular_event_id
    );
    if page ->> 'selected_event_id' is not null or (page -> 'roster') <> 'null'::jsonb then
      raise exception 'A non-regular event id produced a roster: %', nonregular_event_id;
    end if;
  end loop;

  -- An event id belonging to another club must produce no roster, and must not
  -- raise: the page has to render rather than fail on a stale or forged id.
  page := public.get_club_attendance_page(
    '5a000000-0000-4000-8000-000000000001', date '2026-03-01', date '2026-03-31',
    '8a000000-0000-4000-8000-000000000002'
  );
  if page ->> 'selected_event_id' is not null or (page -> 'roster') <> 'null'::jsonb then
    raise exception 'A cross-club event id produced a roster.';
  end if;

  -- Requesting a club the manager does not manage must fall back to one they do.
  page := public.get_club_attendance_page(
    '5a000000-0000-4000-8000-000000000002', date '2026-03-01', date '2026-03-31', null
  );
  if page ->> 'selected_club_id' <> '5a000000-0000-4000-8000-000000000001' then
    raise exception 'Manager page honoured an unmanaged club id.';
  end if;

  -- The database still enforces its own range limit through the wrapper.
  begin
    perform public.get_club_attendance_page(
      '5a000000-0000-4000-8000-000000000001', date '2025-01-01', date '2026-12-31', null
    );
    raise exception 'An over-long attendance range was accepted.';
  exception when invalid_parameter_value then
    null;
  end;
end $manager$;
reset role;

-- The Rotary year default the pages rely on.
do $rotary$
begin
  if public.current_rotary_year_start(date '2026-08-21') <> date '2026-07-01'
     or public.current_rotary_year_start(date '2026-07-01') <> date '2026-07-01'
     or public.current_rotary_year_start(date '2026-06-30') <> date '2025-07-01' then
    raise exception 'Rotary year start is not 1 July.';
  end if;
  if not public.attendance_date_range_is_valid(
    public.current_rotary_year_start(date '2027-06-30'), date '2027-06-30'
  ) then
    raise exception 'A full Rotary year is rejected by the attendance range check.';
  end if;
end $rotary$;

rollback;
