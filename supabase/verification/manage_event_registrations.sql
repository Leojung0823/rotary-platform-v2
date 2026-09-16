-- 幹部可以看見並代為更新報名，但只在自己的社、只對被邀請的人。
-- Run only against Supabase local. All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '3a000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'roster-officer@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3a000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'roster-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3a000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'roster-quiet@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('3b000000-0000-0000-0000-000000000001', '名單社長', 'roster-officer@example.test'),
  ('3b000000-0000-0000-0000-000000000002', '有回覆社友', 'roster-member@example.test'),
  ('3b000000-0000-0000-0000-000000000003', '沒回覆社友', 'roster-quiet@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('3c200000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001', '3b000000-0000-0000-0000-000000000001', 'roster-officer@example.test', '名單社長', 'active'),
  ('3c200000-0000-0000-0000-000000000002', '3a000000-0000-0000-0000-000000000002', '3b000000-0000-0000-0000-000000000002', 'roster-member@example.test', '有回覆社友', 'active'),
  ('3c200000-0000-0000-0000-000000000003', '3a000000-0000-0000-0000-000000000003', '3b000000-0000-0000-0000-000000000003', 'roster-quiet@example.test', '沒回覆社友', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('3d200000-0000-4000-8000-000000000001', 'ROSTER', '名單測試社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status, joined_on) values
  ('3e200000-0000-4000-8000-000000000001', '3d200000-0000-4000-8000-000000000001', '3b000000-0000-0000-0000-000000000001', 'active', current_date - 300),
  ('3e200000-0000-4000-8000-000000000002', '3d200000-0000-4000-8000-000000000001', '3b000000-0000-0000-0000-000000000002', 'active', current_date - 300),
  ('3e200000-0000-4000-8000-000000000003', '3d200000-0000-4000-8000-000000000001', '3b000000-0000-0000-0000-000000000003', 'active', current_date - 300);

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values
  ('3f200000-0000-4000-8000-000000000001', '3d200000-0000-4000-8000-000000000001', '3c200000-0000-0000-0000-000000000001', 'president', 'active', '3c200000-0000-0000-0000-000000000001');

-- The deadline has already passed: answering for a member who phones an hour
-- before the meeting is the case this exists for.
insert into public.club_events (
  id, club_id, event_type, title, starts_at, ends_at, registration_deadline,
  counts_for_attendance, event_status, created_by_app_account_id,
  updated_by_app_account_id, published_at, capacity
) values
  ('4a200000-0000-4000-8000-000000000001', '3d200000-0000-4000-8000-000000000001', 'regular_meeting', '名單測試例會', now() + interval '1 hour', now() + interval '3 hours', now() - interval '10 minutes', true, 'published', '3c200000-0000-0000-0000-000000000001', '3c200000-0000-0000-0000-000000000001', now() - interval '1 day', 3);

create table public.roster_test_state (key text primary key, value jsonb not null);
grant select, insert on public.roster_test_state to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '3a000000-0000-0000-0000-000000000001', true);

-- Answering for a member after the deadline, which is the point.
do $$
begin
  perform public.set_event_registration_for_member(
    '3d200000-0000-4000-8000-000000000001',
    '4a200000-0000-4000-8000-000000000001',
    '3e200000-0000-4000-8000-000000000002',
    'attending', 1, '來電告知會帶一位眷屬'
  );
exception when others then
  raise exception 'the officer could not answer for a member: % (%)', sqlerrm, sqlstate;
end;
$$;

-- Without a reason it is refused: this is a change made on someone's behalf.
do $$
begin
  perform public.set_event_registration_for_member(
    '3d200000-0000-4000-8000-000000000001',
    '4a200000-0000-4000-8000-000000000001',
    '3e200000-0000-4000-8000-000000000003',
    'declined', 0, '   '
  );
  raise exception 'an officer answered for a member with no reason given';
exception when sqlstate '22023' then
  null;
end;
$$;

-- Capacity still holds: 3 spots, 2 used by the entry above.
do $$
begin
  perform public.set_event_registration_for_member(
    '3d200000-0000-4000-8000-000000000001',
    '4a200000-0000-4000-8000-000000000001',
    '3e200000-0000-4000-8000-000000000003',
    'attending', 5, '想帶五位'
  );
  raise exception 'capacity was ignored when an officer answered';
exception when sqlstate '23514' then
  null;
end;
$$;

insert into public.roster_test_state (key, value)
values ('roster', public.list_club_event_registrations(
  '3d200000-0000-4000-8000-000000000001', '4a200000-0000-4000-8000-000000000001'));

reset role;

do $$
declare
  roster jsonb;
begin
  select value into roster from public.roster_test_state where key = 'roster';

  -- Everyone who was asked, not only those who replied.
  if jsonb_array_length(roster -> 'members') <> 3 then
    raise exception 'the roster does not list every member who was asked: %', roster;
  end if;
  if (roster)::text not like '%no_reply%' then
    raise exception 'a member who never answered is missing from the roster: %', roster;
  end if;

  -- The officer's entry landed, with the reason visible to the member.
  if not (roster -> 'members') @> '[{"response": "attending", "guest_count": 1, "note": "來電告知會帶一位眷屬"}]'::jsonb then
    raise exception 'the officer entry is not on the roster: %', roster;
  end if;

  -- It is recorded as the officer's doing, with the reason.
  if not exists (
    select 1 from public.audit_logs
    where club_id = '3d200000-0000-4000-8000-000000000001'
      and action_key = 'event.registration_set_by_officer'
      and metadata ->> 'reason' = '來電告知會帶一位眷屬'
  ) then
    raise exception 'answering for a member left no audit row';
  end if;
end;
$$;

-- A plain member cannot read the roster or answer for anyone.
set local role authenticated;
select set_config('request.jwt.claim.sub', '3a000000-0000-0000-0000-000000000002', true);
do $$
begin
  perform public.list_club_event_registrations(
    '3d200000-0000-4000-8000-000000000001', '4a200000-0000-4000-8000-000000000001');
  raise exception 'a plain member read the registration roster';
exception when insufficient_privilege then
  null;
end;
$$;
do $$
begin
  perform public.set_event_registration_for_member(
    '3d200000-0000-4000-8000-000000000001',
    '4a200000-0000-4000-8000-000000000001',
    '3e200000-0000-4000-8000-000000000003',
    'attending', 0, '幫朋友報'
  );
  raise exception 'a plain member answered for somebody else';
exception when insufficient_privilege then
  null;
end;
$$;
reset role;

rollback;
