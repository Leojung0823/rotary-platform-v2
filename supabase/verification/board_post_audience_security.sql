-- Board post audiences: who may address one, and who then sees the post.
-- Run only against Supabase local. All synthetic fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '1e000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'board-officer@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1e000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'board-tagged@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1e000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'board-untagged@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('2e000000-0000-4000-8000-000000000001', '留言板幹部', 'board-officer@example.test'),
  ('2e000000-0000-4000-8000-000000000002', '被指定社員', 'board-tagged@example.test'),
  ('2e000000-0000-4000-8000-000000000003', '未指定社員', 'board-untagged@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('3e000000-0000-4000-8000-000000000001', '1e000000-0000-4000-8000-000000000001', '2e000000-0000-4000-8000-000000000001', 'board-officer@example.test', '留言板幹部', 'active'),
  ('3e000000-0000-4000-8000-000000000002', '1e000000-0000-4000-8000-000000000002', '2e000000-0000-4000-8000-000000000002', 'board-tagged@example.test', '被指定社員', 'active'),
  ('3e000000-0000-4000-8000-000000000003', '1e000000-0000-4000-8000-000000000003', '2e000000-0000-4000-8000-000000000003', 'board-untagged@example.test', '未指定社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at, suspended_at) values
  ('5e000000-0000-4000-8000-000000000001', 'BRD-A', '留言板測試社', 'active', now(), null);

insert into public.club_memberships (
  id, club_id, person_id, membership_status, joined_on, ended_on
) values
  ('6e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000001', '2e000000-0000-4000-8000-000000000001', 'active', current_date - 400, null),
  ('6e000000-0000-4000-8000-000000000002', '5e000000-0000-4000-8000-000000000001', '2e000000-0000-4000-8000-000000000002', 'active', current_date - 400, null),
  ('6e000000-0000-4000-8000-000000000003', '5e000000-0000-4000-8000-000000000001', '2e000000-0000-4000-8000-000000000003', 'active', current_date - 400, null);

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values
  ('7e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000001', '3e000000-0000-4000-8000-000000000001', 'president', 'active', '3e000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '1e000000-0000-4000-8000-000000000001', true);
do $officer$
declare
  tag_id uuid;
  targeted jsonb;
  open_post jsonb;
begin
  tag_id := (public.create_club_member_tag(
    '5e000000-0000-4000-8000-000000000001', '留言板對象', null
  ) ->> 'tag_id')::uuid;
  perform public.set_membership_tags(
    '5e000000-0000-4000-8000-000000000001',
    '6e000000-0000-4000-8000-000000000002',
    array[tag_id]
  );

  targeted := public.create_board_post(
    '5e000000-0000-4000-8000-000000000001', '這則只給被指定的人', array[tag_id]
  );
  open_post := public.create_board_post(
    '5e000000-0000-4000-8000-000000000001', '這則給全社'
  );

  -- A tag from nowhere cannot be attached.
  begin
    perform public.create_board_post(
      '5e000000-0000-4000-8000-000000000001', '偽造對象', array[gen_random_uuid()]
    );
    raise exception 'An unknown tag was accepted as a post audience.';
  exception when invalid_parameter_value then null;
  end;

  perform set_config('board.targeted', targeted ->> 'id', true);
  perform set_config('board.open', open_post ->> 'id', true);
  perform set_config('board.tag', tag_id::text, true);
end $officer$;
reset role;

-- An ordinary member may still post, but not to a subset of the club.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1e000000-0000-4000-8000-000000000003', true);
do $member$
begin
  perform public.create_board_post('5e000000-0000-4000-8000-000000000001', '一般社員的留言');

  begin
    perform public.create_board_post(
      '5e000000-0000-4000-8000-000000000001',
      '一般社員想指定對象',
      array[current_setting('board.tag')::uuid]
    );
    raise exception 'A plain member addressed a post to part of the club.';
  exception when insufficient_privilege then null;
  end;
end $member$;
reset role;

-- The untagged member sees the open post but not the targeted one.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1e000000-0000-4000-8000-000000000003', true);
do $untagged$
declare
  posts text;
begin
  posts := public.list_board_posts('5e000000-0000-4000-8000-000000000001')::text;
  if posts like '%' || current_setting('board.targeted') || '%' then
    raise exception 'An untagged member saw a targeted post.';
  end if;
  if posts not like '%' || current_setting('board.open') || '%' then
    raise exception 'An untagged member lost sight of an untargeted post.';
  end if;
end $untagged$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '1e000000-0000-4000-8000-000000000002', true);
do $tagged$
declare
  posts text;
begin
  posts := public.list_board_posts('5e000000-0000-4000-8000-000000000001')::text;
  if posts not like '%' || current_setting('board.targeted') || '%' then
    raise exception 'A tagged member could not see the post addressed to them.';
  end if;
end $tagged$;
reset role;

-- The author keeps sight of what they sent, even though they are not tagged.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1e000000-0000-4000-8000-000000000001', true);
do $author$
declare
  posts text;
begin
  posts := public.list_board_posts('5e000000-0000-4000-8000-000000000001')::text;
  if posts not like '%' || current_setting('board.targeted') || '%' then
    raise exception 'The author lost sight of their own targeted post.';
  end if;
end $author$;
reset role;

rollback;
