-- Birthday wish monthly assignment runner verification.
-- Run against local Supabase only. Every fixture is rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '14000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'birthday-runner-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '14000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'birthday-runner-recipient@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '14000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'birthday-runner-outsider@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '14000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'birthday-runner-manager@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '14000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'birthday-runner-second-member@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email, birth_date) values
  ('24000000-0000-4000-8000-000000000001', '派發社員', 'birthday-runner-member@example.test', '1980-01-02'),
  ('24000000-0000-4000-8000-000000000002', '派發壽星', 'birthday-runner-recipient@example.test', '1975-08-20'),
  ('24000000-0000-4000-8000-000000000003', '派發外社社員', 'birthday-runner-outsider@example.test', '1990-03-04'),
  ('24000000-0000-4000-8000-000000000004', '派發管理者', 'birthday-runner-manager@example.test', null),
  ('24000000-0000-4000-8000-000000000005', '派發第二位社員', 'birthday-runner-second-member@example.test', '1988-06-07');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('34000000-0000-4000-8000-000000000001', '14000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000001', 'birthday-runner-member@example.test', '派發社員', 'active'),
  ('34000000-0000-4000-8000-000000000002', '14000000-0000-4000-8000-000000000002', '24000000-0000-4000-8000-000000000002', 'birthday-runner-recipient@example.test', '派發壽星', 'active'),
  ('34000000-0000-4000-8000-000000000003', '14000000-0000-4000-8000-000000000003', '24000000-0000-4000-8000-000000000003', 'birthday-runner-outsider@example.test', '派發外社社員', 'active'),
  ('34000000-0000-4000-8000-000000000004', '14000000-0000-4000-8000-000000000004', '24000000-0000-4000-8000-000000000004', 'birthday-runner-manager@example.test', '派發管理者', 'active'),
  ('34000000-0000-4000-8000-000000000005', '14000000-0000-4000-8000-000000000005', '24000000-0000-4000-8000-000000000005', 'birthday-runner-second-member@example.test', '派發第二位社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at)
values
  ('44000000-0000-4000-8000-000000000001', 'BDAY-RUN-A', '生日派發甲社', 'active', now()),
  ('44000000-0000-4000-8000-000000000002', 'BDAY-RUN-B', '生日派發乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status)
values
  ('54000000-0000-4000-8000-000000000001', '44000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000001', 'active'),
  ('54000000-0000-4000-8000-000000000002', '44000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000002', 'active'),
  ('54000000-0000-4000-8000-000000000003', '44000000-0000-4000-8000-000000000002', '24000000-0000-4000-8000-000000000003', 'active'),
  ('54000000-0000-4000-8000-000000000004', '44000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000005', 'active');

insert into public.birthday_visibility_preferences (membership_id, club_id, is_listed, allow_wishes)
values ('54000000-0000-4000-8000-000000000002', '44000000-0000-4000-8000-000000000001', true, true);

insert into public.club_operator_permissions (
  id, club_id, app_account_id, operator_role_key, permission_level, assignment_status, starts_at
) values (
  '64000000-0000-4000-8000-000000000001',
  '44000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000004',
  'executive_secretary', 'club_manager', 'active', now() - interval '1 day'
);

-- Enable the collection runner RPCs through the fixture flag. Migration 016
-- revokes browser-facing collection grants when the flag is disabled.
select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000004', true);
insert into public.platform_feature_flags (
  feature_key, enabled, enabled_environments, rollout_percentage, updated_by
) values (
  'birthday_wishes_collection_v1', true, array['local']::text[], 100,
  '34000000-0000-4000-8000-000000000004'
)
on conflict (feature_key) do update
set enabled = excluded.enabled,
    enabled_environments = excluded.enabled_environments,
    rollout_percentage = excluded.rollout_percentage;

do $$
begin
  if (select count(*) from public.birthday_wish_question_bank_items where club_id is null) <> 100 then
    raise exception 'runner requires the 100-question platform bank';
  end if;
  if has_function_privilege('anon', 'public.generate_birthday_wish_collection_month(uuid,integer,integer)', 'EXECUTE') then
    raise exception 'anonymous role gained runner RPC access';
  end if;
end $$;

-- A normal member cannot create or rerun a monthly batch.
set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000001', true);
do $$
begin
  begin
    perform public.generate_birthday_wish_collection_month(
      '44000000-0000-4000-8000-000000000001', 2026, 8
    );
    raise exception 'ordinary member ran birthday assignment runner';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- A shortage is recoverable after the manager adds another prompt. The
-- platform question bank is intentionally immutable, so create enough
-- temporary members in the second club to exhaust its 100 prompts, then add
-- one club question through the manager RPC. The first attempt creates no
-- campaigns; the retry reuses the same batch and creates a complete, unique
-- assignment set.
update public.people
set birth_date = '1988-09-02'
where id = '24000000-0000-4000-8000-000000000003';
insert into public.birthday_visibility_preferences (
  membership_id, club_id, is_listed, allow_wishes
) values (
  '54000000-0000-4000-8000-000000000003',
  '44000000-0000-4000-8000-000000000002',
  true,
  true
);

insert into public.club_operator_permissions (
  id, club_id, app_account_id, operator_role_key, permission_level, assignment_status, starts_at
) values (
  '64000000-0000-4000-8000-000000000002',
  '44000000-0000-4000-8000-000000000002',
  '34000000-0000-4000-8000-000000000004',
  'executive_secretary', 'club_manager', 'active', now() - interval '1 day'
);

create temporary table birthday_runner_extra_members (
  sequence_no integer primary key,
  auth_user_id uuid not null,
  person_id uuid not null,
  app_account_id uuid not null,
  membership_id uuid not null
) on commit drop;

insert into birthday_runner_extra_members (
  sequence_no, auth_user_id, person_id, app_account_id, membership_id
)
select
  sequence_no,
  extensions.gen_random_uuid(),
  extensions.gen_random_uuid(),
  extensions.gen_random_uuid(),
  extensions.gen_random_uuid()
from generate_series(1, 101) as item(sequence_no);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000',
  extra.auth_user_id,
  'authenticated',
  'authenticated',
  format('birthday-runner-extra-%s@example.test', lpad(extra.sequence_no::text, 3, '0')),
  '',
  now(),
  '{}',
  '{}',
  now(),
  now()
from birthday_runner_extra_members as extra;

insert into public.people (id, canonical_name, primary_email)
select
  extra.person_id,
  format('派發臨時社員 %s', lpad(extra.sequence_no::text, 3, '0')),
  format('birthday-runner-extra-%s@example.test', lpad(extra.sequence_no::text, 3, '0'))
from birthday_runner_extra_members as extra;

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
)
select
  extra.app_account_id,
  extra.auth_user_id,
  extra.person_id,
  format('birthday-runner-extra-%s@example.test', lpad(extra.sequence_no::text, 3, '0')),
  format('派發臨時社員 %s', lpad(extra.sequence_no::text, 3, '0')),
  'active'
from birthday_runner_extra_members as extra;

insert into public.club_memberships (
  id, club_id, person_id, membership_status
)
select
  extra.membership_id,
  '44000000-0000-4000-8000-000000000002',
  extra.person_id,
  'active'
from birthday_runner_extra_members as extra;

set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000004', true);
do $$
declare
  failed_result jsonb;
begin
  failed_result := public.generate_birthday_wish_collection_month(
    '44000000-0000-4000-8000-000000000002', 2026, 9
  );
  if failed_result->>'batch_status' <> 'failed'
     or failed_result->>'failure_reason' <> 'birthday_question_bank_exhausted'
     or (failed_result->>'campaign_count')::integer <> 0
     or (failed_result->>'participant_count')::integer <> 0 then
    raise exception 'question shortage did not stop the batch cleanly: %', failed_result;
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000004', true);
select public.create_birthday_wish_question(
  '44000000-0000-4000-8000-000000000002',
  'birthday_retry_001',
  '補題後，哪一個小祝福最適合送給壽星？',
  'warm',
  101
);
do $$
declare
  retry_result jsonb;
begin
  retry_result := public.generate_birthday_wish_collection_month(
    '44000000-0000-4000-8000-000000000002', 2026, 9
  );
  if retry_result->>'batch_status' <> 'completed'
     or (retry_result->>'campaign_count')::integer <> 1
     or (retry_result->>'participant_count')::integer <> 101 then
    raise exception 'question shortage retry did not complete: %', retry_result;
  end if;
end $$;
reset role;

-- The temporary members were only needed to exhaust the immutable platform
-- bank. End them before the ordinary August projection checks below.
update public.club_memberships
set membership_status = 'ended',
    ended_on = current_date
where id in (select membership_id from birthday_runner_extra_members);

-- The manager creates one August campaign and gives each eligible member at
-- most one task. The birthday member is never assigned to their own campaign.
set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000004', true);
do $$
declare
  first_result jsonb;
  retry_result jsonb;
  manager_page jsonb;
begin
  first_result := public.generate_birthday_wish_collection_month(
    '44000000-0000-4000-8000-000000000001', 2026, 8
  );
  retry_result := public.generate_birthday_wish_collection_month(
    '44000000-0000-4000-8000-000000000001', 2026, 8
  );

  if first_result->>'batch_status' <> 'completed'
     or (first_result->>'campaign_count')::integer <> 1
     or (first_result->>'participant_count')::integer <> 2
     or (first_result->>'skipped_assignee_count')::integer <> 1
     or retry_result->>'batch_id' <> first_result->>'batch_id'
     or retry_result->>'participant_count' <> first_result->>'participant_count' then
    raise exception 'birthday runner result was not completed/idempotent: % / %', first_result, retry_result;
  end if;

  manager_page := public.get_my_birthday_wish_collection_page(
    '44000000-0000-4000-8000-000000000001'
  );
  if jsonb_array_length(manager_page->'campaigns') <> 1
     or jsonb_array_length(manager_page->'participants') <> 2
     or exists (
       select 1
       from jsonb_array_elements(manager_page->'participants') as item
       where item->>'assignee_membership_id' = '54000000-0000-4000-8000-000000000002'
     ) then
    raise exception 'birthday runner assigned the birthday member or returned the wrong projection: %', manager_page;
  end if;
end $$;
reset role;

-- A member sees exactly their own assignment and no officer participant list.
set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000001', true);
do $$
declare
  member_page jsonb;
begin
  member_page := public.get_my_birthday_wish_collection_page(
    '44000000-0000-4000-8000-000000000001'
  );
  if jsonb_array_length(member_page->'my_assignments') <> 1
     or jsonb_array_length(member_page->'participants') <> 0
     or jsonb_array_length(member_page->'campaigns') <> 0 then
    raise exception 'birthday runner member projection leaked management data: %', member_page;
  end if;
end $$;
reset role;

-- A member of another club cannot run or read this club's batch.
set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000003', true);
do $$
begin
  begin
    perform public.generate_birthday_wish_collection_month(
      '44000000-0000-4000-8000-000000000001', 2026, 8
    );
    raise exception 'cross-club member ran birthday assignment runner';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.get_my_birthday_wish_collection_page(
      '44000000-0000-4000-8000-000000000001'
    );
    raise exception 'cross-club member read birthday collection';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Assertions over protected tables are deliberately made after reset role.
do $$
declare
  batch_id uuid;
begin
  select id into batch_id
  from public.birthday_wish_assignment_batches
  where club_id = '44000000-0000-4000-8000-000000000001'
    and birthday_year = 2026
    and birthday_month = 8;

  if (select count(*) from public.birthday_wish_campaign_participants where assignment_batch_id = batch_id) <> 2
     or (select count(distinct assignee_membership_id) from public.birthday_wish_campaign_participants where assignment_batch_id = batch_id) <> 2
     or (select count(distinct question_bank_item_id) from public.birthday_wish_campaign_participants where assignment_batch_id = batch_id) <> 2 then
    raise exception 'birthday runner uniqueness constraints did not hold';
  end if;
end $$;

rollback;
