-- V0.3 identity, RBAC, invitation, LINE Login/OA and unbind runtime verification.
-- Run only against Supabase local. All fixtures are rolled back.

begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'v03-admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'v03-secretary@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'v03-finance@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'line-member@identity.local', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('21000000-0000-0000-0000-000000000001', 'V03 平台管理員', 'v03-admin@example.test'),
  ('21000000-0000-0000-0000-000000000002', 'V03 秘書', 'v03-secretary@example.test'),
  ('21000000-0000-0000-0000-000000000003', 'V03 財務', 'v03-finance@example.test');
insert into public.app_accounts (id, auth_user_id, person_id, login_email, account_display_name) values
  ('31000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 'v03-admin@example.test', 'V03 平台管理員'),
  ('31000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000002', 'v03-secretary@example.test', 'V03 秘書'),
  ('31000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000003', '21000000-0000-0000-0000-000000000003', 'v03-finance@example.test', 'V03 財務');
insert into public.platform_roles (app_account_id, role_key) values ('31000000-0000-0000-0000-000000000001', 'superadmin');
insert into public.clubs (id, club_code, club_name, club_status, created_by_app_account_id, activated_at) values
  ('41000000-0000-0000-0000-000000000001', 'V03-A', 'V03 測試扶輪社 A', 'active', '31000000-0000-0000-0000-000000000001', now()),
  ('41000000-0000-0000-0000-000000000002', 'V03-B', 'V03 測試扶輪社 B', 'active', '31000000-0000-0000-0000-000000000001', now());
insert into public.club_role_assignments (club_id, app_account_id, role_key, granted_by_app_account_id) values
  ('41000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000002', 'secretary', '31000000-0000-0000-0000-000000000001'),
  ('41000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000003', 'finance', '31000000-0000-0000-0000-000000000001');

create temporary table v03_values (key text primary key, value text not null);
grant select on v03_values to anon, authenticated;
grant insert on v03_values to authenticated;

-- Client roles have no direct table access.
set local role anon;
do $$ begin
  begin perform 1 from public.member_invitations; raise exception 'anon read member invitations';
  exception when insufficient_privilege then null; end;
  begin perform public.create_member_invitation('41000000-0000-0000-0000-000000000001', 'Nope', '0900', null, null, 'link', 'anon');
    raise exception 'anon created invitation'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Finance can read members but cannot manage invitations.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000003', true);
do $$ begin
  if not exists (select 1 from public.list_my_permissions('41000000-0000-0000-0000-000000000001') where permission_key = 'member.read') then raise exception 'finance missing member.read'; end if;
  if exists (select 1 from public.list_my_permissions('41000000-0000-0000-0000-000000000001') where permission_key = 'member.manage') then raise exception 'finance gained member.manage'; end if;
  begin perform public.create_member_invitation('41000000-0000-0000-0000-000000000001', 'Nope', '0900', null, null, 'link', 'finance');
    raise exception 'finance created invitation'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Secretary creates the pre-filled member and invitation. The raw token is returned once but never stored.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);
do $$
declare result jsonb;
begin
  result := public.create_member_invitation('41000000-0000-0000-0000-000000000001', '預建社員', '0912-345-678', 'prefilled@example.test', '1985-03-15', 'line', 'v03-member-one');
  if result->>'token' is null or length(result->>'token') <> 64 then raise exception 'raw invitation token missing'; end if;
  insert into v03_values values ('member-token', result->>'token'), ('invitation-id', result->>'invitation_id'), ('membership-id', result->>'membership_id');
end $$;
do $$ begin
  begin perform public.create_member_invitation('41000000-0000-0000-0000-000000000002', 'Cross Club', '0911', null, null, 'link', 'cross-club');
    raise exception 'secretary mutated Club B'; exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$
declare raw_token text := (select value from v03_values where key = 'member-token');
begin
  if exists (select 1 from public.member_invitations where token_hash = raw_token) then raise exception 'raw token stored as hash'; end if;
  if not exists (select 1 from public.member_invitations where token_hash = encode(extensions.digest(raw_token, 'sha256'), 'hex')) then raise exception 'token hash missing'; end if;
  if (select membership_status from public.club_memberships where id = (select value::uuid from v03_values where key = 'membership-id')) <> 'invited' then raise exception 'membership not invited'; end if;
end $$;

-- Anonymous preview reveals club/name but redacts contact and birth date.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ declare preview jsonb := public.get_member_invitation_preview((select value from v03_values where key = 'member-token'));
begin
  if preview->>'club_name' <> 'V03 測試扶輪社 A' or preview->>'name' <> '預建社員' then raise exception 'anonymous preview missing safe fields'; end if;
  if preview->>'phone' is not null or preview->>'email' is not null or preview->>'birth_date' is not null then raise exception 'anonymous preview leaked private fields'; end if;
end $$;
reset role;

-- Authenticated LINE callback binds the pre-created person rather than asking for a new identity.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000004', true);
do $$ declare result jsonb;
begin
  result := public.bind_line_identity_from_invitation((select value from v03_values where key = 'member-token'), 'U-V03-MEMBER-0001', 'LINE 預建社員', null, 'line@example.test');
  insert into v03_values values ('member-account-id', result->>'account_id'), ('bound-person-id', result->>'person_id');
end $$;
do $$ declare preview jsonb := public.get_member_invitation_preview((select value from v03_values where key = 'member-token'));
begin
  if preview->>'phone' <> '0912345678' or preview->>'email' <> 'prefilled@example.test' then raise exception 'authenticated preview did not show known fields'; end if;
end $$;
select public.record_login_and_device('line_mock', repeat('a', 64), 'Verification Browser', 'verification-agent', null);
select public.update_my_settings('{"line_enabled":true,"email_enabled":false,"security_alerts":true,"club_announcements":true}', '{"show_email_to_club":false,"show_phone_to_club":true,"show_birthday_year":false,"analytics_consent":false}');
do $$ declare result jsonb;
begin
  result := public.complete_member_invitation((select value from v03_values where key = 'member-token'), '預建社員修正', '0912345678', 'prefilled@example.test', '1985-03-15');
  if (result->>'idempotent')::boolean then raise exception 'first completion marked idempotent'; end if;
  result := public.complete_member_invitation((select value from v03_values where key = 'member-token'), '預建社員修正', '0912345678', 'prefilled@example.test', '1985-03-15');
  if not (result->>'idempotent')::boolean then raise exception 'completion not idempotent'; end if;
end $$;
reset role;

do $$ begin
  if (select value::uuid from v03_values where key = 'bound-person-id') <> (select person_id from public.member_invitations where id = (select value::uuid from v03_values where key = 'invitation-id')) then raise exception 'LINE identity did not match invited person'; end if;
  if (select membership_status from public.club_memberships where id = (select value::uuid from v03_values where key = 'membership-id')) <> 'active' then raise exception 'membership not activated'; end if;
  if not exists (select 1 from public.club_role_assignments where app_account_id = (select value::uuid from v03_values where key = 'member-account-id') and role_key = 'member' and assignment_status = 'active') then raise exception 'member role not assigned'; end if;
  if not exists (select 1 from public.login_history where provider_key = 'line_mock') or not exists (select 1 from public.user_devices) then raise exception 'login/device history missing'; end if;
end $$;

-- Platform administrator can replace a member role; the permission matrix is data-driven.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select public.assign_club_role('41000000-0000-0000-0000-000000000001', (select value::uuid from v03_values where key = 'member-account-id'), 'finance');
do $$ begin
  if not exists (select 1 from public.list_my_permissions('41000000-0000-0000-0000-000000000001') where permission_key = 'role.manage') then raise exception 'platform admin missing role.manage'; end if;
end $$;
select public.assign_club_role('41000000-0000-0000-0000-000000000001', (select value::uuid from v03_values where key = 'member-account-id'), 'member');
reset role;
do $$ begin
  if (select count(*) from public.club_role_assignments where club_id = '41000000-0000-0000-0000-000000000001'
      and app_account_id = (select value::uuid from v03_values where key = 'member-account-id') and assignment_status = 'active') <> 1 then raise exception 'role replacement left multiple active roles'; end if;
  if not exists (select 1 from public.audit_logs where action_key = 'role.assigned') then raise exception 'role assignment audit missing'; end if;
end $$;

-- OA configuration and pairing are independent from LINE Login.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);
select public.configure_line_oa('41000000-0000-0000-0000-000000000001', 'V03 測試 OA', '@v03', 'channel-v03', 'active');
do $$ declare follower_id uuid;
begin
  follower_id := public.pair_line_oa_follower('41000000-0000-0000-0000-000000000001', 'U-OA-FOLLOWER-1',
    (select value::uuid from v03_values where key = 'bound-person-id'));
  perform public.unpair_line_oa_follower('41000000-0000-0000-0000-000000000001', follower_id, 'verification');
end $$;
select public.record_line_push('41000000-0000-0000-0000-000000000001', 'broadcast', 1, '{"message_type":"text"}', 'mocked', 'mock-request', null);

-- LINE unbind preserves person/membership/history, revokes identity and produces a one-time rebind invitation.
do $$ declare result jsonb;
begin
  result := public.unbind_line_identity('41000000-0000-0000-0000-000000000001', (select value::uuid from v03_values where key = 'member-account-id'), 'verification unbind', true);
  if result->>'rebind_token' is null then raise exception 'rebind token missing'; end if;
  insert into v03_values values ('rebind-token', result->>'rebind_token');
end $$;
reset role;

do $$ begin
  if not exists (select 1 from public.line_identities where app_account_id = (select value::uuid from v03_values where key = 'member-account-id') and identity_status = 'unbound') then raise exception 'LINE identity not preserved as unbound'; end if;
  if not exists (select 1 from public.club_memberships where id = (select value::uuid from v03_values where key = 'membership-id') and membership_status = 'active') then raise exception 'membership changed during unbind'; end if;
  if not exists (select 1 from public.member_invitations where token_hash = encode(extensions.digest((select value from v03_values where key = 'rebind-token'), 'sha256'), 'hex') and invitation_kind = 'line_rebind') then raise exception 'rebind invitation not stored by hash'; end if;
  if not exists (select 1 from public.invitation_logs where event_key = 'accepted') then raise exception 'invitation acceptance log missing'; end if;
  if not exists (select 1 from public.audit_logs where action_key = 'line_identity.bound')
    or not exists (select 1 from public.audit_logs where action_key = 'line_identity.unbound')
    or not exists (select 1 from public.audit_logs where action_key = 'line_oa.unpaired')
    or not exists (select 1 from public.audit_logs where action_key = 'line_oa.push_requested') then raise exception 'V0.3 audit events missing'; end if;
end $$;

rollback;
