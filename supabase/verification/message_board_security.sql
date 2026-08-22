-- Club-scoped authenticated message board security verification.
-- Run only against Supabase local. All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '14000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'board-owner-v2@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '14000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'board-peer-v2@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '14000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'board-outsider-v2@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email, avatar_url) values
  ('24000000-0000-0000-0000-000000000001', '甲社留言擁有者', 'board-owner-v2@example.test', 'https://example.test/owner.png'),
  ('24000000-0000-0000-0000-000000000002', '甲社其他社員', 'board-peer-v2@example.test', null),
  ('24000000-0000-0000-0000-000000000003', '乙社社員', 'board-outsider-v2@example.test', null);

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('34000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001', '24000000-0000-0000-0000-000000000001', 'board-owner-v2@example.test', '甲社留言擁有者', 'active'),
  ('34000000-0000-0000-0000-000000000002', '14000000-0000-0000-0000-000000000002', '24000000-0000-0000-0000-000000000002', 'board-peer-v2@example.test', '甲社其他社員', 'active'),
  ('34000000-0000-0000-0000-000000000003', '14000000-0000-0000-0000-000000000003', '24000000-0000-0000-0000-000000000003', 'board-outsider-v2@example.test', '乙社社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('54000000-0000-4000-8000-000000000001', 'BOARD-SEC-A', '留言板安全甲社', 'active', now()),
  ('54000000-0000-4000-8000-000000000002', 'BOARD-SEC-B', '留言板安全乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status) values
  ('64000000-0000-4000-8000-000000000001', '54000000-0000-4000-8000-000000000001', '24000000-0000-0000-0000-000000000001', 'active'),
  ('64000000-0000-4000-8000-000000000002', '54000000-0000-4000-8000-000000000001', '24000000-0000-0000-0000-000000000002', 'active'),
  ('64000000-0000-4000-8000-000000000003', '54000000-0000-4000-8000-000000000002', '24000000-0000-0000-0000-000000000003', 'active');

create temporary table board_security_values (
  key text primary key,
  value text not null
);
grant select, insert, update on board_security_values to authenticated;

-- Schema, RLS, table grants, function grants, and fixed search path.
do $$
declare list_config text[];
begin
  if not exists (
    select 1 from pg_catalog.pg_class
    where oid = 'public.board_posts'::regclass and relrowsecurity
  ) then raise exception 'board_posts RLS is not enabled'; end if;

  if has_table_privilege('anon', 'public.board_posts', 'SELECT')
     or has_table_privilege('authenticated', 'public.board_posts', 'SELECT')
     or has_table_privilege('authenticated', 'public.board_posts', 'INSERT')
     or has_table_privilege('authenticated', 'public.board_posts', 'UPDATE')
     or has_table_privilege('authenticated', 'public.board_posts', 'DELETE') then
    raise exception 'browser role gained direct board_posts access';
  end if;

  if has_function_privilege('anon', 'public.list_board_posts(uuid,timestamptz,uuid,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.create_board_post(uuid,text,uuid[])', 'EXECUTE')
     or has_function_privilege('anon', 'public.update_own_board_post(uuid,uuid,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.delete_own_board_post(uuid,uuid)', 'EXECUTE') then
    raise exception 'anon gained board RPC execute';
  end if;

  if not has_function_privilege('authenticated', 'public.list_my_board_clubs()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.list_board_posts(uuid,timestamptz,uuid,integer)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.create_board_post(uuid,text,uuid[])', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.update_own_board_post(uuid,uuid,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.delete_own_board_post(uuid,uuid)', 'EXECUTE') then
    raise exception 'authenticated board RPC grant missing';
  end if;

  select proconfig into list_config
  from pg_catalog.pg_proc
  where oid = 'public.list_board_posts(uuid,timestamptz,uuid,integer)'::regprocedure;
  if list_config is null or not ('search_path=pg_catalog, public, auth' = any(list_config)) then
    raise exception 'list_board_posts search_path is not fixed';
  end if;
end $$;

-- Anonymous callers cannot read or mutate.
set local role anon;
do $$
begin
  begin perform 1 from public.board_posts; raise exception 'anon read board_posts';
  exception when insufficient_privilege then null; end;
  begin perform public.list_board_posts('54000000-0000-4000-8000-000000000001', null, null, 20); raise exception 'anon listed posts';
  exception when insufficient_privilege then null; end;
  begin perform public.create_board_post('54000000-0000-4000-8000-000000000001', 'anon'); raise exception 'anon created post';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Owner sees only Club A and creates normalized content.
set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
do $$
declare
  clubs jsonb;
  first_post jsonb;
  second_post jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(item)), '[]'::jsonb)
  into clubs from public.list_my_board_clubs() as item;
  if jsonb_array_length(clubs) <> 1
     or clubs->0->>'club_id' <> '54000000-0000-4000-8000-000000000001' then
    raise exception 'board club list leaked another tenant';
  end if;

  first_post := public.create_board_post(
    '54000000-0000-4000-8000-000000000001',
    E'  第一行\r\n第二行  '
  );
  second_post := public.create_board_post(
    '54000000-0000-4000-8000-000000000001',
    '甲社第二則留言'
  );

  insert into board_security_values values
    ('owner-post-id', first_post->>'id'),
    ('owner-post-created-at', first_post->>'created_at');

  if first_post->>'content' <> E'第一行\n第二行' then
    raise exception 'content was not normalized';
  end if;
  if first_post ? 'club_id' or first_post ? 'auth_user_id'
     or first_post ? 'author_app_account_id' or first_post ? 'person_id'
     or first_post ? 'email' or first_post ? 'deleted_at' or first_post ? 'status' then
    raise exception 'create projection leaked authority or sensitive fields';
  end if;
  if not (first_post->>'can_edit')::boolean or not (first_post->>'can_delete')::boolean then
    raise exception 'owner capability flags missing';
  end if;

  begin perform 1 from public.board_posts; raise exception 'authenticated read board_posts directly';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Club B member creates an independent post and stores its RPC projection for cursor testing.
set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000003', true);
do $$
declare result jsonb;
begin
  result := public.create_board_post('54000000-0000-4000-8000-000000000002', '乙社限定留言');
  insert into board_security_values values
    ('club-b-post-id', result->>'id'),
    ('club-b-post-created-at', result->>'created_at');
end $$;
reset role;

-- Club A cannot create/list Club B, cannot use Club B cursor, and pagination is deterministic.
set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
do $$
declare
  listed jsonb;
  first_page jsonb;
  second_page jsonb;
  cursor_payload jsonb;
  b_id uuid := (select value::uuid from board_security_values where key = 'club-b-post-id');
  b_created_at timestamptz := (select value::timestamptz from board_security_values where key = 'club-b-post-created-at');
begin
  begin perform public.create_board_post('54000000-0000-4000-8000-000000000002', '跨社建立');
    raise exception 'Club A member created Club B post';
  exception when insufficient_privilege then null; end;

  begin perform public.list_board_posts('54000000-0000-4000-8000-000000000002', null, null, 20);
    raise exception 'Club A member listed Club B posts';
  exception when insufficient_privilege then null; end;

  listed := public.list_board_posts('54000000-0000-4000-8000-000000000001', null, null, 50);
  if exists (
    select 1 from jsonb_array_elements(listed->'posts') as item
    where (item->>'id')::uuid = b_id
  ) then raise exception 'Club B post leaked into Club A list'; end if;

  begin
    perform public.list_board_posts('54000000-0000-4000-8000-000000000001', b_created_at, b_id, 20);
    raise exception 'cross-club cursor accepted';
  exception when invalid_parameter_value then null; end;

  first_page := public.list_board_posts('54000000-0000-4000-8000-000000000001', null, null, 1);
  cursor_payload := first_page->'next_cursor';
  if jsonb_array_length(first_page->'posts') <> 1 or cursor_payload is null then
    raise exception 'board pagination did not return a bounded page and cursor';
  end if;

  second_page := public.list_board_posts(
    '54000000-0000-4000-8000-000000000001',
    (cursor_payload->>'created_at')::timestamptz,
    (cursor_payload->>'id')::uuid,
    1
  );
  if jsonb_array_length(second_page->'posts') <> 1
     or second_page->'posts'->0->>'id' = first_page->'posts'->0->>'id' then
    raise exception 'board cursor repeated or skipped the expected next row';
  end if;
end $$;
reset role;

-- Invalid content, malformed cursor pairs, and limits are rejected.
set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
do $$
begin
  begin perform public.create_board_post('54000000-0000-4000-8000-000000000001', '   '); raise exception 'blank content accepted';
  exception when invalid_parameter_value then null; end;
  begin perform public.create_board_post('54000000-0000-4000-8000-000000000001', repeat('字', 1001)); raise exception 'over-limit content accepted';
  exception when invalid_parameter_value then null; end;
  begin perform public.list_board_posts('54000000-0000-4000-8000-000000000001', null, null, 0); raise exception 'invalid limit accepted';
  exception when invalid_parameter_value then null; end;
  begin perform public.list_board_posts('54000000-0000-4000-8000-000000000001', now(), null, 20); raise exception 'half cursor accepted';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;

-- Same-club non-owner cannot update or delete the owner's post.
set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000002', true);
do $$
declare post_id uuid := (select value::uuid from board_security_values where key = 'owner-post-id');
begin
  begin perform public.update_own_board_post('54000000-0000-4000-8000-000000000001', post_id, '越權更新');
    raise exception 'non-owner updated post';
  exception when no_data_found then null; end;
  begin perform public.delete_own_board_post('54000000-0000-4000-8000-000000000001', post_id);
    raise exception 'non-owner deleted post';
  exception when no_data_found then null; end;
end $$;
reset role;

-- Owner can update and soft-delete; deleted posts disappear from list.
set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
do $$
declare
  post_id uuid := (select value::uuid from board_security_values where key = 'owner-post-id');
  updated jsonb;
  listed jsonb;
begin
  updated := public.update_own_board_post(
    '54000000-0000-4000-8000-000000000001', post_id, '更新後內容'
  );
  if updated->>'content' <> '更新後內容' then raise exception 'owner update failed'; end if;

  perform public.delete_own_board_post('54000000-0000-4000-8000-000000000001', post_id);
  listed := public.list_board_posts('54000000-0000-4000-8000-000000000001', null, null, 50);
  if exists (
    select 1 from jsonb_array_elements(listed->'posts') as item
    where (item->>'id')::uuid = post_id
  ) then raise exception 'soft-deleted post remained visible'; end if;
end $$;
reset role;

-- Database-controlled tenant, author, creation time, and hard-delete protection cannot be bypassed.
do $$
declare post_id uuid := (select value::uuid from board_security_values where key = 'owner-post-id');
begin
  begin
    update public.board_posts
    set club_id = '54000000-0000-4000-8000-000000000002'
    where id = post_id;
    raise exception 'board post club changed directly';
  exception when check_violation then null; end;

  begin
    delete from public.board_posts where id = post_id;
    raise exception 'board post was hard deleted';
  exception when insufficient_privilege then null; end;
end $$;

rollback;
