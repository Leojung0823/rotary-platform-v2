-- Birthday collection review, resubmission, question-bank and inbox-state
-- verification. Run against local Supabase only; every fixture is rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '16000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'birthday-review-member-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '16000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'birthday-review-manager@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '16000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'birthday-review-member-b@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '16000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'birthday-review-outsider@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email, birth_date) values
  ('26000000-0000-4000-8000-000000000001', '生日審核社員甲', 'birthday-review-member-a@example.test', '1980-01-02'),
  ('26000000-0000-4000-8000-000000000002', '生日審核幹部', 'birthday-review-manager@example.test', null),
  ('26000000-0000-4000-8000-000000000003', '生日審核社員乙', 'birthday-review-member-b@example.test', '1988-06-07'),
  ('26000000-0000-4000-8000-000000000004', '生日審核外社社員', 'birthday-review-outsider@example.test', '1990-03-04'),
  ('26000000-0000-4000-8000-000000000005', '生日審核壽星', null, '1975-08-20');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('36000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', 'birthday-review-member-a@example.test', '生日審核社員甲', 'active'),
  ('36000000-0000-4000-8000-000000000002', '16000000-0000-4000-8000-000000000002', '26000000-0000-4000-8000-000000000002', 'birthday-review-manager@example.test', '生日審核幹部', 'active'),
  ('36000000-0000-4000-8000-000000000003', '16000000-0000-4000-8000-000000000003', '26000000-0000-4000-8000-000000000003', 'birthday-review-member-b@example.test', '生日審核社員乙', 'active'),
  ('36000000-0000-4000-8000-000000000004', '16000000-0000-4000-8000-000000000004', '26000000-0000-4000-8000-000000000004', 'birthday-review-outsider@example.test', '生日審核外社社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('46000000-0000-4000-8000-000000000001', 'BDAY-REV-A', '生日審核甲社', 'active', now()),
  ('46000000-0000-4000-8000-000000000002', 'BDAY-REV-B', '生日審核乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status) values
  ('56000000-0000-4000-8000-000000000001', '46000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', 'active'),
  ('56000000-0000-4000-8000-000000000002', '46000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000003', 'active'),
  ('56000000-0000-4000-8000-000000000003', '46000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000005', 'active'),
  ('56000000-0000-4000-8000-000000000004', '46000000-0000-4000-8000-000000000002', '26000000-0000-4000-8000-000000000004', 'active');

insert into public.birthday_visibility_preferences (membership_id, club_id, is_listed, allow_wishes)
values ('56000000-0000-4000-8000-000000000003', '46000000-0000-4000-8000-000000000001', true, true);

-- Keep the manager as an operator-only actor. This avoids accidentally making
-- the test depend on a member-facing active-membership projection.
insert into public.club_operator_permissions (
  id, club_id, app_account_id, operator_role_key, permission_level,
  assignment_status, starts_at
) values (
  '66000000-0000-4000-8000-000000000001',
  '46000000-0000-4000-8000-000000000001',
  '36000000-0000-4000-8000-000000000002',
  'executive_secretary', 'club_manager', 'active', now() - interval '1 day'
);

-- Enable the collection review RPCs through the fixture flag. Migration 016
-- revokes browser-facing collection grants when the flag is disabled.
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000002', true);
insert into public.platform_feature_flags (
  feature_key, enabled, enabled_environments, rollout_percentage, updated_by
) values (
  'birthday_wishes_collection_v1', true, array['local']::text[], 100,
  '36000000-0000-4000-8000-000000000002'
)
on conflict (feature_key) do update
set enabled = excluded.enabled,
    enabled_environments = excluded.enabled_environments,
    rollout_percentage = excluded.rollout_percentage;

do $$
declare
  platform_question_id uuid;
begin
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.birthday_wish_submission_events'::regclass)
     or has_table_privilege('authenticated', 'public.birthday_wish_submission_events', 'SELECT')
     or has_table_privilege('authenticated', 'public.birthday_wish_campaign_submissions', 'INSERT') then
    raise exception 'birthday review tables are not closed to browser roles';
  end if;

  if has_function_privilege('authenticated', 'public.append_birthday_wish_submission_event(uuid,uuid,uuid,text,text,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.hide_birthday_wish_submission(uuid,uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.hide_birthday_wish_submission(uuid,uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.decline_birthday_wish_assignment(uuid,uuid)', 'EXECUTE') then
    raise exception 'birthday review RPC grant boundary is incorrect';
  end if;

  select id into platform_question_id
  from public.birthday_wish_question_bank_items
  where club_id is null
  order by sort_order
  limit 1;

  if platform_question_id is null then
    raise exception 'platform question bank is empty';
  end if;

  begin
    update public.birthday_wish_question_bank_items
    set prompt = '不應修改平台題目'
    where id = platform_question_id;
    raise exception 'platform question was mutable';
  exception when check_violation then null;
  end;
end $$;

-- An ordinary member cannot administer the question bank or invoke the
-- internal event writer.
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000001', true);
do $$
begin
  begin
    perform public.create_birthday_wish_question(
      '46000000-0000-4000-8000-000000000001',
      'member_q_forbidden', '社員不應建立題目', 'warm', 900
    );
    raise exception 'ordinary member created a club question';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.append_birthday_wish_submission_event(
      '46000000-0000-4000-8000-000000000001',
      gen_random_uuid(), null, 'submitted', null, 'submitted', '不應寫入'
    );
    raise exception 'ordinary member invoked the internal event writer';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

create temporary table birthday_review_ids (
  batch_id uuid not null,
  campaign_id uuid not null,
  question_a_id uuid not null,
  question_b_id uuid not null,
  participant_a_id uuid not null,
  participant_b_id uuid not null
);
grant select, insert, update on birthday_review_ids to authenticated;

-- The manager can create and maintain club questions, but platform questions
-- remain immutable and the assignment receives a question snapshot.
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000002', true);
do $$
declare
  batch_id uuid;
  campaign_id uuid;
  question_a_id uuid;
  question_b_id uuid;
  participant_a_id uuid;
  participant_b_id uuid;
begin
  batch_id := public.create_birthday_wish_assignment_batch(
    '46000000-0000-4000-8000-000000000001', 2026, 8
  );
  campaign_id := public.create_birthday_wish_campaign(
    '46000000-0000-4000-8000-000000000001',
    '56000000-0000-4000-8000-000000000003',
    2026, date '2026-08-20', batch_id
  );
  question_a_id := public.create_birthday_wish_question(
    '46000000-0000-4000-8000-000000000001',
    'review_q_a', '請寫一句給壽星的溫暖話。', 'warm', 10
  );
  question_b_id := public.create_birthday_wish_question(
    '46000000-0000-4000-8000-000000000001',
    'review_q_b', '壽星哪個小習慣最可愛？', 'humorous', 11
  );
  participant_a_id := public.assign_birthday_wish_participant(
    '46000000-0000-4000-8000-000000000001', batch_id, campaign_id,
    '56000000-0000-4000-8000-000000000001', question_a_id
  );
  participant_b_id := public.assign_birthday_wish_participant(
    '46000000-0000-4000-8000-000000000001', batch_id, campaign_id,
    '56000000-0000-4000-8000-000000000002', question_b_id
  );
  perform public.update_birthday_wish_question(
    '46000000-0000-4000-8000-000000000001', question_a_id,
    '請寫一句給壽星的溫暖話（已更新）。', 'moving', 12, true
  );
  insert into birthday_review_ids values (
    batch_id, campaign_id, question_a_id, question_b_id,
    participant_a_id, participant_b_id
  );
end $$;
reset role;

do $$
declare
  ids record;
  snapshot text;
begin
  select * into ids from birthday_review_ids limit 1;
  select question_prompt_snapshot into snapshot
  from public.birthday_wish_campaign_participants
  where id = ids.participant_a_id;
  if snapshot <> '請寫一句給壽星的溫暖話。' then
    raise exception 'assigned question did not preserve the original prompt snapshot';
  end if;
end $$;

-- Link one inbox row to each automatic assignment. The status must be scoped
-- to the receiving member, not copied from another member's assignment.
insert into public.club_messages (
  id, club_id, author_app_account_id, title, body, audience_kind, action_path
) values (
  '76000000-0000-4000-8000-000000000001',
  '46000000-0000-4000-8000-000000000001',
  '36000000-0000-4000-8000-000000000002',
  '生日任務狀態測試', '請完成生日祝福。', 'members',
  '/birthday-collection?clubId=46000000-0000-4000-8000-000000000001'
);
insert into public.club_message_recipients (
  message_id, membership_id, club_id, birthday_participant_id
)
select '76000000-0000-4000-8000-000000000001', membership_id,
  '46000000-0000-4000-8000-000000000001', participant_id
from (values
  ('56000000-0000-4000-8000-000000000001'::uuid, (select participant_a_id from birthday_review_ids)),
  ('56000000-0000-4000-8000-000000000002'::uuid, (select participant_b_id from birthday_review_ids))
) as assignments(membership_id, participant_id);

set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000001', true);
do $$
declare
  inbox jsonb;
begin
  inbox := public.list_my_club_messages('46000000-0000-4000-8000-000000000001');
  if inbox->'messages'->0->>'action_status' <> 'pending' then
    raise exception 'new birthday inbox task was not pending: %', inbox;
  end if;
end $$;
reset role;

-- Member A submits and can edit while waiting. The message changes to done
-- only after an officer publishes it.
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000001', true);
do $$
declare
  ids record;
  page jsonb;
begin
  select * into ids from birthday_review_ids limit 1;
  perform public.save_birthday_wish_submission(
    '46000000-0000-4000-8000-000000000001', ids.participant_a_id,
    '第一版祝福：生日快樂！'
  );
  perform public.save_birthday_wish_submission(
    '46000000-0000-4000-8000-000000000001', ids.participant_a_id,
    '修改後祝福：願新的一歲每天都有好消息。'
  );
  page := public.get_my_birthday_wish_collection_page('46000000-0000-4000-8000-000000000001');
  if page->'my_assignments'->0->>'content' <> '修改後祝福：願新的一歲每天都有好消息。'
     or page->'my_assignments'->0->>'can_decline' <> 'false' then
    raise exception 'member submit/edit projection is incorrect: %', page;
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000002', true);
do $$
declare
  ids record;
begin
  select * into ids from birthday_review_ids limit 1;
  perform public.publish_birthday_wish_submission(
    '46000000-0000-4000-8000-000000000001', ids.participant_a_id
  );
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000001', true);
do $$
declare
  inbox jsonb;
begin
  inbox := public.list_my_club_messages('46000000-0000-4000-8000-000000000001');
  if inbox->'messages'->0->>'action_status' <> 'completed' then
    raise exception 'published birthday inbox task was not completed: %', inbox;
  end if;
end $$;
reset role;

-- Hiding is a reversible workflow state, not a destructive edit. The old
-- revision is retained, members cannot edit it, and its public projection is
-- removed before a fresh revision is submitted.
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000002', true);
do $$
declare
  ids record;
  public_projection jsonb;
begin
  select * into ids from birthday_review_ids limit 1;
  perform public.hide_birthday_wish_submission(
    '46000000-0000-4000-8000-000000000001', ids.participant_a_id
  );
  public_projection := public.list_published_birthday_wish_submissions(
    '46000000-0000-4000-8000-000000000001'
  );
  if jsonb_array_length(public_projection) <> 0 then
    raise exception 'hidden blessing remained in public projection: %', public_projection;
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000001', true);
do $$
declare
  ids record;
  page jsonb;
  inbox jsonb;
begin
  select * into ids from birthday_review_ids limit 1;
  page := public.get_my_birthday_wish_collection_page('46000000-0000-4000-8000-000000000001');
  inbox := public.list_my_club_messages('46000000-0000-4000-8000-000000000001');
  if page->'my_assignments'->0->>'submission_status' <> 'hidden'
     or page->'my_assignments'->0->>'can_edit' <> 'true'
     or page->'my_assignments'->0->>'content' is not null
     or inbox->'messages'->0->>'action_status' <> 'needs_resubmission' then
    raise exception 'hidden blessing was not projected as resubmission: % / %', page, inbox;
  end if;

  perform public.save_birthday_wish_submission(
    '46000000-0000-4000-8000-000000000001', ids.participant_a_id,
    '第二版祝福：謝謝你讓社團一直有笑聲。'
  );
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000002', true);
do $$
declare
  ids record;
  page jsonb;
  participant_projection jsonb;
begin
  select * into ids from birthday_review_ids limit 1;
  perform public.publish_birthday_wish_submission(
    '46000000-0000-4000-8000-000000000001', ids.participant_a_id
  );
  page := public.get_my_birthday_wish_collection_page('46000000-0000-4000-8000-000000000001');
  select item into participant_projection
  from jsonb_array_elements(page->'participants') as item
  where item->>'participant_id' = ids.participant_a_id::text;
  if participant_projection is null
     or jsonb_array_length(participant_projection->'processing_history') <> 6
     or participant_projection->>'submission_status' <> 'published'
     or participant_projection->>'content' <> '第二版祝福：謝謝你讓社團一直有笑聲。' then
    raise exception 'resubmission or officer history is incomplete: %', page;
  end if;
end $$;
reset role;

-- Member B declines, keeping the one-assignment quota consumed. Their inbox
-- says declined and a later submission is rejected.
set local role authenticated;
select set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000003', true);
do $$
declare
  ids record;
  page jsonb;
  inbox jsonb;
begin
  select * into ids from birthday_review_ids limit 1;
  perform public.decline_birthday_wish_assignment(
    '46000000-0000-4000-8000-000000000001', ids.participant_b_id
  );
  page := public.get_my_birthday_wish_collection_page('46000000-0000-4000-8000-000000000001');
  inbox := public.list_my_club_messages('46000000-0000-4000-8000-000000000001');
  if inbox->'messages'->0->>'action_status' <> 'declined'
     or page->'my_assignments'->0->>'participant_status' <> 'declined'
     or page->'my_assignments'->0->>'can_decline' <> 'false' then
    raise exception 'declined assignment was not recorded: % / %', page, inbox;
  end if;

  begin
    perform public.save_birthday_wish_submission(
      '46000000-0000-4000-8000-000000000001', ids.participant_b_id,
      '婉拒後不應再提交'
    );
    raise exception 'declined member submitted a birthday blessing';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Even the database owner cannot rewrite a hidden revision or its append-only
-- event. This protects the audit trail independently of browser privileges.
do $$
declare
  ids record;
  hidden_id uuid;
  event_id uuid;
begin
  select * into ids from birthday_review_ids limit 1;
  if (select count(*) from public.birthday_wish_campaign_submissions where participant_id = ids.participant_a_id) <> 2
     or (select count(*) from public.birthday_wish_submission_events where participant_id = ids.participant_a_id and event_type = 'hidden') <> 1
     or (select count(*) from public.birthday_wish_submission_events where participant_id = ids.participant_a_id and event_type = 'resubmitted') <> 1
     or (select count(*) from public.birthday_wish_submission_events where participant_id = ids.participant_b_id and event_type = 'declined') <> 1 then
    raise exception 'revision or processing history counts are incorrect';
  end if;
  select id into hidden_id
  from public.birthday_wish_campaign_submissions
  where participant_id = ids.participant_a_id and submission_status = 'hidden';
  begin
    update public.birthday_wish_campaign_submissions
    set content = '不應覆寫歷史版本'
    where id = hidden_id;
    raise exception 'hidden revision was mutable';
  exception when check_violation then null;
  end;

  select id into event_id
  from public.birthday_wish_submission_events
  where participant_id = ids.participant_a_id
  order by created_at desc, id desc
  limit 1;
  begin
    update public.birthday_wish_submission_events
    set content_snapshot = '不應覆寫事件'
    where id = event_id;
    raise exception 'submission history event was mutable';
  exception when sqlstate '55000' then null;
  end;
end $$;

rollback;
