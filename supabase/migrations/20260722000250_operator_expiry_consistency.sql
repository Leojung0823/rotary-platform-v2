begin;

create or replace function public.expire_due_operator_permissions(
  p_club_id uuid default null,
  p_app_account_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  expired_permission record;
  expired_count integer := 0;
  actor_id uuid := public.current_app_account_id();
begin
  for expired_permission in
    update public.club_operator_permissions as permission
    set assignment_status = 'expired',
        updated_at = pg_catalog.clock_timestamp()
    where permission.assignment_status = 'active'
      and permission.ends_at is not null
      and permission.ends_at <= pg_catalog.clock_timestamp()
      and (p_club_id is null or permission.club_id = p_club_id)
      and (p_app_account_id is null or permission.app_account_id = p_app_account_id)
    returning permission.id, permission.club_id, permission.ends_at
  loop
    expired_count := expired_count + 1;
    insert into public.audit_logs (
      club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
    ) values (
      expired_permission.club_id,
      actor_id,
      'operator.expired',
      'club_operator_permission',
      expired_permission.id,
      jsonb_build_object('ends_at', expired_permission.ends_at, 'automatic', true)
    );
  end loop;

  return expired_count;
end;
$$;

create or replace function public.prepare_operator_permission_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  perform public.expire_due_operator_permissions(new.club_id, new.app_account_id);

  if new.assignment_status = 'active'
     and new.ends_at is not null
     and new.ends_at <= pg_catalog.clock_timestamp() then
    new.assignment_status := 'expired';
  end if;

  return new;
end;
$$;

drop trigger if exists aa_club_operator_permissions_prepare_insert
  on public.club_operator_permissions;
create trigger aa_club_operator_permissions_prepare_insert
before insert on public.club_operator_permissions
for each row execute function public.prepare_operator_permission_insert();

create or replace function public.prevent_member_operator_overlap()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.membership_status <> 'active' then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.person_id::text, 0)
  );

  if exists (
    select 1
    from public.club_operator_permissions as operator_permission
    join public.app_accounts as account
      on account.id = operator_permission.app_account_id
    where account.person_id = new.person_id
      and operator_permission.assignment_status = 'active'
      and (operator_permission.ends_at is null or operator_permission.ends_at > pg_catalog.clock_timestamp())
  ) then
    raise exception using
      errcode = '23514',
      message = 'A person with an active executive-secretary assignment cannot receive an active Rotary membership.';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_operator_member_overlap()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  target_person_id uuid;
begin
  if new.assignment_status <> 'active'
     or (new.ends_at is not null and new.ends_at <= pg_catalog.clock_timestamp()) then
    return new;
  end if;

  select account.person_id
    into target_person_id
  from public.app_accounts as account
  where account.id = new.app_account_id;

  if target_person_id is null then
    raise exception using
      errcode = '23503',
      message = 'The operator account must be linked to a person.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_person_id::text, 0)
  );

  if exists (
    select 1
    from public.club_memberships as membership
    where membership.person_id = target_person_id
      and membership.membership_status = 'active'
  ) then
    raise exception using
      errcode = '23514',
      message = 'An active Rotary member cannot receive an executive-secretary assignment.';
  end if;

  return new;
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
        'assignment_status', case
          when permission.assignment_status = 'active'
            and permission.ends_at is not null
            and permission.ends_at <= now()
          then 'expired'
          else permission.assignment_status
        end,
        'starts_at', permission.starts_at,
        'ends_at', permission.ends_at,
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
        'invite_status', case
          when invite.invite_status in ('pending', 'sent') and invite.expires_at <= now()
          then 'expired'
          else invite.invite_status
        end,
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
  target_is_effective boolean;
begin
  if actor_id is null or not public.current_can_manage_club(p_club_id) then
    raise exception using errcode = '42501', message = 'club_manager_required';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception using errcode = '22023', message = 'revoke_reason_required';
  end if;

  perform public.expire_due_operator_permissions(p_club_id, null);

  select permission.* into target_permission
  from public.club_operator_permissions as permission
  where permission.id = p_operator_permission_id and permission.club_id = p_club_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'operator_not_found';
  end if;
  if target_permission.assignment_status <> 'active' then
    return jsonb_build_object('permission_id', target_permission.id, 'idempotent', true);
  end if;

  target_is_effective := target_permission.starts_at <= now()
    and (target_permission.ends_at is null or target_permission.ends_at > now());

  select count(*), bool_or(club.club_status = 'active')
    into active_count, club_is_active
  from public.club_operator_permissions as permission
  join public.clubs as club on club.id = permission.club_id
  where permission.club_id = p_club_id
    and permission.assignment_status = 'active'
    and permission.starts_at <= now()
    and (permission.ends_at is null or permission.ends_at > now());

  if club_is_active and target_is_effective and active_count <= 1
     and not public.current_has_platform_role(array['superadmin', 'platform_admin']) then
    raise exception using errcode = '23514', message = 'cannot_revoke_last_active_operator';
  end if;

  update public.club_operator_permissions
  set assignment_status = 'revoked',
      revoked_at = pg_catalog.clock_timestamp(),
      ends_at = coalesce(ends_at, greatest(pg_catalog.clock_timestamp(), starts_at + interval '1 microsecond')),
      revoked_by_app_account_id = actor_id,
      revoke_reason = btrim(p_reason)
  where id = target_permission.id;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    p_club_id, actor_id, 'operator.revoked', 'club_operator_permission', target_permission.id,
    jsonb_build_object('reason', btrim(p_reason))
  );

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
    where invite.club_id = p_club_id
      and invite.email_normalized = auth_email
      and invite.invite_status in ('pending', 'sent')
      and invite.expires_at > now()
  ) then
    raise exception using errcode = '42501', message = 'club_access_required';
  end if;

  select jsonb_build_object(
    'club_id', club.id,
    'club_code', club.club_code,
    'club_name', club.club_name,
    'club_status', club.club_status,
    'activated_at', club.activated_at,
    'active_operator_count', (
      select count(*) from public.club_operator_permissions as permission
      where permission.club_id = club.id
        and permission.assignment_status = 'active'
        and permission.starts_at <= now()
        and (permission.ends_at is null or permission.ends_at > now())
    ),
    'pending_invitation_count', (
      select count(*) from public.club_operator_invites as invite
      where invite.club_id = club.id
        and invite.invite_status in ('pending', 'sent')
        and invite.expires_at > now()
    )
  ) into result
  from public.clubs as club
  where club.id = p_club_id;

  if result is null then
    raise exception using errcode = 'P0002', message = 'club_not_found';
  end if;
  return result;
end;
$$;

revoke all on function public.expire_due_operator_permissions(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.prepare_operator_permission_insert()
  from public, anon, authenticated;

commit;
