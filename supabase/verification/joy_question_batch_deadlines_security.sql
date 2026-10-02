-- Joy question batch deadlines remain optional, private, and answerable after expiry.
-- Behavioral member/manager isolation, idempotency, and answer-after-expiry are
-- exercised in joy_question_bank_batch_dispatch_security.sql.
begin;

do $$
declare
  routine text;
  task_definition text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'joy_question_batches'
      and column_name = 'due_on' and data_type = 'date' and is_nullable = 'YES'
  ) then
    raise exception 'Joy question batch due_on must be an optional calendar date';
  end if;

  if has_table_privilege('authenticated', 'public.joy_question_batches', 'SELECT')
    or has_table_privilege('authenticated', 'public.joy_question_batches', 'UPDATE')
    or has_table_privilege('anon', 'public.joy_question_batches', 'SELECT') then
    raise exception 'The new deadline must not grant direct access to private batch data';
  end if;

  foreach routine in array array[
    'public.dispatch_joy_question_batch(uuid,text,uuid[],uuid)',
    'public.dispatch_joy_question_batch_with_deadline(uuid,text,uuid[],uuid,date)'
  ] loop
    if has_function_privilege('anon', routine, 'EXECUTE')
      or not has_function_privilege('authenticated', routine, 'EXECUTE')
      or not exists (
        select 1 from pg_catalog.pg_proc
        where oid = routine::regprocedure and array_to_string(proconfig, ',') like '%search_path=%'
      ) then
      raise exception 'Question dispatch privilege or fixed search_path is incorrect for %', routine;
    end if;
  end loop;

  if pg_catalog.pg_get_functiondef('public.get_joy_question_manager_page(uuid)'::regprocedure)
       not like '%due_on%'
    or pg_catalog.pg_get_functiondef('public.get_joy_question_batch_detail(uuid,uuid)'::regprocedure)
       not like '%due_on%' then
    raise exception 'Manager batch history/detail does not return the optional deadline';
  end if;

  task_definition := pg_catalog.pg_get_functiondef(
    'public.list_my_member_pending_tasks_with_joy_tasks(uuid,integer,integer,boolean,boolean)'::regprocedure
  );
  if task_definition not like '%question_batch.due_on%'
    or task_definition not like '%Asia/Taipei%'
    or task_definition not like '%is_overdue%'
    or task_definition not like '%focusPostId=%' then
    raise exception 'Private member task projection does not carry the question deadline and overdue state';
  end if;

  if (((date '2026-10-03' + 1)::timestamp at time zone 'Asia/Taipei')
      <> timestamptz '2026-10-04 00:00:00+08') then
    raise exception 'A question date must expire at midnight after its Taiwan calendar day';
  end if;
end $$;

rollback;
