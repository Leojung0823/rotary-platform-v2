-- Moving a duplicate invitation onto the person a LINE identity belongs to.
-- Run against local Supabase only. Every fixture is rolled back.

begin;

insert into public.clubs (id, club_code, club_name, club_status) values
  ('6a000000-0000-4000-8000-000000000001', 'XFER-HOME', '原本的社', 'active'),
  ('6a000000-0000-4000-8000-000000000002', 'XFER-NEW', '新加入的社', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '6b000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'xfer-known@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '6b000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'xfer-other@example.test', '', now(), '{}', '{}', now(), now());

-- The known person: an account, a LINE identity, a membership in their own club.
insert into public.people (id, canonical_name, primary_email)
values ('6c000000-0000-4000-8000-000000000001', '既有社友', 'xfer-known@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('6d000000-0000-4000-8000-000000000001', '6b000000-0000-4000-8000-000000000001', '6c000000-0000-4000-8000-000000000001', 'xfer-known@example.test', '既有社友', 'active');

insert into public.line_identities (person_id, app_account_id, provider_subject, identity_status)
values ('6c000000-0000-4000-8000-000000000001', '6d000000-0000-4000-8000-000000000001', 'Uxfer0001', 'active');

insert into public.club_memberships (club_id, person_id, membership_status)
values ('6a000000-0000-4000-8000-000000000001', '6c000000-0000-4000-8000-000000000001', 'active');

-- The duplicate the new club created, with the details its officer typed. Data
-- being present is the normal case: an officer fills in what they know.
insert into public.people (id, canonical_name, primary_phone, birth_date)
values ('6c000000-0000-4000-8000-000000000002', '既有社友', '0912345678', '1980-01-01');

insert into public.club_memberships (id, club_id, person_id, membership_status)
values ('6e000000-0000-4000-8000-000000000001', '6a000000-0000-4000-8000-000000000002', '6c000000-0000-4000-8000-000000000002', 'invited');

insert into public.member_invitations (
  id, club_id, person_id, membership_id, delivery_method, token_hash, token_prefix,
  invitation_status, expires_at, invited_by_app_account_id, idempotency_key
) values (
  '6f000000-0000-4000-8000-000000000001', '6a000000-0000-4000-8000-000000000002',
  '6c000000-0000-4000-8000-000000000002', '6e000000-0000-4000-8000-000000000001',
  'link', repeat('a', 64), 'aaaaaaaa', 'sent', now() + interval '7 days',
  '6d000000-0000-4000-8000-000000000001', 'xfer-fixture-a'
);

do $$
begin
  if has_function_privilege('authenticated', 'public.transfer_member_invitation_to_identity(text, uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.transfer_member_invitation_to_identity(text, uuid)', 'EXECUTE') then
    raise exception 'the invitation transfer must be service-role only';
  end if;
end;
$$;

-- The duplicate carries a name, a phone and a birth date, and that must not
-- stop the transfer: requiring an empty record would make this never fire.
do $$
declare result jsonb;
begin
  result := public.transfer_member_invitation_to_identity(
    repeat('a', 64), '6d000000-0000-4000-8000-000000000001'
  );
  if result ->> 'status' <> 'transferred' then
    raise exception 'a populated duplicate blocked the transfer: %', result ->> 'status';
  end if;

  if not exists (
    select 1 from public.club_memberships
    where id = '6e000000-0000-4000-8000-000000000001'
      and person_id = '6c000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'the membership was not moved to the known person';
  end if;

  if not exists (
    select 1 from public.member_invitations
    where id = '6f000000-0000-4000-8000-000000000001'
      and person_id = '6c000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'the invitation still points at the duplicate';
  end if;

  -- The other club must not have rewritten the person's global details.
  if exists (
    select 1 from public.people
    where id = '6c000000-0000-4000-8000-000000000001'
      and (primary_phone is not null or birth_date is not null)
  ) then
    raise exception 'the duplicate details were copied onto the known person';
  end if;

  if not exists (
    select 1 from public.audit_logs
    where action_key = 'member_invitation.transferred_to_known_identity'
      and club_id = '6a000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'the transfer was not audited';
  end if;
end;
$$;

-- A second run must not move anything again.
do $$
declare result jsonb;
begin
  result := public.transfer_member_invitation_to_identity(
    repeat('a', 64), '6d000000-0000-4000-8000-000000000001'
  );
  if result ->> 'status' <> 'already_owned' then
    raise exception 'repeating the transfer returned %', result ->> 'status';
  end if;
end;
$$;

-- A record that can log in is a different human, not a duplicate.
insert into public.people (id, canonical_name, primary_email)
values ('6c000000-0000-4000-8000-000000000003', '另一個真人', 'xfer-other@example.test');

insert into public.app_accounts (
  id, auth_user_id, person_id, login_email, account_display_name, account_status
) values
  ('6d000000-0000-4000-8000-000000000003', '6b000000-0000-4000-8000-000000000002', '6c000000-0000-4000-8000-000000000003', 'xfer-other@example.test', '另一個真人', 'active');

insert into public.club_memberships (id, club_id, person_id, membership_status)
values ('6e000000-0000-4000-8000-000000000002', '6a000000-0000-4000-8000-000000000002', '6c000000-0000-4000-8000-000000000003', 'invited');

insert into public.member_invitations (
  id, club_id, person_id, membership_id, delivery_method, token_hash, token_prefix,
  invitation_status, expires_at, invited_by_app_account_id, idempotency_key
) values (
  '6f000000-0000-4000-8000-000000000002', '6a000000-0000-4000-8000-000000000002',
  '6c000000-0000-4000-8000-000000000003', '6e000000-0000-4000-8000-000000000002',
  'link', repeat('b', 64), 'bbbbbbbb', 'sent', now() + interval '7 days',
  '6d000000-0000-4000-8000-000000000001', 'xfer-fixture-b'
);

do $$
declare result jsonb;
begin
  result := public.transfer_member_invitation_to_identity(
    repeat('b', 64), '6d000000-0000-4000-8000-000000000001'
  );
  if result ->> 'status' <> 'source_has_account' then
    raise exception 'a record with its own account was transferable: %', result ->> 'status';
  end if;
  if exists (
    select 1 from public.club_memberships
    where id = '6e000000-0000-4000-8000-000000000002'
      and person_id <> '6c000000-0000-4000-8000-000000000003'
  ) then
    raise exception 'another person''s membership was moved';
  end if;
end;
$$;

-- An expired or cancelled invitation is not a way in.
update public.member_invitations
set invitation_status = 'cancelled', cancelled_at = now()
where id = '6f000000-0000-4000-8000-000000000002';

do $$
declare result jsonb;
begin
  if (public.transfer_member_invitation_to_identity(
    repeat('b', 64), '6d000000-0000-4000-8000-000000000001'
  ) ->> 'status') <> 'invitation_not_claimable' then
    raise exception 'a cancelled invitation was claimable';
  end if;
  if (public.transfer_member_invitation_to_identity(
    repeat('c', 64), '6d000000-0000-4000-8000-000000000001'
  ) ->> 'status') <> 'invitation_not_claimable' then
    raise exception 'an unknown token was claimable';
  end if;
end;
$$;

rollback;
