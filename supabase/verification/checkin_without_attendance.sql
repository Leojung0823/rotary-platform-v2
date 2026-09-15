-- An event excluded from the attendance rate can still take check-ins, and the
-- rate does not move when it does.
-- Run only against Supabase local. All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '1c000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'uncounted-manager@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1c000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'uncounted-member@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('2c000000-0000-0000-0000-000000000001', '不計出席管理者', 'uncounted-manager@example.test'),
  ('2c000000-0000-0000-0000-000000000002', '不計出席社員', 'uncounted-member@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('3c000000-0000-0000-0000-000000000001', '1c000000-0000-0000-0000-000000000001', '2c000000-0000-0000-0000-000000000001', 'uncounted-manager@example.test', '不計出席管理者', 'active'),
  ('3c000000-0000-0000-0000-000000000002', '1c000000-0000-0000-0000-000000000002', '2c000000-0000-0000-0000-000000000002', 'uncounted-member@example.test', '不計出席社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('5c000000-0000-4000-8000-000000000001', 'UNCOUNTED', '不計出席測試社', 'active', now());

-- joined_on is set explicitly: attendance_membership_is_eligible compares it
-- against the event date, and a member who joined today is not eligible for a
-- meeting that started an hour ago -- which would empty the denominator and
-- make the rate assertion below prove nothing.
insert into public.club_memberships (id, club_id, person_id, membership_status, joined_on) values
  ('6c000000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000001', '2c000000-0000-0000-0000-000000000001', 'active', current_date - 30),
  ('6c000000-0000-4000-8000-000000000002', '5c000000-0000-4000-8000-000000000001', '2c000000-0000-0000-0000-000000000002', 'active', current_date - 30);

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values
  ('7c000000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000001', '3c000000-0000-0000-0000-000000000001', 'president', 'active', '3c000000-0000-0000-0000-000000000001');

-- Two events that have already started: one ordinary counted regular meeting,
-- and one that is deliberately outside the attendance rate.
insert into public.club_events (
  id, club_id, event_type, title, starts_at, ends_at, registration_deadline,
  counts_for_attendance, event_status, created_by_app_account_id,
  updated_by_app_account_id, published_at
) values
  (
    '8c000000-0000-4000-8000-000000000001',
    '5c000000-0000-4000-8000-000000000001',
    'regular_meeting', '計入出席的例會',
    now() - interval '1 hour', now() + interval '1 hour', now() - interval '2 hours',
    true, 'published',
    '3c000000-0000-0000-0000-000000000001', '3c000000-0000-0000-0000-000000000001', now()
  ),
  (
    '8c000000-0000-4000-8000-000000000002',
    '5c000000-0000-4000-8000-000000000001',
    'regular_meeting', '不計入出席的活動',
    now() - interval '1 hour', now() + interval '1 hour', now() - interval '2 hours',
    false, 'published',
    '3c000000-0000-0000-0000-000000000001', '3c000000-0000-0000-0000-000000000001', now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-0000-0000-000000000001', true);

-- The whole point: opening check-in on an event that does not count used to
-- raise event_not_checkin_eligible.
do $$
begin
  perform public.open_event_checkin(
    '5c000000-0000-4000-8000-000000000001',
    '8c000000-0000-4000-8000-000000000002',
    60
  );
exception when others then
  raise exception 'check-in could not be opened on an uncounted event: % (%)', sqlerrm, sqlstate;
end;
$$;

-- And the officer can record who turned up.
do $$
begin
  perform public.manual_check_in_event(
    '5c000000-0000-4000-8000-000000000001',
    '8c000000-0000-4000-8000-000000000002',
    '6c000000-0000-4000-8000-000000000002',
    '現場出席'
  );
exception when others then
  raise exception 'a manual check-in was refused on an uncounted event: % (%)', sqlerrm, sqlstate;
end;
$$;

do $$
declare
  overview jsonb;
begin
  overview := public.get_event_checkin_overview(
    '5c000000-0000-4000-8000-000000000001',
    '8c000000-0000-4000-8000-000000000002'
  );
  if not (overview -> 'members') @> '[{"membership_id": "6c000000-0000-4000-8000-000000000002", "checked_in": true}]'::jsonb then
    raise exception 'the uncounted event does not show who attended: %', overview;
  end if;
end;
$$;

-- The rate is the other half of the promise, and it is asked through the real
-- RPC rather than a hand-rolled count: two active members and two started
-- regular meetings, of which exactly one counts. The denominator must be 2, not
-- 4, and nobody checked into the counted meeting so `attended` must be 0 even
-- though an attendance row now exists in this club.
--
-- This is what fails if someone later "simplifies" the rate by dropping
-- counts_for_attendance from it the way this migration drops it from check-in.
do $$
declare
  summary jsonb;
begin
  summary := public.get_club_attendance_summary(
    '5c000000-0000-4000-8000-000000000001',
    (current_date - 7)::date,
    (current_date + 1)::date
  );
  if (summary ->> 'denominator')::int <> 2 then
    raise exception 'the uncounted event entered the attendance denominator: %', summary;
  end if;
  if (summary ->> 'attended')::int <> 0 then
    raise exception 'an uncounted check-in was credited to the attendance rate: %', summary;
  end if;
end;
$$;

reset role;

-- A cancelled event still has no check-in: dropping counts_for_attendance from
-- the gate must not have dropped the published check with it.
update public.club_events
set event_status = 'cancelled', cancelled_at = now(), cancellation_reason = '測試'
where id = '8c000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-0000-0000-000000000001', true);

do $$
begin
  perform public.open_event_checkin(
    '5c000000-0000-4000-8000-000000000001',
    '8c000000-0000-4000-8000-000000000001',
    60
  );
  raise exception 'check-in opened on a cancelled event';
exception when sqlstate '22023' then
  null;
end;
$$;

reset role;

rollback;
