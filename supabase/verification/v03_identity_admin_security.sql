-- Hardened V0.3 identity, RBAC, invitation, LINE and OA tenant verification.
-- Run only against a freshly reset local Supabase database. All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'hardening-admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'hardening-secretary@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'hardening-finance@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'hardening-invitee@identity.local', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'hardening-outsider@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'hardening-expired-operator@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('22000000-0000-0000-0000-000000000001', '硬化平台管理員', 'hardening-admin@example.test'),
  ('22000000-0000-0000-0000-000000000002', '硬化秘書', 'hardening-secretary@example.test'),
  ('22000000-0000-0000-0000-000000000003', '硬化財務', 'hardening-finance@example.test'),
  ('22000000-0000-0000-0000-000000000005', '硬化外部帳號', 'hardening-outsider@example.test'),
  ('22000000-0000-0000-0000-000000000006', '過期執行秘書', 'hardening-expired-operator@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name
) values
  ('32000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', 'hardening-admin@example.test', '硬化平台管理員'),
  ('32000000-0000-0000-0000-000000000002', '12000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 'hardening-secretary@example.test', '硬化秘書'),
  ('32000000-0000-0000-0000-000000000003', '12000000-0000-0000-0000-000000000003', '22000000-0000-0000-0000-000000000003', 'hardening-finance@example.test', '硬化財務'),
  ('32000000-0000-0000-0000-000000000005', '12000000-0000-0000-0000-000000000005', '22000000-0000-0000-0000-000000000005', 'hardening-outsider@example.test', '硬化外部帳號'),
  ('32000000-0000-0000-0000-000000000006', '12000000-0000-0000-0000-000000000006', '22000000-0000-0000-0000-000000000006', 'hardening-expired-operator@example.test', '過期執行秘書');

insert into public.platform_roles (app_account_id, role_key)
values ('32000000-0000-0000-0000-000000000001', 'superadmin');

insert into public.clubs (
  id, club_code, club_name, club_status, created_by_app_account_id, activated_at
) values
  ('42000000-0000-0000-0000-000000000001', 'HARD-A', '硬化測試扶輪社 A', 'active', '32000000-0000-0000-0000-000000000001', now()),
  ('42000000-0000-0000-0000-000000000002', 'HARD-B', '硬化測試扶輪社 B', 'active', '32000000-0000-0000-0000-000000000001', now());

insert into public.club_memberships (
  id, club_id, person_id, membership_status, created_by_app_account_id, joined_on
) values
  ('52000000-0000-0000-0000-000000000002', '42000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000002', 'active', '32000000-0000-0000-0000-000000000001', current_date),
  ('52000000-0000-0000-0000-000000000003', '42000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000003', 'active', '32000000-0000-0000-0000-000000000001', current_date);

insert into public.club_role_assignments (
  club_id, app_account_id, role_key, granted_by_app_account_id
) values
  ('42000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000002', 'secretary', '32000000-0000-0000-0000-000000000001'),
  ('42000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000003', 'finance', '32000000-0000-0000-0000-000000000001');

insert into public.club_operator_permissions (
  club_id, app_account_id, permission_level, assignment_status,
  starts_at, ends_at, granted_by_app_account_id
) values (
  '42000000-0000-0000-0000-000000000001',
  '32000000-0000-0000-0000-000000000006',
  'club_manager', 'active', now() - interval '2 days', now() - interval '1 day',
  '32000000-0000-0000-0000-000000000001'
);

create temporary table hardening_values (
  key text primary key,
  value text not null
);
grant select on hardening_values to anon, authenticated, service_role;
grant insert on hardening_values to authenticated, service_role;

-- Expired operator assignments and suspended memberships must not authorize.
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000006', true);
do $$
begin
  if exists (
    select 1 from public.list_my_permissions('42000000-0000-0000-0000-000000000001')
  ) then
    raise exception 'Expired operator retained club permissions.';
  end if;
  if exists (
    select 1 from public.list_manageable_clubs()
    where club_id = '42000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Expired operator retained manageable club visibility.';
  end if;
end;
$$;
reset role;

update public.club_memberships
set membership_status = 'suspended'
where id = '52000000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000002', true);
do $$
begin
  if exists (
    select 1 from public.list_my_permissions('42000000-0000-0000-0000-000000000001')
  ) then
    raise exception 'Suspended member retained role permissions.';
  end if;
end;
$$;
reset role;

update public.club_memberships
set membership_status = 'active'
where id = '52000000-0000-0000-0000-000000000002';

-- Role assignment must target an active member of the same club.
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
do $$
begin
  begin
    perform public.assign_club_role(
      '42000000-0000-0000-0000-000000000001',
      '32000000-0000-0000-0000-000000000005',
      'finance'
    );
    raise exception 'Role was assigned to a non-member account.';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

-- Secretary creates a pre-filled invitation.
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000002', true);
do $$
declare
  result jsonb;
begin
  result := public.create_member_invitation(
    '42000000-0000-0000-0000-000000000001',
    '硬化受邀社員',
    '0912-345-678',
    'hardening-invitee@example.test',
    '1985-03-15',
    'line',
    'hardening-member-one'
  );
  if result->>'token' is null or length(result->>'token') <> 64 then
    raise exception 'Invitation token was not returned once.';
  end if;
  insert into hardening_values values
    ('member-token', result->>'token'),
    ('invitation-id', result->>'invitation_id'),
    ('membership-id', result->>'membership_id');
end;
$$;
reset role;

-- Possessing a token while logged into an unrelated account must not reveal private fields.
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000005', true);
do $$
declare
  preview jsonb := public.get_member_invitation_preview(
    (select value from hardening_values where key = 'member-token')
  );
begin
  if preview->>'phone' is not null
     or preview->>'email' is not null
     or preview->>'birth_date' is not null then
    raise exception 'Unrelated authenticated account saw invitation private fields.';
  end if;

  begin
    perform public.bind_line_identity_from_invitation(
      (select value from hardening_values where key = 'member-token'),
      'U-FORGED-SUBJECT-0001', '偽造身份', null, null
    );
    raise exception 'Browser role called legacy LINE binding RPC.';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

-- Only the trusted server boundary can bind a verified LINE subject.
set local role service_role;
do $$
declare
  result jsonb;
begin
  result := public.bind_line_identity_from_invitation_trusted(
    (select value from hardening_values where key = 'member-token'),
    '12000000-0000-0000-0000-000000000004',
    'U-HARDENING-MEMBER-0001',
    'LINE 硬化受邀社員',
    null,
    'hardening-line@example.test'
  );
  insert into hardening_values values
    ('member-account-id', result->>'account_id'),
    ('member-person-id', result->>'person_id');
end;
$$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000004', true);
do $$
declare
  preview jsonb := public.get_member_invitation_preview(
    (select value from hardening_values where key = 'member-token')
  );
  completed jsonb;
begin
  if preview->>'phone' <> '0912345678'
     or preview->>'email' <> 'hardening-invitee@example.test' then
    raise exception 'Verified invitee could not see pre-filled private fields.';
  end if;

  completed := public.complete_member_invitation(
    (select value from hardening_values where key = 'member-token'),
    '硬化受邀社員', '0912345678', 'hardening-invitee@example.test', '1985-03-15'
  );
  if (completed->>'idempotent')::boolean then
    raise exception 'First invitation completion was marked idempotent.';
  end if;
end;
$$;
reset role;

-- Shared identities cannot be globally edited or unbound by one club's secretary.
insert into public.club_memberships (
  id, club_id, person_id, membership_status, created_by_app_account_id, joined_on
) values (
  '52000000-0000-0000-0000-000000000004',
  '42000000-0000-0000-0000-000000000002',
  (select value::uuid from hardening_values where key = 'member-person-id'),
  'active',
  '32000000-0000-0000-0000-000000000001',
  current_date
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000002', true);
do $$
begin
  begin
    perform public.update_member_profile(
      '42000000-0000-0000-0000-000000000001',
      (select value::uuid from hardening_values where key = 'membership-id'),
      '不應跨社改名', '0900000000', 'changed@example.test', null
    );
    raise exception 'Club secretary changed a shared global identity.';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.unbind_line_identity(
      '42000000-0000-0000-0000-000000000001',
      (select value::uuid from hardening_values where key = 'member-account-id'),
      'cross-club denial test',
      true
    );
    raise exception 'Club secretary globally unbound a cross-club identity.';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

-- Platform administrator can perform the global identity operation and receives a rebind token.
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
do $$
declare
  result jsonb;
begin
  result := public.unbind_line_identity(
    '42000000-0000-0000-0000-000000000001',
    (select value::uuid from hardening_values where key = 'member-account-id'),
    'platform-approved cross-club unbind',
    true
  );
  if result->>'rebind_token' is null then
    raise exception 'Platform unbind did not create a rebind token.';
  end if;
end;
$$;

-- Each club receives a separate server environment namespace for OA credentials.
select public.configure_line_oa(
  '42000000-0000-0000-0000-000000000001', '硬化 OA A', '@hardA', 'channel-hard-a', 'active'
);
select public.configure_line_oa(
  '42000000-0000-0000-0000-000000000002', '硬化 OA B', '@hardB', 'channel-hard-b', 'active'
);
reset role;

do $$
declare
  key_a text;
  key_b text;
begin
  select access_token_env_key into key_a
  from public.line_oa_accounts
  where club_id = '42000000-0000-0000-0000-000000000001';

  select access_token_env_key into key_b
  from public.line_oa_accounts
  where club_id = '42000000-0000-0000-0000-000000000002';

  if key_a = key_b
     or key_a <> 'LINE_OA_HARD_A_CHANNEL_ACCESS_TOKEN'
     or key_b <> 'LINE_OA_HARD_B_CHANNEL_ACCESS_TOKEN' then
    raise exception 'OA credential environment keys are not club-scoped.';
  end if;

  if not exists (
    select 1 from public.audit_logs where action_key = 'line_identity.bound'
  ) or not exists (
    select 1 from public.audit_logs where action_key = 'line_identity.unbound'
  ) then
    raise exception 'Hardened identity audit events are missing.';
  end if;
end;
$$;

rollback;
