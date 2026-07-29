-- Self-profile data quality verification. Fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '15000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'profile-validation@example.test', '', now(),
  '{}', '{}', now(), now()
);

insert into public.people (
  id, canonical_name, primary_email, primary_phone, birth_date
) values (
  '25000000-0000-4000-8000-000000000001',
  '資料驗證社員', 'profile-validation@example.test', '0911000000', '1980-01-01'
);

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name
) values (
  '35000000-0000-4000-8000-000000000001',
  '15000000-0000-4000-8000-000000000001',
  '25000000-0000-4000-8000-000000000001',
  'profile-validation@example.test', '資料驗證社員'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-4000-8000-000000000001', true);
do $$
begin
  begin
    perform public.update_my_profile(
      '未來生日', '0911000000', 'profile-validation@example.test', current_date + 1
    );
    raise exception 'Future birth date was accepted.';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.update_my_profile(
      '過早生日', '0911000000', 'profile-validation@example.test', date '1899-12-31'
    );
    raise exception 'Implausibly early birth date was accepted.';
  exception when invalid_parameter_value then
    null;
  end;
end;
$$;
reset role;

do $$
begin
  if not exists (
    select 1 from public.people
    where id = '25000000-0000-4000-8000-000000000001'
      and canonical_name = '資料驗證社員'
      and birth_date = '1980-01-01'
  ) then
    raise exception 'Rejected profile mutation changed persisted data.';
  end if;

  if exists (
    select 1 from public.audit_logs
    where actor_app_account_id = '35000000-0000-4000-8000-000000000001'
      and action_key = 'member.self_profile_updated'
  ) then
    raise exception 'Rejected profile mutation created an audit success record.';
  end if;
end;
$$;

rollback;
