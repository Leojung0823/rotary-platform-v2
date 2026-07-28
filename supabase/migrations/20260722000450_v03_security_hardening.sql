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
      join public.app_accounts as account
        on account.id = assignment.app_account_id
       and account.account_status = 'active'
      join public.club_memberships as membership
        on membership.club_id = assignment.club_id
       and membership.person_id = account.person_id
       and membership.membership_status = 'active'
      join public.role_permissions as role_permission
        on role_permission.role_key = assignment.role_key
      where account.auth_user_id = auth.uid()
        and assignment.club_id = target_club_id
        and assignment.assignment_status = 'active'
        and role_permission.permission_key = required_permission
    )
    or exists (
      select 1
      from public.club_operator_permissions as permission
      join public.app_accounts as account
        on account.id = permission.app_account_id
      join public.role_permissions as role_permission
        on role_permission.role_key = 'secretary'
      where account.auth_user_id = auth.uid()
        and account.account_status = 'active'
        and permission.club_id = target_club_id
        and permission.assignment_status = 'active'
        and permission.permission_level = 'club_manager'
        and permission.starts_at <= now()
        and (permission.ends_at is null or permission.ends_at > now())
        and role_permission.permission_key = required_permission
    )
$$;

create or replace function public.list_manageable_clubs()
returns table (
  club_id uuid,
  club_code text,
  club_name text,
  club_status text,
  permission_level text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select distinct on (club.id)
    club.id,
    club.club_code,
    club.club_name,
    club.club_status,
    case
      when public.current_has_platform_role(array['superadmin', 'platform_admin']) then 'platform_admin'
      when operator_permission.id is not null then 'club_manager'
      when role_assignment.id is not null then role_assignment.role_key
      else 'member'
    end,
    club.created_at
  from public.clubs as club
  left join public.app_accounts as account
    on account.auth_user_id = auth.uid()
   and account.account_status = 'active'
  left join public.club_operator_permissions as operator_permission
    on operator_permission.club_id = club.id
   and operator_permission.app_account_id = account.id
   and operator_permission.assignment_status = 'active'
   and operator_permission.permission_level = 'club_manager'
   and operator_permission.starts_at <= now()
   and (operator_permission.ends_at is null or operator_permission.ends_at > now())
  left join public.club_memberships as membership
    on membership.club_id = club.id
   and membership.person_id = account.person_id
   and membership.membership_status = 'active'
  left join public.club_role_assignments as role_assignment
    on role_assignment.club_id = club.id
   and role_assignment.app_account_id = account.id
   and role_assignment.assignment_status = 'active'
   and membership.id is not null
  where public.current_has_platform_role(array['superadmin', 'platform_admin'])
     or operator_permission.id is not null
     or membership.id is not null
  order by club.id,
    case
      when operator_permission.id is not null then 0
      when role_assignment.role_key in ('president', 'secretary') then 1
      when role_assignment.id is not null then 2
      else 3
    end,
    club.club_name
$$;

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
    'phone', case when viewer_account.id is not null and active_identity.id is not null then person.primary_phone else null end,
    'email', case when viewer_account.id is not null and active_identity.id is not null then person.primary_email else null end,
    'birth_date', case when viewer_account.id is not null and active_identity.id is not null then person.birth_date else null end
  )
  into result
  from public.member_invitations as invitation
  join public.clubs as club on club.id = invitation.club_id
  join public.people as person on person.id = invitation.person_id
  left join public.app_accounts as viewer_account
    on viewer_account.id = viewer_account_id
   and viewer_account.person_id = invitation.person_id
   and viewer_account.account_status = 'active'
  left join public.line_identities as active_identity
    on active_identity.app_account_id = viewer_account.id
   and active_identity.identity_status = 'active'
  where invitation.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');

  return result;
end;
$$;

create or replace function public.assign_club_role(p_club_id uuid, p_app_account_id uuid, p_role_key text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  assignment_id uuid;
begin
  if actor_id is null
     or not public.current_has_club_permission(p_club_id, 'role.manage')
     or p_role_key not in ('president', 'secretary', 'finance', 'member') then
    raise exception using errcode = '42501', message = 'role_manage_required';
  end if;

  if not exists (
    select 1
    from public.app_accounts as account
    join public.club_memberships as membership
      on membership.person_id = account.person_id
     and membership.club_id = p_club_id
     and membership.membership_status = 'active'
    where account.id = p_app_account_id
      and account.account_status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'active_club_member_required';
  end if;

  update public.club_role_assignments
  set assignment_status = 'revoked',
      revoked_by_app_account_id = actor_id,
      revoked_at = now(),
      revoke_reason = 'role_replaced',
      updated_at = now()
  where club_id = p_club_id
    and app_account_id = p_app_account_id
    and assignment_status = 'active'
    and role_key <> p_role_key;

  insert into public.club_role_assignments (
    club_id, app_account_id, role_key, granted_by_app_account_id
  ) values (
    p_club_id, p_app_account_id, p_role_key, actor_id
  )
  on conflict (club_id, app_account_id, role_key) where assignment_status = 'active'
  do update set updated_at = now()
  returning id into assignment_id;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'role.assigned', 'club_role_assignment', assignment_id,
    jsonb_build_object('role_key', p_role_key)
  );

  return assignment_id;
end;
$$;

create or replace function public.update_member_profile(
  p_club_id uuid,
  p_membership_id uuid,
  p_name text,
  p_phone text,
  p_email text,
  p_birth_date date
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target_person_id uuid;
begin
  if actor_id is null
     or not public.current_has_club_permission(p_club_id, 'member.manage')
     or btrim(coalesce(p_name, '')) = '' then
    raise exception using errcode = '42501', message = 'member_manage_required';
  end if;

  select person_id into target_person_id
  from public.club_memberships
  where id = p_membership_id and club_id = p_club_id;

  if target_person_id is null then
    raise exception using errcode = 'P0002', message = 'membership_not_found';
  end if;

  if not public.current_has_platform_role(array['superadmin', 'platform_admin'])
     and exists (
       select 1
       from public.club_memberships as other_membership
       where other_membership.person_id = target_person_id
         and other_membership.club_id <> p_club_id
         and other_membership.membership_status in ('invited', 'active', 'suspended', 'disabled')
     ) then
    raise exception using errcode = '42501', message = 'shared_identity_requires_platform_admin';
  end if;

  update public.people
  set canonical_name = btrim(p_name),
      primary_phone = nullif(btrim(coalesce(p_phone, '')), ''),
      primary_email = nullif(lower(btrim(coalesce(p_email, ''))), ''),
      birth_date = p_birth_date
  where id = target_person_id;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id
  ) values (
    p_club_id, actor_id, 'member.profile_updated', 'club_membership', p_membership_id
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
begin
  if p_auth_user_id is null or btrim(coalesce(p_provider_subject, '')) = '' then
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
    insert into public.line_identities (
      person_id, app_account_id, provider_subject, display_name, picture_url, email, last_login_at
    ) values (
      target.person_id, account.id, p_provider_subject, p_display_name, p_picture_url, p_email, now()
    )
    returning * into identity;
  end if;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    target.club_id, account.id, 'line_identity.bound', 'line_identity', identity.id,
    jsonb_build_object('invitation_id', target.id, 'trusted_callback', true)
  );

  return jsonb_build_object(
    'account_id', account.id,
    'person_id', target.person_id,
    'line_identity_id', identity.id,
    'club_id', target.club_id,
    'invitation_id', target.id
  );
end;
$$;

create or replace function public.unbind_line_identity(
  p_club_id uuid,
  p_app_account_id uuid,
  p_reason text,
  p_create_rebind boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.line_identities;
  membership public.club_memberships;
  raw_token text;
  rebind_invite public.member_invitations;
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'identity.unbind') then
    raise exception using errcode = '42501', message = 'identity_unbind_required';
  end if;

  select identity.* into target
  from public.line_identities as identity
  where identity.app_account_id = p_app_account_id
    and identity.identity_status = 'active'
  for update;

  if not found then
    return jsonb_build_object('unbound', true, 'idempotent', true, 'rebind_token', null);
  end if;

  select member.* into membership
  from public.club_memberships as member
  where member.club_id = p_club_id
    and member.person_id = target.person_id
    and member.membership_status in ('active', 'suspended', 'disabled')
  limit 1;

  if not found then
    raise exception using errcode = '42501', message = 'account_not_in_club';
  end if;

  if not public.current_has_platform_role(array['superadmin', 'platform_admin'])
     and exists (
       select 1
       from public.club_memberships as other_membership
       where other_membership.person_id = target.person_id
         and other_membership.club_id <> p_club_id
         and other_membership.membership_status in ('active', 'suspended')
     ) then
    raise exception using errcode = '42501', message = 'cross_club_identity_unbind_requires_platform_admin';
  end if;

  update public.line_identities
  set identity_status = 'unbound',
      unbound_at = now(),
      unbound_by_app_account_id = actor_id
  where id = target.id;

  delete from auth.sessions
  where user_id = (
    select auth_user_id from public.app_accounts where id = p_app_account_id
  );

  if p_create_rebind then
    update public.member_invitations
    set invitation_status = 'cancelled',
        cancelled_at = now(),
        cancelled_by_app_account_id = actor_id
    where membership_id = membership.id
      and invitation_status in ('pending', 'sent');

    raw_token := encode(extensions.gen_random_bytes(32), 'hex');
    insert into public.member_invitations (
      club_id, person_id, membership_id, invitation_kind, delivery_method,
      token_hash, token_prefix, invitation_status, invited_by_app_account_id,
      idempotency_key, sent_at
    ) values (
      p_club_id, target.person_id, membership.id, 'line_rebind', 'link',
      encode(extensions.digest(raw_token, 'sha256'), 'hex'), left(raw_token, 8),
      'sent', actor_id,
      'rebind-' || target.id::text || '-' || floor(extract(epoch from clock_timestamp()))::bigint::text,
      now()
    )
    returning * into rebind_invite;

    insert into public.invitation_logs (
      invitation_id, club_id, actor_app_account_id, event_key, delivery_method
    ) values (
      rebind_invite.id, p_club_id, actor_id, 'created', 'link'
    );
  end if;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'line_identity.unbound', 'line_identity', target.id,
    jsonb_build_object(
      'reason', btrim(coalesce(p_reason, '')),
      'sessions_revoked', true,
      'rebind_created', p_create_rebind
    )
  );

  return jsonb_build_object(
    'unbound', true,
    'idempotent', false,
    'rebind_invitation_id', rebind_invite.id,
    'rebind_token', raw_token
  );
end;
$$;

update public.line_oa_accounts as account
set channel_secret_env_key = 'LINE_OA_' || upper(regexp_replace(club.club_code, '[^A-Za-z0-9]', '_', 'g')) || '_CHANNEL_SECRET',
    webhook_secret_env_key = 'LINE_OA_' || upper(regexp_replace(club.club_code, '[^A-Za-z0-9]', '_', 'g')) || '_CHANNEL_SECRET',
    access_token_env_key = 'LINE_OA_' || upper(regexp_replace(club.club_code, '[^A-Za-z0-9]', '_', 'g')) || '_CHANNEL_ACCESS_TOKEN'
from public.clubs as club
where club.id = account.club_id;

create or replace function public.configure_line_oa(
  p_club_id uuid,
  p_display_name text,
  p_basic_id text,
  p_channel_id text,
  p_mode text default 'configured'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  account_id uuid;
  club_code text;
  env_prefix text;
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'oa.manage') then
    raise exception using errcode = '42501', message = 'oa_manage_required';
  end if;

  if btrim(coalesce(p_display_name, '')) = '' or p_mode not in ('configured', 'active', 'disabled') then
    raise exception using errcode = '22023', message = 'invalid_oa_configuration';
  end if;

  select club.club_code into club_code from public.clubs as club where club.id = p_club_id;
  if club_code is null then
    raise exception using errcode = 'P0002', message = 'club_not_found';
  end if;

  env_prefix := 'LINE_OA_' || upper(regexp_replace(club_code, '[^A-Za-z0-9]', '_', 'g'));

  insert into public.line_oa_accounts (
    club_id, display_name, basic_id, channel_id,
    channel_secret_env_key, access_token_env_key, webhook_secret_env_key,
    account_status, created_by_app_account_id
  ) values (
    p_club_id, btrim(p_display_name), nullif(btrim(p_basic_id), ''), nullif(btrim(p_channel_id), ''),
    env_prefix || '_CHANNEL_SECRET', env_prefix || '_CHANNEL_ACCESS_TOKEN', env_prefix || '_CHANNEL_SECRET',
    p_mode, actor_id
  )
  on conflict (club_id) where account_status <> 'disabled'
  do update set
    display_name = excluded.display_name,
    basic_id = excluded.basic_id,
    channel_id = excluded.channel_id,
    account_status = excluded.account_status,
    updated_at = now()
  returning id into account_id;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'line_oa.configured', 'line_oa_account', account_id,
    jsonb_build_object('environment_prefix', env_prefix)
  );

  return account_id;
end;
$$;

revoke all on function public.bind_line_identity_from_invitation_trusted(text, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.bind_line_identity_from_invitation_trusted(text, uuid, text, text, text, text)
  to service_role;

revoke execute on function public.bind_line_identity_from_invitation(text, text, text, text, text)
  from authenticated;

commit;
