begin;

-- 不計入出席的活動也要能簽到。
--
-- counts_for_attendance has been carrying two different meanings: "counts
-- toward the attendance rate" (what its name says) and "check-in exists at
-- all" (what every check-in RPC read it as). So an event excluded from the
-- rate -- a targeted board meeting, a fellowship outing -- had no way to
-- record who turned up, and the club lost that record entirely.
--
-- This leaves the column meaning only the first thing. The check-in gates drop
-- it and keep the one condition that was always the real requirement: the
-- event is published.
--
-- The attendance rate is untouched and cannot move as a result. It is computed
-- in attendance_regular_meetings_only, which filters on
-- `event_type = 'regular_meeting' and counts_for_attendance` -- two conditions,
-- neither of which this migration goes near. An attendance row now existing for
-- a non-counting event is exactly the point: get_event_checkin_overview already
-- returns the attendee list for any event, so "who came" becomes visible while
-- the percentage stays the same.
--
-- Every function below is restated verbatim from its current definition with
-- one clause removed; nothing else about any of them changes.

create or replace function public.open_event_checkin(
  p_club_id uuid,
  p_event_id uuid,
  p_duration_minutes integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_events;
  current_session public.event_checkin_sessions;
  created_session public.event_checkin_sessions;
  raw_token text;
begin
  if actor_id is null or not public.current_can_manage_event_checkin(p_club_id) then
    raise exception using errcode = '42501', message = 'attendance_manage_required';
  end if;
  if p_duration_minutes is null or p_duration_minutes < 5 or p_duration_minutes > 240 then
    raise exception using errcode = '22023', message = 'invalid_checkin_duration';
  end if;

  select * into target from public.club_events
  where id = p_event_id and club_id = p_club_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'event_not_available'; end if;
  if target.event_status <> 'published' then
    raise exception using errcode = '22023', message = 'event_not_checkin_eligible';
  end if;
  if now() < target.starts_at - interval '24 hours' or now() > target.ends_at + interval '24 hours' then
    raise exception using errcode = '22023', message = 'checkin_window_closed';
  end if;

  select * into current_session from public.event_checkin_sessions
  where event_id = target.id and session_status = 'active' for update;
  if found and current_session.expires_at <= now() then
    update public.event_checkin_sessions
    set session_status = 'closed', closed_at = now(), close_reason = 'expired', closed_by_app_account_id = actor_id
    where id = current_session.id;
  elsif found then
    raise exception using errcode = '23505', message = 'checkin_session_already_active';
  end if;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.event_checkin_sessions (
    club_id, event_id, token_hash, token_prefix, expires_at, created_by_app_account_id
  ) values (
    p_club_id, p_event_id, encode(extensions.digest(raw_token, 'sha256'), 'hex'), left(raw_token, 8),
    now() + make_interval(mins => p_duration_minutes), actor_id
  ) returning * into created_session;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'attendance.session_opened', 'event_checkin_session', created_session.id,
    jsonb_build_object('event_id', p_event_id, 'expires_at', created_session.expires_at));

  return jsonb_build_object(
    'session_id', created_session.id,
    'event_id', created_session.event_id,
    'token', raw_token,
    'token_prefix', created_session.token_prefix,
    'expires_at', created_session.expires_at
  );
end;
$$;

create or replace function public.rotate_event_checkin_token(
  p_club_id uuid,
  p_event_id uuid,
  p_duration_minutes integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_events;
  current_session public.event_checkin_sessions;
  created_session public.event_checkin_sessions;
  raw_token text;
begin
  if actor_id is null or not public.current_can_manage_event_checkin(p_club_id) then
    raise exception using errcode = '42501', message = 'attendance_manage_required';
  end if;
  if p_duration_minutes is null or p_duration_minutes < 5 or p_duration_minutes > 240 then
    raise exception using errcode = '22023', message = 'invalid_checkin_duration';
  end if;

  select * into target from public.club_events
  where id = p_event_id and club_id = p_club_id for update;
  if not found or target.event_status <> 'published' then
    raise exception using errcode = '22023', message = 'event_not_checkin_eligible';
  end if;
  if now() < target.starts_at - interval '24 hours' or now() > target.ends_at + interval '24 hours' then
    raise exception using errcode = '22023', message = 'checkin_window_closed';
  end if;

  select * into current_session from public.event_checkin_sessions
  where event_id = target.id and session_status = 'active' for update;
  if not found or current_session.expires_at <= now() then
    if found then
      update public.event_checkin_sessions
      set session_status = 'closed', closed_at = now(), close_reason = 'expired', closed_by_app_account_id = actor_id
      where id = current_session.id;
    end if;
    raise exception using errcode = 'P0002', message = 'checkin_session_not_active';
  end if;

  update public.event_checkin_sessions
  set session_status = 'closed', closed_at = now(), close_reason = 'rotated', closed_by_app_account_id = actor_id
  where id = current_session.id;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.event_checkin_sessions (
    club_id, event_id, token_hash, token_prefix, expires_at, created_by_app_account_id
  ) values (
    p_club_id, p_event_id, encode(extensions.digest(raw_token, 'sha256'), 'hex'), left(raw_token, 8),
    now() + make_interval(mins => p_duration_minutes), actor_id
  ) returning * into created_session;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'attendance.session_rotated', 'event_checkin_session', created_session.id,
    jsonb_build_object('event_id', p_event_id, 'previous_session_id', current_session.id, 'expires_at', created_session.expires_at));

  return jsonb_build_object(
    'session_id', created_session.id,
    'event_id', created_session.event_id,
    'token', raw_token,
    'token_prefix', created_session.token_prefix,
    'expires_at', created_session.expires_at
  );
end;
$$;

create or replace function public.manual_check_in_event(
  p_club_id uuid,
  p_event_id uuid,
  p_membership_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target_event public.club_events;
  target_membership public.club_memberships;
  existing_attendance public.event_attendances;
  created_attendance public.event_attendances;
  reason text := btrim(coalesce(p_reason, ''));
begin
  if actor_id is null or not public.current_can_manage_event_checkin(p_club_id) then
    raise exception using errcode = '42501', message = 'attendance_manage_required';
  end if;
  if reason = '' or char_length(reason) > 500 then
    raise exception using errcode = '22023', message = 'manual_checkin_reason_required';
  end if;

  select * into target_event from public.club_events
  where id = p_event_id and club_id = p_club_id for share;
  if not found or target_event.event_status <> 'published' then
    raise exception using errcode = '22023', message = 'event_not_checkin_eligible';
  end if;

  select * into target_membership from public.club_memberships
  where id = p_membership_id and club_id = p_club_id and membership_status = 'active'
  for share;
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
    club_id, event_id, membership_id, checkin_method,
    checked_in_by_app_account_id, checkin_note
  ) values (
    p_club_id, p_event_id, p_membership_id, 'manual', actor_id, reason
  ) returning * into created_attendance;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'attendance.manual_checked_in', 'event_attendance', created_attendance.id,
    jsonb_build_object('event_id', p_event_id, 'membership_id', p_membership_id, 'reason', reason));

  return jsonb_build_object(
    'attendance_id', created_attendance.id,
    'event_id', created_attendance.event_id,
    'checked_in_at', created_attendance.checked_in_at,
    'idempotent', false
  );
end;
$$;

create or replace function public.open_dynamic_event_checkin(
  p_club_id uuid,
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_events;
  current_session public.event_checkin_sessions;
  created_session public.event_checkin_sessions;
  ignored_legacy_token text;
begin
  if actor_id is null or not public.current_can_manage_event_checkin(p_club_id) then
    raise exception using errcode = '42501', message = 'attendance_manage_required';
  end if;

  select * into target from public.club_events
  where id = p_event_id and club_id = p_club_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'event_not_available'; end if;
  if target.event_status <> 'published' then
    raise exception using errcode = '22023', message = 'event_not_checkin_eligible';
  end if;
  if now() < target.starts_at - interval '24 hours' or now() > target.ends_at + interval '24 hours' then
    raise exception using errcode = '22023', message = 'checkin_window_closed';
  end if;

  select * into current_session from public.event_checkin_sessions
  where event_id = target.id and session_status = 'active' for update;
  if found and current_session.expires_at <= now() then
    update public.event_checkin_sessions
    set session_status = 'closed', closed_at = now(), close_reason = 'expired', closed_by_app_account_id = actor_id
    where id = current_session.id;
  elsif found and exists (
    select 1 from public.event_checkin_qr_credentials where checkin_session_id = current_session.id
  ) then
    raise exception using errcode = '23505', message = 'checkin_session_already_active';
  elsif found then
    -- A manager explicitly starting V2 safely supersedes the legacy token.
    update public.event_checkin_sessions
    set session_status = 'closed', closed_at = now(), close_reason = 'v2_upgrade', closed_by_app_account_id = actor_id
    where id = current_session.id;
  end if;

  -- The historic session table requires a token hash. This random value is
  -- never returned, logged, or used by V2; only child credentials are usable.
  ignored_legacy_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.event_checkin_sessions (
    club_id, event_id, token_hash, token_prefix, expires_at, created_by_app_account_id
  ) values (
    p_club_id, p_event_id,
    encode(extensions.digest(ignored_legacy_token, 'sha256'), 'hex'),
    left(ignored_legacy_token, 8),
    target.ends_at + interval '24 hours', actor_id
  ) returning * into created_session;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'attendance.session_opened', 'event_checkin_session', created_session.id,
    jsonb_build_object('event_id', p_event_id, 'mode', 'dynamic_qr_v2'));

  return jsonb_build_object('session_id', created_session.id, 'event_id', created_session.event_id);
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

commit;
