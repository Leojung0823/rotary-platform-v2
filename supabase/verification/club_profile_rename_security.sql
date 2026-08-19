-- Verifies the protected club-name mutation boundary, validation, idempotency,
-- tenant isolation, and before/after audit metadata.
-- Run only against a freshly reset local Supabase database. All fixtures roll back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '15000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'club-profile-platform@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '15000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'club-profile-manager@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '15000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'club-profile-outsider@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('25000000-0000-0000-0000-000000000001', '社務平台管理員', 'club-profile-platform@example.test'),
  ('25000000-0000-0000-0000-000000000002', '社務管理員', 'club-profile-manager@example.test'),
  ('25000000-0000-0000-0000-000000000003', '社務外部帳號', 'club-profile-outsider@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name
) values
  ('35000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000001', 'club-profile-platform@example.test', '社務平台管理員'),
  ('35000000-0000-0000-0000-000000000002', '15000000-0000-0000-0000-000000000002', '25000000-0000-0000-0000-000000000002', 'club-profile-manager@example.test', '社務管理員'),
  ('35000000-0000-0000-0000-000000000003', '15000000-0000-0000-0000-000000000003', '25000000-0000-0000-0000-000000000003', 'club-profile-outsider@example.test', '社務外部帳號');

insert into public.platform_roles (app_account_id, role_key)
values ('35000000-0000-0000-0000-000000000001', 'superadmin');

insert into public.clubs (
  id, club_code, club_name, club_status, created_by_app_account_id, activated_at
) values
  ('45000000-0000-0000-0000-000000000001', 'PROFILE-A', '社務資料測試社 A', 'active', '35000000-0000-0000-0000-000000000001', now()),
  ('45000000-0000-0000-0000-000000000002', 'PROFILE-B', '社務資料測試社 B', 'active', '35000000-0000-0000-0000-000000000001', now());

insert into public.club_operator_permissions (
  club_id, app_account_id, permission_level, assignment_status,
  starts_at, granted_by_app_account_id
) values (
  '45000000-0000-0000-0000-000000000001',
  '35000000-0000-0000-0000-000000000002',
  'club_manager',
  'active',
  now() - interval '1 minute',
  '35000000-0000-0000-0000-000000000001'
);

-- A club manager may rename only the club covered by the canonical predicate.
set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000002', true);
do $$
declare
  result jsonb;
begin
  result := public.update_club_name(
    '45000000-0000-0000-0000-000000000001',
    '  社務資料改名後  '
  );

  if result->>'club_name' <> '社務資料改名後'
     or (result->>'idempotent')::boolean then
    raise exception 'Club manager rename did not return the normalized non-idempotent result.';
  end if;

end;
$$;
reset role;

-- Audit rows remain hidden from browser roles; inspect them only as the
-- database verification owner after the protected mutation has completed.
set local role service_role;
do $$
declare
  audit_row public.audit_logs;
begin
  select * into audit_row
  from public.audit_logs
  where club_id = '45000000-0000-0000-0000-000000000001'
    and action_key = 'club.renamed'
  order by id desc
  limit 1;

  if audit_row.actor_app_account_id <> '35000000-0000-0000-0000-000000000002'
     or audit_row.subject_id <> '45000000-0000-0000-0000-000000000001'
     or audit_row.metadata->'before'->>'club_name' <> '社務資料測試社 A'
     or audit_row.metadata->'after'->>'club_name' <> '社務資料改名後' then
    raise exception 'Rename audit did not retain bounded before/after metadata.';
  end if;
end;
$$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000002', true);
do $$
declare
  result jsonb;
  audit_count integer;
begin
  select count(*) into audit_count
  from public.list_club_audit('45000000-0000-0000-0000-000000000001', 200)
  where action_key = 'club.renamed';

  result := public.update_club_name('45000000-0000-0000-0000-000000000001', '社務資料改名後');
  if not (result->>'idempotent')::boolean then
    raise exception 'An unchanged club name was not idempotent.';
  end if;
  if (select count(*) from public.list_club_audit('45000000-0000-0000-0000-000000000001', 200) where action_key = 'club.renamed') <> audit_count then
    raise exception 'An idempotent rename created an unexpected audit row.';
  end if;
end;
$$;

do $$
begin
  begin
    perform public.update_club_name('45000000-0000-0000-0000-000000000002', '不應跨社修改');
    raise exception 'A club manager renamed a club outside its management scope.';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

-- An unrelated authenticated account cannot rename Club A.
set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000003', true);
do $$
begin
  begin
    perform public.update_club_name('45000000-0000-0000-0000-000000000001', '外部不應修改');
    raise exception 'An unrelated account renamed a club.';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

-- Platform authority remains able to rename any club.
set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000001', true);
select public.update_club_name('45000000-0000-0000-0000-000000000002', '平台改名後');
reset role;

-- Invalid names are rejected at the database authority boundary.
set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000001', true);
do $$
declare
  name text;
begin
  foreach name in array array['', 'A', repeat('x', 101), E'合法\n名稱'] loop
    begin
      perform public.update_club_name('45000000-0000-0000-0000-000000000001', name);
      raise exception 'Invalid club name was accepted: %', name;
    exception when invalid_parameter_value then
      null;
    end;
  end loop;
end;
$$;
reset role;

-- A browser role cannot update the tenant table directly.
set local role authenticated;
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000002', true);
do $$
begin
  begin
    update public.clubs set club_name = '繞過 RPC 的改名' where id = '45000000-0000-0000-0000-000000000001';
    raise exception 'Authenticated role updated clubs directly.';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

do $$
begin
  if (select club_name from public.clubs where id = '45000000-0000-0000-0000-000000000001') <> '社務資料改名後' then
    raise exception 'Club A name changed outside the protected rename path.';
  end if;
  if (select club_name from public.clubs where id = '45000000-0000-0000-0000-000000000002') <> '平台改名後' then
    raise exception 'Platform-authorized club rename did not persist.';
  end if;
  if (select club_code from public.clubs where id = '45000000-0000-0000-0000-000000000001') <> 'PROFILE-A' then
    raise exception 'Club code changed during a display-name rename.';
  end if;
  if not exists (
    select 1 from public.club_operator_permissions
    where club_id = '45000000-0000-0000-0000-000000000001'
      and app_account_id = '35000000-0000-0000-0000-000000000002'
      and assignment_status = 'active'
  ) then
    raise exception 'The club manager assignment changed during a display-name rename.';
  end if;
end;
$$;

rollback;
