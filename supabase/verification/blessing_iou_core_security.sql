-- Blessing IOU core authorization, privacy, lifecycle, and rollout verification.
-- Run against local Supabase only. Every fixture is rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '1a000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'blessing-author@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1a000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'blessing-peer@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1a000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'blessing-finance@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1a000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'blessing-outsider@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1a000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'blessing-platform@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1a000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'blessing-operator@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('2a000000-0000-4000-8000-000000000001', '祝福作者', 'blessing-author@example.test'),
  ('2a000000-0000-4000-8000-000000000002', '同社社員', 'blessing-peer@example.test'),
  ('2a000000-0000-4000-8000-000000000003', '同社財務', 'blessing-finance@example.test'),
  ('2a000000-0000-4000-8000-000000000004', '外社社員', 'blessing-outsider@example.test'),
  ('2a000000-0000-4000-8000-000000000005', '純平台管理員', 'blessing-platform@example.test'),
  ('2a000000-0000-4000-8000-000000000006', '執行秘書', 'blessing-operator@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('3a000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', 'blessing-author@example.test', '祝福作者', 'active'),
  ('3a000000-0000-4000-8000-000000000002', '1a000000-0000-4000-8000-000000000002', '2a000000-0000-4000-8000-000000000002', 'blessing-peer@example.test', '同社社員', 'active'),
  ('3a000000-0000-4000-8000-000000000003', '1a000000-0000-4000-8000-000000000003', '2a000000-0000-4000-8000-000000000003', 'blessing-finance@example.test', '同社財務', 'active'),
  ('3a000000-0000-4000-8000-000000000004', '1a000000-0000-4000-8000-000000000004', '2a000000-0000-4000-8000-000000000004', 'blessing-outsider@example.test', '外社社員', 'active'),
  ('3a000000-0000-4000-8000-000000000005', '1a000000-0000-4000-8000-000000000005', '2a000000-0000-4000-8000-000000000005', 'blessing-platform@example.test', '純平台管理員', 'active'),
  ('3a000000-0000-4000-8000-000000000006', '1a000000-0000-4000-8000-000000000006', '2a000000-0000-4000-8000-000000000006', 'blessing-operator@example.test', '執行秘書', 'active');

insert into public.clubs (
  id, club_code, club_name, timezone_name, club_status, activated_at
) values
  ('4a000000-0000-4000-8000-000000000001', 'BLESS-A', '祝福測試甲社', 'Asia/Taipei', 'active', now()),
  ('4a000000-0000-4000-8000-000000000002', 'BLESS-B', '祝福測試乙社', 'Asia/Taipei', 'active', now());

insert into public.club_memberships (
  id, club_id, person_id, membership_status
) values
  ('5a000000-0000-4000-8000-000000000001', '4a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', 'active'),
  ('5a000000-0000-4000-8000-000000000002', '4a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000002', 'active'),
  ('5a000000-0000-4000-8000-000000000003', '4a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000003', 'active'),
  ('5a000000-0000-4000-8000-000000000004', '4a000000-0000-4000-8000-000000000002', '2a000000-0000-4000-8000-000000000004', 'active');

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status
) values (
  '6a000000-0000-4000-8000-000000000001',
  '4a000000-0000-4000-8000-000000000001',
  '3a000000-0000-4000-8000-000000000003',
  'finance',
  'active'
);

insert into public.platform_roles (
  id, app_account_id, role_key
) values (
  '7a000000-0000-4000-8000-000000000001',
  '3a000000-0000-4000-8000-000000000005',
  'platform_admin'
);

insert into public.club_operator_permissions (
  id, club_id, app_account_id, operator_role_key, permission_level,
  assignment_status, starts_at
) values (
  '8a000000-0000-4000-8000-000000000001',
  '4a000000-0000-4000-8000-000000000001',
  '3a000000-0000-4000-8000-000000000006',
  'executive_secretary',
  'club_manager',
  'active',
  now() - interval '1 day'
);

create temporary table blessing_iou_test_values (
  key text primary key,
  value text not null
);
grant select, insert, update on blessing_iou_test_values to authenticated;

-- Schema, grants, fixed search paths, and the new rollout key are all present.
do $$
declare
  list_config text[];
begin
  if not exists (
    select 1 from pg_catalog.pg_class
    where oid = 'public.blessing_iou_entries'::regclass and relrowsecurity
  ) then raise exception 'blessing_iou_entries RLS is not enabled'; end if;
  if not exists (
    select 1 from pg_catalog.pg_class
    where oid = 'public.club_blessing_iou_settings'::regclass and relrowsecurity
  ) then raise exception 'club_blessing_iou_settings RLS is not enabled'; end if;

  if has_table_privilege('authenticated', 'public.blessing_iou_entries', 'SELECT')
     or has_table_privilege('authenticated', 'public.blessing_iou_entries', 'INSERT')
     or has_table_privilege('authenticated', 'public.blessing_iou_entries', 'UPDATE')
     or has_table_privilege('authenticated', 'public.blessing_iou_entries', 'DELETE')
     or has_table_privilege('authenticated', 'public.club_blessing_iou_settings', 'SELECT')
     or has_table_privilege('authenticated', 'public.club_blessing_iou_settings', 'INSERT')
     or has_table_privilege('authenticated', 'public.club_blessing_iou_settings', 'UPDATE')
     or has_table_privilege('authenticated', 'public.club_blessing_iou_settings', 'DELETE') then
    raise exception 'browser role gained direct blessing IOU table access';
  end if;

  if has_function_privilege('anon', 'public.list_blessing_iou_entries(uuid,timestamptz,uuid,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.create_blessing_iou_entry(uuid,text,numeric,boolean)', 'EXECUTE') then
    raise exception 'anonymous role gained blessing IOU RPC access';
  end if;

  if not has_function_privilege('authenticated', 'public.list_my_blessing_iou_clubs()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.list_blessing_iou_entries(uuid,timestamptz,uuid,integer)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.create_blessing_iou_entry(uuid,text,numeric,boolean)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.update_own_blessing_iou_entry(uuid,uuid,text,numeric,boolean)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.delete_blessing_iou_entry(uuid,uuid,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.set_blessing_iou_amount_visibility(uuid,boolean)', 'EXECUTE') then
    raise exception 'authenticated blessing IOU RPC grant missing';
  end if;

  select proconfig into list_config
  from pg_catalog.pg_proc
  where oid = 'public.list_blessing_iou_entries(uuid,timestamptz,uuid,integer)'::regprocedure;
  if list_config is null or not ('search_path=pg_catalog, public, auth' = any(list_config)) then
    raise exception 'list_blessing_iou_entries search_path is not fixed';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.platform_feature_flags'::regclass
      and pg_get_constraintdef(oid) like '%blessing_iou_v1%'
  ) then raise exception 'blessing_iou_v1 rollout key is missing'; end if;
end $$;

-- Pure platform authority may administer rollout configuration, but cannot
-- inspect or manage a club's financial promises without a real club role.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1a000000-0000-4000-8000-000000000005', true);
do $$
declare
  flag record;
begin
  select * into flag from public.set_platform_feature_flag(
    'blessing_iou_v1', true, array['local'], 100
  );
  if flag.feature_key <> 'blessing_iou_v1' or not flag.enabled then
    raise exception 'platform administrator could not configure blessing rollout';
  end if;
  begin
    perform public.get_blessing_iou_management_context(
      '4a000000-0000-4000-8000-000000000001'
    );
    raise exception 'platform-only identity gained club IOU management';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.list_blessing_iou_entries(
      '4a000000-0000-4000-8000-000000000001', null, null, 20
    );
    raise exception 'platform-only identity listed club blessings';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- With public amounts disabled, an entry is permanently snapshotted private.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1a000000-0000-4000-8000-000000000001', true);
do $$
declare
  clubs jsonb;
  created jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(item)), '[]'::jsonb)
  into clubs from public.list_my_blessing_iou_clubs() as item;
  if jsonb_array_length(clubs) <> 1
     or clubs->0->>'club_id' <> '4a000000-0000-4000-8000-000000000001'
     or (clubs->0->>'allow_public_amounts')::boolean then
    raise exception 'member club projection is invalid or defaulted public';
  end if;

  created := public.create_blessing_iou_entry(
    '4a000000-0000-4000-8000-000000000001',
    E'  祝福大家\r\n平安順心  ',
    1000,
    false
  );
  if created->>'blessing_text' <> E'祝福大家\n平安順心'
     or (created->>'pledged_amount')::numeric <> 1000
     or (created->>'amount_is_public')::boolean then
    raise exception 'private-by-default creation or normalization failed';
  end if;
  if created ? 'club_id' or created ? 'author_app_account_id'
     or created ? 'author_membership_id' or created ? 'deletion_reason' then
    raise exception 'entry projection leaked authority or deletion fields';
  end if;
  insert into blessing_iou_test_values values ('old-private-id', created->>'id');
end $$;
reset role;

-- A finance role can enable future public amounts; the old entry stays private.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1a000000-0000-4000-8000-000000000003', true);
do $$
declare context jsonb;
begin
  context := public.set_blessing_iou_amount_visibility(
    '4a000000-0000-4000-8000-000000000001', true
  );
  if not (context->>'allow_public_amounts')::boolean then
    raise exception 'finance role could not enable public amounts';
  end if;
end $$;
reset role;

-- The author creates one public amount, one explicitly hidden amount, and a
-- pure blessing. Member choice wins over the club setting.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1a000000-0000-4000-8000-000000000001', true);
do $$
declare
  public_entry jsonb;
  hidden_entry jsonb;
  pure_entry jsonb;
begin
  public_entry := public.create_blessing_iou_entry(
    '4a000000-0000-4000-8000-000000000001', '公開金額祝福', 2000, false
  );
  hidden_entry := public.create_blessing_iou_entry(
    '4a000000-0000-4000-8000-000000000001', '隱藏金額祝福', 3000, true
  );
  pure_entry := public.create_blessing_iou_entry(
    '4a000000-0000-4000-8000-000000000001', '只有祝福沒有金額', null, false
  );
  if not (public_entry->>'amount_is_public')::boolean
     or (hidden_entry->>'amount_is_public')::boolean
     or (pure_entry->>'has_pledge')::boolean then
    raise exception 'per-entry amount visibility choice failed';
  end if;
  insert into blessing_iou_test_values values
    ('public-id', public_entry->>'id'),
    ('hidden-id', hidden_entry->>'id'),
    ('pure-id', pure_entry->>'id');
end $$;
reset role;

-- Same-club peers see every blessing, only the explicitly public new amount,
-- and never the old or member-hidden amounts.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1a000000-0000-4000-8000-000000000002', true);
do $$
declare
  listed jsonb := public.list_blessing_iou_entries(
    '4a000000-0000-4000-8000-000000000001', null, null, 20
  );
  old_private jsonb;
  public_entry jsonb;
  hidden_entry jsonb;
  pure_entry jsonb;
begin
  select item into old_private from jsonb_array_elements(listed->'entries') as item
    where item->>'id' = (select value from blessing_iou_test_values where key = 'old-private-id');
  select item into public_entry from jsonb_array_elements(listed->'entries') as item
    where item->>'id' = (select value from blessing_iou_test_values where key = 'public-id');
  select item into hidden_entry from jsonb_array_elements(listed->'entries') as item
    where item->>'id' = (select value from blessing_iou_test_values where key = 'hidden-id');
  select item into pure_entry from jsonb_array_elements(listed->'entries') as item
    where item->>'id' = (select value from blessing_iou_test_values where key = 'pure-id');

  if old_private is null or old_private->'pledged_amount' <> 'null'::jsonb
     or hidden_entry->'pledged_amount' <> 'null'::jsonb
     or (public_entry->>'pledged_amount')::numeric <> 2000
     or (pure_entry->>'has_pledge')::boolean
     or (listed->>'viewer_can_manage')::boolean then
    raise exception 'same-club amount privacy projection failed';
  end if;

  begin
    perform public.update_own_blessing_iou_entry(
      '4a000000-0000-4000-8000-000000000001',
      (select value::uuid from blessing_iou_test_values where key = 'public-id'),
      '越權修改', 9999, false
    );
    raise exception 'same-club peer updated another member entry';
  exception when no_data_found then null;
  end;
end $$;
reset role;

-- Cross-club members cannot list, create, update, or delete Club A entries.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1a000000-0000-4000-8000-000000000004', true);
do $$
begin
  begin
    perform public.list_blessing_iou_entries(
      '4a000000-0000-4000-8000-000000000001', null, null, 20
    );
    raise exception 'cross-club member listed Club A blessings';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_blessing_iou_entry(
      '4a000000-0000-4000-8000-000000000001', '跨社建立', 100, false
    );
    raise exception 'cross-club member created Club A blessing';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.update_own_blessing_iou_entry(
      '4a000000-0000-4000-8000-000000000001',
      (select value::uuid from blessing_iou_test_values where key = 'public-id'),
      '跨社修改', 100, false
    );
    raise exception 'cross-club member updated Club A blessing';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.delete_blessing_iou_entry(
      '4a000000-0000-4000-8000-000000000001',
      (select value::uuid from blessing_iou_test_values where key = 'public-id'),
      '跨社刪除'
    );
    raise exception 'cross-club member deleted Club A blessing';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Authors can update and soft-delete their own unpaid entries. Invalid values
-- and direct browser table access remain rejected.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1a000000-0000-4000-8000-000000000001', true);
do $$
declare
  updated jsonb;
begin
  updated := public.update_own_blessing_iou_entry(
    '4a000000-0000-4000-8000-000000000001',
    (select value::uuid from blessing_iou_test_values where key = 'public-id'),
    '更新後祝福',
    2500,
    true
  );
  if updated->>'blessing_text' <> '更新後祝福'
     or (updated->>'pledged_amount')::numeric <> 2500
     or (updated->>'amount_is_public')::boolean then
    raise exception 'author update did not preserve hidden choice';
  end if;

  perform public.delete_blessing_iou_entry(
    '4a000000-0000-4000-8000-000000000001',
    (select value::uuid from blessing_iou_test_values where key = 'pure-id'),
    null
  );

  begin
    perform public.create_blessing_iou_entry(
      '4a000000-0000-4000-8000-000000000001', '非法小數金額', 100.50, false
    );
    raise exception 'fractional TWD pledge was accepted';
  exception when invalid_parameter_value then null;
  end;

  begin perform 1 from public.blessing_iou_entries;
    raise exception 'authenticated role read blessing table directly';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- A club operator without membership can manage content, but must provide a
-- reason when deleting another member's entry.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1a000000-0000-4000-8000-000000000006', true);
do $$
declare
  listed jsonb := public.list_blessing_iou_entries(
    '4a000000-0000-4000-8000-000000000001', null, null, 20
  );
  target_id uuid := (select value::uuid from blessing_iou_test_values where key = 'hidden-id');
begin
  if not (listed->>'viewer_can_manage')::boolean then
    raise exception 'effective operator did not receive management projection';
  end if;
  begin
    perform public.delete_blessing_iou_entry(
      '4a000000-0000-4000-8000-000000000001', target_id, null
    );
    raise exception 'manager deletion without reason was accepted';
  exception when invalid_parameter_value then null;
  end;
  perform public.delete_blessing_iou_entry(
    '4a000000-0000-4000-8000-000000000001', target_id, '重複建立'
  );
end $$;
reset role;

-- Soft-deleted entries disappear from the feed, remain auditable, and cannot
-- be physically removed or restored even by a direct owner-level mutation.
do $$
declare
  target_id uuid := (select value::uuid from blessing_iou_test_values where key = 'hidden-id');
begin
  if not exists (
    select 1 from public.blessing_iou_entries
    where id = target_id and entry_status = 'deleted'
      and deletion_reason = '重複建立' and deleted_at is not null
  ) then raise exception 'manager deletion was not retained as a soft-delete'; end if;

  begin
    delete from public.blessing_iou_entries where id = target_id;
    raise exception 'blessing IOU entry was hard deleted';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.blessing_iou_entries set entry_status = 'active' where id = target_id;
    raise exception 'deleted blessing IOU entry was restored';
  exception when object_not_in_prerequisite_state then null;
  end;
end $$;

rollback;
