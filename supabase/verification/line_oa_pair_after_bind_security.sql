-- Retrying pairing after a LINE bind. Run against local Supabase only.
-- Every fixture and flag mutation is rolled back.

begin;

insert into public.clubs (id, club_code, club_name, club_status) values
  ('5a000000-0000-4000-8000-000000000001', 'BIND-ORDER', '順序測試社', 'active'),
  ('5a000000-0000-4000-8000-000000000002', 'BIND-OTHER', '他社', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '5b000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'bind-order@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '5b000000-0000-4000-8000-000000000009', 'authenticated', 'authenticated', 'bind-admin@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('5c000000-0000-4000-8000-000000000001', '先加好友的社友', 'bind-order@example.test'),
  ('5c000000-0000-4000-8000-000000000009', '旗標管理者', 'bind-admin@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('5d000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000001', 'bind-order@example.test', '先加好友的社友', 'active'),
  ('5d000000-0000-4000-8000-000000000009', '5b000000-0000-4000-8000-000000000009', '5c000000-0000-4000-8000-000000000009', 'bind-admin@example.test', '旗標管理者', 'active');

insert into public.platform_roles (app_account_id, role_key)
values ('5d000000-0000-4000-8000-000000000009', 'platform_admin');

insert into public.club_memberships (club_id, person_id, membership_status)
values ('5a000000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000001', 'active');

insert into public.line_oa_accounts (
  id, club_id, display_name, basic_id, channel_secret_env_key, access_token_env_key,
  webhook_secret_env_key, account_status, created_by_app_account_id
) values (
  '5e000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000001', '順序測試社 OA', '@bindorder',
  'LINE_OA_BIND_ORDER_CHANNEL_SECRET', 'LINE_OA_BIND_ORDER_CHANNEL_ACCESS_TOKEN',
  'LINE_OA_BIND_ORDER_CHANNEL_SECRET', 'active', '5d000000-0000-4000-8000-000000000009'
);

-- The follow arrived first: a follower row exists with nobody attached, exactly
-- what the webhook leaves behind when no identity matches yet.
insert into public.line_oa_followers (
  line_oa_account_id, club_id, oa_user_id, follower_status
) values (
  '5e000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000001', 'Ubindorder0001', 'following'
);

-- Browser roles must not be able to run the retry: the callback has no end-user
-- session at that point, so the function trusts only the subject it is given.
do $$
begin
  if has_function_privilege('authenticated', 'public.pair_line_oa_followers_for_subject(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.pair_line_oa_followers_for_subject(text)', 'EXECUTE') then
    raise exception 'the bind retry must be service-role only';
  end if;
  if not has_function_privilege('service_role', 'public.pair_line_oa_followers_for_subject(text)', 'EXECUTE') then
    raise exception 'service_role lost execute on the bind retry';
  end if;
end;
$$;

-- With auto-pairing off, the retry must change nothing: a disabled flag is a
-- closed door in every path, not only the webhook.
do $$
declare paired integer;
begin
  paired := public.pair_line_oa_followers_for_subject('Ubindorder0001');
  if paired <> 0 then
    raise exception 'the retry paired % follower(s) while the flag was off', paired;
  end if;
  if exists (
    select 1 from public.line_oa_followers
    where oa_user_id = 'Ubindorder0001' and person_id is not null
  ) then
    raise exception 'a disabled flag must leave the follower unpaired';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '5b000000-0000-4000-8000-000000000009', true);
select * from public.set_platform_feature_flag(
  'line_oa_auto_pairing_v1', true, array['local']::text[], 100
);
reset role;

-- Still nothing to match: the member has not bound LINE Login yet.
do $$
declare paired integer;
begin
  paired := public.pair_line_oa_followers_for_subject('Ubindorder0001');
  if paired <> 0 then
    raise exception 'pairing succeeded without a LINE identity to match';
  end if;
end;
$$;

-- The bind happens. This is the moment the callback retries.
insert into public.line_identities (
  person_id, app_account_id, provider_subject, identity_status
) values (
  '5c000000-0000-4000-8000-000000000001', '5d000000-0000-4000-8000-000000000001',
  'Ubindorder0001', 'active'
);

do $$
declare paired integer;
begin
  paired := public.pair_line_oa_followers_for_subject('Ubindorder0001');
  if paired <> 1 then
    raise exception 'follow-then-bind did not pair exactly one follower, got %', paired;
  end if;

  if not exists (
    select 1 from public.line_oa_followers
    where oa_user_id = 'Ubindorder0001'
      and person_id = '5c000000-0000-4000-8000-000000000001'
      and app_account_id = '5d000000-0000-4000-8000-000000000001'
      and follower_status = 'following'
  ) then
    raise exception 'the follower was not attached to the bound member';
  end if;

  -- Running it again must be a no-op rather than a second audit entry.
  paired := public.pair_line_oa_followers_for_subject('Ubindorder0001');
  if paired <> 0 then
    raise exception 'a repeated retry paired the same follower twice';
  end if;
  if (select count(*) from public.audit_logs
      where action_key = 'line_oa.auto_paired'
        and club_id = '5a000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'the retry wrote more than one pairing audit row';
  end if;
end;
$$;

-- A follower of another club, whose OA that member does not belong to, must not
-- be swept up by a subject-wide retry.
insert into public.line_oa_accounts (
  id, club_id, display_name, basic_id, channel_secret_env_key, access_token_env_key,
  webhook_secret_env_key, account_status, created_by_app_account_id
) values (
  '5e000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-000000000002', '他社 OA', '@bindother',
  'LINE_OA_BIND_OTHER_CHANNEL_SECRET', 'LINE_OA_BIND_OTHER_CHANNEL_ACCESS_TOKEN',
  'LINE_OA_BIND_OTHER_CHANNEL_SECRET', 'active', '5d000000-0000-4000-8000-000000000009'
);

insert into public.line_oa_followers (
  line_oa_account_id, club_id, oa_user_id, follower_status
) values (
  '5e000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-000000000002', 'Ubindorder0001', 'following'
);

do $$
declare paired integer;
begin
  paired := public.pair_line_oa_followers_for_subject('Ubindorder0001');
  if paired <> 0 then
    raise exception 'the retry paired a club the member has no membership in';
  end if;
  if exists (
    select 1 from public.line_oa_followers
    where club_id = '5a000000-0000-4000-8000-000000000002' and person_id is not null
  ) then
    raise exception 'another club''s follower was attached without membership';
  end if;
end;
$$;

-- An unknown or blank subject must do nothing rather than scan for something.
do $$
begin
  if public.pair_line_oa_followers_for_subject('Unever-seen') <> 0 then
    raise exception 'an unknown subject paired something';
  end if;
  if public.pair_line_oa_followers_for_subject('   ') <> 0 then
    raise exception 'a blank subject paired something';
  end if;
  if public.pair_line_oa_followers_for_subject(null) <> 0 then
    raise exception 'a null subject paired something';
  end if;
end;
$$;

rollback;
