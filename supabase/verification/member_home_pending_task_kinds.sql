-- 待辦提醒的四種都真的長得出來，而且不可能遲到的那兩種不會有倒數。
-- Run only against Supabase local. All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '4a000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'tasks-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '4a000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'tasks-officer@example.test', '', now(), '{}', '{}', now(), now());

-- No phone and no birth date: the profile reminder is about this member.
insert into public.people (id, canonical_name, primary_email, primary_phone, birth_date) values
  ('4b000000-0000-0000-0000-000000000001', '待辦社友', 'tasks-member@example.test', null, null),
  ('4b000000-0000-0000-0000-000000000002', '待辦社長', 'tasks-officer@example.test', '0900000000', '1970-01-01');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('4c000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-000000000001', '4b000000-0000-0000-0000-000000000001', 'tasks-member@example.test', '待辦社友', 'active'),
  ('4c000000-0000-0000-0000-000000000002', '4a000000-0000-0000-0000-000000000002', '4b000000-0000-0000-0000-000000000002', 'tasks-officer@example.test', '待辦社長', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('4d000000-0000-4000-8000-000000000001', 'TASKS', '待辦測試社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status, joined_on) values
  ('4e000000-0000-4000-8000-000000000001', '4d000000-0000-4000-8000-000000000001', '4b000000-0000-0000-0000-000000000001', 'active', current_date - 300),
  ('4e000000-0000-4000-8000-000000000002', '4d000000-0000-4000-8000-000000000001', '4b000000-0000-0000-0000-000000000002', 'active', current_date - 300);

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values
  ('4f000000-0000-4000-8000-000000000001', '4d000000-0000-4000-8000-000000000001', '4c000000-0000-0000-0000-000000000002', 'president', 'active', '4c000000-0000-0000-0000-000000000002');

-- 1) 活動報名未回覆
insert into public.club_events (
  id, club_id, event_type, title, starts_at, ends_at, registration_deadline,
  counts_for_attendance, event_status, created_by_app_account_id,
  updated_by_app_account_id, published_at
) values
  ('5a000000-0000-4000-8000-000000000001', '4d000000-0000-4000-8000-000000000001', 'regular_meeting', '待辦測試例會', now() + interval '5 days', now() + interval '5 days 2 hours', now() + interval '4 days', true, 'published', '4c000000-0000-0000-0000-000000000002', '4c000000-0000-0000-0000-000000000002', now());

-- 2) 社費未繳
insert into public.rotary_years (id, club_id, start_year, created_by_app_account_id) values
  ('5b000000-0000-4000-8000-000000000001', '4d000000-0000-4000-8000-000000000001', 2026, '4c000000-0000-0000-0000-000000000002');

insert into public.club_finance_receivables (
  id, club_id, rotary_year_id, membership_id, base_amount, source_kind, source_note,
  created_by_app_account_id
) values
  ('5c000000-0000-4000-8000-000000000001', '4d000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000001', '4e000000-0000-4000-8000-000000000001', 12000, 'manual', '待辦測試年費', '4c000000-0000-0000-0000-000000000002');

-- 3) 未讀的社內訊息
insert into public.club_messages (id, club_id, author_app_account_id, title, body) values
  ('5d000000-0000-4000-8000-000000000001', '4d000000-0000-4000-8000-000000000001', '4c000000-0000-0000-0000-000000000002', '待辦測試訊息', '內容');
insert into public.club_message_recipients (message_id, membership_id, club_id, read_at) values
  ('5d000000-0000-4000-8000-000000000001', '4e000000-0000-4000-8000-000000000001', '4d000000-0000-4000-8000-000000000001', null);

-- 4) 生日祝福待填寫
insert into public.birthday_wish_assignment_batches (
  id, club_id, birthday_year, birthday_month, batch_status, created_by_app_account_id
) values
  ('5e000000-0000-4000-8000-000000000001', '4d000000-0000-4000-8000-000000000001', 2026, 10, 'planned', '4c000000-0000-0000-0000-000000000002');

insert into public.birthday_wish_campaigns (
  id, club_id, recipient_membership_id, birthday_year, birthday_date, campaign_status
) values
  ('5f000000-0000-4000-8000-000000000001', '4d000000-0000-4000-8000-000000000001', '4e000000-0000-4000-8000-000000000002', 2026, (current_date + 20), 'collecting');

insert into public.birthday_wish_campaign_participants (
  id, club_id, campaign_id, assignment_batch_id, assignee_membership_id,
  question_bank_item_id, question_prompt_snapshot, participant_status
)
select
  '6a000000-0000-4000-8000-000000000001',
  '4d000000-0000-4000-8000-000000000001',
  '5f000000-0000-4000-8000-000000000001',
  '5e000000-0000-4000-8000-000000000001',
  '4e000000-0000-4000-8000-000000000001',
  item.id,
  '最想對壽星說的一句話？',
  'invited'
from public.birthday_wish_question_bank_items as item
where item.club_id is null
order by item.id
limit 1;

create table public.task_test_state (key text primary key, value jsonb not null);
grant select, insert on public.task_test_state to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '4a000000-0000-0000-0000-000000000001', true);
insert into public.task_test_state (key, value)
values ('home', public.get_my_member_home_projection('4d000000-0000-4000-8000-000000000001'));
reset role;

do $$
declare
  tasks jsonb;
  kinds text[];
begin
  select value -> 'pending_tasks' into tasks from public.task_test_state where key = 'home';
  select array_agg(entry ->> 'kind' order by entry ->> 'kind')
    into kinds
  from jsonb_array_elements(tasks) as entry;

  -- All four kinds reached the member, not just the one this column started
  -- life able to answer.
  if not (kinds @> array['event_response', 'dues_outstanding', 'birthday_wish', 'unread_messages', 'profile_incomplete']) then
    raise exception 'a pending task kind is missing: %', kinds;
  end if;

  -- The two that cannot be late carry no countdown at all. A borrowed one
  -- would let them say 「即將截止」 about something with no due date.
  if exists (
    select 1 from jsonb_array_elements(tasks) as entry
    where entry ->> 'kind' in ('dues_outstanding', 'profile_incomplete', 'unread_messages')
      and (entry -> 'deadline' <> 'null'::jsonb or entry -> 'hours_remaining' <> 'null'::jsonb)
  ) then
    raise exception 'a task with no due date was given a countdown: %', tasks;
  end if;

  -- The ones that do have a due date carry both halves.
  if exists (
    select 1 from jsonb_array_elements(tasks) as entry
    where entry ->> 'kind' in ('event_response', 'birthday_wish')
      and (entry -> 'deadline' = 'null'::jsonb or entry -> 'hours_remaining' = 'null'::jsonb)
  ) then
    raise exception 'a task with a due date lost its countdown: %', tasks;
  end if;

  -- Each row says where it goes, and every destination stays in this app.
  if exists (
    select 1 from jsonb_array_elements(tasks) as entry
    where entry ->> 'action_path' is null
       or left(entry ->> 'action_path', 1) <> '/'
       or left(entry ->> 'action_path', 2) = '//'
  ) then
    raise exception 'a task points somewhere other than this app: %', tasks;
  end if;

  -- The unread row counts rather than naming one message.
  if not (tasks @> '[{"kind": "unread_messages", "count": 1}]'::jsonb) then
    raise exception 'the unread reminder did not count: %', tasks;
  end if;

  -- The profile row names what is missing, and this member is missing both.
  if not (tasks @> '[{"kind": "profile_incomplete", "detail": "缺聯絡電話與生日"}]'::jsonb) then
    raise exception 'the profile reminder did not say what is missing: %', tasks;
  end if;
end;
$$;

-- A member who owes nothing gets none of them.
update public.people
set primary_phone = '0911111111', birth_date = '1980-05-05'
where id = '4b000000-0000-0000-0000-000000000001';
update public.club_message_recipients set read_at = now()
where membership_id = '4e000000-0000-4000-8000-000000000001';
-- Settled the way it is actually settled: a receipt allocated against it.
-- Finance records are append-only (club_finance_record_immutable), so deleting
-- the receivable is not a thing the product can do -- and a test that did it
-- would be proving something the application never does.
insert into public.club_finance_receipts (
  id, club_id, amount, received_on, payment_method, idempotency_key,
  recorded_by_app_account_id
) values (
  '6b000000-0000-4000-8000-000000000001', '4d000000-0000-4000-8000-000000000001',
  12000, current_date, 'bank_transfer', 'tasks-test-receipt',
  '4c000000-0000-0000-0000-000000000002'
);
insert into public.club_finance_receipt_allocations (
  club_id, receipt_id, receivable_id, amount
) values (
  '4d000000-0000-4000-8000-000000000001', '6b000000-0000-4000-8000-000000000001',
  '5c000000-0000-4000-8000-000000000001', 12000
);

-- The wish is answered by declining it, which is a state the product has.
update public.birthday_wish_campaign_participants
set participant_status = 'declined', responded_at = now()
where id = '6a000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '4a000000-0000-0000-0000-000000000001', true);
insert into public.task_test_state (key, value)
values ('settled', public.get_my_member_home_projection('4d000000-0000-4000-8000-000000000001'));
reset role;

do $$
declare
  tasks jsonb;
begin
  select value -> 'pending_tasks' into tasks from public.task_test_state where key = 'settled';
  -- Only the unanswered event is left. A reminder that stays after the thing
  -- is done is the fastest way to teach a member to ignore the column.
  if exists (
    select 1 from jsonb_array_elements(tasks) as entry
    where entry ->> 'kind' <> 'event_response'
  ) then
    raise exception 'a reminder survived the thing it was reminding about: %', tasks;
  end if;
end;
$$;

rollback;
