-- LINE OA follow-event automatic pairing verification.
-- Run only against a freshly reset local database. All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'line-pair-admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'line-pair-success@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'line-pair-conflict@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'line-pair-outsider@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'line-pair-suspended@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'line-pair-ended@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'line-pair-blocked@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'line-pair-manual-target@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000009', 'authenticated', 'authenticated', 'line-pair-closed@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('a2000000-0000-4000-8000-000000000001', '配對驗證平台管理員', 'line-pair-admin@example.test'),
  ('a2000000-0000-4000-8000-000000000002', '配對成功社員', 'line-pair-success@example.test'),
  ('a2000000-0000-4000-8000-000000000003', '配對衝突社員', 'line-pair-conflict@example.test'),
  ('a2000000-0000-4000-8000-000000000004', '配對外社社員', 'line-pair-outsider@example.test'),
  ('a2000000-0000-4000-8000-000000000005', '配對停權社員', 'line-pair-suspended@example.test'),
  ('a2000000-0000-4000-8000-000000000006', '配對退社社員', 'line-pair-ended@example.test'),
  ('a2000000-0000-4000-8000-000000000007', '配對非啟用身份社員', 'line-pair-blocked@example.test'),
  ('a2000000-0000-4000-8000-000000000008', '配對手動目標社員', 'line-pair-manual-target@example.test'),
  ('a2000000-0000-4000-8000-000000000009', '配對關閉旗標社員', 'line-pair-closed@example.test'),
  ('a2000000-0000-4000-8000-000000000011', '配對手動既有社員', 'line-pair-manual-old@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('a3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'line-pair-admin@example.test', '配對驗證平台管理員', 'active'),
  ('a3000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 'line-pair-success@example.test', '配對成功社員', 'active'),
  ('a3000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000003', 'line-pair-conflict@example.test', '配對衝突社員', 'active'),
  ('a3000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000004', 'line-pair-outsider@example.test', '配對外社社員', 'active'),
  ('a3000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000005', 'a2000000-0000-4000-8000-000000000005', 'line-pair-suspended@example.test', '配對停權社員', 'active'),
  ('a3000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000006', 'a2000000-0000-4000-8000-000000000006', 'line-pair-ended@example.test', '配對退社社員', 'active'),
  ('a3000000-0000-4000-8000-000000000007', 'a1000000-0000-4000-8000-000000000007', 'a2000000-0000-4000-8000-000000000007', 'line-pair-blocked@example.test', '配對非啟用身份社員', 'active'),
  ('a3000000-0000-4000-8000-000000000008', 'a1000000-0000-4000-8000-000000000008', 'a2000000-0000-4000-8000-000000000008', 'line-pair-manual-target@example.test', '配對手動目標社員', 'active'),
  ('a3000000-0000-4000-8000-000000000009', 'a1000000-0000-4000-8000-000000000009', 'a2000000-0000-4000-8000-000000000009', 'line-pair-closed@example.test', '配對關閉旗標社員', 'active');

insert into public.platform_roles (app_account_id, role_key)
values ('a3000000-0000-4000-8000-000000000001', 'platform_admin');

insert into public.clubs (id, club_code, club_name, club_status, activated_at)
values
  ('a4000000-0000-4000-8000-000000000001', 'PAIR-A', 'LINE 配對甲社', 'active', now()),
  ('a4000000-0000-4000-8000-000000000002', 'PAIR-B', 'LINE 配對乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status, joined_on, ended_on)
values
  ('a5000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'active', current_date, null),
  ('a5000000-0000-4000-8000-000000000003', 'a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000003', 'active', current_date, null),
  ('a5000000-0000-4000-8000-000000000004', 'a4000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000004', 'active', current_date, null),
  ('a5000000-0000-4000-8000-000000000005', 'a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000005', 'suspended', current_date, null),
  ('a5000000-0000-4000-8000-000000000006', 'a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000006', 'ended', current_date - 10, current_date),
  ('a5000000-0000-4000-8000-000000000007', 'a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000007', 'active', current_date, null),
  ('a5000000-0000-4000-8000-000000000008', 'a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000008', 'active', current_date, null),
  ('a5000000-0000-4000-8000-000000000009', 'a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000009', 'active', current_date, null),
  ('a5000000-0000-4000-8000-000000000010', 'a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000011', 'active', current_date, null);

insert into public.line_identities (
  id, person_id, app_account_id, provider_subject, identity_status
) values
  ('a6000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000002', 'Uline-pair-success', 'active'),
  ('a6000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000003', 'Uline-pair-conflict', 'active'),
  ('a6000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000004', 'a3000000-0000-4000-8000-000000000004', 'Uline-pair-outsider', 'active'),
  ('a6000000-0000-4000-8000-000000000005', 'a2000000-0000-4000-8000-000000000005', 'a3000000-0000-4000-8000-000000000005', 'Uline-pair-suspended', 'active'),
  ('a6000000-0000-4000-8000-000000000006', 'a2000000-0000-4000-8000-000000000006', 'a3000000-0000-4000-8000-000000000006', 'Uline-pair-ended', 'active'),
  ('a6000000-0000-4000-8000-000000000007', 'a2000000-0000-4000-8000-000000000007', 'a3000000-0000-4000-8000-000000000007', 'Uline-pair-blocked', 'blocked'),
  ('a6000000-0000-4000-8000-000000000008', 'a2000000-0000-4000-8000-000000000008', 'a3000000-0000-4000-8000-000000000008', 'Uline-pair-manual', 'active'),
  ('a6000000-0000-4000-8000-000000000009', 'a2000000-0000-4000-8000-000000000009', 'a3000000-0000-4000-8000-000000000009', 'Uline-pair-closed', 'active');

insert into public.line_oa_accounts (id, club_id, display_name, account_status)
values ('a7000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', '配對驗證 OA', 'active');

insert into public.line_oa_followers (
  id, line_oa_account_id, club_id, person_id, app_account_id, oa_user_id,
  follower_status, paired_at
) values
  ('a8000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', null, null, 'Uline-pair-closed', 'following', null),
  ('a8000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', null, null, 'Uline-pair-success', 'following', null),
  ('a8000000-0000-4000-8000-000000000003', 'a7000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000003', null, 'Uline-pair-old', 'following', now()),
  ('a8000000-0000-4000-8000-000000000004', 'a7000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', null, null, 'Uline-pair-conflict', 'following', null),
  ('a8000000-0000-4000-8000-000000000005', 'a7000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000011', null, 'Uline-pair-manual', 'following', now()),
  ('a8000000-0000-4000-8000-000000000006', 'a7000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', null, null, 'Uline-pair-outsider', 'following', null),
  ('a8000000-0000-4000-8000-000000000007', 'a7000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', null, null, 'Uline-pair-suspended', 'following', null),
  ('a8000000-0000-4000-8000-000000000008', 'a7000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', null, null, 'Uline-pair-ended', 'following', null),
  ('a8000000-0000-4000-8000-000000000009', 'a7000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', null, null, 'Uline-pair-blocked', 'following', null);

do $$
begin
  if has_function_privilege('anon', 'public.auto_pair_line_oa_follower(uuid,uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.auto_pair_line_oa_follower(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'browser roles can execute the trusted auto-pairing RPC';
  end if;
  if not has_function_privilege('service_role', 'public.auto_pair_line_oa_follower(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'service_role auto-pairing grant is missing';
  end if;
end;
$$;

set local role authenticated;
do $$
begin
  begin
    perform public.auto_pair_line_oa_follower(
      'a7000000-0000-4000-8000-000000000001',
      'a4000000-0000-4000-8000-000000000001',
      'Uline-pair-closed'
    );
    raise exception 'authenticated role executed trusted auto-pairing RPC';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

-- The absent flag is closed, even though the account, identity and active
-- membership are otherwise valid.
set local role service_role;
do $$
declare result text;
begin
  result := public.auto_pair_line_oa_follower(
    'a7000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000001',
    'Uline-pair-closed'
  );
  if result <> 'disabled' then
    raise exception 'missing feature flag did not close auto-pairing: %', result;
  end if;
end;
$$;
reset role;

-- Enable only this local fixture flag through the existing protected state shape.
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
insert into public.platform_feature_flags (
  feature_key, enabled, enabled_environments, rollout_percentage, updated_by
) values (
  'line_oa_auto_pairing_v1', true, array['local']::text[], 100,
  'a3000000-0000-4000-8000-000000000001'
);

set local role service_role;
do $$
declare result text;
begin
  result := public.auto_pair_line_oa_follower(
    'a7000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000001',
    'Uline-pair-success'
  );
  if result <> 'paired' then
    raise exception 'active exact-match follower was not paired: %', result;
  end if;

  if public.auto_pair_line_oa_follower(
    'a7000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000001',
    'Uline-pair-success'
  ) <> 'already_paired' then
    raise exception 'repeated pairing did not return already_paired';
  end if;

  if public.auto_pair_line_oa_follower(
    'a7000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000001',
    'Uline-pair-conflict'
  ) <> 'conflict' then
    raise exception 'existing active follower conflict was not reported';
  end if;

  if public.auto_pair_line_oa_follower(
    'a7000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000001',
    'Uline-pair-manual'
  ) <> 'already_paired' then
    raise exception 'manual pairing was not preserved as already paired';
  end if;

  if public.auto_pair_line_oa_follower(
    'a7000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000001',
    'Uline-pair-outsider'
  ) <> 'no_match' then
    raise exception 'outside-club identity was paired';
  end if;

  if public.auto_pair_line_oa_follower(
    'a7000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000001',
    'Uline-pair-suspended'
  ) <> 'no_match' then
    raise exception 'suspended member was paired';
  end if;

  if public.auto_pair_line_oa_follower(
    'a7000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000001',
    'Uline-pair-ended'
  ) <> 'no_match' then
    raise exception 'ended member was paired';
  end if;

  if public.auto_pair_line_oa_follower(
    'a7000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000001',
    'Uline-pair-blocked'
  ) <> 'no_match' then
    raise exception 'non-active identity was paired';
  end if;
end;
$$;
reset role;

do $$
declare
  success_follower public.line_oa_followers;
  manual_follower public.line_oa_followers;
  conflict_follower public.line_oa_followers;
  success_audit public.audit_logs;
begin
  select * into success_follower
  from public.line_oa_followers
  where id = 'a8000000-0000-4000-8000-000000000002';
  if success_follower.person_id <> 'a2000000-0000-4000-8000-000000000002'
     or success_follower.app_account_id <> 'a3000000-0000-4000-8000-000000000002'
     or success_follower.follower_status <> 'following'
     or success_follower.paired_at is null then
    raise exception 'successful pairing did not set the follower projection';
  end if;

  select * into manual_follower
  from public.line_oa_followers
  where id = 'a8000000-0000-4000-8000-000000000005';
  if manual_follower.person_id <> 'a2000000-0000-4000-8000-000000000011'
     or manual_follower.oa_user_id <> 'Uline-pair-manual' then
    raise exception 'manual pairing was overwritten';
  end if;

  select * into conflict_follower
  from public.line_oa_followers
  where id = 'a8000000-0000-4000-8000-000000000004';
  if conflict_follower.person_id is not null then
    raise exception 'conflicting follower was changed';
  end if;

  select * into success_audit
  from public.audit_logs
  where action_key = 'line_oa.auto_paired'
    and subject_id = 'a8000000-0000-4000-8000-000000000002';
  if success_audit.id is null or success_audit.actor_app_account_id is not null then
    raise exception 'automatic pairing audit actor is not system-null';
  end if;
  if (select count(*) from public.audit_logs
      where action_key = 'line_oa.auto_paired'
        and subject_id = 'a8000000-0000-4000-8000-000000000002') <> 1 then
    raise exception 'repeated pairing created a second audit row';
  end if;
  if exists (
    select 1
    from public.audit_logs
    where action_key = 'line_oa.auto_paired'
      and metadata::text like '%Uline-pair%'
  ) then
    raise exception 'automatic pairing audit leaked a LINE subject';
  end if;
end;
$$;

-- Turning the flag off closes a newly received follow without changing the
-- follower row that the webhook already created.
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
update public.platform_feature_flags
set enabled = false, rollout_percentage = 0
where feature_key = 'line_oa_auto_pairing_v1';

set local role service_role;
do $$
declare result text;
begin
  result := public.auto_pair_line_oa_follower(
    'a7000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000001',
    'Uline-pair-closed'
  );
  if result <> 'disabled' then
    raise exception 'disabled feature flag did not close auto-pairing: %', result;
  end if;
end;
$$;
reset role;

do $$
begin
  if (select person_id from public.line_oa_followers where id = 'a8000000-0000-4000-8000-000000000001') is not null then
    raise exception 'disabled auto-pairing changed the follower row';
  end if;
end;
$$;

rollback;
