-- The service-plan page defaults to the current Rotary year. That default is
-- a date, while the RPC's p_start_year is an integer; verify the deployed
-- function keeps the explicit conversion instead of reintroducing the runtime
-- date-to-integer failure.
begin;

do $$
declare
  function_oid oid;
  function_definition text;
begin
  function_oid := to_regprocedure('public.get_club_affairs_page(uuid,integer,boolean)');
  if function_oid is null then
    function_oid := to_regprocedure('public.get_club_affairs_page(uuid,integer)');
  end if;

  if function_oid is null then
    raise exception 'get_club_affairs_page function was not found';
  end if;

  select pg_catalog.pg_get_functiondef(function_oid)
    into function_definition;

  if position('extract(year from public.current_rotary_year_start())::integer' in function_definition) = 0 then
    raise exception 'get_club_affairs_page must convert the Rotary-year date to integer';
  end if;

  if position('coalesce(p_start_year, public.current_rotary_year_start())' in function_definition) > 0 then
    raise exception 'get_club_affairs_page still assigns a date directly to target_year';
  end if;
end;
$$;

rollback;
