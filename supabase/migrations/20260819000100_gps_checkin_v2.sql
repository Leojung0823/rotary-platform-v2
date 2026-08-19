begin;

-- PR-04 GPS Check-in.
--
-- Members may check in either by scanning the dynamic QR (checkin_qr_v2) or by
-- proving they are physically at the venue. The two paths are deliberately
-- independent: a GPS check-in never reads or issues a QR credential, and a QR
-- check-in never reads a coordinate. Either one alone produces the same
-- canonical attendance row, so a member whose camera fails still has a way in.
--
-- Privacy boundary: the member's coordinates are function arguments only. They
-- are compared in-transaction and then discarded -- there is no column, audit
-- field, or telemetry key that can hold a member's raw position or the exact
-- distance from the venue. Only the venue's own coordinates are stored, and
-- those are club-authored event data, not personal data.

-- 1. Venue location lives on the event, entered when the event is created.
alter table public.club_events
  add column venue_latitude numeric(9, 6),
  add column venue_longitude numeric(9, 6);

alter table public.club_events
  add constraint club_events_venue_latitude_check
    check (venue_latitude is null or venue_latitude between -90 and 90),
  add constraint club_events_venue_longitude_check
    check (venue_longitude is null or venue_longitude between -180 and 180),
  -- A half-configured venue would silently fail every GPS check-in.
  add constraint club_events_venue_pair_check
    check (num_nulls(venue_latitude, venue_longitude) in (0, 2));

comment on column public.club_events.venue_latitude is
  'Venue latitude used only to decide whether a check-in request is at the venue. Never stores a member position.';

-- 2. Single source of truth for the accepted radius. Indoor GPS is routinely
-- 20-50m off, so the radius has to absorb that without turning a present
-- member into an absent one.
create or replace function public.event_checkin_gps_radius_meters()
returns integer
language sql
immutable
set search_path = pg_catalog
as $$ select 200 $$;

-- 3. Great-circle distance. least(1, ...) keeps floating point error from
-- pushing asin() outside its domain for near-identical points.
create or replace function public.event_checkin_distance_meters(
  p_latitude_a numeric,
  p_longitude_a numeric,
  p_latitude_b numeric,
  p_longitude_b numeric
)
returns double precision
language sql
immutable
set search_path = pg_catalog
as $$
  select 2 * 6371000::double precision * asin(least(1::double precision, sqrt(
    power(sin(radians((p_latitude_b - p_latitude_a)::double precision) / 2), 2)
    + cos(radians(p_latitude_a::double precision)) * cos(radians(p_latitude_b::double precision))
      * power(sin(radians((p_longitude_b - p_longitude_a)::double precision) / 2), 2)
  )))
$$;

-- 4. Canonical attendance gains a third method. GPS, like QR, is bound to an
-- open check-in session; only manual back-fill stays session-free.
alter table public.event_attendances
  drop constraint event_attendances_method_check;
alter table public.event_attendances
  add constraint event_attendances_method_check
    check (checkin_method in ('qr', 'manual', 'gps'));

alter table public.event_attendances
  drop constraint event_attendances_method_consistency;
alter table public.event_attendances
  add constraint event_attendances_method_consistency check (
    (checkin_method in ('qr', 'gps') and checkin_session_id is not null)
    or (checkin_method = 'manual' and checkin_session_id is null and btrim(checkin_note) <> '')
  );

-- 5. Self check-in by location. Mirrors check_in_to_dynamic_event's gates so
-- the two paths cannot drift apart on tenancy, membership or event validity.
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
    and event.counts_for_attendance
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

revoke all on function public.check_in_to_event_by_location(uuid, uuid, numeric, numeric) from public, anon;
grant execute on function public.check_in_to_event_by_location(uuid, uuid, numeric, numeric) to authenticated;

-- 6. Event creation accepts the venue. Adding parameters changes the function
-- identity, so the old signature has to go first.
drop function if exists public.create_club_event(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, integer, boolean);

create or replace function public.create_club_event(
  p_club_id uuid,
  p_event_type text,
  p_title text,
  p_description text,
  p_location text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_registration_deadline timestamptz,
  p_capacity integer,
  p_counts_for_attendance boolean,
  p_venue_latitude numeric default null,
  p_venue_longitude numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  created_event public.club_events;
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'event.manage')
     or not exists (select 1 from public.clubs where id = p_club_id and club_status = 'active') then
    raise exception using errcode = '42501', message = 'event_manage_required';
  end if;
  if p_event_type not in ('regular_meeting', 'board_meeting', 'service', 'joint_meeting', 'fireside', 'other')
     or btrim(coalesce(p_title, '')) = '' or char_length(btrim(p_title)) > 160
     or char_length(btrim(coalesce(p_description, ''))) > 5000
     or char_length(btrim(coalesce(p_location, ''))) > 300
     or p_starts_at is null or p_ends_at is null or p_registration_deadline is null
     or p_starts_at <= now() or p_ends_at <= p_starts_at
     or p_registration_deadline <= now() or p_registration_deadline > p_starts_at
     or (p_capacity is not null and (p_capacity < 1 or p_capacity > 10000)) then
    raise exception using errcode = '22023', message = 'invalid_event_input';
  end if;
  -- A half-set coordinate pair would create an event whose GPS check-in can
  -- never succeed, so reject it here rather than at check-in time.
  if num_nulls(p_venue_latitude, p_venue_longitude) = 1
     or (p_venue_latitude is not null
         and (p_venue_latitude < -90 or p_venue_latitude > 90
              or p_venue_longitude < -180 or p_venue_longitude > 180)) then
    raise exception using errcode = '22023', message = 'invalid_event_venue_location';
  end if;

  insert into public.club_events (
    club_id, event_type, title, description, location, starts_at, ends_at,
    registration_deadline, capacity, counts_for_attendance,
    venue_latitude, venue_longitude,
    created_by_app_account_id, updated_by_app_account_id
  ) values (
    p_club_id, p_event_type, btrim(p_title), btrim(coalesce(p_description, '')),
    btrim(coalesce(p_location, '')), p_starts_at, p_ends_at, p_registration_deadline,
    p_capacity, coalesce(p_counts_for_attendance, true),
    p_venue_latitude, p_venue_longitude, actor_id, actor_id
  ) returning * into created_event;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'event.created', 'club_event', created_event.id,
    jsonb_build_object(
      'event_type', created_event.event_type,
      'starts_at', created_event.starts_at,
      'venue_location_set', created_event.venue_latitude is not null
    ));

  return jsonb_build_object('event_id', created_event.id, 'status', created_event.event_status, 'version', created_event.version);
end;
$$;

revoke all on function public.create_club_event(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, integer, boolean, numeric, numeric) from public, anon;
grant execute on function public.create_club_event(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, integer, boolean, numeric, numeric) to authenticated;

-- 7. The event list tells the UI whether a GPS check-in is even possible.
-- It exposes only the boolean: members never need the venue coordinate, and
-- withholding it keeps the payload free of anything worth scraping.
create or replace function public.list_club_events(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  can_manage boolean := public.current_has_club_permission(p_club_id, 'event.manage');
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
      'venue_location_set', event.venue_latitude is not null,
      'registration_open', event.event_status = 'published'
        and now() <= event.registration_deadline
        and now() < event.starts_at
    ) order by event.starts_at, event.id), '[]'::jsonb)
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
      and (e.event_status in ('published', 'cancelled') or can_manage)
      and (e.starts_at >= now() - interval '30 days' or can_manage)
    group by e.id, mine.response, mine.guest_count, mine.note
    order by e.starts_at, e.id
    limit 200
  ) as event;

  return coalesce(result, jsonb_build_object('events', '[]'::jsonb));
end;
$$;

revoke all on function public.list_club_events(uuid) from public, anon;
grant execute on function public.list_club_events(uuid) to authenticated;

-- 8. The check-in screen has no event in hand (the QR path derives it from the
-- credential), so location check-in needs to know which events are live for
-- this member right now. Scoped to the caller's own active memberships.
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
     and event.counts_for_attendance
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

revoke all on function public.list_my_location_checkin_events() from public, anon;
grant execute on function public.list_my_location_checkin_events() to authenticated;

commit;
