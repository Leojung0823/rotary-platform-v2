-- The service plan is club content a member reads and an officer writes. The
-- browser never receives table privileges: it uses the two server-authorised
-- projections below. A draft is private to management mode, while published
-- content is visible only after the membership gate succeeds.
-- Run against a freshly reset local database. All fixtures are rolled back.

begin;

do $$
begin
  if has_table_privilege('anon', 'public.club_service_plans', 'SELECT')
     or has_table_privilege('authenticated', 'public.club_service_plans', 'SELECT')
     or has_table_privilege('authenticated', 'public.club_service_plans', 'INSERT')
     or has_table_privilege('authenticated', 'public.club_service_plans', 'UPDATE')
     or has_table_privilege('anon', 'public.club_service_plan_sections', 'SELECT')
     or has_table_privilege('authenticated', 'public.club_service_plan_sections', 'SELECT')
     or has_table_privilege('authenticated', 'public.club_service_plan_sections', 'INSERT')
     or has_table_privilege('authenticated', 'public.club_service_plan_sections', 'UPDATE') then
    raise exception 'service plan tables must not be reachable from a browser role';
  end if;

  if not (
    select relrowsecurity from pg_catalog.pg_class
    where oid = 'public.club_service_plans'::regclass
  ) or not (
    select relrowsecurity from pg_catalog.pg_class
    where oid = 'public.club_service_plan_sections'::regclass
  ) then
    raise exception 'service plan tables must have row level security enabled';
  end if;

  if has_function_privilege('anon', 'public.get_club_affairs_page(uuid,integer,boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.upsert_club_service_plan_v2(uuid,integer,text,text,text,text,boolean,jsonb)', 'EXECUTE') then
    raise exception 'service plan functions must not be reachable before sign-in';
  end if;
  if not has_function_privilege('authenticated', 'public.get_club_affairs_page(uuid,integer,boolean)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.upsert_club_service_plan_v2(uuid,integer,text,text,text,text,boolean,jsonb)', 'EXECUTE') then
    raise exception 'signed-in callers must reach the authorised service plan functions';
  end if;
end;
$$;

do $$
declare
  page_definition text;
  write_definition text;
  manage_permission_count integer;
begin
  select pg_catalog.pg_get_functiondef('public.get_club_affairs_page(uuid,integer,boolean)'::regprocedure)
    into page_definition;

  -- A member of another club must not be able to read this one's affairs.
  if position('member.read' in page_definition) = 0 then
    raise exception 'club affairs page must require club membership';
  end if;

  -- Managers in member mode receive the same published-only projection as an
  -- ordinary member; the explicit false branch is reserved for management.
  if position('can_manage := p_as_member is false' in page_definition) = 0
     or position('plan.plan_status = ''published''' in page_definition) = 0
     or position('p_as_member is false and can_manage' in page_definition) = 0 then
    raise exception 'member mode must not expose drafts or management capability';
  end if;

  select pg_catalog.pg_get_functiondef('public.upsert_club_service_plan_v2(uuid,integer,text,text,text,text,boolean,jsonb)'::regprocedure)
    into write_definition;

  if position('current_can_manage_service_plan' in write_definition) = 0
     or position('jsonb_array_length(p_sections) <> 4' in write_definition) = 0
     or position('service_plan_publish_incomplete' in write_definition) = 0
     or position('on conflict (service_plan_id, category_key) do update' in write_definition) = 0 then
    raise exception 'V2 writes must be manager-only and validate all four sections';
  end if;

  select count(*) into manage_permission_count
  from public.role_permissions
  where permission_key = 'service_plan.manage'
    and role_key in ('platform_admin', 'president', 'secretary');
  if manage_permission_count <> 3 then
    raise exception 'service_plan.manage must be granted to platform admin, president and secretary';
  end if;
end;
$$;

rollback;
