-- Privacy-aware member directory and self-profile verification.
-- Run only against a freshly reset local Supabase database. All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '14000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'directory-caller@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '14000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'directory-target@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '14000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'directory-other@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (
  id, canonical_name, primary_email, primary_phone, birth_date, occupation
) values
  ('24000000-0000-4000-8000-000000000001', '名冊測試社員', 'directory-caller@example.test', '0911111111', '1985-06-01', '工程師'),
  ('24000000-0000-4000-8000-000000000002', '隱私社員', 'private-target@example.test', '0922222222', '1988-08-08', '會計師'),
  ('24000000-0000-4000-8000-000000000003', '其他社社員', 'directory-other@example.test', '0933333333', '1990-09-09', '醫師');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name
) values
  ('34000000-0000-4000-8000-000000000001', '14000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000001', 'directory-caller@example.test', '名冊測試社員'),
  ('34000000-0000-4000-8000-000000000002', '14000000-0000-4000-8000-000000000002', '24000000-0000-4000-8000-000000000002', 'directory-target@example.test', '隱私社員'),
  ('34000000-0000-4000-8000-000000000003', '14000000-0000-4000-8000-000000000003', '24000000-0000-4000-8000-000000000003', 'directory-other@example.test', '其他社社員');

insert into public.clubs (
  id, club_code, club_name, club_status, created_by_app_account_id, activated_at
) values
  ('44000000-0000-4000-8000-000000000001', 'DIR-A', '名冊測試扶輪社 A', 'active', '34000000-0000-4000-8000-000000000001', now()),
  ('44000000-0000-4000-8000-000000000002', 'DIR-B', '名冊測試扶輪社 B', 'active', '34000000-0000-4000-8000-000000000001', now());

insert into public.club_memberships (
  id, club_id, person_id, membership_status, created_by_app_account_id, joined_on
) values
  ('54000000-0000-4000-8000-000000000001', '44000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000001', 'active', '34000000-0000-4000-8000-000000000001', current_date),
  ('54000000-0000-4000-8000-000000000002', '44000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000002', 'active', '34000000-0000-4000-8000-000000000001', current_date),
  ('54000000-0000-4000-8000-000000000003', '44000000-0000-4000-8000-000000000002', '24000000-0000-4000-8000-000000000003', 'active', '34000000-0000-4000-8000-000000000001', current_date);

insert into public.club_role_assignments (
  club_id, app_account_id, role_key, granted_by_app_account_id
) values (
  '44000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000002',
  'president',
  '34000000-0000-4000-8000-000000000001'
);

insert into public.privacy_settings (
  app_account_id, show_email_to_club, show_phone_to_club, show_birthday_year
) values (
  '34000000-0000-4000-8000-000000000002', false, false, false
);

-- Anonymous callers cannot execute directory or profile mutation RPCs.
set local role anon;
do $$
begin
  begin
    perform public.list_my_directory_clubs();
    raise exception 'Anonymous caller executed list_my_directory_clubs.';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.get_club_member_directory_profile(
      '44000000-0000-4000-8000-000000000001',
      '54000000-0000-4000-8000-000000000002'
    );
    raise exception 'Anonymous caller executed get_club_member_directory_profile.';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.update_my_profile('匿名', '0900000000', null, null);
    raise exception 'Anonymous caller executed update_my_profile.';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

-- Active same-club member sees the roster, but target private fields remain redacted.
set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000001', true);
do $$
declare
  target record;
  own record;
  target_profile jsonb;
  own_profile jsonb;
begin
  if (select count(*) from public.list_my_directory_clubs()) <> 1 then
    raise exception 'Caller did not receive exactly one active directory club.';
  end if;

  select * into target
  from public.list_club_member_directory('44000000-0000-4000-8000-000000000001', null)
  where membership_id = '54000000-0000-4000-8000-000000000002';

  if not found or target.role_key <> 'president' then
    raise exception 'Target member or role projection missing.';
  end if;
  if target.email is not null or target.phone is not null or target.birth_year is not null then
    raise exception 'Private member fields leaked into the directory.';
  end if;
  if target.is_self then
    raise exception 'Target member was incorrectly marked as self.';
  end if;

  target_profile := public.get_club_member_directory_profile(
    '44000000-0000-4000-8000-000000000001',
    '54000000-0000-4000-8000-000000000002'
  );
  if target_profile is null
     or target_profile ->> 'occupation' <> '會計師'
     or target_profile ->> 'role_key' <> 'president'
     or (target_profile ->> 'is_self')::boolean
     or target_profile ->> 'email' is not null
     or target_profile ->> 'phone' is not null
     or target_profile ->> 'birth_year' is not null then
    raise exception 'Same-club profile occupation or privacy projection is incorrect: %', target_profile;
  end if;

  select * into own
  from public.list_club_member_directory('44000000-0000-4000-8000-000000000001', null)
  where membership_id = '54000000-0000-4000-8000-000000000001';

  if own.email <> 'directory-caller@example.test'
     or own.phone <> '0911111111'
     or own.birth_year <> 1985
     or not own.is_self then
    raise exception 'Caller could not see their own full directory projection.';
  end if;

  own_profile := public.get_club_member_directory_profile(
    '44000000-0000-4000-8000-000000000001',
    '54000000-0000-4000-8000-000000000001'
  );
  if own_profile is null
     or own_profile ->> 'occupation' <> '工程師'
     or own_profile ->> 'email' <> 'directory-caller@example.test'
     or own_profile ->> 'phone' <> '0911111111'
     or (own_profile ->> 'birth_year')::integer <> 1985
     or not (own_profile ->> 'is_self')::boolean then
    raise exception 'Caller profile did not retain the complete self projection: %', own_profile;
  end if;

  if exists (
    select 1
    from public.list_club_member_directory(
      '44000000-0000-4000-8000-000000000001',
      'private-target@example.test'
    )
  ) then
    raise exception 'Hidden Email was usable as a directory search oracle.';
  end if;

  if exists (
    select 1
    from public.list_club_member_directory('44000000-0000-4000-8000-000000000002', null)
  ) then
    raise exception 'Caller read another club directory.';
  end if;

  if public.get_club_member_directory_profile(
    '44000000-0000-4000-8000-000000000002',
    '54000000-0000-4000-8000-000000000003'
  ) is not null then
    raise exception 'Caller read another club member profile.';
  end if;
end;
$$;
reset role;

-- Opt-in privacy settings expose only the selected contact fields and birth year.
update public.privacy_settings
set show_email_to_club = true,
    show_phone_to_club = true,
    show_birthday_year = true
where app_account_id = '34000000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000001', true);
do $$
declare
  target record;
  target_profile jsonb;
begin
  select * into target
  from public.list_club_member_directory('44000000-0000-4000-8000-000000000001', '隱私社員')
  where membership_id = '54000000-0000-4000-8000-000000000002';

  if target.email <> 'private-target@example.test'
     or target.phone <> '0922222222'
     or target.birth_year <> 1988 then
    raise exception 'Opted-in directory fields were not projected.';
  end if;

  target_profile := public.get_club_member_directory_profile(
    '44000000-0000-4000-8000-000000000001',
    '54000000-0000-4000-8000-000000000002'
  );
  if target_profile ->> 'occupation' <> '會計師'
     or target_profile ->> 'email' <> 'private-target@example.test'
     or target_profile ->> 'phone' <> '0922222222'
     or (target_profile ->> 'birth_year')::integer <> 1988 then
    raise exception 'Profile did not follow opted-in privacy settings: %', target_profile;
  end if;
end;
$$;
reset role;

-- Self profile mutation updates only the caller person/account and writes an audit record.
set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000001', true);
select public.update_my_profile('更新後社員', '0912-000-999', 'UPDATED@example.test', '1986-07-02');
reset role;

do $$
begin
  if not exists (
    select 1 from public.people
    where id = '24000000-0000-4000-8000-000000000001'
      and canonical_name = '更新後社員'
      and primary_phone = '0912000999'
      and primary_email = 'updated@example.test'
      and birth_date = '1986-07-02'
  ) then
    raise exception 'Self profile update did not persist normalized values.';
  end if;

  if not exists (
    select 1 from public.app_accounts
    where id = '34000000-0000-4000-8000-000000000001'
      and account_display_name = '更新後社員'
  ) then
    raise exception 'Self profile update did not synchronize display name.';
  end if;

  if not exists (
    select 1 from public.people
    where id = '24000000-0000-4000-8000-000000000002'
      and canonical_name = '隱私社員'
      and primary_email = 'private-target@example.test'
  ) then
    raise exception 'Self profile mutation changed another person.';
  end if;

  if not exists (
    select 1 from public.audit_logs
    where actor_app_account_id = '34000000-0000-4000-8000-000000000001'
      and action_key = 'member.self_profile_updated'
      and subject_id = '24000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Self profile update audit record missing.';
  end if;
end;
$$;

-- Suspended membership immediately removes directory access.
update public.club_memberships
set membership_status = 'suspended'
where id = '54000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-4000-8000-000000000001', true);
do $$
begin
  if exists (select 1 from public.list_my_directory_clubs()) then
    raise exception 'Suspended membership retained directory club visibility.';
  end if;
  if exists (
    select 1 from public.list_club_member_directory('44000000-0000-4000-8000-000000000001', null)
  ) then
    raise exception 'Suspended membership retained directory access.';
  end if;
  if public.get_club_member_directory_profile(
    '44000000-0000-4000-8000-000000000001',
    '54000000-0000-4000-8000-000000000002'
  ) is not null then
    raise exception 'Suspended membership retained directory profile access.';
  end if;
end;
$$;
reset role;

rollback;
