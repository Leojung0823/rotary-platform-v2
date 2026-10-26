-- Joy Wall unpublished drafts are author-only until a validated publish succeeds.
-- Run only against Supabase local. All synthetic rows are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'c9100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'joy-draft-author@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c9100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'joy-draft-peer@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c9100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'joy-draft-president@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c9100000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'joy-draft-outsider@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c9100000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'joy-draft-suspended@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('c9200000-0000-4000-8000-000000000001', '草稿作者', 'joy-draft-author@example.test'),
  ('c9200000-0000-4000-8000-000000000002', '一般社員', 'joy-draft-peer@example.test'),
  ('c9200000-0000-4000-8000-000000000003', '社務幹部', 'joy-draft-president@example.test'),
  ('c9200000-0000-4000-8000-000000000004', '外社社員', 'joy-draft-outsider@example.test'),
  ('c9200000-0000-4000-8000-000000000005', '停權社員', 'joy-draft-suspended@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('c9300000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000001', 'c9200000-0000-4000-8000-000000000001', 'joy-draft-author@example.test', '草稿作者', 'active'),
  ('c9300000-0000-4000-8000-000000000002', 'c9100000-0000-4000-8000-000000000002', 'c9200000-0000-4000-8000-000000000002', 'joy-draft-peer@example.test', '一般社員', 'active'),
  ('c9300000-0000-4000-8000-000000000003', 'c9100000-0000-4000-8000-000000000003', 'c9200000-0000-4000-8000-000000000003', 'joy-draft-president@example.test', '社務幹部', 'active'),
  ('c9300000-0000-4000-8000-000000000004', 'c9100000-0000-4000-8000-000000000004', 'c9200000-0000-4000-8000-000000000004', 'joy-draft-outsider@example.test', '外社社員', 'active'),
  ('c9300000-0000-4000-8000-000000000005', 'c9100000-0000-4000-8000-000000000005', 'c9200000-0000-4000-8000-000000000005', 'joy-draft-suspended@example.test', '停權社員', 'suspended');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('c9500000-0000-4000-8000-000000000001', 'JOY-DRAFT-A', '草稿隱私甲社', 'active', now()),
  ('c9500000-0000-4000-8000-000000000002', 'JOY-DRAFT-B', '草稿隱私乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status) values
  ('c9600000-0000-4000-8000-000000000001', 'c9500000-0000-4000-8000-000000000001', 'c9200000-0000-4000-8000-000000000001', 'active'),
  ('c9600000-0000-4000-8000-000000000002', 'c9500000-0000-4000-8000-000000000001', 'c9200000-0000-4000-8000-000000000002', 'active'),
  ('c9600000-0000-4000-8000-000000000003', 'c9500000-0000-4000-8000-000000000001', 'c9200000-0000-4000-8000-000000000003', 'active'),
  ('c9600000-0000-4000-8000-000000000004', 'c9500000-0000-4000-8000-000000000001', 'c9200000-0000-4000-8000-000000000005', 'active'),
  ('c9600000-0000-4000-8000-000000000005', 'c9500000-0000-4000-8000-000000000002', 'c9200000-0000-4000-8000-000000000004', 'active');

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values (
  'c9700000-0000-4000-8000-000000000001', 'c9500000-0000-4000-8000-000000000001',
  'c9300000-0000-4000-8000-000000000003', 'president', 'active', 'c9300000-0000-4000-8000-000000000003'
);

do $$
declare
  fn_name text;
begin
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.joy_post_drafts'::regclass)
    or has_table_privilege('anon', 'public.joy_post_drafts', 'SELECT')
    or has_table_privilege('authenticated', 'public.joy_post_drafts', 'SELECT')
    or has_table_privilege('authenticated', 'public.joy_post_drafts', 'INSERT')
    or has_table_privilege('authenticated', 'public.joy_post_drafts', 'UPDATE')
    or has_table_privilege('authenticated', 'public.joy_post_drafts', 'DELETE')
    or has_table_privilege('service_role', 'public.joy_post_drafts', 'SELECT') then
    raise exception 'Joy drafts table is not private behind RPCs';
  end if;
  foreach fn_name in array array[
    'list_my_joy_post_drafts(uuid)',
    'save_my_joy_post_draft(uuid,uuid,text,text,text,text,uuid[],uuid[],uuid[],text[],uuid[],date)',
    'delete_my_joy_post_draft(uuid,uuid)',
    'publish_my_joy_post_draft(uuid,uuid)'
  ] loop
    if has_function_privilege('anon', 'public.' || fn_name, 'EXECUTE')
      or not has_function_privilege('authenticated', 'public.' || fn_name, 'EXECUTE')
      or not exists (
        select 1 from pg_catalog.pg_proc as procedure
        where procedure.oid = ('public.' || fn_name)::regprocedure
          and 'search_path=pg_catalog, public, auth' = any(procedure.proconfig)
      ) then
      raise exception 'Joy draft RPC grant or fixed search_path is incorrect: %', fn_name;
    end if;
  end loop;
end $$;

select set_config('request.jwt.claim.sub', 'c9100000-0000-4000-8000-000000000001', true);
insert into public.platform_feature_flags (
  feature_key, enabled, enabled_environments, rollout_percentage, updated_by
) values ('joy_wall_v1', true, array['local'], 100, 'c9300000-0000-4000-8000-000000000001')
on conflict (feature_key) do update
set enabled = true, enabled_environments = array['local'], rollout_percentage = 100,
    updated_by = excluded.updated_by;

set local role anon;
do $$
begin
  begin perform public.list_my_joy_post_drafts('c9500000-0000-4000-8000-000000000001');
    raise exception 'anon listed Joy drafts';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.joy_post_drafts;
    raise exception 'anon queried Joy draft rows';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'c9100000-0000-4000-8000-000000000001', true);
set local role authenticated;
do $$
declare
  first_draft_id constant uuid := 'c9800000-0000-4000-8000-000000000001';
  second_draft_id constant uuid := 'c9800000-0000-4000-8000-000000000002';
  result jsonb;
  published jsonb;
begin
  result := public.save_my_joy_post_draft(
    'c9500000-0000-4000-8000-000000000001', first_draft_id,
    'gratitude', '草稿標題', 'DRAFT_PRIVATE_CONTENT_V1', 'club',
    p_interaction_deadline_on => date '2026-11-30'
  );
  if result->>'content' <> 'DRAFT_PRIVATE_CONTENT_V1' or result->>'post_type' <> 'gratitude'
    or result->>'interaction_deadline_on' <> '2026-11-30' then
    raise exception 'Author did not receive their own draft';
  end if;
  perform public.save_my_joy_post_draft(
    'c9500000-0000-4000-8000-000000000001', first_draft_id,
    'gratitude', '草稿標題', 'DRAFT_PRIVATE_CONTENT_V2', 'club',
    p_interaction_deadline_on => date '2026-11-30'
  );
  perform public.save_my_joy_post_draft(
    'c9500000-0000-4000-8000-000000000001', second_draft_id,
    'blessing', null, '', 'club'
  );
  result := public.list_my_joy_post_drafts('c9500000-0000-4000-8000-000000000001');
  if jsonb_array_length(result->'drafts') <> 2
    or not (result->'drafts' @> jsonb_build_array(jsonb_build_object('id', first_draft_id, 'content', 'DRAFT_PRIVATE_CONTENT_V2'))) then
    raise exception 'Draft upsert or author listing failed';
  end if;
  if exists (
    select 1 from jsonb_array_elements(public.list_joy_posts_with_interaction_deadlines(
      'c9500000-0000-4000-8000-000000000001', null, null, 50, false
    )->'posts') as item(post)
    where item.post->>'title' = '草稿標題' or item.post->>'content' like 'DRAFT_PRIVATE_CONTENT%'
  ) then
    raise exception 'Unpublished draft leaked into the published wall';
  end if;
  begin perform 1 from public.joy_post_drafts;
    raise exception 'authenticated queried Joy draft rows directly';
  exception when insufficient_privilege then null; end;

  published := public.publish_my_joy_post_draft('c9500000-0000-4000-8000-000000000001', first_draft_id);
  if published->>'post_status' <> 'published' or published->>'content' <> 'DRAFT_PRIVATE_CONTENT_V2'
    or published->>'interaction_deadline_on' <> '2026-11-30' then
    raise exception 'Draft publish did not preserve the latest saved content';
  end if;
  result := public.list_my_joy_post_drafts('c9500000-0000-4000-8000-000000000001');
  if jsonb_array_length(result->'drafts') <> 1 then
    raise exception 'Published draft was not removed atomically';
  end if;
  perform public.delete_my_joy_post_draft('c9500000-0000-4000-8000-000000000001', second_draft_id);
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'c9100000-0000-4000-8000-000000000002', true);
set local role authenticated;
do $$
declare
  result jsonb;
begin
  result := public.list_my_joy_post_drafts('c9500000-0000-4000-8000-000000000001');
  if jsonb_array_length(result->'drafts') <> 0 then
    raise exception 'Another active member saw another members drafts';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(public.list_joy_posts_with_interaction_deadlines(
      'c9500000-0000-4000-8000-000000000001', null, null, 50, false
    )->'posts') as item(post)
    where item.post->>'content' = 'DRAFT_PRIVATE_CONTENT_V2'
  ) then
    raise exception 'A successfully published post is not visible to its club audience';
  end if;
  begin perform public.publish_my_joy_post_draft(
    'c9500000-0000-4000-8000-000000000001', 'c9800000-0000-4000-8000-000000000001'
  );
    raise exception 'Another member published a former draft';
  exception when no_data_found then null; end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'c9100000-0000-4000-8000-000000000003', true);
set local role authenticated;
do $$
declare result jsonb;
begin
  result := public.list_my_joy_post_drafts('c9500000-0000-4000-8000-000000000001');
  if jsonb_array_length(result->'drafts') <> 0 then
    raise exception 'Club management role saw another members private drafts';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'c9100000-0000-4000-8000-000000000004', true);
set local role authenticated;
do $$
begin
  begin perform public.list_my_joy_post_drafts('c9500000-0000-4000-8000-000000000001');
    raise exception 'An external-club member listed drafts';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'c9100000-0000-4000-8000-000000000005', true);
set local role authenticated;
do $$
begin
  begin perform public.list_my_joy_post_drafts('c9500000-0000-4000-8000-000000000001');
    raise exception 'A suspended account listed drafts';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$
begin
  if exists (
    select 1 from public.joy_wall_audit_events as audit
    where audit.club_id = 'c9500000-0000-4000-8000-000000000001'
      and (audit.details ? 'content' or audit.details ? 'title')
  ) then
    raise exception 'Draft audit events contain private draft text';
  end if;
end $$;

rollback;
