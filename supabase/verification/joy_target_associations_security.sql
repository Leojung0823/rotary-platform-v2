-- Target associations preserve the post's visibility policy and never widen it.
-- This verification is local-only; all synthetic rows are rolled back.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '99000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'joy-target-author@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '99000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'joy-target-reader@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '99000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'joy-target-outsider@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('99100000-0000-4000-8000-000000000001', '關聯貼文作者', 'joy-target-author@example.test'),
  ('99100000-0000-4000-8000-000000000002', '關聯貼文社員', 'joy-target-reader@example.test'),
  ('99100000-0000-4000-8000-000000000003', '外社關聯社員', 'joy-target-outsider@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('99200000-0000-4000-8000-000000000001', '99000000-0000-4000-8000-000000000001', '99100000-0000-4000-8000-000000000001', 'joy-target-author@example.test', '關聯貼文作者', 'active'),
  ('99200000-0000-4000-8000-000000000002', '99000000-0000-4000-8000-000000000002', '99100000-0000-4000-8000-000000000002', 'joy-target-reader@example.test', '關聯貼文社員', 'active'),
  ('99200000-0000-4000-8000-000000000003', '99000000-0000-4000-8000-000000000003', '99100000-0000-4000-8000-000000000003', 'joy-target-outsider@example.test', '外社關聯社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('99500000-0000-4000-8000-000000000001', 'JOY-TARGET-A', '關聯驗收甲社', 'active', now()),
  ('99500000-0000-4000-8000-000000000002', 'JOY-TARGET-B', '關聯驗收乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status) values
  ('99600000-0000-4000-8000-000000000001', '99500000-0000-4000-8000-000000000001', '99100000-0000-4000-8000-000000000001', 'active'),
  ('99600000-0000-4000-8000-000000000002', '99500000-0000-4000-8000-000000000001', '99100000-0000-4000-8000-000000000002', 'active'),
  ('99600000-0000-4000-8000-000000000003', '99500000-0000-4000-8000-000000000002', '99100000-0000-4000-8000-000000000003', 'active');

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values
  ('99700000-0000-4000-8000-000000000001', '99500000-0000-4000-8000-000000000001', '99200000-0000-4000-8000-000000000001', 'member', 'active', '99200000-0000-4000-8000-000000000001'),
  ('99700000-0000-4000-8000-000000000002', '99500000-0000-4000-8000-000000000001', '99200000-0000-4000-8000-000000000002', 'member', 'active', '99200000-0000-4000-8000-000000000001');
insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values (
  '99700000-0000-4000-8000-000000000003', '99500000-0000-4000-8000-000000000001',
  '99200000-0000-4000-8000-000000000001', 'president', 'active', '99200000-0000-4000-8000-000000000001'
);

insert into public.rotary_years (id, club_id, start_year, theme, created_by_app_account_id) values
  ('99800000-0000-4000-8000-000000000001', '99500000-0000-4000-8000-000000000001', 2026, '關聯驗收主題', '99200000-0000-4000-8000-000000000001'),
  ('99800000-0000-4000-8000-000000000002', '99500000-0000-4000-8000-000000000002', 2026, '不得跨社顯示', '99200000-0000-4000-8000-000000000003');

insert into public.club_events (
  id, club_id, event_type, title, location, starts_at, ends_at, registration_deadline,
  counts_for_attendance, event_status, created_by_app_account_id, updated_by_app_account_id, published_at
) values
  ('99900000-0000-4000-8000-000000000001', '99500000-0000-4000-8000-000000000001', 'service', '社員可見的服務活動', '測試場地', now() + interval '2 days', now() + interval '2 days 2 hours', now() + interval '1 day', false, 'published', '99200000-0000-4000-8000-000000000001', '99200000-0000-4000-8000-000000000001', now()),
  ('99900000-0000-4000-8000-000000000002', '99500000-0000-4000-8000-000000000001', 'service', '只給作者的活動', '限制場地', now() + interval '3 days', now() + interval '3 days 2 hours', now() + interval '2 days', false, 'published', '99200000-0000-4000-8000-000000000001', '99200000-0000-4000-8000-000000000001', now()),
  ('99900000-0000-4000-8000-000000000003', '99500000-0000-4000-8000-000000000002', 'service', '外社活動不得連結', '外社場地', now() + interval '2 days', now() + interval '2 days 2 hours', now() + interval '1 day', false, 'published', '99200000-0000-4000-8000-000000000003', '99200000-0000-4000-8000-000000000003', now()),
  ('99900000-0000-4000-8000-000000000004', '99500000-0000-4000-8000-000000000001', 'service', '只給其他社員的活動', '另一限制場地', now() + interval '4 days', now() + interval '4 days 2 hours', now() + interval '3 days', false, 'published', '99200000-0000-4000-8000-000000000001', '99200000-0000-4000-8000-000000000001', now());

insert into public.club_event_audience_members (event_id, membership_id, club_id)
values
  ('99900000-0000-4000-8000-000000000002', '99600000-0000-4000-8000-000000000001', '99500000-0000-4000-8000-000000000001'),
  ('99900000-0000-4000-8000-000000000004', '99600000-0000-4000-8000-000000000002', '99500000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000001', true);
insert into public.platform_feature_flags (
  feature_key, enabled, enabled_environments, rollout_percentage, updated_by
) values ('birthday_wishes_collection_v1', true, array['local'], 100, '99200000-0000-4000-8000-000000000001')
on conflict (feature_key) do update
set enabled = true, enabled_environments = array['local'], rollout_percentage = 100,
    updated_by = excluded.updated_by;

insert into public.birthday_visibility_preferences (membership_id, club_id, is_listed, allow_wishes)
values ('99600000-0000-4000-8000-000000000002', '99500000-0000-4000-8000-000000000001', true, true)
on conflict (membership_id) do update set is_listed = true, allow_wishes = true;
insert into public.birthday_wish_assignment_batches (
  id, club_id, birthday_year, birthday_month, batch_status, created_by_app_account_id
) values (
  '98300000-0000-4000-8000-000000000001', '99500000-0000-4000-8000-000000000001',
  2026, 10, 'completed', '99200000-0000-4000-8000-000000000001'
);
insert into public.birthday_wish_campaigns (
  id, club_id, recipient_membership_id, birthday_year, birthday_date, campaign_status,
  assignment_batch_id, created_by_app_account_id, published_at
) values (
  '98400000-0000-4000-8000-000000000001', '99500000-0000-4000-8000-000000000001',
  '99600000-0000-4000-8000-000000000002', 2026, '2026-10-27', 'published',
  '98300000-0000-4000-8000-000000000001', '99200000-0000-4000-8000-000000000001', now()
);
insert into public.birthday_wish_campaigns (
  id, club_id, recipient_membership_id, birthday_year, birthday_date, campaign_status,
  assignment_batch_id, created_by_app_account_id, published_at
) values (
  '98400000-0000-4000-8000-000000000002', '99500000-0000-4000-8000-000000000001',
  '99600000-0000-4000-8000-000000000001', 2026, '2026-10-28', 'published',
  '98300000-0000-4000-8000-000000000001', '99200000-0000-4000-8000-000000000001', now()
);
insert into public.birthday_wish_campaign_participants (
  id, club_id, campaign_id, assignment_batch_id, assignee_membership_id,
  question_bank_item_id, question_prompt_snapshot, participant_status, responded_at
)
select '98200000-0000-4000-8000-000000000001', '99500000-0000-4000-8000-000000000001',
  '98400000-0000-4000-8000-000000000001', '98300000-0000-4000-8000-000000000001',
  '99600000-0000-4000-8000-000000000001', question.id, '這一年最想感謝什麼？', 'submitted', now()
from public.birthday_wish_question_bank_items as question
where question.club_id is null
order by question.id
limit 1;
insert into public.birthday_wish_campaign_participants (
  id, club_id, campaign_id, assignment_batch_id, assignee_membership_id,
  question_bank_item_id, question_prompt_snapshot, participant_status, responded_at
)
select '98200000-0000-4000-8000-000000000002', '99500000-0000-4000-8000-000000000001',
  '98400000-0000-4000-8000-000000000002', '98300000-0000-4000-8000-000000000001',
  '99600000-0000-4000-8000-000000000002', question.id, '你想對這位社員說什麼？', 'submitted', now()
from public.birthday_wish_question_bank_items as question
where question.club_id is null
order by question.question_key
offset 1 limit 1;
insert into public.birthday_wish_campaign_submissions (
  id, club_id, campaign_id, participant_id, author_app_account_id, content,
  submission_status, published_at
) values (
  '98100000-0000-4000-8000-000000000001', '99500000-0000-4000-8000-000000000001',
  '98400000-0000-4000-8000-000000000001', '98200000-0000-4000-8000-000000000001',
  '99200000-0000-4000-8000-000000000001', 'PRIVATE_BIRTHDAY_SUBMISSION_CONTENT', 'published', now()
);
insert into public.birthday_wish_campaign_submissions (
  id, club_id, campaign_id, participant_id, author_app_account_id, content,
  submission_status, published_at
) values (
  '98100000-0000-4000-8000-000000000002', '99500000-0000-4000-8000-000000000001',
  '98400000-0000-4000-8000-000000000002', '98200000-0000-4000-8000-000000000002',
  '99200000-0000-4000-8000-000000000002', 'PRIVATE_NONOPTIN_BIRTHDAY_CONTENT', 'published', now()
);

select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000001', true);
insert into public.platform_feature_flags (
  feature_key, enabled, enabled_environments, rollout_percentage, updated_by
) values ('joy_wall_v1', true, array['local'], 100, '99200000-0000-4000-8000-000000000001')
on conflict (feature_key) do update
set enabled = true, enabled_environments = array['local'], rollout_percentage = 100;

do $$
begin
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.joy_targets'::regclass)
    or has_table_privilege('anon', 'public.joy_targets', 'SELECT')
    or has_table_privilege('authenticated', 'public.joy_targets', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('service_role', 'public.joy_targets', 'SELECT') then
    raise exception 'Joy target storage must remain RLS-protected and unavailable to direct roles';
  end if;
  if has_function_privilege('anon', 'public.list_joy_target_options(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.create_joy_post_with_targets(uuid,text,text,text,text,uuid[],uuid[],uuid[],text[],uuid[])', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.joy_post_targets_projection(uuid,uuid,jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.joy_visible_birthday_campaigns(uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.list_joy_target_options(uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.create_joy_post_with_targets(uuid,text,text,text,text,uuid[],uuid[],uuid[],text[],uuid[])', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.list_published_birthday_wish_submissions(uuid)', 'EXECUTE') then
    raise exception 'Joy target RPC grants are not restricted to the public API surface';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc
    where oid = 'public.create_joy_post_with_targets(uuid,text,text,text,text,uuid[],uuid[],uuid[],text[],uuid[])'::regprocedure
      and prosecdef and 'search_path=pg_catalog, public, auth' = any(proconfig)
  ) then
    raise exception 'Joy target create RPC must be SECURITY DEFINER with a fixed search_path';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000001', true);
do $$
declare
  options jsonb;
  created jsonb;
  listed jsonb;
  post_id uuid;
begin
  options := public.list_joy_target_options('99500000-0000-4000-8000-000000000001');
  if not (options->'events' @> '[{"id":"99900000-0000-4000-8000-000000000001"}]'::jsonb)
    or not (options->'events' @> '[{"id":"99900000-0000-4000-8000-000000000002"}]'::jsonb)
    or options->'events' @> '[{"id":"99900000-0000-4000-8000-000000000003"}]'::jsonb
    or options->'events' @> '[{"id":"99900000-0000-4000-8000-000000000004"}]'::jsonb
    or not (options->'rotary_years' @> '[{"id":"99800000-0000-4000-8000-000000000001"}]'::jsonb)
    or not (options->'roles' @> '[{"role_key":"president","label":"社長"}]'::jsonb)
    or options->'roles' @> '[{"role_key":"member"}]'::jsonb
    or not (options->'birthday_campaigns' @> '[{"id":"98400000-0000-4000-8000-000000000001","recipient_name":"關聯貼文社員","birthday_year":2026}]'::jsonb)
    or options->'birthday_campaigns' @> '[{"id":"98400000-0000-4000-8000-000000000002"}]'::jsonb
    or options::text like '%birthday_date%'
    or options::text like '%PRIVATE_BIRTHDAY_SUBMISSION_CONTENT%'
    or options::text like '%PRIVATE_NONOPTIN_BIRTHDAY_CONTENT%'
    or options::text like '%author_name%'
    or options::text like '%submission_id%'
    or options::text like '%participant_id%' then
    raise exception 'Target picker must show only visible events, years, active titles, and safe birthday labels';
  end if;

  created := public.create_joy_post_with_targets(
    '99500000-0000-4000-8000-000000000001', 'memory', '活動年度關聯', '保留這段服務回憶', 'club', '{}'::uuid[],
    array['99900000-0000-4000-8000-000000000001']::uuid[],
    array['99800000-0000-4000-8000-000000000001']::uuid[],
    array['president']::text[],
    array['98400000-0000-4000-8000-000000000001']::uuid[]
  );
  post_id := (created->>'id')::uuid;
  if jsonb_array_length(created->'targets') <> 4
    or not (created->'targets' @> '[{"target_type":"event","target_id":"99900000-0000-4000-8000-000000000001","label":"社員可見的服務活動"}]'::jsonb)
    or not (created->'targets' @> '[{"target_type":"rotary_year","target_id":"99800000-0000-4000-8000-000000000001"}]'::jsonb)
    or not (created->'targets' @> '[{"target_type":"role","target_id":"president","label":"社長"}]'::jsonb)
    or not (created->'targets' @> '[{"target_type":"birthday_campaign","target_id":"98400000-0000-4000-8000-000000000001","label":"關聯貼文社員的生日祝福","detail":"2026 年"}]'::jsonb)
    or created::text like '%birthday_date%'
    or created::text like '%PRIVATE_BIRTHDAY_SUBMISSION_CONTENT%'
    or created::text like '%author_name%' then
    raise exception 'Created Joy post did not return only its safe target projection';
  end if;

  listed := public.list_joy_posts_with_targets('99500000-0000-4000-8000-000000000001', null, null, 50, false);
  if not exists (
    select 1 from jsonb_array_elements(listed->'posts') as row(post)
    where row.post->>'id' = post_id::text and jsonb_array_length(row.post->'targets') = 4
  ) then raise exception 'Joy feed did not include target associations'; end if;

  begin
    perform public.create_joy_post_with_targets(
      '99500000-0000-4000-8000-000000000001', 'memory', null, '不得跨社', 'club', '{}'::uuid[],
      array['99900000-0000-4000-8000-000000000003']::uuid[], '{}'::uuid[]
    );
    raise exception 'A member attached another club event';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.create_joy_post_with_targets(
      '99500000-0000-4000-8000-000000000001', 'memory', null, '不得跨社', 'club', '{}'::uuid[],
      '{}'::uuid[], array['99800000-0000-4000-8000-000000000002']::uuid[]
    );
    raise exception 'A member attached another club Rotary year';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.create_joy_post_with_targets(
      '99500000-0000-4000-8000-000000000001', 'memory', null, '不可見活動', 'club', '{}'::uuid[],
      array['99900000-0000-4000-8000-000000000004']::uuid[], '{}'::uuid[]
    );
    raise exception 'A member attached an event they cannot view';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.create_joy_post_with_targets(
      '99500000-0000-4000-8000-000000000001', 'memory', null, '不得關聯未任職職務', 'club', '{}'::uuid[],
      '{}'::uuid[], '{}'::uuid[], array['secretary']::text[], '{}'::uuid[]
    );
    raise exception 'A member attached a role without an active same-club assignment';
  exception when invalid_parameter_value then null; end;

  -- The event reference is visible to the author but not to the selected
  -- reader, so the association label must not leak through the Joy projection.
  created := public.create_joy_post_with_targets(
    '99500000-0000-4000-8000-000000000001', 'memory', '不洩漏活動名稱', '只有指定社員可以閱讀', 'selected',
    array['99600000-0000-4000-8000-000000000002']::uuid[],
    array['99900000-0000-4000-8000-000000000002']::uuid[], '{}'::uuid[]
  );
  perform set_config('joy.target_private_post', created->>'id', true);
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000002', true);
do $$
declare
  listed jsonb;
  private_id uuid := current_setting('joy.target_private_post')::uuid;
begin
  listed := public.list_joy_posts_with_targets('99500000-0000-4000-8000-000000000001', null, null, 50, false);
  if not exists (
    select 1 from jsonb_array_elements(listed->'posts') as row(post)
    where row.post->>'id' = private_id::text
      and jsonb_array_length(row.post->'targets') = 0
  ) then raise exception 'Target labels leaked an event unavailable to the Joy post reader'; end if;

  begin perform public.list_joy_target_options('99500000-0000-4000-8000-000000000002');
    raise exception 'An active member listed another club target options';
  exception when insufficient_privilege then null; end;

  begin perform 1 from public.joy_targets; raise exception 'Authenticated role read Joy target table';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000003', true);
do $$
begin
  begin perform public.list_joy_posts_with_targets('99500000-0000-4000-8000-000000000001', null, null, 20, false);
    raise exception 'An outside-club member read Joy posts and target associations';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Disabling the birthday collection flag removes its RPC grant. Birthday
-- associations then disappear from both options and readers' projections.
select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000001', true);
update public.platform_feature_flags
set enabled = false, enabled_environments = array['local'], rollout_percentage = 100,
    updated_by = '99200000-0000-4000-8000-000000000001'
where feature_key = 'birthday_wishes_collection_v1';
set local role authenticated;
select set_config('request.jwt.claim.sub', '99000000-0000-4000-8000-000000000001', true);
do $$
declare
  options jsonb;
  listed jsonb;
begin
  options := public.list_joy_target_options('99500000-0000-4000-8000-000000000001');
  listed := public.list_joy_posts_with_targets('99500000-0000-4000-8000-000000000001', null, null, 50, false);
  if jsonb_array_length(options->'birthday_campaigns') <> 0
    or listed::text like '%關聯貼文社員的生日祝福%'
    or listed::text like '%98400000-0000-4000-8000-000000000001%' then
    raise exception 'Birthday target metadata remained visible after its feature flag was disabled';
  end if;
  begin
    perform public.create_joy_post_with_targets(
      '99500000-0000-4000-8000-000000000001', 'memory', null, '旗標關閉不可關聯', 'club', '{}'::uuid[],
      '{}'::uuid[], '{}'::uuid[], '{}'::text[], array['98400000-0000-4000-8000-000000000001']::uuid[]
    );
    raise exception 'A member attached a birthday campaign while its feature flag was disabled';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;

rollback;
