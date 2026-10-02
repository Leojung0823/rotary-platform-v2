begin;

-- Keep the manager's batch detail response in sync with the summary without
-- restating its authorization checks or private assignment projection.
do $migration$
declare
  function_definition text;
  old_batch_detail constant text := $replace$    'created_at', batch.created_at,
    'assignments', coalesce(($replace$;
  new_batch_detail constant text := $replace$    'created_at', batch.created_at,
    'due_on', batch.due_on,
    'assignments', coalesce(($replace$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.get_joy_question_batch_detail(uuid,uuid)'::regprocedure
  ) into function_definition;

  if pg_catalog.length(function_definition)
      - pg_catalog.length(pg_catalog.replace(function_definition, old_batch_detail, ''))
      <> pg_catalog.length(old_batch_detail) then
    raise exception 'could not uniquely locate the Joy question batch detail projection';
  end if;

  function_definition := pg_catalog.replace(function_definition, old_batch_detail, new_batch_detail);
  execute function_definition;

  select pg_catalog.pg_get_functiondef(
    'public.get_joy_question_batch_detail(uuid,uuid)'::regprocedure
  ) into function_definition;
  if function_definition not like '%''due_on'', batch.due_on%' then
    raise exception 'Joy question batch detail projection did not add the due date';
  end if;
end;
$migration$;

commit;
