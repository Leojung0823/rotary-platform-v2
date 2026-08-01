-- V0.9 announcement, notification, worker, tenant, lifecycle, and redaction verification.
-- Run only against Supabase local. Synthetic fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '19000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'v09-manager@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '19000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'v09-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '19000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'v09-other@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '19000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'v09-cross@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '19000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'v09-inactive@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '19000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'v09-suspended-membership@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '19000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'v09-ended@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '19000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'v09-operator@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('29000000-0000-4000-8000-000000000001', 'V09 管理者', 'v09-manager@example.test'),
  ('29000000-0000-4000-8000-000000000002', 'V09 社員', 'v09-member@example.test'),
  ('29000000-0000-4000-8000-000000000003', 'V09 非指定社員', null),
  ('29000000-0000-4000-8000-000000000004', 'V09 外社員', 'v09-cross@example.test'),
  ('29000000-0000-4000-8000-000000000005', 'V09 停權帳號', 'v09-inactive@example.test'),
  ('29000000-0000-4000-8000-000000000006', 'V09 停權社籍', 'v09-suspended-membership@example.test'),
  ('29000000-0000-4000-8000-000000000007', 'V09 結束社籍', 'v09-ended@example.test'),
  ('29000000-0000-4000-8000-000000000008', 'V09 執行秘書', 'v09-operator@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('39000000-0000-4000-8000-000000000001', '19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001', 'v09-manager@example.test', 'V09 管理者', 'active'),
  ('39000000-0000-4000-8000-000000000002', '19000000-0000-4000-8000-000000000002', '29000000-0000-4000-8000-000000000002', 'v09-member@example.test', 'V09 社員', 'active'),
  ('39000000-0000-4000-8000-000000000003', '19000000-0000-4000-8000-000000000003', '29000000-0000-4000-8000-000000000003', 'v09-other@example.test', 'V09 非指定社員', 'active'),
  ('39000000-0000-4000-8000-000000000004', '19000000-0000-4000-8000-000000000004', '29000000-0000-4000-8000-000000000004', 'v09-cross@example.test', 'V09 外社員', 'active'),
  ('39000000-0000-4000-8000-000000000005', '19000000-0000-4000-8000-000000000005', '29000000-0000-4000-8000-000000000005', 'v09-inactive@example.test', 'V09 停權帳號', 'suspended'),
  ('39000000-0000-4000-8000-000000000006', '19000000-0000-4000-8000-000000000006', '29000000-0000-4000-8000-000000000006', 'v09-suspended-membership@example.test', 'V09 停權社籍', 'active'),
  ('39000000-0000-4000-8000-000000000007', '19000000-0000-4000-8000-000000000007', '29000000-0000-4000-8000-000000000007', 'v09-ended@example.test', 'V09 結束社籍', 'active'),
  ('39000000-0000-4000-8000-000000000008', '19000000-0000-4000-8000-000000000008', '29000000-0000-4000-8000-000000000008', 'v09-operator@example.test', 'V09 執行秘書', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at, suspended_at) values
  ('59000000-0000-4000-8000-000000000001', 'V09-A', 'V09 測試甲社', 'active', now(), null),
  ('59000000-0000-4000-8000-000000000002', 'V09-B', 'V09 測試乙社', 'active', now(), null),
  ('59000000-0000-4000-8000-000000000003', 'V09-C', 'V09 停權社', 'suspended', now() - interval '1 day', now());

insert into public.club_memberships (
  id, club_id, person_id, membership_status, joined_on, ended_on
) values
  ('69000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001', 'active', current_date - 100, null),
  ('69000000-0000-4000-8000-000000000002', '59000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000002', 'active', current_date - 100, null),
  ('69000000-0000-4000-8000-000000000003', '59000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000003', 'active', current_date - 100, null),
  ('69000000-0000-4000-8000-000000000004', '59000000-0000-4000-8000-000000000002', '29000000-0000-4000-8000-000000000004', 'active', current_date - 100, null),
  ('69000000-0000-4000-8000-000000000005', '59000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000005', 'active', current_date - 100, null),
  ('69000000-0000-4000-8000-000000000006', '59000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000006', 'suspended', current_date - 100, null),
  ('69000000-0000-4000-8000-000000000007', '59000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000007', 'ended', current_date - 100, current_date - 1),
  ('69000000-0000-4000-8000-000000000008', '59000000-0000-4000-8000-000000000003', '29000000-0000-4000-8000-000000000001', 'active', current_date - 100, null);

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values
  ('79000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000001', '39000000-0000-4000-8000-000000000001', 'president', 'active', '39000000-0000-4000-8000-000000000001'),
  ('79000000-0000-4000-8000-000000000002', '59000000-0000-4000-8000-000000000001', '39000000-0000-4000-8000-000000000002', 'member', 'active', '39000000-0000-4000-8000-000000000001'),
  ('79000000-0000-4000-8000-000000000003', '59000000-0000-4000-8000-000000000003', '39000000-0000-4000-8000-000000000001', 'president', 'active', '39000000-0000-4000-8000-000000000001');

insert into public.club_operator_permissions (
  id, club_id, app_account_id, permission_level, assignment_status, starts_at
) values (
  '7a000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000008', 'club_manager', 'active', now() - interval '1 day'
);

insert into public.notification_settings (
  app_account_id, line_enabled, email_enabled, security_alerts, club_announcements, in_app_enabled
) values
  ('39000000-0000-4000-8000-000000000001', false, false, true, true, true),
  ('39000000-0000-4000-8000-000000000002', true, true, true, true, true),
  ('39000000-0000-4000-8000-000000000003', true, true, true, true, true),
  ('39000000-0000-4000-8000-000000000004', true, true, true, true, true),
  ('39000000-0000-4000-8000-000000000005', true, true, true, true, true),
  ('39000000-0000-4000-8000-000000000006', true, true, true, true, true),
  ('39000000-0000-4000-8000-000000000007', true, true, true, true, true);

insert into public.line_oa_accounts (
  id, club_id, display_name, account_status, created_by_app_account_id
) values (
  '8a000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000001',
  'V09 local mock OA', 'active', '39000000-0000-4000-8000-000000000001'
);
insert into public.line_oa_followers (
  id, line_oa_account_id, club_id, person_id, app_account_id, oa_user_id, follower_status, paired_at
) values (
  '8b000000-0000-4000-8000-000000000001', '8a000000-0000-4000-8000-000000000001',
  '59000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000002',
  '39000000-0000-4000-8000-000000000002', 'U-v09-local-fixture', 'following', now()
);

-- Browser roles have no direct table access and cannot execute worker RPCs.
set local role authenticated;
select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000002', true);
do $$ begin
  begin perform 1 from public.club_announcements; raise exception 'browser directly read announcements';
  exception when insufficient_privilege then null; end;
  begin perform public.claim_notification_deliveries(1, 'browser-worker'); raise exception 'browser executed worker claim';
  exception when insufficient_privilege then null; end;
  begin perform public.expire_due_announcements(1); raise exception 'browser expired announcements';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- A non-manager cannot create, update, publish, schedule, cancel, archive, or retry.
set local role authenticated;
select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000003', true);
do $$ begin
  begin perform public.create_club_announcement('59000000-0000-4000-8000-000000000001', '拒絕', '拒絕', '[{"type":"all_active_members"}]', null, null); raise exception 'non-manager created announcement';
  exception when insufficient_privilege then null; end;
  begin perform public.retry_failed_announcement_deliveries('59000000-0000-4000-8000-000000000001', extensions.gen_random_uuid()); raise exception 'non-manager retried delivery';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Suspended clubs permanently reject management mutations.
set local role authenticated;
select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000001', true);
do $$ begin
  begin perform public.create_club_announcement('59000000-0000-4000-8000-000000000003', '停權', '停權', '[{"type":"all_active_members"}]', null, null); raise exception 'suspended club accepted mutation';
  exception when insufficient_privilege then null; end;
end $$;

-- Create every audience kind and lifecycle state through authenticated manager RPCs.
do $$
declare all_id uuid; role_id uuid; member_id uuid; draft_id uuid; scheduled_id uuid; cancelled_id uuid; archived_id uuid;
begin
  all_id := public.create_club_announcement('59000000-0000-4000-8000-000000000001', '全社公告', '全社公告敏感內容不得進 audit', '[{"type":"all_active_members"}]', null, null);
  perform public.publish_club_announcement('59000000-0000-4000-8000-000000000001', all_id);
  perform set_config('v09.all_id', all_id::text, false);

  role_id := public.create_club_announcement('59000000-0000-4000-8000-000000000001', '職務公告', '只有 member role', '[{"type":"role","role_key":"member"}]', null, null);
  perform public.update_draft_announcement('59000000-0000-4000-8000-000000000001', role_id, '職務公告更新', '只有 member role', '[{"type":"role","role_key":"member"}]', null, null, null);
  perform public.publish_club_announcement('59000000-0000-4000-8000-000000000001', role_id);
  perform set_config('v09.role_id', role_id::text, false);

  member_id := public.create_club_announcement('59000000-0000-4000-8000-000000000001', '指定社員公告', '只有一位社員', '[{"type":"membership","membership_id":"69000000-0000-4000-8000-000000000003"}]', null, null);
  perform public.publish_club_announcement('59000000-0000-4000-8000-000000000001', member_id);
  perform set_config('v09.member_id', member_id::text, false);

  draft_id := public.create_club_announcement('59000000-0000-4000-8000-000000000001', '草稿不可見', '草稿', '[{"type":"all_active_members"}]', null, null);
  perform set_config('v09.draft_id', draft_id::text, false);

  scheduled_id := public.create_club_announcement('59000000-0000-4000-8000-000000000001', '排程公告', '排程 worker', '[{"type":"all_active_members"}]', null, null);
  perform public.schedule_club_announcement('59000000-0000-4000-8000-000000000001', scheduled_id, now() + interval '1 second');
  perform set_config('v09.scheduled_id', scheduled_id::text, false);

  cancelled_id := public.create_club_announcement('59000000-0000-4000-8000-000000000001', '取消公告', '取消', '[{"type":"all_active_members"}]', null, null);
  perform public.cancel_club_announcement('59000000-0000-4000-8000-000000000001', cancelled_id, '測試取消原因');
  perform set_config('v09.cancelled_id', cancelled_id::text, false);

  archived_id := public.create_club_announcement('59000000-0000-4000-8000-000000000001', '封存公告', '封存', '[{"type":"all_active_members"}]', null, null);
  perform public.publish_club_announcement('59000000-0000-4000-8000-000000000001', archived_id);
  perform public.archive_club_announcement('59000000-0000-4000-8000-000000000001', archived_id);
  perform set_config('v09.archived_id', archived_id::text, false);
end $$;
reset role;

-- Recipient resolution excludes operator-only, inactive, suspended, and ended identities.
do $$ declare all_id uuid := current_setting('v09.all_id')::uuid; begin
  if (select count(*) from public.account_notifications where source_id = all_id) <> 3 then
    raise exception 'all-active audience eligibility or deduplication is incorrect';
  end if;
  if exists (
    select 1 from public.account_notifications where source_id = all_id
      and account_id in (
        '39000000-0000-4000-8000-000000000005', '39000000-0000-4000-8000-000000000006',
        '39000000-0000-4000-8000-000000000007', '39000000-0000-4000-8000-000000000008'
      )
  ) then raise exception 'ineligible identity received notification'; end if;
  if (select count(*) from public.notification_deliveries where notification_id in (
    select id from public.account_notifications where source_id = all_id
  )) <> 2 then raise exception 'preference, trusted email, or OA follower eligibility is incorrect'; end if;
  if exists (
    select 1 from public.notification_deliveries where account_id <> '39000000-0000-4000-8000-000000000002'
  ) then raise exception 'external delivery was created without eligible channel identity'; end if;
  perform set_config('v09.member_notification_id', (
    select id::text from public.account_notifications
    where source_id = all_id and account_id = '39000000-0000-4000-8000-000000000002'
    order by id limit 1
  ), false);
end $$;

-- Member reads are audience-scoped, lifecycle-filtered, bounded, and cross-club safe.
set local role authenticated;
select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000002', true);
do $$ declare listing jsonb; detail jsonb; read_one timestamptz; read_two timestamptz; begin
  listing := public.list_my_announcements('59000000-0000-4000-8000-000000000001', null, 100);
  if jsonb_array_length(listing->'items') <> 2
     or listing::text not like '%全社公告%'
     or listing::text not like '%職務公告更新%'
     or listing::text like '%草稿不可見%'
     or listing::text like '%排程公告%'
     or listing::text like '%取消公告%'
     or listing::text like '%封存公告%' then
    raise exception 'member announcement visibility is incorrect: %', listing;
  end if;
  begin perform public.get_my_announcement('59000000-0000-4000-8000-000000000001', current_setting('v09.member_id')::uuid); raise exception 'non-audience member read targeted announcement';
  exception when insufficient_privilege then null; end;
  detail := public.get_my_announcement('59000000-0000-4000-8000-000000000001', current_setting('v09.all_id')::uuid);
  read_one := public.mark_announcement_read('59000000-0000-4000-8000-000000000001', current_setting('v09.all_id')::uuid);
  read_two := public.mark_announcement_read('59000000-0000-4000-8000-000000000001', current_setting('v09.all_id')::uuid);
  if read_one is distinct from read_two then raise exception 'receipt marking was not idempotent'; end if;
  begin perform public.list_my_announcements('59000000-0000-4000-8000-000000000001', null, 101); raise exception 'unbounded announcement list accepted';
  exception when invalid_parameter_value then null; end;
  if jsonb_array_length((public.list_my_notifications(null, 100))->'items') < 2 then raise exception 'member notification list is missing'; end if;
  if public.get_my_unread_notification_count() < 1 then raise exception 'unread notification count is incorrect'; end if;
end $$;
reset role;

do $$ begin
  if (select count(*) from public.announcement_receipts where announcement_id = current_setting('v09.all_id')::uuid and membership_id = '69000000-0000-4000-8000-000000000002') <> 1 then
    raise exception 'receipt was duplicated';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000003', true);
do $$ declare listing jsonb; begin
  listing := public.list_my_announcements('59000000-0000-4000-8000-000000000001', null, 100);
  if jsonb_array_length(listing->'items') <> 2
     or listing::text like '%職務公告更新%'
     or listing::text not like '%指定社員公告%' then
    raise exception 'role or membership audience resolution is incorrect: %', listing;
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000004', true);
do $$ begin
  begin perform public.list_my_announcements('59000000-0000-4000-8000-000000000001', null, 50); raise exception 'Club B member read Club A announcements';
  exception when insufficient_privilege then null; end;
  begin perform public.mark_notification_read(current_setting('v09.member_notification_id')::uuid); raise exception 'Club B account marked Club A notification';
  exception when no_data_found then null; end;
end $$;
reset role;

-- Composite tenant FKs reject forged receipts and notification identities.
do $$ begin
  begin
    insert into public.announcement_receipts (club_id, announcement_id, membership_id)
    values ('59000000-0000-4000-8000-000000000002', current_setting('v09.all_id')::uuid, '69000000-0000-4000-8000-000000000004');
    raise exception 'cross-club receipt was inserted';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.account_notifications (
      club_id, account_id, membership_id, notification_type, title, body, action_path, source_type, source_id, deduplication_key
    ) values (
      '59000000-0000-4000-8000-000000000001', '39000000-0000-4000-8000-000000000004', '69000000-0000-4000-8000-000000000002',
      'announcement_published', 'forged', 'forged', '/announcements/forged', 'announcement', extensions.gen_random_uuid(), 'forged-notification-key'
    );
    raise exception 'account and membership mismatch was inserted';
  exception when foreign_key_violation then null; end;
end $$;

-- Scheduled claims are atomic, leased, reclaimable only after expiry, and blocked for suspended clubs.
select pg_sleep(1.1);
create temp table v09_schedule_claims on commit drop as
  select * from public.claim_due_scheduled_announcements(10, 'worker-schedule-1');
do $$ declare claimed integer; second_count integer; result jsonb; begin
  select count(*) into claimed from v09_schedule_claims where announcement_id = current_setting('v09.scheduled_id')::uuid;
  if claimed <> 1 then raise exception 'due scheduled announcement was not claimed'; end if;
  select count(*) into second_count from public.claim_due_scheduled_announcements(10, 'worker-schedule-2') where announcement_id = current_setting('v09.scheduled_id')::uuid;
  if second_count <> 0 then raise exception 'valid schedule lease was reclaimed'; end if;
  begin
    perform public.complete_scheduled_announcement_claim(announcement_id, claim_token, 'worker-schedule-2')
    from v09_schedule_claims where announcement_id = current_setting('v09.scheduled_id')::uuid;
    raise exception 'foreign worker completed scheduled claim';
  exception when no_data_found then null; end;
  select public.complete_scheduled_announcement_claim(announcement_id, claim_token, 'worker-schedule-1') into result
  from v09_schedule_claims where announcement_id = current_setting('v09.scheduled_id')::uuid;
  if (select status from public.club_announcements where id = current_setting('v09.scheduled_id')::uuid) <> 'published' then raise exception 'scheduled claim was not published'; end if;
end $$;

-- Delivery claims use SKIP LOCKED, enforce lease, retry wait, max attempts, and sent terminality.
create temp table v09_delivery_claims on commit drop as
  select * from public.claim_notification_deliveries(100, 'worker-delivery-1');
do $$ declare claim_count integer; second_count integer; first_claim record; second_claim record; retry_claim record; status_value text; begin
  select count(*) into claim_count from v09_delivery_claims;
  if claim_count < 2 then raise exception 'eligible deliveries were not claimed'; end if;
  select count(*) into second_count from public.claim_notification_deliveries(100, 'worker-delivery-2');
  if second_count <> 0 then raise exception 'active delivery leases were reclaimed'; end if;

  select * into first_claim from v09_delivery_claims order by delivery_id limit 1;
  begin
    perform public.complete_notification_delivery(first_claim.delivery_id, first_claim.claim_token, 'worker-delivery-2', 'foreign-worker');
    raise exception 'foreign worker completed delivery claim';
  exception when no_data_found then null; end;
  status_value := public.fail_notification_delivery(first_claim.delivery_id, first_claim.claim_token, 'worker-delivery-1', 'provider_temporary');
  if status_value <> 'retry_wait'
     or (select generalized_error_code from public.notification_deliveries where id = first_claim.delivery_id) <> 'provider_temporary'
     or (select next_attempt_at <= now() from public.notification_deliveries where id = first_claim.delivery_id) then
    raise exception 'temporary failure backoff is incorrect';
  end if;
  update public.notification_deliveries set next_attempt_at = now() - interval '1 second' where id = first_claim.delivery_id;
  select * into second_claim from public.claim_notification_deliveries(1, 'worker-delivery-retry') where delivery_id = first_claim.delivery_id;
  perform public.complete_notification_delivery(second_claim.delivery_id, second_claim.claim_token, 'worker-delivery-retry', 'mock-generalized-reference');
  if (select status from public.notification_deliveries where id = first_claim.delivery_id) <> 'sent' then raise exception 'retry did not complete delivery'; end if;
  if exists (select 1 from public.claim_notification_deliveries(100, 'worker-delivery-after-sent') where delivery_id = first_claim.delivery_id) then raise exception 'sent delivery was reclaimed'; end if;

  select claim.* into retry_claim
  from v09_delivery_claims as claim
  join public.notification_deliveries as delivery on delivery.id = claim.delivery_id
  join public.account_notifications as notification on notification.id = delivery.notification_id
  where notification.source_type = 'announcement'
    and notification.source_id = current_setting('v09.all_id')::uuid
    and claim.delivery_id <> first_claim.delivery_id
  order by claim.delivery_id
  limit 1;
  if retry_claim.delivery_id is null then
    raise exception 'fixture did not create a second delivery for retry';
  end if;
  status_value := public.fail_notification_delivery(retry_claim.delivery_id, retry_claim.claim_token, 'worker-delivery-1', 'provider_permanent');
  if status_value <> 'failed' then raise exception 'permanent failure was retried'; end if;
  if exists (select 1 from public.notification_deliveries where provider_message_id_hash like '%mock-generalized-reference%') then raise exception 'provider reference body was stored'; end if;
end $$;

-- Manager retry is audited and resets failed rows without touching sent rows.
set local role authenticated;
select set_config('request.jwt.claim.sub', '19000000-0000-4000-8000-000000000001', true);
do $$ declare affected integer; begin
  affected := public.retry_failed_announcement_deliveries('59000000-0000-4000-8000-000000000001', current_setting('v09.all_id')::uuid);
  if affected < 1 then raise exception 'failed delivery retry did not queue a row'; end if;
end $$;
reset role;

-- Expired final-attempt leases become terminal instead of remaining forever
-- unclaimable. This covers both delivery and scheduled-publication workers.
do $$
declare exhausted_delivery_id uuid; exhausted_schedule_id uuid;
begin
  select id into exhausted_delivery_id
  from public.notification_deliveries
  where status = 'processing'
  order by id
  limit 1;
  if exhausted_delivery_id is null then
    raise exception 'fixture did not leave a delivery claim for lease recovery';
  end if;
  update public.notification_deliveries
  set attempt_count = max_attempts,
      claimed_at = clock_timestamp() - interval '2 seconds',
      lease_expires_at = clock_timestamp() - interval '1 second'
  where id = exhausted_delivery_id;
  perform public.claim_notification_deliveries(1, 'worker-final-lease');
  if not exists (
    select 1 from public.notification_deliveries
    where id = exhausted_delivery_id
      and status = 'failed'
      and generalized_error_code = 'worker_timeout'
  ) then
    raise exception 'final delivery lease was left permanently unclaimable';
  end if;

  exhausted_schedule_id := '9a000000-0000-4000-8000-000000000009'::uuid;
  insert into public.club_announcements (
    id, club_id, title, body, status, publish_at, created_by_account_id,
    created_at, updated_at, schedule_attempt_count, schedule_max_attempts,
    next_schedule_attempt_at
  ) values (
    exhausted_schedule_id, '59000000-0000-4000-8000-000000000001',
    '排程 lease 終態', '本機驗證', 'scheduled', clock_timestamp() - interval '1 second',
    '39000000-0000-4000-8000-000000000001', clock_timestamp() - interval '2 seconds',
    clock_timestamp() - interval '2 seconds', 3, 3, clock_timestamp() - interval '1 second'
  );
  perform public.claim_due_scheduled_announcements(1, 'worker-schedule-final');
  if not exists (
    select 1 from public.club_announcements
    where id = exhausted_schedule_id
      and status = 'cancelled'
      and schedule_error_code = 'worker_timeout'
  ) then
    raise exception 'final schedule lease was left permanently unclaimable';
  end if;
end $$;

-- Expiry worker removes expired announcements from active member lists.
insert into public.club_announcements (
  id, club_id, title, body, status, publish_at, expire_at, created_by_account_id,
  published_by_account_id, published_at
) values (
  '9a000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000001',
  '已到期公告', '不得出現在 active list', 'published', now() - interval '2 hours', now() - interval '1 hour',
  '39000000-0000-4000-8000-000000000001', '39000000-0000-4000-8000-000000000001', now() - interval '2 hours'
);
insert into public.club_announcement_audiences (club_id, announcement_id, audience_type)
values ('59000000-0000-4000-8000-000000000001', '9a000000-0000-4000-8000-000000000001', 'all_active_members');
do $$ declare affected integer; status_value text; begin
  affected := public.expire_due_announcements(100);
  select status into status_value from public.club_announcements where id = '9a000000-0000-4000-8000-000000000001';
  if affected < 1 or status_value <> 'expired' then
    raise exception 'expired announcement worker did not transition status: affected %, status %', affected, status_value;
  end if;
end $$;

-- Identity and history are immutable and hard deletes are rejected.
do $$ begin
  begin update public.club_announcements set club_id = '59000000-0000-4000-8000-000000000002' where id = current_setting('v09.all_id')::uuid; raise exception 'announcement identity changed';
  exception when check_violation then null; end;
  begin delete from public.club_announcements where id = current_setting('v09.all_id')::uuid; raise exception 'announcement hard deleted';
  exception when insufficient_privilege then null; end;
  begin delete from public.club_announcement_versions where announcement_id = current_setting('v09.all_id')::uuid; raise exception 'version hard deleted';
  exception when insufficient_privilege then null; end;
  begin delete from public.announcement_receipts where announcement_id = current_setting('v09.all_id')::uuid; raise exception 'receipt hard deleted';
  exception when insufficient_privilege then null; end;
  begin delete from public.account_notifications where source_id = current_setting('v09.all_id')::uuid; raise exception 'notification hard deleted';
  exception when insufficient_privilege then null; end;
  begin delete from public.notification_deliveries where notification_id in (select id from public.account_notifications where source_id = current_setting('v09.all_id')::uuid); raise exception 'delivery hard deleted';
  exception when insufficient_privilege then null; end;
end $$;

-- Repair trigger permits publication metadata only through trusted RPC paths.
do $$
declare draft_id uuid := current_setting('v09.draft_id')::uuid;
begin
  begin
    update public.club_announcements set status = 'draft'
    where id = current_setting('v09.all_id')::uuid;
    raise exception 'published announcement reverted to draft';
  exception when check_violation then null; end;
  begin
    update public.club_announcements
    set status = 'published', publish_at = now(), published_at = now(),
        published_by_account_id = '39000000-0000-4000-8000-000000000001'
    where id = draft_id;
    raise exception 'direct update initialized publication metadata';
  exception when check_violation then null; end;
  begin
    insert into public.club_announcements as announcement (
      id, club_id, title, body, status, created_by_account_id
    ) values (
      draft_id, '59000000-0000-4000-8000-000000000001', '覆寫', '覆寫', 'draft',
      '39000000-0000-4000-8000-000000000001'
    ) on conflict (id) do update
    set status = 'published', publish_at = now(), published_at = now(),
        published_by_account_id = '39000000-0000-4000-8000-000000000001';
    raise exception 'upsert initialized publication metadata';
  exception when check_violation then null; end;
end $$;

-- Every management mutation is audited with generalized metadata only.
do $$ declare metadata_text text; begin
  if exists (
    select action_key from (values
      ('announcement.created'), ('announcement.updated'), ('announcement.scheduled'),
      ('announcement.published'), ('announcement.cancelled'), ('announcement.archived'),
      ('announcement.delivery_retried')
    ) as required(action_key)
    where not exists (select 1 from public.audit_logs where audit_logs.action_key = required.action_key)
  ) then raise exception 'announcement mutation audit is incomplete'; end if;
  select string_agg(metadata::text, ' ') into metadata_text
  from public.audit_logs where action_key like 'announcement.%';
  if metadata_text ilike '%全社公告敏感內容%'
     or metadata_text ilike '%@example.test%'
     or metadata_text ilike '%U-v09-local-fixture%'
     or metadata_text ilike '%19000000-0000-4000-8000-000000000001%'
     or metadata_text ilike '%39000000-0000-4000-8000-000000000001%'
     or metadata_text ilike '%69000000-0000-4000-8000-000000000001%'
     or metadata_text ilike '%provider_response%'
     or metadata_text ilike '%token%'
     or metadata_text ilike '%secret%' then
    raise exception 'audit metadata contains forbidden content or identity';
  end if;
end $$;

-- Function grants stay explicit: browser API yes, worker API service-role only.
do $$ begin
  if not has_function_privilege('authenticated', 'public.list_my_announcements(uuid,timestamptz,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.claim_notification_deliveries(integer,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.v09_delivery_protect_update()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.claim_notification_deliveries(integer,text)', 'EXECUTE') then
    raise exception 'RPC execution grants are incorrect';
  end if;
  if public.v09_retry_backoff_seconds(1) <> 30
     or public.v09_retry_backoff_seconds(2) <> 60
     or public.v09_retry_backoff_seconds(3) <> 120 then
    raise exception 'bounded exponential backoff is incorrect';
  end if;
end $$;

rollback;
