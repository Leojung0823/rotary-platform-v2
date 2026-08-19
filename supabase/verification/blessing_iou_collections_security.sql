-- Blessing IOU collection authorization, partial/batch receipt, immutable
-- correction history, and member-lock verification. Local Supabase only.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '1b000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'collection-author@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1b000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'collection-peer@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1b000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'collection-finance@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1b000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'collection-outsider@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1b000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'collection-platform@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('2b000000-0000-4000-8000-000000000001', '收款作者', 'collection-author@example.test'),
  ('2b000000-0000-4000-8000-000000000002', '收款同社社員', 'collection-peer@example.test'),
  ('2b000000-0000-4000-8000-000000000003', '收款財務', 'collection-finance@example.test'),
  ('2b000000-0000-4000-8000-000000000004', '收款外社社員', 'collection-outsider@example.test'),
  ('2b000000-0000-4000-8000-000000000005', '收款純平台管理員', 'collection-platform@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('3b000000-0000-4000-8000-000000000001', '1b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001', 'collection-author@example.test', '收款作者', 'active'),
  ('3b000000-0000-4000-8000-000000000002', '1b000000-0000-4000-8000-000000000002', '2b000000-0000-4000-8000-000000000002', 'collection-peer@example.test', '收款同社社員', 'active'),
  ('3b000000-0000-4000-8000-000000000003', '1b000000-0000-4000-8000-000000000003', '2b000000-0000-4000-8000-000000000003', 'collection-finance@example.test', '收款財務', 'active'),
  ('3b000000-0000-4000-8000-000000000004', '1b000000-0000-4000-8000-000000000004', '2b000000-0000-4000-8000-000000000004', 'collection-outsider@example.test', '收款外社社員', 'active'),
  ('3b000000-0000-4000-8000-000000000005', '1b000000-0000-4000-8000-000000000005', '2b000000-0000-4000-8000-000000000005', 'collection-platform@example.test', '收款純平台管理員', 'active');

insert into public.clubs (
  id, club_code, club_name, timezone_name, club_status, activated_at
) values
  ('4b000000-0000-4000-8000-000000000001', 'COLLECT-A', '收款測試甲社', 'Asia/Taipei', 'active', now()),
  ('4b000000-0000-4000-8000-000000000002', 'COLLECT-B', '收款測試乙社', 'Asia/Taipei', 'active', now());

insert into public.club_memberships (
  id, club_id, person_id, membership_status
) values
  ('5b000000-0000-4000-8000-000000000001', '4b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001', 'active'),
  ('5b000000-0000-4000-8000-000000000002', '4b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000002', 'active'),
  ('5b000000-0000-4000-8000-000000000003', '4b000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000003', 'active'),
  ('5b000000-0000-4000-8000-000000000004', '4b000000-0000-4000-8000-000000000002', '2b000000-0000-4000-8000-000000000004', 'active');

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status
) values (
  '6b000000-0000-4000-8000-000000000001',
  '4b000000-0000-4000-8000-000000000001',
  '3b000000-0000-4000-8000-000000000003',
  'finance',
  'active'
);

insert into public.platform_roles (id, app_account_id, role_key) values (
  '7b000000-0000-4000-8000-000000000001',
  '3b000000-0000-4000-8000-000000000005',
  'platform_admin'
);

create temporary table blessing_iou_collection_test_values (
  key text primary key,
  value text not null
);
grant select, insert, update on blessing_iou_collection_test_values to authenticated;
insert into blessing_iou_collection_test_values values (
  'period-month', to_char(date_trunc('month', current_date), 'YYYY-MM-DD')
);

-- Schema is RPC-only, search paths are fixed, and collection permission does
-- not accidentally grant direct table mutation.
do $$
declare function_config text[];
begin
  if not exists (
    select 1 from pg_catalog.pg_class
    where oid = 'public.blessing_iou_collections'::regclass and relrowsecurity
  ) then raise exception 'blessing_iou_collections RLS is not enabled'; end if;
  if has_table_privilege('authenticated', 'public.blessing_iou_collections', 'SELECT')
     or has_table_privilege('authenticated', 'public.blessing_iou_collections', 'INSERT')
     or has_table_privilege('authenticated', 'public.blessing_iou_collections', 'UPDATE')
     or has_table_privilege('authenticated', 'public.blessing_iou_collections', 'DELETE') then
    raise exception 'browser gained direct collection table access';
  end if;
  if has_function_privilege('anon', 'public.get_blessing_iou_collection_context(uuid,date)', 'EXECUTE')
     or has_function_privilege('anon', 'public.record_blessing_iou_collections(uuid,date,date,text,text,jsonb)', 'EXECUTE') then
    raise exception 'anonymous role gained collection RPC access';
  end if;
  if not has_function_privilege('authenticated', 'public.get_blessing_iou_collection_context(uuid,date)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.record_blessing_iou_collections(uuid,date,date,text,text,jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.reverse_blessing_iou_collection(uuid,uuid,date,text)', 'EXECUTE') then
    raise exception 'authenticated collection RPC grants are incomplete';
  end if;
  select proconfig into function_config
  from pg_catalog.pg_proc
  where oid = 'public.record_blessing_iou_collections(uuid,date,date,text,text,jsonb)'::regprocedure;
  if function_config is null
     or not ('search_path=pg_catalog, public, auth' = any(function_config)) then
    raise exception 'collection record RPC search_path is not fixed';
  end if;
  if not exists (
    select 1 from public.role_permissions
    where role_key = 'finance' and permission_key = 'blessing_iou.collect'
  ) then raise exception 'finance collection permission is missing'; end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.platform_feature_flags'::regclass
      and pg_get_constraintdef(oid) like '%blessing_iou_collections_v1%'
  ) then raise exception 'collection rollout key is missing'; end if;
end $$;

-- Two members create this month's promises.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1b000000-0000-4000-8000-000000000001', true);
do $$
declare entry jsonb;
begin
  entry := public.create_blessing_iou_entry(
    '4b000000-0000-4000-8000-000000000001', '作者部分收款測試', 1000, true
  );
  insert into blessing_iou_collection_test_values values ('author-entry-id', entry->>'id');
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '1b000000-0000-4000-8000-000000000002', true);
do $$
declare entry jsonb;
begin
  entry := public.create_blessing_iou_entry(
    '4b000000-0000-4000-8000-000000000001', '同社社員全額收款測試', 2000, true
  );
  insert into blessing_iou_collection_test_values values ('peer-entry-id', entry->>'id');
end $$;
reset role;

-- Finance can atomically record a partial and a full payment in one batch.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1b000000-0000-4000-8000-000000000003', true);
do $$
declare
  context jsonb;
  author_entry jsonb;
  peer_entry jsonb;
  partial_collection_id text;
begin
  context := public.record_blessing_iou_collections(
    '4b000000-0000-4000-8000-000000000001',
    (select value::date from blessing_iou_collection_test_values where key = 'period-month'),
    current_date,
    'transfer',
    '末五碼 12345',
    jsonb_build_array(
      jsonb_build_object(
        'entry_id', (select value from blessing_iou_collection_test_values where key = 'author-entry-id'),
        'amount', 400
      ),
      jsonb_build_object(
        'entry_id', (select value from blessing_iou_collection_test_values where key = 'peer-entry-id'),
        'amount', 2000
      )
    )
  );

  select item into author_entry from jsonb_array_elements(context->'entries') as item
    where item->>'entry_id' = (select value from blessing_iou_collection_test_values where key = 'author-entry-id');
  select item into peer_entry from jsonb_array_elements(context->'entries') as item
    where item->>'entry_id' = (select value from blessing_iou_collection_test_values where key = 'peer-entry-id');
  if (context->'summary'->>'pledged_amount')::numeric <> 3000
     or (context->'summary'->>'received_amount')::numeric <> 2400
     or (context->'summary'->>'outstanding_amount')::numeric <> 600
     or author_entry->>'collection_status' <> 'partial'
     or (author_entry->>'outstanding_amount')::numeric <> 600
     or peer_entry->>'collection_status' <> 'paid'
     or jsonb_array_length(context->'collections') <> 2 then
    raise exception 'partial/full batch projection is incorrect';
  end if;
  select item->>'collection_id' into partial_collection_id
  from jsonb_array_elements(context->'collections') as item
  where item->>'entry_id' = (select value from blessing_iou_collection_test_values where key = 'author-entry-id');
  insert into blessing_iou_collection_test_values values ('partial-collection-id', partial_collection_id);
end $$;
reset role;

-- A batch that would over-collect one item rejects the entire batch.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1b000000-0000-4000-8000-000000000003', true);
do $$
declare
  before_count integer;
  context jsonb;
begin
  context := public.get_blessing_iou_collection_context(
    '4b000000-0000-4000-8000-000000000001',
    (select value::date from blessing_iou_collection_test_values where key = 'period-month')
  );
  before_count := jsonb_array_length(context->'collections');
  begin
    perform public.record_blessing_iou_collections(
      '4b000000-0000-4000-8000-000000000001',
      (select value::date from blessing_iou_collection_test_values where key = 'period-month'),
      current_date,
      'cash',
      null,
      jsonb_build_array(
        jsonb_build_object(
          'entry_id', (select value from blessing_iou_collection_test_values where key = 'author-entry-id'),
          'amount', 100
        ),
        jsonb_build_object(
          'entry_id', (select value from blessing_iou_collection_test_values where key = 'peer-entry-id'),
          'amount', 1
        )
      )
    );
    raise exception 'over-collection batch was accepted';
  exception when invalid_parameter_value then null;
  end;
  context := public.get_blessing_iou_collection_context(
    '4b000000-0000-4000-8000-000000000001',
    (select value::date from blessing_iou_collection_test_values where key = 'period-month')
  );
  if jsonb_array_length(context->'collections') <> before_count then
    raise exception 'failed batch inserted a partial collection';
  end if;
end $$;
reset role;

-- Once any collection exists, the public wall exposes no payment state and
-- the author can no longer edit or cancel the original promise.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1b000000-0000-4000-8000-000000000001', true);
do $$
declare
  listed jsonb := public.list_blessing_iou_entries(
    '4b000000-0000-4000-8000-000000000001', null, null, 20
  );
  own_entry jsonb;
begin
  select item into own_entry from jsonb_array_elements(listed->'entries') as item
    where item->>'id' = (select value from blessing_iou_collection_test_values where key = 'author-entry-id');
  if (own_entry->>'can_edit')::boolean
     or (own_entry->>'can_delete')::boolean
     or own_entry ? 'collection_status'
     or own_entry ? 'received_amount'
     or own_entry ? 'outstanding_amount' then
    raise exception 'member wall leaked collection state or retained mutation controls';
  end if;
  begin
    perform public.update_own_blessing_iou_entry(
      '4b000000-0000-4000-8000-000000000001',
      (select value::uuid from blessing_iou_collection_test_values where key = 'author-entry-id'),
      '收款後越權修改', 1000, true
    );
    raise exception 'member updated a collected promise';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    perform public.delete_blessing_iou_entry(
      '4b000000-0000-4000-8000-000000000001',
      (select value::uuid from blessing_iou_collection_test_values where key = 'author-entry-id'),
      null
    );
    raise exception 'member deleted a collected promise';
  exception when object_not_in_prerequisite_state then null;
  end;
end $$;
reset role;

-- Cross-club and pure platform authority cannot inspect or mutate receipts.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1b000000-0000-4000-8000-000000000004', true);
do $$
begin
  begin
    perform public.get_blessing_iou_collection_context(
      '4b000000-0000-4000-8000-000000000001',
      (select value::date from blessing_iou_collection_test_values where key = 'period-month')
    );
    raise exception 'cross-club member read collection context';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '1b000000-0000-4000-8000-000000000005', true);
do $$
declare flag record;
begin
  select * into flag from public.set_platform_feature_flag(
    'blessing_iou_collections_v1', true, array['local'], 100
  );
  if flag.feature_key <> 'blessing_iou_collections_v1' or not flag.enabled then
    raise exception 'platform administrator could not configure collection rollout';
  end if;
  begin
    perform public.get_blessing_iou_collection_context(
      '4b000000-0000-4000-8000-000000000001',
      (select value::date from blessing_iou_collection_test_values where key = 'period-month')
    );
    raise exception 'platform-only identity read club collections';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.reverse_blessing_iou_collection(
      '4b000000-0000-4000-8000-000000000001',
      (select value::uuid from blessing_iou_collection_test_values where key = 'partial-collection-id'),
      (select value::date from blessing_iou_collection_test_values where key = 'period-month'),
      '平台越權沖銷'
    );
    raise exception 'platform-only identity reversed a club collection';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Finance reverses the partial receipt. Effective totals change, but the
-- original promise remains locked because accounting history exists.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1b000000-0000-4000-8000-000000000003', true);
do $$
declare context jsonb;
begin
  context := public.reverse_blessing_iou_collection(
    '4b000000-0000-4000-8000-000000000001',
    (select value::uuid from blessing_iou_collection_test_values where key = 'partial-collection-id'),
    (select value::date from blessing_iou_collection_test_values where key = 'period-month'),
    '轉帳重複登錄'
  );
  if (context->'summary'->>'received_amount')::numeric <> 2000
     or (context->'summary'->>'outstanding_amount')::numeric <> 1000
     or not exists (
       select 1 from jsonb_array_elements(context->'collections') as item
       where item->>'collection_id' = (
         select value from blessing_iou_collection_test_values where key = 'partial-collection-id'
       ) and item->>'collection_status' = 'reversed'
         and item->>'reversal_reason' = '轉帳重複登錄'
     ) then
    raise exception 'collection reversal projection is incorrect';
  end if;
  begin
    perform public.delete_blessing_iou_entry(
      '4b000000-0000-4000-8000-000000000001',
      (select value::uuid from blessing_iou_collection_test_values where key = 'author-entry-id'),
      '沖銷後嘗試刪除'
    );
    raise exception 'manager deleted a promise after reversed collection history';
  exception when object_not_in_prerequisite_state then null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '1b000000-0000-4000-8000-000000000001', true);
do $$
begin
  begin
    perform public.update_own_blessing_iou_entry(
      '4b000000-0000-4000-8000-000000000001',
      (select value::uuid from blessing_iou_collection_test_values where key = 'author-entry-id'),
      '沖銷後仍不可修改', 1000, true
    );
    raise exception 'member updated a promise after reversal';
  exception when object_not_in_prerequisite_state then null;
  end;
end $$;
reset role;

-- Even owner-level direct SQL cannot rewrite or delete collection history.
do $$
declare target_id uuid := (
  select value::uuid from blessing_iou_collection_test_values where key = 'partial-collection-id'
);
begin
  begin
    update public.blessing_iou_collections set amount_received = 1 where id = target_id;
    raise exception 'collection amount was rewritten';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    delete from public.blessing_iou_collections where id = target_id;
    raise exception 'collection row was deleted';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
