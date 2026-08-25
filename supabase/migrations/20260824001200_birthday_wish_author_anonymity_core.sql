begin;

-- Keep the core birthday-wish projection anonymous for every non-manager,
-- including the member who wrote the wish. The author still receives
-- can_edit/can_delete for their own active wish, but the projection must not
-- expose an author label that can be copied into a member-facing UI.
create or replace function public.get_my_birthday_page_v2(p_club_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  selected_club_id uuid;
  actor_membership_id uuid;
  can_manage boolean := false;
  club_timezone text;
  local_today date;
  local_year integer;
  result jsonb;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'birthday_authentication_required';
  end if;

  if p_club_id is not null and not public.current_can_access_birthday_club(p_club_id) then
    raise exception using errcode = '42501', message = 'birthday_club_access_required';
  end if;

  select coalesce(p_club_id, accessible.club_id)
  into selected_club_id
  from (
    select club.id as club_id, club.club_name
    from public.clubs as club
    where club.club_status = 'active'
      and public.current_can_access_birthday_club(club.id)
    order by club.club_name, club.id
    limit 1
  ) as accessible;

  if selected_club_id is not null then
    actor_membership_id := public.current_birthday_membership_id(selected_club_id);
    can_manage := public.current_can_manage_club(selected_club_id);
    select club.timezone_name
    into club_timezone
    from public.clubs as club
    where club.id = selected_club_id;
    local_today := (now() at time zone club_timezone)::date;
    local_year := extract(year from local_today)::integer;
  end if;

  select jsonb_build_object(
    'clubs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'club_id', club.id,
        'club_code', club.club_code,
        'club_name', club.club_name
      ) order by club.club_name, club.id)
      from public.clubs as club
      where club.club_status = 'active'
        and public.current_can_access_birthday_club(club.id)
    ), '[]'::jsonb),
    'selected_club_id', selected_club_id,
    'can_manage', can_manage,
    'my_preference', case when actor_membership_id is null then null else (
      select jsonb_build_object(
        'membership_id', membership.id,
        'has_birth_date', person.birth_date is not null,
        'has_preference', preference.membership_id is not null,
        'is_listed', coalesce(preference.is_listed, false),
        'allow_wishes', coalesce(preference.allow_wishes, false)
      )
      from public.club_memberships as membership
      join public.people as person on person.id = membership.person_id
      left join public.birthday_visibility_preferences as preference
        on preference.membership_id = membership.id
      where membership.id = actor_membership_id
    ) end,
    'birthdays', case when selected_club_id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'membership_id', membership.id,
        'display_name', person.canonical_name,
        'avatar_url', person.avatar_url,
        'birth_month', extract(month from upcoming.effective_date)::integer,
        'birth_day', extract(day from upcoming.effective_date)::integer,
        'age', case
          when preference.is_listed = true and coalesce(privacy.show_birthday_year, false)
            then public.birthday_age_on(person.birth_date, local_today)
          else null
        end,
        'days_until', (upcoming.effective_date - local_today)::integer,
        'allow_wishes', preference.allow_wishes,
        'is_self', membership.id = actor_membership_id
      ) order by upcoming.effective_date, person.canonical_name, membership.id)
      from public.birthday_visibility_preferences as preference
      join public.club_memberships as membership
        on membership.id = preference.membership_id
       and membership.club_id = selected_club_id
       and membership.membership_status = 'active'
      join public.people as person
        on person.id = membership.person_id
       and person.birth_date is not null
      left join public.app_accounts as recipient_account
        on recipient_account.person_id = person.id
       and recipient_account.account_status = 'active'
      left join public.privacy_settings as privacy
        on privacy.app_account_id = recipient_account.id
      cross join lateral (
        select case
          when public.birthday_effective_date(person.birth_date, local_year) >= local_today
            then public.birthday_effective_date(person.birth_date, local_year)
          else public.birthday_effective_date(person.birth_date, local_year + 1)
        end as effective_date
      ) as upcoming
      where preference.club_id = selected_club_id
        and preference.is_listed = true
    ), '[]'::jsonb) end,
    'wishes', case when selected_club_id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', wish.id,
        'recipient_membership_id', wish.recipient_membership_id,
        'recipient_name', recipient.canonical_name,
        'author_name', case
          when can_manage then author.account_display_name
          else null
        end,
        'author_is_hidden', not can_manage,
        'content', wish.content,
        'created_at', wish.created_at,
        'updated_at', wish.updated_at,
        'can_edit', wish.author_app_account_id = actor_id,
        'can_delete', wish.author_app_account_id = actor_id,
        'can_moderate', can_manage
      ) order by wish.created_at desc, wish.id desc)
      from public.birthday_wishes as wish
      join public.club_memberships as recipient_membership
        on recipient_membership.id = wish.recipient_membership_id
       and recipient_membership.club_id = selected_club_id
       and recipient_membership.membership_status = 'active'
      join public.people as recipient on recipient.id = recipient_membership.person_id
      join public.app_accounts as author on author.id = wish.author_app_account_id
      join public.birthday_visibility_preferences as preference
        on preference.membership_id = recipient_membership.id
       and preference.club_id = selected_club_id
       and preference.is_listed = true
      where wish.club_id = selected_club_id
        and wish.birthday_year = local_year
        and wish.status = 'active'
      limit 200
    ), '[]'::jsonb) end
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_my_birthday_page_v2(uuid) from public, anon;
grant execute on function public.get_my_birthday_page_v2(uuid) to authenticated;

commit;
