begin;

-- Keep a member's explicit "not attending" answer distinct from an event
-- whose registration deadline has passed. Preserve the existing projection
-- and patch only the upcoming-event status case.
do $migration$
declare
  function_definition text;
  old_upcoming_status constant text := $replace$          -- The same three states the hero uses, so one event never reads as
          -- two different things in two places on one page.
          'registration_state', case
            when item.my_response = 'attending' then 'registered'
            when public.event_registration_is_open(item.registration_deadline, item.starts_at, item.ends_at) then 'open'
            else 'closed'
          end$replace$;
  new_upcoming_status constant text := $replace$          -- Preserve the member's answer separately from registration availability.
          'registration_state', case
            when item.my_response = 'declined' then 'declined'
            when item.my_response = 'attending' then 'registered'
            when public.event_registration_is_open(item.registration_deadline, item.starts_at, item.ends_at) then 'open'
            else 'closed'
          end$replace$;
  occurrences integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.get_my_member_home_projection(uuid)'::regprocedure
  ) into function_definition;

  occurrences := (
    pg_catalog.length(function_definition)
    - pg_catalog.length(pg_catalog.replace(function_definition, old_upcoming_status, ''))
  ) / pg_catalog.length(old_upcoming_status);
  if occurrences <> 1 then
    raise exception 'member-home upcoming-event status fragment mismatch';
  end if;

  function_definition := pg_catalog.replace(
    function_definition, old_upcoming_status, new_upcoming_status
  );
  execute function_definition;

  select pg_catalog.pg_get_functiondef(
    'public.get_my_member_home_projection(uuid)'::regprocedure
  ) into function_definition;
  if function_definition not like '%when item.my_response = ''declined'' then ''declined''%' then
    raise exception 'member-home upcoming events do not preserve declined responses';
  end if;
end;
$migration$;

commit;
