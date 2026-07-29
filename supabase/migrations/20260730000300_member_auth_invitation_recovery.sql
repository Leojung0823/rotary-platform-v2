begin;

create or replace function public.get_member_invitation_preview(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  result jsonb;
  viewer_account_id uuid := public.current_app_account_id();
begin
  select jsonb_build_object(
    'invitation_id', invitation.id,
    'club_id', club.id,
    'club_name', club.club_name,
    'status', case
      when invitation.expires_at <= now() and invitation.invitation_status in ('pending', 'sent') then 'expired'
      else invitation.invitation_status
    end,
    'expires_at', invitation.expires_at,
    'invitation_kind', invitation.invitation_kind,
    'name', person.canonical_name,
    'has_email', person.primary_email is not null,
    'phone', case when viewer_account.id is not null then person.primary_phone else null end,
    'email', case when viewer_account.id is not null then person.primary_email else null end,
    'birth_date', case when viewer_account.id is not null then person.birth_date else null end
  )
  into result
  from public.member_invitations as invitation
  join public.clubs as club on club.id = invitation.club_id
  join public.people as person on person.id = invitation.person_id
  left join public.app_accounts as viewer_account
    on viewer_account.id = viewer_account_id
   and viewer_account.person_id = invitation.person_id
   and viewer_account.account_status = 'active'
  where invitation.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');

  return result;
end;
$$;

create or replace function public.bind_password_account_from_invitation_trusted(
  p_token text,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  target public.member_invitations;
  target_person public.people;
  account public.app_accounts;
  auth_email text;
begin
  if p_auth_user_id is null then
    raise exception using errcode = '22023', message = 'trusted_password_identity_input_required';
  end if;

  select invitation.* into target
  from public.member_invitations as invitation
  where invitation.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  for update;

  if not found
     or target.invitation_kind <> 'member_join'
     or target.invitation_status not in ('pending', 'sent')
     or target.expires_at <= now() then
    raise exception using errcode = '22023', message = 'invitation_invalid_or_expired';
  end if;

  select person.* into target_person
  from public.people as person
  where person.id = target.person_id
  for update;

  select lower(btrim(coalesce(users.email, ''))) into auth_email
  from auth.users as users
  where users.id = p_auth_user_id;

  if not found or auth_email = '' then
    raise exception using errcode = 'P0002', message = 'auth_user_not_found';
  end if;

  if target_person.primary_email is null
     or lower(btrim(target_person.primary_email)) <> auth_email then
    raise exception using errcode = '42501', message = 'invitation_email_mismatch';
  end if;

  select app.* into account
  from public.app_accounts as app
  where app.auth_user_id = p_auth_user_id
  for update;

  if found and account.person_id <> target.person_id then
    raise exception using errcode = '23505', message = 'auth_account_linked_to_another_person';
  end if;

  if not found then
    select app.* into account
    from public.app_accounts as app
    where app.person_id = target.person_id
    for update;

    if found and account.auth_user_id <> p_auth_user_id then
      raise exception using errcode = '23505', message = 'person_already_has_another_account';
    end if;

    if not found then
      insert into public.app_accounts (
        auth_user_id, person_id, login_email, account_display_name
      ) values (
        p_auth_user_id, target.person_id, auth_email, target_person.canonical_name
      )
      returning * into account;
    end if;
  end if;

  if account.account_status <> 'active' then
    raise exception using errcode = '42501', message = 'active_account_required';
  end if;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    target.club_id, account.id, 'password_identity.bound', 'app_account', account.id,
    jsonb_build_object('invitation_id', target.id, 'trusted_server', true)
  );

  return jsonb_build_object(
    'account_id', account.id,
    'person_id', target.person_id,
    'club_id', target.club_id,
    'invitation_id', target.id
  );
end;
$$;

create or replace function public.complete_member_invitation(
  p_token text,
  p_name text,
  p_phone text,
  p_email text,
  p_birth_date date
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  account_id uuid := public.current_app_account_id();
  target public.member_invitations;
  membership public.club_memberships;
  normalized_name text := btrim(coalesce(p_name, ''));
  normalized_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
  normalized_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  auth_method text;
begin
  if account_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select invitation.* into target
  from public.member_invitations as invitation
  where invitation.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'invitation_not_found';
  end if;

  if target.invitation_status = 'accepted' and target.accepted_by_app_account_id = account_id then
    return jsonb_build_object(
      'club_id', target.club_id,
      'membership_id', target.membership_id,
      'idempotent', true
    );
  end if;

  if target.invitation_status not in ('pending', 'sent')
     or target.expires_at <= now()
     or not exists (
       select 1
       from public.app_accounts as account
       where account.id = account_id
         and account.person_id = target.person_id
         and account.account_status = 'active'
     ) then
    raise exception using errcode = '42501', message = 'valid_bound_invitation_required';
  end if;

  if normalized_name = ''
     or char_length(normalized_name) > 160
     or (normalized_phone is null and normalized_email is null)
     or (normalized_phone is not null and char_length(normalized_phone) > 40)
     or (normalized_email is not null and (
       char_length(normalized_email) > 320
       or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     ))
     or (p_birth_date is not null and (p_birth_date < date '1900-01-01' or p_birth_date > current_date)) then
    raise exception using errcode = '22023', message = 'required_member_profile_fields_missing';
  end if;

  update public.people
  set canonical_name = normalized_name,
      primary_phone = normalized_phone,
      primary_email = normalized_email,
      birth_date = p_birth_date,
      profile_completed_at = now()
  where id = target.person_id;

  update public.app_accounts
  set account_display_name = normalized_name
  where id = account_id;

  update public.club_memberships
  set membership_status = 'active', joined_on = current_date, ended_on = null
  where id = target.membership_id
  returning * into membership;

  update public.member_invitations
  set invitation_status = 'accepted', accepted_at = now(), accepted_by_app_account_id = account_id
  where id = target.id;

  insert into public.club_role_assignments (
    club_id, app_account_id, role_key, granted_by_app_account_id
  ) values (
    target.club_id, account_id, 'member', target.invited_by_app_account_id
  )
  on conflict (club_id, app_account_id, role_key) where assignment_status = 'active'
  do nothing;

  insert into public.notification_settings (app_account_id)
  values (account_id)
  on conflict do nothing;

  insert into public.privacy_settings (app_account_id)
  values (account_id)
  on conflict do nothing;

  insert into public.invitation_logs (
    invitation_id, club_id, actor_app_account_id, event_key
  ) values (
    target.id, target.club_id, account_id, 'accepted'
  );

  select case
    when exists (
      select 1 from public.line_identities as identity
      where identity.app_account_id = account_id and identity.identity_status = 'active'
    ) then 'line'
    else 'password'
  end into auth_method;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    target.club_id, account_id, 'member_invitation.accepted', 'club_membership', membership.id,
    jsonb_build_object('invitation_id', target.id, 'auth_method', auth_method)
  );

  return jsonb_build_object(
    'club_id', target.club_id,
    'membership_id', membership.id,
    'idempotent', false
  );
end;
$$;

revoke all on function public.bind_password_account_from_invitation_trusted(text, uuid)
  from public, anon, authenticated;
grant execute on function public.bind_password_account_from_invitation_trusted(text, uuid)
  to service_role;

commit;
