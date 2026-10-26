-- Joy post deadlines stop new comments and answers without hiding history.
-- Run only against Supabase local. Synthetic rows are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'b9100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'joy-deadline-author@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b9100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'joy-deadline-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b9100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'joy-deadline-outsider@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b9100000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'joy-deadline-suspended@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('b9200000-0000-4000-8000-000000000001', '截止日作者', 'joy-deadline-author@example.test'),
  ('b9200000-0000-4000-8000-000000000002', '一般社員', 'joy-deadline-member@example.test'),
  ('b9200000-0000-4000-8000-000000000003', '外社社員', 'joy-deadline-outsider@example.test'),
  ('b9200000-0000-4000-8000-000000000004', '停權社員', 'joy-deadline-suspended@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('b9300000-0000-4000-8000-000000000001', 'b9100000-0000-4000-8000-000000000001', 'b9200000-0000-4000-8000-000000000001', 'joy-deadline-author@example.test', '截止日作者', 'active'),
  ('b9300000-0000-4000-8000-000000000002', 'b9100000-0000-4000-8000-000000000002', 'b9200000-0000-4000-8000-000000000002', 'joy-deadline-member@example.test', '一般社員', 'active'),
  ('b9300000-0000-4000-8000-000000000003', 'b9100000-0000-4000-8000-000000000003', 'b9200000-0000-4000-8000-000000000003', 'joy-deadline-outsider@example.test', '外社社員', 'active'),
  ('b9300000-0000-4000-8000-000000000004', 'b9100000-0000-4000-8000-000000000004', 'b9200000-0000-4000-8000-000000000004', 'joy-deadline-suspended@example.test', '停權社員', 'suspended');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('b9500000-0000-4000-8000-000000000001', 'JOY-DEADLINE-A', '截止日驗證甲社', 'active', now()),
  ('b9500000-0000-4000-8000-000000000002', 'JOY-DEADLINE-B', '截止日驗證乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status) values
  ('b9600000-0000-4000-8000-000000000001', 'b9500000-0000-4000-8000-000000000001', 'b9200000-0000-4000-8000-000000000001', 'active'),
  ('b9600000-0000-4000-8000-000000000002', 'b9500000-0000-4000-8000-000000000001', 'b9200000-0000-4000-8000-000000000002', 'active'),
  ('b9600000-0000-4000-8000-000000000003', 'b9500000-0000-4000-8000-000000000001', 'b9200000-0000-4000-8000-000000000004', 'active'),
  ('b9600000-0000-4000-8000-000000000004', 'b9500000-0000-4000-8000-000000000002', 'b9200000-0000-4000-8000-000000000003', 'active');

select set_config('request.jwt.claim.sub', 'b9100000-0000-4000-8000-000000000001', true);
insert into public.platform_feature_flags (feature_key, enabled, enabled_environments, rollout_percentage, updated_by)
values ('joy_wall_v1', true, array['local'], 100, 'b9300000-0000-4000-8000-000000000001')
on conflict (feature_key) do update
set enabled = excluded.enabled,
    enabled_environments = excluded.enabled_environments,
    rollout_percentage = excluded.rollout_percentage,
    updated_by = excluded.updated_by;

do $$
begin
  if not has_function_privilege('authenticated', 'public.create_joy_post_with_interaction_deadline(uuid,text,text,text,text,uuid[],uuid[],uuid[],text[],uuid[],date)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.update_own_joy_post_with_interaction_deadline(uuid,uuid,text,text,text,date)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.list_joy_posts_with_interaction_deadlines(uuid,timestamptz,uuid,integer,boolean)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.get_my_joy_question_post_with_interaction_deadline(uuid,uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.joy_post_interactions_open(uuid,uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.joy_post_interaction_projection(uuid,uuid,jsonb)', 'EXECUTE') then
    raise exception 'Joy post interaction deadline RPC grants are incorrect';
  end if;
  if not exists (select 1 from pg_catalog.pg_proc
      where oid = 'public.joy_post_interactions_open(uuid,uuid)'::regprocedure
        and 'search_path=pg_catalog, public, auth' = any(proconfig))
    or not exists (select 1 from pg_catalog.pg_proc
      where oid = 'public.create_joy_post_with_interaction_deadline(uuid,text,text,text,text,uuid[],uuid[],uuid[],text[],uuid[],date)'::regprocedure
        and 'search_path=pg_catalog, public, auth' = any(proconfig)) then
    raise exception 'Joy post interaction deadline search_path is not fixed';
  end if;
end $$;

set local role anon;
do $$
begin
  begin
    perform public.list_joy_posts_with_interaction_deadlines('b9500000-0000-4000-8000-000000000001', null, null, 20, false);
    raise exception 'anon called Joy interaction deadline RPC';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b9100000-0000-4000-8000-000000000001', true);
do $$
declare
  local_today date := (current_timestamp at time zone 'Asia/Taipei')::date;
  post_projection jsonb;
  post_id uuid;
  question_projection jsonb;
  question_id uuid;
  comment_projection jsonb;
  page_projection jsonb;
  comments_projection jsonb;
begin
  post_projection := public.create_joy_post_with_interaction_deadline(
    'b9500000-0000-4000-8000-000000000001', 'question', '留言截止日驗證', '截止後仍可閱讀歷史留言。',
    'club', '{}'::uuid[], '{}'::uuid[], '{}'::uuid[], '{}'::text[], '{}'::uuid[], local_today
  );
  post_id := (post_projection->>'id')::uuid;
  if post_projection->>'interaction_deadline_on' <> local_today::text
    or post_projection->>'interactions_open' <> 'true' then
    raise exception 'The selected Taiwan calendar date must remain open through its end';
  end if;
  comment_projection := public.create_joy_comment(
    'b9500000-0000-4000-8000-000000000001', post_id, null, 'answer', '截止前的回答會保留。'
  );

  question_projection := public.update_own_joy_post_with_interaction_deadline(
    'b9500000-0000-4000-8000-000000000001', post_id, 'question', '留言截止日驗證', '截止後仍可閱讀歷史留言。', local_today - 1
  );
  question_id := (question_projection->>'id')::uuid;
  if question_projection->>'interactions_open' <> 'false'
    or question_projection->>'interaction_deadline_on' <> (local_today - 1)::text then
    raise exception 'An expired deadline was not projected as closed';
  end if;
  question_projection := public.get_my_joy_question_post_with_interaction_deadline(
    'b9500000-0000-4000-8000-000000000001', question_id
  );
  if question_projection->>'interactions_open' <> 'false'
    or question_projection->>'interaction_deadline_on' <> (local_today - 1)::text then
    raise exception 'The task-focused question projection omitted its interaction deadline';
  end if;
  page_projection := public.list_joy_posts_with_interaction_deadlines(
    'b9500000-0000-4000-8000-000000000001', null, null, 20, false
  );
  if not exists (
    select 1 from jsonb_array_elements(page_projection->'posts') as item(post)
    where item.post->>'id' = question_id::text and item.post->>'interactions_open' = 'false'
  ) then
    raise exception 'The feed omitted the closed status';
  end if;
  comments_projection := public.list_joy_comments('b9500000-0000-4000-8000-000000000001', question_id, 100);
  if not exists (
    select 1 from jsonb_array_elements(comments_projection->'comments') as item(comment)
    where item.comment->>'id' = comment_projection->>'id'
      and item.comment->>'content' = '截止前的回答會保留。'
  ) then
    raise exception 'Historical answers became unreadable after the deadline';
  end if;

  perform set_config('request.jwt.claim.sub', 'b9100000-0000-4000-8000-000000000002', true);
  begin
    perform public.create_joy_comment(
      'b9500000-0000-4000-8000-000000000001', question_id, null, 'comment', '逾期留言'
    );
    raise exception 'A member created a comment after the deadline';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'joy_post_interactions_closed' then raise; end if;
  end;
  begin
    perform public.create_joy_comment(
      'b9500000-0000-4000-8000-000000000001', question_id, null, 'answer', '逾期回答'
    );
    raise exception 'A member answered after the deadline';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'joy_post_interactions_closed' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', 'b9100000-0000-4000-8000-000000000003', true);
  begin
    perform public.list_joy_comments('b9500000-0000-4000-8000-000000000001', question_id, 100);
    raise exception 'A member from another club read this post history';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub', 'b9100000-0000-4000-8000-000000000004', true);
  begin
    perform public.create_joy_comment(
      'b9500000-0000-4000-8000-000000000001', question_id, null, 'comment', '停權帳號留言'
    );
    raise exception 'A suspended account created a comment';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
