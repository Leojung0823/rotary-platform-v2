-- Independent-review hardening verification.
-- Run only against Supabase local. All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '13000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'security-admin@example.test', '', now(),
  '{}', '{}', now(), now()
);

insert into public.people (id, canonical_name, primary_email) values
  ('23000000-0000-0000-0000-000000000001', '安全測試管理員', 'security-admin@example.test'),
  ('23000000-0000-0000-0000-000000000002', '乙社既有人物', 'shared-person@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name
) values (
  '33000000-0000-0000-0000-000000000001',
  '13000000-0000-0000-0000-000000000001',
  '23000000-0000-0000-0000-000000000001',
  'security-admin@example.test',
  '安全測試管理員'
);

insert into public.platform_roles (app_account_id, role_key)
values ('33000000-0000-0000-0000-000000000001', 'superadmin');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('53000000-0000-4000-8000-000000000001', 'SEC-A', '安全測試甲社', 'active', now()),
  ('53000000-0000-4000-8000-000000000002', 'SEC-B', '安全測試乙社', 'active', now());

insert into public.club_memberships (club_id, person_id, membership_status)
values ('53000000-0000-4000-8000-000000000002', '23000000-0000-0000-0000-000000000002', 'active');

-- Schema-level requirements.
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'member_invitations_club_idempotency_unique'
      and indexdef like '%(club_id, idempotency_key)%'
  ) then raise exception 'club-scoped invitation idempotency index missing'; end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.member_invitations'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (idempotency_key)'
  ) then raise exception 'global invitation idempotency uniqueness still exists'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'people'
      and column_name = 'identity_status' and is_nullable = 'NO'
  ) then raise exception 'people identity_status missing'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'line_oa_accounts'
      and column_name = 'credential_ref' and is_nullable = 'NO'
  ) then raise exception 'LINE OA credential_ref missing'; end if;

  if exists (
    select 1
    from pg_catalog.pg_index
    where indexrelid = 'public.line_webhooks_provider_event_unique'::regclass
      and indpred is not null
  ) then raise exception 'webhook provider-event uniqueness remains partial'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000001', true);

-- Club A invitation reuses the same club/key and does not mutate the existing Club B person.
do $$
declare
  first_result jsonb;
  replay_result jsonb;
  other_club_result jsonb;
  first_person_id uuid;
  first_invitation_id uuid;
begin
  first_result := public.create_member_invitation(
    '53000000-0000-4000-8000-000000000001',
    '甲社填寫的新姓名',
    null,
    'shared-person@example.test',
    '1985-06-01',
    'link',
    'security-review-shared-key'
  );
  first_invitation_id := (first_result->>'invitation_id')::uuid;

  select person_id into first_person_id
  from public.member_invitations
  where id = first_invitation_id;

  if first_person_id = '23000000-0000-0000-0000-000000000002' then
    raise exception 'invitation reused the existing cross-club person';
  end if;
  if (select canonical_name from public.people where id = '23000000-0000-0000-0000-000000000002') <> '乙社既有人物' then
    raise exception 'invitation overwrote shared Person data';
  end if;
  if (select identity_status from public.people where id = first_person_id) <> 'provisional' then
    raise exception 'invitation person was not provisional';
  end if;
  if (select club_id from public.member_invitations where id = first_invitation_id)
     <> '53000000-0000-4000-8000-000000000001' then
    raise exception 'invitation tenant mismatch';
  end if;

  replay_result := public.create_member_invitation(
    '53000000-0000-4000-8000-000000000001',
    '不應建立第二筆',
    null,
    'different@example.test',
    null,
    'link',
    'security-review-shared-key'
  );
  if (replay_result->>'invitation_id')::uuid <> first_invitation_id
     or coalesce((replay_result->>'idempotent')::boolean, false) is not true
     or replay_result->'token' <> 'null'::jsonb then
    raise exception 'same-club idempotency replay did not return the existing invitation';
  end if;

  other_club_result := public.create_member_invitation(
    '53000000-0000-4000-8000-000000000002',
    '乙社另一位受邀者',
    null,
    'other-club@example.test',
    null,
    'link',
    'security-review-shared-key'
  );
  if (other_club_result->>'invitation_id')::uuid = first_invitation_id then
    raise exception 'same idempotency key collided across clubs';
  end if;
end $$;

reset role;

-- Each OA account receives an independent opaque reference; no secret values are stored.
insert into public.line_oa_accounts (
  club_id, display_name, account_status, created_by_app_account_id
) values
  ('53000000-0000-4000-8000-000000000001', '甲社 OA', 'active', '33000000-0000-0000-0000-000000000001'),
  ('53000000-0000-4000-8000-000000000002', '乙社 OA', 'active', '33000000-0000-0000-0000-000000000001');

do $$
declare refs text[];
begin
  select array_agg(credential_ref order by club_id) into refs
  from public.line_oa_accounts
  where club_id in (
    '53000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-000000000002'
  );
  if array_length(refs, 1) <> 2 or refs[1] = refs[2]
     or refs[1] !~ '^[a-f0-9]{24}$' or refs[2] !~ '^[a-f0-9]{24}$' then
    raise exception 'LINE OA account credential references are not independent opaque values';
  end if;
end $$;

rollback;
