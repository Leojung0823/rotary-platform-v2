begin;

-- Extend only the assigned-question CTE and its output item. Audience checks,
-- answer completion behavior, and all other task kinds remain canonical.
do $migration$
declare
  function_definition text;
  old_question_projection constant text := $replace$      left(concat_ws(' · ',
        left(concat_ws('：', nullif(btrim(post.title), ''), left(btrim(post.content), 150)), 180),
        '來自 ' || author_account.account_display_name
      ), 280) as detail,
      null::timestamptz as deadline
    from public.joy_posts as post
    join public.joy_post_audiences as audience
      on audience.post_id = post.id and audience.club_id = post.club_id
    join public.app_accounts as author_account on author_account.id = post.author_app_account_id$replace$;
  new_question_projection constant text := $replace$      left(concat_ws(' · ',
        left(concat_ws('：', nullif(btrim(post.title), ''), left(btrim(post.content), 150)), 180),
        '來自 ' || author_account.account_display_name,
        case when question_batch.due_on is null then null
          else '截止 ' || pg_catalog.to_char(question_batch.due_on, 'YYYY-MM-DD')
        end
      ), 300) as detail,
      case when question_batch.due_on is null then null
        else (question_batch.due_on + 1)::timestamp at time zone 'Asia/Taipei'
      end as deadline
    from public.joy_posts as post
    join public.joy_post_audiences as audience
      on audience.post_id = post.id and audience.club_id = post.club_id
    join public.app_accounts as author_account on author_account.id = post.author_app_account_id
    left join public.joy_question_batch_assignments as question_assignment
      on question_assignment.post_id = post.id
      and question_assignment.club_id = post.club_id
      and question_assignment.recipient_membership_id = audience.membership_id
    left join public.joy_question_batches as question_batch
      on question_batch.id = question_assignment.batch_id
      and question_batch.club_id = question_assignment.club_id$replace$;
  question_payload_before constant text := $replace$      jsonb_build_object(
        'task_id', task.post_id::text,
        'kind', 'joy_question',
        'title', task.task_title,
        'detail', task.detail,
        'action_path', concat(
          '/joy?clubId=', p_club_id::text,
          '&mode=member&focusPostId=', task.post_id::text
        ),
        'deadline', null,
        'hours_remaining', null,
        'count', null
      )$replace$;
  question_payload_after constant text := $replace$      jsonb_build_object(
        'task_id', task.post_id::text,
        'kind', 'joy_question',
        'title', task.task_title,
        'detail', task.detail,
        'action_path', concat(
          '/joy?clubId=', p_club_id::text,
          '&mode=member&focusPostId=', task.post_id::text
        ),
        'deadline', task.deadline,
        'hours_remaining', case
          when task.deadline is null then null
          else greatest(0, floor(extract(epoch from (task.deadline - pg_catalog.statement_timestamp())) / 3600)::integer)
        end,
        'is_overdue', task.deadline is not null and task.deadline <= pg_catalog.statement_timestamp(),
        'count', null
      )$replace$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.list_my_member_pending_tasks_with_joy_tasks(uuid,integer,integer,boolean,boolean)'::regprocedure
  ) into function_definition;

  if pg_catalog.length(function_definition)
      - pg_catalog.length(pg_catalog.replace(function_definition, old_question_projection, ''))
      <> pg_catalog.length(old_question_projection) then
    raise exception 'could not uniquely locate the Joy question task projection';
  end if;
  if pg_catalog.length(function_definition)
      - pg_catalog.length(pg_catalog.replace(function_definition, question_payload_before, ''))
      <> pg_catalog.length(question_payload_before) then
    raise exception 'could not uniquely locate the Joy question task payload';
  end if;

  function_definition := pg_catalog.replace(
    function_definition, old_question_projection, new_question_projection
  );
  function_definition := pg_catalog.replace(
    function_definition, question_payload_before, question_payload_after
  );
  execute function_definition;

  select pg_catalog.pg_get_functiondef(
    'public.list_my_member_pending_tasks_with_joy_tasks(uuid,integer,integer,boolean,boolean)'::regprocedure
  ) into function_definition;
  if function_definition not like '%question_batch.due_on%'
    or function_definition not like '%''is_overdue''%'
    or function_definition not like '%''kind'', ''joy_question''%' then
    raise exception 'Joy question task deadline projection did not install completely';
  end if;
end;
$migration$;

commit;
