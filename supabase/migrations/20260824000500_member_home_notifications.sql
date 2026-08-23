begin;

-- Keep the member homepage to one authorised database round trip while adding
-- a tiny notification preview. The projection only reads rows delivered to
-- this exact membership, returns at most three previews, and never exposes a
-- message, recipient, account, person, or membership identifier.
create or replace function public.get_my_member_home_projection(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid;
  active_membership_id uuid;
  target_club_code text;
  target_club_name text;
  result jsonb;
begin
  select account.id, membership.id, club.club_code, club.club_name
    into actor_id, active_membership_id, target_club_code, target_club_name
  from public.app_accounts as account
  join public.club_memberships as membership on membership.person_id = account.person_id
  join public.clubs as club on club.id = membership.club_id
  where account.auth_user_id = auth.uid()
    and account.account_status = 'active'
    and membership.club_id = p_club_id
    and membership.membership_status = 'active'
    and club.club_status = 'active';

  if actor_id is null or active_membership_id is null then
    raise exception using errcode = '42501', message = 'active_member_home_required';
  end if;

  with candidate_events as (
    select
      event.id,
      event.event_type,
      event.title,
      event.location,
      event.starts_at,
      event.ends_at,
      event.registration_deadline,
      event.counts_for_attendance,
      registration.response as my_response,
      session.session_status as checkin_session_status,
      session.opens_at as checkin_opens_at,
      session.expires_at as checkin_expires_at,
      exists (
        select 1
        from public.event_attendances as attendance
        where attendance.event_id = event.id
          and attendance.membership_id = active_membership_id
          and attendance.attendance_status = 'active'
      ) as already_checked_in
    from public.club_events as event
    left join public.event_registrations as registration
      on registration.event_id = event.id
     and registration.app_account_id = actor_id
    left join lateral (
      select checkin.session_status, checkin.opens_at, checkin.expires_at
      from public.event_checkin_sessions as checkin
      where checkin.event_id = event.id
        and checkin.club_id = p_club_id
      order by checkin.created_at desc, checkin.id desc
      limit 1
    ) as session on true
    where event.club_id = p_club_id
      and event.event_status = 'published'
      and event.ends_at > now()
  ), ranked_events as (
    select
      candidate_events.*,
      row_number() over (
        order by
          case
            when starts_at <= now() then 0
            when (starts_at at time zone 'Asia/Taipei')::date = (now() at time zone 'Asia/Taipei')::date then 1
            else 2
          end,
          starts_at,
          id
      ) as position
    from candidate_events
  ), presented_events as (
    select
      position,
      jsonb_build_object(
        'event_type', event_type,
        'title', title,
        'location', location,
        'starts_at', starts_at,
        'ends_at', ends_at,
        'registration_state', case
          when my_response = 'attending' then 'registered'
          when my_response = 'pending' then 'pending'
          when my_response = 'declined' then 'declined'
          when now() <= registration_deadline and now() < starts_at then 'not_registered'
          else 'registration_closed'
        end,
        'checkin_state', case
          when not counts_for_attendance then 'not_available'
          when already_checked_in then 'checked_in'
          when checkin_session_status = 'active'
            and now() >= checkin_opens_at
            and now() < checkin_expires_at then 'available'
          when checkin_session_status = 'closed' or checkin_expires_at <= now() then 'closed'
          else 'not_open'
        end
      ) as event
    from ranked_events
    where position <= 2
  ), recent_events as (
    select
      jsonb_build_object(
        'title', event.title,
        'location', event.location,
        'starts_at', event.starts_at,
        'attended', exists (
          select 1
          from public.event_attendances as attendance
          where attendance.event_id = event.id
            and attendance.membership_id = active_membership_id
            and attendance.attendance_status = 'active'
        )
      ) as event
    from public.club_events as event
    where event.club_id = p_club_id
      and event.event_status = 'published'
      and event.ends_at <= now()
    order by event.ends_at desc, event.id desc
    limit 3
  ), message_deliveries as materialized (
    select
      message.id,
      message.title,
      left(message.body, 240) as body_preview,
      message.published_at,
      recipient.read_at
    from public.club_message_recipients as recipient
    join public.club_messages as message
      on message.id = recipient.message_id
     and message.club_id = recipient.club_id
    where recipient.club_id = p_club_id
      and recipient.membership_id = active_membership_id
      and message.status = 'active'
  ), notification_items as materialized (
    select *
    from message_deliveries
    order by published_at desc, id desc
    limit 3
  )
  select jsonb_build_object(
    'club', jsonb_build_object(
      'club_code', target_club_code,
      'club_name', target_club_name
    ),
    'primary_event', (select event from presented_events where position = 1),
    'next_event', (select event from presented_events where position = 2),
    'recent_events', coalesce((select jsonb_agg(event) from recent_events), '[]'::jsonb),
    'notifications', jsonb_build_object(
      'unread_count', (select count(*) from message_deliveries where read_at is null),
      'items', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'title', notification.title,
            'body_preview', notification.body_preview,
            'published_at', notification.published_at,
            'is_unread', notification.read_at is null
          ) order by notification.published_at desc, notification.id desc
        )
        from notification_items as notification
      ), '[]'::jsonb)
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_my_member_home_projection(uuid) from public, anon, authenticated;
grant execute on function public.get_my_member_home_projection(uuid) to authenticated;

commit;
