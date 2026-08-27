-- Birthday feature flags must control browser-facing database EXECUTE grants.
-- Run against local Supabase only. Every fixture and flag mutation is rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '17000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'birthday-flag-admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '17000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'birthday-flag-member@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email)
values
  ('27000000-0000-4000-8000-000000000001', '生日旗標管理者', 'birthday-flag-admin@example.test'),
  ('27000000-0000-4000-8000-000000000002', '生日旗標社員', 'birthday-flag-member@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('37000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', 'birthday-flag-admin@example.test', '生日旗標管理者', 'active'),
  ('37000000-0000-4000-8000-000000000002', '17000000-0000-4000-8000-000000000002', '27000000-0000-4000-8000-000000000002', 'birthday-flag-member@example.test', '生日旗標社員', 'active');

insert into public.platform_roles (app_account_id, role_key)
values ('37000000-0000-4000-8000-000000000001', 'platform_admin');

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.get_my_birthday_page_v2(uuid)',
    'public.set_my_birthday_preference_v2(uuid, boolean, boolean)',
    'public.create_birthday_wish_v2(uuid, uuid, text)',
    'public.update_own_birthday_wish_v2(uuid, uuid, text)',
    'public.delete_own_birthday_wish_v2(uuid, uuid)',
    'public.list_birthday_wish_question_bank(uuid)',
    'public.create_birthday_wish_question(uuid, text, text, text, integer)',
    'public.update_birthday_wish_question(uuid, uuid, text, text, integer, boolean)',
    'public.create_birthday_wish_assignment_batch(uuid, integer, integer)',
    'public.create_birthday_wish_campaign(uuid, uuid, integer, date, uuid)',
    'public.assign_birthday_wish_participant(uuid, uuid, uuid, uuid, uuid)',
    'public.generate_birthday_wish_collection_month(uuid, integer, integer)',
    'public.save_birthday_wish_submission(uuid, uuid, text)',
    'public.delete_own_birthday_wish_submission(uuid, uuid)',
    'public.get_my_birthday_wish_collection_page(uuid)',
    'public.ensure_birthday_wish_collection_notification(uuid, uuid)',
    'public.publish_birthday_wish_submission(uuid, uuid)',
    'public.list_published_birthday_wish_submissions(uuid)',
    'public.hide_birthday_wish_submission(uuid, uuid)',
    'public.decline_birthday_wish_assignment(uuid, uuid)'
  ]::text[] loop
    if has_function_privilege('anon', function_signature, 'EXECUTE')
       or has_function_privilege('authenticated', function_signature, 'EXECUTE') then
      raise exception 'birthday function remained executable while its flag was absent: %', function_signature;
    end if;
  end loop;
end;
$$;

-- A normal authenticated account cannot use the disabled feature path.
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000002', true);
do $$
begin
  begin
    perform public.get_my_birthday_page_v2(null);
    raise exception 'birthday V2 RPC executed while its flag was absent';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.get_my_birthday_wish_collection_page('47000000-0000-4000-8000-000000000001');
    raise exception 'birthday collection RPC executed while its flag was absent';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- Only the protected platform-admin flag RPC restores authenticated EXECUTE.
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000001', true);
select * from public.set_platform_feature_flag(
  'birthday_wishes_v2', true, array['local']::text[], 100
);
select * from public.set_platform_feature_flag(
  'birthday_wishes_collection_v1', true, array['local']::text[], 100
);
reset role;

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.get_my_birthday_page_v2(uuid)',
    'public.set_my_birthday_preference_v2(uuid, boolean, boolean)',
    'public.create_birthday_wish_v2(uuid, uuid, text)',
    'public.update_own_birthday_wish_v2(uuid, uuid, text)',
    'public.delete_own_birthday_wish_v2(uuid, uuid)',
    'public.list_birthday_wish_question_bank(uuid)',
    'public.create_birthday_wish_question(uuid, text, text, text, integer)',
    'public.update_birthday_wish_question(uuid, uuid, text, text, integer, boolean)',
    'public.create_birthday_wish_assignment_batch(uuid, integer, integer)',
    'public.create_birthday_wish_campaign(uuid, uuid, integer, date, uuid)',
    'public.assign_birthday_wish_participant(uuid, uuid, uuid, uuid, uuid)',
    'public.generate_birthday_wish_collection_month(uuid, integer, integer)',
    'public.save_birthday_wish_submission(uuid, uuid, text)',
    'public.delete_own_birthday_wish_submission(uuid, uuid)',
    'public.get_my_birthday_wish_collection_page(uuid)',
    'public.ensure_birthday_wish_collection_notification(uuid, uuid)',
    'public.publish_birthday_wish_submission(uuid, uuid)',
    'public.list_published_birthday_wish_submissions(uuid)',
    'public.hide_birthday_wish_submission(uuid, uuid)',
    'public.decline_birthday_wish_assignment(uuid, uuid)'
  ]::text[] loop
    if not has_function_privilege('authenticated', function_signature, 'EXECUTE') then
      raise exception 'birthday function grant was not restored after enabling flags: %', function_signature;
    end if;
  end loop;
end;
$$;

-- Disabling one feature removes only its own browser-facing grants. Restore
-- it before checking the reverse direction so the two independent flags are
-- proven not to share a revoke boundary.
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000001', true);
select * from public.set_platform_feature_flag(
  'birthday_wishes_v2', false, array['local']::text[], 100
);
reset role;

do $$
begin
  if has_function_privilege('authenticated', 'public.get_my_birthday_page_v2(uuid)', 'EXECUTE') then
    raise exception 'disabling birthday V2 did not revoke its browser grant';
  end if;
  if not has_function_privilege('authenticated', 'public.get_my_birthday_wish_collection_page(uuid)', 'EXECUTE') then
    raise exception 'disabling birthday V2 revoked the collection grant';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000001', true);
select * from public.set_platform_feature_flag(
  'birthday_wishes_v2', true, array['local']::text[], 100
);
select * from public.set_platform_feature_flag(
  'birthday_wishes_collection_v1', false, array['local']::text[], 100
);
reset role;

do $$
begin
  if not has_function_privilege('authenticated', 'public.get_my_birthday_page_v2(uuid)', 'EXECUTE') then
    raise exception 'disabling collection revoked the birthday V2 grant';
  end if;
  if has_function_privilege('authenticated', 'public.get_my_birthday_wish_collection_page(uuid)', 'EXECUTE') then
    raise exception 'disabling collection did not revoke its browser grant';
  end if;
  if has_function_privilege('authenticated', 'public.ensure_birthday_wish_collection_notification(uuid, uuid)', 'EXECUTE') then
    raise exception 'disabling collection did not revoke its notification grant';
  end if;
end;
$$;

-- Leave both flags disabled for the final fail-closed assertion.
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000001', true);
select * from public.set_platform_feature_flag(
  'birthday_wishes_collection_v1', false, array['local']::text[], 100
);
select * from public.set_platform_feature_flag(
  'birthday_wishes_v2', false, array['local']::text[], 100
);
reset role;

do $$
begin
  if has_function_privilege('authenticated', 'public.get_my_birthday_page_v2(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.get_my_birthday_wish_collection_page(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.ensure_birthday_wish_collection_notification(uuid, uuid)', 'EXECUTE') then
    raise exception 'birthday feature grants remained after disabling flags';
  end if;
  if not has_function_privilege('service_role', 'public.run_birthday_wish_collection_scheduler(timestamptz)', 'EXECUTE') then
    raise exception 'service-role scheduler grant was changed by browser feature gate';
  end if;
end;
$$;

rollback;
