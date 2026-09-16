-- 社務頁的幹部名單只列出還在社裡的人。
-- Run only against Supabase local. All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '1e000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'affairs-president@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1e000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'affairs-left@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1e000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'affairs-serving@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('2e000000-0000-0000-0000-000000000001', '在任社長', 'affairs-president@example.test'),
  ('2e000000-0000-0000-0000-000000000002', '已停用秘書', 'affairs-left@example.test'),
  ('2e000000-0000-0000-0000-000000000003', '在任秘書', 'affairs-serving@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('3e000000-0000-0000-0000-000000000001', '1e000000-0000-0000-0000-000000000001', '2e000000-0000-0000-0000-000000000001', 'affairs-president@example.test', '在任社長', 'active'),
  ('3e000000-0000-0000-0000-000000000002', '1e000000-0000-0000-0000-000000000002', '2e000000-0000-0000-0000-000000000002', 'affairs-left@example.test', '已停用秘書', 'active'),
  ('3e000000-0000-0000-0000-000000000003', '1e000000-0000-0000-0000-000000000003', '2e000000-0000-0000-0000-000000000003', 'affairs-serving@example.test', '在任秘書', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('5e000000-0000-4000-8000-000000000001', 'AFFAIRS', '社務測試社', 'active', now());

-- The disabled secretary keeps their role assignment, which is exactly the
-- situation that put them on the card: nothing revokes it automatically.
insert into public.club_memberships (id, club_id, person_id, membership_status, joined_on) values
  ('6e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000001', '2e000000-0000-0000-0000-000000000001', 'active', current_date - 300),
  ('6e000000-0000-4000-8000-000000000002', '5e000000-0000-4000-8000-000000000001', '2e000000-0000-0000-0000-000000000002', 'disabled', current_date - 300),
  ('6e000000-0000-4000-8000-000000000003', '5e000000-0000-4000-8000-000000000001', '2e000000-0000-0000-0000-000000000003', 'active', current_date - 300);

insert into public.club_role_assignments (
  id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id
) values
  ('7e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000001', '3e000000-0000-0000-0000-000000000001', 'president', 'active', '3e000000-0000-0000-0000-000000000001'),
  ('7e000000-0000-4000-8000-000000000002', '5e000000-0000-4000-8000-000000000001', '3e000000-0000-0000-0000-000000000002', 'secretary', 'active', '3e000000-0000-0000-0000-000000000001'),
  ('7e000000-0000-4000-8000-000000000003', '5e000000-0000-4000-8000-000000000001', '3e000000-0000-0000-0000-000000000003', 'secretary', 'active', '3e000000-0000-0000-0000-000000000001');

create table public.affairs_test_state (key text primary key, value jsonb not null);
grant select, insert on public.affairs_test_state to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '1e000000-0000-0000-0000-000000000001', true);
insert into public.affairs_test_state (key, value)
values ('page', public.get_club_affairs_page('5e000000-0000-4000-8000-000000000001', null, true));
reset role;

do $$
declare
  page jsonb;
  officers jsonb;
begin
  select value into page from public.affairs_test_state where key = 'page';
  officers := page -> 'officers';

  -- The disabled membership must not be introduced as this club's secretary.
  if (officers)::text like '%已停用秘書%' then
    raise exception 'a disabled membership is still listed as an officer: %', officers;
  end if;

  -- The serving officers are still there; the fix must not empty the card.
  if (officers)::text not like '%在任社長%' or (officers)::text not like '%在任秘書%' then
    raise exception 'a serving officer went missing: %', officers;
  end if;
  if jsonb_array_length(officers) <> 2 then
    raise exception 'expected exactly the two serving officers: %', officers;
  end if;

  -- The member count and the officer list must agree about who is in the club.
  if (page -> 'club' ->> 'member_count')::int <> 2 then
    raise exception 'member_count disagrees with the officer list: %', page -> 'club';
  end if;
end;
$$;

rollback;
