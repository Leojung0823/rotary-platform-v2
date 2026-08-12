begin;

-- Executive secretaries (club_operator_permissions) are never also a
-- club_memberships row for the club they operate — active_member_cannot_be_operator
-- keeps those exclusive. list_my_directory_clubs/list_club_member_directory
-- were membership-only, so an operator with no membership anywhere saw
-- "no directory available" for a club they otherwise fully manage.

create or replace function public.list_my_directory_clubs()
returns table (club_id uuid, club_code text, club_name text)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select club.id as club_id, club.club_code, club.club_name
  from public.app_accounts as account
  join public.club_memberships as membership
    on membership.person_id = account.person_id
   and membership.membership_status = 'active'
  join public.clubs as club
    on club.id = membership.club_id
   and club.club_status = 'active'
  where account.auth_user_id = auth.uid()
    and account.account_status = 'active'
  union
  select club.id as club_id, club.club_code, club.club_name
  from public.app_accounts as account
  join public.club_operator_permissions as permission
    on permission.app_account_id = account.id
   and permission.assignment_status = 'active'
   and permission.permission_level = 'club_manager'
   and permission.starts_at <= now()
   and (permission.ends_at is null or permission.ends_at > now())
  join public.clubs as club
    on club.id = permission.club_id
   and club.club_status = 'active'
  where account.auth_user_id = auth.uid()
    and account.account_status = 'active'
  order by club_name, club_id
$$;

create or replace function public.list_club_member_directory(
  p_club_id uuid,
  p_query text default null
)
returns table (
  membership_id uuid,
  display_name text,
  avatar_url text,
  role_key text,
  email text,
  phone text,
  birth_year integer,
  is_self boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  with caller as (
    select account.person_id
    from public.app_accounts as account
    where account.auth_user_id = auth.uid()
      and account.account_status = 'active'
  )
  select
    membership.id,
    person.canonical_name,
    person.avatar_url,
    coalesce(role_assignment.role_key, 'member'),
    case
      when person.id = caller.person_id or coalesce(privacy.show_email_to_club, false)
        then person.primary_email
      else null
    end,
    case
      when person.id = caller.person_id or coalesce(privacy.show_phone_to_club, false)
        then person.primary_phone
      else null
    end,
    case
      when person.id = caller.person_id or coalesce(privacy.show_birthday_year, false)
        then extract(year from person.birth_date)::integer
      else null
    end,
    person.id = caller.person_id
  from public.club_memberships as membership
  join public.people as person on person.id = membership.person_id
  cross join caller
  left join public.app_accounts as target_account
    on target_account.person_id = person.id
   and target_account.account_status = 'active'
  left join public.privacy_settings as privacy
    on privacy.app_account_id = target_account.id
  left join lateral (
    select assignment.role_key
    from public.club_role_assignments as assignment
    where assignment.club_id = membership.club_id
      and assignment.app_account_id = target_account.id
      and assignment.assignment_status = 'active'
    order by case assignment.role_key
      when 'president' then 1
      when 'secretary' then 2
      when 'finance' then 3
      else 4
    end
    limit 1
  ) as role_assignment on true
  where (public.current_has_active_club_membership(p_club_id) or public.current_can_manage_club(p_club_id))
    and membership.club_id = p_club_id
    and membership.membership_status = 'active'
    and (
      nullif(btrim(coalesce(p_query, '')), '') is null
      or person.canonical_name ilike '%' || btrim(p_query) || '%'
    )
  order by
    case coalesce(role_assignment.role_key, 'member')
      when 'president' then 1
      when 'secretary' then 2
      when 'finance' then 3
      else 4
    end,
    person.canonical_name,
    membership.id
$$;

commit;
