-- Joy Wall question bank and unique, private member-task batch boundaries.
-- Run only against the isolated local Supabase verification database.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'a9100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'joy-bank-manager@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a9100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'joy-bank-member-one@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a9100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'joy-bank-member-two@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a9100000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'joy-bank-peer@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a9100000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'joy-bank-suspended@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a9100000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'joy-bank-outsider@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('a9200000-0000-4000-8000-000000000001', '題庫管理幹部', 'joy-bank-manager@example.test'),
  ('a9200000-0000-4000-8000-000000000002', '題庫社員甲', 'joy-bank-member-one@example.test'),
  ('a9200000-0000-4000-8000-000000000003', '題庫社員乙', 'joy-bank-member-two@example.test'),
  ('a9200000-0000-4000-8000-000000000004', '題庫旁觀社員', 'joy-bank-peer@example.test'),
  ('a9200000-0000-4000-8000-000000000005', '題庫停權社員', 'joy-bank-suspended@example.test'),
  ('a9200000-0000-4000-8000-000000000006', '題庫外社社員', 'joy-bank-outsider@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('a9300000-0000-4000-8000-000000000001', 'a9100000-0000-4000-8000-000000000001', 'a9200000-0000-4000-8000-000000000001', 'joy-bank-manager@example.test', '題庫管理幹部', 'active'),
  ('a9300000-0000-4000-8000-000000000002', 'a9100000-0000-4000-8000-000000000002', 'a9200000-0000-4000-8000-000000000002', 'joy-bank-member-one@example.test', '題庫社員甲', 'active'),
  ('a9300000-0000-4000-8000-000000000003', 'a9100000-0000-4000-8000-000000000003', 'a9200000-0000-4000-8000-000000000003', 'joy-bank-member-two@example.test', '題庫社員乙', 'active'),
  ('a9300000-0000-4000-8000-000000000004', 'a9100000-0000-4000-8000-000000000004', 'a9200000-0000-4000-8000-000000000004', 'joy-bank-peer@example.test', '題庫旁觀社員', 'active'),
  ('a9300000-0000-4000-8000-000000000005', 'a9100000-0000-4000-8000-000000000005', 'a9200000-0000-4000-8000-000000000005', 'joy-bank-suspended@example.test', '題庫停權社員', 'suspended'),
  ('a9300000-0000-4000-8000-000000000006', 'a9100000-0000-4000-8000-000000000006', 'a9200000-0000-4000-8000-000000000006', 'joy-bank-outsider@example.test', '題庫外社社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('a9500000-0000-4000-8000-000000000001', 'JOY-BANK-A', '題庫驗證甲社', 'active', now()),
  ('a9500000-0000-4000-8000-000000000002', 'JOY-BANK-B', '題庫驗證乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status) values
  ('a9600000-0000-4000-8000-000000000001', 'a9500000-0000-4000-8000-000000000001', 'a9200000-0000-4000-8000-000000000001', 'active'),
  ('a9600000-0000-4000-8000-000000000002', 'a9500000-0000-4000-8000-000000000001', 'a9200000-0000-4000-8000-000000000002', 'active'),
  ('a9600000-0000-4000-8000-000000000003', 'a9500000-0000-4000-8000-000000000001', 'a9200000-0000-4000-8000-000000000003', 'active'),
  ('a9600000-0000-4000-8000-000000000004', 'a9500000-0000-4000-8000-000000000001', 'a9200000-0000-4000-8000-000000000004', 'active'),
  ('a9600000-0000-4000-8000-000000000005', 'a9500000-0000-4000-8000-000000000001', 'a9200000-0000-4000-8000-000000000005', 'active'),
  ('a9600000-0000-4000-8000-000000000006', 'a9500000-0000-4000-8000-000000000002', 'a9200000-0000-4000-8000-000000000006', 'active');

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values (
  'a9700000-0000-4000-8000-000000000001', 'a9500000-0000-4000-8000-000000000001',
  'a9300000-0000-4000-8000-000000000001', 'president', 'active', 'a9300000-0000-4000-8000-000000000001'
);

-- Keep the feature flag disabled first; this transaction rolls back all changes.
select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000001', true);
insert into public.platform_feature_flags (
  feature_key, enabled, enabled_environments, rollout_percentage, updated_by
) values ('joy_wall_v1', false, array['local'], 100, 'a9300000-0000-4000-8000-000000000001');

do $$
declare
  table_name text;
  routine text;
begin
  foreach table_name in array array[
    'joy_question_prompts', 'joy_question_batches', 'joy_question_batch_assignments'
  ] loop
    if not (select relrowsecurity from pg_catalog.pg_class where oid = format('public.%I', table_name)::regclass)
      or has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE')
      or has_table_privilege('service_role', format('public.%I', table_name), 'SELECT') then
      raise exception 'Question management table access boundary is incorrect for %', table_name;
    end if;
  end loop;

  foreach routine in array array[
    'public.list_joy_question_recipient_options(uuid)',
    'public.get_joy_question_manager_page(uuid)',
    'public.create_joy_question_prompt(uuid,text)',
    'public.update_joy_question_prompt(uuid,uuid,text,boolean,integer)',
    'public.dispatch_joy_question_batch(uuid,text,uuid[],uuid)',
    'public.dispatch_joy_question_batch_with_deadline(uuid,text,uuid[],uuid,date)',
    'public.get_joy_question_batch_detail(uuid,uuid)'
  ] loop
    if has_function_privilege('anon', routine, 'EXECUTE')
      or not has_function_privilege('authenticated', routine, 'EXECUTE') then
      raise exception 'Question management RPC grant boundary is incorrect for %', routine;
    end if;
    if not exists (select 1 from pg_catalog.pg_proc where oid = routine::regprocedure
      and array_to_string(proconfig, ',') like '%search_path=%') then
      raise exception 'Question management RPC search_path is not fixed for %', routine;
    end if;
  end loop;

  if (select count(*) from public.joy_question_prompts where club_id is null) < 30 then
    raise exception 'The platform prompt bank did not seed at least 30 prompts';
  end if;
end $$;

set local role anon;
do $$
begin
  begin perform 1 from public.joy_question_prompts; raise exception 'Anonymous caller read prompt table';
  exception when insufficient_privilege then null; end;
  begin perform public.get_joy_question_manager_page('a9500000-0000-4000-8000-000000000001');
    raise exception 'Anonymous caller used manager RPC';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- A real manager still cannot access the feature before its club flag is enabled.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000001', true);
do $$
begin
  begin perform public.get_joy_question_manager_page('a9500000-0000-4000-8000-000000000001');
    raise exception 'Question manager page ignored the disabled Joy Wall flag';
  exception when insufficient_privilege then null; end;
  begin perform public.create_joy_question_prompt('a9500000-0000-4000-8000-000000000001', '這是一個新題目');
    raise exception 'Question creation ignored the disabled Joy Wall flag';
  exception when insufficient_privilege then null; end;
  begin perform public.dispatch_joy_question_batch(
    'a9500000-0000-4000-8000-000000000001', '本月提問', array['a9600000-0000-4000-8000-000000000002'::uuid],
    'a9800000-0000-4000-8000-000000000001'
  ); raise exception 'Question dispatch ignored the disabled Joy Wall flag';
  exception when insufficient_privilege then null; end;
  begin perform public.dispatch_joy_question_batch_with_deadline(
    'a9500000-0000-4000-8000-000000000001', '本月提問', array['a9600000-0000-4000-8000-000000000002'::uuid],
    'a9800000-0000-4000-8000-000000000001', null::date
  ); raise exception 'Dated question dispatch ignored the disabled Joy Wall flag';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

update public.platform_feature_flags set enabled = true
where feature_key = 'joy_wall_v1';
select set_config('joy.platform_prompt_id', (
  select id::text from public.joy_question_prompts where club_id is null order by sort_order limit 1
), true);
select set_config('joy.platform_prompt_text', (
  select prompt_text from public.joy_question_prompts where id = current_setting('joy.platform_prompt_id')::uuid
), true);

-- A president can create/edit club prompts, but cannot alter platform prompts.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000001', true);
do $$
declare
  prompt jsonb;
  manager_page jsonb;
  recipients jsonb;
  batch jsonb;
  replay jsonb;
  detail jsonb;
  updated_prompt jsonb;
  batch_due_on date := (pg_catalog.statement_timestamp() at time zone 'Asia/Taipei')::date + 2;
  legacy_batch jsonb;
begin
  prompt := public.create_joy_question_prompt(
    'a9500000-0000-4000-8000-000000000001', '今年哪一次服務最讓你感受到團隊力量？'
  );
  perform set_config('joy.question_prompt_id', prompt->>'id', true);
  if prompt->>'source' <> 'club' or prompt->>'can_edit' <> 'true' then
    raise exception 'Club prompt creation projection is incorrect';
  end if;
  updated_prompt := public.update_joy_question_prompt(
    'a9500000-0000-4000-8000-000000000001', (prompt->>'id')::uuid,
    '今年哪一次服務讓你最感受到團隊力量？', true, 25
  );
  if updated_prompt->>'prompt_text' <> '今年哪一次服務讓你最感受到團隊力量？'
    or (updated_prompt->>'sort_order')::integer <> 25 or updated_prompt->>'is_active' <> 'true' then
    raise exception 'Club prompt edit did not persist';
  end if;
  begin
    perform public.update_joy_question_prompt(
      'a9500000-0000-4000-8000-000000000001', current_setting('joy.platform_prompt_id')::uuid,
      '幹部不可以改平台題目', true, 10
    );
    raise exception 'A club manager edited a platform prompt';
  exception when no_data_found then null; end;
  begin
    perform public.create_joy_question_prompt(
      'a9500000-0000-4000-8000-000000000001',
      current_setting('joy.platform_prompt_text')
    );
    raise exception 'A club manager duplicated a platform prompt';
  exception when invalid_parameter_value then null; end;

  recipients := public.list_joy_question_recipient_options('a9500000-0000-4000-8000-000000000001');
  if jsonb_array_length(recipients) <> 3
    or recipients::text like '%題庫管理幹部%'
    or recipients::text like '%題庫外社社員%'
    or recipients::text like '%題庫停權社員%' then
    raise exception 'Recipient options leaked manager, suspended, or cross-club identities: %', recipients;
  end if;
  manager_page := public.get_joy_question_manager_page('a9500000-0000-4000-8000-000000000001');
  if manager_page->>'distinct_active_prompt_count' <> '31'
    or (select count(*) from jsonb_array_elements(manager_page->'prompts')) < 31 then
    raise exception 'Manager page did not project system and club prompts';
  end if;
  if exists (
    select 1 from jsonb_array_elements(manager_page->'prompts') as prompt_rows(prompt_json)
    where prompt_json->>'source' = 'platform' and prompt_json->>'can_edit' is distinct from 'false'
  ) then
    raise exception 'Platform question edit capability must project as false, never null';
  end if;

  batch := public.dispatch_joy_question_batch_with_deadline(
    'a9500000-0000-4000-8000-000000000001', '十月社員交流提問',
    array['a9600000-0000-4000-8000-000000000002'::uuid, 'a9600000-0000-4000-8000-000000000003'::uuid],
    'a9800000-0000-4000-8000-000000000002', batch_due_on
  );
  perform set_config('joy.question_batch_id', batch->>'id', true);
  perform set_config('joy.question_due_on', batch_due_on::text, true);
  if (batch->>'assignment_count')::integer <> 2 or (batch->>'replayed')::boolean
    or (batch->>'due_on')::date <> batch_due_on then
    raise exception 'Question batch did not create the requested assignments';
  end if;
  manager_page := public.get_joy_question_manager_page('a9500000-0000-4000-8000-000000000001');
  if not exists (
    select 1 from jsonb_array_elements(manager_page->'batches') as row(batch_json)
    where batch_json->>'id' = batch->>'id' and batch_json->>'due_on' = batch_due_on::text
  ) then
    raise exception 'Manager history did not display the batch due date';
  end if;

  replay := public.dispatch_joy_question_batch_with_deadline(
    'a9500000-0000-4000-8000-000000000001', '十月社員交流提問',
    array['a9600000-0000-4000-8000-000000000002'::uuid, 'a9600000-0000-4000-8000-000000000003'::uuid],
    'a9800000-0000-4000-8000-000000000002', batch_due_on
  );
  if replay->>'id' <> batch->>'id' or replay->>'replayed' <> 'true'
    or (replay->>'assignment_count')::integer <> 2 then
    raise exception 'Identical batch retry created duplicate assignments';
  end if;
  begin
    perform public.dispatch_joy_question_batch_with_deadline(
      'a9500000-0000-4000-8000-000000000001', '不同標題',
      array['a9600000-0000-4000-8000-000000000002'::uuid, 'a9600000-0000-4000-8000-000000000003'::uuid],
      'a9800000-0000-4000-8000-000000000002', batch_due_on
    );
    raise exception 'Idempotency key accepted a different batch payload';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.dispatch_joy_question_batch_with_deadline(
      'a9500000-0000-4000-8000-000000000001', '十月社員交流提問',
      array['a9600000-0000-4000-8000-000000000002'::uuid, 'a9600000-0000-4000-8000-000000000003'::uuid],
      'a9800000-0000-4000-8000-000000000002', batch_due_on + 1
    );
    raise exception 'Idempotency key accepted a changed due date';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.dispatch_joy_question_batch_with_deadline(
      'a9500000-0000-4000-8000-000000000001', '已過期的截止日',
      array['a9600000-0000-4000-8000-000000000002'::uuid],
      'a9800000-0000-4000-8000-000000000006', batch_due_on - 3
    );
    raise exception 'A new question batch accepted a past due date';
  exception when invalid_parameter_value then null; end;

  legacy_batch := public.dispatch_joy_question_batch(
    'a9500000-0000-4000-8000-000000000001', '舊版呼叫相容測試',
    array['a9600000-0000-4000-8000-000000000002'::uuid],
    'a9800000-0000-4000-8000-000000000007'
  );
  if legacy_batch->>'due_on' is not null then
    raise exception 'Legacy four-argument dispatch must continue without a deadline';
  end if;
  begin
    perform public.dispatch_joy_question_batch(
      'a9500000-0000-4000-8000-000000000001', '重複社員',
      array['a9600000-0000-4000-8000-000000000002'::uuid, 'a9600000-0000-4000-8000-000000000002'::uuid],
      'a9800000-0000-4000-8000-000000000003'
    );
    raise exception 'Duplicate recipient was accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.dispatch_joy_question_batch(
      'a9500000-0000-4000-8000-000000000001', '跨社社員',
      array['a9600000-0000-4000-8000-000000000006'::uuid],
      'a9800000-0000-4000-8000-000000000004'
    );
    raise exception 'Cross-club recipient was accepted';
  exception when invalid_parameter_value then null; end;

  detail := public.get_joy_question_batch_detail(
    'a9500000-0000-4000-8000-000000000001', (batch->>'id')::uuid
  );
  if jsonb_array_length(detail->'assignments') <> 2
    or detail->>'due_on' <> batch_due_on::text
    or (select count(distinct assignment->>'prompt_text') from jsonb_array_elements(detail->'assignments') as assignment) <> 2
    or detail::text like '%answer_content%' or detail::text like '%response_content%' then
    raise exception 'Batch detail is not private, unique, or answer-content-free: %', detail;
  end if;
  perform set_config('joy.question_post_one', (
    select assignment->>'post_id' from jsonb_array_elements(detail->'assignments') as rows(assignment)
    where assignment->>'recipient_membership_id' = 'a9600000-0000-4000-8000-000000000002'
  ), true);
  perform set_config('joy.question_post_two', (
    select assignment->>'post_id' from jsonb_array_elements(detail->'assignments') as rows(assignment)
    where assignment->>'recipient_membership_id' = 'a9600000-0000-4000-8000-000000000003'
  ), true);

  begin
    perform public.update_own_joy_post(
      'a9500000-0000-4000-8000-000000000001', current_setting('joy.question_post_one')::uuid,
      'question', '改掉批次題目', '不可以修改已派發題目'
    );
    raise exception 'A manager modified an already-dispatched question';
  exception when check_violation then null; end;
end $$;
reset role;

do $$
begin
  if (select count(*) from public.joy_question_batch_assignments
      where batch_id = current_setting('joy.question_batch_id')::uuid) <> 2
    or exists (
      select 1 from public.joy_question_batch_assignments as assignment
      join public.joy_posts as post on post.id = assignment.post_id and post.club_id = assignment.club_id
      where assignment.batch_id = current_setting('joy.question_batch_id')::uuid
        and (post.visibility_scope <> 'selected' or post.content <> assignment.prompt_snapshot
          or not exists (
            select 1 from public.joy_post_audiences as audience
            where audience.post_id = post.id and audience.club_id = post.club_id
              and audience.membership_id = assignment.recipient_membership_id
          ))
    ) then
    raise exception 'Batch assignments were duplicated, not snapshot-preserved, or not recipient-private';
  end if;
end $$;

-- Active members receive exactly their own private task; other members and clubs do not.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000002', true);
do $$
declare
  task_page jsonb;
  opened_post jsonb;
  task_row jsonb;
begin
  task_page := public.list_my_member_pending_tasks_with_joy_tasks(
    'a9500000-0000-4000-8000-000000000001', 50, 0, true, true
  );
  select task into task_row from jsonb_array_elements(task_page->'tasks') as rows(task)
  where task->>'kind' = 'joy_question' and task->>'task_id' = current_setting('joy.question_post_one');
  if task_row is null or task_row->>'title' <> '回答社員提問'
    or task_row->>'deadline' is null
    or task_row->>'is_overdue' <> 'false'
    or task_row->>'detail' not like '%' || current_setting('joy.question_due_on') || '%' then
    raise exception 'First recipient did not receive the assigned Joy task: %', task_page;
  end if;
  opened_post := public.get_my_joy_question_post(
    'a9500000-0000-4000-8000-000000000001', current_setting('joy.question_post_one')::uuid
  );
  if opened_post->>'id' <> current_setting('joy.question_post_one')
    or opened_post->>'visibility_scope' <> 'selected'
    or opened_post->>'can_answer' <> 'true' then
    raise exception 'First recipient could not securely open their assigned private question';
  end if;
end $$;
reset role;

-- An expired deadline is a status, not an answer lock or an invisible task.
update public.joy_question_batches
set due_on = (pg_catalog.statement_timestamp() at time zone 'Asia/Taipei')::date - 1
where id = current_setting('joy.question_batch_id')::uuid;
select set_config('joy.question_due_on', (
  select due_on::text from public.joy_question_batches
  where id = current_setting('joy.question_batch_id')::uuid
), true);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000002', true);
do $$
declare
  task_page jsonb;
  task_row jsonb;
  opened_post jsonb;
begin
  task_page := public.list_my_member_pending_tasks_with_joy_tasks(
    'a9500000-0000-4000-8000-000000000001', 50, 0, true, true
  );
  select task into task_row from jsonb_array_elements(task_page->'tasks') as rows(task)
  where task->>'kind' = 'joy_question' and task->>'task_id' = current_setting('joy.question_post_one');
  if task_row is null or task_row->>'is_overdue' <> 'true'
    or (task_row->>'hours_remaining')::integer <> 0
    or task_row->>'detail' not like '%' || current_setting('joy.question_due_on') || '%' then
    raise exception 'Overdue question task disappeared or lost its due date: %', task_page;
  end if;
  opened_post := public.get_my_joy_question_post(
    'a9500000-0000-4000-8000-000000000001', current_setting('joy.question_post_one')::uuid
  );
  if opened_post->>'can_answer' <> 'true' then
    raise exception 'A passed question deadline incorrectly locked the answer';
  end if;
  perform public.create_joy_comment(
    'a9500000-0000-4000-8000-000000000001', current_setting('joy.question_post_one')::uuid,
    null, 'answer', '我最感受到團隊力量的是共同服務那一天。'
  );
  task_page := public.list_my_member_pending_tasks_with_joy_tasks(
    'a9500000-0000-4000-8000-000000000001', 50, 0, true, true
  );
  if exists (select 1 from jsonb_array_elements(task_page->'tasks') as task
    where task->>'kind' = 'joy_question' and task->>'task_id' = current_setting('joy.question_post_one')) then
    raise exception 'Answered batch question remained in the task center';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000003', true);
do $$
declare task_page jsonb;
begin
  task_page := public.list_my_member_pending_tasks_with_joy_tasks(
    'a9500000-0000-4000-8000-000000000001', 50, 0, true, true
  );
  if not exists (select 1 from jsonb_array_elements(task_page->'tasks') as task
    where task->>'kind' = 'joy_question' and task->>'task_id' = current_setting('joy.question_post_two')) then
    raise exception 'Second recipient did not receive their distinct question task';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000004', true);
do $$
declare task_page jsonb;
begin
  task_page := public.list_my_member_pending_tasks_with_joy_tasks(
    'a9500000-0000-4000-8000-000000000001', 50, 0, true, true
  );
  if exists (select 1 from jsonb_array_elements(task_page->'tasks') as task where task->>'kind' = 'joy_question')
    or public.get_my_joy_question_post(
      'a9500000-0000-4000-8000-000000000001', current_setting('joy.question_post_two')::uuid
    ) is not null then
    raise exception 'An unaddressed same-club member received or opened a private question task';
  end if;
end $$;
reset role;

-- Ordinary, suspended, and other-club accounts cannot inspect or mutate manager data.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000002', true);
do $$
begin
  begin perform public.get_joy_question_manager_page('a9500000-0000-4000-8000-000000000001');
    raise exception 'An ordinary member accessed the question manager page';
  exception when insufficient_privilege then null; end;
  begin perform public.create_joy_question_prompt('a9500000-0000-4000-8000-000000000001', '社員不可新增題目');
    raise exception 'An ordinary member added a prompt';
  exception when insufficient_privilege then null; end;
  begin perform public.get_joy_question_batch_detail(
    'a9500000-0000-4000-8000-000000000002', current_setting('joy.question_batch_id')::uuid
  ); raise exception 'An ordinary member queried another club batch';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000005', true);
do $$
begin
  begin perform public.get_joy_question_manager_page('a9500000-0000-4000-8000-000000000001');
    raise exception 'A suspended account accessed the question manager page';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000006', true);
do $$
begin
  begin perform public.get_joy_question_manager_page('a9500000-0000-4000-8000-000000000002');
    raise exception 'An external-club member accessed the question manager page';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- The recipient can report an assigned post; authorized moderation may hide it,
-- but cannot rewrite the immutable prompt snapshot.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000003', true);
select public.report_joy_post(
  'a9500000-0000-4000-8000-000000000001', current_setting('joy.question_post_two')::uuid, 'other'
);
reset role;
select set_config('joy.question_report_id', (
  select id::text from public.joy_post_reports
  where post_id = current_setting('joy.question_post_two')::uuid
  order by created_at desc limit 1
), true);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000001', true);
select public.resolve_joy_report(
  'a9500000-0000-4000-8000-000000000001', current_setting('joy.question_report_id')::uuid,
  'hide', '由題庫安全驗證隱藏'
);
reset role;
do $$
declare hidden_detail jsonb;
begin
  hidden_detail := public.get_joy_question_batch_detail(
    'a9500000-0000-4000-8000-000000000001', current_setting('joy.question_batch_id')::uuid
  );
  if (select post_status from public.joy_posts where id = current_setting('joy.question_post_two')::uuid) <> 'hidden'
    or (select (assignment->>'available')::boolean
        from jsonb_array_elements(hidden_detail->'assignments') as rows(assignment)
        where assignment->>'post_id' = current_setting('joy.question_post_two')) then
    raise exception 'Moderation could not hide an assigned question or batch detail did not reflect it';
  end if;
end $$;

-- With only one active distinct prompt remaining, two-recipient dispatch fails atomically.
update public.joy_question_prompts set is_active = false where club_id is null;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000001', true);
do $$
begin
  begin perform public.dispatch_joy_question_batch(
    'a9500000-0000-4000-8000-000000000001', '題目不足測試',
    array['a9600000-0000-4000-8000-000000000002'::uuid, 'a9600000-0000-4000-8000-000000000003'::uuid],
    'a9800000-0000-4000-8000-000000000005'
  ); raise exception 'Insufficient distinct prompts did not stop dispatch';
  exception when program_limit_exceeded then null; end;
end $$;
reset role;
do $$
begin
  if exists (select 1 from public.joy_question_batches where request_id = 'a9800000-0000-4000-8000-000000000005') then
    raise exception 'Insufficient prompt dispatch left a partial batch';
  end if;
end $$;

rollback;
