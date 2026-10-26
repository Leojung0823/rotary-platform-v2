-- Joy recipient receipt acknowledgements and hide requests stay behind recipient-scoped RPCs.
-- Run only against Supabase local. Synthetic rows are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'b9100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'joy-recipient-action-author@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b9100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'joy-recipient-action-recipient@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b9100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'joy-recipient-action-second@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b9100000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'joy-recipient-action-peer@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b9100000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'joy-recipient-action-suspended@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b9100000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'joy-recipient-action-president@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b9100000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'joy-recipient-action-outsider@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b9100000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'joy-recipient-action-ended@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('b9200000-0000-4000-8000-000000000001', '分享作者', 'joy-recipient-action-author@example.test'),
  ('b9200000-0000-4000-8000-000000000002', '指定收件社員', 'joy-recipient-action-recipient@example.test'),
  ('b9200000-0000-4000-8000-000000000003', '第二位收件社員', 'joy-recipient-action-second@example.test'),
  ('b9200000-0000-4000-8000-000000000004', '未指定社員', 'joy-recipient-action-peer@example.test'),
  ('b9200000-0000-4000-8000-000000000005', '停權社員', 'joy-recipient-action-suspended@example.test'),
  ('b9200000-0000-4000-8000-000000000006', '管理幹部', 'joy-recipient-action-president@example.test'),
  ('b9200000-0000-4000-8000-000000000007', '外社社員', 'joy-recipient-action-outsider@example.test'),
  ('b9200000-0000-4000-8000-000000000008', '已退社社員', 'joy-recipient-action-ended@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('b9300000-0000-4000-8000-000000000001', 'b9100000-0000-4000-8000-000000000001', 'b9200000-0000-4000-8000-000000000001', 'joy-recipient-action-author@example.test', '分享作者', 'active'),
  ('b9300000-0000-4000-8000-000000000002', 'b9100000-0000-4000-8000-000000000002', 'b9200000-0000-4000-8000-000000000002', 'joy-recipient-action-recipient@example.test', '指定收件社員', 'active'),
  ('b9300000-0000-4000-8000-000000000003', 'b9100000-0000-4000-8000-000000000003', 'b9200000-0000-4000-8000-000000000003', 'joy-recipient-action-second@example.test', '第二位收件社員', 'active'),
  ('b9300000-0000-4000-8000-000000000004', 'b9100000-0000-4000-8000-000000000004', 'b9200000-0000-4000-8000-000000000004', 'joy-recipient-action-peer@example.test', '未指定社員', 'active'),
  ('b9300000-0000-4000-8000-000000000005', 'b9100000-0000-4000-8000-000000000005', 'b9200000-0000-4000-8000-000000000005', 'joy-recipient-action-suspended@example.test', '停權社員', 'suspended'),
  ('b9300000-0000-4000-8000-000000000006', 'b9100000-0000-4000-8000-000000000006', 'b9200000-0000-4000-8000-000000000006', 'joy-recipient-action-president@example.test', '管理幹部', 'active'),
  ('b9300000-0000-4000-8000-000000000007', 'b9100000-0000-4000-8000-000000000007', 'b9200000-0000-4000-8000-000000000007', 'joy-recipient-action-outsider@example.test', '外社社員', 'active'),
  ('b9300000-0000-4000-8000-000000000008', 'b9100000-0000-4000-8000-000000000008', 'b9200000-0000-4000-8000-000000000008', 'joy-recipient-action-ended@example.test', '已退社社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('b9500000-0000-4000-8000-000000000001', 'JOY-ACTION-A', '收件動作安全甲社', 'active', now()),
  ('b9500000-0000-4000-8000-000000000002', 'JOY-ACTION-B', '收件動作安全乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status, joined_on, ended_on) values
  ('b9600000-0000-4000-8000-000000000001', 'b9500000-0000-4000-8000-000000000001', 'b9200000-0000-4000-8000-000000000001', 'active', current_date, null),
  ('b9600000-0000-4000-8000-000000000002', 'b9500000-0000-4000-8000-000000000001', 'b9200000-0000-4000-8000-000000000002', 'active', current_date, null),
  ('b9600000-0000-4000-8000-000000000003', 'b9500000-0000-4000-8000-000000000001', 'b9200000-0000-4000-8000-000000000003', 'active', current_date, null),
  ('b9600000-0000-4000-8000-000000000004', 'b9500000-0000-4000-8000-000000000001', 'b9200000-0000-4000-8000-000000000004', 'active', current_date, null),
  ('b9600000-0000-4000-8000-000000000005', 'b9500000-0000-4000-8000-000000000001', 'b9200000-0000-4000-8000-000000000005', 'active', current_date, null),
  ('b9600000-0000-4000-8000-000000000006', 'b9500000-0000-4000-8000-000000000001', 'b9200000-0000-4000-8000-000000000006', 'active', current_date, null),
  ('b9600000-0000-4000-8000-000000000007', 'b9500000-0000-4000-8000-000000000002', 'b9200000-0000-4000-8000-000000000007', 'active', current_date, null),
  ('b9600000-0000-4000-8000-000000000008', 'b9500000-0000-4000-8000-000000000001', 'b9200000-0000-4000-8000-000000000008', 'ended', date '2020-01-01', date '2020-12-31');

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values (
  'b9700000-0000-4000-8000-000000000001', 'b9500000-0000-4000-8000-000000000001',
  'b9300000-0000-4000-8000-000000000006', 'president', 'active', 'b9300000-0000-4000-8000-000000000006'
);

do $$
begin
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.joy_post_acknowledgements'::regclass)
    or has_table_privilege('anon', 'public.joy_post_acknowledgements', 'SELECT')
    or has_table_privilege('authenticated', 'public.joy_post_acknowledgements', 'SELECT')
    or has_table_privilege('authenticated', 'public.joy_post_acknowledgements', 'INSERT')
    or has_table_privilege('authenticated', 'public.joy_post_acknowledgements', 'UPDATE')
    or has_table_privilege('authenticated', 'public.joy_post_acknowledgements', 'DELETE')
    or has_table_privilege('service_role', 'public.joy_post_acknowledgements', 'SELECT') then
    raise exception 'Recipient acknowledgement rows are not private';
  end if;
  if has_function_privilege('anon', 'public.acknowledge_joy_post_receipt(uuid,uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.joy_post_recipient_action_projection(uuid,uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.acknowledge_joy_post_receipt(uuid,uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.list_joy_posts_with_recipient_actions(uuid,timestamptz,uuid,integer,boolean)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.get_my_joy_question_post_with_recipient_actions(uuid,uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.report_joy_post(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'Recipient action RPC grants are incorrect';
  end if;
  if not exists (select 1 from pg_catalog.pg_proc
      where oid = 'public.acknowledge_joy_post_receipt(uuid,uuid)'::regprocedure
        and 'search_path=pg_catalog, public, auth' = any(proconfig))
    or not exists (select 1 from pg_catalog.pg_proc
      where oid = 'public.joy_post_recipient_action_projection(uuid,uuid)'::regprocedure
        and 'search_path=pg_catalog, public, auth' = any(proconfig))
    or not exists (select 1 from pg_catalog.pg_proc
      where oid = 'public.list_joy_posts_with_recipient_actions(uuid,timestamptz,uuid,integer,boolean)'::regprocedure
        and 'search_path=pg_catalog, public, auth' = any(proconfig)) then
    raise exception 'Recipient action search_path is not fixed';
  end if;
end $$;

set local role anon;
do $$
begin
  begin perform public.acknowledge_joy_post_receipt('b9500000-0000-4000-8000-000000000001', 'b9400000-0000-4000-8000-000000000001'); raise exception 'anon acknowledged receipt';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.joy_post_acknowledgements; raise exception 'anon read acknowledgement table';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'b9100000-0000-4000-8000-000000000001', true);
insert into public.platform_feature_flags (feature_key, enabled, enabled_environments, rollout_percentage, updated_by)
values ('joy_wall_v1', true, array['local'], 100, 'b9300000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub', 'b9100000-0000-4000-8000-000000000001', true);
set local role authenticated;
do $$
declare
  selected_post jsonb;
  public_post jsonb;
  post_id uuid;
begin
  selected_post := public.create_joy_post(
    'b9500000-0000-4000-8000-000000000001', 'question', '指定收件提問', '這則只給兩位社員閱讀。', 'selected',
    array['b9600000-0000-4000-8000-000000000002'::uuid, 'b9600000-0000-4000-8000-000000000003'::uuid]
  );
  post_id := (selected_post->>'id')::uuid;
  perform set_config('joy.recipient_action_post_id', post_id::text, true);
  selected_post := public.list_joy_posts_with_recipient_actions(
    'b9500000-0000-4000-8000-000000000001', null, null, 20, false
  )->'posts'->0;
  if selected_post->>'receipt_ack_count' <> '0' or selected_post->>'recipient_count' <> '2'
    or selected_post->'receipt_acknowledged_at' is distinct from 'null'::jsonb
    or selected_post->>'can_acknowledge_receipt' <> 'false'
    or selected_post->>'can_request_hide' <> 'false' then
    raise exception 'Author did not receive only the intended acknowledgement summary';
  end if;
  begin
    perform public.acknowledge_joy_post_receipt('b9500000-0000-4000-8000-000000000001', post_id);
    raise exception 'Author acknowledged own post';
  exception when insufficient_privilege then null; end;

  public_post := public.create_joy_post(
    'b9500000-0000-4000-8000-000000000001', 'gratitude', '全社分享', '全社可讀內容不提供收件確認。', 'club', '{}'::uuid[]
  );
  perform set_config('joy.public_post_id', public_post->>'id', true);
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b9100000-0000-4000-8000-000000000004', true);
do $$
begin
  if exists (
    select 1 from jsonb_array_elements(public.list_joy_posts_with_recipient_actions(
      'b9500000-0000-4000-8000-000000000001', null, null, 50, false
    )->'posts') as entries(post)
    where entries.post->>'id' = current_setting('joy.recipient_action_post_id')
  ) then
    raise exception 'Unaddressed same-club member saw selected post';
  end if;
  begin
    perform public.acknowledge_joy_post_receipt(
      'b9500000-0000-4000-8000-000000000001', current_setting('joy.recipient_action_post_id')::uuid
    );
    raise exception 'Unaddressed same-club member acknowledged post';
  exception when insufficient_privilege then null; end;
  begin
    perform public.report_joy_post(
      'b9500000-0000-4000-8000-000000000001', current_setting('joy.recipient_action_post_id')::uuid,
      'recipient_hide_request'
    );
    raise exception 'Unaddressed member requested recipient-only hide';
  exception when insufficient_privilege then null; end;
  begin
    perform public.acknowledge_joy_post_receipt(
      'b9500000-0000-4000-8000-000000000001', current_setting('joy.public_post_id')::uuid
    );
    raise exception 'Member acknowledged an all-club post';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b9100000-0000-4000-8000-000000000002', true);
do $$
declare
  projection jsonb;
  first_ack jsonb;
  second_ack jsonb;
begin
  select post.value into projection
  from jsonb_array_elements(public.list_joy_posts_with_recipient_actions(
    'b9500000-0000-4000-8000-000000000001', null, null, 50, false
  )->'posts') as post(value)
  where post.value->>'id' = current_setting('joy.recipient_action_post_id');
  if projection->>'can_acknowledge_receipt' <> 'true'
    or projection->>'can_request_hide' <> 'true'
    or projection->'receipt_ack_count' is distinct from 'null'::jsonb
    or projection->'recipient_count' is distinct from 'null'::jsonb
    or projection->'receipt_acknowledged_at' is distinct from 'null'::jsonb then
    raise exception 'Recipient projection leaked author summary or omitted recipient actions';
  end if;
  first_ack := public.acknowledge_joy_post_receipt(
    'b9500000-0000-4000-8000-000000000001', current_setting('joy.recipient_action_post_id')::uuid
  );
  second_ack := public.acknowledge_joy_post_receipt(
    'b9500000-0000-4000-8000-000000000001', current_setting('joy.recipient_action_post_id')::uuid
  );
  if first_ack->>'acknowledged_at' is null or first_ack->>'acknowledged_at' <> second_ack->>'acknowledged_at' then
    raise exception 'Receipt acknowledgement was not idempotent';
  end if;
  if public.get_my_joy_question_post_with_recipient_actions(
    'b9500000-0000-4000-8000-000000000001', current_setting('joy.recipient_action_post_id')::uuid
  )->>'receipt_acknowledged_at' is null then
    raise exception 'Focused question did not project the caller receipt state';
  end if;
  perform set_config('joy.hide_request_id', public.report_joy_post(
    'b9500000-0000-4000-8000-000000000001', current_setting('joy.recipient_action_post_id')::uuid,
    'recipient_hide_request'
  )::text, true);
  select post.value into projection
  from jsonb_array_elements(public.list_joy_posts_with_recipient_actions(
    'b9500000-0000-4000-8000-000000000001', null, null, 50, false
  )->'posts') as post(value)
  where post.value->>'id' = current_setting('joy.recipient_action_post_id');
  if projection->>'hide_request_submitted' <> 'true' or projection->>'can_request_hide' <> 'false' then
    raise exception 'Recipient hide request state was not projected privately';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b9100000-0000-4000-8000-000000000003', true);
do $$
declare projection jsonb;
begin
  select post.value into projection
  from jsonb_array_elements(public.list_joy_posts_with_recipient_actions(
    'b9500000-0000-4000-8000-000000000001', null, null, 50, false
  )->'posts') as post(value)
  where post.value->>'id' = current_setting('joy.recipient_action_post_id');
  if projection->>'can_acknowledge_receipt' <> 'true'
    or projection->'receipt_acknowledged_at' is distinct from 'null'::jsonb
    or projection->'receipt_ack_count' is distinct from 'null'::jsonb
    or projection->'recipient_count' is distinct from 'null'::jsonb
    or projection->>'hide_request_submitted' <> 'false' then
    raise exception 'One recipient saw another recipient acknowledgement or hide request';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b9100000-0000-4000-8000-000000000005', true);
do $$
begin
  begin perform public.acknowledge_joy_post_receipt(
    'b9500000-0000-4000-8000-000000000001', current_setting('joy.recipient_action_post_id')::uuid
  ); raise exception 'Suspended account acknowledged post';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b9100000-0000-4000-8000-000000000008', true);
do $$
begin
  begin perform public.acknowledge_joy_post_receipt(
    'b9500000-0000-4000-8000-000000000001', current_setting('joy.recipient_action_post_id')::uuid
  ); raise exception 'Ended member acknowledged post';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b9100000-0000-4000-8000-000000000007', true);
do $$
begin
  begin perform public.acknowledge_joy_post_receipt(
    'b9500000-0000-4000-8000-000000000001', current_setting('joy.recipient_action_post_id')::uuid
  ); raise exception 'Cross-club member acknowledged post';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b9100000-0000-4000-8000-000000000006', true);
do $$
declare reports jsonb;
begin
  reports := public.list_joy_reports('b9500000-0000-4000-8000-000000000001', 20)->'reports';
  if not exists (
    select 1 from jsonb_array_elements(reports) as entries(report)
    where entries.report->>'report_id' = current_setting('joy.hide_request_id')
      and entries.report->>'reason' = 'recipient_hide_request'
  ) then
    raise exception 'Officer could not see recipient hide request in moderation queue';
  end if;
  perform public.resolve_joy_report(
    'b9500000-0000-4000-8000-000000000001', current_setting('joy.hide_request_id')::uuid, 'hide', '經幹部審核後隱藏'
  );
end $$;
reset role;

do $$
begin
  if (select count(*) from public.joy_post_acknowledgements
      where post_id = current_setting('joy.recipient_action_post_id')::uuid) <> 1 then
    raise exception 'Repeated acknowledgement created duplicate rows';
  end if;
  if (select count(*) from public.joy_wall_audit_events
      where object_id = current_setting('joy.recipient_action_post_id')::uuid and event_type = 'receipt_acknowledged') <> 1 then
    raise exception 'Repeated acknowledgement created duplicate audit events';
  end if;
  if not exists (select 1 from public.joy_posts
      where id = current_setting('joy.recipient_action_post_id')::uuid and post_status = 'hidden') then
    raise exception 'Officer hide decision did not hide the reported post';
  end if;
end $$;

insert into public.platform_roles (app_account_id, role_key)
values ('b9300000-0000-4000-8000-000000000001', 'superadmin');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b9100000-0000-4000-8000-000000000001', true);
select * from public.set_platform_feature_flag('joy_wall_v1', false, array['local'], 100);
do $$
begin
  begin
    perform public.list_joy_posts_with_recipient_actions(
      'b9500000-0000-4000-8000-000000000001', null, null, 20, false
    );
    raise exception 'Recipient projection ignored disabled feature flag';
  exception when insufficient_privilege then null; end;
  begin perform public.acknowledge_joy_post_receipt(
    'b9500000-0000-4000-8000-000000000001', current_setting('joy.recipient_action_post_id')::uuid
  ); raise exception 'Receipt acknowledgement ignored disabled feature flag';
  exception when insufficient_privilege then null; end;
  begin perform public.report_joy_post(
    'b9500000-0000-4000-8000-000000000001', current_setting('joy.recipient_action_post_id')::uuid,
    'recipient_hide_request'
  ); raise exception 'Hide request ignored disabled feature flag';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
