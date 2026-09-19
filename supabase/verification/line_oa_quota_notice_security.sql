-- LINE OA quota notices are visible to OA managers only.  The projection is
-- deliberately derived from the latest member-message push log so an old
-- warning disappears after a later push has another result.
-- Run only against local Supabase. All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'quota-secretary@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'quota-member@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('d2000000-0000-4000-8000-000000000001', '額度測試秘書', 'quota-secretary@example.test'),
  ('d2000000-0000-4000-8000-000000000002', '額度測試社員', 'quota-member@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('d3000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'quota-secretary@example.test', '額度測試秘書', 'active'),
  ('d3000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002', 'quota-member@example.test', '額度測試社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at)
values ('d4000000-0000-4000-8000-000000000001', 'QUOTA-TEST', '額度測試社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status, joined_on)
values
  ('d5000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'active', current_date),
  ('d5000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 'active', current_date);

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values (
  'd6000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'secretary', 'active', 'd3000000-0000-4000-8000-000000000001'
);

insert into public.line_oa_accounts (
  id, club_id, display_name, basic_id, channel_id,
  channel_secret_env_key, access_token_env_key, webhook_secret_env_key,
  account_status, created_by_app_account_id
) values (
  'd7000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  '額度測試社 OA', '@quota-test', 'quota-test-channel',
  'LINE_OA_QUOTA_TEST_CHANNEL_SECRET',
  'LINE_OA_QUOTA_TEST_CHANNEL_ACCESS_TOKEN',
  'LINE_OA_QUOTA_TEST_CHANNEL_SECRET',
  'active', 'd3000000-0000-4000-8000-000000000001'
);

-- An old quota failure must not remain visible after a later non-quota result.
insert into public.line_push_logs (
  id, line_oa_account_id, club_id, push_kind, recipient_count, payload_summary,
  delivery_status, failure_code, created_at
) values
  (
    'd8000000-0000-4000-8000-000000000001',
    'd7000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001',
    'multicast', 700,
    '{"batch_count":2,"sent_batch_count":1,"delivered_recipient_count":500}',
    'failed', 'rate_limited', now() - interval '2 minutes'
  ),
  (
    'd8000000-0000-4000-8000-000000000002',
    'd7000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001',
    'multicast', 1,
    '{"batch_count":1,"sent_batch_count":1,"delivered_recipient_count":1}',
    'sent', null, now() - interval '1 minute'
  );

do $$
declare
  definition text;
begin
  if not has_function_privilege(
    'authenticated', 'public.get_line_oa_quota_notice(uuid)', 'EXECUTE'
  ) or has_function_privilege(
    'anon', 'public.get_line_oa_quota_notice(uuid)', 'EXECUTE'
  ) then
    raise exception 'quota notice execute privilege boundary is wrong';
  end if;

  select pg_catalog.pg_get_functiondef(oid) into definition
  from pg_catalog.pg_proc
  where proname = 'get_line_oa_quota_notice'
    and pronamespace = 'public'::regnamespace;

  if position('security definer' in lower(definition)) = 0
     or position('set search_path' in lower(definition)) = 0
     or position('oa.read' in definition) = 0
     or position('push.push_kind in' in definition) = 0 then
    raise exception 'quota notice lost its security or message-push boundary';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
do $$
declare
  notice jsonb;
begin
  notice := public.get_line_oa_quota_notice('d4000000-0000-4000-8000-000000000001');
  if notice is not null then
    raise exception 'an old quota failure remained after a later successful push: %', notice;
  end if;
end;
$$;
reset role;

-- A new quota failure must be visible with only bounded delivery facts.
insert into public.line_push_logs (
  id, line_oa_account_id, club_id, push_kind, recipient_count, payload_summary,
  delivery_status, failure_code, created_at
) values (
  'd8000000-0000-4000-8000-000000000003',
  'd7000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  'multicast', 700,
  '{"batch_count":2,"sent_batch_count":1,"delivered_recipient_count":500}',
  'failed', 'rate_limited', now() + interval '1 minute'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
do $$
declare
  notice jsonb;
begin
  notice := public.get_line_oa_quota_notice('d4000000-0000-4000-8000-000000000001');
  if notice ->> 'failure_code' <> 'rate_limited'
     or (notice ->> 'recipient_count')::integer <> 700
     or (notice ->> 'sent_batch_count')::integer <> 1
     or (notice ->> 'delivered_recipient_count')::integer <> 500 then
    raise exception 'quota notice projection is incomplete: %', notice;
  end if;
  if notice ?| array['provider_request_id', 'access_token', 'channel_secret'] then
    raise exception 'quota notice leaked provider or credential data: %', notice;
  end if;
end;
$$;
reset role;

-- A normal member cannot use an OA-manager projection, even if they belong to
-- the same club.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000002', true);
do $$
begin
  begin
    perform public.get_line_oa_quota_notice('d4000000-0000-4000-8000-000000000001');
    raise exception 'normal member read a quota notice';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

rollback;
