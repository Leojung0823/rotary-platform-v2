-- Birthday collection LINE push is a scheduler-only projection and log path.
-- Run against a freshly reset local database. All fixtures are rolled back.

begin;

do $$
begin
  if has_function_privilege('anon', 'public.list_birthday_collection_line_push_jobs()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.list_birthday_collection_line_push_jobs()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.list_birthday_collection_line_push_jobs()', 'EXECUTE') then
    raise exception 'birthday LINE target projection privilege boundary is wrong';
  end if;

  if has_function_privilege('anon', 'public.record_birthday_collection_line_push(uuid,uuid,integer,jsonb,text,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.record_birthday_collection_line_push(uuid,uuid,integer,jsonb,text,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.record_birthday_collection_line_push(uuid,uuid,integer,jsonb,text,text,text)', 'EXECUTE') then
    raise exception 'birthday LINE push log privilege boundary is wrong';
  end if;
end;
$$;

do $$
declare
  target_definition text;
  log_definition text;
begin
  select pg_catalog.pg_get_functiondef(oid) into target_definition
  from pg_catalog.pg_proc
  where proname = 'list_birthday_collection_line_push_jobs'
    and pronamespace = 'public'::regnamespace;

  select pg_catalog.pg_get_functiondef(oid) into log_definition
  from pg_catalog.pg_proc
  where proname = 'record_birthday_collection_line_push'
    and pronamespace = 'public'::regnamespace;

  if position('birthday_wish_collection_notifications' in target_definition) = 0
     or position('birthday_participant_id' in target_definition) = 0
     or position('line_enabled' in target_definition) = 0
     or position('club_announcements' in target_definition) = 0
     or position('follower_status' in target_definition) = 0
     or position('membership_status' in target_definition) = 0
     or position('source_message_id' in target_definition) = 0 then
    raise exception 'birthday LINE target projection lost its scope, preference, or idempotency filters';
  end if;

  if position('birthday_wish_collection_notifications' in log_definition) = 0
     or position('source_message_id' in log_definition) = 0
     or position('birthday_notification_not_available' in log_definition) = 0 then
    raise exception 'birthday LINE log RPC lost its birthday-message boundary';
  end if;

  if position('security definer' in lower(target_definition)) = 0
     or position('set search_path' in lower(target_definition)) = 0
     or position('security definer' in lower(log_definition)) = 0
     or position('set search_path' in lower(log_definition)) = 0 then
    raise exception 'birthday LINE service RPCs lost security-definer hardening';
  end if;
end;
$$;

rollback;
