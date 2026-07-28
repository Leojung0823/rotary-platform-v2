-- Verifies shared-person mutation protection, active-member OA pairing and webhook idempotency.
-- Run only against a freshly reset local Supabase database. All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '13000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'tenant-admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '13000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'tenant-secretary@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email, primary_phone) values
  ('23000000-0000-0000-0000-000000000001', '租戶平台管理員', 'tenant-admin@example.test', null),
  ('23000000-0000-0000-0000-000000000002', '租戶秘書', 'tenant-secretary@example.test', null),
  ('23000000-0000-0000-0000-000000000003', '跨社共用真人', 'shared-person@example.test', '0911222333');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name
) values
  ('33000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', 'tenant-admin@example.test', '租戶平台管理員'),
  ('33000000-0000-0000-0000-000000000002', '13000000-0000-0000-0000-000000000002', '23000000-0000-0000-0000-000000000002', 'tenant-secretary@example.test', '租戶秘書');

insert into public.platform_roles (app_account_id, role_key)
values ('33000000-0000-0000-0000-000000000001', 'superadmin');

insert into public.clubs (
  id, club_code, club_name, club_status, created_by_app_account_id, activated_at
) values
  ('43000000-0000-0000-0000-000000000001', 'TENANT-A', '租戶測試社 A', 'active', '33000000-0000-0000-0000-000000000001', now()),
  ('43000000-0000-0000-0000-000000000002', 'TENANT-B', '租戶測試社 B', 'active', '33000000-0000-0000-0000-000000000001', now()),
  ('43000000-0000-0000-0000-000000000003', 'COLLIDE-A', '憑證碰撞測試社一', 'active', '33000000-0000-0000-0000-000000000001', now()),
  ('43000000-0000-0000-0000-000000000004', 'COLLIDE_A', '憑證碰撞測試社二', 'active', '33000000-0000-0000-0000-000000000001', now());

insert into public.club_memberships (
  id, club_id, person_id, membership_status, created_by_app_account_id, joined_on
) values
  ('53000000-0000-0000-0000-000000000001', '43000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000002', 'active', '33000000-0000-0000-0000-000000000001', current_date),
  ('53000000-0000-0000-0000-000000000002', '43000000-0000-0000-0000-000000000002', '23000000-0000-0000-0000-000000000003', 'active', '33000000-0000-0000-0000-000000000001', current_date);

insert into public.club_role_assignments (
  club_id, app_account_id, role_key, granted_by_app_account_id
) values (
  '43000000-0000-0000-0000-000000000001',
  '33000000-0000-0000-0000-000000000002',
  'secretary',
  '33000000-0000-0000-0000-000000000001'
);

-- Club A may invite an existing Club B person by matching contact details, but it
-- must not rewrite the shared global person record.
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000002', true);
do $$
declare
  result jsonb;
begin
  result := public.create_member_invitation(
    '43000000-0000-0000-0000-000000000001',
    '不應覆寫的姓名',
    '0911-222-333',
    'shared-person@example.test',
    '1990-01-01',
    'link',
    'tenant-shared-person-invite'
  );
  if result->>'invitation_id' is null then
    raise exception 'Shared-person invitation was not created.';
  end if;
end;
$$;
reset role;

do $$
begin
  if (select canonical_name from public.people where id = '23000000-0000-0000-0000-000000000003') <> '跨社共用真人' then
    raise exception 'A club invitation rewrote another club shared person name.';
  end if;
  if (select birth_date from public.people where id = '23000000-0000-0000-0000-000000000003') is not null then
    raise exception 'A club invitation filled another club shared person birth date.';
  end if;
  if not exists (
    select 1 from public.club_memberships
    where club_id = '43000000-0000-0000-0000-000000000001'
      and person_id = '23000000-0000-0000-0000-000000000003'
      and membership_status = 'invited'
  ) then
    raise exception 'Expected invited Club A membership was not created.';
  end if;
end;
$$;

-- OA pairing must use an active member of the same club, not merely a person who
-- belongs to some other club or has only an invited membership.
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000002', true);
select public.configure_line_oa(
  '43000000-0000-0000-0000-000000000001', '租戶測試 OA', '@tenant', 'channel-tenant', 'active'
);
do $$
begin
  begin
    perform public.pair_line_oa_follower(
      '43000000-0000-0000-0000-000000000001',
      'U-TENANT-OUTSIDE-0001',
      '23000000-0000-0000-0000-000000000003'
    );
    raise exception 'OA follower was paired to a non-active Club A member.';
  exception when no_data_found then
    null;
  end;
end;
$$;
reset role;

-- Invalid-signature telemetry must not reserve the provider event id. The first
-- valid event may be inserted once, and a second valid duplicate must be rejected.
do $$
declare
  oa_id uuid := (
    select id from public.line_oa_accounts
    where club_id = '43000000-0000-0000-0000-000000000001'
      and account_status <> 'disabled'
  );
begin
  insert into public.line_webhooks (
    line_oa_account_id, club_id, event_type, provider_event_id,
    signature_valid, payload_hash, processing_status, failure_code
  ) values (
    oa_id, '43000000-0000-0000-0000-000000000001', 'follow', 'evt-tenant-001',
    false, repeat('a', 64), 'ignored', 'invalid_signature'
  );

  insert into public.line_webhooks (
    line_oa_account_id, club_id, event_type, provider_event_id,
    signature_valid, payload_hash, processing_status
  ) values (
    oa_id, '43000000-0000-0000-0000-000000000001', 'follow', 'evt-tenant-001',
    true, repeat('b', 64), 'received'
  );

  begin
    insert into public.line_webhooks (
      line_oa_account_id, club_id, event_type, provider_event_id,
      signature_valid, payload_hash, processing_status
    ) values (
      oa_id, '43000000-0000-0000-0000-000000000001', 'follow', 'evt-tenant-001',
      true, repeat('c', 64), 'received'
    );
    raise exception 'A duplicate valid provider event was accepted.';
  exception when unique_violation then
    null;
  end;
end;
$$;

-- Sanitized environment namespaces must not be shared by two active clubs.
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000001', true);
select public.configure_line_oa(
  '43000000-0000-0000-0000-000000000003', '碰撞 OA 一', '@collision1', 'channel-collision-1', 'active'
);
do $$
begin
  begin
    perform public.configure_line_oa(
      '43000000-0000-0000-0000-000000000004', '碰撞 OA 二', '@collision2', 'channel-collision-2', 'active'
    );
    raise exception 'Two active clubs shared the same OA credential namespace.';
  exception when unique_violation then
    null;
  end;
end;
$$;
reset role;

rollback;
