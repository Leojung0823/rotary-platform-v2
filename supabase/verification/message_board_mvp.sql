-- Authenticated Message Board MVP verification.
-- Run only against Supabase local. All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'board-owner@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'board-other@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email, avatar_url) values
  ('22000000-0000-0000-0000-000000000001', '留言擁有者', 'board-owner@example.test', 'https://example.test/owner.png'),
  ('22000000-0000-0000-0000-000000000002', '其他使用者', 'board-other@example.test', null);

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name
) values
  ('32000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', 'board-owner@example.test', '留言擁有者'),
  ('32000000-0000-0000-0000-000000000002', '12000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 'board-other@example.test', '其他使用者');

create temporary table board_values (key text primary key, value text not null);
grant select, insert, update on board_values to authenticated;

-- Schema, RLS, function boundary and exact privilege checks.
do $$
declare
  list_config text[];
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

  if has_function_privilege('anon', 'public.list_board_posts(timestamptz,uuid,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.create_board_post(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.update_own_board_post(uuid,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.delete_own_board_post(uuid)', 'EXECUTE') then
    raise exception 'anon gained board RPC execute';
  end if;

  if not has_function_privilege('authenticated', 'public.list_board_posts(timestamptz,uuid,integer)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.create_board_post(text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.update_own_board_post(uuid,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.delete_own_board_post(uuid)', 'EXECUTE') then
    raise exception 'authenticated board RPC grant missing';
  end if;

  select proconfig into list_config
  from pg_catalog.pg_proc
  where oid = 'public.list_board_posts(timestamptz,uuid,integer)'::regprocedure;
  if list_config is null or not ('search_path=pg_catalog, public, auth' = any(list_config)) then
    raise exception 'list_board_posts search_path is not fixed';
  end if;

  if (select pronargs from pg_catalog.pg_proc where oid = 'public.create_board_post(text)'::regprocedure) <> 1 then
    raise exception 'create_board_post accepts authority fields';
  end if;
end $$;

-- Anonymous callers cannot read the table or execute RPCs.
set local role anon;
do $$ begin
  begin perform 1 from public.board_posts; raise exception 'anon read board_posts';
  exception when insufficient_privilege then null; end;
  begin perform public.list_board_posts(null, null, 20); raise exception 'anon listed board posts';
  exception when insufficient_privilege then null; end;
  begin perform public.create_board_post('anon post'); raise exception 'anon created board post';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Owner creates a normalized plain-text post; author identity is derived from auth.uid().
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
do $$
declare
  result jsonb;
  post_id uuid;
begin
  result := public.create_board_post(E'  第一行\r\n第二行  ');
  post_id := (result->>'id')::uuid;
  insert into board_values values ('owner-post-id', post_id::text);

  if result->>'content' <> E'第一行\n第二行' then raise exception 'content was not normalized'; end if;
  if result ? 'auth_user_id' or result ? 'author_app_account_id' or result ? 'person_id'
     or result ? 'email' or result ? 'deleted_at' or result ? 'status' then
    raise exception 'create projection leaked sensitive fields';
  end if;
  if not (result->>'can_edit')::boolean or not (result->>'can_delete')::boolean then
    raise exception 'owner capability flags missing';
  end if;
end $$;
reset role;

do $$
declare post_id uuid := (select value::uuid from board_values where key = 'owner-post-id');
begin
  if (select author_app_account_id from public.board_posts where id = post_id)
     <> '32000000-0000-0000-0000-000000000001' then
    raise exception 'author was not derived from authenticated account';
  end if;
end $$;

-- Invalid content is rejected by RPC and database constraints.
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
do $$ begin
  begin perform public.create_board_post('   '); raise exception 'blank content accepted';
  exception when invalid_parameter_value then null; end;
  begin perform public.create_board_post(repeat('字', 1001)); raise exception 'over-limit content accepted';
  exception when invalid_parameter_value then null; end;
  begin perform public.list_board_posts(null, null, 0); raise exception 'invalid limit accepted';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;

-- Owner update preserves author/created_at and advances database-controlled updated_at.
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
do $$
declare
  post_id uuid := (select value::uuid from board_values where key = 'owner-post-id');
  before_row public.board_posts;
  result jsonb;
begin
  select * into before_row from public.board_posts where id = post_id;
  perform pg_sleep(0.01);
  result := public.update_own_board_post(post_id, '更新後內容');
  if result->>'content' <> '更新後內容' then raise exception 'owner update failed'; end if;
  if (select author_app_account_id from public.board_posts where id = post_id) <> before_row.author_app_account_id then
    raise exception 'author changed during edit';
  end if;
  if (select created_at from public.board_posts where id = post_id) <> before_row.created_at then
    raise exception 'created_at changed during edit';
  end if;
  if (select updated_at from public.board_posts where id = post_id) <= before_row.updated_at then
    raise exception 'updated_at did not advance';
  end if;
end $$;
reset role;

-- Non-owner update/delete fail with the same not-available classification.
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000002', true);
do $$
declare post_id uuid := (select value::uuid from board_values where key = 'owner-post-id');
begin
  begin perform public.update_own_board_post(post_id, '越權更新'); raise exception 'non-owner updated post';
  exception when no_data_found then null; end;
  begin perform public.delete_own_board_post(post_id); raise exception 'non-owner deleted post';
  exception when no_data_found then null; end;
end $$;
reset role;

-- Stable keyset pagination uses created_at DESC, id DESC and excludes sensitive fields.
insert into public.board_posts (id, author_app_account_id, content, created_at, updated_at) values
  ('42000000-0000-4000-8000-000000000010', '32000000-0000-0000-0000-000000000001', '同時留言 A', now() + interval '1 day', now() + interval '1 day'),
  ('42000000-0000-4000-8000-000000000011', '32000000-0000-0000-0000-000000000002', '同時留言 B', now() + interval '1 day', now() + interval '1 day');

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
do $$
declare
  first_page jsonb;
  second_page jsonb;
  cursor_value jsonb;
  first_id uuid;
  second_id uuid;
begin
  first_page := public.list_board_posts(null, null, 1);
  first_id := (first_page->'posts'->0->>'id')::uuid;
  cursor_value := first_page->'next_cursor';
  if first_id <> '42000000-0000-4000-8000-000000000011' then
    raise exception 'same-timestamp ID tie-breaker is unstable';
  end if;
  if cursor_value is null or (cursor_value->>'v')::integer <> 1 then raise exception 'next cursor missing'; end if;

  second_page := public.list_board_posts(
    (cursor_value->>'created_at')::timestamptz,
    (cursor_value->>'id')::uuid,
    1
  );
  second_id := (second_page->'posts'->0->>'id')::uuid;
  if second_id <> '42000000-0000-4000-8000-000000000010' or second_id = first_id then
    raise exception 'cursor pagination duplicated or skipped same-timestamp row';
  end if;
  if first_page->'posts'->0 ? 'auth_user_id'
     or first_page->'posts'->0 ? 'author_app_account_id'
     or first_page->'posts'->0 ? 'person_id'
     or first_page->'posts'->0 ? 'email'
     or first_page->'posts'->0 ? 'status'
     or first_page->'posts'->0 ? 'deleted_at' then
    raise exception 'list projection leaked sensitive fields';
  end if;

  begin
    perform public.list_board_posts(now(), '42000000-0000-4000-8000-000000000010', 1);
    raise exception 'cursor timestamp/id integrity mismatch accepted';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;

-- Owner soft-delete retains the row, removes it from active list, and cannot be repeated or restored.
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
do $$
declare
  post_id uuid := (select value::uuid from board_values where key = 'owner-post-id');
  listed jsonb;
begin
  perform public.delete_own_board_post(post_id);
  if not exists (
    select 1 from public.board_posts where id = post_id and status = 'deleted' and deleted_at is not null
  ) then raise exception 'soft delete did not preserve deleted row'; end if;

  listed := public.list_board_posts(null, null, 50);
  if exists (
    select 1 from jsonb_array_elements(listed->'posts') as item where (item->>'id')::uuid = post_id
  ) then raise exception 'deleted row remained in active list'; end if;

  begin perform public.update_own_board_post(post_id, 'restore'); raise exception 'deleted post updated';
  exception when no_data_found then null; end;
  begin perform public.delete_own_board_post(post_id); raise exception 'repeated delete did not use generic not-available';
  exception when no_data_found then null; end;
end $$;
reset role;

-- Database constraints/triggers prevent invalid status, inconsistent deletion, hard delete and immutable-field changes.
do $$
declare post_id uuid := (select value::uuid from board_values where key = 'owner-post-id');
begin
  begin
    insert into public.board_posts (author_app_account_id, content, status)
    values ('32000000-0000-0000-0000-000000000001', 'bad status', 'hidden');
    raise exception 'invalid status accepted';
  exception when check_violation then null; end;

  begin
    insert into public.board_posts (author_app_account_id, content, status, deleted_at)
    values ('32000000-0000-0000-0000-000000000001', 'bad deletion', 'deleted', null);
    raise exception 'deleted_at consistency violated';
  exception when check_violation then null; end;

  begin delete from public.board_posts where id = post_id; raise exception 'hard delete accepted';
  exception when insufficient_privilege then null; end;

  begin
    update public.board_posts set author_app_account_id = '32000000-0000-0000-0000-000000000002' where id = post_id;
    raise exception 'author mutation accepted';
  exception when check_violation then null; end;

  begin
    update public.board_posts set created_at = created_at - interval '1 day' where id = post_id;
    raise exception 'created_at mutation accepted';
  exception when check_violation then null; end;

  begin
    update public.board_posts set status = 'active' where id = post_id;
    raise exception 'deleted post restore accepted';
  exception when check_violation then null; end;
end $$;

-- Disabled accounts retain history but cannot list or mutate.
update public.app_accounts
set account_status = 'disabled'
where id = '32000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
do $$ begin
  begin perform public.list_board_posts(null, null, 20); raise exception 'disabled account listed posts';
  exception when insufficient_privilege then null; end;
  begin perform public.create_board_post('disabled account post'); raise exception 'disabled account created post';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
