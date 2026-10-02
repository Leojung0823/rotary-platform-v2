-- Joy IOU reminder queue, member scope, idempotency, and LINE quota stop.
-- Run against a freshly reset local database. All fixtures are rolled back.

begin;

do $$
declare
  signature text;
begin
  if not (select relrowsecurity from pg_catalog.pg_class
      where oid = 'public.joy_iou_deadline_reminders'::regclass)
    or has_table_privilege('anon', 'public.joy_iou_deadline_reminders', 'SELECT')
    or has_table_privilege('authenticated', 'public.joy_iou_deadline_reminders', 'SELECT')
    or has_table_privilege('authenticated', 'public.joy_iou_deadline_reminders', 'INSERT')
    or has_table_privilege('authenticated', 'public.joy_iou_deadline_reminders', 'UPDATE')
    or has_table_privilege('authenticated', 'public.joy_iou_deadline_reminders', 'DELETE')
    or has_table_privilege('service_role', 'public.joy_iou_deadline_reminders', 'SELECT') then
    raise exception 'Joy reminder table is not closed behind its RPC';
  end if;

  foreach signature in array array[
    'public.run_joy_iou_deadline_reminder_scheduler(timestamptz,integer)',
    'public.record_joy_iou_deadline_reminder_delivery(uuid,text,jsonb,text,text)',
    'public.skip_joy_iou_deadline_reminder(uuid,text)',
    'public.halt_joy_iou_deadline_reminders_for_club(uuid,timestamptz)'
  ] loop
    if has_function_privilege('anon', signature, 'EXECUTE')
      or has_function_privilege('authenticated', signature, 'EXECUTE')
      or not has_function_privilege('service_role', signature, 'EXECUTE') then
      raise exception 'Joy reminder service RPC privilege boundary is wrong for %', signature;
    end if;
    if not exists (
      select 1 from pg_catalog.pg_proc as proc
      where proc.oid = signature::regprocedure
        and proc.prosecdef
        and 'search_path=pg_catalog, public, auth' = any(proc.proconfig)
    ) then
      raise exception 'Joy reminder RPC security-definer search_path is not fixed for %', signature;
    end if;
  end loop;

  if not exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.line_push_logs'::regclass
      and attname = 'source_joy_iou_reminder_id'
      and not attisdropped
  ) or not exists (
    select 1 from pg_catalog.pg_class
    where relname = 'line_push_logs_one_per_joy_iou_reminder'
      and relkind = 'i'
  ) then
    raise exception 'Joy reminder push log idempotency key is missing';
  end if;
end;
$$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'joy-reminder-author@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'joy-reminder-recipient@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'joy-reminder-unpaired@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'joy-reminder-outsider@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('a2000000-0000-4000-8000-000000000001', 'IOU 作者', 'joy-reminder-author@example.test'),
  ('a2000000-0000-4000-8000-000000000002', 'IOU 收件人', 'joy-reminder-recipient@example.test'),
  ('a2000000-0000-4000-8000-000000000003', '未加入 LINE 的社員', 'joy-reminder-unpaired@example.test'),
  ('a2000000-0000-4000-8000-000000000004', '外社社員', 'joy-reminder-outsider@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('a3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'joy-reminder-author@example.test', 'IOU 作者', 'active'),
  ('a3000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', 'joy-reminder-recipient@example.test', 'IOU 收件人', 'active'),
  ('a3000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000003', 'joy-reminder-unpaired@example.test', '未加入 LINE 的社員', 'active'),
  ('a3000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000004', 'joy-reminder-outsider@example.test', '外社社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('a4000000-0000-4000-8000-000000000001', 'JOY-REMIND-A', 'IOU 提醒甲社', 'active', now()),
  ('a4000000-0000-4000-8000-000000000002', 'JOY-REMIND-B', 'IOU 提醒乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status) values
  ('a5000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'active'),
  ('a5000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'active'),
  ('a5000000-0000-4000-8000-000000000003', 'a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000003', 'active'),
  ('a5000000-0000-4000-8000-000000000004', 'a4000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000004', 'active');

insert into public.club_role_assignments (
  club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values (
  'a4000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001',
  'president', 'active', 'a3000000-0000-4000-8000-000000000001'
);

insert into public.line_oa_accounts (
  id, club_id, display_name, basic_id, channel_id, account_status,
  channel_secret_env_key, access_token_env_key, webhook_secret_env_key
) values (
  'a6000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001',
  'IOU 提醒甲社 OA', '@joy-reminder-a', 'joy-reminder-channel', 'active',
  'LINE_OA_JOY_REMINDER_SECRET', 'LINE_OA_JOY_REMINDER_TOKEN', 'LINE_OA_JOY_REMINDER_SECRET'
);

insert into public.line_oa_followers (
  id, line_oa_account_id, club_id, person_id, app_account_id, oa_user_id, follower_status, paired_at
) values
  ('a7000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'UjoyReminderAuthor', 'following', now()),
  ('a7000000-0000-4000-8000-000000000002', 'a6000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000002', 'UjoyReminderRecipient', 'following', now());

-- These reminders are personal task messages, not club announcements. Respect
-- the member's LINE preference without requiring the club-announcement switch.
insert into public.notification_settings (app_account_id, line_enabled, club_announcements) values
  ('a3000000-0000-4000-8000-000000000001', true, false),
  ('a3000000-0000-4000-8000-000000000002', true, false),
  ('a3000000-0000-4000-8000-000000000003', true, true);

-- Set feature flags as an authenticated actor so the audit and updated-by
-- triggers are exercised. This fixture transaction is rolled back at the end.
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
insert into public.platform_feature_flags (
  feature_key, enabled, enabled_environments, rollout_percentage, updated_by
) values
  ('joy_wall_v1', true, array['staging'], 100, 'a3000000-0000-4000-8000-000000000001'),
  ('line_oa_event_push_v1', true, array['staging'], 100, 'a3000000-0000-4000-8000-000000000001');

-- Two current due-day tasks for the author; two due/overdue tasks for the
-- recipient; a third eligible task without a paired follower must not send.
insert into public.joy_posts (
  id, club_id, author_app_account_id, author_membership_id, post_type,
  title, content, visibility_scope, post_status
) values
  ('a8000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', 'iou', 'PRIVATE TITLE A', 'PRIVATE CONTENT A', 'private', 'published'),
  ('a8000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', 'iou', 'PRIVATE TITLE B', 'PRIVATE CONTENT B', 'private', 'published'),
  ('a8000000-0000-4000-8000-000000000003', 'a4000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', 'iou', null, 'PRIVATE OVERDUE CONTENT', 'private', 'published'),
  ('a8000000-0000-4000-8000-000000000004', 'a4000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', 'iou', null, 'UNPAIRED CONTENT', 'private', 'published');

insert into public.joy_iou_items (
  post_id, club_id, recipient_membership_id, status, due_on,
  recipient_responded_at, promisor_started_at
) values
  ('a8000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000002', 'accepted', date '2026-10-03', now(), null),
  ('a8000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000002', 'in_progress', date '2026-10-03', now(), now()),
  ('a8000000-0000-4000-8000-000000000003', 'a4000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000002', 'in_progress', date '2026-10-02', now(), now()),
  ('a8000000-0000-4000-8000-000000000004', 'a4000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000003', 'proposed', date '2026-10-03', null, null);

create temporary table joy_reminder_test_results (
  reminder_id uuid,
  club_id uuid,
  recipient_membership_id uuid,
  recipient_app_account_id uuid,
  oa_user_id text,
  reminder_kind text,
  notification_date date,
  actionable_count integer
);
grant select, insert on joy_reminder_test_results to service_role, authenticated;

set local role service_role;
insert into joy_reminder_test_results
select * from public.run_joy_iou_deadline_reminder_scheduler('2026-10-03T12:00:00+08:00'::timestamptz, 50);
reset role;

do $$
begin
  if (select count(*) from joy_reminder_test_results) <> 4 then
    raise exception 'Expected one daily reminder per member and kind, got %', (select count(*) from joy_reminder_test_results);
  end if;
  if not exists (
    select 1 from joy_reminder_test_results
    where recipient_membership_id = 'a5000000-0000-4000-8000-000000000001'
      and reminder_kind = 'due_today' and actionable_count = 2
      and oa_user_id = 'UjoyReminderAuthor'
  ) or not exists (
    select 1 from joy_reminder_test_results
    where recipient_membership_id = 'a5000000-0000-4000-8000-000000000002'
      and reminder_kind = 'due_today' and actionable_count = 1
      and oa_user_id = 'UjoyReminderRecipient'
  ) or not exists (
    select 1 from joy_reminder_test_results
    where recipient_membership_id = 'a5000000-0000-4000-8000-000000000001'
      and reminder_kind = 'overdue' and actionable_count = 1
  ) or not exists (
    select 1 from joy_reminder_test_results
    where recipient_membership_id = 'a5000000-0000-4000-8000-000000000002'
      and reminder_kind = 'overdue' and actionable_count = 1
  ) then
    raise exception 'Due/overdue recipients or counts are incorrect';
  end if;
  if exists (select 1 from joy_reminder_test_results where oa_user_id in ('PRIVATE TITLE A', 'PRIVATE CONTENT A')) then
    raise exception 'Private IOU text leaked into a scheduler projection';
  end if;
end;
$$;

-- The same schedule can run twice without claiming or delivering a reminder twice.
set local role service_role;
insert into joy_reminder_test_results
select * from public.run_joy_iou_deadline_reminder_scheduler('2026-10-03T12:05:00+08:00'::timestamptz, 50);
reset role;
do $$
begin
  if (select count(*) from joy_reminder_test_results) <> 4 then
    raise exception 'A scheduler retry claimed the same reminders twice';
  end if;
end;
$$;

-- A quota response is logged to the existing OA manager surface, and all other
-- pending/processing reminders for that club stop instead of continuing sends.
set local role service_role;
do $$
begin
  begin
    perform public.record_joy_iou_deadline_reminder_delivery(
      (select reminder_id from joy_reminder_test_results where reminder_kind = 'due_today' limit 1),
      'failed',
      '{"message_type":"text","character_count":20,"batch_count":1,"sent_batch_count":0,"delivered_recipient_count":0,"outcome_unknown":false,"private_text":"PRIVATE CONTENT"}'::jsonb,
      'provider-request-invalid',
      'rate_limited'
    );
    raise exception using errcode = 'P0001', message = 'private reminder content was accepted into the push log';
  exception
    when sqlstate '22023' then null;
  end;
end;
$$;
select public.record_joy_iou_deadline_reminder_delivery(
  (select reminder_id from joy_reminder_test_results where reminder_kind = 'due_today' limit 1),
  'failed',
  '{"message_type":"text","character_count":20,"batch_count":1,"sent_batch_count":0,"delivered_recipient_count":0,"outcome_unknown":false}'::jsonb,
  'provider-request-1',
  'rate_limited'
);
select public.halt_joy_iou_deadline_reminders_for_club(
  'a4000000-0000-4000-8000-000000000001',
  '2026-10-03T12:06:00+08:00'::timestamptz
);
reset role;

create temporary table joy_quota_notice (value jsonb);
grant insert, select on joy_quota_notice to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
insert into joy_quota_notice select public.get_line_oa_quota_notice('a4000000-0000-4000-8000-000000000001');
reset role;

do $$
begin
  if not exists (
    select 1 from joy_quota_notice
    where value->>'failure_code' = 'rate_limited'
      and (value->>'recipient_count')::integer = 1
      and (value->>'delivered_recipient_count')::integer = 0
  ) then
    raise exception 'The manager did not receive the LINE quota notice: %', (select value from joy_quota_notice);
  end if;
  if (select count(*) from public.joy_iou_deadline_reminders where delivery_status = 'deferred') <> 3 then
    raise exception 'Remaining reminders did not stop after the quota response';
  end if;
  if exists (
    select 1 from public.line_push_logs
    where source_joy_iou_reminder_id is not null
      and payload_summary::text like '%PRIVATE CONTENT%'
  ) then
    raise exception 'Private IOU content was stored in an OA push log';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
do $$
begin
  begin
    perform public.get_line_oa_quota_notice('a4000000-0000-4000-8000-000000000001');
    raise exception 'An ordinary member read a manager-only LINE quota notice';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

rollback;
