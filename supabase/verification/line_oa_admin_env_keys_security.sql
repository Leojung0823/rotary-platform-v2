-- LINE OA admin projection must expose only environment-variable names.
-- Run against a freshly reset local database. All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'c1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'oa-env-admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'oa-env-secretary@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'oa-env-member@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('c2000000-0000-4000-8000-000000000001', 'OA 環境平台管理員', 'oa-env-admin@example.test'),
  ('c2000000-0000-4000-8000-000000000002', 'OA 環境秘書', 'oa-env-secretary@example.test'),
  ('c2000000-0000-4000-8000-000000000003', 'OA 環境一般社員', 'oa-env-member@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('c3000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'oa-env-admin@example.test', 'OA 環境平台管理員', 'active'),
  ('c3000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000002', 'oa-env-secretary@example.test', 'OA 環境秘書', 'active'),
  ('c3000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000003', 'c2000000-0000-4000-8000-000000000003', 'oa-env-member@example.test', 'OA 環境一般社員', 'active');

insert into public.platform_roles (app_account_id, role_key)
values ('c3000000-0000-4000-8000-000000000001', 'platform_admin');

insert into public.clubs (id, club_code, club_name, club_status, activated_at)
values
  ('c4000000-0000-4000-8000-000000000001', 'OA-ENV-A', 'OA 環境甲社', 'active', now()),
  ('c4000000-0000-4000-8000-000000000002', 'OA-ENV-B', 'OA 環境乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status, joined_on)
values
  ('c5000000-0000-4000-8000-000000000002', 'c4000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000002', 'active', current_date),
  ('c5000000-0000-4000-8000-000000000003', 'c4000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000003', 'active', current_date);

insert into public.club_role_assignments (
  club_id, app_account_id, role_key, granted_by_app_account_id
) values (
  'c4000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000002',
  'secretary',
  'c3000000-0000-4000-8000-000000000001'
);

insert into public.line_oa_accounts (
  id, club_id, display_name, basic_id, channel_id,
  channel_secret_env_key, access_token_env_key, webhook_secret_env_key,
  account_status, created_by_app_account_id
) values (
  'c6000000-0000-4000-8000-000000000001',
  'c4000000-0000-4000-8000-000000000001',
  'OA 環境甲社官方帳號', '@oa-env-a', 'oa-env-channel-a',
  'LINE_OA_ENV_A_CHANNEL_SECRET',
  'LINE_OA_ENV_A_CHANNEL_ACCESS_TOKEN',
  'LINE_OA_ENV_A_CHANNEL_SECRET',
  'active', 'c3000000-0000-4000-8000-000000000001'
);

do $$
declare
  definition text;
begin
  if not has_function_privilege('authenticated', 'public.get_line_oa_admin(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_line_oa_admin(uuid)', 'EXECUTE') then
    raise exception 'get_line_oa_admin execute privilege boundary is wrong';
  end if;

  if has_table_privilege('authenticated', 'public.line_oa_accounts', 'SELECT') then
    raise exception 'authenticated role can read line_oa_accounts directly';
  end if;

  select pg_catalog.pg_get_functiondef(oid) into definition
  from pg_catalog.pg_proc
  where proname = 'get_line_oa_admin' and pronamespace = 'public'::regnamespace;

  if position('security definer' in lower(definition)) = 0
     or position('set search_path' in lower(definition)) = 0
     or position('access_token_env_key' in definition) = 0
     or position('webhook_secret_env_key' in definition) = 0 then
    raise exception 'admin projection lost its security or environment-key contract';
  end if;
end;
$$;

-- A secretary can see the names needed to configure the server, but no
-- credential-shaped field is projected.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
do $$
declare
  payload jsonb;
  account jsonb;
begin
  payload := public.get_line_oa_admin('c4000000-0000-4000-8000-000000000001');
  account := payload -> 'account';

  if account ->> 'access_token_env_key' <> 'LINE_OA_ENV_A_CHANNEL_ACCESS_TOKEN'
     or account ->> 'webhook_secret_env_key' <> 'LINE_OA_ENV_A_CHANNEL_SECRET' then
    raise exception 'OA environment key names were not projected exactly: %', account;
  end if;

  if account ?| array[
    'channel_access_token', 'access_token', 'channel_secret', 'webhook_secret',
    'token', 'secret'
  ] then
    raise exception 'OA credential value field leaked into the admin projection: %', account;
  end if;
end;
$$;
reset role;

-- A normal member cannot use the projection, and a secretary cannot cross a
-- club boundary simply by changing the route parameter.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000003', true);
do $$
begin
  begin
    perform public.get_line_oa_admin('c4000000-0000-4000-8000-000000000001');
    raise exception 'normal member read the LINE OA admin projection';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
do $$
begin
  begin
    perform public.get_line_oa_admin('c4000000-0000-4000-8000-000000000002');
    raise exception 'secretary read another club LINE OA admin projection';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

rollback;
