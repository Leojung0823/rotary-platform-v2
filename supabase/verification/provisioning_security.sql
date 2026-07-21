-- Runtime verification for Issue #3. Run against a freshly reset local database only.
-- The transaction is always rolled back and never leaves fixture data behind.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'operator-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'operator-a2@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'ordinary@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('20000000-0000-0000-0000-000000000001', '平台管理員', 'admin@example.test'),
  ('20000000-0000-0000-0000-000000000004', '一般使用者', 'ordinary@example.test');
insert into public.app_accounts (id, auth_user_id, person_id, login_email, account_display_name) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'admin@example.test', '平台管理員'),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000004', 'ordinary@example.test', '一般使用者');
insert into public.platform_roles (app_account_id, role_key)
values ('30000000-0000-0000-0000-000000000001', 'superadmin');

-- Anonymous callers cannot execute any application RPC or read tables.
set local role anon;
do $$
begin
  begin
    perform public.resolve_current_app_account();
    raise exception 'anonymous RPC unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.clubs;
    raise exception 'anonymous table read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- An ordinary authenticated account cannot act as a platform administrator.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
do $$
begin
  begin
    perform public.create_club_with_initial_operator_invitation(
      'NOPE', '不應建立', 'nobody@example.test', 'Nobody', 'verify-ordinary-denied'
    );
    raise exception 'ordinary account created a club';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- Superadmin provisions Club A and Club B using idempotent RPCs.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select public.create_club_with_initial_operator_invitation(
  'CLUB-A', '測試扶輪社 A', 'operator-a@example.test', '執行秘書 A', 'verify-club-a'
);
select public.create_club_with_initial_operator_invitation(
  'CLUB-B', '測試扶輪社 B', 'operator-b@example.test', '執行秘書 B', 'verify-club-b'
);
do $$
declare first_result jsonb; second_result jsonb;
begin
  first_result := public.create_club_with_initial_operator_invitation(
    'CLUB-A', '測試扶輪社 A', 'operator-a@example.test', '執行秘書 A', 'verify-club-a'
  );
  second_result := public.create_club_with_initial_operator_invitation(
    'CLUB-A', '測試扶輪社 A', 'operator-a@example.test', '執行秘書 A', 'verify-club-a'
  );
  if first_result->>'club_id' is distinct from second_result->>'club_id'
     or (second_result->>'idempotent')::boolean is not true then
    raise exception 'club creation is not idempotent';
  end if;
end;
$$;
reset role;

create temporary table verification_ids (key text primary key, id uuid not null);
insert into verification_ids (key, id)
select 'club-a', id from public.clubs where club_code = 'CLUB-A'
union all
select 'club-b', id from public.clubs where club_code = 'CLUB-B';
grant select on verification_ids to authenticated;

-- First invite acceptance creates identity, permission, audit, and activates Club A.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select public.accept_operator_invitation(null);
do $$
declare first_result jsonb; second_result jsonb;
begin
  first_result := public.accept_operator_invitation(null);
  second_result := public.accept_operator_invitation(null);
  if first_result->>'permission_id' is distinct from second_result->>'permission_id'
     or (second_result->>'idempotent')::boolean is not true then
    raise exception 'invite acceptance is not idempotent';
  end if;
end;
$$;

-- Club A operator cannot inspect or mutate Club B.
do $$
declare club_b_id uuid := (select id from verification_ids where key = 'club-b');
begin
  begin
    perform public.list_club_operators_and_invitations(club_b_id);
    raise exception 'Club A operator read Club B';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.invite_additional_operator(
      club_b_id, 'intruder@example.test', 'Intruder', 'verify-cross-club-write'
    );
    raise exception 'Club A operator mutated Club B';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Multiple operators for Club A are supported.
select public.invite_additional_operator(
  (select id from verification_ids where key = 'club-a'),
  'operator-a2@example.test', '執行秘書 A2', 'verify-club-a-second-operator'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select public.accept_operator_invitation(null);
reset role;

insert into verification_ids (key, id)
select 'operator-a-permission', permission.id
from public.club_operator_permissions as permission
join public.app_accounts as account on account.id = permission.app_account_id
where account.auth_user_id = '10000000-0000-0000-0000-000000000002'
union all
select 'operator-a2-permission', permission.id
from public.club_operator_permissions as permission
join public.app_accounts as account on account.id = permission.app_account_id
where account.auth_user_id = '10000000-0000-0000-0000-000000000003';

do $$
begin
  if (select count(*) from public.club_operator_permissions as permission
      join public.clubs as club on club.id = permission.club_id
      where club.club_code = 'CLUB-A' and permission.assignment_status = 'active') <> 2 then
    raise exception 'Club A does not have two active operators';
  end if;
end;
$$;

-- Member/operator exclusivity is enforced in both directions.
do $$
declare operator_person_id uuid := (
  select account.person_id from public.app_accounts as account
  where account.auth_user_id = '10000000-0000-0000-0000-000000000002'
);
declare club_b_id uuid := (select id from public.clubs where club_code = 'CLUB-B');
begin
  begin
    insert into public.club_memberships (club_id, person_id) values (club_b_id, operator_person_id);
    raise exception 'active operator received active membership';
  exception when check_violation then null;
  end;
end;
$$;

insert into public.people (id, canonical_name, primary_email)
values ('20000000-0000-0000-0000-000000000005', '跨社社友', 'member@example.test');
insert into public.club_memberships (club_id, person_id)
select id, '20000000-0000-0000-0000-000000000005' from public.clubs where club_code in ('CLUB-A', 'CLUB-B');
do $$
declare club_a_id uuid := (select id from public.clubs where club_code = 'CLUB-A');
begin
  begin
    insert into public.club_memberships (club_id, person_id)
    values (club_a_id, '20000000-0000-0000-0000-000000000005');
    raise exception 'duplicate active same-club membership succeeded';
  exception when unique_violation then null;
  end;
end;
$$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'member@example.test', '', now(), '{}', '{}', now(), now());
insert into public.app_accounts (auth_user_id, person_id, login_email, account_display_name)
values ('10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000005', 'member@example.test', '跨社社友');
do $$
declare member_account_id uuid := (select id from public.app_accounts where login_email_normalized = 'member@example.test');
declare club_a_id uuid := (select id from public.clubs where club_code = 'CLUB-A');
begin
  begin
    insert into public.club_operator_permissions (club_id, app_account_id)
    values (club_a_id, member_account_id);
    raise exception 'active member received active operator permission';
  exception when check_violation then null;
  end;
end;
$$;

-- Normal operator may revoke one of two operators, but not the last active operator.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select public.revoke_operator(
  (select id from verification_ids where key = 'club-a'),
  (select id from verification_ids where key = 'operator-a2-permission'),
  'verification first revoke'
);
do $$
declare club_a_id uuid := (select id from verification_ids where key = 'club-a');
declare last_permission_id uuid := (select id from verification_ids where key = 'operator-a-permission');
begin
  begin
    perform public.revoke_operator(club_a_id, last_permission_id, 'must be blocked');
    raise exception 'normal operator revoked the last active operator';
  exception when check_violation then null;
  end;
end;
$$;
reset role;

do $$
begin
  if not exists (select 1 from public.audit_logs where action_key = 'club.created')
     or not exists (select 1 from public.audit_logs where action_key = 'operator_invite.accepted')
     or not exists (select 1 from public.audit_logs where action_key = 'operator.revoked') then
    raise exception 'required privileged mutation audit rows are missing';
  end if;
end;
$$;

rollback;
