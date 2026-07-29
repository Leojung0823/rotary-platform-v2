-- Member LINE binding, rebind, account lifecycle and entitlement verification.
-- Run only against a freshly reset local database. All fixtures are rolled back.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '16000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'lifecycle-super-one@example.test', 'password-hash', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '16000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'lifecycle-super-two@example.test', 'password-hash', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000003', '16000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'lifecycle-secretary@example.test', 'password-hash', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '16000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'lifecycle-member@example.test', 'password-hash', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '16000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'lifecycle-outsider@example.test', 'password-hash', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email, primary_phone) values
  ('26000000-0000-4000-8000-000000000001', '生命週期超級管理員一', 'lifecycle-super-one@example.test', '0900000001'),
  ('26000000-0000-4000-8000-000000000002', '生命週期超級管理員二', 'lifecycle-super-two@example.test', '0900000002'),
  ('26000000-0000-4000-8000-000000000003', '生命週期秘書', 'lifecycle-secretary@example.test', '0900000003'),
  ('26000000-0000-4000-8000-000000000004', '生命週期社員', 'lifecycle-member@example.test', '0900000004'),
  ('26000000-0000-4000-8000-000000000005', '生命週期外部帳號', 'lifecycle-outsider@example.test', '0900000005');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name
) values
  ('36000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', 'lifecycle-super-one@example.test', '生命週期超級管理員一'),
  ('36000000-0000-4000-8000-000000000002', '16000000-0000-4000-8000-000000000002', '26000000-0000-4000-8000-000000000002', 'lifecycle-super-two@example.test', '生命週期超級管理員二'),
  ('36000000-0000-4000-8000-000000000003', '16000000-0000-4000-8000-000000000003', '26000000-0000-4000-8000-000000000003', 'lifecycle-secretary@example.test', '生命週期秘書'),
  ('36000000-0000-4000-8000-000000000004', '16000000-0000-4000-8000-000000000004', '26000000-0000-4000-8000-000000000004', 'lifecycle-member@example.test', '生命週期社員'),
  ('36000000-0000-4000-8000-000000000005', '16000000-0000-4000-8000-000000000005', '26000000-0000-4000-8000-000000000005', 'lifecycle-outsider@example.test', '生命週期外部帳號');

insert into public.platform_roles (app_account_id, role_key) values
  ('36000000-0000-4000-8000-000000000001', 'superadmin'),
  ('36000000-0000-4000-8000-000000000002', 'superadmin');

insert into public.clubs (
  id, club_code, club_name, club_status, created_by_app_account_id, activated_at
) values (
  '46000000-0000-4000-8000-000000000001', 'LIFECYCLE-A', '生命週期測試扶輪社',
  'active', '36000000-0000-4000-8000-000000000001', now()
);

insert into public.club_memberships (
  id, club_id, person_id, membership_status, created_by_app_account_id, joined_on
) values
  ('56000000-0000-4000-8000-000000000003', '46000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000003', 'active', '36000000-0000-4000-8000-000000000001', current_date),
  ('56000000-0000-4000-8000-000000000004', '46000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000004', 'active', '36000000-0000-4000-8000-000000000001', current_date);

insert into public.club_role_assignments (
  club_id, app_account_id, role_key, granted_by_app_account_id
) values
  ('46000000-0000-4000-8000-000000000001', '36000000-0000-4000-8000-000000000003', 'secretary', '36000000-0000-4000-8000-000000000001'),
  ('46000000-0000-4000-8000-000000000001', '36000000-0000-4000-8000-000000000004', 'member', '36000000-0000-4000-8000-000000000001');

insert into public.user_devices (
  id, app_account_id, device_fingerprint_hash, device_name, trusted
) values
  ('76000000-0000-4000-8000-000000000001', '36000000-0000-4000-8000-000000000004', repeat('a', 64), '社員手機', true),
  ('76000000-0000-4000-8000-000000000002', '36000000-0000-4000-8000-000000000004', repeat('b', 64), '社員電腦', true);

create temporary table lifecycle_values (
  key text primary key,
  value text not null
);
grant select on lifecycle_values to authenticated, service_role;
grant insert on lifecycle_values to authenticated, service_role;

-- Ordinary members cannot inspect account/session lifecycle data.
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000004', true);
do $$
begin
  if not public.current_account_has_active_access() then
    raise exception 'Active member did not have active account access.';
  end if;

  begin
    perform public.get_member_account_lifecycle(
      '46000000-0000-4000-8000-000000000001',
      '56000000-0000-4000-8000-000000000004'
    );
    raise exception 'Authenticated browser executed deprecated lifecycle projection.';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.get_member_account_lifecycle_admin(
      '46000000-0000-4000-8000-000000000001',
      '56000000-0000-4000-8000-000000000004'
    );
    raise exception 'Ordinary member inspected account lifecycle data.';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.bind_line_identity_to_existing_account_trusted(
      '16000000-0000-4000-8000-000000000004', 'ULIFECYCLE0001',
      '社員 LINE', null, 'lifecycle-member@example.test'
    );
    raise exception 'Authenticated browser executed trusted LINE binding.';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.unbind_my_line_identity_trusted(
      '16000000-0000-4000-8000-000000000004', 'forged browser call'
    );
    raise exception 'Authenticated browser executed trusted self unbind.';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

-- Secretary can inspect the lifecycle projection, but not the raw deprecated RPC.
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000003', true);
do $$
declare lifecycle jsonb;
begin
  lifecycle := public.get_member_account_lifecycle_admin(
    '46000000-0000-4000-8000-000000000001',
    '56000000-0000-4000-8000-000000000004'
  );
  if not (lifecycle->>'has_account')::boolean
     or lifecycle->>'account_status' <> 'active'
     or not (lifecycle->>'has_password_login')::boolean
     or (lifecycle->>'active_devices')::integer <> 2 then
    raise exception 'Secretary lifecycle projection was incomplete.';
  end if;
end;
$$;
reset role;

-- Only the trusted callback boundary can bind a verified LINE subject.
set local role service_role;
do $$
declare result jsonb;
begin
  if not public.account_has_active_access('36000000-0000-4000-8000-000000000004') then
    raise exception 'Service role could not evaluate account entitlement.';
  end if;

  result := public.bind_line_identity_to_existing_account_trusted(
    '16000000-0000-4000-8000-000000000004', 'ULIFECYCLE0001',
    '社員 LINE', null, 'lifecycle-member@example.test'
  );
  if result->>'line_identity_id' is null then
    raise exception 'Trusted existing-account LINE binding failed.';
  end if;
end;
$$;
reset role;

-- Secretary unbinds LINE; all devices are revoked and a one-time rebind is created.
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000003', true);
do $$
declare result jsonb;
begin
  result := public.unbind_line_identity(
    '46000000-0000-4000-8000-000000000001',
    '36000000-0000-4000-8000-000000000004',
    '社員更換 LINE 帳號', true
  );
  if result->>'rebind_token' is null or length(result->>'rebind_token') <> 64 then
    raise exception 'LINE unbind did not create a rebind token.';
  end if;
  insert into lifecycle_values values ('rebind-token-one', result->>'rebind_token');
end;
$$;
reset role;

do $$
begin
  if exists (
    select 1 from public.line_identities
    where app_account_id = '36000000-0000-4000-8000-000000000004'
      and identity_status = 'active'
  ) then
    raise exception 'LINE identity remained active after unbind.';
  end if;

  if exists (
    select 1 from public.user_devices
    where app_account_id = '36000000-0000-4000-8000-000000000004'
      and revoked_at is null
  ) then
    raise exception 'Active devices remained after LINE unbind.';
  end if;

  if not exists (
    select 1 from public.member_invitations
    where invitation_kind = 'line_rebind'
      and invitation_status = 'sent'
      and token_hash = encode(extensions.digest(
        (select value from lifecycle_values where key = 'rebind-token-one'), 'sha256'
      ), 'hex')
  ) then
    raise exception 'Rebind invitation was not persisted safely.';
  end if;
end;
$$;

-- Rebind reactivates the historical identity and consumes the invitation.
set local role service_role;
do $$
declare result jsonb;
begin
  result := public.bind_line_identity_from_invitation_trusted(
    (select value from lifecycle_values where key = 'rebind-token-one'),
    '16000000-0000-4000-8000-000000000004',
    'ULIFECYCLE0001', '社員 LINE 重新綁定', null,
    'lifecycle-member@example.test'
  );
  if result->>'invitation_kind' <> 'line_rebind'
     or not (result->>'invitation_completed')::boolean then
    raise exception 'LINE rebind invitation did not complete atomically.';
  end if;
end;
$$;
reset role;

-- A second rapid unbind must receive a random idempotency key and not collide.
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000003', true);
do $$
declare result jsonb;
begin
  result := public.unbind_line_identity(
    '46000000-0000-4000-8000-000000000001',
    '36000000-0000-4000-8000-000000000004',
    '再次測試重新綁定', true
  );
  insert into lifecycle_values values ('rebind-token-two', result->>'rebind_token');
end;
$$;
reset role;

do $$
begin
  if (select count(distinct idempotency_key)
      from public.member_invitations
      where invitation_kind = 'line_rebind'
        and person_id = '26000000-0000-4000-8000-000000000004') <> 2 then
    raise exception 'Rapid rebind invitations reused an idempotency key.';
  end if;
end;
$$;

-- Membership suspension removes entitlement immediately and revokes devices.
update public.user_devices
set revoked_at = null, trusted = true
where app_account_id = '36000000-0000-4000-8000-000000000004';

set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000003', true);
select public.set_membership_status(
  '46000000-0000-4000-8000-000000000001',
  '56000000-0000-4000-8000-000000000004',
  'suspended', '安全驗證暫停社籍'
);
reset role;

set local role service_role;
do $$
begin
  if public.account_has_active_access('36000000-0000-4000-8000-000000000004') then
    raise exception 'Suspended sole membership retained active access.';
  end if;
end;
$$;
reset role;

do $$
begin
  if exists (
    select 1 from public.user_devices
    where app_account_id = '36000000-0000-4000-8000-000000000004'
      and revoked_at is null
  ) then
    raise exception 'Membership suspension did not revoke devices.';
  end if;
end;
$$;

-- Reactivation restores entitlement; global account suspension removes it again.
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000003', true);
select public.set_membership_status(
  '46000000-0000-4000-8000-000000000001',
  '56000000-0000-4000-8000-000000000004',
  'active', '恢復社籍'
);
select public.set_member_account_status(
  '46000000-0000-4000-8000-000000000001',
  '36000000-0000-4000-8000-000000000004',
  'suspended', '全平台帳號安全暫停'
);
reset role;

set local role service_role;
do $$
begin
  if public.account_has_active_access('36000000-0000-4000-8000-000000000004') then
    raise exception 'Suspended application account retained active access.';
  end if;
end;
$$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000003', true);
select public.set_member_account_status(
  '46000000-0000-4000-8000-000000000001',
  '36000000-0000-4000-8000-000000000004',
  'active', '恢復平台帳號'
);
reset role;

-- The database must never allow the last active superadmin account to be deactivated.
update public.app_accounts
set account_status = 'suspended'
where id = '36000000-0000-4000-8000-000000000001';

do $$
begin
  begin
    update public.app_accounts
    set account_status = 'disabled'
    where id = '36000000-0000-4000-8000-000000000002';
    raise exception 'Last active superadmin account was disabled.';
  exception when check_violation then
    null;
  end;
end;
$$;

update public.app_accounts
set account_status = 'active'
where id = '36000000-0000-4000-8000-000000000001';

-- Required audit events exist without raw token or provider subject disclosure.
do $$
begin
  if not exists (
    select 1 from public.audit_logs
    where action_key = 'line_identity.bound'
      and actor_app_account_id = '36000000-0000-4000-8000-000000000004'
  ) or not exists (
    select 1 from public.audit_logs
    where action_key = 'line_identity.unbound'
      and actor_app_account_id = '36000000-0000-4000-8000-000000000003'
  ) or not exists (
    select 1 from public.audit_logs
    where action_key = 'line_identity.rebound'
      and actor_app_account_id = '36000000-0000-4000-8000-000000000004'
  ) or not exists (
    select 1 from public.audit_logs
    where action_key = 'membership.status_changed'
      and subject_id = '56000000-0000-4000-8000-000000000004'
  ) or not exists (
    select 1 from public.audit_logs
    where action_key = 'account.status_changed'
      and subject_id = '36000000-0000-4000-8000-000000000004'
  ) then
    raise exception 'Required lifecycle audit records are missing.';
  end if;

  if exists (
    select 1 from public.audit_logs
    where metadata::text like '%' || (select value from lifecycle_values where key = 'rebind-token-one') || '%'
       or metadata::text like '%ULIFECYCLE0001%'
  ) then
    raise exception 'Audit metadata leaked a raw token or LINE provider subject.';
  end if;
end;
$$;

rollback;
