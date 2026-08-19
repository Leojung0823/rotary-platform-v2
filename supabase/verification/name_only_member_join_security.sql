-- A member the club recorded by name alone must still be able to confirm the
-- invitation, and the preview must still refuse to disclose anything to a
-- viewer who is not the invited person.
-- Run only against Supabase local. All fixtures are rolled back.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'nameonly-secretary@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'nameonly-member@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'nameonly-stranger@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '1a000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'nameonly-member2@example.test', '', now(), '{}', '{}', now(), now());

insert into public.people (id, canonical_name, primary_email) values
  ('2a000000-0000-0000-0000-000000000001', '名字秘書', 'nameonly-secretary@example.test'),
  -- Deliberately no phone, no email, no birth date: the club knows only a name.
  ('2a000000-0000-0000-0000-000000000002', 'Johnny', null),
  ('2a000000-0000-0000-0000-000000000003', '無關路人', 'nameonly-stranger@example.test'),
  ('2a000000-0000-0000-0000-000000000004', 'Ricky', null);

insert into public.app_accounts (id, auth_user_id, person_id, login_email, account_display_name, account_status) values
  ('3a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000001', '2a000000-0000-0000-0000-000000000001', 'nameonly-secretary@example.test', '名字秘書', 'active'),
  ('3a000000-0000-0000-0000-000000000002', '1a000000-0000-0000-0000-000000000002', '2a000000-0000-0000-0000-000000000002', 'line-nameonly@identity.local', 'Johnny', 'active'),
  ('3a000000-0000-0000-0000-000000000003', '1a000000-0000-0000-0000-000000000003', '2a000000-0000-0000-0000-000000000003', 'nameonly-stranger@example.test', '無關路人', 'active'),
  ('3a000000-0000-0000-0000-000000000004', '1a000000-0000-0000-0000-000000000004', '2a000000-0000-0000-0000-000000000004', 'line-nameonly2@identity.local', 'Ricky', 'active');

insert into public.clubs (id, club_code, club_name, club_status, activated_at) values
  ('5a000000-0000-4000-8000-000000000001', 'NAMEONLY-A', '只填姓名測試社', 'active', now());

insert into public.club_memberships (id, club_id, person_id, membership_status) values
  ('6a000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000001', '2a000000-0000-0000-0000-000000000001', 'active'),
  ('6a000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-000000000001', '2a000000-0000-0000-0000-000000000002', 'invited'),
  ('6a000000-0000-4000-8000-000000000003', '5a000000-0000-4000-8000-000000000001', '2a000000-0000-0000-0000-000000000004', 'invited');

insert into public.club_role_assignments (id, club_id, app_account_id, role_key, assignment_status, granted_by_app_account_id) values
  ('7a000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000001', '3a000000-0000-0000-0000-000000000001', 'secretary', 'active', '3a000000-0000-0000-0000-000000000001');

insert into public.member_invitations (
  id, club_id, person_id, membership_id, invitation_kind, delivery_method,
  token_hash, token_prefix, invitation_status, invited_by_app_account_id, idempotency_key, sent_at
) values (
  '8a000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000001',
  '2a000000-0000-0000-0000-000000000002', '6a000000-0000-4000-8000-000000000002',
  'member_join', 'link',
  encode(extensions.digest('name-only-invitation-token', 'sha256'), 'hex'), 'name-onl',
  'sent', '3a000000-0000-0000-0000-000000000001', 'name-only-fixture', now()
), (
  '8a000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-000000000001',
  '2a000000-0000-0000-0000-000000000004', '6a000000-0000-4000-8000-000000000003',
  'member_join', 'link',
  encode(extensions.digest('name-only-negative-token', 'sha256'), 'hex'), 'name-neg',
  'sent', '3a000000-0000-0000-0000-000000000001', 'name-only-negative-fixture', now()
);

-- The invited member sees an explicit match, even with no contact detail at all.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1a000000-0000-0000-0000-000000000002', true);
do $$
declare preview jsonb;
begin
  preview := public.get_member_invitation_preview('name-only-invitation-token');
  if preview is null then
    raise exception 'name-only invitation preview was not returned';
  end if;
  if coalesce((preview->>'viewer_matches')::boolean, false) is not true then
    raise exception 'the invited member was not recognised as matching the invitation';
  end if;
  -- The regression this guards: every contact field is legitimately null here,
  -- so presence of data can never again stand in for identity.
  if preview->>'phone' is not null or preview->>'email' is not null or preview->>'birth_date' is not null then
    raise exception 'name-only fixture unexpectedly carries contact detail';
  end if;
end $$;
reset role;

-- A different signed-in account must not match, and must see no detail.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1a000000-0000-0000-0000-000000000003', true);
do $$
declare preview jsonb;
begin
  preview := public.get_member_invitation_preview('name-only-invitation-token');
  if coalesce((preview->>'viewer_matches')::boolean, false) then
    raise exception 'an unrelated account was reported as matching the invitation';
  end if;
  if preview->>'phone' is not null or preview->>'email' is not null or preview->>'birth_date' is not null then
    raise exception 'invitation preview disclosed contact detail to a non-matching viewer';
  end if;
end $$;
reset role;

-- Confirming with a name and nothing else must succeed and activate membership.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1a000000-0000-0000-0000-000000000002', true);
do $$
declare accepted jsonb;
begin
  accepted := public.complete_member_invitation('name-only-invitation-token', 'Johnny', null, null, null);
  if accepted->>'club_id' <> '5a000000-0000-4000-8000-000000000001' then
    raise exception 'name-only member join did not return the club';
  end if;
end $$;
reset role;

do $$
begin
  if not exists (
    select 1 from public.club_memberships
    where id = '6a000000-0000-4000-8000-000000000002' and membership_status = 'active'
  ) then
    raise exception 'name-only member join did not activate the membership';
  end if;
  -- The join grants the member role; losing it would leave the member with no
  -- club permissions at all.
  if not exists (
    select 1 from public.club_role_assignments
    where club_id = '5a000000-0000-4000-8000-000000000001'
      and app_account_id = '3a000000-0000-0000-0000-000000000002'
      and role_key = 'member'
      and assignment_status = 'active'
  ) then
    raise exception 'name-only member join did not grant the member role';
  end if;
  if not exists (
    select 1 from public.member_invitations
    where id = '8a000000-0000-4000-8000-000000000001' and invitation_status = 'accepted'
  ) then
    raise exception 'name-only member join did not accept the invitation';
  end if;
end $$;

-- Bad input is still rejected; dropping the contact requirement must not have
-- loosened anything else.
set local role authenticated;
select set_config('request.jwt.claim.sub', '1a000000-0000-0000-0000-000000000004', true);
do $$
begin
  begin
    perform public.complete_member_invitation('name-only-negative-token', '', null, null, null);
    raise exception 'an empty name was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.complete_member_invitation('name-only-negative-token', 'Ricky', null, 'not-an-email', null);
    raise exception 'a malformed email was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.complete_member_invitation('name-only-negative-token', 'Ricky', null, null, date '1800-01-01');
    raise exception 'an out-of-range birth date was accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;

rollback;
