-- Announcement V0.9: drafts, scheduled in-app delivery, pinning, expiry,
-- cancellation, archive, retries and tenant/role boundaries.
-- Run only against Supabase local; all fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '82000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'schedule-manager@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '82000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'schedule-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '82000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'schedule-outsider@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '82000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'schedule-suspended@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('82100000-0000-4000-8000-000000000001', '公告管理幹部', 'schedule-manager@example.test'),
  ('82100000-0000-4000-8000-000000000002', '公告收件社員', 'schedule-member@example.test'),
  ('82100000-0000-4000-8000-000000000003', '外社社員', 'schedule-outsider@example.test'),
  ('82100000-0000-4000-8000-000000000004', '停權社員', 'schedule-suspended@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('82200000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '82100000-0000-4000-8000-000000000001', 'schedule-manager@example.test', '公告管理幹部', 'active'),
  ('82200000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000002', '82100000-0000-4000-8000-000000000002', 'schedule-member@example.test', '公告收件社員', 'active'),
  ('82200000-0000-4000-8000-000000000003', '82000000-0000-4000-8000-000000000003', '82100000-0000-4000-8000-000000000003', 'schedule-outsider@example.test', '外社社員', 'active'),
  ('82200000-0000-4000-8000-000000000004', '82000000-0000-4000-8000-000000000004', '82100000-0000-4000-8000-000000000004', 'schedule-suspended@example.test', '停權社員', 'suspended');

insert into public.clubs (id, club_code, club_name, club_status, activated_at, suspended_at) values
  ('82300000-0000-4000-8000-000000000001', 'SCHED-A', '公告排程測試社', 'active', now(), null),
  ('82300000-0000-4000-8000-000000000002', 'SCHED-B', '另一個社', 'active', now(), null);

insert into public.club_memberships (id, club_id, person_id, membership_status, joined_on, ended_on) values
  ('82400000-0000-4000-8000-000000000001', '82300000-0000-4000-8000-000000000001', '82100000-0000-4000-8000-000000000001', 'active', current_date - 30, null),
  ('82400000-0000-4000-8000-000000000002', '82300000-0000-4000-8000-000000000001', '82100000-0000-4000-8000-000000000002', 'active', current_date - 30, null),
  ('82400000-0000-4000-8000-000000000003', '82300000-0000-4000-8000-000000000002', '82100000-0000-4000-8000-000000000003', 'active', current_date - 30, null),
  ('82400000-0000-4000-8000-000000000004', '82300000-0000-4000-8000-000000000001', '82100000-0000-4000-8000-000000000004', 'active', current_date - 30, null);

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values (
  '82500000-0000-4000-8000-000000000001', '82300000-0000-4000-8000-000000000001',
  '82200000-0000-4000-8000-000000000001', 'president', 'active', '82200000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000001', true);
do $manager$
declare
  draft jsonb;
  future_message jsonb;
  due_message jsonb;
begin
  draft := public.save_club_message_draft(
    '82300000-0000-4000-8000-000000000001', null, '排程公告', '只會在預定時間出現',
    '{}'::uuid[], array['82400000-0000-4000-8000-000000000002'::uuid], null
  );
  if draft->>'status' <> 'draft' or (draft->>'recipient_count')::int <> 1 then
    raise exception 'Manager could not create a recipient-scoped draft: %', draft;
  end if;
  future_message := public.schedule_club_message(
    '82300000-0000-4000-8000-000000000001', (draft->>'id')::uuid, now() + interval '1 minute'
  );
  if future_message->>'status' <> 'scheduled' then
    raise exception 'Draft did not enter scheduled state: %', future_message;
  end if;

  draft := public.save_club_message_draft(
    '82300000-0000-4000-8000-000000000001', null, '過期公告', '不應對社員顯示',
    '{}'::uuid[], array['82400000-0000-4000-8000-000000000002'::uuid], now() + interval '2 minutes'
  );
  due_message := public.schedule_club_message(
    '82300000-0000-4000-8000-000000000001', (draft->>'id')::uuid, now() + interval '1 minute'
  );

  perform set_config('schedule.message', future_message->>'id', true);
  perform set_config('schedule.expiring', due_message->>'id', true);
end $manager$;
reset role;

-- A scheduled row is not visible before the server job publishes it. Ordinary
-- members cannot draft, manage the lifecycle, or read its queue.
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
do $member_before$
declare
  inbox jsonb;
begin
  inbox := public.list_my_club_messages('82300000-0000-4000-8000-000000000001');
  if inbox::text like '%' || current_setting('schedule.message') || '%'
     or inbox::text like '%' || current_setting('schedule.expiring') || '%' then
    raise exception 'A not-yet-published message appeared in the member inbox.';
  end if;
  if jsonb_array_length(public.list_my_pinned_club_messages('82300000-0000-4000-8000-000000000001')) <> 0 then
    raise exception 'A member saw a draft or scheduled notice in the pinned list.';
  end if;

  begin
    perform public.save_club_message_draft(
      '82300000-0000-4000-8000-000000000001', null, '偽造草稿', '內容'
    );
    raise exception 'A plain member saved a draft.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.list_club_message_lifecycle('82300000-0000-4000-8000-000000000001');
    raise exception 'A plain member read the manager lifecycle list.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.club_message_scheduled_jobs;
    raise exception 'A plain member read scheduled job rows directly.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.run_club_message_scheduler(now() + interval '1 hour');
    raise exception 'A plain member invoked the scheduler.';
  exception when insufficient_privilege then null;
  end;
end $member_before$;
reset role;

-- A member of another club cannot read this club's inbox or pinned notices.
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000003', true);
do $outsider$
begin
  begin
    perform public.list_my_pinned_club_messages('82300000-0000-4000-8000-000000000001');
    raise exception 'An outsider read another club''s pinned notices.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.schedule_club_message(
      '82300000-0000-4000-8000-000000000001', current_setting('schedule.message')::uuid, now() + interval '1 hour'
    );
    raise exception 'An outsider scheduled another club''s message.';
  exception when insufficient_privilege then null;
  end;
end $outsider$;
reset role;

-- A suspended account with an otherwise active membership cannot manage or
-- read the announcement lifecycle.
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000004', true);
do $suspended$
begin
  begin
    perform public.save_club_message_draft(
      '82300000-0000-4000-8000-000000000001', null, '停權偽造草稿', '內容'
    );
    raise exception 'A suspended account saved a draft.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.list_club_message_lifecycle('82300000-0000-4000-8000-000000000001');
    raise exception 'A suspended account read the manager lifecycle list.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.list_my_pinned_club_messages('82300000-0000-4000-8000-000000000001');
    raise exception 'A suspended account read member-facing announcements.';
  exception when insufficient_privilege then null;
  end;
end $suspended$;
reset role;

-- The service role can execute the scheduler but cannot query its private
-- queue directly. Repeated execution is idempotent.
set local role service_role;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000001', true);
do $service$
declare
  first_run jsonb;
  second_run jsonb;
begin
  first_run := public.run_club_message_scheduler(now() + interval '3 minutes', 50);
  second_run := public.run_club_message_scheduler(now() + interval '3 minutes', 50);
  if (first_run->>'published')::int <> 1 or (first_run->>'claimed')::int <> 2
     or (first_run->>'skipped')::int <> 1 then
    raise exception 'The due in-app announcement was not published once: %', first_run;
  end if;
  if (second_run->>'published')::int <> 0 or (second_run->>'claimed')::int <> 0 then
    raise exception 'A repeated scheduler run duplicated a published announcement: %', second_run;
  end if;
  begin
    perform 1 from public.club_message_scheduled_jobs;
    raise exception 'The service role queried the scheduler queue directly.';
  exception when insufficient_privilege then null;
  end;
end $service$;
reset role;

-- The addressed member now sees exactly one delivered message, and pinning is
-- a separate projection so it does not collide with chronological pagination.
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
do $member_after$
declare
  inbox jsonb;
  pinned jsonb;
begin
  inbox := public.list_my_club_messages('82300000-0000-4000-8000-000000000001');
  if jsonb_array_length(inbox->'messages') <> 1
     or inbox->'messages'->0->>'id' <> current_setting('schedule.message') then
    raise exception 'The scheduled notice did not appear exactly once after publication: %', inbox;
  end if;
  if (inbox->>'unread_count')::int <> 1 then
    raise exception 'The new delivery was not counted as unread.';
  end if;
  if inbox::text like '%' || current_setting('schedule.expiring') || '%' then
    raise exception 'A notice whose expiry precedes its scheduled send was delivered.';
  end if;
  pinned := public.list_my_pinned_club_messages('82300000-0000-4000-8000-000000000001');
  if jsonb_array_length(pinned) <> 0 then
    raise exception 'A notice appeared pinned before an officer pinned it.';
  end if;
end $member_after$;
reset role;

-- Only a manager can pin or archive, and those transitions affect the member
-- projection without erasing receipts.
set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000001', true);
select public.set_club_message_pinned(
  '82300000-0000-4000-8000-000000000001', current_setting('schedule.message')::uuid, true
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
do $member_pinned$
declare
  inbox jsonb;
  pinned jsonb;
begin
  inbox := public.list_my_club_messages('82300000-0000-4000-8000-000000000001');
  pinned := public.list_my_pinned_club_messages('82300000-0000-4000-8000-000000000001');
  if jsonb_array_length(inbox->'messages') <> 0 or jsonb_array_length(pinned) <> 1
     or pinned->0->>'id' <> current_setting('schedule.message') then
    raise exception 'Pinned notices were duplicated or absent from the pinned section.';
  end if;
  perform public.mark_club_message_read(
    '82300000-0000-4000-8000-000000000001', current_setting('schedule.message')::uuid
  );
  pinned := public.list_my_pinned_club_messages('82300000-0000-4000-8000-000000000001');
  if pinned->0->>'read_at' is null then
    raise exception 'A pinned notice lost its read receipt.';
  end if;
end $member_pinned$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000001', true);
select public.archive_club_message(
  '82300000-0000-4000-8000-000000000001', current_setting('schedule.message')::uuid
);
reset role;

do $retention$
begin
  if (select count(*) from public.club_message_scheduled_jobs) <> 2
     or (select count(*) from public.club_message_scheduled_jobs where job_status = 'completed') <> 2 then
    raise exception 'Scheduler queue rows were not retained or completed exactly once.';
  end if;
  if (select status from public.club_messages where id = current_setting('schedule.message')::uuid) <> 'archived'
     or (select count(*) from public.club_message_recipients where message_id = current_setting('schedule.message')::uuid) <> 1
     or not exists (
       select 1 from public.club_message_audit_events
       where message_id = current_setting('schedule.message')::uuid and event_type = 'archived'
     ) then
    raise exception 'Archiving removed the delivery record or omitted lifecycle audit.';
  end if;
  begin
    update public.club_message_audit_events
    set details = '{"tampered":true}'::jsonb
    where message_id = current_setting('schedule.message')::uuid;
    raise exception 'The audit log accepted an update.';
  exception when insufficient_privilege then null;
  end;
end $retention$;

rollback;
