-- 沒有設報名截止的活動，在活動結束前都還能報名。
-- Run only against Supabase local. All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '2a000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'deadline-member@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('2b000000-0000-0000-0000-000000000001', '截止測試社員', 'deadline-member@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('2c100000-0000-0000-0000-000000000001', '2a000000-0000-0000-0000-000000000001', '2b000000-0000-0000-0000-000000000001', 'deadline-member@example.test', '截止測試社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('2d100000-0000-4000-8000-000000000001', 'DEADLINE', '截止測試社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status, joined_on) values
  ('2e100000-0000-4000-8000-000000000001', '2d100000-0000-4000-8000-000000000001', '2b000000-0000-0000-0000-000000000001', 'active', current_date - 30);

-- Already started, ending in an hour. With a deadline it would be closed; with
-- none it is the whole point of the change.
insert into public.club_events (
  id, club_id, event_type, title, starts_at, ends_at, registration_deadline,
  counts_for_attendance, event_status, created_by_app_account_id,
  updated_by_app_account_id, published_at
) values
  ('2f100000-0000-4000-8000-000000000001', '2d100000-0000-4000-8000-000000000001', 'regular_meeting', '沒有截止的例會', now() - interval '30 minutes', now() + interval '1 hour', null, true, 'published', '2c100000-0000-0000-0000-000000000001', '2c100000-0000-0000-0000-000000000001', now() - interval '1 day'),
  ('2f100000-0000-4000-8000-000000000002', '2d100000-0000-4000-8000-000000000001', 'regular_meeting', '截止已過的例會', now() + interval '2 hours', now() + interval '4 hours', now() - interval '10 minutes', true, 'published', '2c100000-0000-0000-0000-000000000001', '2c100000-0000-0000-0000-000000000001', now() - interval '1 day');

do $$
begin
  -- The column takes a blank, which it did not before.
  if (select registration_deadline from public.club_events
      where id = '2f100000-0000-4000-8000-000000000001') is not null then
    raise exception 'the blank deadline was not stored as null';
  end if;

  if not public.event_registration_is_open(null, now() - interval '30 minutes', now() + interval '1 hour') then
    raise exception 'a blank deadline closed registration before the event ended';
  end if;
  if public.event_registration_is_open(null, now() - interval '2 hours', now() - interval '1 hour') then
    raise exception 'a blank deadline kept registration open after the event ended';
  end if;

  -- Exactly the old behaviour when a deadline is set, including the instant it
  -- falls on.
  if not public.event_registration_is_open(now(), now() + interval '1 hour', now() + interval '2 hours') then
    raise exception 'registration closed one instant early at the deadline itself';
  end if;
  if public.event_registration_is_open(now() + interval '10 minutes', now() - interval '1 minute', now() + interval '1 hour') then
    raise exception 'registration stayed open for an event already under way';
  end if;

  if public.event_registration_closes_at(null, now() + interval '1 hour') <> now() + interval '1 hour' then
    raise exception 'a blank deadline does not count down to the end of the event';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '2a000000-0000-0000-0000-000000000001', true);

-- The event with no deadline takes a registration even though it has started.
do $$
begin
  perform public.set_my_event_registration(
    '2d100000-0000-4000-8000-000000000001',
    '2f100000-0000-4000-8000-000000000001',
    'attending', 0, ''
  );
exception when others then
  raise exception 'registration was refused for an event with no deadline: % (%)', sqlerrm, sqlstate;
end;
$$;

-- The one whose deadline has passed still refuses.
do $$
begin
  perform public.set_my_event_registration(
    '2d100000-0000-4000-8000-000000000001',
    '2f100000-0000-4000-8000-000000000002',
    'attending', 0, ''
  );
  raise exception 'registration was accepted after the deadline';
exception when sqlstate '22023' then
  null;
end;
$$;

reset role;

rollback;
