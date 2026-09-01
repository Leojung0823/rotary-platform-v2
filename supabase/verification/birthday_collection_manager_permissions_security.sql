-- Birthday collection manager permission verification.
-- Presidents and secretaries live in club_role_assignments, which
-- current_can_manage_club() never reads, so they were locked out of every
-- birthday management RPC and the scheduler skipped their club entirely.
-- Run against local Supabase only. Every fixture is rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '8a000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'bdperm-president@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '8a000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'bdperm-secretary@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '8a000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'bdperm-finance@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '8a000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'bdperm-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '8a000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'bdperm-revoked@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '8a000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'bdperm-otherclub@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '8a000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'bdperm-birthday@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email, birth_date) values
  ('8b000000-0000-4000-8000-000000000001', '社長', 'bdperm-president@example.test', '1970-01-11'),
  ('8b000000-0000-4000-8000-000000000002', '秘書', 'bdperm-secretary@example.test', '1971-02-12'),
  ('8b000000-0000-4000-8000-000000000003', '財務', 'bdperm-finance@example.test', '1972-03-13'),
  ('8b000000-0000-4000-8000-000000000004', '一般社員', 'bdperm-member@example.test', '1973-04-14'),
  ('8b000000-0000-4000-8000-000000000005', '已撤銷社長', 'bdperm-revoked@example.test', '1974-05-15'),
  ('8b000000-0000-4000-8000-000000000006', '他社社長', 'bdperm-otherclub@example.test', '1975-06-16'),
  ('8b000000-0000-4000-8000-000000000007', '本月壽星', 'bdperm-birthday@example.test', '1980-09-20');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('8c000000-0000-4000-8000-000000000001', '8a000000-0000-4000-8000-000000000001', '8b000000-0000-4000-8000-000000000001', 'bdperm-president@example.test', '社長', 'active'),
  ('8c000000-0000-4000-8000-000000000002', '8a000000-0000-4000-8000-000000000002', '8b000000-0000-4000-8000-000000000002', 'bdperm-secretary@example.test', '秘書', 'active'),
  ('8c000000-0000-4000-8000-000000000003', '8a000000-0000-4000-8000-000000000003', '8b000000-0000-4000-8000-000000000003', 'bdperm-finance@example.test', '財務', 'active'),
  ('8c000000-0000-4000-8000-000000000004', '8a000000-0000-4000-8000-000000000004', '8b000000-0000-4000-8000-000000000004', 'bdperm-member@example.test', '一般社員', 'active'),
  ('8c000000-0000-4000-8000-000000000005', '8a000000-0000-4000-8000-000000000005', '8b000000-0000-4000-8000-000000000005', 'bdperm-revoked@example.test', '已撤銷社長', 'active'),
  ('8c000000-0000-4000-8000-000000000006', '8a000000-0000-4000-8000-000000000006', '8b000000-0000-4000-8000-000000000006', 'bdperm-otherclub@example.test', '他社社長', 'active'),
  ('8c000000-0000-4000-8000-000000000007', '8a000000-0000-4000-8000-000000000007', '8b000000-0000-4000-8000-000000000007', 'bdperm-birthday@example.test', '本月壽星', 'active');

insert into public.clubs (id, club_code, club_name, timezone_name, club_status, activated_at) values
  ('8d000000-0000-4000-8000-000000000001', 'BDPERM-A', '生日權限測試社', 'Asia/Taipei', 'active', now()),
  ('8d000000-0000-4000-8000-000000000002', 'BDPERM-B', '生日權限他社', 'Asia/Taipei', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status) values
  ('8e000000-0000-4000-8000-000000000001', '8d000000-0000-4000-8000-000000000001', '8b000000-0000-4000-8000-000000000001', 'active'),
  ('8e000000-0000-4000-8000-000000000002', '8d000000-0000-4000-8000-000000000001', '8b000000-0000-4000-8000-000000000002', 'active'),
  ('8e000000-0000-4000-8000-000000000003', '8d000000-0000-4000-8000-000000000001', '8b000000-0000-4000-8000-000000000003', 'active'),
  ('8e000000-0000-4000-8000-000000000004', '8d000000-0000-4000-8000-000000000001', '8b000000-0000-4000-8000-000000000004', 'active'),
  ('8e000000-0000-4000-8000-000000000005', '8d000000-0000-4000-8000-000000000001', '8b000000-0000-4000-8000-000000000005', 'active'),
  ('8e000000-0000-4000-8000-000000000006', '8d000000-0000-4000-8000-000000000002', '8b000000-0000-4000-8000-000000000006', 'active'),
  ('8e000000-0000-4000-8000-000000000007', '8d000000-0000-4000-8000-000000000001', '8b000000-0000-4000-8000-000000000007', 'active');

insert into public.club_role_assignments (id, club_id, app_account_id, role_key, assignment_status, revoked_at) values
  ('8f000000-0000-4000-8000-000000000001', '8d000000-0000-4000-8000-000000000001', '8c000000-0000-4000-8000-000000000001', 'president', 'active', null),
  ('8f000000-0000-4000-8000-000000000002', '8d000000-0000-4000-8000-000000000001', '8c000000-0000-4000-8000-000000000002', 'secretary', 'active', null),
  ('8f000000-0000-4000-8000-000000000003', '8d000000-0000-4000-8000-000000000001', '8c000000-0000-4000-8000-000000000003', 'finance', 'active', null),
  ('8f000000-0000-4000-8000-000000000004', '8d000000-0000-4000-8000-000000000001', '8c000000-0000-4000-8000-000000000004', 'member', 'active', null),
  ('8f000000-0000-4000-8000-000000000005', '8d000000-0000-4000-8000-000000000001', '8c000000-0000-4000-8000-000000000005', 'president', 'revoked', now()),
  ('8f000000-0000-4000-8000-000000000006', '8d000000-0000-4000-8000-000000000002', '8c000000-0000-4000-8000-000000000006', 'president', 'active', null);

-- Who may manage birthday collection. The president and secretary are the
-- regression: before this change only club_operator_permissions answered.
do $$
declare
  club_a uuid := '8d000000-0000-4000-8000-000000000001';
begin
  perform set_config('request.jwt.claim.sub', '8a000000-0000-4000-8000-000000000001', true);
  if not public.current_can_manage_birthday_collection(club_a) then
    raise exception 'president cannot manage birthday collection';
  end if;

  perform set_config('request.jwt.claim.sub', '8a000000-0000-4000-8000-000000000002', true);
  if not public.current_can_manage_birthday_collection(club_a) then
    raise exception 'secretary cannot manage birthday collection';
  end if;

  -- Finance holds finance.read and member.read but never member.manage.
  perform set_config('request.jwt.claim.sub', '8a000000-0000-4000-8000-000000000003', true);
  if public.current_can_manage_birthday_collection(club_a) then
    raise exception 'finance was allowed to manage birthday collection';
  end if;

  perform set_config('request.jwt.claim.sub', '8a000000-0000-4000-8000-000000000004', true);
  if public.current_can_manage_birthday_collection(club_a) then
    raise exception 'ordinary member was allowed to manage birthday collection';
  end if;

  perform set_config('request.jwt.claim.sub', '8a000000-0000-4000-8000-000000000005', true);
  if public.current_can_manage_birthday_collection(club_a) then
    raise exception 'revoked president retained birthday management';
  end if;

  -- Tenancy: an officer of another club answers false for this one.
  perform set_config('request.jwt.claim.sub', '8a000000-0000-4000-8000-000000000006', true);
  if public.current_can_manage_birthday_collection(club_a) then
    raise exception 'president of another club could manage this club';
  end if;
  if not public.current_can_manage_birthday_collection('8d000000-0000-4000-8000-000000000002') then
    raise exception 'president of another club lost their own club';
  end if;

  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- The helper stays internal to SECURITY DEFINER callers.
do $$
begin
  if has_function_privilege('authenticated', 'public.current_can_manage_birthday_collection(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.current_can_manage_birthday_collection(uuid)', 'EXECUTE') then
    raise exception 'birthday manager helper is reachable from a browser role';
  end if;
end $$;

-- The scheduler must now find a president when the club has no executive
-- secretary at all. This is the exact shape that reported skipped_count 1.
insert into public.birthday_visibility_preferences (membership_id, club_id, is_listed, allow_wishes)
values ('8e000000-0000-4000-8000-000000000007', '8d000000-0000-4000-8000-000000000001', true, true);

do $$
declare
  outcome jsonb;
begin
  set local role service_role;
  outcome := public.run_birthday_wish_collection_scheduler(timestamptz '2026-09-01 00:00:00+00');
  reset role;

  if (outcome ->> 'generated_count')::integer < 1 then
    raise exception 'scheduler generated nothing for a club led by a president: %', outcome;
  end if;
  if (outcome -> 'skipped_reasons' ->> 'no_active_birthday_manager') is null then
    raise exception 'scheduler did not report why a club was skipped: %', outcome;
  end if;
end $$;

-- A birthday earlier in the same month must still be dispatched, which the
-- previous seven-day window could not do.
do $$
declare
  covered integer;
begin
  select count(*) into covered
  from public.birthday_wish_assignment_batches as batch
  where batch.club_id = '8d000000-0000-4000-8000-000000000001'
    and batch.birthday_month = 9;
  if covered < 1 then
    raise exception 'no September batch was created for a September birthday';
  end if;
end $$;

rollback;
