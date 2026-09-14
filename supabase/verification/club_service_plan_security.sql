-- The service plan is club content a member reads and an officer writes, so the
-- boundaries are: no browser role touches the table, a draft is invisible to
-- members, and writing needs club authority.
-- Run against a freshly reset local database. All fixtures are rolled back.

begin;

do $$
begin
  if has_table_privilege('anon', 'public.club_service_plans', 'SELECT')
     or has_table_privilege('authenticated', 'public.club_service_plans', 'SELECT')
     or has_table_privilege('authenticated', 'public.club_service_plans', 'INSERT')
     or has_table_privilege('authenticated', 'public.club_service_plans', 'UPDATE') then
    raise exception 'club_service_plans must not be reachable from a browser role';
  end if;

  if not (
    select relrowsecurity from pg_catalog.pg_class
    where oid = 'public.club_service_plans'::regclass
  ) then
    raise exception 'club_service_plans must have row level security enabled';
  end if;

  if has_function_privilege('anon', 'public.get_club_affairs_page(uuid,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.upsert_club_service_plan(uuid,integer,text,text,boolean)', 'EXECUTE') then
    raise exception 'service plan functions must not be reachable before sign-in';
  end if;
  if not has_function_privilege('authenticated', 'public.get_club_affairs_page(uuid,integer)', 'EXECUTE') then
    raise exception 'members must be able to read the club affairs page';
  end if;
end;
$$;

do $$
declare
  page_definition text;
  write_definition text;
begin
  select pg_catalog.pg_get_functiondef(oid) into page_definition
  from pg_catalog.pg_proc
  where proname = 'get_club_affairs_page' and pronamespace = 'public'::regnamespace;

  -- A member of another club must not be able to read this one's affairs.
  if position('member.read' in page_definition) = 0 then
    raise exception 'club affairs page must require club membership';
  end if;

  -- An unfinished plan must not read as this year's plan to the club.
  if position('plan.plan_status = ''published'' or can_manage' in page_definition) = 0 then
    raise exception 'a draft service plan must be visible only to someone who may edit it';
  end if;

  select pg_catalog.pg_get_functiondef(oid) into write_definition
  from pg_catalog.pg_proc
  where proname = 'upsert_club_service_plan' and pronamespace = 'public'::regnamespace;

  if position('current_can_manage_service_plan' in write_definition) = 0 then
    raise exception 'writing a service plan must require club authority';
  end if;
  -- One plan per club per year, so a second write edits rather than duplicates.
  if position('on conflict (club_id, start_year) do update' in write_definition) = 0 then
    raise exception 'a second save for the same year must update the existing plan';
  end if;
end;
$$;

rollback;
