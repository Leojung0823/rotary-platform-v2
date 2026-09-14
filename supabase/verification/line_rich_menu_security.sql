-- LINE Rich Menu verification. Run against a freshly reset local database.
-- Every fixture and mutation is rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rich-menu-admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rich-menu-member@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('fb000000-0000-4000-8000-000000000001', 'Rich Menu 管理員', 'rich-menu-admin@example.test'),
  ('fb000000-0000-4000-8000-000000000002', 'Rich Menu 一般社員', 'rich-menu-member@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('fc000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000001', 'rich-menu-admin@example.test', 'Rich Menu 管理員', 'active'),
  ('fc000000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000002', 'fb000000-0000-4000-8000-000000000002', 'rich-menu-member@example.test', 'Rich Menu 一般社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at)
values
  ('fd000000-0000-4000-8000-000000000001', 'RICH-MENU-A', 'Rich Menu 甲社', 'active', now()),
  ('fd000000-0000-4000-8000-000000000002', 'RICH-MENU-B', 'Rich Menu 乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status, joined_on)
values
  ('fe000000-0000-4000-8000-000000000001', 'fd000000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000001', 'active', current_date),
  ('fe000000-0000-4000-8000-000000000002', 'fd000000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000002', 'active', current_date);

insert into public.club_role_assignments (
  club_id, app_account_id, role_key, granted_by_app_account_id
) values (
  'fd000000-0000-4000-8000-000000000001',
  'fc000000-0000-4000-8000-000000000001',
  'secretary',
  'fc000000-0000-4000-8000-000000000001'
);

insert into public.line_oa_accounts (
  id, club_id, display_name, basic_id, channel_id, account_status,
  channel_secret_env_key, access_token_env_key, webhook_secret_env_key
) values
  ('ff000000-0000-4000-8000-000000000001', 'fd000000-0000-4000-8000-000000000001', 'Rich Menu 甲社 OA', '@rich-menu-a', 'rich-menu-channel-a', 'active', 'LINE_RICH_MENU_A_SECRET', 'LINE_RICH_MENU_A_TOKEN', 'LINE_RICH_MENU_A_SECRET'),
  ('ff000000-0000-4000-8000-000000000002', 'fd000000-0000-4000-8000-000000000002', 'Rich Menu 乙社 OA', '@rich-menu-b', 'rich-menu-channel-b', 'active', 'LINE_RICH_MENU_B_SECRET', 'LINE_RICH_MENU_B_TOKEN', 'LINE_RICH_MENU_B_SECRET');

do $$
declare
  flag_constraint text;
  audit_constraint text;
  definition text;
begin
  select pg_catalog.pg_get_constraintdef(oid) into flag_constraint
  from pg_catalog.pg_constraint
  where conrelid = 'public.platform_feature_flags'::regclass
    and conname = 'platform_feature_flags_feature_key_check';
  select pg_catalog.pg_get_constraintdef(oid) into audit_constraint
  from pg_catalog.pg_constraint
  where conrelid = 'public.platform_feature_flag_audit'::regclass
    and conname = 'platform_feature_flag_audit_feature_key_check';

  if position('line_rich_menu_v1' in coalesce(flag_constraint, '')) = 0
    or position('line_rich_menu_v1' in coalesce(audit_constraint, '')) = 0 then
    raise exception 'Rich Menu feature flag key is missing from a feature-key constraint';
  end if;
  if not public.platform_product_telemetry_payload_is_valid(
    'feature_flag_evaluation_failure',
    jsonb_build_object('feature_key', 'line_rich_menu_v1', 'reason', 'missing_configuration')
  ) then
    raise exception 'telemetry validator rejects the Rich Menu feature key';
  end if;
  select pg_catalog.pg_get_functiondef(oid) into definition
  from pg_catalog.pg_proc
  where proname = 'set_line_oa_rich_menu' and pronamespace = 'public'::regnamespace;
  if position('security definer' in lower(coalesce(definition, ''))) = 0
    or position('set search_path' in lower(coalesce(definition, ''))) = 0 then
    raise exception 'Rich Menu mutation lost its security boundary';
  end if;
end;
$$;

do $$
begin
  if has_function_privilege('anon', 'public.set_line_oa_rich_menu(uuid,text)', 'execute')
    or has_function_privilege('authenticated', 'public.set_line_oa_rich_menu(uuid,text)', 'execute') then
    raise exception 'Rich Menu RPC must be closed while its flag row is absent';
  end if;
  if has_table_privilege('authenticated', 'public.line_oa_accounts', 'select')
    or has_table_privilege('authenticated', 'public.line_oa_accounts', 'update') then
    raise exception 'browser can read or update line_oa_accounts directly';
  end if;
end;
$$;

-- A newly declared key is closed until an explicit platform rollout writes it.
do $$
begin
  if exists (
    select 1 from public.platform_feature_flags where feature_key = 'line_rich_menu_v1'
  ) then
    raise exception 'Rich Menu must start without an enabled flag row';
  end if;
end;
$$;

-- The verification setup may enable the key directly; the production path is
-- still the protected platform-admin RPC. The trigger should grant only the
-- Rich Menu RPC, not any table privilege.
select set_config('request.jwt.claim.sub', 'fa000000-0000-4000-8000-000000000001', true);
insert into public.platform_feature_flags (
  feature_key, enabled, enabled_environments, rollout_percentage, updated_by
) values (
  'line_rich_menu_v1', true, array['local'], 100,
  'fc000000-0000-4000-8000-000000000001'
);
reset request.jwt.claims;

do $$
begin
  if has_function_privilege('anon', 'public.set_line_oa_rich_menu(uuid,text)', 'execute')
    or not has_function_privilege('authenticated', 'public.set_line_oa_rich_menu(uuid,text)', 'execute') then
    raise exception 'Rich Menu RPC execute privileges did not follow its enabled flag';
  end if;
end;
$$;

-- No browser role can save a menu for another club, even if the caller posts
-- the other club id. A valid id is deliberately provider-shaped but contains
-- no credential.
select set_config('request.jwt.claim.sub', 'fa000000-0000-4000-8000-000000000002', true);
set local role authenticated;
do $$
begin
  begin
    perform public.set_line_oa_rich_menu(
      'fd000000-0000-4000-8000-000000000001',
      'richmenu-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    );
    raise exception 'ordinary member changed the Rich Menu state';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

select set_config('request.jwt.claim.sub', 'fa000000-0000-4000-8000-000000000001', true);
set local role authenticated;
do $$
declare result jsonb;
begin
  result := public.set_line_oa_rich_menu(
    'fd000000-0000-4000-8000-000000000001',
    'richmenu-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  );
  if result ->> 'rich_menu_id' <> 'richmenu-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' then
    raise exception 'authorized Rich Menu state was not returned: %', result;
  end if;

  begin
    perform public.set_line_oa_rich_menu(
      'fd000000-0000-4000-8000-000000000002',
      'richmenu-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    );
    raise exception 'secretary changed a different club Rich Menu';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.set_line_oa_rich_menu(
      'fd000000-0000-4000-8000-000000000001',
      'not-a-rich-menu-id'
    );
    raise exception 'invalid provider Rich Menu id was accepted';
  exception when others then
    if sqlstate <> '22023' then raise; end if;
  end;

  result := public.set_line_oa_rich_menu(
    'fd000000-0000-4000-8000-000000000001',
    null
  );
  if result -> 'rich_menu_id' <> 'null'::jsonb then
    raise exception 'authorized Rich Menu clear was not persisted: %', result;
  end if;
end;
$$;
reset role;
reset request.jwt.claims;

rollback;
