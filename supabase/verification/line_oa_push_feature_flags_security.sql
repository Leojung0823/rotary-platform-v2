-- Reserved LINE OA push feature keys. Run against local Supabase only.
-- Every fixture and flag mutation is rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'ea000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'line-oa-flag-admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'ea000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'line-oa-flag-member@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('eb000000-0000-4000-8000-000000000001', 'LINE OA Flag Admin', 'line-oa-flag-admin@example.test'),
  ('eb000000-0000-4000-8000-000000000002', 'LINE OA Flag Member', 'line-oa-flag-member@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('ec000000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-000000000001', 'eb000000-0000-4000-8000-000000000001', 'line-oa-flag-admin@example.test', 'LINE OA Flag Admin', 'active'),
  ('ec000000-0000-4000-8000-000000000002', 'ea000000-0000-4000-8000-000000000002', 'eb000000-0000-4000-8000-000000000002', 'line-oa-flag-member@example.test', 'LINE OA Flag Member', 'active');

insert into public.platform_roles (app_account_id, role_key)
values ('ec000000-0000-4000-8000-000000000001', 'platform_admin');

-- Both constraints and the telemetry validator have to know the two reserved
-- keys. A parallel branch that redeclares the constraint without them would
-- drop them here rather than in its own tests.
do $$
declare
  reserved_key text;
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

  foreach reserved_key in array array['line_oa_auto_pairing_v1', 'line_oa_event_push_v1'] loop
    if flag_constraint is null or position(reserved_key in flag_constraint) = 0 then
      raise exception 'flag constraint is missing %', reserved_key;
    end if;
    if audit_constraint is null or position(reserved_key in audit_constraint) = 0 then
      raise exception 'audit constraint is missing %', reserved_key;
    end if;
    if not public.platform_product_telemetry_payload_is_valid(
      'feature_flag_evaluation_failure',
      jsonb_build_object('feature_key', reserved_key, 'reason', 'missing_configuration')
    ) then
      raise exception 'telemetry validator rejects %', reserved_key;
    end if;
  end loop;

  -- Every previously shipped key must survive this migration. Losing one is the
  -- exact failure two parallel branches would otherwise cause.
  foreach reserved_key in array array[
    'role_context_v2', 'role_shells_v2', 'member_home_v2', 'checkin_qr_v2', 'checkin_gps_v2',
    'attendance_ui_v2', 'announcements_v09', 'blessing_iou_v1', 'blessing_iou_collections_v1',
    'blessing_iou_reporting_v1', 'birthday_wishes_v1', 'birthday_wishes_v2',
    'birthday_wishes_collection_v1', 'message_board_v1', 'archive_handover_v1'
  ] loop
    if position(reserved_key in flag_constraint) = 0 then
      raise exception 'previously shipped key % was dropped', reserved_key;
    end if;
  end loop;
end;
$$;

-- Reserving a key must not turn the feature on. Both stay unconfigured, and a
-- missing row is what the server evaluator reads as disabled.
do $$
begin
  if exists (
    select 1 from public.platform_feature_flags
    where feature_key in ('line_oa_auto_pairing_v1', 'line_oa_event_push_v1')
  ) then
    raise exception 'reserved LINE OA keys must start with no row at all';
  end if;
end;
$$;

-- An ordinary member cannot set either reserved flag.
set local role authenticated;
set local request.jwt.claims = '{"sub": "ea000000-0000-4000-8000-000000000002", "role": "authenticated"}';

do $$
begin
  begin
    perform public.set_platform_feature_flag('line_oa_auto_pairing_v1', true, array['staging'], 100);
    raise exception 'a plain member must not set a platform feature flag';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
reset request.jwt.claims;

-- A platform admin can set them, and an unknown key is still refused.
set local role authenticated;
set local request.jwt.claims = '{"sub": "ea000000-0000-4000-8000-000000000001", "role": "authenticated"}';

do $$
declare
  resulting_enabled boolean;
begin
  select enabled into resulting_enabled
  from public.set_platform_feature_flag('line_oa_event_push_v1', true, array['staging'], 100);
  if resulting_enabled is not true then
    raise exception 'platform admin could not set the reserved key';
  end if;

  begin
    perform public.set_platform_feature_flag('line_oa_not_a_real_key', true, array['staging'], 100);
    raise exception 'an unregistered feature key must be refused';
  exception
    when others then
      if sqlstate <> '22023' then
        raise;
      end if;
  end;
end;
$$;

reset role;
reset request.jwt.claims;

rollback;
