begin;

create unique index people_primary_email_case_insensitive
  on public.people (lower(btrim(primary_email)))
  where primary_email is not null;

create or replace function public.current_app_account_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select account.id
  from public.app_accounts as account
  where account.auth_user_id = auth.uid()
    and account.account_status = 'active'
$$;

create or replace function public.current_has_platform_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.platform_roles as role_assignment
    join public.app_accounts as account
      on account.id = role_assignment.app_account_id
    where account.auth_user_id = auth.uid()
      and account.account_status = 'active'
      and role_assignment.revoked_at is null
      and role_assignment.role_key = any(required_roles)
  )
$$;

create or replace function public.current_can_manage_club(target_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.current_has_platform_role(array['superadmin', 'platform_admin'])
    or exists (
      select 1
      from public.club_operator_permissions as permission
      join public.app_accounts as account
        on account.id = permission.app_account_id
      where account.auth_user_id = auth.uid()
        and account.account_status = 'active'
        and permission.club_id = target_club_id
        and permission.assignment_status = 'active'
        and permission.permission_level = 'club_manager'
        and permission.starts_at <= now()
        and (permission.ends_at is null or permission.ends_at > now())
    )
$$;

create or replace function public.resolve_current_app_account()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'id', account.id,
    'person_id', account.person_id,
    'display_name', account.account_display_name,
    'email', account.login_email,
    'status', account.account_status,
    'platform_roles', coalesce((
      select jsonb_agg(role_assignment.role_key order by role_assignment.role_key)
      from public.platform_roles as role_assignment
      where role_assignment.app_account_id = account.id
        and role_assignment.revoked_at is null
    ), '[]'::jsonb)
  )
  into result
  from public.app_accounts as account
  where account.auth_user_id = auth.uid();

  return result;
end;
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
  select club.id, club.club_code, club.club_name, club.club_status,
    case
      when public.current_has_platform_role(array['superadmin', 'platform_admin']) then 'platform_admin'
      else permission.permission_level
    end,
    club.created_at
  from public.clubs as club
  left join public.app_accounts as account
    on account.auth_user_id = auth.uid()
  left join public.club_operator_permissions as permission
    on permission.club_id = club.id
   and permission.app_account_id = account.id
   and permission.assignment_status = 'active'
   and permission.starts_at <= now()
   and (permission.ends_at is null or permission.ends_at > now())
  where public.current_has_platform_role(array['superadmin', 'platform_admin'])
     or permission.id is not null
  order by club.club_name, club.id
$$;

create or replace function public.create_club_with_initial_operator_invitation(
  p_club_code text,
  p_club_name text,
  p_operator_email text,
  p_operator_display_name text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid;
  new_club public.clubs;
  new_invite public.club_operator_invites;
begin
  actor_id := public.current_app_account_id();
  if actor_id is null or not public.current_has_platform_role(array['superadmin']) then
    raise exception using errcode = '42501', message = 'platform_superadmin_required';
  end if;

  if btrim(coalesce(p_club_code, '')) = ''
     or btrim(coalesce(p_club_name, '')) = ''
     or btrim(coalesce(p_operator_display_name, '')) = ''
     or btrim(coalesce(p_idempotency_key, '')) = ''
     or p_operator_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception using errcode = '22023', message = 'invalid_club_invitation_input';
  end if;

  if exists (
    select 1 from public.app_accounts as account
    join public.club_memberships as membership on membership.person_id = account.person_id
    where account.login_email_normalized = lower(btrim(p_operator_email))
      and membership.membership_status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'active_member_cannot_be_operator';
  end if;

  select invite.* into new_invite
  from public.club_operator_invites as invite
  where invite.idempotency_key = p_idempotency_key;

  if found then
    select club.* into new_club from public.clubs as club where club.id = new_invite.club_id;
    return jsonb_build_object('club_id', new_club.id, 'invite_id', new_invite.id,
      'club_status', new_club.club_status, 'invite_status', new_invite.invite_status,
      'idempotent', true);
  end if;

  insert into public.clubs (club_code, club_name, created_by_app_account_id)
  values (upper(btrim(p_club_code)), btrim(p_club_name), actor_id)
  returning * into new_club;

  insert into public.club_operator_invites (
    club_id, email, display_name, invite_status, invited_by_app_account_id, idempotency_key
  ) values (
    new_club.id, lower(btrim(p_operator_email)), btrim(p_operator_display_name),
    'pending', actor_id, p_idempotency_key
  ) returning * into new_invite;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (new_club.id, actor_id, 'club.created', 'club', new_club.id,
    jsonb_build_object('club_code', new_club.club_code));
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (new_club.id, actor_id, 'operator_invite.created', 'club_operator_invite', new_invite.id,
    jsonb_build_object('email', new_invite.email_normalized, 'initial_operator', true));

  return jsonb_build_object('club_id', new_club.id, 'invite_id', new_invite.id,
    'club_status', new_club.club_status, 'invite_status', new_invite.invite_status,
    'idempotent', false);
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'club_code_or_invitation_already_exists';
end;
$$;

create or replace function public.mark_operator_invitation_sent(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target_club_id uuid;
begin
  select invite.club_id into target_club_id
  from public.club_operator_invites as invite where invite.id = p_invite_id for update;
  if target_club_id is null or not public.current_can_manage_club(target_club_id) then
    raise exception using errcode = '42501', message = 'club_manager_required';
  end if;
  update public.club_operator_invites
  set invite_status = 'sent', sent_at = coalesce(sent_at, now()), failure_reason = null
  where id = p_invite_id and invite_status in ('pending', 'sent');
  if found then
    insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id)
    values (target_club_id, actor_id, 'operator_invite.sent', 'club_operator_invite', p_invite_id);
  end if;
end;
$$;

create or replace function public.list_club_operators_and_invitations(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  result jsonb;
begin
  if not public.current_can_manage_club(p_club_id) then
    raise exception using errcode = '42501', message = 'club_manager_required';
  end if;

  select jsonb_build_object(
    'operators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'permission_id', permission.id,
        'display_name', account.account_display_name,
        'email', account.login_email,
        'permission_level', permission.permission_level,
        'assignment_status', permission.assignment_status,
        'starts_at', permission.starts_at,
        'revoked_at', permission.revoked_at
      ) order by permission.created_at)
      from public.club_operator_permissions as permission
      join public.app_accounts as account on account.id = permission.app_account_id
      where permission.club_id = p_club_id
    ), '[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'invite_id', invite.id,
        'display_name', invite.display_name,
        'email', invite.email_normalized,
        'invite_status', invite.invite_status,
        'expires_at', invite.expires_at,
        'created_at', invite.created_at
      ) order by invite.created_at desc)
      from public.club_operator_invites as invite
      where invite.club_id = p_club_id
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.invite_additional_operator(
  p_club_id uuid,
  p_email text,
  p_display_name text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  existing_invite public.club_operator_invites;
  new_invite public.club_operator_invites;
begin
  if actor_id is null or not public.current_can_manage_club(p_club_id) then
    raise exception using errcode = '42501', message = 'club_manager_required';
  end if;
  if btrim(coalesce(p_display_name, '')) = '' or btrim(coalesce(p_idempotency_key, '')) = ''
     or p_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception using errcode = '22023', message = 'invalid_operator_invitation_input';
  end if;

  select invite.* into existing_invite from public.club_operator_invites as invite
  where invite.idempotency_key = p_idempotency_key;
  if found then
    if existing_invite.club_id <> p_club_id then
      raise exception using errcode = '22023', message = 'idempotency_key_scope_mismatch';
    end if;
    return jsonb_build_object('invite_id', existing_invite.id,
      'invite_status', existing_invite.invite_status, 'idempotent', true);
  end if;

  if exists (
    select 1 from public.app_accounts as account
    join public.club_memberships as membership on membership.person_id = account.person_id
    where account.login_email_normalized = lower(btrim(p_email))
      and membership.membership_status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'active_member_cannot_be_operator';
  end if;

  insert into public.club_operator_invites (
    club_id, email, display_name, invite_status, invited_by_app_account_id, idempotency_key
  ) values (
    p_club_id, lower(btrim(p_email)), btrim(p_display_name), 'pending', actor_id, p_idempotency_key
  ) returning * into new_invite;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'operator_invite.created', 'club_operator_invite', new_invite.id,
    jsonb_build_object('email', new_invite.email_normalized, 'initial_operator', false));
  return jsonb_build_object('invite_id', new_invite.id,
    'invite_status', new_invite.invite_status, 'idempotent', false);
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'active_invitation_already_exists';
end;
$$;

create or replace function public.accept_operator_invitation(p_invite_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  auth_id uuid := auth.uid();
  auth_email text;
  target_invite public.club_operator_invites;
  target_person public.people;
  target_account public.app_accounts;
  new_permission public.club_operator_permissions;
begin
  if auth_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  select lower(btrim(coalesce(user_record.email, ''))) into auth_email
  from auth.users as user_record where user_record.id = auth_id;
  if auth_email = '' then
    raise exception using errcode = '42501', message = 'verified_email_required';
  end if;

  select invite.* into target_invite
  from public.club_operator_invites as invite
  where (p_invite_id is null or invite.id = p_invite_id)
    and invite.email_normalized = auth_email
    and invite.invite_status in ('pending', 'sent', 'accepted')
  order by case when invite.invite_status = 'accepted' then 1 else 0 end, invite.created_at
  limit 1 for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'matching_invitation_not_found';
  end if;

  if target_invite.invite_status = 'accepted' then
    if exists (select 1 from public.app_accounts as account
      where account.id = target_invite.accepted_app_account_id and account.auth_user_id = auth_id) then
      return jsonb_build_object('club_id', target_invite.club_id, 'invite_id', target_invite.id,
        'permission_id', (select permission.id from public.club_operator_permissions as permission
          where permission.club_id = target_invite.club_id
            and permission.app_account_id = target_invite.accepted_app_account_id
            and permission.assignment_status = 'active' limit 1),
        'idempotent', true);
    end if;
    raise exception using errcode = '42501', message = 'invitation_already_claimed';
  end if;
  if target_invite.expires_at <= now() then
    update public.club_operator_invites set invite_status = 'expired' where id = target_invite.id;
    raise exception using errcode = '22023', message = 'invitation_expired';
  end if;

  select account.* into target_account from public.app_accounts as account
  where account.auth_user_id = auth_id or account.login_email_normalized = auth_email
  order by (account.auth_user_id = auth_id) desc limit 1 for update;
  if found and (target_account.auth_user_id <> auth_id or target_account.login_email_normalized <> auth_email) then
    raise exception using errcode = '23505', message = 'email_linked_to_another_auth_user';
  end if;
  if found and exists (
    select 1 from public.app_accounts as email_account
    where email_account.login_email_normalized = auth_email
      and email_account.auth_user_id <> auth_id
  ) then
    raise exception using errcode = '23505', message = 'email_linked_to_another_auth_user';
  end if;
  if not found then
    select person.* into target_person from public.people as person
    where lower(btrim(person.primary_email)) = auth_email limit 1 for update;
    if not found then
      insert into public.people (canonical_name, primary_email)
      values (target_invite.display_name, auth_email) returning * into target_person;
    end if;
    insert into public.app_accounts (
      auth_user_id, person_id, login_email, account_display_name
    ) values (
      auth_id, target_person.id, auth_email, target_invite.display_name
    ) returning * into target_account;
  end if;

  if exists (select 1 from public.club_memberships as membership
    where membership.person_id = target_account.person_id and membership.membership_status = 'active') then
    raise exception using errcode = '23514', message = 'active_member_cannot_be_operator';
  end if;

  insert into public.club_operator_permissions (
    club_id, app_account_id, permission_level, granted_by_app_account_id
  ) values (
    target_invite.club_id, target_account.id, target_invite.permission_level,
    target_invite.invited_by_app_account_id
  )
  on conflict (club_id, app_account_id) where assignment_status = 'active'
  do update set updated_at = now()
  returning * into new_permission;

  update public.club_operator_invites
  set invite_status = 'accepted', accepted_at = now(), accepted_app_account_id = target_account.id
  where id = target_invite.id;
  update public.clubs
  set club_status = 'active', activated_at = coalesce(activated_at, now())
  where id = target_invite.club_id and club_status = 'provisioning';

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (target_invite.club_id, target_account.id, 'operator_invite.accepted',
    'club_operator_permission', new_permission.id, jsonb_build_object('invite_id', target_invite.id));

  return jsonb_build_object('club_id', target_invite.club_id, 'invite_id', target_invite.id,
    'permission_id', new_permission.id, 'idempotent', false);
end;
$$;

create or replace function public.revoke_operator(
  p_club_id uuid,
  p_operator_permission_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target_permission public.club_operator_permissions;
  active_count integer;
  club_is_active boolean;
begin
  if actor_id is null or not public.current_can_manage_club(p_club_id) then
    raise exception using errcode = '42501', message = 'club_manager_required';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception using errcode = '22023', message = 'revoke_reason_required';
  end if;

  select permission.* into target_permission
  from public.club_operator_permissions as permission
  where permission.id = p_operator_permission_id and permission.club_id = p_club_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'operator_not_found'; end if;
  if target_permission.assignment_status <> 'active' then
    return jsonb_build_object('permission_id', target_permission.id, 'idempotent', true);
  end if;

  select count(*), bool_or(club.club_status = 'active') into active_count, club_is_active
  from public.club_operator_permissions as permission
  join public.clubs as club on club.id = permission.club_id
  where permission.club_id = p_club_id and permission.assignment_status = 'active';
  if club_is_active and active_count <= 1
     and not public.current_has_platform_role(array['superadmin', 'platform_admin']) then
    raise exception using errcode = '23514', message = 'cannot_revoke_last_active_operator';
  end if;

  update public.club_operator_permissions
  set assignment_status = 'revoked',
      revoked_at = pg_catalog.clock_timestamp(),
      ends_at = coalesce(ends_at, greatest(pg_catalog.clock_timestamp(), starts_at + interval '1 microsecond')),
      revoked_by_app_account_id = actor_id, revoke_reason = btrim(p_reason)
  where id = target_permission.id;
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'operator.revoked', 'club_operator_permission', target_permission.id,
    jsonb_build_object('reason', btrim(p_reason)));
  return jsonb_build_object('permission_id', target_permission.id, 'idempotent', false);
end;
$$;

create or replace function public.get_club_provisioning_status(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  auth_email text;
  result jsonb;
begin
  select lower(btrim(coalesce(user_record.email, ''))) into auth_email
  from auth.users as user_record where user_record.id = auth.uid();
  if not public.current_can_manage_club(p_club_id) and not exists (
    select 1 from public.club_operator_invites as invite
    where invite.club_id = p_club_id and invite.email_normalized = auth_email
      and invite.invite_status in ('pending', 'sent') and invite.expires_at > now()
  ) then
    raise exception using errcode = '42501', message = 'club_access_required';
  end if;
  select jsonb_build_object(
    'club_id', club.id, 'club_code', club.club_code, 'club_name', club.club_name,
    'club_status', club.club_status, 'activated_at', club.activated_at,
    'active_operator_count', (select count(*) from public.club_operator_permissions as permission
      where permission.club_id = club.id and permission.assignment_status = 'active'),
    'pending_invitation_count', (select count(*) from public.club_operator_invites as invite
      where invite.club_id = club.id and invite.invite_status in ('pending', 'sent'))
  ) into result from public.clubs as club where club.id = p_club_id;
  if result is null then raise exception using errcode = 'P0002', message = 'club_not_found'; end if;
  return result;
end;
$$;

revoke all on function public.current_app_account_id() from public, anon, authenticated;
revoke all on function public.current_has_platform_role(text[]) from public, anon, authenticated;
revoke all on function public.current_can_manage_club(uuid) from public, anon, authenticated;
revoke all on function public.resolve_current_app_account() from public, anon;
revoke all on function public.list_manageable_clubs() from public, anon;
revoke all on function public.create_club_with_initial_operator_invitation(text, text, text, text, text) from public, anon;
revoke all on function public.mark_operator_invitation_sent(uuid) from public, anon;
revoke all on function public.list_club_operators_and_invitations(uuid) from public, anon;
revoke all on function public.invite_additional_operator(uuid, text, text, text) from public, anon;
revoke all on function public.accept_operator_invitation(uuid) from public, anon;
revoke all on function public.revoke_operator(uuid, uuid, text) from public, anon;
revoke all on function public.get_club_provisioning_status(uuid) from public, anon;

grant execute on function public.resolve_current_app_account() to authenticated;
grant execute on function public.list_manageable_clubs() to authenticated;
grant execute on function public.create_club_with_initial_operator_invitation(text, text, text, text, text) to authenticated;
grant execute on function public.mark_operator_invitation_sent(uuid) to authenticated;
grant execute on function public.list_club_operators_and_invitations(uuid) to authenticated;
grant execute on function public.invite_additional_operator(uuid, text, text, text) to authenticated;
grant execute on function public.accept_operator_invitation(uuid) to authenticated;
grant execute on function public.revoke_operator(uuid, uuid, text) to authenticated;
grant execute on function public.get_club_provisioning_status(uuid) to authenticated;

-- The local bootstrap and trusted server boundary use service_role. Client roles
-- remain table-less and must use the RPC grants above.
grant select, insert, update on table public.people to service_role;
grant select, insert, update on table public.app_accounts to service_role;
grant select, insert, update on table public.platform_roles to service_role;
grant select, insert, update on table public.clubs to service_role;
grant select, insert, update on table public.club_memberships to service_role;
grant select, insert, update on table public.club_operator_permissions to service_role;
grant select, insert, update on table public.club_operator_invites to service_role;
grant select, insert on table public.audit_logs to service_role;
grant usage, select on sequence public.audit_logs_id_seq to service_role;

commit;
