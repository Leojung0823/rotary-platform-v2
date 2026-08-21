-- Directory visibility defaults, and analytics that cannot be switched off.
-- Run only against Supabase local. All synthetic fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000', '1d000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'privacy-default@example.test', '', now(), '{}', '{}', now(), now()
);

insert into public.people (id, canonical_name, primary_email) values
  ('2d000000-0000-4000-8000-000000000001', '預設值社員', 'privacy-default@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values (
  '3d000000-0000-4000-8000-000000000001', '1d000000-0000-4000-8000-000000000001',
  '2d000000-0000-4000-8000-000000000001', 'privacy-default@example.test', '預設值社員', 'active'
);

-- A row created without naming the columns takes the new defaults.
insert into public.privacy_settings (app_account_id)
values ('3d000000-0000-4000-8000-000000000001');

do $defaults$
begin
  if not exists (
    select 1 from public.privacy_settings
    where app_account_id = '3d000000-0000-4000-8000-000000000001'
      and show_email_to_club and show_phone_to_club and show_birthday_year
  ) then
    raise exception 'Directory visibility did not default to on.';
  end if;
end $defaults$;

-- Mutations run as the member; the assertions follow after reset role,
-- because an authenticated session deliberately cannot read these tables
-- directly -- the application always goes through an RPC.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1d000000-0000-4000-8000-000000000001', true);
select public.update_my_settings(
  '{}'::jsonb,
  jsonb_build_object('show_email_to_club', false, 'show_phone_to_club', false, 'show_birthday_year', false)
);
reset role;

do $hidden$
begin
  -- A member may still hide their own contact details.
  if exists (
    select 1 from public.privacy_settings
    where app_account_id = '3d000000-0000-4000-8000-000000000001'
      and (show_email_to_club or show_phone_to_club or show_birthday_year)
  ) then
    raise exception 'A member could not hide their own contact details.';
  end if;
end $hidden$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '1d000000-0000-4000-8000-000000000001', true);
select public.update_my_settings('{}'::jsonb, '{}'::jsonb);
reset role;

do $omitted$
begin
  -- Omitting a key means the default, not "off".
  if not exists (
    select 1 from public.privacy_settings
    where app_account_id = '3d000000-0000-4000-8000-000000000001'
      and show_email_to_club and show_phone_to_club and show_birthday_year
  ) then
    raise exception 'An omitted key did not fall back to the new default.';
  end if;
end $omitted$;

-- Analytics cannot be switched off, including by a request that names the
-- field directly rather than going through the interface.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1d000000-0000-4000-8000-000000000001', true);
select public.update_my_settings('{}'::jsonb, jsonb_build_object('analytics_consent', false));
reset role;

do $analytics$
begin
  if not exists (
    select 1 from public.privacy_settings
    where app_account_id = '3d000000-0000-4000-8000-000000000001'
      and analytics_consent
  ) then
    raise exception 'Analytics consent was switched off by a supplied value.';
  end if;
end $analytics$;

rollback;
