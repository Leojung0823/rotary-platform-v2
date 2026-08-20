-- Birthday wishes tenant, privacy, ownership, and moderation verification.
-- Run against local Supabase only. Every fixture is rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'birthday-author@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'birthday-recipient@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'birthday-outsider@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'birthday-manager@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email, birth_date) values
  ('21000000-0000-4000-8000-000000000001', '祝福作者', 'birthday-author@example.test', '1980-01-02'),
  ('21000000-0000-4000-8000-000000000002', '生日社員', 'birthday-recipient@example.test', '1975-08-20'),
  ('21000000-0000-4000-8000-000000000003', '外社社員', 'birthday-outsider@example.test', '1990-03-04'),
  ('21000000-0000-4000-8000-000000000004', '社務管理者', 'birthday-manager@example.test', null);

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('31000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'birthday-author@example.test', '祝福作者', 'active'),
  ('31000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002', 'birthday-recipient@example.test', '生日社員', 'active'),
  ('31000000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-000000000003', 'birthday-outsider@example.test', '外社社員', 'active'),
  ('31000000-0000-4000-8000-000000000004', '11000000-0000-4000-8000-000000000004', '21000000-0000-4000-8000-000000000004', 'birthday-manager@example.test', '社務管理者', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('41000000-0000-4000-8000-000000000001', 'BDAY-A', '生日甲社', 'active', now()),
  ('41000000-0000-4000-8000-000000000002', 'BDAY-B', '生日乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status) values
  ('51000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 'active'),
  ('51000000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000002', 'active'),
  ('51000000-0000-4000-8000-000000000003', '41000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000003', 'active');

insert into public.club_operator_permissions (
  id, club_id, app_account_id, operator_role_key, permission_level, assignment_status, starts_at
) values (
  '61000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000004',
  'executive_secretary', 'club_manager', 'active', now() - interval '1 day'
);

do $$
begin
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.birthday_wishes'::regclass)
     or not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.birthday_visibility_preferences'::regclass) then
    raise exception 'birthday RLS missing';
  end if;
  if has_table_privilege('authenticated', 'public.birthday_wishes', 'SELECT')
     or has_table_privilege('authenticated', 'public.birthday_wishes', 'INSERT')
     or has_table_privilege('authenticated', 'public.birthday_visibility_preferences', 'SELECT') then
    raise exception 'authenticated role gained direct birthday table access';
  end if;
  if has_function_privilege('anon', 'public.get_my_birthday_page(uuid)', 'EXECUTE') then
    raise exception 'anonymous role gained birthday RPC access';
  end if;
end $$;

-- Missing preference stays private; recipient then opts in explicitly.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', true);
do $$
declare page jsonb := public.get_my_birthday_page('41000000-0000-4000-8000-000000000001');
begin
  if jsonb_array_length(page->'birthdays') <> 0 then raise exception 'default birthday privacy failed'; end if;
  perform public.set_my_birthday_preference('41000000-0000-4000-8000-000000000001', true, true);
  page := public.get_my_birthday_page('41000000-0000-4000-8000-000000000001');
  if page->'birthdays'->0->>'birth_month' <> '8'
     or page->'birthdays'->0->>'birth_day' <> '20'
     or page->'birthdays'->0 ? 'birth_year'
     or page->'birthdays'->0 ? 'birth_date' then
    raise exception 'birthday projection leaked more than month/day';
  end if;
end $$;
reset role;

create temporary table birthday_test_value (wish_id uuid not null);
grant select, insert on birthday_test_value to authenticated;

-- Same-club author can create exactly one current-year wish.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
do $$
declare
  created_id uuid;
  page jsonb;
begin
  created_id := public.create_birthday_wish(
    '41000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000002',
    E'  生日\n快樂  '
  );
  insert into birthday_test_value values (created_id);
  page := public.get_my_birthday_page('41000000-0000-4000-8000-000000000001');
  if page->'wishes'->0->>'content' <> '生日 快樂' then
    raise exception 'birthday content normalization failed';
  end if;
  begin
    perform public.create_birthday_wish(
      '41000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000002',
      '重複祝福'
    );
    raise exception 'duplicate yearly wish accepted';
  exception when unique_violation then null;
  end;
end $$;
reset role;

-- Cross-club member cannot read or mutate Club A birthday data.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000003', true);
do $$
begin
  begin
    perform public.get_my_birthday_page('41000000-0000-4000-8000-000000000001');
    raise exception 'cross-club birthday read accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_birthday_wish(
      '41000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000002',
      '跨社祝福'
    );
    raise exception 'cross-club birthday write accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Manager without membership can view and moderate, but cannot author wishes.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000004', true);
do $$
declare page jsonb := public.get_my_birthday_page('41000000-0000-4000-8000-000000000001');
begin
  if not (page->>'can_manage')::boolean or page->'my_preference' <> 'null'::jsonb then
    raise exception 'operator birthday projection invalid';
  end if;
  begin
    perform public.create_birthday_wish(
      '41000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000002',
      '管理者越權祝福'
    );
    raise exception 'non-member manager authored a wish';
  exception when insufficient_privilege then null;
  end;
  perform public.hide_birthday_wish(
    '41000000-0000-4000-8000-000000000001',
    (select wish_id from birthday_test_value),
    '測試隱藏'
  );
end $$;
reset role;

do $$
begin
  if not exists (
    select 1 from public.birthday_wishes
    where id = (select wish_id from birthday_test_value)
      and status = 'hidden'
      and removed_at is not null
      and removal_reason = '測試隱藏'
  ) then raise exception 'manager moderation was not retained'; end if;
  begin
    delete from public.birthday_wishes where id = (select wish_id from birthday_test_value);
    raise exception 'birthday wish hard delete accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
