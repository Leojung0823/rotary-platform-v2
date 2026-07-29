begin;

create or replace function public.current_has_active_club_membership(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.app_accounts as account
    join public.club_memberships as membership
      on membership.person_id = account.person_id
    join public.clubs as club
      on club.id = membership.club_id
    where account.auth_user_id = auth.uid()
      and account.account_status = 'active'
      and membership.club_id = p_club_id
      and membership.membership_status = 'active'
      and club.club_status = 'active'
  )
$$;

create or replace function public.list_my_directory_clubs()
returns table (club_id uuid, club_code text, club_name text)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select club.id, club.club_code, club.club_name
  from public.app_accounts as account
  join public.club_memberships as membership
    on membership.person_id = account.person_id
   and membership.membership_status = 'active'
  join public.clubs as club
    on club.id = membership.club_id
   and club.club_status = 'active'
  where account.auth_user_id = auth.uid()
    and account.account_status = 'active'
  order by club.club_name, club.id
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
  where public.current_has_active_club_membership(p_club_id)
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

create or replace function public.get_club_member_directory_profile(
  p_club_id uuid,
  p_membership_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select jsonb_build_object(
    'membership_id', directory.membership_id,
    'display_name', directory.display_name,
    'avatar_url', directory.avatar_url,
    'role_key', directory.role_key,
    'email', directory.email,
    'phone', directory.phone,
    'birth_year', directory.birth_year,
    'is_self', directory.is_self
  )
  from public.list_club_member_directory(p_club_id, null) as directory
  where directory.membership_id = p_membership_id
$$;

create or replace function public.update_my_profile(
  p_name text,
  p_phone text,
  p_email text,
  p_birth_date date
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor public.app_accounts;
  normalized_name text := btrim(coalesce(p_name, ''));
  normalized_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
  normalized_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  select account.* into actor
  from public.app_accounts as account
  where account.auth_user_id = auth.uid()
    and account.account_status = 'active'
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'active_account_required';
  end if;

  if normalized_name = '' or char_length(normalized_name) > 160
     or (normalized_phone is null and normalized_email is null)
     or (normalized_phone is not null and char_length(normalized_phone) > 40)
     or (normalized_email is not null and (
       char_length(normalized_email) > 320
       or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     )) then
    raise exception using errcode = '22023', message = 'invalid_self_profile_input';
  end if;

  update public.people
  set canonical_name = normalized_name,
      primary_phone = normalized_phone,
      primary_email = normalized_email,
      birth_date = p_birth_date
  where id = actor.person_id;

  update public.app_accounts
  set account_display_name = normalized_name
  where id = actor.id;

  insert into public.audit_logs (
    club_id,
    actor_app_account_id,
    action_key,
    subject_type,
    subject_id,
    metadata
  ) values (
    null,
    actor.id,
    'member.self_profile_updated',
    'person',
    actor.person_id,
    jsonb_build_object(
      'has_phone', normalized_phone is not null,
      'has_email', normalized_email is not null,
      'has_birth_date', p_birth_date is not null
    )
  );

  return jsonb_build_object(
    'display_name', normalized_name,
    'phone', normalized_phone,
    'email', normalized_email,
    'birth_date', p_birth_date
  );
end;
$$;

revoke all on function public.current_has_active_club_membership(uuid) from public, anon, authenticated;
revoke all on function public.list_my_directory_clubs() from public, anon, authenticated;
revoke all on function public.list_club_member_directory(uuid, text) from public, anon, authenticated;
revoke all on function public.get_club_member_directory_profile(uuid, uuid) from public, anon, authenticated;
revoke all on function public.update_my_profile(text, text, text, date) from public, anon, authenticated;

grant execute on function public.list_my_directory_clubs() to authenticated;
grant execute on function public.list_club_member_directory(uuid, text) to authenticated;
grant execute on function public.get_club_member_directory_profile(uuid, uuid) to authenticated;
grant execute on function public.update_my_profile(text, text, text, date) to authenticated;

commit;
