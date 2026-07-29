begin;

create or replace function public.account_has_active_access(p_app_account_id uuid)
returns boolean
language sql
volatile
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
volatile
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.account_has_active_access(public.current_app_account_id())
$$;

create or replace function public.get_member_account_lifecycle_admin(
  p_club_id uuid,
  p_membership_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if public.current_app_account_id() is null
     or not public.current_has_club_permission(p_club_id, 'identity.read') then
    raise exception using errcode = '42501', message = 'identity_read_required';
  end if;

  return public.get_member_account_lifecycle(p_club_id, p_membership_id);
end;
$$;

create or replace function public.prevent_last_active_superadmin_account_deactivation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.account_status = 'active'
     and new.account_status <> 'active'
     and exists (
       select 1
       from public.platform_roles as role_assignment
       where role_assignment.app_account_id = old.id
         and role_assignment.role_key = 'superadmin'
         and role_assignment.revoked_at is null
     )
     and not exists (
       select 1
       from public.platform_roles as role_assignment
       join public.app_accounts as account on account.id = role_assignment.app_account_id
       where role_assignment.role_key = 'superadmin'
         and role_assignment.revoked_at is null
         and role_assignment.app_account_id <> old.id
         and account.account_status = 'active'
     ) then
    raise exception using errcode = '23514', message = 'last_active_superadmin_account_required';
  end if;

  return new;
end;
$$;

drop trigger if exists app_accounts_prevent_last_superadmin_deactivation on public.app_accounts;
create trigger app_accounts_prevent_last_superadmin_deactivation
before update of account_status on public.app_accounts
for each row execute function public.prevent_last_active_superadmin_account_deactivation();

create or replace function public.randomize_line_rebind_idempotency_key()
returns trigger
language plpgsql
set search_path = pg_catalog, public, extensions
as $$
begin
  if new.invitation_kind = 'line_rebind' then
    new.idempotency_key := 'rebind-' || encode(extensions.gen_random_bytes(16), 'hex');
  end if;
  return new;
end;
$$;

drop trigger if exists member_invitations_randomize_rebind_idempotency on public.member_invitations;
create trigger member_invitations_randomize_rebind_idempotency
before insert on public.member_invitations
for each row execute function public.randomize_line_rebind_idempotency_key();

revoke all on function public.get_member_account_lifecycle(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.get_member_account_lifecycle_admin(uuid, uuid)
  from public, anon;
revoke all on function public.account_has_active_access(uuid)
  from public, anon, authenticated;
revoke all on function public.current_account_has_active_access()
  from public, anon;

grant execute on function public.get_member_account_lifecycle_admin(uuid, uuid)
  to authenticated;
grant execute on function public.account_has_active_access(uuid)
  to service_role;
grant execute on function public.current_account_has_active_access()
  to authenticated;

commit;
