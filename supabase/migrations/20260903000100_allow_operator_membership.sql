begin;

-- Rotary practice allows dual membership, and it allows a member of one club to
-- serve as another club's executive secretary. The platform refused both: four
-- provisioning paths rejected an operator who held any active membership
-- anywhere, so the rule was wider than "not in the club you operate".
--
-- Each function below is the previous declaration with only that check removed;
-- nothing else about operator provisioning changes. list_my_directory_clubs
-- already unions membership and operator clubs, so holding both roles in one
-- club still yields a single directory entry.

comment on table public.club_memberships is
  'Rotary club membership. A person may hold active memberships in more than one club, and may also be an executive secretary; operator authority still comes from club_operator_permissions, never from a membership row.';

-- The RPC checks above only produced a friendlier error; these two triggers are
-- what actually enforced the rule, in both directions. Dropped together so the
-- guard cannot survive in one direction and reject what the other now allows.
drop trigger if exists club_memberships_prevent_operator_overlap on public.club_memberships;
drop trigger if exists club_operator_permissions_prevent_member_overlap on public.club_operator_permissions;
drop function if exists public.prevent_member_operator_overlap();
drop function if exists public.prevent_operator_member_overlap();

create or replace function public.provision_operator_account(
  p_invite_id uuid,
  p_target_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  auth_id uuid := p_target_auth_user_id;
  auth_email text;
  target_invite public.club_operator_invites;
  target_person public.people;
  target_account public.app_accounts;
  new_permission public.club_operator_permissions;
begin
  if actor_id is null or auth_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select invite.* into target_invite
  from public.club_operator_invites as invite
  where invite.id = p_invite_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'matching_invitation_not_found';
  end if;
  if not public.current_can_manage_club(target_invite.club_id) then
    raise exception using errcode = '42501', message = 'club_manager_required';
  end if;

  select lower(btrim(coalesce(user_record.email, ''))) into auth_email
  from auth.users as user_record where user_record.id = auth_id;
  if auth_email = '' or auth_email <> target_invite.email_normalized then
    raise exception using errcode = '42501', message = 'target_account_email_mismatch';
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
  if target_invite.invite_status not in ('pending', 'sent') then
    raise exception using errcode = '22023', message = 'invitation_not_claimable';
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


  insert into public.club_operator_permissions (
    club_id, app_account_id, permission_level, granted_by_app_account_id
  ) values (
    target_invite.club_id, target_account.id, target_invite.permission_level, target_invite.invited_by_app_account_id
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
  values (target_invite.club_id, actor_id, 'operator_invite.provisioned_with_password', 'club_operator_permission',
    new_permission.id, jsonb_build_object('invite_id', target_invite.id));

  return jsonb_build_object('club_id', target_invite.club_id, 'invite_id', target_invite.id,
    'permission_id', new_permission.id, 'idempotent', false);
end;
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

create or replace function public.resolve_my_experience_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  result jsonb;
begin
  if public.current_app_account_id() is null then
    raise exception using errcode = '42501', message = 'experience_context_access_denied';
  end if;

  with caller as (
    select account.id as app_account_id, account.person_id
    from public.app_accounts as account
    where account.id = public.current_app_account_id()
  ),
  member_clubs as (
    select
      club.id as club_id,
      club.club_code,
      club.club_name,
      (
        exists (
          select 1
          from public.club_role_assignments as assignment
          where assignment.club_id = club.id
            and assignment.app_account_id = caller.app_account_id
            and assignment.assignment_status = 'active'
            and assignment.role_key in ('president', 'secretary', 'finance')
        )
        -- An executive secretary who is also a member of the club they operate
        -- was impossible until the overlap rule was dropped. Without this the
        -- club would land in member_clubs with can_manage false and be excluded
        -- from managed_only_clubs, silently costing them their management shell.
        or exists (
          select 1
          from public.club_operator_permissions as operator_permission
          where operator_permission.club_id = club.id
            and operator_permission.app_account_id = caller.app_account_id
            and operator_permission.assignment_status = 'active'
            and operator_permission.permission_level = 'club_manager'
            and operator_permission.starts_at <= pg_catalog.now()
            and (operator_permission.ends_at is null or operator_permission.ends_at > pg_catalog.now())
        )
      ) as can_manage
    from caller
    join public.club_memberships as membership
      on membership.person_id = caller.person_id
     and membership.membership_status = 'active'
    join public.clubs as club
      on club.id = membership.club_id
     and club.club_status = 'active'
    order by club.club_name, club.id
    limit 100
  ),
  managed_clubs as (
    select
      club.id as club_id,
      club.club_code,
      club.club_name
    from caller
    join public.clubs as club
      on club.club_status in ('provisioning', 'active')
    where exists (
      select 1
      from public.club_operator_permissions as operator_permission
      where operator_permission.club_id = club.id
        and operator_permission.app_account_id = caller.app_account_id
        and operator_permission.assignment_status = 'active'
        and operator_permission.permission_level = 'club_manager'
        and operator_permission.starts_at <= pg_catalog.now()
        and (operator_permission.ends_at is null or operator_permission.ends_at > pg_catalog.now())
    )
    or exists (
      select 1
      from public.club_role_assignments as assignment
      join public.club_memberships as membership
        on membership.club_id = assignment.club_id
       and membership.person_id = caller.person_id
       and membership.membership_status = 'active'
      where assignment.club_id = club.id
        and assignment.app_account_id = caller.app_account_id
        and assignment.assignment_status = 'active'
        and assignment.role_key in ('president', 'secretary', 'finance')
    )
    order by club.club_name, club.id
    limit 100
  ),
  managed_only_clubs as (
    select managed.club_id, managed.club_code, managed.club_name
    from managed_clubs as managed
    where not exists (
      select 1 from member_clubs as member
      where member.club_id = managed.club_id
    )
    order by managed.club_name, managed.club_id
    limit 100
  ),
  flags as (
    select
      exists (select 1 from member_clubs) as has_active_membership,
      exists (select 1 from managed_clubs) as can_manage,
      public.current_has_platform_role(array['superadmin', 'platform_admin']) as has_platform_access
  ),
  projection as (
    select
      flags.has_active_membership,
      flags.can_manage,
      flags.has_platform_access,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'club_id', member.club_id,
            'club_code', member.club_code,
            'club_name', member.club_name,
            'can_manage', member.can_manage
          ) order by member.club_name, member.club_id
        )
        from member_clubs as member
      ), '[]'::jsonb) as member_clubs,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'club_id', managed.club_id,
            'club_code', managed.club_code,
            'club_name', managed.club_name,
            'can_manage', true
          ) order by managed.club_name, managed.club_id
        )
        from managed_only_clubs as managed
      ), '[]'::jsonb) as managed_only_clubs
    from flags
  )
  select jsonb_build_object(
    'has_active_membership', has_active_membership,
    'can_register', has_active_membership,
    'can_manage', can_manage,
    'has_platform_access', has_platform_access,
    'member_clubs', member_clubs,
    'managed_only_clubs', managed_only_clubs,
    'default_mode', case
      when has_active_membership then 'member'
      when can_manage then 'management'
      when has_platform_access then 'platform'
      else null
    end,
    'available_modes', to_jsonb(array_remove(array[
      case when has_active_membership then 'member'::text end,
      case when can_manage then 'management'::text end,
      case when has_platform_access then 'platform'::text end
    ], null))
  ) into result
  from projection;

  if result is null or result ->> 'default_mode' is null then
    raise exception using errcode = '42501', message = 'experience_context_access_denied';
  end if;

  return result;
end;
$$;

commit;
