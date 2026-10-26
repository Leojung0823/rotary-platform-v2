-- Anonymous Joy suggestions: club officers can review text, never author identity.
-- Run only against Supabase local. Synthetic data is rolled back.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'c9100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'joy-suggest-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c9100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'joy-suggest-officer@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c9100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'joy-suggest-suspended@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c9100000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'joy-suggest-outsider@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c9100000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'joy-suggest-platform-admin@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('c9200000-0000-4000-8000-000000000001', '建議社員', 'joy-suggest-member@example.test'),
  ('c9200000-0000-4000-8000-000000000002', '建議幹部', 'joy-suggest-officer@example.test'),
  ('c9200000-0000-4000-8000-000000000003', '停權社員', 'joy-suggest-suspended@example.test'),
  ('c9200000-0000-4000-8000-000000000004', '外社社員', 'joy-suggest-outsider@example.test'),
  ('c9200000-0000-4000-8000-000000000005', '平台管理員', 'joy-suggest-platform-admin@example.test');

insert into public.app_accounts (id, auth_user_id, person_id, login_email, account_display_name, account_status) values
  ('c9300000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000001', 'c9200000-0000-4000-8000-000000000001', 'joy-suggest-member@example.test', '建議社員', 'active'),
  ('c9300000-0000-4000-8000-000000000002', 'c9100000-0000-4000-8000-000000000002', 'c9200000-0000-4000-8000-000000000002', 'joy-suggest-officer@example.test', '建議幹部', 'active'),
  ('c9300000-0000-4000-8000-000000000003', 'c9100000-0000-4000-8000-000000000003', 'c9200000-0000-4000-8000-000000000003', 'joy-suggest-suspended@example.test', '停權社員', 'active'),
  ('c9300000-0000-4000-8000-000000000004', 'c9100000-0000-4000-8000-000000000004', 'c9200000-0000-4000-8000-000000000004', 'joy-suggest-outsider@example.test', '外社社員', 'active'),
  ('c9300000-0000-4000-8000-000000000005', 'c9100000-0000-4000-8000-000000000005', 'c9200000-0000-4000-8000-000000000005', 'joy-suggest-platform-admin@example.test', '平台管理員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('c9500000-0000-4000-8000-000000000001', 'JOY-SUGGEST-A', '匿名建議甲社', 'active', now()),
  ('c9500000-0000-4000-8000-000000000002', 'JOY-SUGGEST-B', '匿名建議乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status) values
  ('c9600000-0000-4000-8000-000000000001', 'c9500000-0000-4000-8000-000000000001', 'c9200000-0000-4000-8000-000000000001', 'active'),
  ('c9600000-0000-4000-8000-000000000002', 'c9500000-0000-4000-8000-000000000001', 'c9200000-0000-4000-8000-000000000002', 'active'),
  ('c9600000-0000-4000-8000-000000000003', 'c9500000-0000-4000-8000-000000000001', 'c9200000-0000-4000-8000-000000000003', 'suspended'),
  ('c9600000-0000-4000-8000-000000000004', 'c9500000-0000-4000-8000-000000000002', 'c9200000-0000-4000-8000-000000000004', 'active');

insert into public.club_role_assignments (id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id)
values ('c9700000-0000-4000-8000-000000000001', 'c9500000-0000-4000-8000-000000000001',
  'c9300000-0000-4000-8000-000000000002', 'president', 'active', 'c9300000-0000-4000-8000-000000000002');
insert into public.platform_roles (app_account_id, role_key)
values ('c9300000-0000-4000-8000-000000000005', 'superadmin');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c9100000-0000-4000-8000-000000000005', true);
select * from public.set_platform_feature_flag('joy_wall_v1', true, array['local'], 100);
reset role;

do $$
begin
  if has_table_privilege('anon', 'public.joy_suggestions', 'SELECT')
    or has_table_privilege('authenticated', 'public.joy_suggestions', 'SELECT')
    or has_table_privilege('authenticated', 'public.joy_suggestions', 'INSERT')
    or has_table_privilege('authenticated', 'public.joy_suggestions', 'UPDATE')
    or has_table_privilege('service_role', 'public.joy_suggestions', 'SELECT')
    or has_schema_privilege('authenticated', 'joy_private', 'USAGE')
    or has_schema_privilege('service_role', 'joy_private', 'USAGE')
    or has_table_privilege('authenticated', 'joy_private.joy_suggestion_identities', 'SELECT')
    or has_table_privilege('service_role', 'joy_private.joy_suggestion_identities', 'SELECT') then
    raise exception 'Suggestion data or restricted identity schema is directly accessible';
  end if;
  if has_function_privilege('anon', 'public.create_joy_suggestion(uuid,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.list_joy_suggestions(uuid,integer)', 'EXECUTE')
    or has_function_privilege('anon', 'public.review_joy_suggestion(uuid,uuid,text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.create_joy_suggestion(uuid,text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.list_joy_suggestions(uuid,integer)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.review_joy_suggestion(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'Suggestion RPC privileges are incorrect';
  end if;
  if not exists (select 1 from pg_catalog.pg_proc
      where oid = 'public.create_joy_suggestion(uuid,text)'::regprocedure
        and 'search_path=pg_catalog, public, auth' = any(proconfig))
    or not exists (select 1 from pg_catalog.pg_proc
      where oid = 'public.list_joy_suggestions(uuid,integer)'::regprocedure
        and 'search_path=pg_catalog, public, auth' = any(proconfig))
    or not exists (select 1 from pg_catalog.pg_proc
      where oid = 'public.review_joy_suggestion(uuid,uuid,text)'::regprocedure
        and 'search_path=pg_catalog, public, auth' = any(proconfig)) then
    raise exception 'Suggestion RPC search_path is not fixed';
  end if;
end $$;

set local role anon;
do $$
begin
  begin perform public.create_joy_suggestion('c9500000-0000-4000-8000-000000000001', '匿名內容');
    raise exception 'Anonymous caller created a suggestion';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.joy_suggestions; raise exception 'Anonymous caller read suggestions';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- A regular member can submit but receives no content or identity back.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c9100000-0000-4000-8000-000000000001', true);
do $$
declare result jsonb; suggestion_id uuid;
begin
  result := public.create_joy_suggestion('c9500000-0000-4000-8000-000000000001', '希望增加服務活動回顧。');
  if result ? 'content' or result ? 'author_app_account_id' or result ? 'author_membership_id' then
    raise exception 'Submit response included private content or identity';
  end if;
  suggestion_id := (result->>'id')::uuid;
  perform set_config('joy.suggestion_id', suggestion_id::text, true);
  for i in 2..5 loop
    perform public.create_joy_suggestion('c9500000-0000-4000-8000-000000000001', '測試建議 ' || i);
  end loop;
  begin
    perform public.create_joy_suggestion('c9500000-0000-4000-8000-000000000001', '超過頻率限制');
    raise exception 'Suggestion rate limit was not enforced';
  exception when sqlstate '54000' then null; end;
  begin
    perform public.list_joy_suggestions('c9500000-0000-4000-8000-000000000001', 20);
    raise exception 'Regular member viewed the officer queue';
  exception when insufficient_privilege then null; end;
  begin
    perform public.review_joy_suggestion('c9500000-0000-4000-8000-000000000001', suggestion_id, 'reviewed');
    raise exception 'Regular member reviewed a suggestion';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from joy_private.joy_suggestion_identities;
    raise exception 'Regular member read private author identities';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Other clubs and suspended memberships cannot submit or access this queue.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c9100000-0000-4000-8000-000000000003', true);
do $$
begin
  begin perform public.create_joy_suggestion('c9500000-0000-4000-8000-000000000001', '停權社員');
    raise exception 'Suspended member submitted a suggestion';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c9100000-0000-4000-8000-000000000004', true);
do $$
begin
  begin perform public.create_joy_suggestion('c9500000-0000-4000-8000-000000000001', '外社社員');
    raise exception 'Cross-club member submitted a suggestion';
  exception when insufficient_privilege then null; end;
  begin perform public.list_joy_suggestions('c9500000-0000-4000-8000-000000000001', 20);
    raise exception 'Cross-club member viewed another club queue';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Officers see only suggestion content; identity remains absent from projection.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c9100000-0000-4000-8000-000000000002', true);
do $$
declare result jsonb; first_row jsonb; suggestion_id uuid;
begin
  result := public.list_joy_suggestions('c9500000-0000-4000-8000-000000000001', 20);
  if jsonb_array_length(result->'suggestions') <> 5 then raise exception 'Officer queue omitted suggestions'; end if;
  first_row := result->'suggestions'->0;
  if first_row->>'content' <> '希望增加服務活動回顧。'
    or first_row ? 'author_app_account_id' or first_row ? 'author_membership_id'
    or first_row ? 'author_display_name' or first_row ? 'identity' then
    raise exception 'Officer projection did not preserve anonymity';
  end if;
  suggestion_id := current_setting('joy.suggestion_id')::uuid;
  perform public.review_joy_suggestion('c9500000-0000-4000-8000-000000000001', suggestion_id, 'reviewed');
  begin
    perform public.review_joy_suggestion('c9500000-0000-4000-8000-000000000002', suggestion_id, 'dismissed');
    raise exception 'Officer reviewed a suggestion in another club';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$
begin
  if not exists (
    select 1 from joy_private.joy_suggestion_identities as identity
    where identity.suggestion_id = current_setting('joy.suggestion_id')::uuid
      and identity.author_app_account_id = 'c9300000-0000-4000-8000-000000000001'
      and identity.author_membership_id = 'c9600000-0000-4000-8000-000000000001'
  ) then raise exception 'Restricted author identity was not retained for audit'; end if;
  if not exists (
    select 1 from public.joy_suggestions
    where id = current_setting('joy.suggestion_id')::uuid and status = 'reviewed'
      and reviewed_by_app_account_id = 'c9300000-0000-4000-8000-000000000002'
  ) then raise exception 'Officer review status was not recorded'; end if;
  if not exists (select 1 from public.joy_wall_audit_events
      where object_id = current_setting('joy.suggestion_id')::uuid and event_type = 'suggestion_reviewed'
        and details = '{"status":"reviewed"}'::jsonb)
    or exists (select 1 from public.joy_wall_audit_events
      where object_id = current_setting('joy.suggestion_id')::uuid
        and (details ? 'content' or details ? 'author_app_account_id' or details ? 'author_membership_id')) then
    raise exception 'Audit record is missing status or contains private content';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c9100000-0000-4000-8000-000000000005', true);
select * from public.set_platform_feature_flag('joy_wall_v1', false, array['local'], 100);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c9100000-0000-4000-8000-000000000001', true);
do $$
begin
  begin perform public.create_joy_suggestion('c9500000-0000-4000-8000-000000000001', '旗標關閉');
    raise exception 'Suggestion submission ignored disabled feature flag';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
