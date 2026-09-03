-- A person may hold club memberships and operator authority at the same time.
-- Run against local Supabase only. Every fixture is rolled back.

begin;

-- Two clubs, so the interesting case (member of A, executive secretary of B)
-- can be told apart from the same-club case.
insert into public.clubs (id, club_code, club_name, club_status) values
  ('4b000000-0000-4000-8000-000000000001', 'DUAL-ALPHA', '雙重社籍 A 社', 'active'),
  ('4b000000-0000-4000-8000-000000000002', 'DUAL-BETA', '雙重社籍 B 社', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '4c000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'dual-role@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email)
values ('4d000000-0000-4000-8000-000000000001', '雙重身份社友', 'dual-role@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('4e000000-0000-4000-8000-000000000001', '4c000000-0000-4000-8000-000000000001', '4d000000-0000-4000-8000-000000000001', 'dual-role@example.test', '雙重身份社友', 'active');

-- Active membership in both clubs at once. The unique index is per club and
-- person, so this is the dual membership the platform now allows.
insert into public.club_memberships (id, club_id, person_id, membership_status) values
  ('4f000000-0000-4000-8000-000000000001', '4b000000-0000-4000-8000-000000000001', '4d000000-0000-4000-8000-000000000001', 'active'),
  ('4f000000-0000-4000-8000-000000000002', '4b000000-0000-4000-8000-000000000002', '4d000000-0000-4000-8000-000000000001', 'active');

do $$
begin
  if (select count(*) from public.club_memberships
      where person_id = '4d000000-0000-4000-8000-000000000001'
        and membership_status = 'active') <> 2 then
    raise exception 'a person must be able to hold two active memberships';
  end if;
end;
$$;

-- Executive secretary of club B while holding membership in both.
insert into public.club_operator_permissions (
  club_id, app_account_id, permission_level, assignment_status, starts_at
) values (
  '4b000000-0000-4000-8000-000000000002', '4e000000-0000-4000-8000-000000000001',
  'club_manager', 'active', now()
);

-- The rule is gone from every provisioning path, not just the one the admin
-- screen happens to call.
do $$
declare
  function_name text;
  definition text;
begin
  foreach function_name in array array[
    'provision_operator_account',
    'create_club_with_initial_operator_invitation',
    'invite_additional_operator',
    'accept_operator_invitation'
  ] loop
    select pg_catalog.pg_get_functiondef(oid) into definition
    from pg_catalog.pg_proc
    where proname = function_name and pronamespace = 'public'::regnamespace;

    if definition is null then
      raise exception '% is missing', function_name;
    end if;
    if position('active_member_cannot_be_operator' in definition) > 0 then
      raise exception '% still refuses an operator who holds a membership', function_name;
    end if;
  end loop;
end;
$$;

-- Holding both roles in one club must still yield a single directory entry,
-- and must not invent access to the club where only membership exists.
set local role authenticated;
select set_config('request.jwt.claim.sub', '4c000000-0000-4000-8000-000000000001', true);

do $$
declare
  club_rows integer;
  beta_rows integer;
begin
  select count(*) into club_rows from public.list_my_directory_clubs();
  select count(*) into beta_rows from public.list_my_directory_clubs()
  where club_id = '4b000000-0000-4000-8000-000000000002';

  if club_rows <> 2 then
    raise exception 'expected exactly one directory row per club, got %', club_rows;
  end if;
  if beta_rows <> 1 then
    raise exception 'member and operator of the same club must not be listed twice';
  end if;
end;
$$;

reset role;
reset request.jwt.claims;

-- Removing the rule must not have granted operator authority to a plain member.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '4c000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'plain-member@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email)
values ('4d000000-0000-4000-8000-000000000002', '一般社友', 'plain-member@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('4e000000-0000-4000-8000-000000000002', '4c000000-0000-4000-8000-000000000002', '4d000000-0000-4000-8000-000000000002', 'plain-member@example.test', '一般社友', 'active');

insert into public.club_memberships (club_id, person_id, membership_status)
values ('4b000000-0000-4000-8000-000000000001', '4d000000-0000-4000-8000-000000000002', 'active');

-- current_can_manage_club is deliberately revoked from authenticated, so the
-- claim is set and the assertion runs after reset role.
select set_config('request.jwt.claim.sub', '4c000000-0000-4000-8000-000000000002', true);

do $$
begin
  if public.current_can_manage_club('4b000000-0000-4000-8000-000000000001') then
    raise exception 'a membership row must not confer operator authority';
  end if;
end;
$$;

reset request.jwt.claims;

-- The operator's authority is still bounded to the club they were assigned.
select set_config('request.jwt.claim.sub', '4c000000-0000-4000-8000-000000000001', true);

do $$
begin
  if not public.current_can_manage_club('4b000000-0000-4000-8000-000000000002') then
    raise exception 'the assigned operator lost authority over their own club';
  end if;
  if public.current_can_manage_club('4b000000-0000-4000-8000-000000000001') then
    raise exception 'membership in another club must not confer operator authority there';
  end if;
end;
$$;

reset request.jwt.claims;

-- An executive secretary who is also a member of the club they operate must
-- keep their management shell. Before the overlap rule was dropped this pairing
-- was impossible, and the projection computed can_manage from role assignments
-- alone: the club would appear as a plain member club and the operator would
-- silently lose management navigation.
select set_config('request.jwt.claim.sub', '4c000000-0000-4000-8000-000000000001', true);

do $$
declare
  context jsonb;
  beta jsonb;
begin
  select public.resolve_my_experience_context() into context;

  select entry into beta
  from jsonb_array_elements(context -> 'member_clubs') as entry
  where entry ->> 'club_id' = '4b000000-0000-4000-8000-000000000002';

  if beta is null then
    raise exception 'the club where the operator also holds membership is missing from member_clubs';
  end if;
  if (beta ->> 'can_manage')::boolean is not true then
    raise exception 'an operator who is also a member lost can_manage on their own club';
  end if;

  -- Membership alone still must not read as management.
  if (select (entry ->> 'can_manage')::boolean
      from jsonb_array_elements(context -> 'member_clubs') as entry
      where entry ->> 'club_id' = '4b000000-0000-4000-8000-000000000001') is true then
    raise exception 'plain membership must not report can_manage';
  end if;

  -- Two memberships means two switchable clubs, which is what the shell's
  -- club switcher renders from.
  if jsonb_array_length(context -> 'member_clubs') <> 2 then
    raise exception 'both memberships must be projected for the club switcher';
  end if;
end;
$$;

reset request.jwt.claims;

rollback;
