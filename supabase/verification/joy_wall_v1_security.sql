-- Joy Wall tenant, audience, interaction, and moderation boundaries.
-- Run only against Supabase local. All synthetic fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'joy-author@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'joy-recipient@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'joy-peer@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'joy-suspended@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'joy-president@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'joy-outsider@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('92000000-0000-4000-8000-000000000001', '歡喜牆作者', 'joy-author@example.test'),
  ('92000000-0000-4000-8000-000000000002', '指定收件社員', 'joy-recipient@example.test'),
  ('92000000-0000-4000-8000-000000000003', '其他社員', 'joy-peer@example.test'),
  ('92000000-0000-4000-8000-000000000004', '停權社員', 'joy-suspended@example.test'),
  ('92000000-0000-4000-8000-000000000005', '管理幹部', 'joy-president@example.test'),
  ('92000000-0000-4000-8000-000000000006', '外社社員', 'joy-outsider@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('93000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'joy-author@example.test', '歡喜牆作者', 'active'),
  ('93000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', 'joy-recipient@example.test', '指定收件社員', 'active'),
  ('93000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000003', '92000000-0000-4000-8000-000000000003', 'joy-peer@example.test', '其他社員', 'active'),
  ('93000000-0000-4000-8000-000000000004', '91000000-0000-4000-8000-000000000004', '92000000-0000-4000-8000-000000000004', 'joy-suspended@example.test', '停權社員', 'suspended'),
  ('93000000-0000-4000-8000-000000000005', '91000000-0000-4000-8000-000000000005', '92000000-0000-4000-8000-000000000005', 'joy-president@example.test', '管理幹部', 'active'),
  ('93000000-0000-4000-8000-000000000006', '91000000-0000-4000-8000-000000000006', '92000000-0000-4000-8000-000000000006', 'joy-outsider@example.test', '外社社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('95000000-0000-4000-8000-000000000001', 'JOY-SEC-A', '歡喜牆安全甲社', 'active', now()),
  ('95000000-0000-4000-8000-000000000002', 'JOY-SEC-B', '歡喜牆安全乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status) values
  ('96000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'active'),
  ('96000000-0000-4000-8000-000000000002', '95000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000002', 'active'),
  ('96000000-0000-4000-8000-000000000003', '95000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000003', 'active'),
  ('96000000-0000-4000-8000-000000000004', '95000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000004', 'active'),
  ('96000000-0000-4000-8000-000000000005', '95000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000005', 'active'),
  ('96000000-0000-4000-8000-000000000006', '95000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000006', 'active');

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values (
  '97000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000005', 'president', 'active', '93000000-0000-4000-8000-000000000005'
);

create temporary table joy_security_values (key text primary key, value text not null);
grant select, insert, update on joy_security_values to authenticated;

-- RLS, grants, privileged RPC allow-list, feature-flag key, and search paths.
do $$
declare
  table_name text;
  fn_config text[];
begin
  foreach table_name in array array[
    'joy_posts', 'joy_post_audiences', 'joy_iou_items', 'joy_comments', 'joy_reactions',
    'joy_post_reports', 'joy_wall_audit_events'
  ] loop
    if not (select relrowsecurity from pg_catalog.pg_class where oid = format('public.%I', table_name)::regclass) then
      raise exception 'RLS is not enabled on %', table_name;
    end if;
    if has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE')
      or has_table_privilege('service_role', format('public.%I', table_name), 'SELECT') then
      raise exception 'Direct table access is granted on %', table_name;
    end if;
  end loop;

  if has_function_privilege('anon', 'public.list_joy_posts(uuid,timestamptz,uuid,integer)', 'EXECUTE')
    or has_function_privilege('anon', 'public.list_my_member_pending_tasks_with_joy_tasks(uuid,integer,integer,boolean,boolean)', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_my_joy_iou_post(uuid,uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_my_joy_question_post(uuid,uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.create_joy_post(uuid,text,text,text,text,uuid[])', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.current_active_joy_membership(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.assert_joy_rate_limit(uuid,uuid,text,integer,interval)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.joy_iou_projection(uuid,uuid,uuid,uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.joy_iou_projection(uuid,uuid,uuid,uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.create_joy_iou(uuid,uuid,text,text,date)', 'EXECUTE')
    or has_function_privilege('anon', 'public.act_joy_iou(uuid,uuid,text,text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.list_joy_posts(uuid,timestamptz,uuid,integer)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.list_my_member_pending_tasks_with_joy_tasks(uuid,integer,integer,boolean,boolean)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.get_my_joy_iou_post(uuid,uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.get_my_joy_question_post(uuid,uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.create_joy_post(uuid,text,text,text,text,uuid[])', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.create_joy_iou(uuid,uuid,text,text,date)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.act_joy_iou(uuid,uuid,text,text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.create_joy_comment(uuid,uuid,uuid,text,text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.toggle_joy_reaction(uuid,uuid,text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.report_joy_post(uuid,uuid,text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.list_joy_reports(uuid,integer)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.resolve_joy_report(uuid,uuid,text,text)', 'EXECUTE') then
    raise exception 'Joy Wall RPC privilege boundary is incorrect';
  end if;

  select proconfig into fn_config from pg_catalog.pg_proc
  where oid = 'public.create_joy_post(uuid,text,text,text,text,uuid[])'::regprocedure;
  if fn_config is null or not ('search_path=pg_catalog, public, auth' = any(fn_config)) then
    raise exception 'create_joy_post search_path is not fixed';
  end if;
  if not exists (select 1 from pg_catalog.pg_proc
      where oid = 'public.create_joy_iou(uuid,uuid,text,text,date)'::regprocedure
        and 'search_path=pg_catalog, public, auth' = any(proconfig))
    or not exists (select 1 from pg_catalog.pg_proc
      where oid = 'public.act_joy_iou(uuid,uuid,text,text)'::regprocedure
        and 'search_path=pg_catalog, public, auth' = any(proconfig)) then
    raise exception 'Joy IOU RPC search_path is not fixed';
  end if;
  if not exists (select 1 from public.permissions where permission_key = 'joy.moderate')
    or not exists (select 1 from public.role_permissions where role_key = 'president' and permission_key = 'joy.moderate')
    or not exists (select 1 from public.role_permissions where role_key = 'secretary' and permission_key = 'joy.moderate') then
    raise exception 'Club moderation roles are not configured';
  end if;
  if not exists (select 1 from pg_catalog.pg_proc
      where oid = 'public.list_my_member_pending_tasks_with_joy_tasks(uuid,integer,integer,boolean,boolean)'::regprocedure
        and 'search_path=pg_catalog, public, auth' = any(proconfig))
    or not exists (select 1 from pg_catalog.pg_proc
      where oid = 'public.get_my_joy_iou_post(uuid,uuid)'::regprocedure
        and 'search_path=pg_catalog, public, auth' = any(proconfig))
    or not exists (select 1 from pg_catalog.pg_proc
      where oid = 'public.get_my_joy_question_post(uuid,uuid)'::regprocedure
        and 'search_path=pg_catalog, public, auth' = any(proconfig)) then
    raise exception 'Joy task direct-open RPC search_path is not fixed';
  end if;
  if exists (select 1 from public.platform_feature_flags where feature_key = 'joy_wall_v1') then
    raise exception 'Joy Wall rollout was unexpectedly seeded';
  end if;
end $$;

-- Anonymous callers cannot read data or call the exposed RPCs.
set local role anon;
do $$
begin
  begin perform 1 from public.joy_posts; raise exception 'anon read joy_posts';
  exception when insufficient_privilege then null; end;
  begin perform public.list_joy_posts('95000000-0000-4000-8000-000000000001', null, null, 20); raise exception 'anon listed Joy Wall';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Author creates club-visible, selected-recipient, and private content.
set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
do $$
declare
  club_post jsonb;
  selected_post jsonb;
  private_post jsonb;
  question_post jsonb;
  club_question_post jsonb;
  updated_post jsonb;
  club_list jsonb;
  report_target jsonb;
  report_target_index integer;
  iou_post jsonb;
  iou_decline jsonb;
  iou_cancel jsonb;
  iou_overdue jsonb;
  closed_tasks jsonb;
begin
  if jsonb_array_length(to_jsonb((select array_agg(club_id::text) from public.list_my_joy_clubs()))) <> 1 then
    raise exception 'Joy club list did not restrict results to active membership';
  end if;
  club_post := public.create_joy_post(
    '95000000-0000-4000-8000-000000000001', 'gratitude', '謝謝大家', '全社都看得到', 'club', '{}'::uuid[]
  );
  selected_post := public.create_joy_post(
    '95000000-0000-4000-8000-000000000001', 'welcome', null, '只給指定社員', 'selected',
    array['96000000-0000-4000-8000-000000000002'::uuid]
  );
  private_post := public.create_joy_post(
    '95000000-0000-4000-8000-000000000001', 'blessing', null, '作者與收件者私下祝福', 'private',
    array['96000000-0000-4000-8000-000000000002'::uuid]
  );
  question_post := public.create_joy_post(
    '95000000-0000-4000-8000-000000000001', 'question', '服務活動提問',
    '你印象最深的服務瞬間是什麼？', 'selected',
    array['96000000-0000-4000-8000-000000000002'::uuid]
  );
  iou_post := public.create_joy_iou(
    '95000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000002',
    '協助活動攝影', '我會在活動當天協助拍攝並整理照片。', null
  );
  iou_decline := public.create_joy_iou(
    '95000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000002',
    null, '我可以幫忙搬運物資。', null
  );
  iou_cancel := public.create_joy_iou(
    '95000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000002',
    null, '我可以提供一次接送協助。', null
  );
  iou_overdue := public.create_joy_iou(
    '95000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000002',
    null, '我會協助整理器材。',
    ((clock_timestamp() at time zone 'Asia/Taipei')::date + 1)
  );
  club_question_post := public.create_joy_post(
    '95000000-0000-4000-8000-000000000001', 'question', '請幫忙檢查', '這則會用來測試檢舉審核', 'club', '{}'::uuid[]
  );
  for report_target_index in 1..5 loop
    report_target := public.create_joy_post(
      '95000000-0000-4000-8000-000000000001', 'gratitude', null,
      '檢舉頻率測試貼文 ' || report_target_index, 'club', '{}'::uuid[]
    );
    perform set_config('joy.report_target_' || report_target_index, report_target->>'id', true);
  end loop;
  if club_post ? 'club_id' or club_post ? 'author_app_account_id'
    or club_post ? 'audience_membership_ids' or club_post ? 'person_id' then
    raise exception 'Create projection leaked internal authority or target IDs';
  end if;
  if club_post->'iou' is distinct from 'null'::jsonb
    or question_post->'iou' is distinct from 'null'::jsonb then
    raise exception 'Non-IOU creation projection omitted its explicit null IOU field';
  end if;
  updated_post := public.update_own_joy_post(
    '95000000-0000-4000-8000-000000000001', (club_post->>'id')::uuid,
    'gratitude', '謝謝大家', '全社都看得到'
  );
  if updated_post->'iou' is distinct from 'null'::jsonb then
    raise exception 'Non-IOU update projection omitted its explicit null IOU field';
  end if;
  if not (club_post->>'can_edit')::boolean or not (club_post->>'can_archive')::boolean then
    raise exception 'Author capabilities missing from projection';
  end if;
  perform set_config('joy.club_post', club_post->>'id', true);
  perform set_config('joy.selected_post', selected_post->>'id', true);
  perform set_config('joy.private_post', private_post->>'id', true);
  perform set_config('joy.question_post', question_post->>'id', true);
  perform set_config('joy.club_question_post', club_question_post->>'id', true);
  perform set_config('joy.iou_post', iou_post->>'id', true);
  perform set_config('joy.iou_decline', iou_decline->>'id', true);
  perform set_config('joy.iou_cancel', iou_cancel->>'id', true);
  perform set_config('joy.iou_overdue', iou_overdue->>'id', true);
  if iou_post->>'post_type' <> 'iou' or iou_post->>'visibility_scope' <> 'private'
    or iou_post ? 'recipient_membership_id' or iou_post->'iou'->>'viewer_role' <> 'promisor' then
    raise exception 'IOU creation did not return a participant-only projection';
  end if;
  closed_tasks := public.list_my_member_pending_tasks_with_joy_tasks(
    '95000000-0000-4000-8000-000000000001', 50, 0, true, true
  );
  if exists (select 1 from jsonb_array_elements(closed_tasks->'tasks') as task where task->>'kind' = 'joy_iou')
    or exists (select 1 from jsonb_array_elements(closed_tasks->'tasks') as task where task->>'kind' = 'joy_question')
    or public.get_my_joy_iou_post('95000000-0000-4000-8000-000000000001', (iou_post->>'id')::uuid) is not null
    or public.get_my_joy_question_post('95000000-0000-4000-8000-000000000001', (question_post->>'id')::uuid) is not null then
    raise exception 'Joy IOU task or direct projection was visible before its flag was enabled';
  end if;
  begin
    perform public.act_joy_iou(
      '95000000-0000-4000-8000-000000000001', (iou_post->>'id')::uuid, 'accept', null
    );
    raise exception 'Promisor accepted their own IOU';
  exception when no_data_found then null; end;
  begin
    perform public.archive_own_joy_post('95000000-0000-4000-8000-000000000001', (iou_post->>'id')::uuid);
    raise exception 'IOU was removed through the generic archive path';
  exception when no_data_found then null; end;
  begin
    perform public.create_joy_post(
      '95000000-0000-4000-8000-000000000001', 'iou', null, '不能走一般貼文流程', 'private',
      array['96000000-0000-4000-8000-000000000002'::uuid]
    );
    raise exception 'Generic Joy post RPC created an IOU';
  exception when invalid_parameter_value then null; end;
  club_list := public.list_joy_posts('95000000-0000-4000-8000-000000000001', null, null, 50);
  if not (club_list::text like '%' || (club_post->>'id') || '%')
    or not (club_list::text like '%' || (selected_post->>'id') || '%')
    or not (club_list::text like '%' || (private_post->>'id') || '%') then
    raise exception 'Author cannot see their own and club-visible posts';
  end if;
  begin
    perform public.create_joy_post(
      '95000000-0000-4000-8000-000000000001', 'blessing', null, '跨社目標', 'private',
      array['96000000-0000-4000-8000-000000000006'::uuid]
    );
    raise exception 'Cross-club audience membership accepted';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;

-- Enable only inside this rolled-back local verification transaction.
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
insert into public.platform_feature_flags (
  feature_key, enabled, enabled_environments, rollout_percentage, updated_by
) values ('joy_wall_v1', true, array['local'], 100, '93000000-0000-4000-8000-000000000001');

-- Create older comments for the author's hourly limit test. They are more than
-- one minute old, so the minute and hour windows are independently exercised.
insert into public.joy_comments (
  club_id, post_id, author_app_account_id, author_membership_id,
  comment_type, content, created_at
)
select
  '95000000-0000-4000-8000-000000000001'::uuid,
  current_setting('joy.selected_post')::uuid,
  '93000000-0000-4000-8000-000000000001'::uuid,
  '96000000-0000-4000-8000-000000000001'::uuid,
  'comment', '小時上限舊留言 ' || item.index, now() - interval '2 minutes'
from generate_series(1, 33) as item(index);

-- Recipient sees selected/private posts; a different club member only sees club posts.
set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000002', true);
do $$
declare
  listed jsonb;
  task_page jsonb;
  focused_post jsonb;
  private_id uuid := current_setting('joy.private_post')::uuid;
  report_target_index integer;
begin
  task_page := public.list_my_member_pending_tasks_with_joy_tasks(
    '95000000-0000-4000-8000-000000000001', 50, 0, true, false
  );
  if exists (select 1 from jsonb_array_elements(task_page->'tasks') as task where task->>'kind' = 'joy_iou') then
    raise exception 'Joy IOU task ignored the caller feature gate';
  end if;
  if exists (select 1 from jsonb_array_elements(task_page->'tasks') as task where task->>'kind' = 'joy_question') then
    raise exception 'Joy question task ignored the caller feature gate';
  end if;
  task_page := public.list_my_member_pending_tasks_with_joy_tasks(
    '95000000-0000-4000-8000-000000000001', 50, 0, true, true
  );
  if not exists (
    select 1 from jsonb_array_elements(task_page->'tasks') as task
    where task->>'kind' = 'joy_iou'
      and task->>'task_id' = current_setting('joy.iou_post')
      and task->>'title' = '回覆非現金承諾'
      and task->>'action_path' like '%focusIouId=%'
      and task->>'action_path' like '%clubId=95000000-0000-4000-8000-000000000001%'
  ) then
    raise exception 'Recipient did not get an actionable, club-scoped IOU task: %', task_page;
  end if;
  focused_post := public.get_my_joy_iou_post(
    '95000000-0000-4000-8000-000000000001', current_setting('joy.iou_post')::uuid
  );
  if focused_post->>'id' <> current_setting('joy.iou_post')
    or focused_post->'iou'->>'viewer_role' <> 'recipient' then
    raise exception 'Recipient could not open their private IOU from its task';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(task_page->'tasks') as task
    where task->>'kind' = 'joy_question'
      and task->>'task_id' = current_setting('joy.question_post')
      and task->>'title' = '回答社員提問'
      and task->>'detail' like '%你印象最深的服務瞬間是什麼？%'
      and task->>'action_path' like '%focusPostId=%'
      and task->'deadline' = 'null'::jsonb
      and task->'hours_remaining' = 'null'::jsonb
  ) then
    raise exception 'Invited recipient did not get a deadline-free, direct question task: %', task_page;
  end if;
  focused_post := public.get_my_joy_question_post(
    '95000000-0000-4000-8000-000000000001', current_setting('joy.question_post')::uuid
  );
  if focused_post->>'id' <> current_setting('joy.question_post')
    or focused_post->>'post_type' <> 'question'
    or (focused_post->>'can_answer')::boolean is not true then
    raise exception 'Invited recipient could not open their question task';
  end if;

  perform set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
  task_page := public.list_my_member_pending_tasks_with_joy_tasks(
    '95000000-0000-4000-8000-000000000001', 50, 0, true, true
  );
  if exists (select 1 from jsonb_array_elements(task_page->'tasks') as task
      where task->>'kind' = 'joy_question' and task->>'task_id' = current_setting('joy.question_post')) then
    raise exception 'Question author received a task to answer their own invitation';
  end if;
  perform set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000003', true);
  task_page := public.list_my_member_pending_tasks_with_joy_tasks(
    '95000000-0000-4000-8000-000000000001', 50, 0, true, true
  );
  if exists (select 1 from jsonb_array_elements(task_page->'tasks') as task
      where task->>'kind' = 'joy_question')
    or public.get_my_joy_question_post(
      '95000000-0000-4000-8000-000000000001', current_setting('joy.question_post')::uuid
    ) is not null then
    raise exception 'A non-invited member received or opened a private question task';
  end if;
  perform set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000002', true);
  task_page := public.list_my_member_pending_tasks_with_joy_tasks(
    '95000000-0000-4000-8000-000000000001', 50, 0, true, true
  );
  if exists (select 1 from jsonb_array_elements(task_page->'tasks') as task
      where task->>'kind' = 'joy_question' and task->>'task_id' = current_setting('joy.club_question_post')) then
    raise exception 'Club-visible questions were incorrectly converted into tasks for every member';
  end if;

  listed := public.list_joy_posts('95000000-0000-4000-8000-000000000001', null, null, 50);
  if not (listed::text like '%' || current_setting('joy.selected_post') || '%')
    or not (listed::text like '%' || current_setting('joy.private_post') || '%')
    or not (listed::text like '%' || current_setting('joy.iou_post') || '%') then
    raise exception 'Selected recipient cannot see addressed content';
  end if;
  if (select item->'iou'->>'viewer_role' from jsonb_array_elements(listed->'posts') as item
      where item->>'id' = current_setting('joy.iou_post')) <> 'recipient'
    or (select (item->'iou'->>'can_accept')::boolean from jsonb_array_elements(listed->'posts') as item
      where item->>'id' = current_setting('joy.iou_post')) is not true then
    raise exception 'Only the addressed recipient can accept the IOU';
  end if;
  begin
    perform public.act_joy_iou('95000000-0000-4000-8000-000000000001', current_setting('joy.iou_cancel')::uuid, 'cancel', null);
    raise exception 'IOU cancellation accepted without a reason';
  exception when invalid_parameter_value then null; end;
  perform public.act_joy_iou('95000000-0000-4000-8000-000000000001', current_setting('joy.iou_decline')::uuid, 'decline', '目前無法承諾');
  perform public.act_joy_iou('95000000-0000-4000-8000-000000000001', current_setting('joy.iou_cancel')::uuid, 'cancel', '行程有變，先取消');
  perform public.act_joy_iou('95000000-0000-4000-8000-000000000001', current_setting('joy.iou_post')::uuid, 'accept', '可以，謝謝你');
  task_page := public.list_my_member_pending_tasks_with_joy_tasks(
    '95000000-0000-4000-8000-000000000001', 50, 0, true, true
  );
  if exists (select 1 from jsonb_array_elements(task_page->'tasks') as task
      where task->>'kind' = 'joy_iou' and task->>'task_id' = current_setting('joy.iou_post')) then
    raise exception 'The recipient kept a reply task after accepting the IOU';
  end if;
  begin
    perform public.create_joy_comment('95000000-0000-4000-8000-000000000001',
      current_setting('joy.iou_post')::uuid, null, 'comment', 'IOU 不走一般留言');
    raise exception 'Generic comments were accepted on an IOU';
  exception when invalid_parameter_value then null; end;
  if (select (item->>'can_answer')::boolean from jsonb_array_elements(listed->'posts') as item
      where item->>'id' = current_setting('joy.private_post')) is not true then
    raise exception 'Addressed recipient cannot answer private post';
  end if;
  perform public.create_joy_comment(
    '95000000-0000-4000-8000-000000000001', private_id, null, 'blessing', '收件社員的祝福'
  );
  perform public.create_joy_comment(
    '95000000-0000-4000-8000-000000000001', current_setting('joy.question_post')::uuid,
    null, 'answer', '最難忘的是大家一起完成物資整理。'
  );
  task_page := public.list_my_member_pending_tasks_with_joy_tasks(
    '95000000-0000-4000-8000-000000000001', 50, 0, true, true
  );
  if exists (select 1 from jsonb_array_elements(task_page->'tasks') as task
      where task->>'kind' = 'joy_question' and task->>'task_id' = current_setting('joy.question_post')) then
    raise exception 'Answered question remained in the recipient task list';
  end if;
  for report_target_index in 1..20 loop
    perform public.create_joy_post(
      '95000000-0000-4000-8000-000000000001', 'gratitude', null,
      '貼文頻率測試 ' || report_target_index, 'club', '{}'::uuid[]
    );
  end loop;
  begin
    perform public.create_joy_post(
      '95000000-0000-4000-8000-000000000001', 'gratitude', null, '超過頻率限制', 'club', '{}'::uuid[]
    );
    raise exception 'Joy post rate limit was not enforced';
  exception when program_limit_exceeded then null; end;
  perform public.toggle_joy_reaction(
    '95000000-0000-4000-8000-000000000001', current_setting('joy.club_post')::uuid, 'thanks'
  );
  perform public.report_joy_post(
    '95000000-0000-4000-8000-000000000001', current_setting('joy.club_post')::uuid, 'other'
  );
  perform public.report_joy_post(
    '95000000-0000-4000-8000-000000000001', current_setting('joy.private_post')::uuid, 'privacy'
  );
end $$;
reset role;

-- Promisor starts the accepted IOU; both members must independently confirm.
update public.joy_iou_items
set due_on = (clock_timestamp() at time zone 'Asia/Taipei')::date - 1
where post_id = current_setting('joy.iou_overdue')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000002', true);
do $$
declare task_page jsonb;
begin
  task_page := public.list_my_member_pending_tasks_with_joy_tasks(
    '95000000-0000-4000-8000-000000000001', 50, 0, true, true
  );
  if not exists (
    select 1 from jsonb_array_elements(task_page->'tasks') as task
    where task->>'kind' = 'joy_iou'
      and task->>'task_id' = current_setting('joy.iou_overdue')
      and task->>'title' like 'IOU 已逾期：%'
      and task->'deadline' = 'null'::jsonb
      and task->'hours_remaining' = 'null'::jsonb
      and task->>'detail' like '%已逾期（原定 %'
  ) then
    raise exception 'Overdue IOU did not remain visible with an honest overdue label: %', task_page;
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
do $$
declare
  action_result jsonb;
  listed jsonb;
  task_page jsonb;
begin
  action_result := public.act_joy_iou(
    '95000000-0000-4000-8000-000000000001', current_setting('joy.iou_post')::uuid, 'start', null
  );
  if action_result->'iou'->>'status' <> 'in_progress' then
    raise exception 'Promisor could not start accepted IOU';
  end if;
  task_page := public.list_my_member_pending_tasks_with_joy_tasks(
    '95000000-0000-4000-8000-000000000001', 50, 0, true, true
  );
  if not exists (select 1 from jsonb_array_elements(task_page->'tasks') as task
      where task->>'kind' = 'joy_iou' and task->>'task_id' = current_setting('joy.iou_post')) then
    raise exception 'Promisor did not get a completion-confirmation task';
  end if;
  action_result := public.act_joy_iou(
    '95000000-0000-4000-8000-000000000001', current_setting('joy.iou_post')::uuid, 'confirm_completion', '照片已整理好'
  );
  if action_result->'iou'->>'status' <> 'in_progress'
    or (action_result->'iou'->>'promisor_completion_confirmed')::boolean is not true
    or (action_result->'iou'->>'recipient_completion_confirmed')::boolean is not false then
    raise exception 'One party confirmation prematurely completed the IOU';
  end if;
  if (action_result->'iou'->>'can_cancel')::boolean is not false then
    raise exception 'IOU remained cancellable after one party confirmed completion';
  end if;
  task_page := public.list_my_member_pending_tasks_with_joy_tasks(
    '95000000-0000-4000-8000-000000000001', 50, 0, true, true
  );
  if exists (select 1 from jsonb_array_elements(task_page->'tasks') as task
      where task->>'kind' = 'joy_iou' and task->>'task_id' = current_setting('joy.iou_post')) then
    raise exception 'A member who confirmed completion kept an actionable task';
  end if;
  listed := public.list_joy_posts('95000000-0000-4000-8000-000000000001', null, null, 50);
  if (select (item->'iou'->>'is_overdue')::boolean from jsonb_array_elements(listed->'posts') as item
      where item->>'id' = current_setting('joy.iou_overdue')) is not true then
    raise exception 'Taiwan-local overdue projection was not reported';
  end if;
  begin
    perform public.act_joy_iou(
      '95000000-0000-4000-8000-000000000001', current_setting('joy.iou_post')::uuid, 'cancel', '不應取消'
    );
    raise exception 'Partially confirmed IOU was cancelled';
  exception when no_data_found then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000002', true);
do $$
declare
  action_result jsonb;
  task_page jsonb;
begin
  task_page := public.list_my_member_pending_tasks_with_joy_tasks(
    '95000000-0000-4000-8000-000000000001', 50, 0, true, true
  );
  if not exists (select 1 from jsonb_array_elements(task_page->'tasks') as task
      where task->>'kind' = 'joy_iou' and task->>'task_id' = current_setting('joy.iou_post')) then
    raise exception 'Recipient did not get the remaining completion-confirmation task';
  end if;
  action_result := public.act_joy_iou(
    '95000000-0000-4000-8000-000000000001', current_setting('joy.iou_post')::uuid, 'confirm_completion', '收到，確認完成'
  );
  if action_result->'iou'->>'status' <> 'completed'
    or (action_result->'iou'->>'promisor_completion_confirmed')::boolean is not true
    or (action_result->'iou'->>'recipient_completion_confirmed')::boolean is not true then
    raise exception 'IOU did not complete after both parties confirmed';
  end if;
  task_page := public.list_my_member_pending_tasks_with_joy_tasks(
    '95000000-0000-4000-8000-000000000001', 50, 0, true, true
  );
  if exists (select 1 from jsonb_array_elements(task_page->'tasks') as task
      where task->>'kind' = 'joy_iou' and task->>'task_id' = current_setting('joy.iou_post'))
    or public.get_my_joy_iou_post('95000000-0000-4000-8000-000000000001', current_setting('joy.iou_post')::uuid) is not null then
    raise exception 'Completed IOU still appeared as actionable or focusable';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000003', true);
do $$
declare
  listed jsonb;
  task_page jsonb;
  private_id uuid := current_setting('joy.private_post')::uuid;
begin
  task_page := public.list_my_member_pending_tasks_with_joy_tasks(
    '95000000-0000-4000-8000-000000000001', 50, 0, true, true
  );
  if exists (select 1 from jsonb_array_elements(task_page->'tasks') as task where task->>'kind' = 'joy_iou')
    or public.get_my_joy_iou_post('95000000-0000-4000-8000-000000000001', current_setting('joy.iou_overdue')::uuid) is not null then
    raise exception 'An unaddressed same-club member saw a private IOU task or focus projection';
  end if;
  listed := public.list_joy_posts('95000000-0000-4000-8000-000000000001', null, null, 50);
  if listed::text like '%' || current_setting('joy.selected_post') || '%'
    or listed::text like '%' || current_setting('joy.private_post') || '%'
    or listed::text like '%' || current_setting('joy.iou_post') || '%' then
    raise exception 'Unaddressed same-club member saw selected or private content';
  end if;
  begin
    perform public.act_joy_iou(
      '95000000-0000-4000-8000-000000000001', current_setting('joy.iou_post')::uuid, 'accept', null
    );
    raise exception 'Unaddressed member changed a private IOU';
  exception when insufficient_privilege then null; end;
  if not (listed::text like '%' || current_setting('joy.club_post') || '%') then
    raise exception 'Same-club member cannot see club content';
  end if;
  if (select (item->>'can_answer')::boolean from jsonb_array_elements(listed->'posts') as item
      where item->>'id' = current_setting('joy.club_post')) is not true then
    raise exception 'Same-club member cannot answer club-visible post';
  end if;
  perform public.create_joy_comment(
    '95000000-0000-4000-8000-000000000001', current_setting('joy.club_post')::uuid,
    null, 'answer', '同社社員可以回答公開貼文'
  );
  for report_target_index in 1..7 loop
    perform public.create_joy_comment(
      '95000000-0000-4000-8000-000000000001', current_setting('joy.club_post')::uuid,
      null, 'comment', '留言頻率測試 ' || report_target_index
    );
  end loop;
  begin
    perform public.create_joy_comment(
      '95000000-0000-4000-8000-000000000001', current_setting('joy.club_post')::uuid,
      null, 'comment', '超過留言頻率限制'
    );
    raise exception 'Joy comment rate limit was not enforced';
  exception when program_limit_exceeded then null; end;
  begin
    perform public.list_joy_comments('95000000-0000-4000-8000-000000000001', private_id, 100);
    raise exception 'Unaddressed member read private comments';
  exception when insufficient_privilege then null; end;
  begin
    perform public.toggle_joy_reaction('95000000-0000-4000-8000-000000000001', private_id, 'heart');
    raise exception 'Unaddressed member reacted to private content';
  exception when insufficient_privilege then null; end;
  begin
    perform public.create_joy_comment('95000000-0000-4000-8000-000000000001', private_id, null, 'comment', '越權留言');
    raise exception 'Unaddressed member commented on private content';
  exception when insufficient_privilege then null; end;
  begin
    perform public.list_joy_posts('95000000-0000-4000-8000-000000000002', null, null, 20);
    raise exception 'Club A member read Club B Joy Wall';
  exception when insufficient_privilege then null; end;
  begin
    perform public.list_joy_reports('95000000-0000-4000-8000-000000000001', 50);
    raise exception 'Ordinary member read moderation queue';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.joy_posts; raise exception 'authenticated read joy_posts directly';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- A suspended app account and a member from another club cannot create content.
set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000004', true);
do $$
begin
  begin perform public.create_joy_post('95000000-0000-4000-8000-000000000001', 'other', null, '停權測試', 'club', '{}'::uuid[]);
    raise exception 'Suspended account created a Joy post';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000006', true);
do $$
begin
  begin perform public.create_joy_post('95000000-0000-4000-8000-000000000001', 'other', null, '跨社測試', 'club', '{}'::uuid[]);
    raise exception 'Club B member created a Club A Joy post';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Manager may review a report and hide the post; the author can still see its moderation state.
set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000005', true);
do $$
declare
  reports jsonb;
  report_id uuid;
begin
  reports := public.list_joy_reports('95000000-0000-4000-8000-000000000001', 50);
  if jsonb_array_length(reports->'reports') <> 2
    or not exists (select 1 from jsonb_array_elements(reports->'reports') as item where item->>'post_content' = '全社都看得到')
    or not exists (select 1 from jsonb_array_elements(reports->'reports') as item where item->>'post_content' = '作者與收件者私下祝福') then
    raise exception 'Authorized manager report projection incorrect';
  end if;
  select (item->>'report_id')::uuid into report_id
  from jsonb_array_elements(reports->'reports') as item
  where item->>'post_content' = '全社都看得到';
  perform public.resolve_joy_report('95000000-0000-4000-8000-000000000001', report_id, 'hide', '安全驗證隱藏');
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000003', true);
do $$
declare
  listed jsonb;
  report_target_index integer;
begin
  listed := public.list_joy_posts('95000000-0000-4000-8000-000000000001', null, null, 50);
  if listed::text like '%' || current_setting('joy.club_post') || '%' then
    raise exception 'Moderated post still visible to ordinary members';
  end if;
  for report_target_index in 1..5 loop
    perform public.report_joy_post(
      '95000000-0000-4000-8000-000000000001',
      current_setting('joy.report_target_' || report_target_index)::uuid, 'other'
    );
  end loop;
  begin
    perform public.report_joy_post(
      '95000000-0000-4000-8000-000000000001',
      current_setting('joy.report_target_1')::uuid, 'spam'
    );
    raise exception 'Joy report rate limit was not enforced';
  exception when program_limit_exceeded then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
do $$
declare
  listed jsonb;
  comment_index integer;
begin
  listed := public.list_joy_posts('95000000-0000-4000-8000-000000000001', null, null, 50);
  if not (listed::text like '%' || current_setting('joy.club_post') || '%')
    or not (listed::text like '%"is_hidden": true%') then
    raise exception 'Author cannot see moderation state for own content';
  end if;
  for comment_index in 1..7 loop
    perform public.create_joy_comment(
      '95000000-0000-4000-8000-000000000001', current_setting('joy.selected_post')::uuid,
      null, 'comment', '小時上限近期留言 ' || comment_index
    );
  end loop;
  begin
    perform public.create_joy_comment(
      '95000000-0000-4000-8000-000000000001', current_setting('joy.selected_post')::uuid,
      null, 'comment', '超過每小時留言上限'
    );
    raise exception 'Joy hourly comment rate limit was not enforced';
  exception when program_limit_exceeded then null; end;
end $$;
reset role;

-- Replies stop after one level; malformed cursors, invalid types, and bad counts fail closed.
set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000002', true);
do $$
declare
  public_post_id uuid := current_setting('joy.private_post')::uuid;
  top_comment jsonb;
  reply jsonb;
begin
  top_comment := public.create_joy_comment(
    '95000000-0000-4000-8000-000000000001', public_post_id, null, 'blessing', '第一層回覆'
  );
  reply := public.create_joy_comment(
    '95000000-0000-4000-8000-000000000001', public_post_id,
    (top_comment->>'id')::uuid, 'comment', '第二層回覆'
  );
  begin
    perform public.create_joy_comment(
      '95000000-0000-4000-8000-000000000001', public_post_id,
      (reply->>'id')::uuid, 'comment', '不允許第三層'
    );
    raise exception 'Third-level reply accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.create_joy_post('95000000-0000-4000-8000-000000000001', 'unknown', null, 'invalid', 'club', '{}'::uuid[]);
    raise exception 'Unknown joy type accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.toggle_joy_reaction('95000000-0000-4000-8000-000000000001', public_post_id, 'angry');
    raise exception 'Unknown reaction accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.list_joy_posts('95000000-0000-4000-8000-000000000001', now(), null, 20);
    raise exception 'Half cursor accepted';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;

-- The moderation action is audit logged, and browser roles cannot edit that log.
do $$
begin
  if not exists (
    select 1 from public.joy_wall_audit_events
    where club_id = '95000000-0000-4000-8000-000000000001'
      and object_kind = 'post' and object_id = current_setting('joy.club_post')::uuid
      and event_type = 'post_hidden'
  ) then raise exception 'Moderation action audit event missing'; end if;
  if not exists (select 1 from public.joy_wall_audit_events where object_kind = 'iou'
      and object_id = current_setting('joy.iou_post')::uuid and event_type = 'iou_created')
    or not exists (select 1 from public.joy_wall_audit_events where object_kind = 'iou'
      and object_id = current_setting('joy.iou_post')::uuid and event_type = 'iou_accepted')
    or not exists (select 1 from public.joy_wall_audit_events where object_kind = 'iou'
      and object_id = current_setting('joy.iou_post')::uuid and event_type = 'iou_started')
    or not exists (select 1 from public.joy_wall_audit_events where object_kind = 'iou'
      and object_id = current_setting('joy.iou_post')::uuid and event_type = 'iou_completion_confirmed')
    or not exists (select 1 from public.joy_wall_audit_events where object_kind = 'iou'
      and object_id = current_setting('joy.iou_post')::uuid and event_type = 'iou_completed')
    or not exists (select 1 from public.joy_wall_audit_events where object_kind = 'iou'
      and object_id = current_setting('joy.iou_decline')::uuid and event_type = 'iou_declined')
    or not exists (select 1 from public.joy_wall_audit_events where object_kind = 'iou'
      and object_id = current_setting('joy.iou_cancel')::uuid and event_type = 'iou_cancelled') then
    raise exception 'One or more IOU lifecycle transitions are missing audit events';
  end if;
end $$;

set local role authenticated;
do $$
begin
  begin delete from public.joy_wall_audit_events; raise exception 'audit events deleted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
