-- Birthday visibility defaults and member settings projection verification.
-- Run against local Supabase only. Every fixture is rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '17000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'birthday-default-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '17000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'birthday-default-outsider@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '17000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'birthday-default-legacy@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email, birth_date) values
  ('27000000-0000-4000-8000-000000000001', '生日設定雙重社籍社員', 'birthday-default-member@example.test', '1980-08-20'),
  ('27000000-0000-4000-8000-000000000002', '生日設定外社社員', 'birthday-default-outsider@example.test', '1990-03-04'),
  ('27000000-0000-4000-8000-000000000003', '後來填寫生日的社員', 'birthday-default-legacy@example.test', null);

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('37000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', 'birthday-default-member@example.test', '生日設定雙重社籍社員', 'active'),
  ('37000000-0000-4000-8000-000000000002', '17000000-0000-4000-8000-000000000002', '27000000-0000-4000-8000-000000000002', 'birthday-default-outsider@example.test', '生日設定外社社員', 'active'),
  ('37000000-0000-4000-8000-000000000003', '17000000-0000-4000-8000-000000000003', '27000000-0000-4000-8000-000000000003', 'birthday-default-legacy@example.test', '後來填寫生日的社員', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at)
values
  ('47000000-0000-4000-8000-000000000001', 'BDAY-DEFAULT-A', '生日預設甲社', 'active', now()),
  ('47000000-0000-4000-8000-000000000002', 'BDAY-DEFAULT-B', '生日預設乙社', 'active', now()),
  ('47000000-0000-4000-8000-000000000003', 'BDAY-DEFAULT-OUT', '生日預設外社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status)
values
  ('57000000-0000-4000-8000-000000000001', '47000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000001', 'active'),
  ('57000000-0000-4000-8000-000000000002', '47000000-0000-4000-8000-000000000002', '27000000-0000-4000-8000-000000000001', 'active'),
  ('57000000-0000-4000-8000-000000000003', '47000000-0000-4000-8000-000000000003', '27000000-0000-4000-8000-000000000002', 'active'),
  ('57000000-0000-4000-8000-000000000004', '47000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000003', 'active');

do $$
begin
  if (select column_default
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'birthday_visibility_preferences'
        and column_name = 'is_listed') not like 'true%' then
    raise exception 'birthday is_listed default is not true';
  end if;
  if (select column_default
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'birthday_visibility_preferences'
        and column_name = 'allow_wishes') not like 'true%' then
    raise exception 'birthday allow_wishes default is not true';
  end if;

  if not exists (
       select 1
       from public.birthday_visibility_preferences as preference
       where preference.membership_id = '57000000-0000-4000-8000-000000000001'
         and preference.club_id = '47000000-0000-4000-8000-000000000001'
         and preference.is_listed
         and preference.allow_wishes
     )
     or not exists (
       select 1
       from public.birthday_visibility_preferences as preference
       where preference.membership_id = '57000000-0000-4000-8000-000000000002'
         and preference.club_id = '47000000-0000-4000-8000-000000000002'
         and preference.is_listed
         and preference.allow_wishes
     ) then
    raise exception 'new membership did not receive public birthday defaults';
  end if;

  -- The legacy-like membership was created before its person had a birthday,
  -- so no preference row was created. Adding the birthday later must not
  -- silently make that existing membership public.
  update public.people
  set birth_date = '1980-08-21'
  where id = '27000000-0000-4000-8000-000000000003';
  if exists (
       select 1
       from public.birthday_visibility_preferences as preference
       where preference.membership_id = '57000000-0000-4000-8000-000000000004'
     ) then
    raise exception 'editing a legacy birthday created a public preference';
  end if;

  if not exists (
       select 1
       from pg_catalog.pg_trigger
       where tgname = 'club_memberships_ensure_birthday_visibility_preference'
         and not tgisinternal
     ) then
    raise exception 'birthday preference membership trigger is missing';
  end if;

  if not (select relrowsecurity
          from pg_catalog.pg_class
          where oid = 'public.birthday_visibility_preferences'::regclass)
     or has_table_privilege('authenticated', 'public.birthday_visibility_preferences', 'SELECT')
     or has_table_privilege('authenticated', 'public.birthday_visibility_preferences', 'UPDATE') then
    raise exception 'birthday preference table is not closed to browser roles';
  end if;

  if has_function_privilege('anon', 'public.get_my_birthday_preferences()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_my_birthday_preferences()', 'EXECUTE') then
    raise exception 'birthday preference projection grant boundary is incorrect';
  end if;
end $$;

-- The projection is limited to the current person's active memberships, and
-- each club keeps its own independent setting.
set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000001', true);
do $$
declare
  preferences jsonb;
begin
  preferences := public.get_my_birthday_preferences();
  if jsonb_array_length(preferences) <> 2
     or not exists (
       select 1 from jsonb_array_elements(preferences) as item
       where item->>'club_id' = '47000000-0000-4000-8000-000000000001'
         and item->>'club_code' = 'BDAY-DEFAULT-A'
         and (item->>'is_listed')::boolean
         and (item->>'allow_wishes')::boolean
     )
     or not exists (
       select 1 from jsonb_array_elements(preferences) as item
       where item->>'club_id' = '47000000-0000-4000-8000-000000000002'
         and item->>'club_code' = 'BDAY-DEFAULT-B'
         and (item->>'has_preference')::boolean = false
         and (item->>'is_listed')::boolean = false
         and (item->>'allow_wishes')::boolean = false
     ) then
    raise exception 'member birthday preferences were not club-scoped: %', preferences;
  end if;
  if exists (
    select 1 from jsonb_array_elements(preferences) as item
    where item->>'club_id' = '47000000-0000-4000-8000-000000000003'
  ) then
    raise exception 'birthday preferences leaked from another person';
  end if;

  -- The missing-row member can read only their own club-scoped projection,
  -- and remains private until an explicit preference save.
  perform set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000003', true);
  preferences := public.get_my_birthday_preferences();
  if jsonb_array_length(preferences) <> 1
     or (preferences->0->>'has_birth_date')::boolean = false
     or (preferences->0->>'has_preference')::boolean
     or (preferences->0->>'is_listed')::boolean
     or (preferences->0->>'allow_wishes')::boolean then
    raise exception 'legacy missing birthday preference became public: %', preferences;
  end if;
  perform set_config('request.jwt.claim.sub', '17000000-0000-4000-8000-000000000001', true);

  perform public.set_my_birthday_preference(
    '47000000-0000-4000-8000-000000000001', false, false
  );
  perform public.set_my_birthday_preference(
    '47000000-0000-4000-8000-000000000002', true, true
  );
  preferences := public.get_my_birthday_preferences();
  if not exists (
       select 1 from jsonb_array_elements(preferences) as item
       where item->>'club_id' = '47000000-0000-4000-8000-000000000001'
         and (item->>'is_listed')::boolean = false
         and (item->>'allow_wishes')::boolean = false
     )
     or not exists (
       select 1 from jsonb_array_elements(preferences) as item
       where item->>'club_id' = '47000000-0000-4000-8000-000000000002'
         and (item->>'is_listed')::boolean
         and (item->>'allow_wishes')::boolean
     ) then
    raise exception 'changing one club changed another club birthday setting: %', preferences;
  end if;
end $$;
reset role;

rollback;
