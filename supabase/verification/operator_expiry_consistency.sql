-- Verify operator permission expiry semantics against a freshly reset local database.
-- All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'expiry-admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'expiry-operator-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'expiry-operator-b@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'expiry-person-c@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('21000000-0000-0000-0000-000000000001', '到期測試管理員', 'expiry-admin@example.test'),
  ('21000000-0000-0000-0000-000000000002', '有效秘書 A', 'expiry-operator-a@example.test'),
  ('21000000-0000-0000-0000-000000000003', '重新指派秘書 B', 'expiry-operator-b@example.test'),
  ('21000000-0000-0000-0000-000000000004', '已到期人員 C', 'expiry-person-c@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name
) values
  ('31000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 'expiry-admin@example.test', '到期測試管理員'),
  ('31000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000002', 'expiry-operator-a@example.test', '有效秘書 A'),
  ('31000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000003', '21000000-0000-0000-0000-000000000003', 'expiry-operator-b@example.test', '重新指派秘書 B'),
  ('31000000-0000-0000-0000-000000000004', '11000000-0000-0000-0000-000000000004', '21000000-0000-0000-0000-000000000004', 'expiry-person-c@example.test', '已到期人員 C');

insert into public.platform_roles (app_account_id, role_key)
values ('31000000-0000-0000-0000-000000000001', 'superadmin');

insert into public.clubs (
  id, club_code, club_name, club_status, created_by_app_account_id, activated_at
) values (
  '41000000-0000-0000-0000-000000000001', 'EXPIRY-CLUB', '權限到期測試社', 'active',
  '31000000-0000-0000-0000-000000000001', now()
);

-- A is the currently effective club manager.
insert into public.club_operator_permissions (
  id, club_id, app_account_id, permission_level, assignment_status, starts_at
) values (
  '51000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000002',
  'club_manager', 'active', now() - interval '1 day'
);

-- A newly inserted already-ended assignment is normalized to expired.
insert into public.club_operator_permissions (
  id, club_id, app_account_id, permission_level, assignment_status, starts_at, ends_at
) values (
  '51000000-0000-0000-0000-000000000004',
  '41000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000004',
  'club_manager', 'active', now() - interval '2 days', now() - interval '1 day'
);

do $$
begin
  if (select assignment_status from public.club_operator_permissions
      where id = '51000000-0000-0000-0000-000000000004') <> 'expired' then
    raise exception 'already-ended assignment was not normalized to expired';
  end if;
end;
$$;

-- The expired assignment no longer blocks active Rotary membership.
insert into public.club_memberships (
  id, club_id, person_id, membership_status, created_by_app_account_id
) values (
  '61000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000004',
  'active', '31000000-0000-0000-0000-000000000001'
);

-- Simulate a legacy row whose time elapsed before the consistency migration.
alter table public.club_operator_permissions
  disable trigger aa_club_operator_permissions_prepare_insert;
insert into public.club_operator_permissions (
  id, club_id, app_account_id, permission_level, assignment_status, starts_at, ends_at
) values (
  '51000000-0000-0000-0000-000000000002',
  '41000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000003',
  'club_manager', 'active', now() - interval '2 days', now() - interval '1 day'
);
alter table public.club_operator_permissions
  enable trigger aa_club_operator_permissions_prepare_insert;

-- A fresh assignment for the same account expires the stale row before the
-- partial unique index is evaluated.
insert into public.club_operator_permissions (
  id, club_id, app_account_id, permission_level, assignment_status, starts_at
) values (
  '51000000-0000-0000-0000-000000000003',
  '41000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000003',
  'club_manager', 'active', now() - interval '1 hour'
);

do $$
begin
  if (select assignment_status from public.club_operator_permissions
      where id = '51000000-0000-0000-0000-000000000002') <> 'expired' then
    raise exception 'stale assignment was not expired before reassignment';
  end if;
  if (select assignment_status from public.club_operator_permissions
      where id = '51000000-0000-0000-0000-000000000003') <> 'active' then
    raise exception 'replacement assignment is not active';
  end if;
end;
$$;

-- Operator A can revoke B while two effective managers exist.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);
select public.revoke_operator(
  '41000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000003',
  '驗證有效秘書計數'
);

-- A cannot revoke the final effective manager. Expired rows must not inflate
-- the last-operator count.
do $$
begin
  begin
    perform public.revoke_operator(
      '41000000-0000-0000-0000-000000000001',
      '51000000-0000-0000-0000-000000000001',
      '不應允許移除最後有效秘書'
    );
    raise exception 'last effective operator was revoked';
  exception when check_violation then null;
  end;
end;
$$;

-- Read models report the same effective state.
do $$
declare
  status_result jsonb;
  listing jsonb;
begin
  status_result := public.get_club_provisioning_status(
    '41000000-0000-0000-0000-000000000001'
  );
  if (status_result->>'active_operator_count')::integer <> 1 then
    raise exception 'provisioning status counted non-effective operators';
  end if;

  listing := public.list_club_operators_and_invitations(
    '41000000-0000-0000-0000-000000000001'
  );
  if not exists (
    select 1
    from jsonb_array_elements(listing->'operators') as item
    where item->>'email' = 'expiry-person-c@example.test'
      and item->>'assignment_status' = 'expired'
  ) then
    raise exception 'operator listing did not expose effective expired status';
  end if;
end;
$$;
reset role;

rollback;
