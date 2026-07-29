-- Password-backed member invitation verification. Fixtures are rolled back.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '15000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'password-admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '15000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'password-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '15000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'wrong-member@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email, primary_phone, birth_date) values
  ('25000000-0000-4000-8000-000000000001', '密碼邀請管理員', 'password-admin@example.test', '0900000001', '1980-01-01'),
  ('25000000-0000-4000-8000-000000000002', '密碼受邀社員', 'password-member@example.test', '0911222333', '1985-06-01'),
  ('25000000-0000-4000-8000-000000000003', '錯誤信箱受邀社員', 'expected-member@example.test', '0922333444', '1988-08-08');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name
) values (
  '35000000-0000-4000-8000-000000000001',
  '15000000-0000-4000-8000-000000000001',
  '25000000-0000-4000-8000-000000000001',
  'password-admin@example.test',
  '密碼邀請管理員'
);

insert into public.platform_roles (app_account_id, role_key)
values ('35000000-0000-4000-8000-000000000001', 'superadmin');

insert into public.clubs (
  id, club_code, club_name, club_status, created_by_app_account_id, activated_at
) values (
  '45000000-0000-4000-8000-000000000001',
  'PASSWORD-A',
  '密碼邀請測試扶輪社',
  'active',
  '35000000-0000-4000-8000-000000000001',
  now()
);

insert into public.club_memberships (
  id, club_id, person_id, membership_status, created_by_app_account_id, joined_on
) values
  ('55000000-0000-4000-8000-000000000002', '45000000-0000-4000-8000-000000000001', '25000000-0000-4000-8000-000000000002', 'invited', '35000000-0000-4000-8000-000000000001', current_date),
  ('55000000-0000-4000-8000-000000000003', '45000000-0000-4000-8000-000000000001', '25000000-0000-4000-8000-000000000003', 'invited', '35000000-0000-4000-8000-000000000001', current_date);

insert into public.member_invitations (
  id, club_id, person_id, membership_id, invitation_kind, delivery_method,
  token_hash, token_prefix, invitation_status, invited_by_app_account_id,
  idempotency_key, sent_at
) values
  (
    '65000000-0000-4000-8000-000000000002',
    '45000000-0000-4000-8000-000000000001',
    '25000000-0000-4000-8000-000000000002',
    '55000000-0000-4000-8000-000000000002',
    'member_join', 'email',
    encode(extensions.digest(repeat('a', 64), 'sha256'), 'hex'),
    'aaaaaaaa', 'sent', '35000000-0000-4000-8000-000000000001',
    'password-invite-matching', now()
  ),
  (
    '65000000-0000-4000-8000-000000000003',
    '45000000-0000-4000-8000-000000000001',
    '25000000-0000-4000-8000-000000000003',
    '55000000-0000-4000-8000-000000000003',
    'member_join', 'email',
    encode(extensions.digest(repeat('b', 64), 'sha256'), 'hex'),
    'bbbbbbbb', 'sent', '35000000-0000-4000-8000-000000000001',
    'password-invite-mismatch', now()
  );

-- Public preview discloses only that an Email path exists, not the address itself.
set local role anon;
do $$
declare preview jsonb;
begin
  preview := public.get_member_invitation_preview(repeat('a', 64));
  if coalesce((preview->>'has_email')::boolean, false) is not true
     or preview->>'email' is not null
     or preview->>'phone' is not null
     or preview->>'birth_date' is not null then
    raise exception 'Anonymous invitation preview leaked private profile data.';
  end if;

  begin
    perform public.bind_password_account_from_invitation_trusted(
      repeat('a', 64), '15000000-0000-4000-8000-000000000002'
    );
    raise exception 'Anonymous caller executed trusted password binding.';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

-- A browser session cannot invoke the trusted binder directly.
set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000002', true);
do $$
begin
  begin
    perform public.bind_password_account_from_invitation_trusted(
      repeat('a', 64), '15000000-0000-4000-8000-000000000002'
    );
    raise exception 'Authenticated browser executed trusted password binding.';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

-- Trusted server binds only the Auth user whose verified Email matches the invited person.
set local role service_role;
select public.bind_password_account_from_invitation_trusted(
  repeat('a', 64), '15000000-0000-4000-8000-000000000002'
);
reset role;

-- The newly bound account can inspect and accept its invitation without a LINE identity.
set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000002', true);
do $$
declare
  preview jsonb;
  completed jsonb;
  replay jsonb;
begin
  preview := public.get_member_invitation_preview(repeat('a', 64));
  if preview->>'email' <> 'password-member@example.test'
     or preview->>'phone' <> '0911222333'
     or preview->>'birth_date' <> '1985-06-01' then
    raise exception 'Bound password account could not inspect its own invitation profile.';
  end if;

  completed := public.complete_member_invitation(
    repeat('a', 64),
    '密碼受邀社員',
    '0911-222-333',
    'PASSWORD-MEMBER@example.test',
    '1985-06-01'
  );
  if (completed->>'idempotent')::boolean then
    raise exception 'First password invitation completion was idempotent.';
  end if;

  replay := public.complete_member_invitation(
    repeat('a', 64),
    '密碼受邀社員',
    '0911222333',
    'password-member@example.test',
    '1985-06-01'
  );
  if not (replay->>'idempotent')::boolean then
    raise exception 'Accepted password invitation did not replay idempotently.';
  end if;
end;
$$;
reset role;

do $$
begin
  if not exists (
    select 1
    from public.app_accounts
    where auth_user_id = '15000000-0000-4000-8000-000000000002'
      and person_id = '25000000-0000-4000-8000-000000000002'
      and account_status = 'active'
  ) then
    raise exception 'Password invitation did not create the immutable app account link.';
  end if;

  if not exists (
    select 1
    from public.club_memberships
    where id = '55000000-0000-4000-8000-000000000002'
      and membership_status = 'active'
  ) then
    raise exception 'Password invitation did not activate membership.';
  end if;

  if not exists (
    select 1
    from public.member_invitations
    where id = '65000000-0000-4000-8000-000000000002'
      and invitation_status = 'accepted'
  ) then
    raise exception 'Password invitation was not marked accepted.';
  end if;

  if not exists (
    select 1
    from public.audit_logs
    where action_key = 'password_identity.bound'
      and actor_app_account_id = (
        select id from public.app_accounts
        where auth_user_id = '15000000-0000-4000-8000-000000000002'
      )
  ) then
    raise exception 'Password account binding audit record missing.';
  end if;

  if not exists (
    select 1
    from public.audit_logs
    where action_key = 'member_invitation.accepted'
      and metadata->>'auth_method' = 'password'
      and subject_id = '55000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Password invitation acceptance audit method missing.';
  end if;
end;
$$;

-- A verified Auth Email that does not match the invited person must fail closed.
set local role service_role;
do $$
begin
  begin
    perform public.bind_password_account_from_invitation_trusted(
      repeat('b', 64), '15000000-0000-4000-8000-000000000003'
    );
    raise exception 'Mismatched Email was bound to a member invitation.';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

if false then
  null;
end if;

rollback;
