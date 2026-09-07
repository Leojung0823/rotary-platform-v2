-- 社長 maintaining 社務資料. Verifies that the club role can rename its own
-- club and set the English name, that no one else gains anything by it, and
-- that the optional English name is left alone rather than erased when a caller
-- does not send it. Run only against a freshly reset local Supabase database;
-- all fixtures roll back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '71000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'club-president@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '71000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'club-ordinary-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '71000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'club-other-president@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('72000000-0000-4000-8000-000000000001', '甲社社長', 'club-president@example.test'),
  ('72000000-0000-4000-8000-000000000002', '甲社一般社員', 'club-ordinary-member@example.test'),
  ('72000000-0000-4000-8000-000000000003', '乙社社長', 'club-other-president@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('73000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 'club-president@example.test', '甲社社長', 'active'),
  ('73000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000002', 'club-ordinary-member@example.test', '甲社一般社員', 'active'),
  ('73000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000003', '72000000-0000-4000-8000-000000000003', 'club-other-president@example.test', '乙社社長', 'active');

insert into public.clubs (id, club_code, club_name, english_name, club_status, activated_at) values
  ('74000000-0000-4000-8000-000000000001', 'PRES-A', '社長維護測試甲社', 'Rotary Club of Fixture A', 'active', now()),
  ('74000000-0000-4000-8000-000000000002', 'PRES-B', '社長維護測試乙社', null, 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status, joined_on) values
  ('75000000-0000-4000-8000-000000000001', '74000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 'active', current_date),
  ('75000000-0000-4000-8000-000000000002', '74000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000002', 'active', current_date),
  ('75000000-0000-4000-8000-000000000003', '74000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000003', 'active', current_date);

insert into public.club_role_assignments (club_id, app_account_id, role_key, assignment_status) values
  ('74000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000001', 'president', 'active'),
  ('74000000-0000-4000-8000-000000000002', '73000000-0000-4000-8000-000000000003', 'president', 'active');

-- The grant exists and belongs to the president, not to every club role.
do $$
begin
  if not exists (
    select 1 from public.role_permissions
    where role_key = 'president' and permission_key = 'club.manage'
  ) then
    raise exception 'president was not granted club.manage';
  end if;
  if exists (
    select 1 from public.role_permissions
    where role_key in ('member', 'finance') and permission_key = 'club.manage'
  ) then
    raise exception 'club.manage reached a role that must not maintain the club record';
  end if;
end;
$$;

-- The president may open the page and is told they may edit it.
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
do $$
declare status jsonb;
begin
  status := public.get_club_provisioning_status('74000000-0000-4000-8000-000000000001');
  if (status->>'can_manage_profile')::boolean is not true
    or status->>'english_name' <> 'Rotary Club of Fixture A' then
    raise exception 'president was not offered the club profile: %', status;
  end if;
end;
$$;

-- A rename that does not mention the English name leaves it as it was.
do $$
declare result jsonb;
begin
  result := public.update_club_name(
    '74000000-0000-4000-8000-000000000001',
    '  社長改名後  '
  );
  if result->>'club_name' <> '社長改名後'
    or result->>'english_name' <> 'Rotary Club of Fixture A'
    or (result->>'idempotent')::boolean then
    raise exception 'president rename did not keep the English name: %', result;
  end if;
end;
$$;

-- Sending it sets it; sending an empty string clears it; unchanged input on
-- both fields is idempotent and writes no second audit row.
do $$
declare
  result jsonb;
  audit_count integer;
begin
  result := public.update_club_name(
    '74000000-0000-4000-8000-000000000001',
    '社長改名後',
    '  Rotary Club of President  '
  );
  if result->>'english_name' <> 'Rotary Club of President'
    or (result->>'idempotent')::boolean then
    raise exception 'English name was not stored: %', result;
  end if;

  select count(*) into audit_count
  from public.list_club_audit('74000000-0000-4000-8000-000000000001', 200)
  where action_key = 'club.renamed';

  result := public.update_club_name(
    '74000000-0000-4000-8000-000000000001',
    '社長改名後',
    'Rotary Club of President'
  );
  if not (result->>'idempotent')::boolean then
    raise exception 'an unchanged club profile was not idempotent: %', result;
  end if;
  if (
    select count(*) from public.list_club_audit('74000000-0000-4000-8000-000000000001', 200)
    where action_key = 'club.renamed'
  ) <> audit_count then
    raise exception 'an idempotent save created an audit row';
  end if;

  result := public.update_club_name(
    '74000000-0000-4000-8000-000000000001',
    '社長改名後',
    '   '
  );
  if result->>'english_name' is not null or (result->>'idempotent')::boolean then
    raise exception 'an empty English name did not clear the field: %', result;
  end if;
end;
$$;

-- An invalid English name is refused with the same authority class as the name.
do $$
declare bad text;
begin
  foreach bad in array array['A', repeat('x', 101), E'Rotary\nClub'] loop
    begin
      perform public.update_club_name(
        '74000000-0000-4000-8000-000000000001', '社長改名後', bad
      );
      raise exception 'invalid English name accepted: %', bad;
    exception when invalid_parameter_value then null;
    end;
  end loop;
end;
$$;

-- A president has authority over their own club only.
do $$
begin
  begin
    perform public.update_club_name('74000000-0000-4000-8000-000000000002', '不應跨社修改');
    raise exception 'a president renamed another club';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- Being a member of the club is not authority over its record.
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000002', true);
do $$
begin
  begin
    perform public.update_club_name('74000000-0000-4000-8000-000000000001', '社員不應改名');
    raise exception 'an ordinary member renamed the club';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.get_club_provisioning_status('74000000-0000-4000-8000-000000000001');
    raise exception 'an ordinary member read the club provisioning status';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- A revoked president keeps nothing.
update public.club_role_assignments
set assignment_status = 'revoked', revoked_at = now()
where club_id = '74000000-0000-4000-8000-000000000001'
  and app_account_id = '73000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
do $$
begin
  begin
    perform public.update_club_name('74000000-0000-4000-8000-000000000001', '卸任後不應改名');
    raise exception 'a revoked president renamed the club';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- The audit trail records both fields, before and after.
set local role service_role;
do $$
declare audit_row public.audit_logs;
begin
  select * into audit_row
  from public.audit_logs
  where club_id = '74000000-0000-4000-8000-000000000001'
    and action_key = 'club.renamed'
  order by id desc
  limit 1;

  if audit_row.actor_app_account_id <> '73000000-0000-4000-8000-000000000001'
    or audit_row.metadata->'before'->>'english_name' <> 'Rotary Club of President'
    or audit_row.metadata->'after'->>'english_name' is not null
    or audit_row.metadata->'after'->>'club_name' <> '社長改名後' then
    raise exception 'club profile audit lost a field: %', audit_row.metadata;
  end if;
end;
$$;
reset role;

rollback;
