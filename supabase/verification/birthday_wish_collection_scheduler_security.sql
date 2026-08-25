-- Birthday wish collection scheduler and message notification verification.
-- Run against local Supabase only. Every fixture is rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '15000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'birthday-scheduler-manager@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '15000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'birthday-scheduler-recipient@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '15000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'birthday-scheduler-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '15000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'birthday-scheduler-recipient-two@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email, birth_date) values
  ('25000000-0000-4000-8000-000000000001', '排程管理者', 'birthday-scheduler-manager@example.test', null),
  ('25000000-0000-4000-8000-000000000002', '八月壽星', 'birthday-scheduler-recipient@example.test', '1975-08-08'),
  ('25000000-0000-4000-8000-000000000003', '排程社員', 'birthday-scheduler-member@example.test', '1988-03-03'),
  ('25000000-0000-4000-8000-000000000004', '九月壽星', 'birthday-scheduler-recipient-two@example.test', '1980-09-08');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('35000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000001', '25000000-0000-4000-8000-000000000001', 'birthday-scheduler-manager@example.test', '排程管理者', 'active'),
  ('35000000-0000-4000-8000-000000000002', '15000000-0000-4000-8000-000000000002', '25000000-0000-4000-8000-000000000002', 'birthday-scheduler-recipient@example.test', '八月壽星', 'active'),
  ('35000000-0000-4000-8000-000000000003', '15000000-0000-4000-8000-000000000003', '25000000-0000-4000-8000-000000000003', 'birthday-scheduler-member@example.test', '排程社員', 'active'),
  ('35000000-0000-4000-8000-000000000004', '15000000-0000-4000-8000-000000000004', '25000000-0000-4000-8000-000000000004', 'birthday-scheduler-recipient-two@example.test', '九月壽星', 'active');

insert into public.clubs (id, club_code, club_name, timezone_name, club_status, activated_at)
values ('45000000-0000-4000-8000-000000000001', 'BDAY-SCHED', '生日排程測試社', 'Asia/Taipei', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status)
values
  ('55000000-0000-4000-8000-000000000002', '45000000-0000-4000-8000-000000000001', '25000000-0000-4000-8000-000000000002', 'active'),
  ('55000000-0000-4000-8000-000000000003', '45000000-0000-4000-8000-000000000001', '25000000-0000-4000-8000-000000000003', 'active'),
  ('55000000-0000-4000-8000-000000000004', '45000000-0000-4000-8000-000000000001', '25000000-0000-4000-8000-000000000004', 'active');

insert into public.birthday_visibility_preferences (membership_id, club_id, is_listed, allow_wishes)
values
  ('55000000-0000-4000-8000-000000000002', '45000000-0000-4000-8000-000000000001', true, true),
  ('55000000-0000-4000-8000-000000000004', '45000000-0000-4000-8000-000000000001', true, true);

insert into public.club_operator_permissions (
  id, club_id, app_account_id, operator_role_key, permission_level,
  assignment_status, starts_at
) values (
  '65000000-0000-4000-8000-000000000001',
  '45000000-0000-4000-8000-000000000001',
  '35000000-0000-4000-8000-000000000001',
  'executive_secretary', 'club_manager', 'active', timestamptz '2020-01-01 00:00:00+00'
);

-- The message-centre flag is normally changed through the protected rollout
-- RPC. This fixture writes it as the local database owner with the manager
-- claim so the updated_by trigger is still exercised without widening browser
-- grants.
select set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000001', true);
insert into public.platform_feature_flags (
  feature_key, enabled, enabled_environments, rollout_percentage, updated_by
) values (
  'announcements_v09', true, array['local']::text[], 100,
  '35000000-0000-4000-8000-000000000001'
)
on conflict (feature_key) do update
set enabled = excluded.enabled,
    enabled_environments = excluded.enabled_environments,
    rollout_percentage = excluded.rollout_percentage;

insert into public.platform_feature_flags (
  feature_key, enabled, enabled_environments, rollout_percentage, updated_by
) values (
  'birthday_wishes_collection_v1', true, array['local']::text[], 100,
  '35000000-0000-4000-8000-000000000001'
)
on conflict (feature_key) do update
set enabled = excluded.enabled,
    enabled_environments = excluded.enabled_environments,
    rollout_percentage = excluded.rollout_percentage;

do $$
begin
  if has_function_privilege('authenticated', 'public.run_birthday_wish_collection_scheduler(timestamptz)', 'EXECUTE')
     or has_function_privilege('anon', 'public.run_birthday_wish_collection_scheduler(timestamptz)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.run_birthday_wish_collection_scheduler(timestamptz)', 'EXECUTE') then
    raise exception 'scheduler RPC grant boundary is incorrect';
  end if;
  if has_function_privilege('authenticated', 'public.is_birthday_wish_collection_scheduler_enabled(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.is_birthday_wish_collection_scheduler_enabled(text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.is_birthday_wish_collection_scheduler_enabled(text)', 'EXECUTE') then
    raise exception 'scheduler flag RPC grant boundary is incorrect';
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.birthday_wish_collection_notifications'::regclass)
     or has_table_privilege('authenticated', 'public.birthday_wish_collection_notifications', 'SELECT') then
    raise exception 'scheduler notification table is not closed';
  end if;
end $$;

do $$
begin
  if public.is_birthday_wish_collection_scheduler_enabled('staging') then
    raise exception 'scheduler flag must not enable an environment that is not configured';
  end if;
end $$;

-- A browser-authenticated member cannot invoke the scheduler, even if that
-- member happens to be a club manager.
set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000001', true);
do $$
begin
  begin
    perform public.run_birthday_wish_collection_scheduler(timestamptz '2026-08-01 00:00:00+00');
    raise exception 'authenticated role invoked scheduler';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- The service-only scheduler impersonates the selected active manager inside
-- the database, creates the August batch (birthday within seven days), and
-- creates exactly one notification message for the two non-birthday members.
set local role service_role;
select set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000001', true);
select public.run_birthday_wish_collection_scheduler(timestamptz '2026-08-01 00:00:00+00');
select public.run_birthday_wish_collection_scheduler(timestamptz '2026-08-01 00:00:00+00');
reset role;

do $$
declare
  batch_id uuid;
begin
  select id into batch_id
  from public.birthday_wish_assignment_batches
  where club_id = '45000000-0000-4000-8000-000000000001'
    and birthday_year = 2026
    and birthday_month = 8;

  if (select batch_status from public.birthday_wish_assignment_batches where id = batch_id) <> 'completed'
     or (select count(*) from public.birthday_wish_campaign_participants where assignment_batch_id = batch_id) <> 2
     or (select count(*) from public.birthday_wish_collection_notifications where assignment_batch_id = batch_id and notification_status = 'sent') <> 1
     or (select count(*) from public.club_messages where club_id = '45000000-0000-4000-8000-000000000001') <> 1
     or (select count(*) from public.club_message_recipients where club_id = '45000000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'scheduler rows were not idempotent or complete: %',
      (select jsonb_agg(notification) from public.birthday_wish_collection_notifications as notification);
  end if;

  if (select action_path from public.club_messages limit 1)
      <> '/birthday-collection?clubId=45000000-0000-4000-8000-000000000001' then
    raise exception 'birthday notification deep link was not stored safely';
  end if;
end $$;

-- The member projection exposes the safe relative destination, not the raw
-- notification table or a cross-club recipient list.
set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000003', true);
do $$
declare
  inbox jsonb;
begin
  inbox := public.list_my_club_messages('45000000-0000-4000-8000-000000000001');
  if jsonb_array_length(inbox->'messages') <> 1
     or inbox->'messages'->0->>'action_path' <> '/birthday-collection?clubId=45000000-0000-4000-8000-000000000001' then
    raise exception 'member message projection did not include the safe birthday destination: %', inbox;
  end if;
end $$;
reset role;

-- Turning the message centre off does not lose the completed assignment. The
-- next scheduler run leaves a retry marker; enabling it later sends exactly
-- that original batch once.
set local role service_role;
select set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000001', true);
reset role;
update public.platform_feature_flags
set enabled = false
where feature_key = 'announcements_v09';
set local role service_role;
select public.run_birthday_wish_collection_scheduler(timestamptz '2026-09-01 00:00:00+00');

reset role;
do $$
begin
  if (select count(*) from public.birthday_wish_collection_notifications where notification_status = 'skipped') <> 1
     or (select count(*) from public.club_messages where club_id = '45000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'disabled message centre did not leave a retryable notification';
  end if;
end $$;

update public.platform_feature_flags
set enabled = true
where feature_key = 'announcements_v09';
set local role service_role;
select public.run_birthday_wish_collection_scheduler(timestamptz '2026-09-01 00:00:00+00');
reset role;
do $$
begin
  if (select count(*) from public.birthday_wish_collection_notifications where notification_status = 'sent') <> 2
     or (select count(*) from public.club_messages where club_id = '45000000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'notification retry did not send exactly once';
  end if;
end $$;

rollback;
