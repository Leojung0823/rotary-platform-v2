begin;

create or replace function public.list_my_member_clubs()
returns table (
  club_id uuid,
  club_code text,
  club_name text,
  membership_id uuid,
  membership_number text,
  role_key text,
  can_manage boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select
    club.id,
    club.club_code,
    club.club_name,
    membership.id,
    membership.membership_number,
    coalesce(role_assignment.role_key, 'member'),
    public.current_has_club_permission(club.id, 'member.manage')
      or public.current_has_club_permission(club.id, 'event.manage')
      or public.current_has_club_permission(club.id, 'announcement.manage')
  from public.app_accounts as account
  join public.club_memberships as membership
    on membership.person_id = account.person_id
   and membership.membership_status = 'active'
  join public.clubs as club
    on club.id = membership.club_id
   and club.club_status = 'active'
  left join lateral (
    select assignment.role_key
    from public.club_role_assignments as assignment
    where assignment.club_id = club.id
      and assignment.app_account_id = account.id
      and assignment.assignment_status = 'active'
    order by case assignment.role_key
      when 'president' then 1
      when 'secretary' then 2
      when 'finance' then 3
      else 4
    end
    limit 1
  ) as role_assignment on true
  where account.auth_user_id = auth.uid()
    and account.account_status = 'active'
  order by club.club_name, club.id
$$;

create or replace function public.list_member_events(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  result jsonb;
begin
  if actor_id is null or not public.current_has_active_event_membership(p_club_id) then
    raise exception using errcode = '42501', message = 'active_membership_required';
  end if;

  select jsonb_build_object(
    'events', coalesce(jsonb_agg(jsonb_build_object(
      'id', event.id,
      'event_type', event.event_type,
      'title', event.title,
      'location', event.location,
      'starts_at', event.starts_at,
      'ends_at', event.ends_at,
      'registration_deadline', event.registration_deadline,
      'status', event.event_status,
      'my_response', registration.response,
      'my_guest_count', coalesce(registration.guest_count, 0),
      'registration_open', event.event_status = 'published'
        and now() <= event.registration_deadline
        and now() < event.starts_at,
      'checked_in', attendance.id is not null,
      'checked_in_at', attendance.checked_in_at,
      'ended', event.ends_at < now() or event.event_status = 'completed',
      'checkin_available', event.event_status = 'published'
        and setting.event_id is not null
        and now() between setting.opens_at and setting.closes_at
        and (
          setting.gps_enabled
          or (
            setting.qr_enabled
            and exists (
              select 1
              from public.event_checkin_sessions as session
              where session.event_id = event.id
                and session.session_status = 'active'
                and session.expires_at > now()
            )
          )
        )
        and attendance.id is null
    ) order by event.starts_at, event.id), '[]'::jsonb)
  ) into result
  from public.club_events as event
  left join public.event_registrations as registration
    on registration.event_id = event.id
   and registration.app_account_id = actor_id
  left join public.event_checkin_settings as setting
    on setting.event_id = event.id
   and setting.club_id = event.club_id
  left join public.event_attendances as attendance
    on attendance.event_id = event.id
   and attendance.membership_id = public.current_checkin_membership_id(p_club_id)
   and attendance.attendance_status = 'active'
  where event.club_id = p_club_id
    and event.event_status in ('published', 'cancelled', 'completed')
    and event.starts_at >= now() - interval '180 days'
  limit 200;

  return coalesce(result, jsonb_build_object('events', '[]'::jsonb));
end;
$$;

create or replace function public.get_member_event_detail(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  result jsonb;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'active_account_required';
  end if;

  select jsonb_build_object(
    'id', event.id,
    'club_id', event.club_id,
    'club_name', club.club_name,
    'event_type', event.event_type,
    'title', event.title,
    'description', event.description,
    'location', event.location,
    'starts_at', event.starts_at,
    'ends_at', event.ends_at,
    'registration_deadline', event.registration_deadline,
    'capacity', event.capacity,
    'status', event.event_status,
    'cancellation_reason', case when event.event_status = 'cancelled' then event.cancellation_reason else null end,
    'my_response', registration.response,
    'my_guest_count', coalesce(registration.guest_count, 0),
    'my_note', coalesce(registration.note, ''),
    'registration_open', event.event_status = 'published'
      and now() <= event.registration_deadline
      and now() < event.starts_at,
    'checked_in', attendance.id is not null,
    'attendance_id', attendance.id,
    'checked_in_at', attendance.checked_in_at,
    'checkin_method', attendance.checkin_method,
    'checkin', case when setting.event_id is null then null else jsonb_build_object(
      'window_open', now() between setting.opens_at and setting.closes_at,
      'opens_at', setting.opens_at,
      'closes_at', setting.closes_at,
      'gps_enabled', setting.gps_enabled,
      'qr_enabled', setting.qr_enabled,
      'qr_session_open', exists (
        select 1
        from public.event_checkin_sessions as session
        where session.event_id = event.id
          and session.session_status = 'active'
          and session.expires_at > now()
      )
    ) end
  ) into result
  from public.club_events as event
  join public.clubs as club on club.id = event.club_id
  left join public.event_registrations as registration
    on registration.event_id = event.id and registration.app_account_id = actor_id
  left join public.event_checkin_settings as setting
    on setting.event_id = event.id and setting.club_id = event.club_id
  left join public.event_attendances as attendance
    on attendance.event_id = event.id
   and attendance.membership_id = public.current_checkin_membership_id(event.club_id)
   and attendance.attendance_status = 'active'
  where event.id = p_event_id
    and event.event_status in ('published', 'cancelled', 'completed')
    and public.current_has_active_event_membership(event.club_id);

  if result is null then
    raise exception using errcode = 'P0002', message = 'event_not_available';
  end if;
  return result;
end;
$$;

create or replace function public.get_member_home(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  actor_membership_id uuid := public.current_checkin_membership_id(p_club_id);
  result jsonb;
begin
  if actor_id is null or actor_membership_id is null then
    raise exception using errcode = '42501', message = 'active_membership_required';
  end if;

  select jsonb_build_object(
    'club', jsonb_build_object('id', club.id, 'name', club.club_name, 'code', club.club_code),
    'member', jsonb_build_object(
      'membership_id', membership.id,
      'display_name', person.canonical_name,
      'avatar_url', person.avatar_url,
      'role_key', coalesce(role_assignment.role_key, 'member'),
      'missing_contact', person.primary_phone is null or person.primary_email is null
    ),
    'needs_attention', coalesce((
      select jsonb_agg(item.payload order by item.priority, item.starts_at nulls last, item.item_id)
      from (
        select 1 as priority, event.starts_at, event.id as item_id,
          jsonb_build_object(
            'kind', 'checkin',
            'event_id', event.id,
            'title', event.title,
            'starts_at', event.starts_at,
            'location', event.location,
            'gps_enabled', setting.gps_enabled,
            'qr_enabled', setting.qr_enabled
          ) as payload
        from public.club_events as event
        join public.event_checkin_settings as setting
          on setting.event_id = event.id and setting.club_id = event.club_id
        left join public.event_attendances as attendance
          on attendance.event_id = event.id
         and attendance.membership_id = actor_membership_id
         and attendance.attendance_status = 'active'
        where event.club_id = p_club_id
          and event.event_status = 'published'
          and now() between setting.opens_at and setting.closes_at
          and attendance.id is null
          and (
            setting.gps_enabled
            or (setting.qr_enabled and exists (
              select 1 from public.event_checkin_sessions as session
              where session.event_id = event.id
                and session.session_status = 'active'
                and session.expires_at > now()
            ))
          )
        union all
        select 2, event.starts_at, event.id,
          jsonb_build_object(
            'kind', 'registration',
            'event_id', event.id,
            'title', event.title,
            'starts_at', event.starts_at,
            'location', event.location,
            'registration_deadline', event.registration_deadline
          )
        from public.club_events as event
        left join public.event_registrations as registration
          on registration.event_id = event.id and registration.app_account_id = actor_id
        where event.club_id = p_club_id
          and event.event_status = 'published'
          and event.starts_at > now()
          and event.registration_deadline >= now()
          and (registration.id is null or registration.response = 'pending')
          and event.starts_at <= now() + interval '60 days'
        union all
        select 3, null::timestamptz, announcement.id,
          jsonb_build_object(
            'kind', 'announcement',
            'announcement_id', announcement.id,
            'title', announcement.title,
            'published_at', announcement.published_at
          )
        from public.club_announcements as announcement
        left join public.announcement_receipts as receipt
          on receipt.announcement_id = announcement.id
         and receipt.membership_id = actor_membership_id
        where announcement.club_id = p_club_id
          and announcement.announcement_status = 'published'
          and announcement.requires_acknowledgement
          and receipt.acknowledged_at is null
          and (announcement.expires_at is null or announcement.expires_at > now())
        union all
        select 4, null::timestamptz, membership.id,
          jsonb_build_object('kind', 'profile', 'title', '補齊必要聯絡資料')
        where person.primary_phone is null or person.primary_email is null
      ) as item
    ), '[]'::jsonb),
    'next_event', (
      select jsonb_build_object(
        'id', event.id,
        'title', event.title,
        'starts_at', event.starts_at,
        'ends_at', event.ends_at,
        'location', event.location,
        'registration_deadline', event.registration_deadline,
        'my_response', registration.response,
        'my_guest_count', coalesce(registration.guest_count, 0),
        'registration_open', now() <= event.registration_deadline
      )
      from public.club_events as event
      left join public.event_registrations as registration
        on registration.event_id = event.id and registration.app_account_id = actor_id
      where event.club_id = p_club_id
        and event.event_status = 'published'
        and event.ends_at >= now()
      order by event.starts_at, event.id
      limit 1
    ),
    'my_registrations', coalesce((
      select jsonb_agg(registration_item.payload order by registration_item.starts_at)
      from (
        select event.starts_at, jsonb_build_object(
          'id', event.id,
          'title', event.title,
          'starts_at', event.starts_at,
          'location', event.location,
          'guest_count', registration.guest_count
        ) as payload
        from public.event_registrations as registration
        join public.club_events as event on event.id = registration.event_id
        where registration.app_account_id = actor_id
          and registration.club_id = p_club_id
          and registration.response = 'attending'
          and event.event_status = 'published'
          and event.ends_at >= now()
        order by event.starts_at
        limit 3
      ) as registration_item
    ), '[]'::jsonb),
    'announcements', coalesce((
      select jsonb_agg(announcement_item.payload order by announcement_item.pinned desc, announcement_item.published_at desc)
      from (
        select announcement.pinned, announcement.published_at, jsonb_build_object(
          'id', announcement.id,
          'title', announcement.title,
          'published_at', announcement.published_at,
          'pinned', announcement.pinned,
          'requires_acknowledgement', announcement.requires_acknowledgement,
          'acknowledged', receipt.acknowledged_at is not null
        ) as payload
        from public.club_announcements as announcement
        left join public.announcement_receipts as receipt
          on receipt.announcement_id = announcement.id
         and receipt.membership_id = actor_membership_id
        where announcement.club_id = p_club_id
          and announcement.announcement_status = 'published'
          and (announcement.expires_at is null or announcement.expires_at > now())
        order by announcement.pinned desc, announcement.published_at desc
        limit 3
      ) as announcement_item
    ), '[]'::jsonb)
  ) into result
  from public.clubs as club
  join public.club_memberships as membership
    on membership.id = actor_membership_id and membership.club_id = club.id
  join public.people as person on person.id = membership.person_id
  left join lateral (
    select assignment.role_key
    from public.club_role_assignments as assignment
    where assignment.club_id = club.id
      and assignment.app_account_id = actor_id
      and assignment.assignment_status = 'active'
    order by case assignment.role_key
      when 'president' then 1
      when 'secretary' then 2
      when 'finance' then 3
      else 4
    end
    limit 1
  ) as role_assignment on true
  where club.id = p_club_id and club.club_status = 'active';

  if result is null then
    raise exception using errcode = 'P0002', message = 'club_not_available';
  end if;
  return result;
end;
$$;

revoke all on function public.list_my_member_clubs() from public, anon;
revoke all on function public.list_member_events(uuid) from public, anon;
revoke all on function public.get_member_event_detail(uuid) from public, anon;
revoke all on function public.get_member_home(uuid) from public, anon;

grant execute on function public.list_my_member_clubs() to authenticated;
grant execute on function public.list_member_events(uuid) to authenticated;
grant execute on function public.get_member_event_detail(uuid) to authenticated;
grant execute on function public.get_member_home(uuid) to authenticated;

commit;
