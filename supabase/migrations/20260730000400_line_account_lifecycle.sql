begin;

alter table public.line_oauth_states
  add column flow_kind text,
  add column initiating_auth_user_id uuid references auth.users(id) on delete cascade;

update public.line_oauth_states
set flow_kind = case
  when invitation_token_hash is not null then 'invitation'
  else 'login'
end
where flow_kind is null;

alter table public.line_oauth_states
  alter column flow_kind set default 'login',
  alter column flow_kind set not null;

alter table public.line_oauth_states
  add constraint line_oauth_states_flow_kind_check
  check (
    (flow_kind = 'login' and invitation_token_hash is null and initiating_auth_user_id is null)
    or (flow_kind = 'invitation' and invitation_token_hash is not null and initiating_auth_user_id is null)
    or (flow_kind = 'bind' and invitation_token_hash is null and initiating_auth_user_id is not null)
  );

create or replace function public.account_has_active_access(p_app_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.app_accounts as account
    where account.id = p_app_account_id
      and account.account_status = 'active'
      and (
        exists (
          select 1
          from public.platform_roles as platform_role
          where platform_role.app_account_id = account.id
            and platform_role.revoked_at is null
        )
        or exists (
          select 1
          from public.club_operator_permissions as operator_permission
          join public.clubs as club on club.id = operator_permission.club_id
          where operator_permission.app_account_id = account.id
            and operator_permission.assignment_status = 'active'
            and operator_permission.starts_at <= now()
            and (operator_permission.ends_at is null or operator_permission.ends_at > now())
            and club.club_status in ('provisioning', 'active')
        )
        or exists (
          select 1
          from public.club_memberships as membership
          join public.clubs as club on club.id = membership.club_id
          where membership.person_id = account.person_id
            and membership.membership_status = 'active'
            and club.club_status = 'active'
        )
      )
  )
$$;

create or replace function public.current_account_has_active_access()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.account_has_active_access(public.current_app_account_id())
$$;

create or replace function public.set_membership_status(
  p_club_id uuid,
  p_membership_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target_membership public.club_memberships;
  target_account public.app_accounts;
  previous_status text;
  revoked_sessions integer := 0;
begin
  if actor_id is null
     or not public.current_has_club_permission(p_club_id, 'member.manage')
     or p_status not in ('active', 'suspended', 'disabled') then
    raise exception using errcode = '42501', message = 'member_manage_required';
  end if;

  select membership.* into target_membership
  from public.club_memberships as membership
  where membership.id = p_membership_id
    and membership.club_id = p_club_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'membership_not_found';
  end if;

  previous_status := target_membership.membership_status;

  select account.* into target_account
  from public.app_accounts as account
  where account.person_id = target_membership.person_id
  for update;

  if target_account.id = actor_id
     and p_status <> 'active'
     and not public.current_has_platform_role(array['superadmin', 'platform_admin']) then
    raise exception using errcode = '42501', message = 'self_membership_suspend_requires_platform_admin';
  end if;

  update public.club_memberships
  set membership_status = p_status,
      ended_on = case when p_status = 'disabled' then current_date else null end
  where id = target_membership.id;

  if target_account.id is not null
     and p_status <> 'active'
     and not public.account_has_active_access(target_account.id) then
    delete from auth.sessions
    where user_id = target_account.auth_user_id;
    get diagnostics revoked_sessions = row_count;

    update public.user_devices
    set revoked_at = coalesce(revoked_at, now()),
        trusted = false,
        updated_at = now()
    where app_account_id = target_account.id
      and revoked_at is null;
  end if;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'membership.status_changed', 'club_membership', target_membership.id,
    jsonb_build_object(
      'previous_status', previous_status,
      'status', p_status,
      'reason', btrim(coalesce(p_reason, '')),
      'sessions_revoked', revoked_sessions
    )
  );
end;
$$;

create or replace function public.set_member_account_status(
  p_club_id uuid,
  p_app_account_id uuid,
  p_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target_account public.app_accounts;
  target_membership public.club_memberships;
  previous_status text;
  shared_identity boolean := false;
  has_platform_role boolean := false;
  revoked_sessions integer := 0;
begin
  if actor_id is null
     or not public.current_has_club_permission(p_club_id, 'member.manage')
     or p_status not in ('active', 'suspended', 'disabled') then
    raise exception using errcode = '42501', message = 'member_manage_required';
  end if;

  select account.* into target_account
  from public.app_accounts as account
  where account.id = p_app_account_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'account_not_found';
  end if;

  select membership.* into target_membership
  from public.club_memberships as membership
  where membership.club_id = p_club_id
    and membership.person_id = target_account.person_id
    and membership.membership_status in ('invited', 'active', 'suspended', 'disabled')
  order by membership.created_at desc
  limit 1;

  if not found then
    raise exception using errcode = '42501', message = 'account_not_in_club';
  end if;

  select exists (
    select 1
    from public.platform_roles as platform_role
    where platform_role.app_account_id = target_account.id
      and platform_role.revoked_at is null
  ) into has_platform_role;

  select has_platform_role
    or exists (
      select 1
      from public.club_memberships as membership
      where membership.person_id = target_account.person_id
        and membership.club_id <> p_club_id
        and membership.membership_status in ('invited', 'active', 'suspended', 'disabled')
    )
    or exists (
      select 1
      from public.club_operator_permissions as operator_permission
      where operator_permission.app_account_id = target_account.id
        and operator_permission.assignment_status = 'active'
        and operator_permission.starts_at <= now()
        and (operator_permission.ends_at is null or operator_permission.ends_at > now())
    )
  into shared_identity;

  if target_account.id = actor_id and p_status <> 'active' then
    raise exception using errcode = '42501', message = 'self_account_status_change_forbidden';
  end if;

  if has_platform_role and not public.current_has_platform_role(array['superadmin']) then
    raise exception using errcode = '42501', message = 'superadmin_required_for_platform_account';
  end if;

  if shared_identity
     and not public.current_has_platform_role(array['superadmin', 'platform_admin']) then
    raise exception using errcode = '42501', message = 'shared_identity_requires_platform_admin';
  end if;

  previous_status := target_account.account_status;

  update public.app_accounts
  set account_status = p_status,
      updated_at = now()
  where id = target_account.id;

  if p_status <> 'active' then
    delete from auth.sessions
    where user_id = target_account.auth_user_id;
    get diagnostics revoked_sessions = row_count;

    update public.user_devices
    set revoked_at = coalesce(revoked_at, now()),
        trusted = false,
        updated_at = now()
    where app_account_id = target_account.id
      and revoked_at is null;
  end if;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'account.status_changed', 'app_account', target_account.id,
    jsonb_build_object(
      'previous_status', previous_status,
      'status', p_status,
      'reason', btrim(coalesce(p_reason, '')),
      'sessions_revoked', revoked_sessions,
      'shared_identity', shared_identity
    )
  );

  return jsonb_build_object(
    'account_id', target_account.id,
    'previous_status', previous_status,
    'account_status', p_status,
    'sessions_revoked', revoked_sessions
  );
end;
$$;

create or replace function public.get_member_account_lifecycle(
  p_club_id uuid,
  p_membership_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target_membership public.club_memberships;
  target_account public.app_accounts;
  active_identity public.line_identities;
  shared_identity boolean := false;
  has_password_login boolean := false;
  result jsonb;
begin
  if actor_id is null
     or not public.current_has_club_permission(p_club_id, 'member.read') then
    raise exception using errcode = '42501', message = 'member_read_required';
  end if;

  select membership.* into target_membership
  from public.club_memberships as membership
  where membership.id = p_membership_id
    and membership.club_id = p_club_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'membership_not_found';
  end if;

  select account.* into target_account
  from public.app_accounts as account
  where account.person_id = target_membership.person_id;

  if not found then
    return jsonb_build_object(
      'has_account', false,
      'membership_status', target_membership.membership_status
    );
  end if;

  select identity.* into active_identity
  from public.line_identities as identity
  where identity.app_account_id = target_account.id
    and identity.identity_status = 'active'
  order by identity.created_at desc
  limit 1;

  select exists (
    select 1
    from auth.users as users
    where users.id = target_account.auth_user_id
      and nullif(users.encrypted_password, '') is not null
      and lower(coalesce(users.email, '')) not like '%@identity.local'
  ) into has_password_login;

  select exists (
    select 1
    from public.platform_roles as platform_role
    where platform_role.app_account_id = target_account.id
      and platform_role.revoked_at is null
  )
  or exists (
    select 1
    from public.club_memberships as membership
    where membership.person_id = target_account.person_id
      and membership.club_id <> p_club_id
      and membership.membership_status in ('invited', 'active', 'suspended', 'disabled')
  )
  or exists (
    select 1
    from public.club_operator_permissions as operator_permission
    where operator_permission.app_account_id = target_account.id
      and operator_permission.assignment_status = 'active'
      and operator_permission.starts_at <= now()
      and (operator_permission.ends_at is null or operator_permission.ends_at > now())
  ) into shared_identity;

  select jsonb_build_object(
    'has_account', true,
    'account_id', target_account.id,
    'account_status', target_account.account_status,
    'membership_status', target_membership.membership_status,
    'has_password_login', has_password_login,
    'line_identity_status', coalesce(active_identity.identity_status, 'unbound'),
    'line_display_name', active_identity.display_name,
    'active_sessions', (
      select count(*) from auth.sessions as session where session.user_id = target_account.auth_user_id
    ),
    'active_devices', (
      select count(*) from public.user_devices as device
      where device.app_account_id = target_account.id and device.revoked_at is null
    ),
    'shared_identity', shared_identity,
    'can_manage_account_status', public.current_has_club_permission(p_club_id, 'member.manage')
      and (not shared_identity or public.current_has_platform_role(array['superadmin', 'platform_admin']))
      and actor_id <> target_account.id,
    'can_unbind_line', public.current_has_club_permission(p_club_id, 'identity.unbind')
      and (not shared_identity or public.current_has_platform_role(array['superadmin', 'platform_admin']))
  ) into result;

  return result;
end;
$$;

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
  target_account public.app_accounts;
  membership public.club_memberships;
  raw_token text;
  rebind_invite public.member_invitations;
  revoked_sessions integer := 0;
begin
  if actor_id is null
     or not public.current_has_club_permission(p_club_id, 'identity.unbind') then
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

  select account.* into target_account
  from public.app_accounts as account
  where account.id = target.app_account_id
  for update;

  select member.* into membership
  from public.club_memberships as member
  where member.club_id = p_club_id
    and member.person_id = target.person_id
    and member.membership_status in ('active', 'suspended', 'disabled')
  order by member.created_at desc
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
         and other_membership.membership_status in ('invited', 'active', 'suspended', 'disabled')
     ) then
    raise exception using errcode = '42501', message = 'cross_club_identity_unbind_requires_platform_admin';
  end if;

  update public.line_identities
  set identity_status = 'unbound',
      unbound_at = now(),
      unbound_by_app_account_id = actor_id,
      updated_at = now()
  where id = target.id;

  delete from auth.sessions
  where user_id = target_account.auth_user_id;
  get diagnostics revoked_sessions = row_count;

  update public.user_devices
  set revoked_at = coalesce(revoked_at, now()),
      trusted = false,
      updated_at = now()
  where app_account_id = target_account.id
    and revoked_at is null;

  if p_create_rebind
     and target_account.account_status = 'active'
     and membership.membership_status = 'active'
     and exists (
       select 1 from public.clubs as club
       where club.id = p_club_id and club.club_status = 'active'
     ) then
    update public.member_invitations
    set invitation_status = 'cancelled',
        cancelled_at = now(),
        cancelled_by_app_account_id = actor_id,
        updated_at = now()
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
      'sessions_revoked', revoked_sessions,
      'devices_revoked', true,
      'rebind_created', rebind_invite.id is not null
    )
  );

  return jsonb_build_object(
    'unbound', true,
    'idempotent', false,
    'sessions_revoked', revoked_sessions,
    'rebind_invitation_id', rebind_invite.id,
    'rebind_token', raw_token
  );
end;
$$;

create or replace function public.unbind_my_line_identity_trusted(
  p_auth_user_id uuid,
  p_reason text
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
  revoked_sessions integer := 0;
  has_password_login boolean := false;
begin
  select app.* into account
  from public.app_accounts as app
  where app.auth_user_id = p_auth_user_id
  for update;

  if not found or account.account_status <> 'active' then
    raise exception using errcode = '42501', message = 'active_account_required';
  end if;

  select exists (
    select 1
    from auth.users as users
    where users.id = p_auth_user_id
      and nullif(users.encrypted_password, '') is not null
      and lower(coalesce(users.email, '')) not like '%@identity.local'
  ) into has_password_login;

  if not has_password_login then
    raise exception using errcode = '42501', message = 'password_login_required_before_line_unbind';
  end if;

  select existing.* into identity
  from public.line_identities as existing
  where existing.app_account_id = account.id
    and existing.identity_status = 'active'
  for update;

  if not found then
    return jsonb_build_object('unbound', true, 'idempotent', true);
  end if;

  update public.line_identities
  set identity_status = 'unbound',
      unbound_at = now(),
      unbound_by_app_account_id = account.id,
      updated_at = now()
  where id = identity.id;

  delete from auth.sessions
  where user_id = account.auth_user_id;
  get diagnostics revoked_sessions = row_count;

  update public.user_devices
  set revoked_at = coalesce(revoked_at, now()),
      trusted = false,
      updated_at = now()
  where app_account_id = account.id
    and revoked_at is null;

  select membership.club_id into audit_club_id
  from public.club_memberships as membership
  where membership.person_id = account.person_id
    and membership.membership_status = 'active'
  order by membership.created_at
  limit 1;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    audit_club_id, account.id, 'line_identity.self_unbound', 'line_identity', identity.id,
    jsonb_build_object(
      'reason', btrim(coalesce(p_reason, '')),
      'password_reauthenticated', true,
      'sessions_revoked', revoked_sessions,
      'devices_revoked', true
    )
  );

  return jsonb_build_object(
    'unbound', true,
    'idempotent', false,
    'sessions_revoked', revoked_sessions
  );
end;
$$;

create or replace function public.get_my_identity_center()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  account_id uuid := public.current_app_account_id();
  current_session_id uuid;
  result jsonb;
begin
  if account_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  begin
    current_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  exception when invalid_text_representation then
    current_session_id := null;
  end;

  select jsonb_build_object(
    'account', jsonb_build_object(
      'status', account.account_status,
      'has_active_access', public.account_has_active_access(account.id),
      'has_password_login', exists (
        select 1
        from auth.users as users
        where users.id = account.auth_user_id
          and nullif(users.encrypted_password, '') is not null
          and lower(coalesce(users.email, '')) not like '%@identity.local'
      )
    ),
    'profile', jsonb_build_object(
      'display_name', person.canonical_name,
      'phone', person.primary_phone,
      'email', person.primary_email,
      'birth_date', person.birth_date,
      'avatar_url', person.avatar_url,
      'profile_completed_at', person.profile_completed_at
    ),
    'line_identity', (
      select jsonb_build_object(
        'id', identity.id,
        'status', identity.identity_status,
        'display_name', identity.display_name,
        'picture_url', identity.picture_url,
        'bound_at', identity.bound_at,
        'last_login_at', identity.last_login_at
      )
      from public.line_identities as identity
      where identity.app_account_id = account_id
        and identity.identity_status = 'active'
      order by identity.created_at desc
      limit 1
    ),
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', device.id,
        'name', device.device_name,
        'trusted', device.trusted,
        'last_seen_at', device.last_seen_at,
        'revoked_at', device.revoked_at,
        'is_current', current_session_id is not null and device.session_id = current_session_id
      ) order by device.last_seen_at desc)
      from public.user_devices as device
      where device.app_account_id = account_id
    ), '[]'::jsonb),
    'login_history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider', history.provider_key,
        'outcome', history.outcome,
        'created_at', history.created_at,
        'user_agent', history.user_agent
      ) order by history.created_at desc)
      from (
        select * from public.login_history
        where app_account_id = account_id
        order by created_at desc
        limit 20
      ) as history
    ), '[]'::jsonb),
    'notification_settings', (
      select to_jsonb(settings) - 'app_account_id'
      from public.notification_settings as settings
      where settings.app_account_id = account_id
    ),
    'privacy_settings', (
      select to_jsonb(settings) - 'app_account_id'
      from public.privacy_settings as settings
      where settings.app_account_id = account_id
    )
  ) into result
  from public.app_accounts as account
  join public.people as person on person.id = account.person_id
  where account.id = account_id;

  return result;
end;
$$;

revoke all on function public.revoke_my_device(uuid) from public, anon, authenticated;
drop function public.revoke_my_device(uuid);

create function public.revoke_my_device(p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  account_id uuid := public.current_app_account_id();
  target_device public.user_devices;
  current_session_id uuid;
  is_current boolean := false;
begin
  if account_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  begin
    current_session_id := nullif(auth.jwt()->>'session_id', '')::uuid;
  exception when invalid_text_representation then
    current_session_id := null;
  end;

  select device.* into target_device
  from public.user_devices as device
  where device.id = p_device_id
    and device.app_account_id = account_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'device_not_found';
  end if;

  is_current := current_session_id is not null and target_device.session_id = current_session_id;

  if target_device.revoked_at is not null then
    return jsonb_build_object('revoked', true, 'idempotent', true, 'is_current', is_current);
  end if;

  update public.user_devices
  set revoked_at = now(),
      trusted = false,
      updated_at = now()
  where id = target_device.id;

  if target_device.session_id is not null then
    delete from auth.sessions
    where id = target_device.session_id
      and user_id = auth.uid();
  end if;

  insert into public.audit_logs (
    actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    account_id, 'device.revoked', 'user_device', target_device.id,
    jsonb_build_object('current_device', is_current)
  );

  return jsonb_build_object('revoked', true, 'idempotent', false, 'is_current', is_current);
end;
$$;

revoke all on function public.account_has_active_access(uuid) from public, anon, authenticated;
revoke all on function public.current_account_has_active_access() from public, anon;
revoke all on function public.set_member_account_status(uuid, uuid, text, text) from public, anon;
revoke all on function public.get_member_account_lifecycle(uuid, uuid) from public, anon;
revoke all on function public.bind_line_identity_to_existing_account_trusted(uuid, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.bind_line_identity_from_invitation_trusted(text, uuid, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.unbind_my_line_identity_trusted(uuid, text)
  from public, anon, authenticated;
revoke all on function public.revoke_my_device(uuid) from public, anon;

grant execute on function public.current_account_has_active_access() to authenticated;
grant execute on function public.set_member_account_status(uuid, uuid, text, text) to authenticated;
grant execute on function public.get_member_account_lifecycle(uuid, uuid) to authenticated;
grant execute on function public.bind_line_identity_to_existing_account_trusted(uuid, text, text, text, text)
  to service_role;
grant execute on function public.bind_line_identity_from_invitation_trusted(text, uuid, text, text, text, text)
  to service_role;
grant execute on function public.unbind_my_line_identity_trusted(uuid, text)
  to service_role;
grant execute on function public.revoke_my_device(uuid) to authenticated;

commit;
