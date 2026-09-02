-- Message centre LINE push authority. Run against local Supabase only.
-- Every fixture and flag mutation is rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '19000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'line-push-flag-admin@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email)
values ('29000000-0000-4000-8000-000000000001', '推播旗標管理者', 'line-push-flag-admin@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('39000000-0000-4000-8000-000000000001', '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001', 'line-push-flag-admin@example.test', '推播旗標管理者', 'active');

insert into public.platform_roles (app_account_id, role_key)
values ('39000000-0000-4000-8000-000000000001', 'platform_admin');

-- The flag is what grants authenticated EXECUTE. Set it through the protected
-- RPC rather than the table: the flag table refuses a write with no actor, and
-- going through the RPC verifies the real path an operator uses.
set local role authenticated;
select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000001', true);
select * from public.set_platform_feature_flag(
  'line_oa_event_push_v1', true, array['local']::text[], 100
);
reset role;

do $$
begin
  if not has_function_privilege(
    'authenticated', 'public.list_club_message_line_targets(uuid, uuid)', 'EXECUTE'
  ) then
    raise exception 'enabling the flag must grant EXECUTE to authenticated';
  end if;
end;
$$;

-- Disabling it again must take the grant back: a missing or disabled flag is a
-- closed door at the database, not only in the server evaluator.
set local role authenticated;
select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000001', true);
select * from public.set_platform_feature_flag(
  'line_oa_event_push_v1', false, array['local']::text[], 0
);
reset role;

do $$
begin
  if has_function_privilege(
    'authenticated', 'public.list_club_message_line_targets(uuid, uuid)', 'EXECUTE'
  ) then
    raise exception 'a disabled flag must revoke EXECUTE from authenticated';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.record_club_message_line_push(uuid, uuid, integer, jsonb, text, text, text)',
    'EXECUTE'
  ) then
    raise exception 'a disabled flag must revoke the push log grant as well';
  end if;
end;
$$;

delete from public.platform_feature_flags where feature_key = 'line_oa_event_push_v1';

do $$
begin
  if has_function_privilege(
    'authenticated', 'public.list_club_message_line_targets(uuid, uuid)', 'EXECUTE'
  ) then
    raise exception 'a deleted flag row must leave the door closed';
  end if;
end;
$$;

-- The birthday gate must be untouched by the LINE gate. Cross-feature leakage
-- here would silently disable a shipped feature.
set local role authenticated;
select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000001', true);
select * from public.set_platform_feature_flag(
  'birthday_wishes_v2', true, array['local']::text[], 100
);
select * from public.set_platform_feature_flag(
  'line_oa_event_push_v1', false, array['local']::text[], 0
);
reset role;

do $$
begin
  if not has_function_privilege(
    'authenticated', 'public.get_my_birthday_page_v2(uuid)', 'EXECUTE'
  ) then
    raise exception 'the LINE push gate must not revoke birthday grants';
  end if;
end;
$$;

-- One push per message, enforced by the index rather than by the caller: a
-- double submit must not deliver the same announcement to LINE twice.
do $$
declare
  index_definition text;
begin
  select pg_catalog.pg_get_indexdef(oid) into index_definition
  from pg_catalog.pg_class
  where relname = 'line_push_logs_one_per_message';

  if index_definition is null then
    raise exception 'the per-message push index is missing';
  end if;
  if position('UNIQUE' in index_definition) = 0 then
    raise exception 'the per-message push index must be unique';
  end if;
end;
$$;

-- The manual OA push is a separate authority and must keep working with
-- oa.manage alone; the message push must not have widened it.
do $$
declare
  manual_definition text;
begin
  select pg_catalog.pg_get_functiondef(oid) into manual_definition
  from pg_catalog.pg_proc
  where proname = 'record_line_push'
    and pronamespace = 'public'::regnamespace;

  if position('oa_manage_required' in manual_definition) = 0 then
    raise exception 'the manual push log must still require oa.manage';
  end if;
end;
$$;

-- The message push RPCs authorise on member.manage, the same permission that
-- allowed the message to be created, and refuse a message from another club.
do $$
declare
  targets_definition text;
  log_definition text;
begin
  select pg_catalog.pg_get_functiondef(oid) into targets_definition
  from pg_catalog.pg_proc
  where proname = 'list_club_message_line_targets' and pronamespace = 'public'::regnamespace;

  select pg_catalog.pg_get_functiondef(oid) into log_definition
  from pg_catalog.pg_proc
  where proname = 'record_club_message_line_push' and pronamespace = 'public'::regnamespace;

  if position('member_manage_required' in targets_definition) = 0
     or position('member_manage_required' in log_definition) = 0 then
    raise exception 'both message push RPCs must require member.manage';
  end if;

  -- A message id from another club must not resolve. Without the club check an
  -- officer of one club could read another club's addressed members.
  if position('message.club_id = p_club_id' in targets_definition) = 0
     or position('message.club_id = p_club_id' in log_definition) = 0 then
    raise exception 'both message push RPCs must bind the message to the club';
  end if;

  -- Members who turned either switch off must not be pushed to.
  if position('line_enabled' in targets_definition) = 0
     or position('club_announcements' in targets_definition) = 0 then
    raise exception 'the target list must honour both notification switches';
  end if;

  -- Only members who are still active and still following can be reached.
  if position('follower_status' in targets_definition) = 0
     or position('membership_status' in targets_definition) = 0 then
    raise exception 'the target list must exclude inactive members and non-followers';
  end if;
end;
$$;

rollback;
