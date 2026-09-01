-- Member tags and audience targeting: club scoping, manage-only editing, and
-- the rule that a targeted event is not a 例會 and cannot count for
-- attendance.
-- Run only against Supabase local. All synthetic fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '1c000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'tag-officer@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1c000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'tag-included@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1c000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'tag-excluded@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('2c000000-0000-4000-8000-000000000001', '標籤幹部', 'tag-officer@example.test'),
  ('2c000000-0000-4000-8000-000000000002', '受邀社員', 'tag-included@example.test'),
  ('2c000000-0000-4000-8000-000000000003', '未受邀社員', 'tag-excluded@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('3c000000-0000-4000-8000-000000000001', '1c000000-0000-4000-8000-000000000001', '2c000000-0000-4000-8000-000000000001', 'tag-officer@example.test', '標籤幹部', 'active'),
  ('3c000000-0000-4000-8000-000000000002', '1c000000-0000-4000-8000-000000000002', '2c000000-0000-4000-8000-000000000002', 'tag-included@example.test', '受邀社員', 'active'),
  ('3c000000-0000-4000-8000-000000000003', '1c000000-0000-4000-8000-000000000003', '2c000000-0000-4000-8000-000000000003', 'tag-excluded@example.test', '未受邀社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at, suspended_at) values
  ('5c000000-0000-4000-8000-000000000001', 'TAG-A', '標籤測試社', 'active', now(), null),
  ('5c000000-0000-4000-8000-000000000002', 'TAG-B', '標籤鄰社', 'active', now(), null);

insert into public.club_memberships (
  id, club_id, person_id, membership_status, joined_on, ended_on
) values
  ('6c000000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000001', '2c000000-0000-4000-8000-000000000001', 'active', current_date - 900, null),
  ('6c000000-0000-4000-8000-000000000002', '5c000000-0000-4000-8000-000000000001', '2c000000-0000-4000-8000-000000000002', 'active', current_date - 900, null),
  ('6c000000-0000-4000-8000-000000000003', '5c000000-0000-4000-8000-000000000001', '2c000000-0000-4000-8000-000000000003', 'active', current_date - 900, null);

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values
  ('7c000000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000001', '3c000000-0000-4000-8000-000000000001', 'president', 'active', '3c000000-0000-4000-8000-000000000001');

insert into public.club_events (
  id, club_id, event_type, title, starts_at, ends_at, registration_deadline,
  counts_for_attendance, event_status, created_by_app_account_id,
  updated_by_app_account_id, published_at, cancelled_at, cancellation_reason
) values
  ('8c000000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000001', 'board_meeting', '理事會（限定受眾）',
   now() + interval '2 days', now() + interval '2 days' + interval '2 hours', now() + interval '1 day',
   false, 'published', '3c000000-0000-4000-8000-000000000001', '3c000000-0000-4000-8000-000000000001', now() - interval '5 days', null, null),
  -- A 例會: open to the whole club and counted, so it must stay counted.
  ('8c000000-0000-4000-8000-000000000002', '5c000000-0000-4000-8000-000000000001', 'regular_meeting', '全社例會',
   now() + interval '3 days', now() + interval '3 days' + interval '2 hours', now() + interval '1 day',
   true, 'published', '3c000000-0000-4000-8000-000000000001', '3c000000-0000-4000-8000-000000000001', now() - interval '5 days', null, null),
  -- Named participants with nothing in common but this one outing.
  ('8c000000-0000-4000-8000-000000000003', '5c000000-0000-4000-8000-000000000001', 'other', '高爾夫球比賽',
   now() + interval '4 days', now() + interval '4 days' + interval '5 hours', now() + interval '1 day',
   false, 'published', '3c000000-0000-4000-8000-000000000001', '3c000000-0000-4000-8000-000000000001', now() - interval '5 days', null, null);

do $grants$
begin
  if has_function_privilege('authenticated', 'public.event_includes_current_member(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.board_post_includes_current_member(uuid)', 'execute') then
    raise exception 'Audience helpers are directly callable by authenticated.';
  end if;
  if has_function_privilege('anon', 'public.set_membership_tags(uuid, uuid, uuid[])', 'execute') then
    raise exception 'Tag assignment is callable by anon.';
  end if;
end $grants$;

-- An ordinary member cannot create tags or assign them.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-4000-8000-000000000003', true);
do $member$
begin
  begin
    perform public.create_club_member_tag('5c000000-0000-4000-8000-000000000001', '自封標籤', null);
    raise exception 'A plain member created a club tag.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.list_club_member_tags('5c000000-0000-4000-8000-000000000001');
    raise exception 'A plain member listed club tags.';
  exception when insufficient_privilege then null;
  end;
end $member$;
reset role;

-- The officer creates a tag, applies it to one member, and targets the event.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-4000-8000-000000000001', true);
do $officer$
declare
  created jsonb;
  tag_id uuid;
begin
  created := public.create_club_member_tag('5c000000-0000-4000-8000-000000000001', ' 理事會 ', '理事與監事');
  tag_id := (created ->> 'tag_id')::uuid;
  if created ->> 'tag_name' <> '理事會' then
    raise exception 'Tag name was not trimmed.';
  end if;

  -- The same name twice is refused, case-insensitively.
  begin
    perform public.create_club_member_tag('5c000000-0000-4000-8000-000000000001', '理事會', null);
    raise exception 'A duplicate tag name was accepted.';
  exception when unique_violation then null;
  end;

  perform public.set_membership_tags(
    '5c000000-0000-4000-8000-000000000001',
    '6c000000-0000-4000-8000-000000000002',
    array[tag_id]
  );

  -- A membership in another club cannot be tagged with this club's tag.
  begin
    perform public.set_membership_tags(
      '5c000000-0000-4000-8000-000000000002',
      '6c000000-0000-4000-8000-000000000002',
      array[tag_id]
    );
    raise exception 'A tag was applied across club boundaries.';
  exception when insufficient_privilege or no_data_found then null;
  end;

  perform public.set_club_event_audience(
    '5c000000-0000-4000-8000-000000000001',
    '8c000000-0000-4000-8000-000000000001',
    array[tag_id]
  );
  -- The golf outing is addressed to named members, with no tag involved.
  perform public.set_club_event_audience(
    '5c000000-0000-4000-8000-000000000001',
    '8c000000-0000-4000-8000-000000000003',
    '{}'::uuid[],
    array['6c000000-0000-4000-8000-000000000003'::uuid]
  );

  -- A membership from another club cannot be named as an audience.
  begin
    perform public.set_club_event_audience(
      '5c000000-0000-4000-8000-000000000001',
      '8c000000-0000-4000-8000-000000000003',
      '{}'::uuid[],
      array['6c000000-0000-4000-8000-000000000003'::uuid, gen_random_uuid()]
    );
    raise exception 'An unknown membership was accepted as an audience.';
  exception when invalid_parameter_value then null;
  end;

  perform set_config('tags.board', tag_id::text, true);
end $officer$;
reset role;

-- A targeted event may not count for attendance, from either direction.
do $invariant$
begin
  begin
    update public.club_events set counts_for_attendance = true
    where id = '8c000000-0000-4000-8000-000000000001';
    raise exception 'A targeted event was switched to count for attendance.';
  exception when invalid_parameter_value then null;
  end;

  begin
    insert into public.club_event_audience_members (event_id, membership_id, club_id)
    values (
      '8c000000-0000-4000-8000-000000000002',
      '6c000000-0000-4000-8000-000000000002',
      '5c000000-0000-4000-8000-000000000001'
    );
    raise exception 'A named audience was attached to an event that counts for attendance.';
  exception when invalid_parameter_value then null;
  end;

  begin
    insert into public.club_event_audiences (event_id, tag_id, club_id)
    values (
      '8c000000-0000-4000-8000-000000000002',
      current_setting('tags.board')::uuid,
      '5c000000-0000-4000-8000-000000000001'
    );
    raise exception 'An audience was attached to an event that counts for attendance.';
  exception when invalid_parameter_value then null;
  end;

  -- The club-wide 例會 is untouched by any of this and still counts.
  if not exists (
    select 1 from public.club_events
    where id = '8c000000-0000-4000-8000-000000000002' and counts_for_attendance
  ) then
    raise exception 'A club-wide meeting stopped counting for attendance.';
  end if;
  if not public.attendance_membership_is_eligible(
       '8c000000-0000-4000-8000-000000000002', '6c000000-0000-4000-8000-000000000003') then
    raise exception 'A member was excluded from a club-wide meeting.';
  end if;
end $invariant$;

-- The named-member audience is independent of tags: the member excluded from
-- the tagged event is exactly the one invited to the golf outing.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-4000-8000-000000000003', true);
do $named$
declare
  events jsonb;
begin
  events := public.list_club_events('5c000000-0000-4000-8000-000000000001', false) -> 'events';
  if events::text not like '%8c000000-0000-4000-8000-000000000003%' then
    raise exception 'A named participant could not see the outing they were invited to.';
  end if;
end $named$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-4000-8000-000000000002', true);
do $not_named$
declare
  events jsonb;
begin
  events := public.list_club_events('5c000000-0000-4000-8000-000000000001', false) -> 'events';
  if events::text like '%8c000000-0000-4000-8000-000000000003%' then
    raise exception 'A member who was not named saw the outing.';
  end if;
end $not_named$;
reset role;

-- And the excluded member cannot see the event at all, while the officer can.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-4000-8000-000000000003', true);
do $excluded$
declare
  events jsonb;
begin
  events := public.list_club_events('5c000000-0000-4000-8000-000000000001', false) -> 'events';
  if events::text like '%8c000000-0000-4000-8000-000000000001%' then
    raise exception 'An untagged member was shown a targeted event.';
  end if;
end $excluded$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-4000-8000-000000000002', true);
do $included$
declare
  events jsonb;
begin
  events := public.list_club_events('5c000000-0000-4000-8000-000000000001', false) -> 'events';
  if events::text not like '%8c000000-0000-4000-8000-000000000001%' then
    raise exception 'A tagged member could not see the event addressed to them.';
  end if;
end $included$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-4000-8000-000000000001', true);
do $manager_view$
declare
  events jsonb;
begin
  -- A manager keeps sight of what they sent, so they can find and edit it.
  events := public.list_club_events('5c000000-0000-4000-8000-000000000001', false) -> 'events';
  if events::text not like '%8c000000-0000-4000-8000-000000000001%' then
    raise exception 'A manager lost sight of a targeted event.';
  end if;

  -- Asking as a member removes that privilege, and the officer is untagged.
  events := public.list_club_events('5c000000-0000-4000-8000-000000000001', true) -> 'events';
  if events::text like '%8c000000-0000-4000-8000-000000000001%' then
    raise exception 'The member view of a manager ignored the audience.';
  end if;
end $manager_view$;
reset role;

-- The shared resolver: one definition of the addressed set, and only for a
-- caller who may manage members.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-4000-8000-000000000003', true);
do $resolver_denied$
begin
  begin
    perform public.resolve_club_audience('5c000000-0000-4000-8000-000000000001');
    raise exception 'A plain member resolved a club audience.';
  exception when insufficient_privilege then null;
  end;
end $resolver_denied$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-4000-8000-000000000001', true);
do $resolver$
declare
  everyone jsonb;
  tagged jsonb;
  named jsonb;
begin
  everyone := public.resolve_club_audience('5c000000-0000-4000-8000-000000000001');
  if not (everyone ->> 'whole_club')::boolean or (everyone ->> 'member_count')::integer <> 3 then
    raise exception 'An empty audience did not resolve to the whole club.';
  end if;

  tagged := public.resolve_club_audience(
    '5c000000-0000-4000-8000-000000000001',
    array[current_setting('tags.board')::uuid]
  );
  if (tagged ->> 'whole_club')::boolean or (tagged ->> 'member_count')::integer <> 1 then
    raise exception 'A tag audience did not resolve to its tagged members.';
  end if;

  named := public.resolve_club_audience(
    '5c000000-0000-4000-8000-000000000001',
    '{}'::uuid[],
    array['6c000000-0000-4000-8000-000000000003'::uuid]
  );
  if (named ->> 'member_count')::integer <> 1 then
    raise exception 'A named audience did not resolve to the named member.';
  end if;

  -- Nobody in these fixtures has paired a LINE OA identity, so the addressed
  -- set is larger than the set a push can actually reach. The two counts are
  -- reported separately precisely so that gap is visible before sending.
  if (everyone ->> 'reachable_count')::integer <> 0
     or jsonb_array_length(everyone -> 'oa_user_ids') <> 0 then
    raise exception 'Unpaired members were counted as reachable by LINE.';
  end if;
end $resolver$;
reset role;

-- The detail page must not become a way around the audience: an event that
-- was not addressed to a member is indistinguishable from one that is not
-- there, rather than returning a permission error that confirms it exists.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-4000-8000-000000000003', true);
do $detail_excluded$
begin
  if public.get_my_club_event('8c000000-0000-4000-8000-000000000001') is not null then
    raise exception 'An untagged member fetched a targeted event by id.';
  end if;
  -- The outing they were named for is still theirs to open.
  if public.get_my_club_event('8c000000-0000-4000-8000-000000000003') is null then
    raise exception 'A named participant could not open their own event by id.';
  end if;
end $detail_excluded$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-4000-8000-000000000002', true);
do $detail_included$
declare
  payload jsonb;
begin
  payload := public.get_my_club_event('8c000000-0000-4000-8000-000000000001');
  if payload is null then
    raise exception 'A tagged member could not open the event addressed to them.';
  end if;
  if (payload ->> 'club_id')::uuid <> '5c000000-0000-4000-8000-000000000001' then
    raise exception 'The detail payload named the wrong club.';
  end if;
  -- Both clock decisions come from the database, not the caller.
  if payload -> 'happening_now' is null or payload -> 'is_past' is null then
    raise exception 'The detail payload did not decide the event timing.';
  end if;
end $detail_included$;
reset role;

rollback;
