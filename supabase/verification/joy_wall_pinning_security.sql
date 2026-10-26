-- Joy Wall pinning is officer-only, club-wide, bounded, and never reveals
-- selected/private shares or IOUs. Synthetic data is rolled back.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'a8100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'joy-pin-president@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a8100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'joy-pin-author@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a8100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'joy-pin-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a8100000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'joy-pin-outsider@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('a8200000-0000-4000-8000-000000000001', '置頂社長', 'joy-pin-president@example.test'),
  ('a8200000-0000-4000-8000-000000000002', '置頂作者', 'joy-pin-author@example.test'),
  ('a8200000-0000-4000-8000-000000000003', '一般社員', 'joy-pin-member@example.test'),
  ('a8200000-0000-4000-8000-000000000004', '外社社員', 'joy-pin-outsider@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('a8300000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000001', 'a8200000-0000-4000-8000-000000000001', 'joy-pin-president@example.test', '置頂社長', 'active'),
  ('a8300000-0000-4000-8000-000000000002', 'a8100000-0000-4000-8000-000000000002', 'a8200000-0000-4000-8000-000000000002', 'joy-pin-author@example.test', '置頂作者', 'active'),
  ('a8300000-0000-4000-8000-000000000003', 'a8100000-0000-4000-8000-000000000003', 'a8200000-0000-4000-8000-000000000003', 'joy-pin-member@example.test', '一般社員', 'active'),
  ('a8300000-0000-4000-8000-000000000004', 'a8100000-0000-4000-8000-000000000004', 'a8200000-0000-4000-8000-000000000004', 'joy-pin-outsider@example.test', '外社社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('a8500000-0000-4000-8000-000000000001', 'JOY-PIN-A', '置頂安全甲社', 'active', now()),
  ('a8500000-0000-4000-8000-000000000002', 'JOY-PIN-B', '置頂安全乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status) values
  ('a8600000-0000-4000-8000-000000000001', 'a8500000-0000-4000-8000-000000000001', 'a8200000-0000-4000-8000-000000000001', 'active'),
  ('a8600000-0000-4000-8000-000000000002', 'a8500000-0000-4000-8000-000000000001', 'a8200000-0000-4000-8000-000000000002', 'active'),
  ('a8600000-0000-4000-8000-000000000003', 'a8500000-0000-4000-8000-000000000001', 'a8200000-0000-4000-8000-000000000003', 'active'),
  ('a8600000-0000-4000-8000-000000000004', 'a8500000-0000-4000-8000-000000000002', 'a8200000-0000-4000-8000-000000000004', 'active');

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values (
  'a8700000-0000-4000-8000-000000000001', 'a8500000-0000-4000-8000-000000000001',
  'a8300000-0000-4000-8000-000000000001', 'president', 'active', 'a8300000-0000-4000-8000-000000000001'
);

create temporary table joy_pin_test_posts (kind text not null, post_id uuid not null primary key);
grant select, insert on joy_pin_test_posts to authenticated;

do $$
begin
  if has_table_privilege('anon', 'public.joy_posts', 'UPDATE')
    or has_table_privilege('authenticated', 'public.joy_posts', 'UPDATE')
    or has_function_privilege('anon', 'public.set_joy_post_pinned(uuid,uuid,boolean)', 'EXECUTE')
    or has_function_privilege('anon', 'public.list_pinned_joy_posts(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.list_joy_posts(uuid,timestamptz,uuid,integer,boolean,uuid[])', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.list_joy_posts_with_interaction_deadlines(uuid,timestamptz,uuid,integer,boolean,uuid[])', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.set_joy_post_pinned(uuid,uuid,boolean)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.list_pinned_joy_posts(uuid)', 'EXECUTE') then
    raise exception 'Joy pin table or RPC grants are incorrect';
  end if;
  if not exists (select 1 from pg_catalog.pg_proc
      where oid = 'public.set_joy_post_pinned(uuid,uuid,boolean)'::regprocedure
        and 'search_path=pg_catalog, public, auth' = any(proconfig))
    or not exists (select 1 from pg_catalog.pg_proc
      where oid = 'public.list_pinned_joy_posts(uuid)'::regprocedure
        and 'search_path=pg_catalog, public, auth' = any(proconfig)) then
    raise exception 'Joy pin RPC search_path is not fixed';
  end if;
  if not exists (select 1 from pg_catalog.pg_indexes
      where schemaname = 'public' and indexname = 'joy_posts_club_pinned_idx') then
    raise exception 'Joy pin lookup index is missing';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a8100000-0000-4000-8000-000000000002', true);
do $$
declare
  created jsonb;
  post_index integer;
begin
  for post_index in 1..7 loop
    created := public.create_joy_post(
      'a8500000-0000-4000-8000-000000000001', 'gratitude', '社內感謝 ' || post_index,
      '這是全社可閱讀的分享。', 'club', '{}'::uuid[]
    );
    insert into joy_pin_test_posts(kind, post_id) values ('club', (created->>'id')::uuid);
  end loop;
  created := public.create_joy_post(
    'a8500000-0000-4000-8000-000000000001', 'blessing', '私人祝福',
    '只有指定對象能看見。', 'private', array['a8600000-0000-4000-8000-000000000003'::uuid]
  );
  insert into joy_pin_test_posts(kind, post_id) values ('private', (created->>'id')::uuid);
  created := public.create_joy_iou(
    'a8500000-0000-4000-8000-000000000001', 'a8600000-0000-4000-8000-000000000003',
    '協助活動攝影', '我會協助整理照片。', null
  );
  insert into joy_pin_test_posts(kind, post_id) values ('iou', (created->>'id')::uuid);
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a8100000-0000-4000-8000-000000000003', true);
do $$
declare
  target_id uuid;
  pin_page jsonb;
begin
  select post_id into target_id from joy_pin_test_posts where kind = 'club' order by post_id limit 1;
  begin
    perform public.set_joy_post_pinned('a8500000-0000-4000-8000-000000000001', target_id, true);
    raise exception 'Ordinary member pinned a Joy post';
  exception when insufficient_privilege then null; end;
  pin_page := public.list_pinned_joy_posts('a8500000-0000-4000-8000-000000000001');
  if jsonb_array_length(pin_page->'posts') <> 0 then
    raise exception 'Ordinary member saw an unpinned post as pinned';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a8100000-0000-4000-8000-000000000001', true);
do $$
declare
  target_id uuid;
  pin_page jsonb;
  observed_limit boolean := false;
begin
  select post_id into target_id from joy_pin_test_posts where kind = 'private';
  begin
    perform public.set_joy_post_pinned('a8500000-0000-4000-8000-000000000001', target_id, true);
    raise exception 'Manager pinned a private post';
  exception when sqlstate '22023' then
    if sqlerrm <> 'joy_post_not_pin_eligible' then raise; end if;
  end;
  select post_id into target_id from joy_pin_test_posts where kind = 'iou';
  begin
    perform public.set_joy_post_pinned('a8500000-0000-4000-8000-000000000001', target_id, true);
    raise exception 'Manager pinned an IOU';
  exception when sqlstate '22023' then
    if sqlerrm <> 'joy_post_not_pin_eligible' then raise; end if;
  end;

  for target_id in
    select post_id from joy_pin_test_posts where kind = 'club' order by post_id limit 5
  loop
    perform public.set_joy_post_pinned('a8500000-0000-4000-8000-000000000001', target_id, true);
  end loop;
  select post_id into target_id from joy_pin_test_posts where kind = 'club' order by post_id offset 5 limit 1;
  begin
    perform public.set_joy_post_pinned('a8500000-0000-4000-8000-000000000001', target_id, true);
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'joy_pin_limit_reached' then raise; end if;
    observed_limit := true;
  end;
  if not observed_limit then raise exception 'The five-post pin limit was not enforced'; end if;

  select post_id into target_id from joy_pin_test_posts where kind = 'club' order by post_id limit 1;
  perform public.set_joy_post_pinned('a8500000-0000-4000-8000-000000000001', target_id, false);
  select post_id into target_id from joy_pin_test_posts where kind = 'club' order by post_id offset 5 limit 1;
  perform public.set_joy_post_pinned('a8500000-0000-4000-8000-000000000001', target_id, true);
  perform public.set_joy_post_pinned('a8500000-0000-4000-8000-000000000001', target_id, true);

  pin_page := public.list_pinned_joy_posts('a8500000-0000-4000-8000-000000000001');
  if jsonb_array_length(pin_page->'posts') <> 5
    or exists (select 1 from jsonb_array_elements(pin_page->'posts') as item
      where item->>'visibility_scope' <> 'club' or item->>'post_type' = 'iou'
        or item->>'is_pinned' <> 'true') then
    raise exception 'Pinned feed included a private, IOU, or unpinned post';
  end if;
end $$;
reset role;

do $$
begin
  if (select count(*) from public.joy_wall_audit_events
      where club_id = 'a8500000-0000-4000-8000-000000000001'
        and event_type in ('post_pinned', 'post_unpinned')) <> 7 then
    raise exception 'Pin and unpin actions were not audited exactly once';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a8100000-0000-4000-8000-000000000003', true);
do $$
declare
  pin_page jsonb;
  club_page jsonb;
begin
  pin_page := public.list_pinned_joy_posts('a8500000-0000-4000-8000-000000000001');
  if jsonb_array_length(pin_page->'posts') <> 5
    or exists (select 1 from jsonb_array_elements(pin_page->'posts') as item
      where item->>'is_pinned' <> 'true' or item->>'visibility_scope' <> 'club') then
    raise exception 'Ordinary club member could not read the bounded public pins';
  end if;
  club_page := public.list_joy_posts_with_interaction_deadlines(
    'a8500000-0000-4000-8000-000000000001', null, null, 20, false
  );
  if not exists (select 1 from jsonb_array_elements(club_page->'posts') as item
      where item->>'is_pinned' = 'true') then
    raise exception 'Normal Joy feed omitted the pin indicator';
  end if;
  begin
    perform public.list_pinned_joy_posts('a8500000-0000-4000-8000-000000000002');
    raise exception 'A member read pinned posts for another club';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a8100000-0000-4000-8000-000000000004', true);
do $$
begin
  begin
    perform public.list_pinned_joy_posts('a8500000-0000-4000-8000-000000000001');
    raise exception 'An outsider read another club pinned posts';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
