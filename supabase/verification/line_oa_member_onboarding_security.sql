-- LINE OA member onboarding verification. Run against a freshly reset local database.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'b1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'oa-onboarding-admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'oa-onboarding-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'oa-onboarding-suspended@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('b2000000-0000-4000-8000-000000000001', 'OA 引導平台管理員', 'oa-onboarding-admin@example.test'),
  ('b2000000-0000-4000-8000-000000000002', 'OA 引導一般社員', 'oa-onboarding-member@example.test'),
  ('b2000000-0000-4000-8000-000000000003', 'OA 引導停權社員', 'oa-onboarding-suspended@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('b3000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'oa-onboarding-admin@example.test', 'OA 引導平台管理員', 'active'),
  ('b3000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002', 'oa-onboarding-member@example.test', 'OA 引導一般社員', 'active'),
  ('b3000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000003', 'oa-onboarding-suspended@example.test', 'OA 引導停權社員', 'active');

insert into public.platform_roles (app_account_id, role_key)
values ('b3000000-0000-4000-8000-000000000001', 'platform_admin');

insert into public.clubs (id, club_code, club_name, club_status, activated_at)
values
  ('b4000000-0000-4000-8000-000000000001', 'OA-ONBOARD-A', 'OA 引導甲社', 'active', now()),
  ('b4000000-0000-4000-8000-000000000002', 'OA-ONBOARD-B', 'OA 引導乙社', 'active', now());

insert into public.club_memberships (
  id, club_id, person_id, membership_status, joined_on
) values
  ('b5000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000002', 'active', current_date),
  ('b5000000-0000-4000-8000-000000000003', 'b4000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000003', 'suspended', current_date);

insert into public.line_oa_accounts (
  id, club_id, display_name, basic_id, channel_id, account_status,
  channel_secret_env_key, access_token_env_key, webhook_secret_env_key
) values
  ('b6000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001', 'OA 引導甲社官方帳號', '@oa-onboard-a', 'channel-a', 'active', 'LINE_OA_ONBOARD_A_SECRET', 'LINE_OA_ONBOARD_A_TOKEN', 'LINE_OA_ONBOARD_A_SECRET'),
  ('b6000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-000000000002', 'OA 引導乙社官方帳號', '@oa-onboard-b', 'channel-b', 'active', 'LINE_OA_ONBOARD_B_SECRET', 'LINE_OA_ONBOARD_B_TOKEN', 'LINE_OA_ONBOARD_B_SECRET');

do $$
begin
  if has_function_privilege('anon', 'public.get_my_line_oa_onboarding_status(uuid)', 'execute')
    or has_function_privilege('anon', 'public.dismiss_my_line_oa_onboarding(uuid)', 'execute') then
    raise exception 'anonymous role can use LINE OA onboarding RPCs';
  end if;
  if not has_function_privilege('authenticated', 'public.get_my_line_oa_onboarding_status(uuid)', 'execute')
    or not has_function_privilege('authenticated', 'public.dismiss_my_line_oa_onboarding(uuid)', 'execute') then
    raise exception 'authenticated LINE OA onboarding RPC grants are missing';
  end if;
  if has_function_privilege('authenticated', 'public.record_line_oa_account_identity_verification(uuid,text,text)', 'execute')
    or has_function_privilege('anon', 'public.record_line_oa_account_identity_verification(uuid,text,text)', 'execute')
    or not has_function_privilege('service_role', 'public.record_line_oa_account_identity_verification(uuid,text,text)', 'execute') then
    raise exception 'trusted OA identity verification privilege is wrong';
  end if;
  if has_table_privilege('authenticated', 'public.line_oa_onboarding_preferences', 'select')
    or has_table_privilege('authenticated', 'public.line_oa_onboarding_preferences', 'insert')
    or has_table_privilege('authenticated', 'public.line_oa_onboarding_preferences', 'update') then
    raise exception 'browser can access LINE OA onboarding preferences directly';
  end if;
end;
$$;

-- Missing feature configuration must close both member RPCs.
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000002', true);
set local role authenticated;
do $$
begin
  begin
    perform public.get_my_line_oa_onboarding_status('b4000000-0000-4000-8000-000000000001');
    raise exception 'missing flag exposed LINE OA onboarding status';
  exception when insufficient_privilege then
    if sqlerrm <> 'line_oa_onboarding_disabled' then raise; end if;
  end;
  begin
    perform public.dismiss_my_line_oa_onboarding('b4000000-0000-4000-8000-000000000001');
    raise exception 'missing flag accepted LINE OA onboarding dismissal';
  exception when insufficient_privilege then
    if sqlerrm <> 'line_oa_onboarding_disabled' then raise; end if;
  end;
end;
$$;
reset role;

-- Enable only this local fixture through the protected state shape.
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
insert into public.platform_feature_flags (
  feature_key, enabled, enabled_environments, rollout_percentage, updated_by
) values (
  'line_oa_onboarding_v1', true, array['local']::text[], 100,
  'b3000000-0000-4000-8000-000000000001'
);

-- account_status=active and an entered Basic ID are not enough. Until the
-- trusted bot-info confirmation arrives, the caller receives no join URL.
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000002', true);
set local role authenticated;
do $$
declare payload jsonb;
begin
  payload := public.get_my_line_oa_onboarding_status('b4000000-0000-4000-8000-000000000001');
  if (payload ->> 'oa_available')::boolean or payload -> 'join_url' <> 'null'::jsonb then
    raise exception 'unverified Basic ID was exposed: %', payload;
  end if;
  if (select count(*) from jsonb_object_keys(payload)) <> 9
    or payload ?| array['oa_user_id', 'provider_subject', 'channel_id', 'secret', 'token'] then
    raise exception 'status projection keys are not exact: %', payload;
  end if;
end;
$$;
reset role;

-- A platform role without an active membership cannot substitute authority.
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
set local role authenticated;
do $$
begin
  begin
    perform public.get_my_line_oa_onboarding_status('b4000000-0000-4000-8000-000000000001');
    raise exception 'platform admin without membership read member onboarding';
  exception when insufficient_privilege then
    if sqlerrm <> 'active_club_membership_required' then raise; end if;
  end;
end;
$$;
reset role;

-- Only the service role can record the result of a real bot-info check.
set local role service_role;
do $$
begin
  if public.record_line_oa_account_identity_verification(
    'b6000000-0000-4000-8000-000000000001', '@oa-onboard-a', 'Uoa-onboard-bot-a'
  ) is not true then
    raise exception 'trusted OA identity verification did not succeed';
  end if;
  if public.record_line_oa_account_identity_verification(
    'b6000000-0000-4000-8000-000000000002', '@oa-onboard-b', 'Uoa-onboard-bot-b'
  ) is not true then
    raise exception 'second trusted OA identity verification did not succeed';
  end if;
end;
$$;
reset role;

-- A verified physical bot cannot be assigned to another active club.
set local role service_role;
do $$
begin
  begin
    perform public.record_line_oa_account_identity_verification(
      'b6000000-0000-4000-8000-000000000002', '@oa-onboard-b', 'Uoa-onboard-bot-a'
    );
    raise exception 'same physical OA was accepted for two active clubs';
  exception when unique_violation then
    null;
  end;
end;
$$;
reset role;

-- Active member sees only the safe projection for their own club.
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000002', true);
set local role authenticated;
do $$
declare payload jsonb;
begin
  payload := public.get_my_line_oa_onboarding_status('b4000000-0000-4000-8000-000000000001');
  if payload ->> 'club_name' <> 'OA 引導甲社'
    or payload ->> 'join_url' <> 'https://line.me/R/ti/p/%40oa-onboard-a'
    or (payload ->> 'oa_available')::boolean is not true
    or payload ->> 'friend_status' <> 'unknown'
    or payload ->> 'pair_status' <> 'unpaired'
    or (payload ->> 'dismissal_count')::integer <> 0 then
    raise exception 'active member onboarding projection is wrong: %', payload;
  end if;

  begin
    perform public.get_my_line_oa_onboarding_status('b4000000-0000-4000-8000-000000000002');
    raise exception 'member read another club onboarding status';
  exception when insufficient_privilege then
    if sqlerrm <> 'active_club_membership_required' then raise; end if;
  end;
end;
$$;
reset role;

-- Dismissal cadence is caller-only, cross-device and capped at three.
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000002', true);
set local role authenticated;
do $$
declare result jsonb;
begin
  result := public.dismiss_my_line_oa_onboarding('b4000000-0000-4000-8000-000000000001');
  if (result ->> 'dismissal_count')::integer <> 1
    or (result ->> 'next_prompt_after')::timestamptz < now() + interval '6 days 23 hours' then
    raise exception 'first dismissal did not create the 7-day cooling period: %', result;
  end if;
  result := public.dismiss_my_line_oa_onboarding('b4000000-0000-4000-8000-000000000001');
  if (result ->> 'dismissal_count')::integer <> 2
    or (result ->> 'next_prompt_after')::timestamptz < now() + interval '29 days 23 hours' then
    raise exception 'second dismissal did not create the 30-day cooling period: %', result;
  end if;
  result := public.dismiss_my_line_oa_onboarding('b4000000-0000-4000-8000-000000000001');
  if (result ->> 'dismissal_count')::integer <> 3 or result -> 'next_prompt_after' <> 'null'::jsonb then
    raise exception 'third dismissal did not permanently downgrade the prompt: %', result;
  end if;
  result := public.dismiss_my_line_oa_onboarding('b4000000-0000-4000-8000-000000000001');
  if (result ->> 'dismissal_count')::integer <> 3 then
    raise exception 'dismissal count exceeded its cap: %', result;
  end if;
end;
$$;
reset role;

-- Pairing state is derived from existing follower fields and never needs a
-- line_oa_followers.pair_status column.
insert into public.line_oa_followers (
  id, line_oa_account_id, club_id, person_id, app_account_id, oa_user_id,
  follower_status, paired_at
) values (
  'b7000000-0000-4000-8000-000000000001',
  'b6000000-0000-4000-8000-000000000001',
  'b4000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002',
  'b3000000-0000-4000-8000-000000000002',
  'Uoa-onboarding-member', 'following', now()
);

select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000002', true);
set local role authenticated;
do $$
declare payload jsonb;
begin
  payload := public.get_my_line_oa_onboarding_status('b4000000-0000-4000-8000-000000000001');
  if payload ->> 'friend_status' <> 'following' or payload ->> 'pair_status' <> 'paired' then
    raise exception 'existing follower fields did not derive paired status: %', payload;
  end if;
end;
$$;
reset role;

-- Friendship and pairing are independent states. If a legacy row identifies
-- the account but not the same person, the UI may say following while still
-- refusing to call the identity paired.
update public.line_oa_followers
set person_id = null,
    app_account_id = 'b3000000-0000-4000-8000-000000000002',
    paired_at = null
where id = 'b7000000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000002', true);
set local role authenticated;
do $$
declare payload jsonb;
begin
  payload := public.get_my_line_oa_onboarding_status('b4000000-0000-4000-8000-000000000001');
  if payload ->> 'friend_status' <> 'following' or payload ->> 'pair_status' <> 'conflict' then
    raise exception 'following but conflicted status was collapsed: %', payload;
  end if;
end;
$$;
reset role;

-- Suspended membership is rejected by the RPC, not merely hidden in UI.
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000003', true);
set local role authenticated;
do $$
begin
  begin
    perform public.get_my_line_oa_onboarding_status('b4000000-0000-4000-8000-000000000001');
    raise exception 'suspended member read onboarding status';
  exception when insufficient_privilege then
    if sqlerrm <> 'active_club_membership_required' then raise; end if;
  end;
end;
$$;
reset role;

-- Changing the configured identity invalidates verification immediately.
update public.line_oa_accounts
set basic_id = '@oa-onboard-a-changed'
where id = 'b6000000-0000-4000-8000-000000000001';

do $$
declare account public.line_oa_accounts;
begin
  select * into account from public.line_oa_accounts
  where id = 'b6000000-0000-4000-8000-000000000001';
  if account.verified_basic_id is not null
    or account.verified_bot_user_id is not null
    or account.identity_verified_at is not null then
    raise exception 'changed Basic ID retained stale trusted verification';
  end if;
end;
$$;

rollback;
