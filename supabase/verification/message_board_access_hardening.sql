-- Message board account, membership, and club lifecycle verification.
-- Run only against Supabase local. All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '13000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'board-active@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '13000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'board-suspended-account@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '13000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'board-suspended-membership@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '13000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'board-suspended-club@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('23000000-0000-0000-0000-000000000001', '啟用社員', 'board-active@example.test'),
  ('23000000-0000-0000-0000-000000000002', '停權帳號社員', 'board-suspended-account@example.test'),
  ('23000000-0000-0000-0000-000000000003', '停權社籍社員', 'board-suspended-membership@example.test'),
  ('23000000-0000-0000-0000-000000000004', '停權扶輪社社員', 'board-suspended-club@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('33000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', 'board-active@example.test', '啟用社員', 'active'),
  ('33000000-0000-0000-0000-000000000002', '13000000-0000-0000-0000-000000000002', '23000000-0000-0000-0000-000000000002', 'board-suspended-account@example.test', '停權帳號社員', 'suspended'),
  ('33000000-0000-0000-0000-000000000003', '13000000-0000-0000-0000-000000000003', '23000000-0000-0000-0000-000000000003', 'board-suspended-membership@example.test', '停權社籍社員', 'active'),
  ('33000000-0000-0000-0000-000000000004', '13000000-0000-0000-0000-000000000004', '23000000-0000-0000-0000-000000000004', 'board-suspended-club@example.test', '停權扶輪社社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at, suspended_at) values
  ('53000000-0000-4000-8000-000000000001', 'BOARD-LIFECYCLE-A', '啟用留言板測試社', 'active', now(), null),
  ('53000000-0000-4000-8000-000000000002', 'BOARD-LIFECYCLE-S', '停權留言板測試社', 'suspended', now() - interval '1 day', now());

insert into public.club_memberships (id, club_id, person_id, membership_status) values
  ('63000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', '23000000-0000-0000-0000-000000000001', 'active'),
  ('63000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000001', '23000000-0000-0000-0000-000000000002', 'active'),
  ('63000000-0000-4000-8000-000000000003', '53000000-0000-4000-8000-000000000001', '23000000-0000-0000-0000-000000000003', 'suspended'),
  ('63000000-0000-4000-8000-000000000004', '53000000-0000-4000-8000-000000000002', '23000000-0000-0000-0000-000000000004', 'active');

-- An active account with an active membership in an active club can list and create.
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000001', true);
do $$
declare
  club_count integer;
  created jsonb;
begin
  select count(*) into club_count from public.list_my_board_clubs();
  if club_count <> 1 then
    raise exception 'active board member did not receive exactly one active club';
  end if;

  created := public.create_board_post(
    '53000000-0000-4000-8000-000000000001',
    '生命週期驗證留言'
  );
  if created->>'content' <> '生命週期驗證留言' then
    raise exception 'active board member could not create a post';
  end if;

  begin
    perform public.current_has_active_board_membership('53000000-0000-4000-8000-000000000001');
    raise exception 'authenticated role executed internal membership helper';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- A suspended application account is hidden from the club selector and denied all board RPC access.
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000002', true);
do $$
declare club_count integer;
begin
  select count(*) into club_count from public.list_my_board_clubs();
  if club_count <> 0 then raise exception 'suspended account received a board club'; end if;

  begin
    perform public.create_board_post('53000000-0000-4000-8000-000000000001', '停權帳號越權留言');
    raise exception 'suspended account created a board post';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.list_board_posts('53000000-0000-4000-8000-000000000001', null, null, 20);
    raise exception 'suspended account listed board posts';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- A suspended membership cannot use the board even when the account and club remain active.
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000003', true);
do $$
declare club_count integer;
begin
  select count(*) into club_count from public.list_my_board_clubs();
  if club_count <> 0 then raise exception 'suspended membership received a board club'; end if;

  begin
    perform public.create_board_post('53000000-0000-4000-8000-000000000001', '停權社籍越權留言');
    raise exception 'suspended membership created a board post';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- An active membership in a suspended club is not an active board entitlement.
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000004', true);
do $$
declare club_count integer;
begin
  select count(*) into club_count from public.list_my_board_clubs();
  if club_count <> 0 then raise exception 'suspended club appeared in board selector'; end if;

  begin
    perform public.create_board_post('53000000-0000-4000-8000-000000000002', '停權扶輪社越權留言');
    raise exception 'member created a post in a suspended club';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.list_board_posts('53000000-0000-4000-8000-000000000002', null, null, 20);
    raise exception 'member listed posts in a suspended club';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

rollback;
