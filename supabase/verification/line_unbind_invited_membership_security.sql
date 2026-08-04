-- Regression coverage for administrator LINE unbind on an invited, disabled account.
-- Run only against a freshly reset local database. All fixtures are rolled back.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '18000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'invited-unbind-secretary@example.test',
    'password-hash', now(), '{}', '{}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '18000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'invited-unbind-member@example.test',
    'password-hash', now(), '{}', '{}', now(), now()
  );

insert into public.people (
  id, canonical_name, primary_email, primary_phone
) values
  (
    '28000000-0000-4000-8000-000000000001',
    '邀請解除測試秘書', 'invited-unbind-secretary@example.test', '0918000001'
  ),
  (
    '28000000-0000-4000-8000-000000000002',
    '邀請解除測試社員', 'invited-unbind-member@example.test', '0918000002'
  );

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  (
    '38000000-0000-4000-8000-000000000001',
    '18000000-0000-4000-8000-000000000001',
    '28000000-0000-4000-8000-000000000001',
    'invited-unbind-secretary@example.test', '邀請解除測試秘書', 'active'
  ),
  (
    '38000000-0000-4000-8000-000000000002',
    '18000000-0000-4000-8000-000000000002',
    '28000000-0000-4000-8000-000000000002',
    'invited-unbind-member@example.test', '邀請解除測試社員', 'disabled'
  );

insert into public.clubs (
  id, club_code, club_name, club_status, created_by_app_account_id, activated_at
) values (
  '48000000-0000-4000-8000-000000000001',
  'INVITED-UNBIND', '邀請解除測試扶輪社', 'active',
  '38000000-0000-4000-8000-000000000001', now()
);

insert into public.club_memberships (
  id, club_id, person_id, membership_status, created_by_app_account_id, joined_on
) values (
  '58000000-0000-4000-8000-000000000001',
  '48000000-0000-4000-8000-000000000001',
  '28000000-0000-4000-8000-000000000001',
  'active', '38000000-0000-4000-8000-000000000001', current_date
);

insert into public.club_memberships (
  id, club_id, person_id, membership_status, created_by_app_account_id
) values (
  '58000000-0000-4000-8000-000000000002',
  '48000000-0000-4000-8000-000000000001',
  '28000000-0000-4000-8000-000000000002',
  'invited', '38000000-0000-4000-8000-000000000001'
);

insert into public.club_role_assignments (
  club_id, app_account_id, role_key, granted_by_app_account_id
) values (
  '48000000-0000-4000-8000-000000000001',
  '38000000-0000-4000-8000-000000000001',
  'secretary', '38000000-0000-4000-8000-000000000001'
);

insert into public.line_identities (
  id, person_id, app_account_id, provider_subject, display_name, email,
  identity_status, last_login_at
) values (
  '68000000-0000-4000-8000-000000000001',
  '28000000-0000-4000-8000-000000000002',
  '38000000-0000-4000-8000-000000000002',
  'UINVITEDUNBIND0001', '邀請解除測試社員 LINE',
  'invited-unbind-member@example.test', 'active', now()
);

insert into public.user_devices (
  id, app_account_id, device_fingerprint_hash, device_name, trusted
) values (
  '78000000-0000-4000-8000-000000000001',
  '38000000-0000-4000-8000-000000000002',
  repeat('c', 64), '邀請中社員裝置', true
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '18000000-0000-4000-8000-000000000001',
  true
);

do $$
declare
  result jsonb;
begin
  result := public.unbind_line_identity(
    '48000000-0000-4000-8000-000000000001',
    '38000000-0000-4000-8000-000000000002',
    '解除邀請中停用帳號的 LINE Login',
    true
  );

  if not (result->>'unbound')::boolean
     or (result->>'idempotent')::boolean
     or result->>'rebind_token' is not null
     or result->>'rebind_invitation_id' is not null then
    raise exception 'Invited disabled account LINE unbind returned an unexpected result: %', result;
  end if;
end;
$$;

reset role;

do $$
begin
  if exists (
    select 1
    from public.line_identities
    where app_account_id = '38000000-0000-4000-8000-000000000002'
      and identity_status = 'active'
  ) then
    raise exception 'Invited account LINE identity remained active after administrator unbind.';
  end if;

  if not exists (
    select 1
    from public.line_identities
    where id = '68000000-0000-4000-8000-000000000001'
      and identity_status = 'unbound'
      and unbound_at is not null
      and unbound_by_app_account_id = '38000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Invited account LINE identity history was not preserved as unbound.';
  end if;

  if exists (
    select 1
    from public.user_devices
    where app_account_id = '38000000-0000-4000-8000-000000000002'
      and (revoked_at is null or trusted)
  ) then
    raise exception 'Invited account device was not revoked during LINE unbind.';
  end if;

  if exists (
    select 1
    from public.member_invitations
    where membership_id = '58000000-0000-4000-8000-000000000002'
      and invitation_kind = 'line_rebind'
      and invitation_status in ('pending', 'sent')
  ) then
    raise exception 'Disabled invited account unexpectedly received a LINE rebind invitation.';
  end if;

  if not exists (
    select 1
    from public.audit_logs
    where club_id = '48000000-0000-4000-8000-000000000001'
      and actor_app_account_id = '38000000-0000-4000-8000-000000000001'
      and action_key = 'line_identity.unbound'
      and subject_id = '68000000-0000-4000-8000-000000000001'
      and metadata->>'reason' = '解除邀請中停用帳號的 LINE Login'
      and (metadata->>'rebind_created')::boolean = false
  ) then
    raise exception 'Invited account LINE unbind audit record was missing or incomplete.';
  end if;

  if not exists (
    select 1
    from public.app_accounts
    where id = '38000000-0000-4000-8000-000000000002'
      and account_status = 'disabled'
  ) or not exists (
    select 1
    from public.club_memberships
    where id = '58000000-0000-4000-8000-000000000002'
      and membership_status = 'invited'
  ) then
    raise exception 'LINE unbind changed the invited member account or membership lifecycle.';
  end if;
end;
$$;

rollback;
