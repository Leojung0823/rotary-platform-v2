-- Product rollout controls: privilege, closed-schema telemetry, retention, and audit verification.
-- Run only against Supabase local. All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rollout-admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rollout-member@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('92000000-0000-4000-8000-000000000001', 'Rollout Admin Fixture', 'rollout-admin@example.test'),
  ('92000000-0000-4000-8000-000000000002', 'Rollout Member Fixture', 'rollout-member@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('93000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'rollout-admin@example.test', 'Rollout Admin Fixture', 'active'),
  ('93000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', 'rollout-member@example.test', 'Rollout Member Fixture', 'active');

insert into public.platform_roles (app_account_id, role_key)
values ('93000000-0000-4000-8000-000000000001', 'platform_admin');

-- A general browser role cannot directly read or mutate protected tables, nor invoke either protected mutation path.
set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000002', true);
do $$
begin
  begin
    insert into public.platform_feature_flags (feature_key, enabled, enabled_environments, rollout_percentage)
    values ('role_context_v2', true, array['local']::text[], 100);
    raise exception 'ordinary browser inserted a feature flag directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.platform_feature_flags set enabled = true where feature_key = 'role_context_v2';
    raise exception 'ordinary browser updated a feature flag directly';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.platform_feature_flags where feature_key = 'role_context_v2';
    raise exception 'ordinary browser deleted a feature flag directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_platform_feature_flag('role_context_v2', true, array['local']::text[], 100);
    raise exception 'non-platform account mutated a feature flag';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.platform_product_telemetry;
    raise exception 'ordinary browser read telemetry directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.platform_product_telemetry (event_name, payload, daily_subject)
    values ('checkin_attempt', jsonb_build_object('method', 'qr'), repeat('a', 64));
    raise exception 'ordinary browser inserted telemetry directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.platform_product_telemetry set created_at = now();
    raise exception 'ordinary browser updated telemetry directly';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.platform_product_telemetry;
    raise exception 'ordinary browser deleted telemetry directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.platform_feature_flag_audit;
    raise exception 'ordinary browser read feature-flag audit directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.cleanup_platform_retention(now(), 1);
    raise exception 'ordinary browser invoked retention cleanup';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- The existing server-authoritative platform predicate permits the bounded mutation RPC and derives the audit actor.
set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
select * from public.set_platform_feature_flag('role_context_v2', true, array['local', 'staging']::text[], 25);
select * from public.set_platform_feature_flag('role_context_v2', false, array['staging']::text[], 50);
do $$
begin
  begin
    perform public.set_platform_feature_flag('unknown_key', true, array['local']::text[], 10);
    raise exception 'unknown feature key was accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;
reset role;

do $$
declare
  audit_count_before integer;
  audit_count_after integer;
begin
  if not exists (
    select 1
    from public.platform_feature_flag_audit as audit
    where audit.feature_key = 'role_context_v2'
      and audit.action_type = 'created'
      and audit.actor_identifier_snapshot = '93000000-0000-4000-8000-000000000001'
      and audit.after_configuration = jsonb_build_object(
        'feature_key', 'role_context_v2',
        'enabled', true,
        'enabled_environments', array['local', 'staging']::text[],
        'rollout_percentage', 25
      )
  ) then
    raise exception 'feature-flag create audit or immutable actor snapshot is missing';
  end if;
  if not exists (select 1 from public.platform_feature_flag_audit where action_type = 'disabled')
    or not exists (select 1 from public.platform_feature_flag_audit where action_type = 'enabled_environments_changed')
    or not exists (select 1 from public.platform_feature_flag_audit where action_type = 'rollout_percentage_changed') then
    raise exception 'feature-flag update audit is incomplete';
  end if;
  if exists (
    select 1
    from public.platform_feature_flag_audit as audit
    where audit.before_configuration ?| array['pepper', 'secret', 'token', 'credential']
       or audit.after_configuration ?| array['pepper', 'secret', 'token', 'credential']
  ) then
    raise exception 'feature-flag audit contains a secret-shaped field';
  end if;

  select count(*) into audit_count_before from public.platform_feature_flag_audit;
  select count(*) into audit_count_after from public.platform_feature_flag_audit;
  if audit_count_before <> audit_count_after then
    raise exception 'failed feature-flag mutation left inconsistent audit rows';
  end if;

  begin
    update public.platform_feature_flag_audit set action_type = 'enabled';
    raise exception 'append-only audit allowed update';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.platform_feature_flag_audit;
    raise exception 'append-only audit allowed delete';
  exception when sqlstate '55000' then null;
  end;
end;
$$;

-- The read RPC returns a minimal configuration projection, but only after account identity resolution.
set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000002', true);
do $$
begin
  if not exists (
    select 1 from public.get_platform_feature_flags()
    where feature_key = 'role_context_v2' and enabled = false and rollout_percentage = 50
  ) then
    raise exception 'bounded feature-flag read RPC did not return the expected projection';
  end if;
end;
$$;
reset role;

-- Database table constraints enforce the telemetry allowlist independently of the TypeScript validator.
insert into public.platform_product_telemetry (event_name, payload, daily_subject)
values ('checkin_failure', jsonb_build_object('method', 'qr', 'duration_ms', 12, 'reason', 'expired'), repeat('b', 64));

insert into public.platform_product_telemetry (event_name, payload, daily_subject, retention_class)
values ('member_home_projection_duration', jsonb_build_object('duration_ms', 1, 'database_round_trips', 1), repeat('9', 64), 'product_checkin_90d');

do $$
begin
  if not exists (
    select 1 from public.platform_product_telemetry as telemetry
    where telemetry.daily_subject = repeat('9', 64)
      and telemetry.retention_class = 'product_performance_90d'
  ) then
    raise exception 'telemetry writer controlled the server retention classification';
  end if;
end;
$$;

do $$
begin
  begin
    insert into public.platform_product_telemetry (event_name, payload, daily_subject)
    values ('unknown_event', '{}'::jsonb, repeat('c', 64));
    raise exception 'unknown telemetry event was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.platform_product_telemetry (event_name, payload, daily_subject)
    values ('checkin_failure', jsonb_build_object('method', 'qr', 'duration_ms', 12, 'reason', 'expired', 'email', 'x@example.test'), repeat('c', 64));
    raise exception 'extra telemetry key was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.platform_product_telemetry (event_name, payload, daily_subject)
    values ('checkin_failure', jsonb_build_object('method', 'qr', 'duration_ms', 120001, 'reason', 'expired'), repeat('c', 64));
    raise exception 'out-of-range telemetry integer was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.platform_product_telemetry (event_name, payload, daily_subject)
    values ('feature_flag_evaluation_failure', jsonb_build_object('feature_key', 'role_context_v2', 'reason', 'evaluation_error'), repeat('c', 64));
    raise exception 'feature-flag telemetry accepted a caller-supplied subject';
  exception when check_violation then null;
  end;
end;
$$;

-- The daily pseudonym rate guard is bounded without retaining an IP address or stable account identifier.
insert into public.platform_product_telemetry (event_name, payload, daily_subject)
select 'checkin_attempt', jsonb_build_object('method', 'qr'), repeat('d', 64)
from generate_series(1, 100);

do $$
begin
  begin
    insert into public.platform_product_telemetry (event_name, payload, daily_subject)
    values ('checkin_attempt', jsonb_build_object('method', 'qr'), repeat('d', 64));
    raise exception 'telemetry rate limit was not enforced';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

-- Retention uses injected timestamptz as_of, strict less-than cutoffs, bounded batches, and an append-only-audit cleanup exception.
do $$
declare
  as_of_value timestamptz := now();
  first_cleanup jsonb;
  second_cleanup jsonb;
begin
  insert into public.platform_product_telemetry (event_name, payload, daily_subject, created_at)
  values
    ('checkin_attempt', jsonb_build_object('method', 'gps'), repeat('e', 64), as_of_value - interval '90 days'),
    ('checkin_attempt', jsonb_build_object('method', 'gps'), repeat('f', 64), as_of_value - interval '90 days' - interval '1 microsecond'),
    ('member_home_projection_duration', jsonb_build_object('duration_ms', 1, 'database_round_trips', 1), repeat('1', 64), as_of_value - interval '90 days'),
    ('member_home_projection_duration', jsonb_build_object('duration_ms', 1, 'database_round_trips', 1), repeat('2', 64), as_of_value - interval '90 days' - interval '1 microsecond');
  insert into public.platform_login_security_events (event_name, daily_subject, created_at)
  values
    ('login_failure', repeat('3', 64), as_of_value - interval '365 days'),
    ('login_failure', repeat('4', 64), as_of_value - interval '365 days' - interval '1 microsecond');
  insert into public.platform_feature_flag_audit (
    feature_key, action_type, after_configuration, actor_identifier_snapshot, occurred_at
  ) values
    ('member_home_v2', 'created', jsonb_build_object('feature_key', 'member_home_v2', 'enabled', false, 'enabled_environments', array[]::text[], 'rollout_percentage', 0), '93000000-0000-4000-8000-000000000001', as_of_value - interval '3 years'),
    ('member_home_v2', 'created', jsonb_build_object('feature_key', 'member_home_v2', 'enabled', false, 'enabled_environments', array[]::text[], 'rollout_percentage', 0), '93000000-0000-4000-8000-000000000001', as_of_value - interval '3 years' - interval '1 microsecond');

  select jsonb_object_agg(retention_class, deleted_count) into first_cleanup
  from public.cleanup_platform_retention(as_of_value, 500);
  if first_cleanup ->> 'product_checkin_90d' <> '1'
    or first_cleanup ->> 'product_performance_90d' <> '1'
    or first_cleanup ->> 'login_security_365d' <> '1'
    or first_cleanup ->> 'club_mutation_audit_3y' <> '1' then
    raise exception 'retention cleanup did not delete exactly the expired rows: %', first_cleanup;
  end if;
  if not exists (select 1 from public.platform_product_telemetry where daily_subject = repeat('e', 64))
    or not exists (select 1 from public.platform_login_security_events where daily_subject = repeat('3', 64))
    or not exists (select 1 from public.platform_feature_flag_audit where occurred_at = as_of_value - interval '3 years') then
    raise exception 'retention cleanup deleted an exact-boundary row early';
  end if;
  if not exists (select 1 from public.platform_feature_flag_audit where feature_key = 'role_context_v2') then
    raise exception 'telemetry cleanup deleted non-expired feature-flag audit data';
  end if;

  select jsonb_object_agg(retention_class, deleted_count) into second_cleanup
  from public.cleanup_platform_retention(as_of_value, 500);
  if second_cleanup <> jsonb_build_object(
    'product_checkin_90d', 0,
    'product_performance_90d', 0,
    'login_security_365d', 0,
    'club_mutation_audit_3y', 0,
    'operational_rate_limit_2d', 0
  ) then
    raise exception 'retention cleanup was not idempotent: %', second_cleanup;
  end if;
  if position('pg_try_advisory_xact_lock' in pg_get_functiondef('public.cleanup_platform_retention(timestamptz,integer)'::regprocedure)) = 0 then
    raise exception 'retention cleanup lacks an advisory concurrency guard';
  end if;
end;
$$;

rollback;
