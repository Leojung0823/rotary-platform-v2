begin;

-- 報名截止改成選填。不填就是「活動結束前都還能報名」。
--
-- A club that meets every week does not set a deadline for its own regular
-- meeting; requiring one made officers invent a time and then answer for it.
--
-- The rule for "can I still register" was written out in five places, each a
-- copy of `now() <= registration_deadline and now() < starts_at`. Making the
-- column nullable by editing five copies is how four of them end up agreeing
-- and one does not, so the rule moves into one function first and every caller
-- asks it.

alter table public.club_events
  alter column registration_deadline drop not null;

comment on column public.club_events.registration_deadline is
  'When registration closes. NULL means it stays open until the event ends.';

-- The existing club_events_deadline_check (registration_deadline <= starts_at)
-- needs no change: a check constraint passes on NULL.

-- When registration closes, for anything that needs to count down to it.
-- An event with no deadline of its own takes registrations until it is over --
-- not until it starts, because the point of leaving it blank is "just turn up".
create or replace function public.event_registration_closes_at(
  p_registration_deadline timestamptz,
  p_ends_at timestamptz
)
returns timestamptz
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(p_registration_deadline, p_ends_at)
$$;

-- The one rule. The two branches are deliberately not collapsed into a single
-- comparison: with a deadline set the existing behaviour is preserved exactly,
-- including that `now() = registration_deadline` is still open, and a single
-- `now() < least(...)` would have quietly closed registration one instant
-- early for every event that already has a deadline.
create or replace function public.event_registration_is_open(
  p_registration_deadline timestamptz,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns boolean
language sql
stable
set search_path = pg_catalog
as $$
  select case
    when p_registration_deadline is null then now() < p_ends_at
    else now() <= p_registration_deadline and now() < p_starts_at
  end
$$;

revoke all on function public.event_registration_closes_at(timestamptz, timestamptz) from public, anon;
revoke all on function public.event_registration_is_open(timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.event_registration_closes_at(timestamptz, timestamptz) to authenticated;
grant execute on function public.event_registration_is_open(timestamptz, timestamptz, timestamptz) to authenticated;

create or replace function public.list_club_events(p_club_id uuid, p_as_member boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  -- p_as_member makes a manager ask the question a plain member would ask.
  -- Everything downstream -- which statuses and how far back are visible, and
  -- the can_manage flag on each row -- already derives from this one value,
  -- so the member view stays defined in exactly one place.
  can_manage boolean := (not p_as_member)
    and public.current_has_club_permission(p_club_id, 'event.manage');
  result jsonb;
begin
  if actor_id is null or not public.current_can_access_club_events(p_club_id) then
    raise exception using errcode = '42501', message = 'event_read_required';
  end if;

  select jsonb_build_object(
    'events', coalesce(jsonb_agg(jsonb_build_object(
      'id', event.id,
      'event_type', event.event_type,
      'title', event.title,
      'description', event.description,
      'location', event.location,
      'starts_at', event.starts_at,
      'ends_at', event.ends_at,
      'registration_deadline', event.registration_deadline,
      'capacity', event.capacity,
      'counts_for_attendance', event.counts_for_attendance,
      'status', event.event_status,
      'version', event.version,
      'attending_members', event.attending_members,
      'attending_spots', event.attending_spots,
      'remaining_spots', case when event.capacity is null then null else greatest(event.capacity - event.attending_spots, 0) end,
      'my_response', event.my_response,
      'my_guest_count', event.my_guest_count,
      'my_note', event.my_note,
      'can_manage', can_manage,
      'cover_image_path', event.cover_image_path,
      'venue_location_set', event.venue_latitude is not null,
      -- The coordinates themselves, and only for someone who may edit this
      -- event. A member sees whether a location was set, not where it is.
      'venue_latitude', case when can_manage then event.venue_latitude end,
      'venue_longitude', case when can_manage then event.venue_longitude end,
      'registration_open', event.event_status = 'published'
        and public.event_registration_is_open(
          event.registration_deadline, event.starts_at, event.ends_at
        ),
      -- The audience this event was addressed to, for whoever may edit it.
      -- Without it the edit page rendered the picker empty every time, so an
      -- officer opening it saw "whole club" for an event that was targeted --
      -- and saving would have silently widened it even once saving worked.
      -- A member is told whether a location was set, not where; the audience
      -- is the same kind of fact, so it is a manager's to see.
      'audience_tag_ids', case when can_manage then coalesce((
        select jsonb_agg(audience.tag_id order by audience.tag_id)
        from public.club_event_audiences as audience
        where audience.event_id = event.id
      ), '[]'::jsonb) end,
      'audience_membership_ids', case when can_manage then coalesce((
        select jsonb_agg(audience.membership_id order by audience.membership_id)
        from public.club_event_audience_members as audience
        where audience.event_id = event.id
      ), '[]'::jsonb) end
    ) order by event.starts_at desc, event.id desc), '[]'::jsonb)
  ) into result
  from (
    select e.*,
      count(r.id) filter (where r.response = 'attending')::integer as attending_members,
      coalesce(sum(1 + r.guest_count) filter (where r.response = 'attending'), 0)::integer as attending_spots,
      mine.response as my_response,
      coalesce(mine.guest_count, 0) as my_guest_count,
      coalesce(mine.note, '') as my_note
    from public.club_events as e
    left join public.event_registrations as r on r.event_id = e.id
    left join public.event_registrations as mine on mine.event_id = e.id and mine.app_account_id = actor_id
    where e.club_id = p_club_id
      -- An event addressed to particular tags is not shown to anyone outside
      -- them. Managers still see everything, so they can find what they sent.
      and (can_manage or public.event_includes_current_member(e.id))
      and (e.event_status = 'published' or can_manage)
      and (e.starts_at >= now() - interval '30 days' or can_manage)
    group by e.id, mine.response, mine.guest_count, mine.note
    order by e.starts_at, e.id
    limit 200
  ) as event;

  return coalesce(result, jsonb_build_object('events', '[]'::jsonb));
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
  if target.event_status <> 'published'
     or not public.event_registration_is_open(
       target.registration_deadline, target.starts_at, target.ends_at
     ) then
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
      and public.event_registration_is_open(registration_deadline, starts_at, ends_at)
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
          when public.event_registration_is_open(registration_deadline, starts_at, ends_at) then 'not_registered'
          else 'registration_closed'
        end,
        -- Whether registration is still open, asked separately from what the
        -- member answered. registration_state stops mentioning the deadline the
        -- moment there is a response, so a member who declined an event that is
        -- still open could not be offered a way to change their mind. Same rule
        -- as list_club_events, minus the published check: everything reaching
        -- this projection is already published.
        'registration_open', public.event_registration_is_open(registration_deadline, starts_at, ends_at),
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
            when public.event_registration_is_open(item.registration_deadline, item.starts_at, item.ends_at) then 'open'
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
          'hours_remaining', floor(extract(epoch from (
            public.event_registration_closes_at(task.registration_deadline, task.ends_at) - now()
          )) / 3600)::integer
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

commit;
