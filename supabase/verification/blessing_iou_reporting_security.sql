-- Blessing IOU Rotary-year report authorization, July-to-June aggregation,
-- tenant isolation, and reversed-collection verification. Local Supabase only.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '1c000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'report-member-one@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1c000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'report-member-two@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1c000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'report-finance@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1c000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'report-outsider@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1c000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'report-platform@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('2c000000-0000-4000-8000-000000000001', '年度報表社員甲', 'report-member-one@example.test'),
  ('2c000000-0000-4000-8000-000000000002', '年度報表社員乙', 'report-member-two@example.test'),
  ('2c000000-0000-4000-8000-000000000003', '年度報表財務', 'report-finance@example.test'),
  ('2c000000-0000-4000-8000-000000000004', '年度報表外社社員', 'report-outsider@example.test'),
  ('2c000000-0000-4000-8000-000000000005', '年度報表純平台管理員', 'report-platform@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('3c000000-0000-4000-8000-000000000001', '1c000000-0000-4000-8000-000000000001', '2c000000-0000-4000-8000-000000000001', 'report-member-one@example.test', '年度報表社員甲', 'active'),
  ('3c000000-0000-4000-8000-000000000002', '1c000000-0000-4000-8000-000000000002', '2c000000-0000-4000-8000-000000000002', 'report-member-two@example.test', '年度報表社員乙', 'active'),
  ('3c000000-0000-4000-8000-000000000003', '1c000000-0000-4000-8000-000000000003', '2c000000-0000-4000-8000-000000000003', 'report-finance@example.test', '年度報表財務', 'active'),
  ('3c000000-0000-4000-8000-000000000004', '1c000000-0000-4000-8000-000000000004', '2c000000-0000-4000-8000-000000000004', 'report-outsider@example.test', '年度報表外社社員', 'active'),
  ('3c000000-0000-4000-8000-000000000005', '1c000000-0000-4000-8000-000000000005', '2c000000-0000-4000-8000-000000000005', 'report-platform@example.test', '年度報表純平台管理員', 'active');

insert into public.clubs (
  id, club_code, club_name, timezone_name, club_status, activated_at
) values
  ('4c000000-0000-4000-8000-000000000001', 'REPORT-A', '年度報表測試甲社', 'Asia/Taipei', 'active', now()),
  ('4c000000-0000-4000-8000-000000000002', 'REPORT-B', '年度報表測試乙社', 'Asia/Taipei', 'active', now());

insert into public.club_memberships (
  id, club_id, person_id, membership_status
) values
  ('5c000000-0000-4000-8000-000000000001', '4c000000-0000-4000-8000-000000000001', '2c000000-0000-4000-8000-000000000001', 'active'),
  ('5c000000-0000-4000-8000-000000000002', '4c000000-0000-4000-8000-000000000001', '2c000000-0000-4000-8000-000000000002', 'active'),
  ('5c000000-0000-4000-8000-000000000003', '4c000000-0000-4000-8000-000000000001', '2c000000-0000-4000-8000-000000000003', 'active'),
  ('5c000000-0000-4000-8000-000000000004', '4c000000-0000-4000-8000-000000000002', '2c000000-0000-4000-8000-000000000004', 'active');

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status
) values (
  '6c000000-0000-4000-8000-000000000001',
  '4c000000-0000-4000-8000-000000000001',
  '3c000000-0000-4000-8000-000000000003',
  'finance',
  'active'
);

insert into public.platform_roles (id, app_account_id, role_key) values (
  '7c000000-0000-4000-8000-000000000001',
  '3c000000-0000-4000-8000-000000000005',
  'platform_admin'
);

create temporary table blessing_iou_report_test_values (
  key text primary key,
  value text not null
);
grant select on blessing_iou_report_test_values to authenticated;
insert into blessing_iou_report_test_values values
  (
    'rotary-year-start',
    (
      extract(year from (now() at time zone 'Asia/Taipei')::date)::integer
      - case when extract(month from (now() at time zone 'Asia/Taipei')::date) < 7 then 1 else 0 end
    )::text
  );
insert into blessing_iou_report_test_values values
  ('starts-on', make_date((select value::integer from blessing_iou_report_test_values where key = 'rotary-year-start'), 7, 1)::text),
  ('ends-on', make_date((select value::integer from blessing_iou_report_test_values where key = 'rotary-year-start') + 1, 6, 30)::text);

-- The reporting RPC is authenticated-only, has a fixed search path, and is
-- granted only through the club-scoped reporting permission.
do $$
declare function_config text[];
begin
  if has_function_privilege(
    'anon',
    'public.get_blessing_iou_rotary_year_report(uuid,integer)',
    'EXECUTE'
  ) then
    raise exception 'anonymous role gained reporting RPC access';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.get_blessing_iou_rotary_year_report(uuid,integer)',
    'EXECUTE'
  ) then
    raise exception 'authenticated reporting RPC grant is missing';
  end if;
  select proconfig into function_config
  from pg_catalog.pg_proc
  where oid = 'public.get_blessing_iou_rotary_year_report(uuid,integer)'::regprocedure;
  if function_config is null
     or not ('search_path=pg_catalog, public, auth' = any(function_config)) then
    raise exception 'reporting RPC search_path is not fixed';
  end if;
  if not exists (
    select 1 from public.role_permissions
    where role_key = 'finance' and permission_key = 'blessing_iou.report'
  ) or not exists (
    select 1 from public.role_permissions
    where role_key = 'president' and permission_key = 'blessing_iou.report'
  ) or not exists (
    select 1 from public.role_permissions
    where role_key = 'secretary' and permission_key = 'blessing_iou.report'
  ) then
    raise exception 'club reporting permissions are incomplete';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.platform_feature_flags'::regclass
      and pg_get_constraintdef(oid) like '%blessing_iou_reporting_v1%'
  ) then
    raise exception 'reporting rollout key is missing';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'blessing_iou_entries'
      and indexname = 'blessing_iou_entries_club_year_reporting_idx'
      and indexdef like '%(club_id, pledged_on, author_membership_id)%'
      and indexdef like '%entry_status = ''active''%'
      and indexdef like '%pledged_amount IS NOT NULL%'
  ) then
    raise exception 'reporting index is missing or incomplete';
  end if;
end $$;

-- Seed two current-year members, a prior-year promise, an amount-less post,
-- and a deleted promise. Only the three active current-year pledges belong in
-- the report.
insert into public.blessing_iou_entries (
  id, club_id, author_membership_id, author_app_account_id, blessing_text,
  pledged_amount, currency_code, amount_visibility, pledged_on, entry_status
) values
  ('8c000000-0000-4000-8000-000000000001', '4c000000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000001', '3c000000-0000-4000-8000-000000000001', 'REPORT-SECRET-JULY', 1000, 'TWD', 'private', (select value::date from blessing_iou_report_test_values where key = 'starts-on'), 'active'),
  ('8c000000-0000-4000-8000-000000000002', '4c000000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000001', '3c000000-0000-4000-8000-000000000001', 'REPORT-SECRET-AUGUST-ONE', 500, 'TWD', 'club', (select value::date + 31 from blessing_iou_report_test_values where key = 'starts-on'), 'active'),
  ('8c000000-0000-4000-8000-000000000003', '4c000000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000002', '3c000000-0000-4000-8000-000000000002', 'REPORT-SECRET-AUGUST-TWO', 2000, 'TWD', 'private', (select value::date + 41 from blessing_iou_report_test_values where key = 'starts-on'), 'active'),
  ('8c000000-0000-4000-8000-000000000004', '4c000000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000001', '3c000000-0000-4000-8000-000000000001', 'REPORT-SECRET-PRIOR-YEAR', 700, 'TWD', 'private', (select value::date - 1 from blessing_iou_report_test_values where key = 'starts-on'), 'active'),
  ('8c000000-0000-4000-8000-000000000005', '4c000000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000002', '3c000000-0000-4000-8000-000000000002', 'REPORT-SECRET-NO-PLEDGE', null, 'TWD', 'private', (select value::date + 45 from blessing_iou_report_test_values where key = 'starts-on'), 'active');

insert into public.blessing_iou_entries (
  id, club_id, author_membership_id, author_app_account_id, blessing_text,
  pledged_amount, currency_code, amount_visibility, pledged_on, entry_status,
  deleted_by_app_account_id, deleted_at, deletion_reason
) values (
  '8c000000-0000-4000-8000-000000000006',
  '4c000000-0000-4000-8000-000000000001',
  '5c000000-0000-4000-8000-000000000002',
  '3c000000-0000-4000-8000-000000000002',
  'REPORT-SECRET-DELETED',
  900,
  'TWD',
  'private',
  (select value::date + 50 from blessing_iou_report_test_values where key = 'starts-on'),
  'deleted',
  '3c000000-0000-4000-8000-000000000003',
  now(),
  '測試刪除'
);

insert into public.blessing_iou_collections (
  id, club_id, entry_id, amount_received, currency_code, received_on,
  payment_method, collection_status, recorded_by_app_account_id
) values
  ('9c000000-0000-4000-8000-000000000001', '4c000000-0000-4000-8000-000000000001', '8c000000-0000-4000-8000-000000000001', 400, 'TWD', (select value::date from blessing_iou_report_test_values where key = 'starts-on'), 'cash', 'posted', '3c000000-0000-4000-8000-000000000003'),
  ('9c000000-0000-4000-8000-000000000002', '4c000000-0000-4000-8000-000000000001', '8c000000-0000-4000-8000-000000000002', 500, 'TWD', (select value::date + 31 from blessing_iou_report_test_values where key = 'starts-on'), 'transfer', 'posted', '3c000000-0000-4000-8000-000000000003'),
  ('9c000000-0000-4000-8000-000000000003', '4c000000-0000-4000-8000-000000000001', '8c000000-0000-4000-8000-000000000004', 700, 'TWD', (select value::date - 1 from blessing_iou_report_test_values where key = 'starts-on'), 'cash', 'posted', '3c000000-0000-4000-8000-000000000003');

-- Reversed history remains stored but must never count as received money.
insert into public.blessing_iou_collections (
  id, club_id, entry_id, amount_received, currency_code, received_on,
  payment_method, collection_status, recorded_by_app_account_id,
  reversed_by_app_account_id, reversed_at, reversal_reason
) values (
  '9c000000-0000-4000-8000-000000000004',
  '4c000000-0000-4000-8000-000000000001',
  '8c000000-0000-4000-8000-000000000003',
  300,
  'TWD',
  (select value::date + 41 from blessing_iou_report_test_values where key = 'starts-on'),
  'cash',
  'reversed',
  '3c000000-0000-4000-8000-000000000003',
  '3c000000-0000-4000-8000-000000000003',
  now(),
  '測試沖銷'
);

-- Finance sees a fixed July-to-June report with aggregate-only data.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-4000-8000-000000000003', true);
do $$
declare
  rotary_year integer := (
    select value::integer from blessing_iou_report_test_values where key = 'rotary-year-start'
  );
  report jsonb;
  member_one jsonb;
  member_two jsonb;
begin
  report := public.get_blessing_iou_rotary_year_report(
    '4c000000-0000-4000-8000-000000000001', rotary_year
  );

  if report->>'club_id' <> '4c000000-0000-4000-8000-000000000001'
     or (report->>'rotary_year_start')::integer <> rotary_year
     or report->>'rotary_year_label' <> format('%s-%s', rotary_year, right((rotary_year + 1)::text, 2))
     or report->>'starts_on' <> make_date(rotary_year, 7, 1)::text
     or report->>'ends_on' <> make_date(rotary_year + 1, 6, 30)::text
     or report->>'currency_code' <> 'TWD' then
    raise exception 'Rotary-year report metadata is incorrect';
  end if;

  if (report->'summary'->>'entry_count')::integer <> 3
     or (report->'summary'->>'member_count')::integer <> 2
     or (report->'summary'->>'pledged_amount')::numeric <> 3500
     or (report->'summary'->>'received_amount')::numeric <> 900
     or (report->'summary'->>'outstanding_amount')::numeric <> 2600
     or (report->'summary'->>'unpaid_entry_count')::integer <> 1
     or (report->'summary'->>'partial_entry_count')::integer <> 1
     or (report->'summary'->>'paid_entry_count')::integer <> 1 then
    raise exception 'Rotary-year report summary is incorrect';
  end if;

  if jsonb_array_length(report->'months') <> 12
     or report->'months'->0->>'month' <> format('%s-07', rotary_year)
     or report->'months'->1->>'month' <> format('%s-08', rotary_year)
     or report->'months'->11->>'month' <> format('%s-06', rotary_year + 1)
     or (report->'months'->0->>'pledged_amount')::numeric <> 1000
     or (report->'months'->0->>'received_amount')::numeric <> 400
     or (report->'months'->0->>'outstanding_amount')::numeric <> 600
     or (report->'months'->1->>'pledged_amount')::numeric <> 2500
     or (report->'months'->1->>'received_amount')::numeric <> 500
     or (report->'months'->1->>'outstanding_amount')::numeric <> 2000
     or exists (
       select 1
       from jsonb_array_elements(report->'months') with ordinality as month(item, position)
       where position between 3 and 12
         and (
           (item->>'entry_count')::integer <> 0
           or (item->>'pledged_amount')::numeric <> 0
           or (item->>'received_amount')::numeric <> 0
           or (item->>'outstanding_amount')::numeric <> 0
         )
     ) then
    raise exception 'July-to-June monthly report is incorrect';
  end if;

  select item into member_one
  from jsonb_array_elements(report->'members') as item
  where item->>'author_membership_id' = '5c000000-0000-4000-8000-000000000001';
  select item into member_two
  from jsonb_array_elements(report->'members') as item
  where item->>'author_membership_id' = '5c000000-0000-4000-8000-000000000002';
  if jsonb_array_length(report->'members') <> 2
     or (member_one->>'pledged_amount')::numeric <> 1500
     or (member_one->>'received_amount')::numeric <> 900
     or (member_one->>'outstanding_amount')::numeric <> 600
     or (member_one->>'partial_entry_count')::integer <> 1
     or (member_one->>'paid_entry_count')::integer <> 1
     or (member_two->>'pledged_amount')::numeric <> 2000
     or (member_two->>'received_amount')::numeric <> 0
     or (member_two->>'outstanding_amount')::numeric <> 2000
     or (member_two->>'unpaid_entry_count')::integer <> 1 then
    raise exception 'per-member Rotary-year totals are incorrect';
  end if;

  if report::text like '%REPORT-SECRET-%'
     or report::text like '%8c000000-0000-4000-8000-000000000001%'
     or report ? 'entries' then
    raise exception 'aggregate report leaked blessing or entry-level data';
  end if;

  begin
    perform public.get_blessing_iou_rotary_year_report(
      '4c000000-0000-4000-8000-000000000001', rotary_year + 1
    );
    raise exception 'future Rotary year was accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;

-- Ordinary members, other clubs, and platform-only administrators cannot read
-- a club financial report. Platform administrators may still control rollout.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-4000-8000-000000000001', true);
do $$
begin
  begin
    perform public.get_blessing_iou_rotary_year_report(
      '4c000000-0000-4000-8000-000000000001',
      (select value::integer from blessing_iou_report_test_values where key = 'rotary-year-start')
    );
    raise exception 'ordinary member read club financial report';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-4000-8000-000000000004', true);
do $$
begin
  begin
    perform public.get_blessing_iou_rotary_year_report(
      '4c000000-0000-4000-8000-000000000001',
      (select value::integer from blessing_iou_report_test_values where key = 'rotary-year-start')
    );
    raise exception 'cross-club member read club financial report';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-4000-8000-000000000005', true);
do $$
declare flag record;
begin
  select * into flag from public.set_platform_feature_flag(
    'blessing_iou_reporting_v1', true, array['local'], 100
  );
  if flag.feature_key <> 'blessing_iou_reporting_v1' or not flag.enabled then
    raise exception 'platform administrator could not configure report rollout';
  end if;
  begin
    perform public.get_blessing_iou_rotary_year_report(
      '4c000000-0000-4000-8000-000000000001',
      (select value::integer from blessing_iou_report_test_values where key = 'rotary-year-start')
    );
    raise exception 'platform-only identity read club financial report';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Reversing a posted receipt immediately changes effective report totals.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-4000-8000-000000000003', true);
do $$
declare report jsonb;
begin
  perform public.reverse_blessing_iou_collection(
    '4c000000-0000-4000-8000-000000000001',
    '9c000000-0000-4000-8000-000000000001',
    (select value::date from blessing_iou_report_test_values where key = 'starts-on'),
    '年度報表沖銷測試'
  );
  report := public.get_blessing_iou_rotary_year_report(
    '4c000000-0000-4000-8000-000000000001',
    (select value::integer from blessing_iou_report_test_values where key = 'rotary-year-start')
  );
  if (report->'summary'->>'received_amount')::numeric <> 500
     or (report->'summary'->>'outstanding_amount')::numeric <> 3000
     or (report->'summary'->>'unpaid_entry_count')::integer <> 2
     or (report->'summary'->>'partial_entry_count')::integer <> 0
     or (report->'summary'->>'paid_entry_count')::integer <> 1
     or (report->'months'->0->>'received_amount')::numeric <> 0 then
    raise exception 'reversed receipt remained in effective report totals';
  end if;
end $$;
reset role;

rollback;
