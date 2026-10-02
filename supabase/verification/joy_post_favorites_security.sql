-- Joy Wall favorites are private to one active club member and cannot reveal posts.
-- Run only against Supabase local. Synthetic rows are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'a9100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'joy-favorite-author@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a9100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'joy-favorite-recipient@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a9100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'joy-favorite-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a9100000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'joy-favorite-outsider@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a9100000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'joy-favorite-suspended@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('a9200000-0000-4000-8000-000000000001', '收藏作者', 'joy-favorite-author@example.test'),
  ('a9200000-0000-4000-8000-000000000002', '指定收件社員', 'joy-favorite-recipient@example.test'),
  ('a9200000-0000-4000-8000-000000000003', '一般社員', 'joy-favorite-member@example.test'),
  ('a9200000-0000-4000-8000-000000000004', '外社社員', 'joy-favorite-outsider@example.test'),
  ('a9200000-0000-4000-8000-000000000005', '停權社員', 'joy-favorite-suspended@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('a9300000-0000-4000-8000-000000000001', 'a9100000-0000-4000-8000-000000000001', 'a9200000-0000-4000-8000-000000000001', 'joy-favorite-author@example.test', '收藏作者', 'active'),
  ('a9300000-0000-4000-8000-000000000002', 'a9100000-0000-4000-8000-000000000002', 'a9200000-0000-4000-8000-000000000002', 'joy-favorite-recipient@example.test', '指定收件社員', 'active'),
  ('a9300000-0000-4000-8000-000000000003', 'a9100000-0000-4000-8000-000000000003', 'a9200000-0000-4000-8000-000000000003', 'joy-favorite-member@example.test', '一般社員', 'active'),
  ('a9300000-0000-4000-8000-000000000004', 'a9100000-0000-4000-8000-000000000004', 'a9200000-0000-4000-8000-000000000004', 'joy-favorite-outsider@example.test', '外社社員', 'active'),
  ('a9300000-0000-4000-8000-000000000005', 'a9100000-0000-4000-8000-000000000005', 'a9200000-0000-4000-8000-000000000005', 'joy-favorite-suspended@example.test', '停權社員', 'suspended');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('a9500000-0000-4000-8000-000000000001', 'JOY-FAV-A', '收藏安全甲社', 'active', now()),
  ('a9500000-0000-4000-8000-000000000002', 'JOY-FAV-B', '收藏安全乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status) values
  ('a9600000-0000-4000-8000-000000000001', 'a9500000-0000-4000-8000-000000000001', 'a9200000-0000-4000-8000-000000000001', 'active'),
  ('a9600000-0000-4000-8000-000000000002', 'a9500000-0000-4000-8000-000000000001', 'a9200000-0000-4000-8000-000000000002', 'active'),
  ('a9600000-0000-4000-8000-000000000003', 'a9500000-0000-4000-8000-000000000001', 'a9200000-0000-4000-8000-000000000003', 'active'),
  ('a9600000-0000-4000-8000-000000000004', 'a9500000-0000-4000-8000-000000000001', 'a9200000-0000-4000-8000-000000000005', 'active'),
  ('a9600000-0000-4000-8000-000000000005', 'a9500000-0000-4000-8000-000000000002', 'a9200000-0000-4000-8000-000000000004', 'active');

do $$
begin
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.joy_post_favorites'::regclass)
    or has_table_privilege('anon', 'public.joy_post_favorites', 'SELECT')
    or has_table_privilege('authenticated', 'public.joy_post_favorites', 'SELECT')
    or has_table_privilege('authenticated', 'public.joy_post_favorites', 'INSERT')
    or has_table_privilege('authenticated', 'public.joy_post_favorites', 'DELETE')
    or has_table_privilege('service_role', 'public.joy_post_favorites', 'SELECT') then
    raise exception 'Joy favorites table access is not private';
  end if;
  if has_function_privilege('anon', 'public.set_joy_post_favorite(uuid,uuid,boolean)', 'EXECUTE')
    or has_function_privilege('anon', 'public.list_joy_posts(uuid,timestamptz,uuid,integer,boolean)', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_my_joy_question_post_with_favorite(uuid,uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.set_joy_post_favorite(uuid,uuid,boolean)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.list_joy_posts(uuid,timestamptz,uuid,integer,boolean)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.get_my_joy_question_post_with_favorite(uuid,uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.list_joy_posts(uuid,timestamptz,uuid,integer)', 'EXECUTE') then
    raise exception 'Joy favorites RPC grants are incorrect';
  end if;
  if not exists (select 1 from pg_catalog.pg_proc
      where oid = 'public.set_joy_post_favorite(uuid,uuid,boolean)'::regprocedure
        and 'search_path=pg_catalog, public, auth' = any(proconfig))
    or not exists (select 1 from pg_catalog.pg_proc
      where oid = 'public.list_joy_posts(uuid,timestamptz,uuid,integer,boolean)'::regprocedure
        and 'search_path=pg_catalog, public, auth' = any(proconfig))
    or not exists (select 1 from pg_catalog.pg_proc
      where oid = 'public.get_my_joy_question_post_with_favorite(uuid,uuid)'::regprocedure
        and 'search_path=pg_catalog, public, auth' = any(proconfig)) then
    raise exception 'Joy favorites RPC search_path is not fixed';
  end if;
  if exists (select 1 from public.platform_feature_flags where feature_key = 'joy_wall_v1') then
    raise exception 'Joy Wall rollout was unexpectedly seeded';
  end if;
end $$;

set local role anon;
do $$
begin
  begin perform public.set_joy_post_favorite('a9500000-0000-4000-8000-000000000001', 'a9400000-0000-4000-8000-000000000001', true); raise exception 'anon called favorite mutation';
  exception when insufficient_privilege then null; end;
  begin perform public.list_joy_posts('a9500000-0000-4000-8000-000000000001', null, null, 20, true); raise exception 'anon listed favorites';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.joy_post_favorites; raise exception 'anon read favorites table';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000001', true);
insert into public.platform_feature_flags (feature_key, enabled, enabled_environments, rollout_percentage, updated_by)
values ('joy_wall_v1', true, array['local'], 100, 'a9300000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000001', true);
do $$
declare
  public_post jsonb;
  private_post jsonb;
  question_post jsonb;
  favorite_page jsonb;
  post_id uuid;
  question_id uuid;
begin
  public_post := public.create_joy_post(
    'a9500000-0000-4000-8000-000000000001', 'gratitude', '本社活動回憶', '這篇可由全社閱讀。', 'club', '{}'::uuid[]
  );
  post_id := (public_post->>'id')::uuid;
  if public.set_joy_post_favorite('a9500000-0000-4000-8000-000000000001', post_id, true) is distinct from true
    or public.set_joy_post_favorite('a9500000-0000-4000-8000-000000000001', post_id, true) is distinct from true then
    raise exception 'Favorite save was not idempotent';
  end if;
  favorite_page := public.list_joy_posts('a9500000-0000-4000-8000-000000000001', null, null, 20, true);
  if jsonb_array_length(favorite_page->'posts') <> 1
    or favorite_page->'posts'->0->>'id' <> post_id::text
    or favorite_page->'posts'->0->>'is_favorited' <> 'true' then
    raise exception 'Saved post did not appear in the private favorites view';
  end if;
  if public.list_joy_posts('a9500000-0000-4000-8000-000000000001', null, null, 20)->'posts'->0->>'is_favorited' <> 'true' then
    raise exception 'Normal feed did not project caller favorite state';
  end if;
  perform public.set_joy_post_favorite('a9500000-0000-4000-8000-000000000001', post_id, false);
  if jsonb_array_length(public.list_joy_posts('a9500000-0000-4000-8000-000000000001', null, null, 20, true)->'posts') <> 0 then
    raise exception 'Removed favorite remained in favorites view';
  end if;

  question_post := public.create_joy_post(
    'a9500000-0000-4000-8000-000000000001', 'question', '社內提問', '這是一個全社可讀的提問。', 'club', '{}'::uuid[]
  );
  question_id := (question_post->>'id')::uuid;
  perform set_config('joy.question_post_id', question_id::text, true);
  perform public.set_joy_post_favorite('a9500000-0000-4000-8000-000000000001', question_id, true);
  if public.get_my_joy_question_post_with_favorite('a9500000-0000-4000-8000-000000000001', question_id)->>'is_favorited' <> 'true' then
    raise exception 'Focused question projection omitted the caller favorite state';
  end if;

  private_post := public.create_joy_post(
    'a9500000-0000-4000-8000-000000000001', 'blessing', null, '只給指定社員看的祝福。', 'private',
    array['a9600000-0000-4000-8000-000000000002'::uuid]
  );
  perform set_config('joy.private_post_id', private_post->>'id', true);
  perform set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000003', true);
  begin
    perform public.set_joy_post_favorite('a9500000-0000-4000-8000-000000000001', (private_post->>'id')::uuid, true);
    raise exception 'Member favorited a private post they cannot read';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000002', true);
do $$
declare
  favorite_page jsonb;
begin
  perform public.set_joy_post_favorite(
    'a9500000-0000-4000-8000-000000000001', current_setting('joy.private_post_id')::uuid, true
  );
  favorite_page := public.list_joy_posts('a9500000-0000-4000-8000-000000000001', null, null, 20, true);
  if jsonb_array_length(favorite_page->'posts') <> 1
    or favorite_page->'posts'->0->>'visibility_scope' <> 'private' then
    raise exception 'Authorized recipient could not privately favorite their received post';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000003', true);
do $$
declare
  question_projection jsonb;
begin
  if jsonb_array_length(public.list_joy_posts('a9500000-0000-4000-8000-000000000001', null, null, 20, true)->'posts') <> 0 then
    raise exception 'Another member saw a private favorites list';
  end if;
  question_projection := public.get_my_joy_question_post_with_favorite(
    'a9500000-0000-4000-8000-000000000001', current_setting('joy.question_post_id')::uuid
  );
  if question_projection->>'is_favorited' <> 'false' then
    raise exception 'Another member saw the author private favorite state';
  end if;
  perform public.set_joy_post_favorite(
    'a9500000-0000-4000-8000-000000000001', current_setting('joy.question_post_id')::uuid, true
  );
  if public.get_my_joy_question_post_with_favorite(
    'a9500000-0000-4000-8000-000000000001', current_setting('joy.question_post_id')::uuid
  )->>'is_favorited' <> 'true' then
    raise exception 'Focused question projection did not show the caller own favorite';
  end if;
  begin
    perform public.set_joy_post_favorite('a9500000-0000-4000-8000-000000000002', current_setting('joy.private_post_id')::uuid, true);
    raise exception 'Cross-club favorite was accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000005', true);
do $$
begin
  begin
    perform public.set_joy_post_favorite('a9500000-0000-4000-8000-000000000001', current_setting('joy.private_post_id')::uuid, true);
    raise exception 'Suspended account favorite was accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

insert into public.platform_roles (app_account_id, role_key)
values ('a9300000-0000-4000-8000-000000000001', 'superadmin');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a9100000-0000-4000-8000-000000000001', true);
select * from public.set_platform_feature_flag('joy_wall_v1', false, array['local'], 100);
do $$
begin
  begin
    perform public.list_joy_posts('a9500000-0000-4000-8000-000000000001', null, null, 20, true);
    raise exception 'Favorites view ignored disabled feature flag';
  exception when insufficient_privilege then null; end;
  begin
    perform public.set_joy_post_favorite('a9500000-0000-4000-8000-000000000001', current_setting('joy.private_post_id')::uuid, true);
    raise exception 'Favorite mutation ignored disabled feature flag';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
