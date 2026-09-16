-- An ordinary active member may read the member-facing 社務 projection.
-- The check must not grant the broader member.read permission or leak the
-- projection to an outsider, suspended member, or another club.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '2a000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'affairs-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '2a000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'affairs-outsider@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '2a000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'affairs-suspended@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('2b000000-0000-0000-0000-000000000001', '一般社員', 'affairs-member@example.test'),
  ('2b000000-0000-0000-0000-000000000002', '外社使用者', 'affairs-outsider@example.test'),
  ('2b000000-0000-0000-0000-000000000003', '停權社員', 'affairs-suspended@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('2c000000-0000-0000-0000-000000000001', '2a000000-0000-0000-0000-000000000001', '2b000000-0000-0000-0000-000000000001', 'affairs-member@example.test', '一般社員', 'active'),
  ('2c000000-0000-0000-0000-000000000002', '2a000000-0000-0000-0000-000000000002', '2b000000-0000-0000-0000-000000000002', 'affairs-outsider@example.test', '外社使用者', 'active'),
  ('2c000000-0000-0000-0000-000000000003', '2a000000-0000-0000-0000-000000000003', '2b000000-0000-0000-0000-000000000003', 'affairs-suspended@example.test', '停權社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('2d000000-0000-4000-8000-000000000001', 'AFFAIRS-MEMBER', '社員社務測試社', 'active', now());

insert into public.club_memberships (
  id, club_id, person_id, membership_status, joined_on
) values
  ('2e000000-0000-4000-8000-000000000001', '2d000000-0000-4000-8000-000000000001', '2b000000-0000-0000-0000-000000000001', 'active', current_date - 30),
  ('2e000000-0000-4000-8000-000000000002', '2d000000-0000-4000-8000-000000000001', '2b000000-0000-0000-0000-000000000003', 'suspended', current_date - 30);

-- No member.read role assignment is created for the ordinary member. The
-- successful call therefore proves the new narrow active-membership branch.
set local role authenticated;
select set_config('request.jwt.claim.sub', '2a000000-0000-0000-0000-000000000001', true);
do $check_member$
declare
  page jsonb;
begin
  page := public.get_club_affairs_page('2d000000-0000-4000-8000-000000000001', null, true);
  if page -> 'club' ->> 'club_id' <> '2d000000-0000-4000-8000-000000000001'
     or page -> 'club' ->> 'club_name' <> '社員社務測試社' then
    raise exception 'active member received the wrong 社務 projection: %', page;
  end if;
end;
$check_member$;

select set_config('request.jwt.claim.sub', '2a000000-0000-0000-0000-000000000002', true);
do $check_outsider$
begin
  begin
    perform public.get_club_affairs_page('2d000000-0000-4000-8000-000000000001', null, true);
    raise exception 'an outsider read the club-affairs projection';
  exception when sqlstate '42501' then
    null;
  end;
end;
$check_outsider$;

select set_config('request.jwt.claim.sub', '2a000000-0000-0000-0000-000000000003', true);
do $check_suspended$
begin
  begin
    perform public.get_club_affairs_page('2d000000-0000-4000-8000-000000000001', null, true);
    raise exception 'a suspended member read the club-affairs projection';
  exception when sqlstate '42501' then
    null;
  end;
end;
$check_suspended$;

reset role;
rollback;
