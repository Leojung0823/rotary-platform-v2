-- Search finds nothing a member could not already see.
-- Run only against Supabase local. All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '1d000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'search-insider@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1d000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'search-outsider@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('2d000000-0000-0000-0000-000000000001', '搜尋理事', 'search-insider@example.test'),
  ('2d000000-0000-0000-0000-000000000002', '搜尋社友', 'search-outsider@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('3d000000-0000-0000-0000-000000000001', '1d000000-0000-0000-0000-000000000001', '2d000000-0000-0000-0000-000000000001', 'search-insider@example.test', '搜尋理事', 'active'),
  ('3d000000-0000-0000-0000-000000000002', '1d000000-0000-0000-0000-000000000002', '2d000000-0000-0000-0000-000000000002', 'search-outsider@example.test', '搜尋社友', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('5d000000-0000-4000-8000-000000000001', 'SEARCH', '搜尋測試社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status, joined_on) values
  ('6d000000-0000-4000-8000-000000000001', '5d000000-0000-4000-8000-000000000001', '2d000000-0000-0000-0000-000000000001', 'active', current_date - 30),
  ('6d000000-0000-4000-8000-000000000002', '5d000000-0000-4000-8000-000000000001', '2d000000-0000-0000-0000-000000000002', 'active', current_date - 30);

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values
  ('7d000000-0000-4000-8000-000000000001', '5d000000-0000-4000-8000-000000000001', '3d000000-0000-0000-0000-000000000001', 'president', 'active', '3d000000-0000-0000-0000-000000000001');

-- Three events sharing a searchable word: one open to everyone, one addressed
-- to a tag only the insider carries, and one still a draft.
insert into public.club_events (
  id, club_id, event_type, title, starts_at, ends_at, registration_deadline,
  counts_for_attendance, event_status, created_by_app_account_id,
  updated_by_app_account_id, published_at
) values
  ('8d000000-0000-4000-8000-000000000001', '5d000000-0000-4000-8000-000000000001', 'regular_meeting', '公開的鳳梨例會', now() + interval '2 hours', now() + interval '4 hours', now() + interval '1 hour', true, 'published', '3d000000-0000-0000-0000-000000000001', '3d000000-0000-0000-0000-000000000001', now()),
  ('8d000000-0000-4000-8000-000000000002', '5d000000-0000-4000-8000-000000000001', 'board_meeting', '分眾的鳳梨理事會', now() + interval '2 hours', now() + interval '4 hours', now() + interval '1 hour', false, 'published', '3d000000-0000-0000-0000-000000000001', '3d000000-0000-0000-0000-000000000001', now()),
  ('8d000000-0000-4000-8000-000000000003', '5d000000-0000-4000-8000-000000000001', 'other', '草稿的鳳梨活動', now() + interval '2 hours', now() + interval '4 hours', now() + interval '1 hour', true, 'draft', '3d000000-0000-0000-0000-000000000001', '3d000000-0000-0000-0000-000000000001', null);

insert into public.club_member_tags (id, club_id, tag_name, tag_status, created_by_app_account_id) values
  ('9d000000-0000-4000-8000-000000000001', '5d000000-0000-4000-8000-000000000001', '理事會', 'active', '3d000000-0000-0000-0000-000000000001');

insert into public.club_membership_tags (membership_id, tag_id, club_id, assigned_by_app_account_id) values
  ('6d000000-0000-4000-8000-000000000001', '9d000000-0000-4000-8000-000000000001', '5d000000-0000-4000-8000-000000000001', '3d000000-0000-0000-0000-000000000001');

insert into public.club_event_audiences (event_id, tag_id, club_id) values
  ('8d000000-0000-4000-8000-000000000002', '9d000000-0000-4000-8000-000000000001', '5d000000-0000-4000-8000-000000000001');

-- The answers are captured while acting as each member and asserted after,
-- because the assertions themselves must not run with a member's role.
create table public.search_test_state (key text primary key, value jsonb not null);
grant select, insert on public.search_test_state to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '1d000000-0000-0000-0000-000000000001', true);
insert into public.search_test_state (key, value)
values ('insider', public.search_my_club('5d000000-0000-4000-8000-000000000001', '鳳梨', 10)),
       ('narrow', public.search_my_club('5d000000-0000-4000-8000-000000000001', '鳳', 10)),
       ('wild', public.search_my_club('5d000000-0000-4000-8000-000000000001', '%%', 10));

select set_config('request.jwt.claim.sub', '1d000000-0000-0000-0000-000000000002', true);
insert into public.search_test_state (key, value)
values ('outsider', public.search_my_club('5d000000-0000-4000-8000-000000000001', '鳳梨', 10));

-- Another club's id: the caller has no access, so the answer is a refusal and
-- not an empty result.
select set_config('request.jwt.claim.sub', '1d000000-0000-0000-0000-000000000001', true);
do $$
begin
  perform public.search_my_club('00000000-0000-4000-8000-0000000000ff', '鳳梨', 10);
  raise exception 'search answered for a club the caller has no access to';
exception when insufficient_privilege then
  null;
end;
$$;

reset role;

do $$
declare
  insider jsonb;
  outsider jsonb;
  narrow jsonb;
  wild jsonb;
begin
  select value into insider from public.search_test_state where key = 'insider';
  select value into outsider from public.search_test_state where key = 'outsider';
  select value into narrow from public.search_test_state where key = 'narrow';
  select value into wild from public.search_test_state where key = 'wild';

  -- The insider carries the tag, so both published events are theirs to find.
  if jsonb_array_length(insider -> 'events') <> 2 then
    raise exception 'the tagged member should find both published events: %', insider -> 'events';
  end if;

  -- The outsider was not addressed, so the targeted event must not exist for
  -- them -- the same rule the events page applies.
  if jsonb_array_length(outsider -> 'events') <> 1 then
    raise exception 'a targeted event leaked into search: %', outsider -> 'events';
  end if;
  if (outsider -> 'events' -> 0 ->> 'title') <> '公開的鳳梨例會' then
    raise exception 'the wrong event is visible to the outsider: %', outsider -> 'events';
  end if;

  -- A draft is nobody's, not even the president's, through this door.
  if (insider ->> 'events') like '%草稿的鳳梨活動%' then
    raise exception 'a draft event is findable: %', insider -> 'events';
  end if;

  -- A one-character question answers nothing rather than most of the club.
  if jsonb_array_length(narrow -> 'events') <> 0 then
    raise exception 'a single character searched the whole club: %', narrow;
  end if;

  -- A wildcard typed by a member is a character, not syntax.
  if jsonb_array_length(wild -> 'events') <> 0 then
    raise exception 'a literal %% matched everything: %', wild;
  end if;
end;
$$;

rollback;
