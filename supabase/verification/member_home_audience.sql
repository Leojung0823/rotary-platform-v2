-- 分眾活動對沒被指定到的社員，在每一條路徑上都不存在。
-- Run only against Supabase local. All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '1f000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'audience-officer@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1f000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'audience-invited@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1f000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'audience-outsider@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('2f000000-0000-0000-0000-000000000001', '分眾社長', 'audience-officer@example.test'),
  ('2f000000-0000-0000-0000-000000000002', '受邀理事', 'audience-invited@example.test'),
  ('2f000000-0000-0000-0000-000000000003', '未受邀社友', 'audience-outsider@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('3f000000-0000-0000-0000-000000000001', '1f000000-0000-0000-0000-000000000001', '2f000000-0000-0000-0000-000000000001', 'audience-officer@example.test', '分眾社長', 'active'),
  ('3f000000-0000-0000-0000-000000000002', '1f000000-0000-0000-0000-000000000002', '2f000000-0000-0000-0000-000000000002', 'audience-invited@example.test', '受邀理事', 'active'),
  ('3f000000-0000-0000-0000-000000000003', '1f000000-0000-0000-0000-000000000003', '2f000000-0000-0000-0000-000000000003', 'audience-outsider@example.test', '未受邀社友', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('5f000000-0000-4000-8000-000000000001', 'AUDIENCE', '分眾測試社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status, joined_on) values
  ('6f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000001', '2f000000-0000-0000-0000-000000000001', 'active', current_date - 300),
  ('6f000000-0000-4000-8000-000000000002', '5f000000-0000-4000-8000-000000000001', '2f000000-0000-0000-0000-000000000002', 'active', current_date - 300),
  ('6f000000-0000-4000-8000-000000000003', '5f000000-0000-4000-8000-000000000001', '2f000000-0000-0000-0000-000000000003', 'active', current_date - 300);

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values
  ('7f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000001', '3f000000-0000-0000-0000-000000000001', 'president', 'active', '3f000000-0000-0000-0000-000000000001');

insert into public.club_member_tags (id, club_id, tag_name, tag_status, created_by_app_account_id) values
  ('8f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000001', '理事會', 'active', '3f000000-0000-0000-0000-000000000001');

insert into public.club_membership_tags (membership_id, tag_id, club_id, assigned_by_app_account_id) values
  ('6f000000-0000-4000-8000-000000000002', '8f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000001', '3f000000-0000-0000-0000-000000000001');

-- An upcoming targeted event, and one already finished so the home's review
-- list is exercised too.
insert into public.club_events (
  id, club_id, event_type, title, starts_at, ends_at, registration_deadline,
  counts_for_attendance, event_status, created_by_app_account_id,
  updated_by_app_account_id, published_at, venue_latitude, venue_longitude
) values
  ('9f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000001', 'board_meeting', '分眾理事會', now() + interval '30 minutes', now() + interval '3 hours', now() + interval '15 minutes', false, 'published', '3f000000-0000-0000-0000-000000000001', '3f000000-0000-0000-0000-000000000001', now(), 25.0, 121.5),
  ('9f000000-0000-4000-8000-000000000002', '5f000000-0000-4000-8000-000000000001', 'board_meeting', '分眾舊理事會', now() - interval '4 hours', now() - interval '2 hours', now() - interval '5 hours', false, 'published', '3f000000-0000-0000-0000-000000000001', '3f000000-0000-0000-0000-000000000001', now() - interval '1 day', null, null);

insert into public.club_event_audiences (event_id, tag_id, club_id) values
  ('9f000000-0000-4000-8000-000000000001', '8f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000001'),
  ('9f000000-0000-4000-8000-000000000002', '8f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000001');

-- An open check-in session on the upcoming one, so the GPS list has something
-- to offer -- or to withhold.
--
-- It starts in half an hour rather than in two: 定位簽到 now opens an hour
-- before the start, so an event further out than that is outside the window and
-- the GPS list is empty for everyone -- which would make the audience assertion
-- below pass for the wrong reason. Still upcoming, so the home page assertions
-- are unchanged.
insert into public.event_checkin_sessions (
  id, club_id, event_id, token_hash, token_prefix, expires_at, created_by_app_account_id, session_status
) values
  ('af000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000001', '9f000000-0000-4000-8000-000000000001', repeat('a', 64), 'aaaaaaaa', now() + interval '3 hours', '3f000000-0000-0000-0000-000000000001', 'active');

create table public.audience_test_state (key text primary key, value jsonb not null);
grant select, insert on public.audience_test_state to authenticated;

set local role authenticated;

select set_config('request.jwt.claim.sub', '1f000000-0000-0000-0000-000000000002', true);
insert into public.audience_test_state (key, value) values
  ('invited_home', public.get_my_member_home_projection('5f000000-0000-4000-8000-000000000001')),
  ('invited_gps', public.list_my_location_checkin_events());

select set_config('request.jwt.claim.sub', '1f000000-0000-0000-0000-000000000003', true);
insert into public.audience_test_state (key, value) values
  ('outsider_home', public.get_my_member_home_projection('5f000000-0000-4000-8000-000000000001')),
  ('outsider_gps', public.list_my_location_checkin_events());

-- The write the lists never offered but nothing refused.
do $$
begin
  perform public.set_my_event_registration(
    '5f000000-0000-4000-8000-000000000001',
    '9f000000-0000-4000-8000-000000000001',
    'attending', 0, ''
  );
  raise exception 'an uninvited member registered for a targeted event';
exception when sqlstate 'P0002' then
  null;
end;
$$;

reset role;

do $$
declare
  invited_home jsonb;
  outsider_home jsonb;
  invited_gps jsonb;
  outsider_gps jsonb;
begin
  select value into invited_home from public.audience_test_state where key = 'invited_home';
  select value into outsider_home from public.audience_test_state where key = 'outsider_home';
  select value into invited_gps from public.audience_test_state where key = 'invited_gps';
  select value into outsider_gps from public.audience_test_state where key = 'outsider_gps';

  -- The invited member still sees it. A fix that hides it from everyone is not
  -- a fix.
  if (invited_home)::text not like '%分眾理事會%' then
    raise exception 'the invited member lost their own event: %', invited_home;
  end if;
  if (invited_gps)::text not like '%分眾理事會%' then
    raise exception 'the invited member lost the GPS check-in entry: %', invited_gps;
  end if;

  -- The uninvited member must not meet it anywhere: not as the featured card,
  -- not in 近期活動, not as a 待辦提醒, not in the review list, not in the
  -- GPS check-in list.
  if (outsider_home)::text like '%分眾理事會%' then
    raise exception 'a targeted event reached an uninvited home page: %', outsider_home;
  end if;
  if (outsider_home)::text like '%分眾舊理事會%' then
    raise exception 'a past targeted event reached an uninvited review list: %', outsider_home;
  end if;
  if (outsider_gps)::text like '%分眾理事會%' then
    raise exception 'a targeted event reached an uninvited GPS list: %', outsider_gps;
  end if;
end;
$$;

rollback;
