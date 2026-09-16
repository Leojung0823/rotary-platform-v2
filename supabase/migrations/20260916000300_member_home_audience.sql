begin;

-- 分眾活動不該出現在沒被指定到的社員首頁。
--
-- The member home never applied the audience rule. An event addressed to
-- particular tags appeared on the home page of every member of the club --
-- as the featured card with a 前往報名 button, in 近期活動, and as a 待辦提醒
-- telling them to answer -- while /events, which those all link to, correctly
-- refused to show it or take a registration.
--
-- So the page told a member about an event they were not invited to, named it,
-- said where it was, and asked them to answer. Every other member-facing read
-- of club_events already went through event_includes_current_member; this one
-- was the exception.
--
-- Restated from the current definition with that one condition added to each
-- of the two places this function reads events; nothing else changes.
--
-- check_in_to_event also loses the counts_for_attendance gate that
-- 20260915000700 removed from every other check-in path and missed here: the
-- static QR self check-in still refused an event outside the attendance rate,
-- which is the thing that migration set out to fix.
--
-- set_my_event_registration is here for the same reason. It never checked the
-- audience either: the lists did not offer a targeted event, but nothing
-- refused a registration for one, so answering someone else's board meeting
-- was one direct call away. Writing is the more serious half of the same hole.

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
      event.cover_image_path,
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
      -- The audience rule, which this projection never applied. An event
      -- addressed to particular tags was shown on the home page of every
      -- member of the club, complete with a 前往報名 button, while the events
      -- page it links to correctly refused to show or register it.
      and public.event_includes_current_member(event.id)
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
  ), awaiting_response as (
    -- A member is asked to answer only where answering is still possible and
    -- they have not answered yet. A row with no registration at all and a row
    -- explicitly left pending are the same thing to the member: nobody knows
    -- whether they are coming.
    select
      id,
      title,
      starts_at,
      registration_deadline
    from candidate_events
    where (my_response is null or my_response = 'pending')
      and now() <= registration_deadline
      and now() < starts_at
    order by registration_deadline, starts_at, id
    limit 5
  ), upcoming_list as (
    -- The same ranking the hero uses, taken wider. The list column shows what
    -- is coming; the hero shows the first of them, so they cannot disagree.
    select
      id,
      title,
      starts_at,
      registration_deadline,
      my_response
    from ranked_events
    where starts_at > now()
    order by position
    limit 4
  ), presented_events as (
    select
      position,
      jsonb_build_object(
        'event_type', event_type,
        'title', title,
        'location', location,
        'cover_image_path', cover_image_path,
        'starts_at', starts_at,
        'ends_at', ends_at,
        'registration_state', case
          when my_response = 'attending' then 'registered'
          when my_response = 'pending' then 'pending'
          when my_response = 'declined' then 'declined'
          when now() <= registration_deadline and now() < starts_at then 'not_registered'
          else 'registration_closed'
        end,
        -- Whether registration is still open, asked separately from what the
        -- member answered. registration_state stops mentioning the deadline the
        -- moment there is a response, so a member who declined an event that is
        -- still open could not be offered a way to change their mind. Same rule
        -- as list_club_events, minus the published check: everything reaching
        -- this projection is already published.
        'registration_open', now() <= registration_deadline and now() < starts_at,
        'checkin_state', case
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
      -- Same rule looking backwards: an event a member was never addressed to
      -- does not become theirs to review once it is over.
      and public.event_includes_current_member(event.id)
    order by event.ends_at desc, event.id desc
    limit 3
  ), message_deliveries as materialized (
    select
      message.id,
      message.title,
      left(message.body, 240) as body_preview,
      message.action_path,
      message.published_at,
      recipient.read_at
    from public.club_message_recipients as recipient
    join public.club_messages as message
      on message.id = recipient.message_id
     and message.club_id = recipient.club_id
    left join lateral (
      select case
        when participant.participant_status = 'declined' then 'declined'
        when participant.participant_status = 'disabled' then 'disabled'
        when latest.submission_status = 'hidden' then 'needs_resubmission'
        when latest.submission_status in ('submitted', 'published') then 'completed'
        when participant.participant_status is not null then 'pending'
        else null
      end as action_status
      from public.birthday_wish_campaign_participants as participant
      left join lateral (
        select submission.submission_status
        from public.birthday_wish_campaign_submissions as submission
        where submission.participant_id = participant.id
          and submission.club_id = participant.club_id
        order by submission.revision_number desc, submission.id desc
        limit 1
      ) as latest on true
      where participant.id = recipient.birthday_participant_id
        and participant.club_id = p_club_id
        and participant.assignee_membership_id = active_membership_id
      limit 1
    ) as birthday_assignment on true
    where recipient.club_id = p_club_id
      and recipient.membership_id = active_membership_id
      and message.status = 'active'
      and (
        recipient.birthday_participant_id is null
        or birthday_assignment.action_status in ('pending', 'needs_resubmission')
      )
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
    'upcoming_events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'event_id', item.id,
          'title', item.title,
          'starts_at', item.starts_at,
          -- The same three states the hero uses, so one event never reads as
          -- two different things in two places on one page.
          'registration_state', case
            when item.my_response = 'attending' then 'registered'
            when now() <= item.registration_deadline and now() < item.starts_at then 'open'
            else 'closed'
          end
        ) order by item.starts_at, item.id
      )
      from upcoming_list as item
    ), '[]'::jsonb),
    'pending_tasks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'kind', 'event_response',
          'title', task.title,
          'event_id', task.event_id,
          'deadline', task.registration_deadline,
          -- Hours, not a bucket: how soon "soon" is stays a product decision
          -- for the page to make, and it can change without a migration.
          'hours_remaining', floor(extract(epoch from (task.registration_deadline - now())) / 3600)::integer
        ) order by task.registration_deadline, task.starts_at, task.event_id
      )
      from (select id as event_id, title, starts_at, registration_deadline from awaiting_response) as task
    ), '[]'::jsonb),
    'notifications', jsonb_build_object(
      'unread_count', (select count(*) from message_deliveries where read_at is null),
      'items', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'title', notification.title,
            'body_preview', notification.body_preview,
            'action_path', notification.action_path,
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

create or replace function public.set_my_event_registration(
  p_club_id uuid,
  p_event_id uuid,
  p_response text,
  p_guest_count integer,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_events;
  normalized_note text := btrim(coalesce(p_note, ''));
  normalized_guests integer := coalesce(p_guest_count, 0);
  used_spots integer;
  saved public.event_registrations;
begin
  if actor_id is null or not public.current_has_active_event_membership(p_club_id) then
    raise exception using errcode = '42501', message = 'active_event_membership_required';
  end if;
  if p_response not in ('pending', 'attending', 'declined')
     or normalized_guests < 0 or normalized_guests > 20
     or char_length(normalized_note) > 500
     or (p_response in ('pending', 'declined') and normalized_guests <> 0) then
    raise exception using errcode = '22023', message = 'invalid_event_registration';
  end if;

  select * into target from public.club_events
  where id = p_event_id and club_id = p_club_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'event_not_available'; end if;
  -- An event addressed to particular tags is not this member's to answer.
  -- The lists never offered it, but nothing here refused it either, so a
  -- registration for someone else's board meeting was one direct call away.
  -- The answer matches the one for an event that does not exist, so a refusal
  -- does not confirm that the event is there.
  if not public.event_includes_current_member(p_event_id) then
    raise exception using errcode = 'P0002', message = 'event_not_available';
  end if;
  if target.event_status <> 'published' or now() > target.registration_deadline or now() >= target.starts_at then
    raise exception using errcode = '22023', message = 'event_registration_closed';
  end if;

  if p_response = 'attending' and target.capacity is not null then
    select coalesce(sum(1 + registration.guest_count), 0)::integer into used_spots
    from public.event_registrations as registration
    where registration.event_id = target.id
      and registration.response = 'attending'
      and registration.app_account_id <> actor_id;
    if used_spots + 1 + normalized_guests > target.capacity then
      raise exception using errcode = '23514', message = 'event_capacity_full';
    end if;
  end if;

  insert into public.event_registrations (
    club_id, event_id, app_account_id, response, guest_count, note, responded_at
  ) values (
    p_club_id, target.id, actor_id, p_response,
    case when p_response = 'attending' then normalized_guests else 0 end,
    normalized_note, case when p_response = 'pending' then null else now() end
  )
  on conflict (event_id, app_account_id) do update set
    response = excluded.response,
    guest_count = excluded.guest_count,
    note = excluded.note,
    responded_at = excluded.responded_at
  returning * into saved;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'event.registration_updated', 'event_registration', saved.id,
    jsonb_build_object('event_id', target.id, 'response', saved.response, 'guest_count', saved.guest_count));

  return jsonb_build_object('response', saved.response, 'guest_count', saved.guest_count, 'note', saved.note);
end;
$$;

create or replace function public.check_in_to_event(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target_session public.event_checkin_sessions;
  target_event public.club_events;
  target_membership public.club_memberships;
  existing_attendance public.event_attendances;
  created_attendance public.event_attendances;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'active_account_required';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_checkin_token';
  end if;

  select * into target_session
  from public.event_checkin_sessions
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;
  if not found or target_session.session_status <> 'active' or now() < target_session.opens_at then
    raise exception using errcode = '22023', message = 'checkin_token_invalid_or_expired';
  end if;
  if target_session.expires_at <= now() then
    update public.event_checkin_sessions
    set session_status = 'closed', closed_at = now(), close_reason = 'expired'
    where id = target_session.id;
    raise exception using errcode = '22023', message = 'checkin_token_invalid_or_expired';
  end if;

  select event.* into target_event
  from public.club_events as event
  join public.clubs as club on club.id = event.club_id and club.club_status = 'active'
  where event.id = target_session.event_id
    and event.club_id = target_session.club_id
    and event.event_status = 'published'
  for share of event;
  if not found then
    raise exception using errcode = '22023', message = 'event_not_checkin_eligible';
  end if;

  -- An event addressed to particular tags is not this member's to attend.
  -- None of the check-in paths asked, so someone the event was never sent to
  -- could still be recorded as present at it. The answer is the same one an
  -- ineligible event gives, so a refusal does not confirm the event is there.
  if not public.event_includes_current_member(target_event.id) then
    raise exception using errcode = '22023', message = 'event_not_checkin_eligible';
  end if;

  select membership.* into target_membership
  from public.app_accounts as account
  join public.club_memberships as membership on membership.person_id = account.person_id
  where account.id = actor_id
    and membership.club_id = target_session.club_id
    and membership.membership_status = 'active'
  for share of membership;
  if not found then
    raise exception using errcode = '42501', message = 'active_membership_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_event.id::text || ':' || target_membership.id::text, 0)
  );

  select * into existing_attendance from public.event_attendances
  where event_id = target_event.id
    and membership_id = target_membership.id
    and attendance_status = 'active';
  if found then
    return jsonb_build_object(
      'attendance_id', existing_attendance.id,
      'event_id', existing_attendance.event_id,
      'checked_in_at', existing_attendance.checked_in_at,
      'idempotent', true
    );
  end if;

  insert into public.event_attendances (
    club_id, event_id, membership_id, checkin_session_id, checkin_method,
    checked_in_by_app_account_id, checkin_note
  ) values (
    target_session.club_id, target_session.event_id, target_membership.id, target_session.id,
    'qr', actor_id, ''
  ) returning * into created_attendance;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (target_session.club_id, actor_id, 'attendance.self_checked_in', 'event_attendance', created_attendance.id,
    jsonb_build_object('event_id', target_event.id, 'membership_id', target_membership.id, 'session_id', target_session.id));

  return jsonb_build_object(
    'attendance_id', created_attendance.id,
    'event_id', created_attendance.event_id,
    'checked_in_at', created_attendance.checked_in_at,
    'idempotent', false
  );
end;
$$;

create or replace function public.check_in_to_dynamic_event(p_credential text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target_credential public.event_checkin_qr_credentials;
  target_session public.event_checkin_sessions;
  target_event public.club_events;
  target_membership public.club_memberships;
  existing_attendance public.event_attendances;
  created_attendance public.event_attendances;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'active_account_required';
  end if;
  if p_credential is null or p_credential !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_checkin_token';
  end if;

  select * into target_credential from public.event_checkin_qr_credentials
  where credential_hash = encode(extensions.digest(p_credential, 'sha256'), 'hex')
  for update;
  if not found or target_credential.revoked_at is not null or target_credential.valid_until <= now() then
    raise exception using errcode = '22023', message = 'checkin_token_invalid_or_expired';
  end if;

  select * into target_session from public.event_checkin_sessions
  where id = target_credential.checkin_session_id
    and club_id = target_credential.club_id
    and event_id = target_credential.event_id
    and session_status = 'active'
    and expires_at > now()
  for share;
  if not found then raise exception using errcode = '22023', message = 'checkin_session_not_active'; end if;

  select event.* into target_event
  from public.club_events as event
  join public.clubs as club on club.id = event.club_id and club.club_status = 'active'
  where event.id = target_credential.event_id
    and event.club_id = target_credential.club_id
    and event.event_status = 'published'
    and now() >= event.starts_at - interval '24 hours'
    and now() <= event.ends_at + interval '24 hours'
  for share of event;
  if not found then raise exception using errcode = '22023', message = 'event_not_checkin_eligible'; end if;

  -- An event addressed to particular tags is not this member's to attend.
  -- None of the check-in paths asked, so someone the event was never sent to
  -- could still be recorded as present at it. The answer is the same one an
  -- ineligible event gives, so a refusal does not confirm the event is there.
  if not public.event_includes_current_member(target_event.id) then
    raise exception using errcode = '22023', message = 'event_not_checkin_eligible';
  end if;

  select membership.* into target_membership
  from public.app_accounts as account
  join public.club_memberships as membership on membership.person_id = account.person_id
  where account.id = actor_id
    and membership.club_id = target_credential.club_id
    and membership.membership_status = 'active'
  for share of membership;
  if not found then raise exception using errcode = '42501', message = 'active_membership_required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_event.id::text || ':' || target_membership.id::text, 0)
  );
  select * into existing_attendance from public.event_attendances
  where event_id = target_event.id and membership_id = target_membership.id and attendance_status = 'active';
  if found then
    return jsonb_build_object('attendance_id', existing_attendance.id, 'event_id', existing_attendance.event_id,
      'checked_in_at', existing_attendance.checked_in_at, 'idempotent', true);
  end if;

  insert into public.event_attendances (
    club_id, event_id, membership_id, checkin_session_id, checkin_method, checked_in_by_app_account_id, checkin_note
  ) values (
    target_credential.club_id, target_credential.event_id, target_membership.id, target_session.id,
    'qr', actor_id, ''
  ) returning * into created_attendance;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (target_credential.club_id, actor_id, 'attendance.self_checked_in', 'event_attendance', created_attendance.id,
    jsonb_build_object('event_id', target_event.id, 'membership_id', target_membership.id, 'mode', 'dynamic_qr_v2'));

  return jsonb_build_object('attendance_id', created_attendance.id, 'event_id', created_attendance.event_id,
    'checked_in_at', created_attendance.checked_in_at, 'idempotent', false);
end;
$$;

create or replace function public.check_in_to_event_by_location(
  p_club_id uuid,
  p_event_id uuid,
  p_latitude numeric,
  p_longitude numeric
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target_event public.club_events;
  target_session public.event_checkin_sessions;
  target_membership public.club_memberships;
  existing_attendance public.event_attendances;
  created_attendance public.event_attendances;
  distance_meters double precision;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'active_account_required';
  end if;
  if p_latitude is null or p_longitude is null
     or p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180 then
    raise exception using errcode = '22023', message = 'invalid_checkin_location';
  end if;

  select event.* into target_event
  from public.club_events as event
  join public.clubs as club on club.id = event.club_id and club.club_status = 'active'
  where event.id = p_event_id
    and event.club_id = p_club_id
    and event.event_status = 'published'
    and now() >= event.starts_at - interval '24 hours'
    and now() <= event.ends_at + interval '24 hours'
  for share of event;
  if not found then
    raise exception using errcode = '22023', message = 'event_not_checkin_eligible';
  end if;

  -- An event addressed to particular tags is not this member's to attend.
  -- None of the check-in paths asked, so someone the event was never sent to
  -- could still be recorded as present at it. The answer is the same one an
  -- ineligible event gives, so a refusal does not confirm the event is there.
  if not public.event_includes_current_member(target_event.id) then
    raise exception using errcode = '22023', message = 'event_not_checkin_eligible';
  end if;

  if target_event.venue_latitude is null or target_event.venue_longitude is null then
    raise exception using errcode = '22023', message = 'event_venue_location_missing';
  end if;

  select * into target_session
  from public.event_checkin_sessions
  where event_id = target_event.id
    and club_id = target_event.club_id
    and session_status = 'active'
    and expires_at > now()
  for share;
  if not found then
    raise exception using errcode = '22023', message = 'checkin_session_not_active';
  end if;

  select membership.* into target_membership
  from public.app_accounts as account
  join public.club_memberships as membership on membership.person_id = account.person_id
  where account.id = actor_id
    and membership.club_id = target_event.club_id
    and membership.membership_status = 'active'
  for share of membership;
  if not found then
    raise exception using errcode = '42501', message = 'active_membership_required';
  end if;

  distance_meters := public.event_checkin_distance_meters(
    target_event.venue_latitude, target_event.venue_longitude, p_latitude, p_longitude
  );
  if distance_meters > public.event_checkin_gps_radius_meters() then
    -- Deliberately reports no distance: telling a caller how far off they are
    -- turns this into an oracle for locating the venue, and would put a
    -- member-derived measurement into an error surface.
    raise exception using errcode = '22023', message = 'checkin_location_out_of_range';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_event.id::text || ':' || target_membership.id::text, 0)
  );
  select * into existing_attendance
  from public.event_attendances
  where event_id = target_event.id
    and membership_id = target_membership.id
    and attendance_status = 'active';
  if found then
    return jsonb_build_object(
      'attendance_id', existing_attendance.id,
      'event_id', existing_attendance.event_id,
      'checked_in_at', existing_attendance.checked_in_at,
      'idempotent', true
    );
  end if;

  insert into public.event_attendances (
    club_id, event_id, membership_id, checkin_session_id, checkin_method, checked_in_by_app_account_id, checkin_note
  ) values (
    target_event.club_id, target_event.id, target_membership.id, target_session.id,
    'gps', actor_id, ''
  ) returning * into created_attendance;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (target_event.club_id, actor_id, 'attendance.self_checked_in', 'event_attendance', created_attendance.id,
    jsonb_build_object('event_id', target_event.id, 'membership_id', target_membership.id, 'mode', 'gps_v2'));

  return jsonb_build_object(
    'attendance_id', created_attendance.id,
    'event_id', created_attendance.event_id,
    'checked_in_at', created_attendance.checked_in_at,
    'idempotent', false
  );
end;
$$;

create or replace function public.list_my_location_checkin_events()
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'club_id', candidate.club_id,
    'club_name', candidate.club_name,
    'event_id', candidate.event_id,
    'title', candidate.title,
    'starts_at', candidate.starts_at,
    'already_checked_in', candidate.already_checked_in
  ) order by candidate.starts_at, candidate.event_id), '[]'::jsonb)
  into result
  from (
    select
      event.club_id,
      club.club_name,
      event.id as event_id,
      event.title,
      event.starts_at,
      exists (
        select 1 from public.event_attendances as attendance
        where attendance.event_id = event.id
          and attendance.membership_id = membership.id
          and attendance.attendance_status = 'active'
      ) as already_checked_in
    from public.app_accounts as account
    join public.club_memberships as membership
      on membership.person_id = account.person_id
     and membership.membership_status = 'active'
    join public.clubs as club
      on club.id = membership.club_id
     and club.club_status = 'active'
    join public.club_events as event
      on event.club_id = membership.club_id
     and event.event_status = 'published'
     -- An event addressed to particular tags is not offered to anyone outside
     -- them. Without this a member saw the title of a board meeting they were
     -- never invited to, in the one list that then lets them check into it.
     and public.event_includes_current_member(event.id)
     and event.venue_latitude is not null
     and now() >= event.starts_at - interval '24 hours'
     and now() <= event.ends_at + interval '24 hours'
    join public.event_checkin_sessions as session
      on session.event_id = event.id
     and session.club_id = event.club_id
     and session.session_status = 'active'
     and session.expires_at > now()
    where account.id = actor_id
      and account.account_status = 'active'
    limit 50
  ) as candidate;

  return jsonb_build_object('events', result);
end;
$$;

commit;
