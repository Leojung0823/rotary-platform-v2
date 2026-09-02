-- Event publish LINE push authority. Run against local Supabase only.
-- Every fixture and flag mutation is rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '1a000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'event-push-flag-admin@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email)
values ('2a000000-0000-4000-8000-000000000001', '活動推播旗標管理者', 'event-push-flag-admin@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('3a000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', 'event-push-flag-admin@example.test', '活動推播旗標管理者', 'active');

insert into public.platform_roles (app_account_id, role_key)
values ('3a000000-0000-4000-8000-000000000001', 'platform_admin');

-- One flag owns the whole feature: enabling it must grant every push RPC,
-- message centre and event alike. A partial grant would leave one surface
-- reachable while the other is closed.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1a000000-0000-4000-8000-000000000001', true);
select * from public.set_platform_feature_flag(
  'line_oa_event_push_v1', true, array['local']::text[], 100
);
reset role;

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.list_club_message_line_targets(uuid, uuid)',
    'public.record_club_message_line_push(uuid, uuid, integer, jsonb, text, text, text)',
    'public.list_club_event_line_targets(uuid, uuid)',
    'public.record_club_event_line_push(uuid, uuid, integer, jsonb, text, text, text)'
  ] loop
    if not has_function_privilege('authenticated', function_signature, 'EXECUTE') then
      raise exception 'enabling the flag did not grant %', function_signature;
    end if;
  end loop;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '1a000000-0000-4000-8000-000000000001', true);
select * from public.set_platform_feature_flag(
  'line_oa_event_push_v1', false, array['local']::text[], 0
);
reset role;

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.list_club_message_line_targets(uuid, uuid)',
    'public.record_club_message_line_push(uuid, uuid, integer, jsonb, text, text, text)',
    'public.list_club_event_line_targets(uuid, uuid)',
    'public.record_club_event_line_push(uuid, uuid, integer, jsonb, text, text, text)'
  ] loop
    if has_function_privilege('authenticated', function_signature, 'EXECUTE') then
      raise exception 'disabling the flag did not revoke %', function_signature;
    end if;
  end loop;
end;
$$;

-- One push per event, held by the index rather than by the caller.
do $$
declare
  index_definition text;
begin
  select pg_catalog.pg_get_indexdef(oid) into index_definition
  from pg_catalog.pg_class
  where relname = 'line_push_logs_one_per_event';

  if index_definition is null or position('UNIQUE' in index_definition) = 0 then
    raise exception 'the per-event push index must exist and be unique';
  end if;
end;
$$;

do $$
declare
  targets_definition text;
  log_definition text;
begin
  select pg_catalog.pg_get_functiondef(oid) into targets_definition
  from pg_catalog.pg_proc
  where proname = 'list_club_event_line_targets' and pronamespace = 'public'::regnamespace;

  select pg_catalog.pg_get_functiondef(oid) into log_definition
  from pg_catalog.pg_proc
  where proname = 'record_club_event_line_push' and pronamespace = 'public'::regnamespace;

  -- Publishing an event is event.manage, so announcing it is too. Reusing
  -- member.manage here would let a message officer announce events.
  if position('event_manage_required' in targets_definition) = 0
     or position('event_manage_required' in log_definition) = 0 then
    raise exception 'both event push RPCs must require event.manage';
  end if;

  -- An event id from another club must not resolve.
  if position('club_id = p_club_id' in targets_definition) = 0
     or position('event.club_id = p_club_id' in log_definition) = 0 then
    raise exception 'both event push RPCs must bind the event to the club';
  end if;

  -- Members who turned either switch off must not be pushed to, and inactive
  -- members and non-followers must be excluded.
  if position('line_enabled' in targets_definition) = 0
     or position('club_announcements' in targets_definition) = 0
     or position('follower_status' in targets_definition) = 0
     or position('membership_status' in targets_definition) = 0 then
    raise exception 'the event target list must honour switches and membership state';
  end if;

  -- An event addressed to a tag must not reach the whole club.
  if position('club_event_audiences' in targets_definition) = 0
     or position('club_event_audience_members' in targets_definition) = 0 then
    raise exception 'the event target list must respect the event audience';
  end if;
end;
$$;

-- The message centre push must keep its own authority; the event push must not
-- have widened or replaced it.
do $$
declare
  message_definition text;
begin
  select pg_catalog.pg_get_functiondef(oid) into message_definition
  from pg_catalog.pg_proc
  where proname = 'record_club_message_line_push' and pronamespace = 'public'::regnamespace;

  if position('member_manage_required' in message_definition) = 0 then
    raise exception 'the message centre push must still require member.manage';
  end if;
end;
$$;

rollback;
