-- Archive and handover tenant, confidentiality, version, and confirmation verification.
-- Run against local Supabase only. Every fixture is rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'archive-outgoing@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'archive-incoming@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'archive-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'archive-outsider@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('22000000-0000-4000-8000-000000000001', '卸任社長', 'archive-outgoing@example.test'),
  ('22000000-0000-4000-8000-000000000002', '新任秘書', 'archive-incoming@example.test'),
  ('22000000-0000-4000-8000-000000000003', '一般社員', 'archive-member@example.test'),
  ('22000000-0000-4000-8000-000000000004', '外社社員', 'archive-outsider@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('32000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', 'archive-outgoing@example.test', '卸任社長', 'active'),
  ('32000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000002', 'archive-incoming@example.test', '新任秘書', 'active'),
  ('32000000-0000-4000-8000-000000000003', '12000000-0000-4000-8000-000000000003', '22000000-0000-4000-8000-000000000003', 'archive-member@example.test', '一般社員', 'active'),
  ('32000000-0000-4000-8000-000000000004', '12000000-0000-4000-8000-000000000004', '22000000-0000-4000-8000-000000000004', 'archive-outsider@example.test', '外社社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('42000000-0000-4000-8000-000000000001', 'ARCH-A', '傳承甲社', 'active', now()),
  ('42000000-0000-4000-8000-000000000002', 'ARCH-B', '傳承乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status) values
  ('52000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', 'active'),
  ('52000000-0000-4000-8000-000000000002', '42000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000002', 'active'),
  ('52000000-0000-4000-8000-000000000003', '42000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000003', 'active'),
  ('52000000-0000-4000-8000-000000000004', '42000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000004', 'active');

insert into public.club_role_assignments (id, club_id, app_account_id, role_key, assignment_status) values
  ('62000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'president', 'active'),
  ('62000000-0000-4000-8000-000000000002', '42000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000002', 'secretary', 'active');

create temporary table archive_test_values (key text primary key, value uuid not null);
grant select, insert, update on archive_test_values to authenticated;

do $$
begin
  if (select public from storage.buckets where id = 'rotary-archives') then
    raise exception 'archive bucket is public';
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.archive_items'::regclass)
     or not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.archive_item_versions'::regclass) then
    raise exception 'archive RLS missing';
  end if;
  if has_table_privilege('authenticated', 'public.archive_items', 'SELECT')
     or has_table_privilege('authenticated', 'public.archive_item_versions', 'INSERT')
     or has_table_privilege('authenticated', 'public.handover_confirmations', 'DELETE') then
    raise exception 'authenticated role gained direct archive table access';
  end if;
  if has_function_privilege('anon', 'public.get_my_archive_page(uuid,uuid,text,text)', 'EXECUTE') then
    raise exception 'anonymous role gained archive RPC access';
  end if;
end $$;

-- Outgoing president creates one complete required document per category and one private item.
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000001', true);
do $$
declare
  year_id uuid;
  category text;
  item_id uuid;
  version jsonb;
  page jsonb;
  checklist jsonb;
begin
  year_id := public.create_rotary_year(
    '42000000-0000-4000-8000-000000000001', 2026, '服務傳承', '卸任社長', '新任秘書'
  );
  insert into archive_test_values values ('year', year_id);
  perform public.update_rotary_year(
    '42000000-0000-4000-8000-000000000001', year_id,
    '更新後服務傳承', '新任社長（更新）', '新任秘書（更新）'
  );

  foreach category in array array[
    'meeting_minutes', 'grant_documents', 'reports',
    'finance_summary', 'decisions', 'templates_handover'
  ] loop
    item_id := public.create_archive_item(
      '42000000-0000-4000-8000-000000000001', year_id, category,
      category || ' 文件', null, '年度必要資料', array[category], 'club_internal'
    );
    insert into archive_test_values values (category, item_id);
    if category = 'meeting_minutes' then
      perform public.update_archive_item(
        '42000000-0000-4000-8000-000000000001', item_id, category,
        'meeting_minutes 更新後文件', '更新後說明', '年度/更新後', array['updated'], 'club_internal'
      );
    end if;
    version := public.begin_archive_version(
      '42000000-0000-4000-8000-000000000001', item_id,
      category || '.pdf', 1024, 'application/pdf', '第一版'
    );
    perform public.complete_archive_version(
      '42000000-0000-4000-8000-000000000001', (version->>'version_id')::uuid
    );
    if version->>'object_path' not like '42000000-0000-4000-8000-000000000001/%' then
      raise exception 'storage path is not tenant prefixed';
    end if;
  end loop;

  item_id := public.create_archive_item(
    '42000000-0000-4000-8000-000000000001', year_id, 'other',
    '幹部密件', '只有幹部可讀', '幹部', array['密件'], 'officers_only'
  );
  insert into archive_test_values values ('private-item', item_id);
  version := public.begin_archive_version(
    '42000000-0000-4000-8000-000000000001', item_id,
    'private.pdf', 2048, 'application/pdf', null
  );
  insert into archive_test_values values ('private-version', (version->>'version_id')::uuid);
  perform public.complete_archive_version(
    '42000000-0000-4000-8000-000000000001', (version->>'version_id')::uuid
  );

  -- A failed upload remains as an immutable version history and can be archived.
  item_id := public.create_archive_item(
    '42000000-0000-4000-8000-000000000001', year_id, 'other',
    '失敗上傳後封存項目', '驗證 failed 與 archive 狀態', '年度/失敗測試', array['failure'], 'officers_only'
  );
  insert into archive_test_values values ('failed-item', item_id);
  version := public.begin_archive_version(
    '42000000-0000-4000-8000-000000000001', item_id,
    'failed.pdf', 512, 'application/pdf', '第一個失敗版本'
  );
  insert into archive_test_values values ('failed-version', (version->>'version_id')::uuid);
  perform public.fail_archive_version(
    '42000000-0000-4000-8000-000000000001', (version->>'version_id')::uuid, '測試上傳失敗'
  );
  begin
    perform public.complete_archive_version(
      '42000000-0000-4000-8000-000000000001', (version->>'version_id')::uuid
    );
    raise exception 'failed archive version became ready';
  exception when others then
    if sqlstate <> 'P0002' then raise; end if;
  end;
  version := public.begin_archive_version(
    '42000000-0000-4000-8000-000000000001', item_id,
    'failed-again.pdf', 512, 'application/pdf', '第二個失敗版本'
  );
  if version->>'version_number' <> '2' then
    raise exception 'failed archive version did not remain in version history';
  end if;
  perform public.fail_archive_version(
    '42000000-0000-4000-8000-000000000001', (version->>'version_id')::uuid, '再次測試上傳失敗'
  );
  perform public.archive_archive_item(
    '42000000-0000-4000-8000-000000000001', item_id
  );
  begin
    perform public.archive_archive_item(
      '42000000-0000-4000-8000-000000000001', item_id
    );
    raise exception 'archived item was archived twice';
  exception when others then
    if sqlstate <> 'P0002' then raise; end if;
  end;

  page := public.get_my_archive_page('42000000-0000-4000-8000-000000000001', year_id, null, null);
  if not (page->>'can_manage')::boolean
     or jsonb_array_length(page->'items') <> 7
     or jsonb_array_length(page->'missing_required_categories') <> 0 then
    raise exception 'manager archive projection is incomplete';
  end if;
  if page->'years'->0->>'theme' <> '更新後服務傳承'
     or page->'years'->0->>'president_name' <> '新任社長（更新）'
     or page->'years'->0->>'secretary_name' <> '新任秘書（更新）' then
    raise exception 'rotary year update was not projected';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(page->'items') as item
    where item->>'title' = 'meeting_minutes 更新後文件'
  ) or exists (
    select 1 from jsonb_array_elements(page->'items') as item
    where item->>'id' = (select value::text from archive_test_values where key = 'failed-item')
  ) then
    raise exception 'archive item update or archive projection failed';
  end if;
  for checklist in select value from jsonb_array_elements(page->'checklist') loop
    insert into archive_test_values values (
      'checklist-' || (checklist->>'category'), (checklist->>'id')::uuid
    );
    perform public.update_handover_checklist(
      '42000000-0000-4000-8000-000000000001',
      (checklist->>'id')::uuid,
      'confirmed',
      (select value from archive_test_values where key = checklist->>'category'),
      '已核對'
    );
  end loop;
  perform public.confirm_archive_handover(
    '42000000-0000-4000-8000-000000000001', year_id, 'outgoing'
  );
  page := public.get_my_archive_page('42000000-0000-4000-8000-000000000001', year_id, null, null);
  if (page->'years'->0->>'handover_status') <> 'awaiting_confirmation' then
    raise exception 'one-sided handover completed unexpectedly';
  end if;
end $$;
reset role;

-- A regular same-club member sees internal documents, never officers-only metadata.
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000003', true);
do $$
declare
  year_id uuid := (select value from archive_test_values where key = 'year');
  page jsonb := public.get_my_archive_page('42000000-0000-4000-8000-000000000001', year_id, null, null);
  download jsonb;
  manifest jsonb;
begin
  if (page->>'can_manage')::boolean
     or jsonb_array_length(page->'items') <> 6
     or jsonb_array_length(page->'checklist') <> 0
     or exists (select 1 from jsonb_array_elements(page->'items') item where item->>'confidentiality' = 'officers_only') then
    raise exception 'member confidentiality projection failed';
  end if;
  download := public.authorize_archive_download(
    '42000000-0000-4000-8000-000000000001',
    (page->'items'->0->'versions'->0->>'id')::uuid
  );
  if download ? 'club_id' or download->>'object_path' is null then
    raise exception 'authorized download projection invalid';
  end if;
  begin
    perform public.authorize_archive_download(
      '42000000-0000-4000-8000-000000000001',
      (select value from archive_test_values where key = 'private-version')
    );
    raise exception 'member downloaded officers-only version';
  exception when insufficient_privilege then null;
  end;
  manifest := public.export_archive_manifest('42000000-0000-4000-8000-000000000001', year_id);
  if jsonb_array_length(manifest->'items') <> 6 or manifest::text like '%幹部密件%' then
    raise exception 'manifest leaked officers-only item';
  end if;
  begin perform 1 from public.archive_items;
    raise exception 'member directly read archive table';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- A same-club regular member may read public archive material but cannot invoke any mutation.
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000003', true);
do $$
declare
  year_id uuid := (select value from archive_test_values where key = 'year');
  item_id uuid := (select value from archive_test_values where key = 'private-item');
  version_id uuid := (select value from archive_test_values where key = 'private-version');
  checklist_id uuid := (select value from archive_test_values where key = 'checklist-meeting_minutes');
begin
  begin
    perform public.create_rotary_year(
      '42000000-0000-4000-8000-000000000001', 2027, '不應建立', '不應建立', '不應建立'
    );
    raise exception 'same-club member created a Rotary year';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.update_rotary_year(
      '42000000-0000-4000-8000-000000000001', year_id, '不應更新', '不應更新', '不應更新'
    );
    raise exception 'same-club member updated a Rotary year';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_archive_item(
      '42000000-0000-4000-8000-000000000001', year_id,
      'other', '不應建立', null, '其他', '{}'::text[], 'club_internal'
    );
    raise exception 'same-club member created an archive item';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.update_archive_item(
      '42000000-0000-4000-8000-000000000001', item_id,
      'other', '不應更新', null, '其他', '{}'::text[], 'officers_only'
    );
    raise exception 'same-club member updated an archive item';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.archive_archive_item(
      '42000000-0000-4000-8000-000000000001', item_id
    );
    raise exception 'same-club member archived an archive item';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.begin_archive_version(
      '42000000-0000-4000-8000-000000000001', item_id,
      'member.pdf', 512, 'application/pdf', null
    );
    raise exception 'same-club member began an archive version';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.complete_archive_version(
      '42000000-0000-4000-8000-000000000001', version_id
    );
    raise exception 'same-club member completed an archive version';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.fail_archive_version(
      '42000000-0000-4000-8000-000000000001', version_id, '不應失敗版本'
    );
    raise exception 'same-club member failed an archive version';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.update_handover_checklist(
      '42000000-0000-4000-8000-000000000001', checklist_id,
      'needs_update', null, '不應更新'
    );
    raise exception 'same-club member updated a handover checklist';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.confirm_archive_handover(
      '42000000-0000-4000-8000-000000000001', year_id, 'incoming'
    );
    raise exception 'same-club member confirmed archive handover';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Cross-club users fail closed.
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000004', true);
do $$
begin
  begin
    perform public.get_my_archive_page(
      '42000000-0000-4000-8000-000000000001',
      (select value from archive_test_values where key = 'year'), null, null
    );
    raise exception 'cross-club archive read accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_archive_item(
      '42000000-0000-4000-8000-000000000001',
      (select value from archive_test_values where key = 'year'),
      'other', '跨社寫入', null, '其他', '{}', 'club_internal'
    );
    raise exception 'cross-club archive write accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.update_rotary_year(
      '42000000-0000-4000-8000-000000000001',
      (select value from archive_test_values where key = 'year'),
      '跨社不應更新', '跨社不應更新', '跨社不應更新'
    );
    raise exception 'cross-club Rotary year update accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.update_archive_item(
      '42000000-0000-4000-8000-000000000001',
      (select value from archive_test_values where key = 'private-item'),
      'other', '跨社不應更新', null, '其他', '{}'::text[], 'officers_only'
    );
    raise exception 'cross-club archive item update accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.archive_archive_item(
      '42000000-0000-4000-8000-000000000001',
      (select value from archive_test_values where key = 'private-item')
    );
    raise exception 'cross-club archive item archive accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.begin_archive_version(
      '42000000-0000-4000-8000-000000000001',
      (select value from archive_test_values where key = 'private-item'),
      'cross-club.pdf', 512, 'application/pdf', null
    );
    raise exception 'cross-club archive version begin accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.complete_archive_version(
      '42000000-0000-4000-8000-000000000001',
      (select value from archive_test_values where key = 'private-version')
    );
    raise exception 'cross-club archive version complete accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.fail_archive_version(
      '42000000-0000-4000-8000-000000000001',
      (select value from archive_test_values where key = 'private-version'), '跨社不應失敗版本'
    );
    raise exception 'cross-club archive version fail accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.update_handover_checklist(
      '42000000-0000-4000-8000-000000000001',
      (select value from archive_test_values where key = 'checklist-meeting_minutes'),
      'needs_update', null, '跨社不應更新'
    );
    raise exception 'cross-club handover checklist update accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.confirm_archive_handover(
      '42000000-0000-4000-8000-000000000001',
      (select value from archive_test_values where key = 'year'), 'incoming'
    );
    raise exception 'cross-club handover confirmation accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Incoming secretary is a distinct authorized account; only then is handover complete.
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000002', true);
do $$
declare
  year_id uuid := (select value from archive_test_values where key = 'year');
  page jsonb;
begin
  perform public.confirm_archive_handover(
    '42000000-0000-4000-8000-000000000001', year_id, 'incoming'
  );
  page := public.get_my_archive_page('42000000-0000-4000-8000-000000000001', year_id, null, null);
  if (page->'years'->0->>'handover_status') <> 'completed'
     or jsonb_array_length(page->'confirmations') <> 2 then
    raise exception 'two-party handover did not complete';
  end if;
end $$;
reset role;

-- Version metadata cannot be overwritten and no archive record can be hard deleted.
do $$
declare version_id uuid := (select value from archive_test_values where key = 'private-version');
begin
  begin
    update public.archive_item_versions set original_filename = 'replaced.pdf' where id = version_id;
    raise exception 'archive version was overwritten';
  exception when check_violation then null;
  end;
  begin
    delete from public.archive_item_versions where id = version_id;
    raise exception 'archive version was hard deleted';
  exception when insufficient_privilege then null;
  end;
  if not exists (
    select 1 from public.audit_logs
    where club_id = '42000000-0000-4000-8000-000000000001'
      and action_key in ('archive.version_downloaded', 'archive.handover_confirmed', 'archive.manifest_exported')
  ) then raise exception 'archive audit events missing'; end if;
end $$;

rollback;
