-- Dues/collections/reconciliation V1 verification: tenant isolation,
-- platform-admin exclusion, partial payments, immutable corrections, and
-- partial reconciliation.  Run against a freshly reset local database.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'dues-finance@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'dues-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'dues-outsider@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'dues-platform@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'dues-suspended@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd1000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'dues-operator@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('d2000000-0000-4000-8000-000000000001', '社費財務', 'dues-finance@example.test'),
  ('d2000000-0000-4000-8000-000000000002', '社費社員', 'dues-member@example.test'),
  ('d2000000-0000-4000-8000-000000000003', '社費外社社員', 'dues-outsider@example.test'),
  ('d2000000-0000-4000-8000-000000000004', '社費平台管理員', 'dues-platform@example.test'),
  ('d2000000-0000-4000-8000-000000000005', '社費停權帳號', 'dues-suspended@example.test'),
  ('d2000000-0000-4000-8000-000000000006', '社費執行秘書', 'dues-operator@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('d3000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'dues-finance@example.test', '社費財務', 'active'),
  ('d3000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002', 'dues-member@example.test', '社費社員', 'active'),
  ('d3000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000003', 'dues-outsider@example.test', '社費外社社員', 'active'),
  ('d3000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000004', 'd2000000-0000-4000-8000-000000000004', 'dues-platform@example.test', '社費平台管理員', 'active'),
  ('d3000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000005', 'd2000000-0000-4000-8000-000000000005', 'dues-suspended@example.test', '社費停權帳號', 'suspended'),
  ('d3000000-0000-4000-8000-000000000006', 'd1000000-0000-4000-8000-000000000006', 'd2000000-0000-4000-8000-000000000006', 'dues-operator@example.test', '社費執行秘書', 'active');

insert into public.clubs (id, club_code, club_name, timezone_name, club_status, activated_at)
values
  ('d4000000-0000-4000-8000-000000000001', 'DUES-A', '社費測試甲社', 'Asia/Taipei', 'active', now()),
  ('d4000000-0000-4000-8000-000000000002', 'DUES-B', '社費測試乙社', 'Asia/Taipei', 'active', now());

insert into public.club_memberships (
  id, club_id, person_id, membership_status, joined_on
) values
  ('d5000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'active', date '2026-07-01'),
  ('d5000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 'active', date '2026-07-01'),
  ('d5000000-0000-4000-8000-000000000003', 'd4000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000003', 'active', date '2026-07-01'),
  ('d5000000-0000-4000-8000-000000000004', 'd4000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000005', 'suspended', date '2026-07-01');

insert into public.rotary_years (
  id, club_id, start_year, created_by_app_account_id
) values
  ('d6000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 2026, 'd3000000-0000-4000-8000-000000000001'),
  ('d6000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000002', 2026, 'd3000000-0000-4000-8000-000000000001');

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values (
  'd7000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'finance',
  'active',
  'd3000000-0000-4000-8000-000000000001'
);

insert into public.platform_roles (id, app_account_id, role_key)
values ('d8000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000004', 'platform_admin');

insert into public.club_operator_permissions (
  id, club_id, app_account_id, operator_role_key, permission_level,
  assignment_status, starts_at, granted_by_app_account_id
) values (
  'd9000000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000006',
  'executive_secretary',
  'club_manager',
  'active',
  now() - interval '1 day',
  'd3000000-0000-4000-8000-000000000001'
);

create temporary table dues_core_test_values (
  key text primary key,
  value text not null
);
grant select, insert, update on dues_core_test_values to authenticated;

-- The browser role has no direct table access.  All new RPCs are authenticated
-- only, and private helpers cannot be called as a browser function.
do $$
declare
  table_name text;
  function_config text[];
begin
  foreach table_name in array array[
    'club_finance_annual_dues_defaults',
    'club_finance_receivables',
    'club_finance_receivable_adjustments',
    'club_finance_receipts',
    'club_finance_receipt_allocations',
    'club_finance_receipt_reversals',
    'club_finance_advances',
    'club_finance_advance_returns',
    'club_finance_reconciliations',
    'club_finance_reconciliation_reversals'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_class
      where oid = format('public.%I', table_name)::regclass
        and relrowsecurity
    ) then
      raise exception 'RLS is not enabled on %', table_name;
    end if;
    if has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT')
       or has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT')
       or has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE')
       or has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE') then
      raise exception 'authenticated gained direct access to %', table_name;
    end if;
  end loop;

  if has_function_privilege('anon', 'public.get_club_dues_finance_ledger(uuid,uuid,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_my_dues_finance_ledger(uuid,uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.record_dues_receipt(uuid,date,text,text,jsonb,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.current_has_dues_finance_permission(uuid,text)', 'EXECUTE') then
    raise exception 'dues RPC privilege boundary is too broad';
  end if;
  if not has_function_privilege('authenticated', 'public.get_club_dues_finance_ledger(uuid,uuid,integer)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_my_dues_finance_ledger(uuid,uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.set_club_dues_annual_default(uuid,uuid,numeric,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.generate_club_dues_receivables(uuid,uuid,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.create_dues_receivable(uuid,uuid,uuid,numeric,text,text,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.adjust_dues_receivable(uuid,uuid,numeric,text,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.record_dues_receipt(uuid,date,text,text,jsonb,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.reverse_dues_receipt(uuid,uuid,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.submit_dues_advance(uuid,uuid,numeric,text,date,text,uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.return_dues_advance(uuid,uuid,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.resubmit_dues_advance(uuid,uuid,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.approve_dues_reconciliation(uuid,uuid,numeric,text,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.reverse_dues_reconciliation(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'authenticated dues RPC grant is incomplete';
  end if;

  select proconfig into function_config
  from pg_catalog.pg_proc
  where oid = 'public.record_dues_receipt(uuid,date,text,text,jsonb,text)'::regprocedure;
  if function_config is null
     or not ('search_path=pg_catalog, public, auth' = any(function_config)) then
    raise exception 'record_dues_receipt search_path is not fixed';
  end if;

  if not exists (
    select 1 from public.permissions
    where permission_key = 'finance.manage'
  ) or not exists (
    select 1 from public.permissions
    where permission_key = 'finance.approve'
  ) or not exists (
    select 1 from public.role_permissions
    where role_key = 'president' and permission_key = 'finance.read'
  ) then
    raise exception 'dues finance permissions are missing';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.platform_feature_flags'::regclass
      and pg_get_constraintdef(oid) like '%dues_finance_v1%'
  ) or not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.platform_feature_flag_audit'::regclass
      and pg_get_constraintdef(oid) like '%dues_finance_v1%'
  ) then
    raise exception 'dues_finance_v1 rollout key is missing';
  end if;
end $$;

-- A platform administrator can change rollout configuration, but platform
-- identity alone cannot read or mutate a club's finance records.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000004', true);
do $$
declare flag_record record;
begin
  select * into flag_record
  from public.set_platform_feature_flag('dues_finance_v1', true, array['local'], 100);
  if flag_record.feature_key <> 'dues_finance_v1' or not flag_record.enabled then
    raise exception 'platform administrator could not configure dues rollout';
  end if;
  begin
    perform public.get_club_dues_finance_ledger(
      'd4000000-0000-4000-8000-000000000001',
      'd6000000-0000-4000-8000-000000000001',
      50
    );
    raise exception 'platform-only identity read a club finance ledger';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_club_dues_annual_default(
      'd4000000-0000-4000-8000-000000000001',
      'd6000000-0000-4000-8000-000000000001',
      10000,
      '平台不得建立社費'
    );
    raise exception 'platform-only identity mutated a club finance record';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- The finance lead can set a yearly default and generation is idempotent.  A
-- second run does not create another receivable for the same member/year.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
do $$
declare
  generated jsonb;
  ledger jsonb;
  member_receivable_id text;
  finance_receivable_id text;
begin
  perform public.set_club_dues_annual_default(
    'd4000000-0000-4000-8000-000000000001',
    'd6000000-0000-4000-8000-000000000001',
    10000,
    '2026 年度社費基準'
  );
  generated := public.generate_club_dues_receivables(
    'd4000000-0000-4000-8000-000000000001',
    'd6000000-0000-4000-8000-000000000001',
    '年度開始建立'
  );
  if (generated->>'created_count')::integer <> 2
     or (generated->>'skipped_count')::integer <> 0 then
    raise exception 'first dues generation count is incorrect: %', generated;
  end if;
  generated := public.generate_club_dues_receivables(
    'd4000000-0000-4000-8000-000000000001',
    'd6000000-0000-4000-8000-000000000001',
    '重跑不重複'
  );
  if (generated->>'created_count')::integer <> 0
     or (generated->>'skipped_count')::integer <> 2 then
    raise exception 'second dues generation was not idempotent: %', generated;
  end if;

  ledger := public.get_club_dues_finance_ledger(
    'd4000000-0000-4000-8000-000000000001',
    'd6000000-0000-4000-8000-000000000001',
    50
  );
  if (ledger->'summary'->>'receivable_amount')::numeric <> 20000
     or jsonb_array_length(ledger->'receivables') <> 2 then
    raise exception 'generated dues ledger is incorrect: %', ledger;
  end if;
  select item->>'receivable_id' into member_receivable_id
  from jsonb_array_elements(ledger->'receivables') as element(item)
  where item->>'member_display_name' = '社費社員';
  select item->>'receivable_id' into finance_receivable_id
  from jsonb_array_elements(ledger->'receivables') as element(item)
  where item->>'member_display_name' = '社費財務';
  if member_receivable_id is null or finance_receivable_id is null then
    raise exception 'member receivable projection is incomplete: %', ledger;
  end if;
  begin
    perform public.get_club_dues_finance_ledger(
      'd4000000-0000-4000-8000-000000000002',
      'd6000000-0000-4000-8000-000000000002',
      50
    );
    raise exception 'club A finance lead read club B ledger';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_club_dues_annual_default(
      'd4000000-0000-4000-8000-000000000002',
      'd6000000-0000-4000-8000-000000000002',
      10000,
      '跨社設定不得成功'
    );
    raise exception 'club A finance lead mutated club B finance data';
  exception when insufficient_privilege then null;
  end;
  insert into dues_core_test_values(key, value) values
    ('member-receivable-id', member_receivable_id),
    ('finance-receivable-id', finance_receivable_id);
end $$;
reset role;

-- A member sees only their own receivable and cannot use management RPCs.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000002', true);
do $$
declare
  page jsonb;
begin
  page := public.get_my_dues_finance_ledger(
    'd4000000-0000-4000-8000-000000000001',
    'd6000000-0000-4000-8000-000000000001'
  );
  if jsonb_array_length(page->'receivables') <> 1
     or page::text like '%社費財務%' then
    raise exception 'member received another member finance data: %', page;
  end if;
  page := public.get_my_dues_finance_ledger(
    'd4000000-0000-4000-8000-000000000001'
  );
  if page->>'rotary_year_start' <> '2026'
     or jsonb_array_length(page->'receivables') <> 1 then
    raise exception 'member current-year default selection is incorrect: %', page;
  end if;
  begin
    perform public.get_club_dues_finance_ledger(
      'd4000000-0000-4000-8000-000000000001',
      'd6000000-0000-4000-8000-000000000001',
      50
    );
    raise exception 'member read management finance ledger';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_dues_receipt(
      'd4000000-0000-4000-8000-000000000001', current_date, 'cash', null,
      jsonb_build_array(jsonb_build_object(
        'receivable_id', (select value from dues_core_test_values where key = 'member-receivable-id'),
        'amount', 100
      )), 'member-must-not-record');
    raise exception 'member recorded a dues receipt';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Partial receipt, safe retry, over-collection rejection, reversal, and a
-- subsequent full receipt all run atomically under the finance role.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
do $$
declare
  first_result jsonb;
  retry_result jsonb;
  reversed_result jsonb;
  full_result jsonb;
  member_receivable_id text := (select value from dues_core_test_values where key = 'member-receivable-id');
  first_receipt_id text;
begin
  first_result := public.record_dues_receipt(
    'd4000000-0000-4000-8000-000000000001', current_date, 'bank_transfer', '末五碼 1234',
    jsonb_build_array(jsonb_build_object('receivable_id', member_receivable_id, 'amount', 4000)),
    'dues-receipt-partial-1'
  );
  first_receipt_id := first_result->>'receipt_id';
  retry_result := public.record_dues_receipt(
    'd4000000-0000-4000-8000-000000000001', current_date, 'bank_transfer', '同一筆重試',
    jsonb_build_array(jsonb_build_object('receivable_id', member_receivable_id, 'amount', 4000)),
    'dues-receipt-partial-1'
  );
  if retry_result->>'receipt_id' <> first_receipt_id
     or retry_result->>'idempotent_replay' <> 'true'
     or (retry_result->'summary'->>'received_amount')::numeric <> 4000 then
    raise exception 'dues receipt retry was not idempotent: %', retry_result;
  end if;

  begin
    perform public.record_dues_receipt(
      'd4000000-0000-4000-8000-000000000001', current_date, 'cash', null,
      jsonb_build_array(jsonb_build_object('receivable_id', member_receivable_id, 'amount', 7000)),
      'dues-receipt-overage');
    raise exception 'over-collection was accepted';
  exception when sqlstate '22023' then null;
  end;

  reversed_result := public.reverse_dues_receipt(
    'd4000000-0000-4000-8000-000000000001', first_receipt_id::uuid, '重複入帳，保留反向紀錄'
  );
  if (reversed_result->'summary'->>'received_amount')::numeric <> 0 then
    raise exception 'reversed receipt still counted as received: %', reversed_result;
  end if;

  full_result := public.record_dues_receipt(
    'd4000000-0000-4000-8000-000000000001', current_date, 'cash', '現金補收',
    jsonb_build_array(jsonb_build_object('receivable_id', member_receivable_id, 'amount', 10000)),
    'dues-receipt-full-1'
  );
  if (full_result->'summary'->>'received_amount')::numeric <> 10000
     or (full_result->'summary'->>'outstanding_amount')::numeric <> 10000 then
    raise exception 'full dues receipt projection is incorrect: %', full_result;
  end if;

  begin
    perform public.adjust_dues_receivable(
      'd4000000-0000-4000-8000-000000000001', member_receivable_id::uuid, -1,
      '不能低於已收款', 'dues-adjustment-underflow'
    );
    raise exception 'receivable was adjusted below collected amount';
  exception when sqlstate '22023' then null;
  end;
  perform public.adjust_dues_receivable(
    'd4000000-0000-4000-8000-000000000001', member_receivable_id::uuid, 2000,
    '社員補充費用說明', 'dues-adjustment-increase'
  );
end $$;
reset role;

-- Partial reconciliation, full close, reversal, return, and resubmission.
-- The member can submit their own advance; the finance lead approves it.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000002', true);
do $$
declare
  submitted jsonb;
begin
  submitted := public.submit_dues_advance(
    'd4000000-0000-4000-8000-000000000001',
    'd6000000-0000-4000-8000-000000000001',
    3000,
    '先代墊場地訂金',
    date '2026-09-10',
    'dues-advance-1'
  );
  if submitted->>'advance_status' <> 'submitted' then
    raise exception 'advance was not submitted: %', submitted;
  end if;
  insert into dues_core_test_values(key, value) values ('advance-id', submitted->>'advance_id');
  submitted := public.submit_dues_advance(
    'd4000000-0000-4000-8000-000000000001',
    'd6000000-0000-4000-8000-000000000001',
    3000,
    '同一筆重試',
    date '2026-09-10',
    'dues-advance-1'
  );
  if submitted->>'idempotent_replay' <> 'true' then
    raise exception 'advance retry was not idempotent: %', submitted;
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
do $$
declare
  approved jsonb;
  advance_id uuid := (select value::uuid from dues_core_test_values where key = 'advance-id');
  first_reconciliation_id text;
begin
  approved := public.approve_dues_reconciliation(
    'd4000000-0000-4000-8000-000000000001', advance_id, 1000,
    '先核對第一張單據', 'dues-reconciliation-1'
  );
  first_reconciliation_id := approved->>'reconciliation_id';
  if (approved->>'outstanding_amount')::numeric <> 2000
     or approved->>'advance_status' <> 'submitted' then
    raise exception 'partial reconciliation projection is incorrect: %', approved;
  end if;
  insert into dues_core_test_values(key, value) values ('reconciliation-id', first_reconciliation_id);

  approved := public.approve_dues_reconciliation(
    'd4000000-0000-4000-8000-000000000001', advance_id, 2000,
    '其餘單據核准', 'dues-reconciliation-2'
  );
  if (approved->>'outstanding_amount')::numeric <> 0
     or approved->>'advance_status' <> 'closed' then
    raise exception 'full reconciliation did not close advance: %', approved;
  end if;

  approved := public.reverse_dues_reconciliation(
    'd4000000-0000-4000-8000-000000000001',
    first_reconciliation_id::uuid,
    '第一張單據退回重核'
  );
  if (approved->>'outstanding_amount')::numeric <> 1000
     or approved->>'advance_status' <> 'submitted' then
    raise exception 'reconciliation reversal did not reopen remaining amount: %', approved;
  end if;

  perform public.return_dues_advance(
    'd4000000-0000-4000-8000-000000000001', advance_id, '請補上正式收據'
  );
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000002', true);
do $$
declare
  resubmitted jsonb;
  advance_id uuid := (select value::uuid from dues_core_test_values where key = 'advance-id');
begin
  resubmitted := public.resubmit_dues_advance(
    'd4000000-0000-4000-8000-000000000001', advance_id, '已補齊正式收據'
  );
  if resubmitted->>'advance_status' <> 'submitted'
     or (resubmitted->>'submission_count')::integer <> 2 then
    raise exception 'returned advance could not be resubmitted: %', resubmitted;
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000001', true);
do $$
declare
  final_state jsonb;
  advance_id uuid := (select value::uuid from dues_core_test_values where key = 'advance-id');
begin
  final_state := public.approve_dues_reconciliation(
    'd4000000-0000-4000-8000-000000000001', advance_id, 1000,
    '補件後核准', 'dues-reconciliation-3'
  );
  if (final_state->>'outstanding_amount')::numeric <> 0
     or final_state->>'advance_status' <> 'closed' then
    raise exception 'resubmitted advance was not closed: %', final_state;
  end if;
end $$;
reset role;

-- Other-club members, suspended accounts, and operators are checked
-- separately.  The operator can manage this club without receiving a member
-- row; the outsider and suspended account cannot cross the boundary.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000006', true);
do $$
declare ledger jsonb;
begin
  ledger := public.get_club_dues_finance_ledger(
    'd4000000-0000-4000-8000-000000000001',
    'd6000000-0000-4000-8000-000000000001',
    50
  );
  if ledger->>'club_id' <> 'd4000000-0000-4000-8000-000000000001' then
    raise exception 'club operator was not granted its own club ledger';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000003', true);
do $$
begin
  begin
    perform public.get_my_dues_finance_ledger(
      'd4000000-0000-4000-8000-000000000001',
      'd6000000-0000-4000-8000-000000000001'
    );
    raise exception 'other-club member read club A dues';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000005', true);
do $$
begin
  begin
    perform public.get_my_dues_finance_ledger(
      'd4000000-0000-4000-8000-000000000001',
      'd6000000-0000-4000-8000-000000000001'
    );
    raise exception 'suspended account read club dues';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- An active status is not enough to grant finance access.  A membership whose
-- join date is still in the future, or whose end date has passed, is outside
-- the current membership window and cannot read or submit a dues advance.
reset role;
update public.club_memberships
set joined_on = current_date + 1,
    ended_on = null
where id = 'd5000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000002', true);
do $$
begin
  begin
    perform public.get_my_dues_finance_ledger(
      'd4000000-0000-4000-8000-000000000001',
      'd6000000-0000-4000-8000-000000000001'
    );
    raise exception 'future-start member read club dues';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.submit_dues_advance(
      'd4000000-0000-4000-8000-000000000001',
      'd6000000-0000-4000-8000-000000000001',
      100,
      '未生效社籍不應代墊',
      current_date,
      'future-membership-deny'
    );
    raise exception 'future-start member submitted a dues advance';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.resubmit_dues_advance(
      'd4000000-0000-4000-8000-000000000001',
      (select value::uuid from dues_core_test_values where key = 'advance-id'),
      '未生效社籍不應重新提交'
    );
    raise exception 'future-start member resubmitted a dues advance';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

update public.club_memberships
set joined_on = current_date - 30,
    ended_on = current_date - 1
where id = 'd5000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000002', true);
do $$
begin
  begin
    perform public.get_my_dues_finance_ledger(
      'd4000000-0000-4000-8000-000000000001',
      'd6000000-0000-4000-8000-000000000001'
    );
    raise exception 'expired member read club dues';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.submit_dues_advance(
      'd4000000-0000-4000-8000-000000000001',
      'd6000000-0000-4000-8000-000000000001',
      100,
      '已結束社籍不應代墊',
      current_date,
      'expired-membership-deny'
    );
    raise exception 'expired member submitted a dues advance';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.resubmit_dues_advance(
      'd4000000-0000-4000-8000-000000000001',
      (select value::uuid from dues_core_test_values where key = 'advance-id'),
      '已結束社籍不應重新提交'
    );
    raise exception 'expired member resubmitted a dues advance';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Restore the fixture row for any later verification in this transaction.
update public.club_memberships
set joined_on = date '2026-07-01',
    ended_on = null
where id = 'd5000000-0000-4000-8000-000000000002';

-- Even the trusted database role cannot overwrite or hard-delete immutable
-- financial history.  Corrections must use the dedicated reverse RPCs.
set local role service_role;
do $$
begin
  begin
    update public.club_finance_receivables
    set source_note = source_note || '不應被覆寫'
    where club_id = 'd4000000-0000-4000-8000-000000000001';
    raise exception 'service role overwrote an immutable receivable';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.club_finance_receipts
    where club_id = 'd4000000-0000-4000-8000-000000000001';
    raise exception 'service role deleted immutable receipt history';
  exception when insufficient_privilege then null;
            when sqlstate '55000' then null;
  end;
end $$;
reset role;

-- The audit records are append-only and show each financial state change.
do $$
declare
  audit_count integer;
begin
  select count(*)::integer into audit_count
  from public.audit_logs
  where club_id = 'd4000000-0000-4000-8000-000000000001'
    and action_key in (
      'dues.annual_default_set', 'dues.receivables_generated',
      'dues.receipt_recorded', 'dues.receipt_reversed',
      'dues.receivable_adjusted', 'dues.advance_submitted',
      'dues.reconciliation_approved', 'dues.reconciliation_reversed',
      'dues.advance_returned', 'dues.advance_resubmitted'
    );
  if audit_count < 10 then
    raise exception 'financial audit trail is incomplete: %', audit_count;
  end if;
end $$;

rollback;
