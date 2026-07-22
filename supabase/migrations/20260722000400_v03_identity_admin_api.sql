begin;

create or replace function public.current_has_club_permission(target_club_id uuid, required_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.current_has_platform_role(array['superadmin', 'platform_admin'])
    or exists (
      select 1
      from public.club_role_assignments as assignment
      join public.app_accounts as account on account.id = assignment.app_account_id
      join public.role_permissions as role_permission on role_permission.role_key = assignment.role_key
      where account.auth_user_id = auth.uid()
        and account.account_status = 'active'
        and assignment.club_id = target_club_id
        and assignment.assignment_status = 'active'
        and role_permission.permission_key = required_permission
    )
    or exists (
      select 1
      from public.club_operator_permissions as permission
      join public.app_accounts as account on account.id = permission.app_account_id
      join public.role_permissions as role_permission on role_permission.role_key = 'secretary'
      where account.auth_user_id = auth.uid()
        and account.account_status = 'active'
        and permission.club_id = target_club_id
        and permission.assignment_status = 'active'
        and permission.permission_level = 'club_manager'
        and role_permission.permission_key = required_permission
    )
$$;

create or replace function public.list_my_permissions(p_club_id uuid)
returns table (permission_key text)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select permission.permission_key
  from public.permissions as permission
  where public.current_has_club_permission(p_club_id, permission.permission_key)
  order by permission.permission_key
$$;

create or replace function public.list_manageable_clubs()
returns table (club_id uuid, club_code text, club_name text, club_status text, permission_level text, created_at timestamptz)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select distinct on (club.id) club.id, club.club_code, club.club_name, club.club_status,
    case when public.current_has_platform_role(array['superadmin', 'platform_admin']) then 'platform_admin'
      when operator.id is not null then 'club_manager'
      when assignment.role_key is not null then assignment.role_key
      else 'member' end,
    club.created_at
  from public.clubs as club
  left join public.app_accounts as account on account.auth_user_id = auth.uid()
  left join public.club_operator_permissions as operator on operator.club_id = club.id
    and operator.app_account_id = account.id and operator.assignment_status = 'active'
  left join public.club_role_assignments as assignment on assignment.club_id = club.id
    and assignment.app_account_id = account.id and assignment.assignment_status = 'active'
  left join public.club_memberships as membership on membership.club_id = club.id
    and membership.person_id = account.person_id and membership.membership_status = 'active'
  where public.current_has_platform_role(array['superadmin', 'platform_admin'])
     or operator.id is not null or assignment.id is not null or membership.id is not null
  order by club.id,
    case when operator.id is not null then 0 when assignment.role_key in ('president', 'secretary') then 1 else 2 end,
    club.club_name
$$;

create or replace function public.get_my_club_home(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare account_id uuid := public.current_app_account_id(); result jsonb;
begin
  if account_id is null or not exists (
    select 1 from public.app_accounts as account
    join public.club_memberships as membership on membership.person_id = account.person_id
    where account.id = account_id and membership.club_id = p_club_id and membership.membership_status = 'active'
  ) then raise exception using errcode = '42501', message = 'active_membership_required'; end if;
  select jsonb_build_object('club_id', club.id, 'club_code', club.club_code, 'club_name', club.club_name,
    'club_status', club.club_status) into result from public.clubs as club where club.id = p_club_id;
  return result;
end;
$$;

create or replace function public.create_member_invitation(
  p_club_id uuid,
  p_name text,
  p_phone text,
  p_email text,
  p_birth_date date,
  p_delivery_method text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  actor_id uuid := public.current_app_account_id();
  normalized_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  normalized_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
  target_person public.people;
  target_membership public.club_memberships;
  existing_invite public.member_invitations;
  new_invite public.member_invitations;
  raw_token text;
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'invitation.manage') then
    raise exception using errcode = '42501', message = 'invitation_manage_required';
  end if;
  if btrim(coalesce(p_name, '')) = '' or btrim(coalesce(p_idempotency_key, '')) = ''
     or p_delivery_method not in ('line', 'email', 'qr', 'link')
     or (normalized_email is null and normalized_phone is null) then
    raise exception using errcode = '22023', message = 'invalid_member_invitation_input';
  end if;

  select invitation.* into existing_invite
  from public.member_invitations as invitation
  where invitation.idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('invitation_id', existing_invite.id, 'membership_id', existing_invite.membership_id,
      'invitation_status', existing_invite.invitation_status, 'idempotent', true, 'token', null);
  end if;

  if normalized_email is not null then
    select person.* into target_person from public.people as person
    where lower(btrim(person.primary_email)) = normalized_email limit 1 for update;
  end if;
  if not found and normalized_phone is not null then
    select person.* into target_person from public.people as person
    where regexp_replace(coalesce(person.primary_phone, ''), '[^0-9+]', '', 'g') = normalized_phone
    limit 1 for update;
  end if;
  if not found then
    insert into public.people (canonical_name, primary_phone, primary_email, birth_date)
    values (btrim(p_name), normalized_phone, normalized_email, p_birth_date)
    returning * into target_person;
  else
    update public.people set
      canonical_name = coalesce(nullif(btrim(p_name), ''), canonical_name),
      primary_phone = coalesce(primary_phone, normalized_phone),
      primary_email = coalesce(primary_email, normalized_email),
      birth_date = coalesce(birth_date, p_birth_date)
    where id = target_person.id returning * into target_person;
  end if;

  select membership.* into target_membership from public.club_memberships as membership
  where membership.club_id = p_club_id and membership.person_id = target_person.id
    and membership.membership_status in ('invited', 'active', 'suspended', 'disabled')
  order by membership.created_at desc limit 1 for update;
  if found and target_membership.membership_status <> 'invited' then
    raise exception using errcode = '23505', message = 'member_already_exists_in_club';
  end if;
  if not found then
    insert into public.club_memberships (club_id, person_id, membership_status, created_by_app_account_id)
    values (p_club_id, target_person.id, 'invited', actor_id)
    returning * into target_membership;
  end if;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.member_invitations (
    club_id, person_id, membership_id, delivery_method, token_hash, token_prefix,
    invitation_status, invited_by_app_account_id, idempotency_key, sent_at
  ) values (
    p_club_id, target_person.id, target_membership.id, p_delivery_method,
    encode(extensions.digest(raw_token, 'sha256'), 'hex'), left(raw_token, 8),
    'sent', actor_id, p_idempotency_key, now()
  ) returning * into new_invite;
  insert into public.invitation_logs (invitation_id, club_id, actor_app_account_id, event_key, delivery_method)
  values (new_invite.id, p_club_id, actor_id, 'created', p_delivery_method),
         (new_invite.id, p_club_id, actor_id, 'sent', p_delivery_method);
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'member.invited', 'member_invitation', new_invite.id,
    jsonb_build_object('membership_id', target_membership.id, 'delivery_method', p_delivery_method));
  return jsonb_build_object('invitation_id', new_invite.id, 'membership_id', target_membership.id,
    'invitation_status', new_invite.invitation_status, 'idempotent', false, 'token', raw_token);
end;
$$;

create or replace function public.resend_member_invitation(p_invitation_id uuid, p_delivery_method text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.member_invitations;
  raw_token text;
begin
  select invitation.* into target from public.member_invitations as invitation
  where invitation.id = p_invitation_id for update;
  if not found or not public.current_has_club_permission(target.club_id, 'invitation.manage') then
    raise exception using errcode = '42501', message = 'invitation_manage_required';
  end if;
  if target.invitation_status = 'accepted' then
    raise exception using errcode = '22023', message = 'accepted_invitation_cannot_be_resent';
  end if;
  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  update public.member_invitations set
    delivery_method = p_delivery_method,
    token_hash = encode(extensions.digest(raw_token, 'sha256'), 'hex'), token_prefix = left(raw_token, 8),
    invitation_status = 'sent', sent_at = now(), expires_at = now() + interval '14 days',
    cancelled_at = null, cancelled_by_app_account_id = null
  where id = target.id;
  insert into public.invitation_logs (invitation_id, club_id, actor_app_account_id, event_key, delivery_method)
  values (target.id, target.club_id, actor_id, 'resent', p_delivery_method);
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id)
  values (target.club_id, actor_id, 'member_invitation.resent', 'member_invitation', target.id);
  return jsonb_build_object('invitation_id', target.id, 'token', raw_token, 'invitation_status', 'sent');
end;
$$;

create or replace function public.cancel_member_invitation(p_invitation_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare actor_id uuid := public.current_app_account_id(); target public.member_invitations;
begin
  select invitation.* into target from public.member_invitations as invitation
  where invitation.id = p_invitation_id for update;
  if not found or not public.current_has_club_permission(target.club_id, 'invitation.manage') then
    raise exception using errcode = '42501', message = 'invitation_manage_required';
  end if;
  if target.invitation_status in ('accepted', 'cancelled') then return; end if;
  update public.member_invitations set invitation_status = 'cancelled', cancelled_at = now(), cancelled_by_app_account_id = actor_id
  where id = target.id;
  insert into public.invitation_logs (invitation_id, club_id, actor_app_account_id, event_key, metadata)
  values (target.id, target.club_id, actor_id, 'cancelled', jsonb_build_object('reason', btrim(coalesce(p_reason, ''))));
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (target.club_id, actor_id, 'member_invitation.cancelled', 'member_invitation', target.id,
    jsonb_build_object('reason', btrim(coalesce(p_reason, ''))));
end;
$$;

create or replace function public.get_member_invitation_preview(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare result jsonb; is_authenticated boolean := auth.uid() is not null;
begin
  select jsonb_build_object(
    'invitation_id', invitation.id, 'club_id', club.id, 'club_name', club.club_name,
    'status', case when invitation.expires_at <= now() then 'expired' else invitation.invitation_status end,
    'expires_at', invitation.expires_at, 'invitation_kind', invitation.invitation_kind,
    'name', person.canonical_name,
    'phone', case when is_authenticated then person.primary_phone else null end,
    'email', case when is_authenticated then person.primary_email else null end,
    'birth_date', case when is_authenticated then person.birth_date else null end
  ) into result
  from public.member_invitations as invitation
  join public.clubs as club on club.id = invitation.club_id
  join public.people as person on person.id = invitation.person_id
  where invitation.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  return result;
end;
$$;

create or replace function public.bind_line_identity_from_invitation(
  p_token text,
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
  auth_id uuid := auth.uid(); auth_email text; target public.member_invitations;
  account public.app_accounts; identity public.line_identities;
begin
  if auth_id is null or btrim(coalesce(p_provider_subject, '')) = '' then
    raise exception using errcode = '42501', message = 'authenticated_line_identity_required';
  end if;
  select invitation.* into target from public.member_invitations as invitation
  where invitation.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  for update;
  if not found or target.invitation_status not in ('pending', 'sent') or target.expires_at <= now() then
    raise exception using errcode = '22023', message = 'invitation_invalid_or_expired';
  end if;
  select lower(btrim(coalesce(users.email, ''))) into auth_email from auth.users as users where users.id = auth_id;
  select app.* into account from public.app_accounts as app where app.auth_user_id = auth_id for update;
  if found and account.person_id <> target.person_id then
    raise exception using errcode = '23505', message = 'auth_account_linked_to_another_person';
  end if;
  if not found then
    if exists (select 1 from public.app_accounts as existing where existing.person_id = target.person_id) then
      raise exception using errcode = '23505', message = 'person_already_has_another_account';
    end if;
    insert into public.app_accounts (auth_user_id, person_id, login_email, account_display_name)
    values (auth_id, target.person_id, coalesce(nullif(auth_email, ''), p_provider_subject || '@line.local'),
      coalesce(nullif(btrim(p_display_name), ''), (select canonical_name from public.people where id = target.person_id)))
    returning * into account;
  end if;
  if exists (select 1 from public.line_identities as existing
    where existing.provider_subject = p_provider_subject and existing.identity_status = 'active'
      and existing.app_account_id <> account.id) then
    raise exception using errcode = '23505', message = 'line_identity_already_bound';
  end if;
  insert into public.line_identities (person_id, app_account_id, provider_subject, display_name, picture_url, email, last_login_at)
  values (target.person_id, account.id, p_provider_subject, p_display_name, p_picture_url, p_email, now())
  on conflict (app_account_id) where identity_status = 'active'
  do update set display_name = excluded.display_name, picture_url = excluded.picture_url,
    email = excluded.email, last_login_at = now(), updated_at = now()
  returning * into identity;
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (target.club_id, account.id, 'line_identity.bound', 'line_identity', identity.id,
    jsonb_build_object('invitation_id', target.id));
  return jsonb_build_object('account_id', account.id, 'person_id', target.person_id,
    'line_identity_id', identity.id, 'club_id', target.club_id, 'invitation_id', target.id);
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
declare account_id uuid := public.current_app_account_id(); target public.member_invitations; membership public.club_memberships;
begin
  if account_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  select invitation.* into target from public.member_invitations as invitation
  where invitation.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') for update;
  if not found then raise exception using errcode = 'P0002', message = 'invitation_not_found'; end if;
  if target.invitation_status = 'accepted' and target.accepted_by_app_account_id = account_id then
    return jsonb_build_object('club_id', target.club_id, 'membership_id', target.membership_id, 'idempotent', true);
  end if;
  if target.invitation_status not in ('pending', 'sent') or target.expires_at <= now()
     or not exists (select 1 from public.app_accounts as account where account.id = account_id and account.person_id = target.person_id)
     or not exists (select 1 from public.line_identities as identity where identity.app_account_id = account_id and identity.identity_status = 'active') then
    raise exception using errcode = '42501', message = 'valid_bound_invitation_required';
  end if;
  if btrim(coalesce(p_name, '')) = '' or (nullif(btrim(coalesce(p_phone, '')), '') is null and nullif(btrim(coalesce(p_email, '')), '') is null) then
    raise exception using errcode = '22023', message = 'required_member_profile_fields_missing';
  end if;
  update public.people set canonical_name = btrim(p_name),
    primary_phone = nullif(btrim(coalesce(p_phone, '')), ''),
    primary_email = nullif(lower(btrim(coalesce(p_email, ''))), ''), birth_date = p_birth_date,
    profile_completed_at = now()
  where id = target.person_id;
  update public.club_memberships set membership_status = 'active', joined_on = current_date, ended_on = null
  where id = target.membership_id returning * into membership;
  update public.member_invitations set invitation_status = 'accepted', accepted_at = now(), accepted_by_app_account_id = account_id
  where id = target.id;
  insert into public.club_role_assignments (club_id, app_account_id, role_key, granted_by_app_account_id)
  values (target.club_id, account_id, 'member', target.invited_by_app_account_id)
  on conflict (club_id, app_account_id, role_key) where assignment_status = 'active' do nothing;
  insert into public.notification_settings (app_account_id) values (account_id) on conflict do nothing;
  insert into public.privacy_settings (app_account_id) values (account_id) on conflict do nothing;
  insert into public.invitation_logs (invitation_id, club_id, actor_app_account_id, event_key)
  values (target.id, target.club_id, account_id, 'accepted');
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (target.club_id, account_id, 'member_invitation.accepted', 'club_membership', membership.id,
    jsonb_build_object('invitation_id', target.id));
  return jsonb_build_object('club_id', target.club_id, 'membership_id', membership.id, 'idempotent', false);
end;
$$;

create or replace function public.list_club_members(p_club_id uuid, p_query text default null, p_status text default null)
returns table (
  membership_id uuid, person_id uuid, app_account_id uuid, line_identity_id uuid, oa_follower_id uuid,
  display_name text, phone text, email text, birth_date date,
  membership_status text, role_key text, line_login_status text, oa_status text, created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select membership.id, person.id, account.id, identity.id, follower.id,
    person.canonical_name, person.primary_phone, person.primary_email, person.birth_date,
    membership.membership_status,
    coalesce((select assignment.role_key from public.club_role_assignments as assignment
      where assignment.club_id = membership.club_id and assignment.app_account_id = account.id
        and assignment.assignment_status = 'active'
      order by case assignment.role_key when 'president' then 1 when 'secretary' then 2 when 'finance' then 3 else 4 end
      limit 1), 'member'),
    case when identity.id is null then 'unbound' else identity.identity_status end,
    case when follower.id is null then 'unpaired' else follower.follower_status end,
    membership.created_at
  from public.club_memberships as membership
  join public.people as person on person.id = membership.person_id
  left join public.app_accounts as account on account.person_id = person.id
  left join public.line_identities as identity on identity.app_account_id = account.id and identity.identity_status = 'active'
  left join public.line_oa_followers as follower on follower.club_id = membership.club_id
    and follower.person_id = person.id and follower.follower_status = 'following'
  where membership.club_id = p_club_id
    and public.current_has_club_permission(p_club_id, 'member.read')
    and (p_status is null or membership.membership_status = p_status)
    and (nullif(btrim(coalesce(p_query, '')), '') is null
      or person.canonical_name ilike '%' || btrim(p_query) || '%'
      or coalesce(person.primary_email, '') ilike '%' || btrim(p_query) || '%'
      or coalesce(person.primary_phone, '') ilike '%' || btrim(p_query) || '%')
  order by person.canonical_name, membership.id
$$;

create or replace function public.update_member_profile(
  p_club_id uuid, p_membership_id uuid, p_name text, p_phone text, p_email text, p_birth_date date
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare actor_id uuid := public.current_app_account_id(); target_person_id uuid;
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'member.manage')
     or btrim(coalesce(p_name, '')) = '' then
    raise exception using errcode = '42501', message = 'member_manage_required';
  end if;
  select person_id into target_person_id from public.club_memberships
  where id = p_membership_id and club_id = p_club_id;
  if target_person_id is null then raise exception using errcode = 'P0002', message = 'membership_not_found'; end if;
  update public.people set canonical_name = btrim(p_name),
    primary_phone = nullif(btrim(coalesce(p_phone, '')), ''),
    primary_email = nullif(lower(btrim(coalesce(p_email, ''))), ''), birth_date = p_birth_date
  where id = target_person_id;
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id)
  values (p_club_id, actor_id, 'member.profile_updated', 'club_membership', p_membership_id);
end;
$$;

create or replace function public.list_member_invitations(p_club_id uuid)
returns table (invitation_id uuid, membership_id uuid, display_name text, delivery_method text, invitation_status text, expires_at timestamptz, sent_at timestamptz, accepted_at timestamptz)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select invitation.id, invitation.membership_id, person.canonical_name, invitation.delivery_method,
    case when invitation.expires_at <= now() and invitation.invitation_status in ('pending', 'sent') then 'expired' else invitation.invitation_status end,
    invitation.expires_at, invitation.sent_at, invitation.accepted_at
  from public.member_invitations as invitation
  join public.people as person on person.id = invitation.person_id
  where invitation.club_id = p_club_id and public.current_has_club_permission(p_club_id, 'invitation.manage')
  order by invitation.created_at desc
$$;

create or replace function public.set_membership_status(p_club_id uuid, p_membership_id uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare actor_id uuid := public.current_app_account_id();
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'member.manage')
     or p_status not in ('active', 'suspended', 'disabled') then
    raise exception using errcode = '42501', message = 'member_manage_required';
  end if;
  update public.club_memberships set membership_status = p_status,
    ended_on = case when p_status = 'disabled' then current_date else null end
  where id = p_membership_id and club_id = p_club_id;
  if not found then raise exception using errcode = 'P0002', message = 'membership_not_found'; end if;
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'membership.status_changed', 'club_membership', p_membership_id,
    jsonb_build_object('status', p_status, 'reason', btrim(coalesce(p_reason, ''))));
end;
$$;

create or replace function public.assign_club_role(p_club_id uuid, p_app_account_id uuid, p_role_key text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare actor_id uuid := public.current_app_account_id(); assignment_id uuid;
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'role.manage')
     or p_role_key not in ('president', 'secretary', 'finance', 'member') then
    raise exception using errcode = '42501', message = 'role_manage_required';
  end if;
  update public.club_role_assignments set assignment_status = 'revoked', revoked_by_app_account_id = actor_id,
    revoked_at = now(), revoke_reason = 'role_replaced', updated_at = now()
  where club_id = p_club_id and app_account_id = p_app_account_id and assignment_status = 'active'
    and role_key <> p_role_key;
  insert into public.club_role_assignments (club_id, app_account_id, role_key, granted_by_app_account_id)
  values (p_club_id, p_app_account_id, p_role_key, actor_id)
  on conflict (club_id, app_account_id, role_key) where assignment_status = 'active'
  do update set updated_at = now() returning id into assignment_id;
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'role.assigned', 'club_role_assignment', assignment_id, jsonb_build_object('role_key', p_role_key));
  return assignment_id;
end;
$$;

create or replace function public.record_login_and_device(
  p_provider_key text, p_device_fingerprint_hash text, p_device_name text, p_user_agent text, p_ip_address inet default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare account_id uuid := public.current_app_account_id(); device_id uuid; current_session_id uuid;
begin
  if account_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  current_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  insert into public.user_devices (app_account_id, device_fingerprint_hash, device_name, user_agent, session_id)
  values (account_id, p_device_fingerprint_hash, coalesce(nullif(btrim(p_device_name), ''), '未知裝置'), p_user_agent, current_session_id)
  on conflict (app_account_id, device_fingerprint_hash) do update set
    device_name = excluded.device_name, user_agent = excluded.user_agent,
    session_id = excluded.session_id, last_seen_at = now(), revoked_at = null, updated_at = now()
  returning id into device_id;
  insert into public.login_history (app_account_id, auth_user_id, provider_key, outcome, ip_address, user_agent, device_id)
  values (account_id, auth.uid(), p_provider_key, 'success', p_ip_address, p_user_agent, device_id);
  return device_id;
end;
$$;

create or replace function public.get_my_identity_center()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare account_id uuid := public.current_app_account_id(); result jsonb;
begin
  if account_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  select jsonb_build_object(
    'profile', jsonb_build_object('display_name', person.canonical_name, 'phone', person.primary_phone,
      'email', person.primary_email, 'birth_date', person.birth_date, 'avatar_url', person.avatar_url,
      'profile_completed_at', person.profile_completed_at),
    'line_identity', (select jsonb_build_object('id', identity.id, 'status', identity.identity_status,
      'display_name', identity.display_name, 'picture_url', identity.picture_url, 'bound_at', identity.bound_at,
      'last_login_at', identity.last_login_at) from public.line_identities as identity
      where identity.app_account_id = account_id order by identity.created_at desc limit 1),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('id', device.id, 'name', device.device_name,
      'trusted', device.trusted, 'last_seen_at', device.last_seen_at, 'revoked_at', device.revoked_at)
      order by device.last_seen_at desc) from public.user_devices as device where device.app_account_id = account_id), '[]'::jsonb),
    'login_history', coalesce((select jsonb_agg(jsonb_build_object('provider', history.provider_key,
      'outcome', history.outcome, 'created_at', history.created_at, 'user_agent', history.user_agent)
      order by history.created_at desc) from (select * from public.login_history where app_account_id = account_id order by created_at desc limit 20) as history), '[]'::jsonb),
    'notification_settings', (select to_jsonb(settings) - 'app_account_id' from public.notification_settings as settings where settings.app_account_id = account_id),
    'privacy_settings', (select to_jsonb(settings) - 'app_account_id' from public.privacy_settings as settings where settings.app_account_id = account_id)
  ) into result
  from public.app_accounts as account join public.people as person on person.id = account.person_id
  where account.id = account_id;
  return result;
end;
$$;

create or replace function public.update_my_settings(p_notifications jsonb, p_privacy jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare account_id uuid := public.current_app_account_id();
begin
  if account_id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  insert into public.notification_settings (app_account_id, line_enabled, email_enabled, security_alerts, club_announcements)
  values (account_id, coalesce((p_notifications->>'line_enabled')::boolean, true),
    coalesce((p_notifications->>'email_enabled')::boolean, true), coalesce((p_notifications->>'security_alerts')::boolean, true),
    coalesce((p_notifications->>'club_announcements')::boolean, true))
  on conflict (app_account_id) do update set line_enabled = excluded.line_enabled, email_enabled = excluded.email_enabled,
    security_alerts = excluded.security_alerts, club_announcements = excluded.club_announcements, updated_at = now();
  insert into public.privacy_settings (app_account_id, show_email_to_club, show_phone_to_club, show_birthday_year, analytics_consent)
  values (account_id, coalesce((p_privacy->>'show_email_to_club')::boolean, false),
    coalesce((p_privacy->>'show_phone_to_club')::boolean, false), coalesce((p_privacy->>'show_birthday_year')::boolean, false),
    coalesce((p_privacy->>'analytics_consent')::boolean, false))
  on conflict (app_account_id) do update set show_email_to_club = excluded.show_email_to_club,
    show_phone_to_club = excluded.show_phone_to_club, show_birthday_year = excluded.show_birthday_year,
    analytics_consent = excluded.analytics_consent, updated_at = now();
  insert into public.audit_logs (actor_app_account_id, action_key, subject_type, subject_id)
  values (account_id, 'identity.settings_updated', 'app_account', account_id);
end;
$$;

create or replace function public.revoke_my_device(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare account_id uuid := public.current_app_account_id(); target_session uuid;
begin
  update public.user_devices set revoked_at = now(), trusted = false
  where id = p_device_id and app_account_id = account_id returning session_id into target_session;
  if not found then raise exception using errcode = 'P0002', message = 'device_not_found'; end if;
  if target_session is not null then delete from auth.sessions where id = target_session and user_id = auth.uid(); end if;
  insert into public.audit_logs (actor_app_account_id, action_key, subject_type, subject_id)
  values (account_id, 'device.revoked', 'user_device', p_device_id);
end;
$$;

create or replace function public.unbind_line_identity(p_club_id uuid, p_app_account_id uuid, p_reason text, p_create_rebind boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare actor_id uuid := public.current_app_account_id(); target public.line_identities; membership public.club_memberships;
  raw_token text; rebind_invite public.member_invitations;
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'identity.unbind') then
    raise exception using errcode = '42501', message = 'identity_unbind_required';
  end if;
  select identity.* into target from public.line_identities as identity
  where identity.app_account_id = p_app_account_id and identity.identity_status = 'active' for update;
  if not found then return jsonb_build_object('unbound', true, 'idempotent', true, 'rebind_token', null); end if;
  select member.* into membership from public.club_memberships as member
  where member.club_id = p_club_id and member.person_id = target.person_id
    and member.membership_status in ('active', 'suspended', 'disabled') limit 1;
  if not found then raise exception using errcode = '42501', message = 'account_not_in_club'; end if;
  update public.line_identities set identity_status = 'unbound', unbound_at = now(), unbound_by_app_account_id = actor_id
  where id = target.id;
  delete from auth.sessions where user_id = (select auth_user_id from public.app_accounts where id = p_app_account_id);
  if p_create_rebind then
    update public.member_invitations set invitation_status = 'cancelled', cancelled_at = now(), cancelled_by_app_account_id = actor_id
    where membership_id = membership.id and invitation_status in ('pending', 'sent');
    raw_token := encode(extensions.gen_random_bytes(32), 'hex');
    insert into public.member_invitations (club_id, person_id, membership_id, invitation_kind, delivery_method,
      token_hash, token_prefix, invitation_status, invited_by_app_account_id, idempotency_key, sent_at)
    values (p_club_id, target.person_id, membership.id, 'line_rebind', 'link',
      encode(extensions.digest(raw_token, 'sha256'), 'hex'), left(raw_token, 8), 'sent', actor_id,
      'rebind-' || target.id::text || '-' || floor(extract(epoch from clock_timestamp()))::bigint::text, now())
    returning * into rebind_invite;
    insert into public.invitation_logs (invitation_id, club_id, actor_app_account_id, event_key, delivery_method)
    values (rebind_invite.id, p_club_id, actor_id, 'created', 'link');
  end if;
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'line_identity.unbound', 'line_identity', target.id,
    jsonb_build_object('reason', btrim(coalesce(p_reason, '')), 'sessions_revoked', true, 'rebind_created', p_create_rebind));
  return jsonb_build_object('unbound', true, 'idempotent', false, 'rebind_invitation_id', rebind_invite.id,
    'rebind_token', raw_token);
end;
$$;

create or replace function public.configure_line_oa(p_club_id uuid, p_display_name text, p_basic_id text, p_channel_id text, p_mode text default 'configured')
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare actor_id uuid := public.current_app_account_id(); account_id uuid;
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'oa.manage') then
    raise exception using errcode = '42501', message = 'oa_manage_required';
  end if;
  insert into public.line_oa_accounts (club_id, display_name, basic_id, channel_id, account_status, created_by_app_account_id)
  values (p_club_id, btrim(p_display_name), nullif(btrim(p_basic_id), ''), nullif(btrim(p_channel_id), ''), p_mode, actor_id)
  on conflict (club_id) where account_status <> 'disabled' do update set
    display_name = excluded.display_name, basic_id = excluded.basic_id, channel_id = excluded.channel_id,
    account_status = excluded.account_status, updated_at = now()
  returning id into account_id;
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id)
  values (p_club_id, actor_id, 'line_oa.configured', 'line_oa_account', account_id);
  return account_id;
end;
$$;

create or replace function public.pair_line_oa_follower(p_club_id uuid, p_oa_user_id text, p_person_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare actor_id uuid := public.current_app_account_id(); oa_id uuid; follower_id uuid; target_account uuid;
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'oa.manage') then
    raise exception using errcode = '42501', message = 'oa_manage_required';
  end if;
  select id into oa_id from public.line_oa_accounts where club_id = p_club_id and account_status <> 'disabled';
  if oa_id is null or not exists (select 1 from public.club_memberships where club_id = p_club_id and person_id = p_person_id) then
    raise exception using errcode = 'P0002', message = 'oa_or_member_not_found';
  end if;
  select id into target_account from public.app_accounts where person_id = p_person_id;
  insert into public.line_oa_followers (line_oa_account_id, club_id, person_id, app_account_id, oa_user_id, paired_at)
  values (oa_id, p_club_id, p_person_id, target_account, btrim(p_oa_user_id), now())
  on conflict (line_oa_account_id, oa_user_id) do update set person_id = excluded.person_id,
    app_account_id = excluded.app_account_id, follower_status = 'following', paired_at = now(), unpaired_at = null, updated_at = now()
  returning id into follower_id;
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id)
  values (p_club_id, actor_id, 'line_oa.paired', 'line_oa_follower', follower_id);
  return follower_id;
end;
$$;

create or replace function public.unpair_line_oa_follower(p_club_id uuid, p_follower_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare actor_id uuid := public.current_app_account_id();
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'oa.manage') then
    raise exception using errcode = '42501', message = 'oa_manage_required';
  end if;
  update public.line_oa_followers set follower_status = 'unpaired', unpaired_at = now()
  where id = p_follower_id and club_id = p_club_id;
  if not found then raise exception using errcode = 'P0002', message = 'oa_follower_not_found'; end if;
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'line_oa.unpaired', 'line_oa_follower', p_follower_id,
    jsonb_build_object('reason', btrim(coalesce(p_reason, '')), 'login_identity_unchanged', true));
end;
$$;

create or replace function public.get_identity_dashboard(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare result jsonb;
begin
  if not public.current_has_club_permission(p_club_id, 'dashboard.read') then
    raise exception using errcode = '42501', message = 'dashboard_read_required';
  end if;
  select jsonb_build_object(
    'member_total', count(*) filter (where membership.membership_status = 'active'),
    'line_bound', count(*) filter (where membership.membership_status = 'active' and identity.id is not null),
    'line_unbound', count(*) filter (where membership.membership_status = 'active' and identity.id is null),
    'oa_joined', count(*) filter (where membership.membership_status = 'active' and follower.id is not null),
    'oa_not_joined', count(*) filter (where membership.membership_status = 'active' and follower.id is null),
    'pending_invitations', (select count(*) from public.member_invitations where club_id = p_club_id and invitation_status in ('pending', 'sent') and expires_at > now()),
    'recent_logins', coalesce((select jsonb_agg(to_jsonb(recent)) from (
      select person.canonical_name as display_name, history.provider_key, history.created_at
      from public.login_history as history join public.app_accounts as account on account.id = history.app_account_id
      join public.people as person on person.id = account.person_id
      join public.club_memberships as member on member.person_id = person.id and member.club_id = p_club_id
      order by history.created_at desc limit 8) as recent), '[]'::jsonb),
    'recent_members', coalesce((select jsonb_agg(to_jsonb(recent)) from (
      select person.canonical_name as display_name, member.membership_status, member.created_at
      from public.club_memberships as member join public.people as person on person.id = member.person_id
      where member.club_id = p_club_id order by member.created_at desc limit 8) as recent), '[]'::jsonb)
  ) into result
  from public.club_memberships as membership
  left join public.app_accounts as account on account.person_id = membership.person_id
  left join public.line_identities as identity on identity.app_account_id = account.id and identity.identity_status = 'active'
  left join public.line_oa_followers as follower on follower.club_id = membership.club_id and follower.person_id = membership.person_id and follower.follower_status = 'following'
  where membership.club_id = p_club_id;
  return result;
end;
$$;

create or replace function public.get_line_oa_admin(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare result jsonb;
begin
  if not public.current_has_club_permission(p_club_id, 'oa.read') then
    raise exception using errcode = '42501', message = 'oa_read_required';
  end if;
  select jsonb_build_object(
    'account', (select jsonb_build_object('id', account.id, 'display_name', account.display_name,
      'basic_id', account.basic_id, 'channel_id', account.channel_id, 'rich_menu_id', account.rich_menu_id,
      'status', account.account_status) from public.line_oa_accounts as account
      where account.club_id = p_club_id and account.account_status <> 'disabled' limit 1),
    'followers', coalesce((select jsonb_agg(jsonb_build_object('id', follower.id, 'oa_user_id', follower.oa_user_id,
      'status', follower.follower_status, 'person_id', follower.person_id, 'display_name', person.canonical_name,
      'paired_at', follower.paired_at) order by follower.updated_at desc)
      from public.line_oa_followers as follower left join public.people as person on person.id = follower.person_id
      where follower.club_id = p_club_id), '[]'::jsonb),
    'push_logs', coalesce((select jsonb_agg(jsonb_build_object('id', push.id, 'kind', push.push_kind,
      'recipient_count', push.recipient_count, 'status', push.delivery_status, 'created_at', push.created_at)
      order by push.created_at desc) from (select * from public.line_push_logs where club_id = p_club_id order by created_at desc limit 30) as push), '[]'::jsonb),
    'webhooks', coalesce((select jsonb_agg(jsonb_build_object('id', webhook.id, 'event_type', webhook.event_type,
      'signature_valid', webhook.signature_valid, 'status', webhook.processing_status, 'received_at', webhook.received_at)
      order by webhook.received_at desc) from (select * from public.line_webhooks where club_id = p_club_id order by received_at desc limit 30) as webhook), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.record_line_push(
  p_club_id uuid, p_push_kind text, p_recipient_count integer, p_payload_summary jsonb,
  p_delivery_status text, p_provider_request_id text default null, p_failure_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare actor_id uuid := public.current_app_account_id(); oa_id uuid; push_id uuid;
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'oa.manage') then
    raise exception using errcode = '42501', message = 'oa_manage_required';
  end if;
  select id into oa_id from public.line_oa_accounts where club_id = p_club_id and account_status <> 'disabled';
  if oa_id is null then raise exception using errcode = 'P0002', message = 'oa_not_configured'; end if;
  insert into public.line_push_logs (line_oa_account_id, club_id, requested_by_app_account_id,
    push_kind, recipient_count, payload_summary, delivery_status, provider_request_id, failure_code, completed_at)
  values (oa_id, p_club_id, actor_id, p_push_kind, greatest(p_recipient_count, 0),
    coalesce(p_payload_summary, '{}'::jsonb), p_delivery_status, p_provider_request_id, p_failure_code,
    case when p_delivery_status <> 'queued' then now() else null end)
  returning id into push_id;
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id,
    metadata) values (p_club_id, actor_id, 'line_oa.push_requested', 'line_push_log', push_id,
    jsonb_build_object('kind', p_push_kind, 'recipient_count', p_recipient_count, 'status', p_delivery_status));
  return push_id;
end;
$$;

create or replace function public.list_club_audit(p_club_id uuid, p_limit integer default 50)
returns table (id bigint, action_key text, actor_name text, subject_type text, subject_id uuid, metadata jsonb, created_at timestamptz)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select audit.id, audit.action_key, account.account_display_name, audit.subject_type, audit.subject_id,
    audit.metadata, audit.created_at
  from public.audit_logs as audit left join public.app_accounts as account on account.id = audit.actor_app_account_id
  where audit.club_id = p_club_id and public.current_has_club_permission(p_club_id, 'audit.read')
  order by audit.created_at desc limit least(greatest(p_limit, 1), 200)
$$;

revoke all on function public.current_has_club_permission(uuid, text) from public, anon, authenticated;
revoke all on function public.get_my_club_home(uuid) from public, anon;
revoke all on function public.list_my_permissions(uuid) from public, anon;
revoke all on function public.create_member_invitation(uuid, text, text, text, date, text, text) from public, anon;
revoke all on function public.resend_member_invitation(uuid, text) from public, anon;
revoke all on function public.cancel_member_invitation(uuid, text) from public, anon;
revoke all on function public.get_member_invitation_preview(text) from public;
revoke all on function public.bind_line_identity_from_invitation(text, text, text, text, text) from public, anon;
revoke all on function public.complete_member_invitation(text, text, text, text, date) from public, anon;
revoke all on function public.list_club_members(uuid, text, text) from public, anon;
revoke all on function public.list_member_invitations(uuid) from public, anon;
revoke all on function public.update_member_profile(uuid, uuid, text, text, text, date) from public, anon;
revoke all on function public.set_membership_status(uuid, uuid, text, text) from public, anon;
revoke all on function public.assign_club_role(uuid, uuid, text) from public, anon;
revoke all on function public.record_login_and_device(text, text, text, text, inet) from public, anon;
revoke all on function public.get_my_identity_center() from public, anon;
revoke all on function public.update_my_settings(jsonb, jsonb) from public, anon;
revoke all on function public.revoke_my_device(uuid) from public, anon;
revoke all on function public.unbind_line_identity(uuid, uuid, text, boolean) from public, anon;
revoke all on function public.configure_line_oa(uuid, text, text, text, text) from public, anon;
revoke all on function public.pair_line_oa_follower(uuid, text, uuid) from public, anon;
revoke all on function public.unpair_line_oa_follower(uuid, uuid, text) from public, anon;
revoke all on function public.get_identity_dashboard(uuid) from public, anon;
revoke all on function public.get_line_oa_admin(uuid) from public, anon;
revoke all on function public.record_line_push(uuid, text, integer, jsonb, text, text, text) from public, anon;
revoke all on function public.list_club_audit(uuid, integer) from public, anon;

grant execute on function public.list_my_permissions(uuid) to authenticated;
grant execute on function public.get_my_club_home(uuid) to authenticated;
grant execute on function public.create_member_invitation(uuid, text, text, text, date, text, text) to authenticated;
grant execute on function public.resend_member_invitation(uuid, text) to authenticated;
grant execute on function public.cancel_member_invitation(uuid, text) to authenticated;
grant execute on function public.get_member_invitation_preview(text) to anon, authenticated;
grant execute on function public.bind_line_identity_from_invitation(text, text, text, text, text) to authenticated;
grant execute on function public.complete_member_invitation(text, text, text, text, date) to authenticated;
grant execute on function public.list_club_members(uuid, text, text) to authenticated;
grant execute on function public.list_member_invitations(uuid) to authenticated;
grant execute on function public.update_member_profile(uuid, uuid, text, text, text, date) to authenticated;
grant execute on function public.set_membership_status(uuid, uuid, text, text) to authenticated;
grant execute on function public.assign_club_role(uuid, uuid, text) to authenticated;
grant execute on function public.record_login_and_device(text, text, text, text, inet) to authenticated;
grant execute on function public.get_my_identity_center() to authenticated;
grant execute on function public.update_my_settings(jsonb, jsonb) to authenticated;
grant execute on function public.revoke_my_device(uuid) to authenticated;
grant execute on function public.unbind_line_identity(uuid, uuid, text, boolean) to authenticated;
grant execute on function public.configure_line_oa(uuid, text, text, text, text) to authenticated;
grant execute on function public.pair_line_oa_follower(uuid, text, uuid) to authenticated;
grant execute on function public.unpair_line_oa_follower(uuid, uuid, text) to authenticated;
grant execute on function public.get_identity_dashboard(uuid) to authenticated;
grant execute on function public.get_line_oa_admin(uuid) to authenticated;
grant execute on function public.record_line_push(uuid, text, integer, jsonb, text, text, text) to authenticated;
grant execute on function public.list_club_audit(uuid, integer) to authenticated;

commit;
