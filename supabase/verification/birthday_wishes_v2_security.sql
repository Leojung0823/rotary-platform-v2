-- Birthday wishes V2 core: defaults, age privacy, local-day limits, authorship,
-- tenant isolation, and the rollback-safe projection contract.
-- Run against local Supabase only. Every fixture is rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'birthday-v2-author@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'birthday-v2-recipient@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'birthday-v2-outsider@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'birthday-v2-manager@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email, birth_date) values
  ('22000000-0000-4000-8000-000000000001', 'V2祝福作者', 'birthday-v2-author@example.test', '1980-01-02'),
  ('22000000-0000-4000-8000-000000000002', 'V2生日社員', 'birthday-v2-recipient@example.test', '1975-08-20'),
  ('22000000-0000-4000-8000-000000000003', 'V2外社社員', 'birthday-v2-outsider@example.test', '1990-03-04'),
  ('22000000-0000-4000-8000-000000000004', 'V2社務管理者', 'birthday-v2-manager@example.test', null);

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('32000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', 'birthday-v2-author@example.test', 'V2祝福作者', 'active'),
  ('32000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000002', 'birthday-v2-recipient@example.test', 'V2生日社員', 'active'),
  ('32000000-0000-4000-8000-000000000003', '12000000-0000-4000-8000-000000000003', '22000000-0000-4000-8000-000000000003', 'birthday-v2-outsider@example.test', 'V2外社社員', 'active'),
  ('32000000-0000-4000-8000-000000000004', '12000000-0000-4000-8000-000000000004', '22000000-0000-4000-8000-000000000004', 'birthday-v2-manager@example.test', 'V2社務管理者', 'active');

insert into public.privacy_settings (
  app_account_id, show_email_to_club, show_phone_to_club, show_birthday_year, analytics_consent
) values
  ('32000000-0000-4000-8000-000000000002', false, false, false, true);

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('42000000-0000-4000-8000-000000000001', 'BDAY-V2-A', '生日 V2 甲社', 'active', now()),
  ('42000000-0000-4000-8000-000000000002', 'BDAY-V2-B', '生日 V2 乙社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status) values
  ('52000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', 'active'),
  ('52000000-0000-4000-8000-000000000002', '42000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000002', 'active'),
  ('52000000-0000-4000-8000-000000000003', '42000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000003', 'active');

insert into public.club_operator_permissions (
  id, club_id, app_account_id, operator_role_key, permission_level, assignment_status, starts_at
) values (
  '62000000-0000-4000-8000-000000000001',
  '42000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000004',
  'executive_secretary', 'club_manager', 'active', now() - interval '1 day'
);

do $$
begin
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.birthday_wishes'::regclass)
     or not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.birthday_visibility_preferences'::regclass) then
    raise exception 'birthday V2 RLS missing';
  end if;
  if has_table_privilege('authenticated', 'public.birthday_wishes', 'SELECT')
     or has_table_privilege('authenticated', 'public.birthday_wishes', 'INSERT')
     or has_table_privilege('authenticated', 'public.birthday_visibility_preferences', 'SELECT') then
    raise exception 'authenticated role gained direct birthday table access';
  end if;
  if has_function_privilege('anon', 'public.get_my_birthday_page_v2(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.create_birthday_wish_v2(uuid, uuid, text)', 'EXECUTE') then
    raise exception 'anonymous role gained birthday V2 RPC access';
  end if;
end $$;

do $$
begin
  if public.birthday_effective_date('2000-02-29', 2025) <> date '2025-02-28'
     or public.birthday_effective_date('2000-02-29', 2028) <> date '2028-02-29'
     or public.birthday_age_on('1975-08-20', date '2026-08-19') <> 50
     or public.birthday_age_on('1975-08-20', date '2026-08-20') <> 51 then
    raise exception 'birthday date or age calculation is incorrect';
  end if;
end $$;

-- A missing preference remains private. V2-created preferences default to
-- public, but the caller still explicitly chooses when submitting the form.
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000002', true);
do $$
declare page jsonb;
begin
  page := public.get_my_birthday_page_v2('42000000-0000-4000-8000-000000000001');
  if jsonb_array_length(page->'birthdays') <> 0
     or (page->'my_preference'->>'has_preference')::boolean then
    raise exception 'missing V2 preference was not private: %', page;
  end if;

  perform public.set_my_birthday_preference_v2(
    '42000000-0000-4000-8000-000000000001', true, true
  );
  page := public.get_my_birthday_page_v2('42000000-0000-4000-8000-000000000001');
  if jsonb_array_length(page->'birthdays') <> 1
     or page->'birthdays'->0->>'birth_month' <> '8'
     or page->'birthdays'->0->>'birth_day' <> '20'
     or page->'birthdays'->0 ? 'birth_date'
     or page->'birthdays'->0 ? 'birth_year'
     or page->'birthdays'->0->>'age' is not null then
    raise exception 'V2 birthday privacy projection is invalid: %', page->'birthdays';
  end if;
end $$;
reset role;

create temporary table birthday_v2_test_wishes (
  ordinal integer primary key,
  wish_id uuid not null
);
grant select, insert on birthday_v2_test_wishes to authenticated;

-- Ten independent wishes are allowed on one local day for one recipient;
-- the eleventh is rejected even though the V1 yearly uniqueness rule remains.
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000001', true);
do $$
declare
  created_id uuid;
  page jsonb;
begin
  for ordinal in 1..10 loop
    created_id := public.create_birthday_wish_v2(
      '42000000-0000-4000-8000-000000000001',
      '52000000-0000-4000-8000-000000000002',
      format('V2 第 %s 則祝福', ordinal)
    );
    insert into birthday_v2_test_wishes values (ordinal, created_id);
  end loop;

  begin
    perform public.create_birthday_wish_v2(
      '42000000-0000-4000-8000-000000000001',
      '52000000-0000-4000-8000-000000000002',
      '第十一則祝福'
    );
    raise exception 'birthday V2 daily limit accepted';
  exception
    when sqlstate '22023' then
      if position('daily_limit_reached' in sqlerrm) = 0 then raise; end if;
  end;

  perform public.update_own_birthday_wish_v2(
    '42000000-0000-4000-8000-000000000001',
    (select wish_id from birthday_v2_test_wishes where ordinal = 1),
    '修改後的生日祝福'
  );
  perform public.delete_own_birthday_wish(
    '42000000-0000-4000-8000-000000000001',
    (select wish_id from birthday_v2_test_wishes where ordinal = 2)
  );

  page := public.get_my_birthday_page_v2('42000000-0000-4000-8000-000000000001');
  if jsonb_array_length(page->'wishes') <> 9
     or not exists (
       select 1 from jsonb_array_elements(page->'wishes') as item
       where item->>'content' = '修改後的生日祝福'
     ) then
    raise exception 'V2 multiple, update, or delete behavior is invalid: %', page->'wishes';
  end if;
end $$;
reset role;

-- The recipient sees the same-club wish but not its author's identity.
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000002', true);
do $$
declare page jsonb := public.get_my_birthday_page_v2('42000000-0000-4000-8000-000000000001');
begin
  if jsonb_array_length(page->'wishes') <> 9
     or page->'wishes'->0->>'author_name' is not null
     or page->'wishes'->0->>'author_is_hidden' <> 'true' then
    raise exception 'member author anonymity failed: %', page->'wishes'->0;
  end if;
end $$;
reset role;

-- Showing the birth year is the explicit consent required to return age.
update public.privacy_settings
set show_birthday_year = true
where app_account_id = '32000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000002', true);
do $$
declare
  page jsonb := public.get_my_birthday_page_v2('42000000-0000-4000-8000-000000000001');
  local_today date := (now() at time zone 'Asia/Taipei')::date;
  expected_age integer := extract(year from local_today)::integer - 1975
    - case when local_today < make_date(extract(year from local_today)::integer, 8, 20) then 1 else 0 end;
begin
  if (page->'birthdays'->0->>'age')::integer <> expected_age then
    raise exception 'age consent projection failed: %', page->'birthdays'->0;
  end if;
end $$;
reset role;

-- A club manager can moderate and see the author; another club cannot read it.
set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000004', true);
do $$
declare page jsonb := public.get_my_birthday_page_v2('42000000-0000-4000-8000-000000000001');
begin
  if not (page->>'can_manage')::boolean
     or page->'wishes'->0->>'author_name' <> 'V2祝福作者' then
    raise exception 'manager V2 projection failed: %', page->'wishes'->0;
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000003', true);
do $$
begin
  begin
    perform public.get_my_birthday_page_v2('42000000-0000-4000-8000-000000000001');
    raise exception 'cross-club V2 birthday read accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$
begin
  if (select count(*) from public.birthday_wishes where experience_version = 2 and status = 'active') <> 9
     or (select count(*) from public.birthday_wishes where experience_version = 2 and status = 'deleted') <> 1
     or not exists (
       select 1 from public.birthday_wishes
       where id = (select wish_id from birthday_v2_test_wishes where ordinal = 1)
         and experience_version = 2
         and content = '修改後的生日祝福'
     ) then
    raise exception 'V2 history/version state is invalid';
  end if;
end $$;

rollback;
