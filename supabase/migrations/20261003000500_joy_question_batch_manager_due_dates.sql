begin;

-- Preserve the canonical manager projection and add only the stored date to
-- each batch summary. The guarded replacement fails closed if the live body no
-- longer has the exact expected shape.
do $migration$
declare
  function_definition text;
  old_batch_projection constant text := $replace$          'created_at', batch.created_at,
        'assignment_count', count(assignment.post_id)::integer,$replace$;
  new_batch_projection constant text := $replace$          'created_at', batch.created_at,
        'due_on', batch.due_on,
        'assignment_count', count(assignment.post_id)::integer,$replace$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.get_joy_question_manager_page(uuid)'::regprocedure
  ) into function_definition;

  if pg_catalog.length(function_definition)
      - pg_catalog.length(pg_catalog.replace(function_definition, old_batch_projection, ''))
      <> pg_catalog.length(old_batch_projection) then
    raise exception 'could not uniquely locate the Joy question batch summary projection';
  end if;

  function_definition := pg_catalog.replace(
    function_definition, old_batch_projection, new_batch_projection
  );
  execute function_definition;

  select pg_catalog.pg_get_functiondef(
    'public.get_joy_question_manager_page(uuid)'::regprocedure
  ) into function_definition;
  if function_definition not like '%''due_on'', batch.due_on%' then
    raise exception 'Joy question manager projection did not add the batch due date';
  end if;
end;
$migration$;

commit;
