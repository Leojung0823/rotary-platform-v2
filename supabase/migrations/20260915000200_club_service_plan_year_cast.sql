begin;

-- current_rotary_year_start() returns the first day of a Rotary year (date),
-- while the service-plan RPC stores that year as an integer. The original
-- function declarations used the date directly in the integer initializer;
-- the error only appeared when the page omitted p_start_year. Rewrite the
-- already-declared function from PostgreSQL's own definition so this repair
-- cannot accidentally drop an authorization check or a projection field.
do $$
declare
  function_oid oid;
  function_definition text;
  old_declaration text := 'target_year integer := coalesce(p_start_year, public.current_rotary_year_start());';
  corrected_declaration text := 'target_year integer := coalesce(p_start_year, extract(year from public.current_rotary_year_start())::integer);';
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

  if position(corrected_declaration in function_definition) > 0 then
    return;
  end if;

  if position(old_declaration in function_definition) = 0 then
    raise exception 'get_club_affairs_page did not contain the expected year declaration';
  end if;

  execute replace(function_definition, old_declaration, corrected_declaration);
end;
$$;

commit;
