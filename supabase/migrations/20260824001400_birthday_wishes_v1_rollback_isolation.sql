begin;

-- Keep the legacy path a real rollback boundary. V2 rows must not appear in
-- the V1 projection, and V1 writes must not be able to mutate V2 history.
create or replace function public.get_my_birthday_page(p_club_id uuid default null)
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
        'birth_month', extract(month from person.birth_date)::integer,
        'birth_day', extract(day from person.birth_date)::integer,
        'allow_wishes', preference.allow_wishes,
        'is_self', membership.id = actor_membership_id
      ) order by extract(month from person.birth_date), extract(day from person.birth_date), person.canonical_name)
      from public.birthday_visibility_preferences as preference
      join public.club_memberships as membership
        on membership.id = preference.membership_id
       and membership.club_id = selected_club_id
       and membership.membership_status = 'active'
      join public.people as person
        on person.id = membership.person_id
       and person.birth_date is not null
      where preference.club_id = selected_club_id
        and preference.is_listed = true
    ), '[]'::jsonb) end,
    'wishes', case when selected_club_id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', wish.id,
        'recipient_membership_id', wish.recipient_membership_id,
        'recipient_name', recipient.canonical_name,
        'author_name', case
          when wish.author_app_account_id = actor_id or can_manage then author.account_display_name
          else null
        end,
        'author_is_hidden', not (wish.author_app_account_id = actor_id or can_manage),
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
        and wish.experience_version = 1
        and wish.birthday_year = extract(
          year from public.birthday_club_local_date(selected_club_id)
        )::integer
        and wish.status = 'active'
      limit 200
    ), '[]'::jsonb) end
  ) into result;

  return result;
end;
$$;

create or replace function public.update_own_birthday_wish(
  p_club_id uuid,
  p_wish_id uuid,
  p_content text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  normalized_content text := public.normalize_birthday_wish(p_content);
begin
  if actor_id is null or public.current_birthday_membership_id(p_club_id) is null then
    raise exception using errcode = '42501', message = 'active_birthday_membership_required';
  end if;

  if char_length(normalized_content) < 1 or char_length(normalized_content) > 500 then
    raise exception using errcode = '22023', message = 'invalid_birthday_wish_content';
  end if;

  update public.birthday_wishes
  set content = normalized_content
  where id = p_wish_id
    and club_id = p_club_id
    and author_app_account_id = actor_id
    and experience_version = 1
    and birthday_year = extract(
      year from public.birthday_club_local_date(p_club_id)
    )::integer
    and status = 'active';

  if not found then
    raise exception using errcode = 'P0002', message = 'birthday_wish_not_available';
  end if;
end;
$$;

create or replace function public.delete_own_birthday_wish(
  p_club_id uuid,
  p_wish_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
begin
  if actor_id is null or public.current_birthday_membership_id(p_club_id) is null then
    raise exception using errcode = '42501', message = 'active_birthday_membership_required';
  end if;

  update public.birthday_wishes
  set status = 'deleted',
      removed_at = now(),
      removed_by_app_account_id = actor_id,
      removal_reason = 'author_deleted'
  where id = p_wish_id
    and club_id = p_club_id
    and author_app_account_id = actor_id
    and experience_version = 1
    and status = 'active';

  if not found then
    raise exception using errcode = 'P0002', message = 'birthday_wish_not_available';
  end if;
end;
$$;

-- V2 may continue to display legacy V1 wishes, so its own-delete path accepts
-- either version. The V1 path above remains unable to mutate V2 rows.
create or replace function public.delete_own_birthday_wish_v2(
  p_club_id uuid,
  p_wish_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
begin
  if actor_id is null or public.current_birthday_membership_id(p_club_id) is null then
    raise exception using errcode = '42501', message = 'active_birthday_membership_required';
  end if;

  update public.birthday_wishes
  set status = 'deleted',
      removed_at = now(),
      removed_by_app_account_id = actor_id,
      removal_reason = 'author_deleted'
  where id = p_wish_id
    and club_id = p_club_id
    and author_app_account_id = actor_id
    and status = 'active';

  if not found then
    raise exception using errcode = 'P0002', message = 'birthday_wish_not_available';
  end if;
end;
$$;

revoke all on function public.get_my_birthday_page(uuid) from public, anon;
revoke all on function public.update_own_birthday_wish(uuid, uuid, text) from public, anon;
revoke all on function public.delete_own_birthday_wish(uuid, uuid) from public, anon;
revoke all on function public.delete_own_birthday_wish_v2(uuid, uuid) from public, anon;

grant execute on function public.get_my_birthday_page(uuid) to authenticated;
grant execute on function public.update_own_birthday_wish(uuid, uuid, text) to authenticated;
grant execute on function public.delete_own_birthday_wish(uuid, uuid) to authenticated;
grant execute on function public.delete_own_birthday_wish_v2(uuid, uuid) to authenticated;

commit;
