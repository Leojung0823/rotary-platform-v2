begin;

-- This projection is intentionally limited to UX and routing hints. Every
-- club-scoped mutation and read continues to authorize its own club_id.
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
      exists (
        select 1
        from public.club_role_assignments as assignment
        where assignment.club_id = club.id
          and assignment.app_account_id = caller.app_account_id
          and assignment.assignment_status = 'active'
          and assignment.role_key in ('president', 'secretary', 'finance')
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

comment on function public.resolve_my_experience_context() is
  'Bounded caller-derived UX routing projection. It is not an authorization source for club-scoped data.';

revoke all on function public.resolve_my_experience_context() from public, anon, authenticated;
grant execute on function public.resolve_my_experience_context() to authenticated;

commit;
