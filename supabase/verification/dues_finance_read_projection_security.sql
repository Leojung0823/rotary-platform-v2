-- Finance read projection verification: role coverage, tenant boundary, and
-- no browser access to the helper itself.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'dues-read-finance@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000002', 'e1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'dues-read-secretary@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000003', 'e1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'dues-read-member@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('e2000000-0000-4000-8000-000000000001', '讀取財務', 'dues-read-finance@example.test'),
  ('e2000000-0000-4000-8000-000000000002', '讀取秘書', 'dues-read-secretary@example.test'),
  ('e2000000-0000-4000-8000-000000000003', '讀取社員', 'dues-read-member@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('e3000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'dues-read-finance@example.test', '讀取財務', 'active'),
  ('e3000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000002', 'dues-read-secretary@example.test', '讀取秘書', 'active'),
  ('e3000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000003', 'dues-read-member@example.test', '讀取社員', 'active');

insert into public.clubs (id, club_code, club_name, timezone_name, club_status, activated_at)
values
  ('e4000000-0000-4000-8000-000000000001', 'READ-A', '讀取測試甲社', 'Asia/Taipei', 'active', now()),
  ('e4000000-0000-4000-8000-000000000002', 'READ-B', '讀取測試乙社', 'Asia/Taipei', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status, joined_on)
values
  ('e5000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'active', date '2026-07-01'),
  ('e5000000-0000-4000-8000-000000000002', 'e4000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002', 'active', date '2026-07-01'),
  ('e5000000-0000-4000-8000-000000000003', 'e4000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000003', 'active', date '2026-07-01');

insert into public.rotary_years (id, club_id, start_year, created_by_app_account_id)
values
  ('e6000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001', 2026, 'e3000000-0000-4000-8000-000000000001'),
  ('e6000000-0000-4000-8000-000000000002', 'e4000000-0000-4000-8000-000000000001', 2025, 'e3000000-0000-4000-8000-000000000001'),
  ('e6000000-0000-4000-8000-000000000003', 'e4000000-0000-4000-8000-000000000002', 2026, 'e3000000-0000-4000-8000-000000000001');

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values
  ('e7000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', 'finance', 'active', 'e3000000-0000-4000-8000-000000000001'),
  ('e7000000-0000-4000-8000-000000000002', 'e4000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000002', 'secretary', 'active', 'e3000000-0000-4000-8000-000000000001');

do $$
begin
  if not exists (
    select 1 from public.role_permissions
    where role_key = 'finance' and permission_key = 'finance.read'
  ) or not exists (
    select 1 from public.role_permissions
    where role_key = 'secretary' and permission_key = 'finance.read'
  ) then
    raise exception 'finance and secretary read permissions are missing';
  end if;
  if has_function_privilege('anon', 'public.list_dues_finance_rotary_years(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_club_dues_finance_report(uuid,uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_club_dues_annual_default(uuid,uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.list_my_dues_finance_rotary_years(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.current_has_dues_finance_permission(uuid,text)', 'EXECUTE') then
    raise exception 'finance year read privileges are too broad';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
do $$
declare
  result jsonb;
begin
  result := public.list_dues_finance_rotary_years('e4000000-0000-4000-8000-000000000001');
  if jsonb_array_length(result) <> 2
     or result->0->>'id' <> 'e6000000-0000-4000-8000-000000000001'
     or result->1->>'id' <> 'e6000000-0000-4000-8000-000000000002'
     or result->0->>'club_id' <> 'e4000000-0000-4000-8000-000000000001' then
    raise exception 'finance role saw the wrong year projection';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000002', true);
do $$
declare
  result jsonb;
begin
  result := public.list_dues_finance_rotary_years('e4000000-0000-4000-8000-000000000001');
  if jsonb_array_length(result) <> 2 then
    raise exception 'secretary cannot read the finance years';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000003', true);
do $$
begin
  begin
    perform public.list_dues_finance_rotary_years('e4000000-0000-4000-8000-000000000001');
    raise exception 'ordinary member read the finance years';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.list_dues_finance_rotary_years('e4000000-0000-4000-8000-000000000002');
    raise exception 'ordinary member crossed the finance tenant boundary';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
do $$
declare
  report jsonb;
  created jsonb;
  first_receivable_id uuid;
  advance_id uuid;
begin
  if public.get_club_dues_annual_default(
    'e4000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001'
  ) is not null then
    raise exception 'empty annual default was not null';
  end if;
  perform public.set_club_dues_annual_default(
    'e4000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001',
    1000,
    '讀取報表測試年度設定'
  );
  created := public.create_dues_receivable(
    'e4000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001',
    'e5000000-0000-4000-8000-000000000001',
    1000,
    '讀取報表測試應收',
    'manual',
    'read-report-receivable-1'
  );
  first_receivable_id := (created->>'receivable_id')::uuid;
  perform public.create_dues_receivable(
    'e4000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001',
    'e5000000-0000-4000-8000-000000000002',
    500,
    '讀取報表測試應收',
    'manual',
    'read-report-receivable-2'
  );
  perform public.record_dues_receipt(
    'e4000000-0000-4000-8000-000000000001',
    date '2026-08-02',
    'bank_transfer',
    '報表測試收款',
    jsonb_build_array(jsonb_build_object('receivable_id', first_receivable_id, 'amount', 600)),
    'read-report-receipt-1'
  );
  created := public.submit_dues_advance(
    'e4000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001',
    300,
    '讀取報表測試代墊',
    date '2026-08-03',
    'read-report-advance-1',
    'e5000000-0000-4000-8000-000000000003'
  );
  advance_id := (created->>'advance_id')::uuid;
  -- The first receipt/advance ids are generated, so use their projections to
  -- locate the created rows through the stable, scoped tables only inside the
  -- verification transaction.
  perform public.approve_dues_reconciliation(
    'e4000000-0000-4000-8000-000000000001',
    advance_id,
    100,
    '報表測試核銷',
    'read-report-reconciliation-1'
  );
  report := public.get_club_dues_finance_report(
    'e4000000-0000-4000-8000-000000000001',
    'e6000000-0000-4000-8000-000000000001'
  );
  if report->>'club_id' <> 'e4000000-0000-4000-8000-000000000001'
     or report->>'rotary_year_id' <> 'e6000000-0000-4000-8000-000000000001'
     or jsonb_array_length(report->'months') <> 12
     or jsonb_array_length(report->'members') <> 2
     or (report->'summary'->>'receivable_amount')::numeric <> 1500
     or (report->'summary'->>'received_amount')::numeric <> 600
     or (report->'summary'->>'outstanding_amount')::numeric <> 900
     or (report->'summary'->>'partial_count')::integer <> 1
     or (report->'summary'->>'unpaid_count')::integer <> 1
     or (report->'summary'->>'receipt_count')::integer <> 1
     or (report->'summary'->>'advance_amount')::numeric <> 300
     or (report->'summary'->>'reconciled_amount')::numeric <> 100
     or (report->'summary'->>'advance_outstanding_amount')::numeric <> 200 then
    raise exception 'finance report projection was wrong';
  end if;
  begin
    perform public.get_club_dues_finance_report(
      'e4000000-0000-4000-8000-000000000002',
      'e6000000-0000-4000-8000-000000000003'
    );
    raise exception 'finance role crossed the report tenant boundary';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000003', true);
do $$
declare
  years jsonb;
begin
  years := public.list_my_dues_finance_rotary_years('e4000000-0000-4000-8000-000000000001');
  if jsonb_array_length(years) <> 2
     or years->0->>'club_id' <> 'e4000000-0000-4000-8000-000000000001' then
    raise exception 'member year projection was wrong';
  end if;
  begin
    perform public.list_my_dues_finance_rotary_years('e4000000-0000-4000-8000-000000000002');
    raise exception 'member crossed the year tenant boundary';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
rollback;
