-- Rollback controls for already-shipped birthday, board, and archive domains.
-- Run against local Supabase only. Every fixture and flag mutation is rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'da000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'existing-flag-admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'da000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'existing-flag-member@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('db000000-0000-4000-8000-000000000001', 'Existing Flag Admin', 'existing-flag-admin@example.test'),
  ('db000000-0000-4000-8000-000000000002', 'Existing Flag Member', 'existing-flag-member@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('dc000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000001', 'db000000-0000-4000-8000-000000000001', 'existing-flag-admin@example.test', 'Existing Flag Admin', 'active'),
  ('dc000000-0000-4000-8000-000000000002', 'da000000-0000-4000-8000-000000000002', 'db000000-0000-4000-8000-000000000002', 'existing-flag-member@example.test', 'Existing Flag Member', 'active');

insert into public.platform_roles (app_account_id, role_key)
values ('dc000000-0000-4000-8000-000000000001', 'platform_admin');

-- Both constraints know every rollback key, and the migration intentionally
-- leaves the already-visible domains unconfigured until an operator changes one.
do $$
declare
  rollback_key text;
  flag_constraint text;
  audit_constraint text;
begin
  select pg_catalog.pg_get_constraintdef(oid) into flag_constraint
  from pg_catalog.pg_constraint
  where conrelid = 'public.platform_feature_flags'::regclass
    and conname = 'platform_feature_flags_feature_key_check';

  select pg_catalog.pg_get_constraintdef(oid) into audit_constraint
  from pg_catalog.pg_constraint
  where conrelid = 'public.platform_feature_flag_audit'::regclass
    and conname = 'platform_feature_flag_audit_feature_key_check';

  foreach rollback_key in array array[
    'birthday_wishes_v1', 'message_board_v1', 'archive_handover_v1'
  ]::text[] loop
    if pg_catalog.strpos(coalesce(flag_constraint, ''), rollback_key) = 0
      or pg_catalog.strpos(coalesce(audit_constraint, ''), rollback_key) = 0 then
      raise exception 'feature-flag constraint is missing rollback key %', rollback_key;
    end if;
    if exists (
      select 1 from public.platform_feature_flags as flag
      where flag.feature_key = rollback_key
    ) then
      raise exception 'migration unexpectedly seeded rollback key %', rollback_key;
    end if;
  end loop;
end;
$$;

-- An ordinary authenticated account still cannot mutate rollout configuration.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'da000000-0000-4000-8000-000000000002', true);
do $$
begin
  begin
    perform public.set_platform_feature_flag(
      'message_board_v1', false, array['local', 'staging', 'production']::text[], 100
    );
    raise exception 'ordinary account changed an existing-domain rollback flag';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- The existing platform-admin RPC allow-list accepts all three keys and records
-- both directions of the rollback transition. Unknown keys remain rejected.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'da000000-0000-4000-8000-000000000001', true);
do $$
declare
  rollback_key text;
  flag record;
begin
  foreach rollback_key in array array[
    'birthday_wishes_v1', 'message_board_v1', 'archive_handover_v1'
  ]::text[] loop
    select * into flag from public.set_platform_feature_flag(
      rollback_key, false, array['local', 'staging', 'production']::text[], 100
    );
    if flag.feature_key <> rollback_key or flag.enabled then
      raise exception 'rollback key % did not disable', rollback_key;
    end if;

    select * into flag from public.set_platform_feature_flag(
      rollback_key, true, array['local', 'staging', 'production']::text[], 100
    );
    if flag.feature_key <> rollback_key or not flag.enabled then
      raise exception 'rollback key % did not re-enable', rollback_key;
    end if;
  end loop;

  begin
    perform public.set_platform_feature_flag(
      'existing_domain_unknown_v1', true, array['local']::text[], 100
    );
    raise exception 'unknown existing-domain rollback key was accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;
reset role;

do $$
declare
  rollback_key text;
begin
  foreach rollback_key in array array[
    'birthday_wishes_v1', 'message_board_v1', 'archive_handover_v1'
  ]::text[] loop
    if not exists (
      select 1 from public.platform_feature_flags as flag
      where flag.feature_key = rollback_key
        and flag.enabled
        and flag.enabled_environments = array['local', 'staging', 'production']::text[]
        and flag.rollout_percentage = 100
    ) then
      raise exception 'rollback key % did not retain its enabled configuration', rollback_key;
    end if;
    if not exists (
      select 1 from public.platform_feature_flag_audit as audit
      where audit.feature_key = rollback_key and audit.action_type = 'created'
    ) or not exists (
      select 1 from public.platform_feature_flag_audit as audit
      where audit.feature_key = rollback_key and audit.action_type = 'enabled'
    ) then
      raise exception 'rollback key % did not audit disable/enable behavior', rollback_key;
    end if;
  end loop;
end;
$$;

-- A normal signed-in account receives the bounded final configuration through
-- the existing read RPC, without gaining direct table access.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'da000000-0000-4000-8000-000000000002', true);
do $$
begin
  if (
    select count(*)
    from public.get_platform_feature_flags()
    where feature_key = any(array[
      'birthday_wishes_v1', 'message_board_v1', 'archive_handover_v1'
    ]::text[])
      and enabled
      and rollout_percentage = 100
  ) <> 3 then
    raise exception 'bounded feature-flag read did not return all enabled rollback keys';
  end if;
end;
$$;
reset role;

rollback;
