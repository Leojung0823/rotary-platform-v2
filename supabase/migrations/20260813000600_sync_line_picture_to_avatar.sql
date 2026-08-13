begin;

-- people.avatar_url (read by the member directory) has never had a writer:
-- LINE Login already captures a real profile picture into
-- line_identities.picture_url on every bind and every regular login, but
-- that never propagated to people.avatar_url, so the directory always fell
-- back to the initial-letter placeholder for every member.

create or replace function public.bind_line_identity_to_existing_account_trusted(
  p_auth_user_id uuid,
  p_provider_subject text,
  p_display_name text,
  p_picture_url text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  account public.app_accounts;
  identity public.line_identities;
  audit_club_id uuid;
begin
  if p_auth_user_id is null
     or btrim(coalesce(p_provider_subject, '')) !~ '^U[A-Za-z0-9_-]{8,254}$'
     or char_length(coalesce(p_display_name, '')) > 100
     or char_length(coalesce(p_picture_url, '')) > 2048
     or char_length(coalesce(p_email, '')) > 320 then
    raise exception using errcode = '22023', message = 'trusted_line_identity_input_required';
  end if;

  select app.* into account
  from public.app_accounts as app
  where app.auth_user_id = p_auth_user_id
  for update;

  if not found or account.account_status <> 'active'
     or not public.account_has_active_access(account.id) then
    raise exception using errcode = '42501', message = 'active_account_access_required';
  end if;

  if exists (
    select 1
    from public.line_identities as blocked_identity
    where blocked_identity.identity_status = 'blocked'
      and (
        blocked_identity.provider_subject = p_provider_subject
        or blocked_identity.app_account_id = account.id
      )
  ) then
    raise exception using errcode = '42501', message = 'line_identity_blocked';
  end if;

  if exists (
    select 1
    from public.line_identities as existing
    where existing.provider_subject = p_provider_subject
      and existing.identity_status = 'active'
      and existing.app_account_id <> account.id
  ) then
    raise exception using errcode = '23505', message = 'line_identity_already_bound';
  end if;

  select existing.* into identity
  from public.line_identities as existing
  where existing.app_account_id = account.id
    and existing.identity_status = 'active'
  for update;

  if found and identity.provider_subject <> p_provider_subject then
    raise exception using errcode = '23505', message = 'account_already_has_another_line_identity';
  end if;

  if found then
    update public.line_identities
    set display_name = p_display_name,
        picture_url = p_picture_url,
        email = p_email,
        last_login_at = now(),
        updated_at = now()
    where id = identity.id
    returning * into identity;
  else
    select historical.* into identity
    from public.line_identities as historical
    where historical.app_account_id = account.id
      and historical.provider_subject = p_provider_subject
      and historical.identity_status = 'unbound'
    order by historical.created_at desc
    limit 1
    for update;

    if found then
      update public.line_identities
      set identity_status = 'active',
          display_name = p_display_name,
          picture_url = p_picture_url,
          email = p_email,
          bound_at = now(),
          last_login_at = now(),
          unbound_at = null,
          unbound_by_app_account_id = null,
          updated_at = now()
      where id = identity.id
      returning * into identity;
    else
      insert into public.line_identities (
        person_id, app_account_id, provider_subject, display_name, picture_url, email, last_login_at
      ) values (
        account.person_id, account.id, p_provider_subject, p_display_name, p_picture_url, p_email, now()
      )
      returning * into identity;
    end if;
  end if;

  if p_picture_url is not null then
    update public.people set avatar_url = p_picture_url where id = account.person_id;
  end if;

  select membership.club_id into audit_club_id
  from public.club_memberships as membership
  join public.clubs as club on club.id = membership.club_id and club.club_status = 'active'
  where membership.person_id = account.person_id
    and membership.membership_status = 'active'
  order by membership.created_at
  limit 1;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    audit_club_id, account.id, 'line_identity.bound', 'line_identity', identity.id,
    jsonb_build_object('trusted_callback', true, 'flow_kind', 'bind')
  );

  return jsonb_build_object(
    'account_id', account.id,
    'person_id', account.person_id,
    'line_identity_id', identity.id,
    'flow_kind', 'bind'
  );
end;
$$;

create or replace function public.bind_line_identity_from_invitation_trusted(
  p_token text,
  p_auth_user_id uuid,
  p_provider_subject text,
  p_display_name text,
  p_picture_url text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  target public.member_invitations;
  account public.app_accounts;
  identity public.line_identities;
  auth_email text;
  target_membership public.club_memberships;
begin
  if p_auth_user_id is null
     or btrim(coalesce(p_provider_subject, '')) !~ '^U[A-Za-z0-9_-]{8,254}$' then
    raise exception using errcode = '22023', message = 'trusted_line_identity_input_required';
  end if;

  select invitation.* into target
  from public.member_invitations as invitation
  where invitation.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  for update;

  if not found
     or target.invitation_status not in ('pending', 'sent')
     or target.expires_at <= now() then
    raise exception using errcode = '22023', message = 'invitation_invalid_or_expired';
  end if;

  select membership.* into target_membership
  from public.club_memberships as membership
  where membership.id = target.membership_id
    and membership.club_id = target.club_id
    and membership.person_id = target.person_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'membership_not_found';
  end if;

  if target.invitation_kind = 'line_rebind'
     and (
       target_membership.membership_status <> 'active'
       or not exists (
         select 1 from public.clubs as club
         where club.id = target.club_id and club.club_status = 'active'
       )
     ) then
    raise exception using errcode = '42501', message = 'active_membership_required_for_rebind';
  end if;

  select lower(btrim(coalesce(users.email, ''))) into auth_email
  from auth.users as users
  where users.id = p_auth_user_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'auth_user_not_found';
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

    if target.invitation_kind = 'line_rebind' and not found then
      raise exception using errcode = 'P0002', message = 'existing_account_required_for_rebind';
    end if;

    if not found then
      insert into public.app_accounts (
        auth_user_id, person_id, login_email, account_display_name
      ) values (
        p_auth_user_id,
        target.person_id,
        coalesce(nullif(auth_email, ''), p_provider_subject || '@line.local'),
        coalesce(
          nullif(btrim(p_display_name), ''),
          (select canonical_name from public.people where id = target.person_id)
        )
      )
      returning * into account;
    end if;
  end if;

  if account.account_status <> 'active' then
    raise exception using errcode = '42501', message = 'active_account_required';
  end if;

  if exists (
    select 1
    from public.line_identities as blocked_identity
    where blocked_identity.identity_status = 'blocked'
      and (
        blocked_identity.provider_subject = p_provider_subject
        or blocked_identity.app_account_id = account.id
      )
  ) then
    raise exception using errcode = '42501', message = 'line_identity_blocked';
  end if;

  if exists (
    select 1
    from public.line_identities as existing
    where existing.provider_subject = p_provider_subject
      and existing.identity_status = 'active'
      and existing.app_account_id <> account.id
  ) then
    raise exception using errcode = '23505', message = 'line_identity_already_bound';
  end if;

  select existing.* into identity
  from public.line_identities as existing
  where existing.app_account_id = account.id
    and existing.identity_status = 'active'
  for update;

  if found and identity.provider_subject <> p_provider_subject then
    raise exception using errcode = '23505', message = 'account_already_has_another_line_identity';
  end if;

  if found then
    update public.line_identities
    set display_name = p_display_name,
        picture_url = p_picture_url,
        email = p_email,
        last_login_at = now(),
        updated_at = now()
    where id = identity.id
    returning * into identity;
  else
    select historical.* into identity
    from public.line_identities as historical
    where historical.app_account_id = account.id
      and historical.provider_subject = p_provider_subject
      and historical.identity_status = 'unbound'
    order by historical.created_at desc
    limit 1
    for update;

    if found then
      update public.line_identities
      set identity_status = 'active',
          display_name = p_display_name,
          picture_url = p_picture_url,
          email = p_email,
          bound_at = now(),
          last_login_at = now(),
          unbound_at = null,
          unbound_by_app_account_id = null,
          updated_at = now()
      where id = identity.id
      returning * into identity;
    else
      insert into public.line_identities (
        person_id, app_account_id, provider_subject, display_name, picture_url, email, last_login_at
      ) values (
        target.person_id, account.id, p_provider_subject, p_display_name, p_picture_url, p_email, now()
      )
      returning * into identity;
    end if;
  end if;

  if p_picture_url is not null then
    update public.people set avatar_url = p_picture_url where id = target.person_id;
  end if;

  if target.invitation_kind = 'line_rebind' then
    update public.member_invitations
    set invitation_status = 'accepted',
        accepted_at = now(),
        accepted_by_app_account_id = account.id,
        updated_at = now()
    where id = target.id;

    insert into public.invitation_logs (
      invitation_id, club_id, actor_app_account_id, event_key, delivery_method
    ) values (
      target.id, target.club_id, account.id, 'accepted', target.delivery_method
    );
  end if;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    target.club_id,
    account.id,
    case when target.invitation_kind = 'line_rebind' then 'line_identity.rebound' else 'line_identity.bound' end,
    'line_identity',
    identity.id,
    jsonb_build_object(
      'invitation_id', target.id,
      'invitation_kind', target.invitation_kind,
      'trusted_callback', true
    )
  );

  return jsonb_build_object(
    'account_id', account.id,
    'person_id', target.person_id,
    'line_identity_id', identity.id,
    'club_id', target.club_id,
    'invitation_id', target.id,
    'invitation_kind', target.invitation_kind,
    'invitation_completed', target.invitation_kind = 'line_rebind'
  );
end;
$$;

-- Regular (already-bound) LINE re-login only did a raw client-side table
-- update with no avatar propagation. Route it through a trusted function
-- so the same sync happens on every login, not just the first bind.
create or replace function public.refresh_line_identity_login(
  p_provider_subject text,
  p_display_name text,
  p_picture_url text,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  identity public.line_identities;
begin
  if btrim(coalesce(p_provider_subject, '')) !~ '^U[A-Za-z0-9_-]{8,254}$' then
    raise exception using errcode = '22023', message = 'trusted_line_identity_input_required';
  end if;

  update public.line_identities
  set display_name = p_display_name,
      picture_url = p_picture_url,
      email = p_email,
      last_login_at = now(),
      updated_at = now()
  where provider_subject = p_provider_subject
    and identity_status = 'active'
  returning * into identity;

  if found and p_picture_url is not null then
    update public.people set avatar_url = p_picture_url where id = identity.person_id;
  end if;
end;
$$;

revoke all on function public.refresh_line_identity_login(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.refresh_line_identity_login(text, text, text, text) to service_role;

commit;
