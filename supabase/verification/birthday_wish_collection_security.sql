-- Birthday wish collection data, tenant and workflow verification.
-- Run against local Supabase only. Every fixture is rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '13000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'birthday-collection-author@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '13000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'birthday-collection-recipient@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '13000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'birthday-collection-outsider@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '13000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'birthday-collection-manager@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '13000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'birthday-collection-assignee@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email, birth_date) values
  ('23000000-0000-4000-8000-000000000001', '徵集作者', 'birthday-collection-author@example.test', '1980-01-02'),
  ('23000000-0000-4000-8000-000000000002', '徵集壽星', 'birthday-collection-recipient@example.test', '1975-08-20'),
  ('23000000-0000-4000-8000-000000000003', '徵集外社社員', 'birthday-collection-outsider@example.test', '1990-03-04'),
  ('23000000-0000-4000-8000-000000000004', '徵集管理者', 'birthday-collection-manager@example.test', null),
  ('23000000-0000-4000-8000-000000000005', '徵集第二位社員', 'birthday-collection-assignee@example.test', '1988-06-07');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('33000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', 'birthday-collection-author@example.test', '徵集作者', 'active'),
  ('33000000-0000-4000-8000-000000000002', '13000000-0000-4000-8000-000000000002', '23000000-0000-4000-8000-000000000002', 'birthday-collection-recipient@example.test', '徵集壽星', 'active'),
  ('33000000-0000-4000-8000-000000000003', '13000000-0000-4000-8000-000000000003', '23000000-0000-4000-8000-000000000003', 'birthday-collection-outsider@example.test', '徵集外社社員', 'active'),
  ('33000000-0000-4000-8000-000000000004', '13000000-0000-4000-8000-000000000004', '23000000-0000-4000-8000-000000000004', 'birthday-collection-manager@example.test', '徵集管理者', 'active'),
  ('33000000-0000-4000-8000-000000000005', '13000000-0000-4000-8000-000000000005', '23000000-0000-4000-8000-000000000005', 'birthday-collection-assignee@example.test', '徵集第二位社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('43000000-0000-4000-8000-000000000001', 'BDAY-COL-A', '生日徵集甲社', 'active', now()),
  ('43000000-0000-4000-8000-000000000002', 'BDAY-COL-B', '生日徵集乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status) values
  ('53000000-0000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', 'active'),
  ('53000000-0000-4000-8000-000000000002', '43000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000002', 'active'),
  ('53000000-0000-4000-8000-000000000003', '43000000-0000-4000-8000-000000000002', '23000000-0000-4000-8000-000000000003', 'active'),
  ('53000000-0000-4000-8000-000000000004', '43000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000005', 'active');

insert into public.birthday_visibility_preferences (membership_id, club_id, is_listed, allow_wishes)
values ('53000000-0000-4000-8000-000000000002', '43000000-0000-4000-8000-000000000001', true, true);

insert into public.club_operator_permissions (
  id, club_id, app_account_id, operator_role_key, permission_level, assignment_status, starts_at
) values (
  '63000000-0000-4000-8000-000000000001',
  '43000000-0000-4000-8000-000000000001',
  '33000000-0000-4000-8000-000000000004',
  'executive_secretary', 'club_manager', 'active', now() - interval '1 day'
);

do $$
begin
  if (select count(*) from public.birthday_wish_question_bank_items where club_id is null) <> 100 then
    raise exception 'platform birthday question bank is not 100 questions';
  end if;

  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.birthday_wish_question_bank_items'::regclass)
     or not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.birthday_wish_assignment_batches'::regclass)
     or not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.birthday_wish_campaigns'::regclass)
     or not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.birthday_wish_campaign_participants'::regclass)
     or not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.birthday_wish_campaign_submissions'::regclass) then
    raise exception 'birthday collection RLS missing';
  end if;

  if has_table_privilege('authenticated', 'public.birthday_wish_question_bank_items', 'SELECT')
     or has_table_privilege('authenticated', 'public.birthday_wish_campaigns', 'SELECT')
     or has_table_privilege('authenticated', 'public.birthday_wish_campaign_submissions', 'INSERT') then
    raise exception 'authenticated role gained direct birthday collection table access';
  end if;

  if has_function_privilege('anon', 'public.list_birthday_wish_question_bank(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.save_birthday_wish_submission(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'anonymous role gained birthday collection RPC access';
  end if;

  if not has_function_privilege('authenticated', 'public.get_my_birthday_wish_collection_page(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.save_birthday_wish_submission(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'authenticated birthday collection RPC grant missing';
  end if;
end $$;

-- A member cannot manage the bank or create batches.
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);
do $$
begin
  begin
    perform public.list_birthday_wish_question_bank('43000000-0000-4000-8000-000000000001');
    raise exception 'member listed officer question bank';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.create_birthday_wish_assignment_batch(
      '43000000-0000-4000-8000-000000000001', 2026, 8
    );
    raise exception 'member created birthday assignment batch';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- An officer can create the batch and campaign, and retries return the same ids.
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000004', true);
create temporary table birthday_collection_test_ids (
  batch_id uuid not null,
  campaign_id uuid not null,
  participant_id uuid,
  question_id uuid not null,
  first_question_id uuid not null
);
grant select, insert, update on birthday_collection_test_ids to authenticated;
do $$
declare
  batch_id uuid;
  retry_batch_id uuid;
  campaign_id uuid;
  retry_campaign_id uuid;
  first_question_id uuid;
  question_id uuid;
begin
  batch_id := public.create_birthday_wish_assignment_batch(
    '43000000-0000-4000-8000-000000000001', 2026, 8
  );
  retry_batch_id := public.create_birthday_wish_assignment_batch(
    '43000000-0000-4000-8000-000000000001', 2026, 8
  );
  if batch_id <> retry_batch_id then
    raise exception 'birthday batch retry was not idempotent';
  end if;

  campaign_id := public.create_birthday_wish_campaign(
    '43000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-000000000002',
    2026, date '2026-08-20', batch_id
  );
  retry_campaign_id := public.create_birthday_wish_campaign(
    '43000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-000000000002',
    2026, date '2026-08-20', batch_id
  );
  if campaign_id <> retry_campaign_id then
    raise exception 'birthday campaign retry was not idempotent';
  end if;

  question_id := public.create_birthday_wish_question(
    '43000000-0000-4000-8000-000000000001',
    'club_q_test',
    '壽星哪一個小習慣最讓你會心一笑？',
    'humorous',
    10
  );
  first_question_id := public.create_birthday_wish_question(
    '43000000-0000-4000-8000-000000000001',
    'club_q_first',
    '壽星哪一個成就最值得我們一起鼓掌？',
    'warm',
    11
  );

  insert into birthday_collection_test_ids (
    batch_id, campaign_id, question_id, first_question_id
  ) values (batch_id, campaign_id, question_id, first_question_id);
end $$;
reset role;

-- The first automatic assignment gets a prompt snapshot. Replaying it returns
-- the same participant, while a different question for the same member fails.
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000004', true);
do $$
declare
  ids record;
  assigned_participant_id uuid;
  retry_participant_id uuid;
begin
  select * into ids from birthday_collection_test_ids limit 1;
  assigned_participant_id := public.assign_birthday_wish_participant(
    '43000000-0000-4000-8000-000000000001', ids.batch_id, ids.campaign_id,
    '53000000-0000-4000-8000-000000000001', ids.first_question_id
  );
  retry_participant_id := public.assign_birthday_wish_participant(
    '43000000-0000-4000-8000-000000000001', ids.batch_id, ids.campaign_id,
    '53000000-0000-4000-8000-000000000001', ids.first_question_id
  );
  if assigned_participant_id <> retry_participant_id then
    raise exception 'birthday participant retry was not idempotent';
  end if;

  update birthday_collection_test_ids as ids
  set participant_id = assigned_participant_id;

  begin
    perform public.assign_birthday_wish_participant(
      '43000000-0000-4000-8000-000000000001', ids.batch_id, ids.campaign_id,
      '53000000-0000-4000-8000-000000000004', ids.first_question_id
    );
    raise exception 'same question was assigned twice in a batch';
  exception when unique_violation then null;
  end;

  begin
    perform public.assign_birthday_wish_participant(
      '43000000-0000-4000-8000-000000000001', ids.batch_id, ids.campaign_id,
      '53000000-0000-4000-8000-000000000002', ids.first_question_id
    );
    raise exception 'birthday recipient was assigned a blessing task';
  exception when check_violation or invalid_parameter_value then null;
  end;
end $$;
reset role;

-- Use the club question for the second member, then change the bank item. The
-- invitation must retain the original text snapshot.
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000004', true);
do $$
declare
  ids record;
  assigned_participant_id uuid;
  page jsonb;
begin
  select * into ids from birthday_collection_test_ids limit 1;
  assigned_participant_id := public.assign_birthday_wish_participant(
    '43000000-0000-4000-8000-000000000001', ids.batch_id, ids.campaign_id,
    '53000000-0000-4000-8000-000000000004', ids.question_id
  );
  perform public.update_birthday_wish_question(
    '43000000-0000-4000-8000-000000000001', ids.question_id,
    '修改後題目不應影響已派出的邀請', 'warm', 20, true
  );
  page := public.get_my_birthday_wish_collection_page('43000000-0000-4000-8000-000000000001');
  if not exists (
    select 1
    from jsonb_array_elements(page->'participants') as item
    where item->>'participant_id' = assigned_participant_id::text
      and item->>'question_prompt' = '壽星哪一個小習慣最讓你會心一笑？'
  ) then
    raise exception 'birthday prompt snapshot was not preserved';
  end if;
end $$;
reset role;

-- The assignee can submit, edit and delete before publication. The officer
-- projection includes the author; the member projection never includes it.
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);
do $$
declare
  ids record;
  page jsonb;
  submission_id uuid;
begin
  select * into ids from birthday_collection_test_ids limit 1;
  submission_id := public.save_birthday_wish_submission(
    '43000000-0000-4000-8000-000000000001', ids.participant_id,
    '這是一段溫暖的生日祝福。'
  );
  perform public.save_birthday_wish_submission(
    '43000000-0000-4000-8000-000000000001', ids.participant_id,
    '修改後的生日祝福。'
  );
  page := public.get_my_birthday_wish_collection_page('43000000-0000-4000-8000-000000000001');
  if page->'my_assignments'->0->>'submission_id' <> submission_id::text
     or page->'my_assignments'->0->>'content' <> '修改後的生日祝福。'
     or page->'participants' <> '[]'::jsonb then
    raise exception 'member birthday collection projection failed: %', page;
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000004', true);
do $$
declare
  page jsonb := public.get_my_birthday_wish_collection_page('43000000-0000-4000-8000-000000000001');
begin
  if not (page->>'can_manage')::boolean
     or not exists (
       select 1 from jsonb_array_elements(page->'participants') as item
       where item->>'author_name' = '徵集作者'
     ) then
    raise exception 'officer birthday collection projection failed: %', page;
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000001', true);
do $$
declare
  ids record;
begin
  select * into ids from birthday_collection_test_ids limit 1;
  perform public.delete_own_birthday_wish_submission(
    '43000000-0000-4000-8000-000000000001', ids.participant_id
  );
end $$;
reset role;

-- A member from another club cannot read the collection or submit into it.
set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-000000000003', true);
do $$
begin
  begin
    perform public.get_my_birthday_wish_collection_page('43000000-0000-4000-8000-000000000001');
    raise exception 'cross-club birthday collection read accepted';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.save_birthday_wish_submission(
      '43000000-0000-4000-8000-000000000001',
      (select participant_id from birthday_collection_test_ids limit 1),
      '跨社團不應成功'
    );
    raise exception 'cross-club birthday collection write accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

rollback;
