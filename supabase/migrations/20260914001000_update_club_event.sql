begin;

-- Events could be created, published and cancelled, but never edited. A typo in
-- the address or a room change meant cancelling and rebuilding the event, which
-- loses every registration.
--
-- What editing a *published* event must not become:
--
--   * A way to rewrite history. Only a draft or published event that has not
--     finished may be edited, and the edit may not push it into the past.
--   * A way to strand registrations. Capacity cannot drop below the people
--     already registered, because nothing here decides who would lose a seat.
--   * A silent overwrite. club_events already carries a version; an edit that
--     names the version it read is refused if someone else changed the row
--     meanwhile, so two officers editing at once cannot clobber each other.
--
-- Product decision (2026-09-14): an edit notifies members only when the time or
-- the place changed. A typo fix must not push, and a room change must. So the
-- function reports whether those particular fields moved and leaves the sending
-- to the dispatcher, exactly as publishing does.
--
-- That required changing how pushes are deduplicated. The old rule was one push
-- per event, ever, which is right for "announce this once" and wrong the moment
-- an event can be edited twice. It is now one push per event *version*: each
-- edit bumps the version, so each edit may notify once, and retrying the same
-- edit cannot send twice.

create or replace function public.update_club_event(
  p_club_id uuid,
  p_event_id uuid,
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
  p_venue_longitude numeric default null,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_events;
  attending_count integer;
  changed jsonb;
begin
  if actor_id is null or not public.current_has_club_permission(p_club_id, 'event.manage')
     or not exists (select 1 from public.clubs where id = p_club_id and club_status = 'active') then
    raise exception using errcode = '42501', message = 'event_manage_required';
  end if;

  select event.* into target
  from public.club_events as event
  where event.id = p_event_id and event.club_id = p_club_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'event_not_found';
  end if;
  if target.event_status not in ('draft', 'published') then
    raise exception using errcode = '22023', message = 'event_not_editable';
  end if;
  if target.ends_at <= now() then
    raise exception using errcode = '22023', message = 'event_already_finished';
  end if;
  if p_expected_version is not null and p_expected_version <> target.version then
    raise exception using errcode = '40001', message = 'event_changed_elsewhere';
  end if;

  if p_event_type not in ('regular_meeting', 'board_meeting', 'service', 'joint_meeting', 'fireside', 'other')
     or btrim(coalesce(p_title, '')) = '' or char_length(btrim(p_title)) > 160
     or char_length(btrim(coalesce(p_description, ''))) > 5000
     or char_length(btrim(coalesce(p_location, ''))) > 300
     or p_starts_at is null or p_ends_at is null or p_registration_deadline is null
     or p_ends_at <= p_starts_at
     or p_registration_deadline > p_starts_at
     -- Unlike creation this does not require a future start: an event already
     -- under way still needs its address corrected. It does require the event
     -- to still be unfinished after the edit, so an edit cannot retire it.
     or p_ends_at <= now()
     or (p_capacity is not null and (p_capacity < 1 or p_capacity > 10000)) then
    raise exception using errcode = '22023', message = 'invalid_event_input';
  end if;

  if num_nulls(p_venue_latitude, p_venue_longitude) = 1
     or (p_venue_latitude is not null
         and (p_venue_latitude < -90 or p_venue_latitude > 90
              or p_venue_longitude < -180 or p_venue_longitude > 180)) then
    raise exception using errcode = '22023', message = 'invalid_event_venue_location';
  end if;

  select count(*)::integer into attending_count
  from public.event_registrations as registration
  where registration.event_id = target.id and registration.response = 'attending';

  if p_capacity is not null and p_capacity < attending_count then
    raise exception using errcode = '22023', message = 'capacity_below_registrations';
  end if;

  -- Recorded field by field: an attendee asking "wasn't it at 13:30?" has to be
  -- answerable, and the push that announced the event carried the old values.
  changed := jsonb_strip_nulls(jsonb_build_object(
    'event_type', case when target.event_type is distinct from p_event_type
      then jsonb_build_object('from', target.event_type, 'to', p_event_type) end,
    'title', case when target.title is distinct from btrim(p_title)
      then jsonb_build_object('from', target.title, 'to', btrim(p_title)) end,
    'location', case when target.location is distinct from btrim(coalesce(p_location, ''))
      then jsonb_build_object('from', target.location, 'to', btrim(coalesce(p_location, ''))) end,
    'starts_at', case when target.starts_at is distinct from p_starts_at
      then jsonb_build_object('from', target.starts_at, 'to', p_starts_at) end,
    'ends_at', case when target.ends_at is distinct from p_ends_at
      then jsonb_build_object('from', target.ends_at, 'to', p_ends_at) end,
    'registration_deadline', case when target.registration_deadline is distinct from p_registration_deadline
      then jsonb_build_object('from', target.registration_deadline, 'to', p_registration_deadline) end,
    'capacity', case when target.capacity is distinct from p_capacity
      then jsonb_build_object('from', target.capacity, 'to', p_capacity) end,
    'counts_for_attendance', case when target.counts_for_attendance is distinct from coalesce(p_counts_for_attendance, true)
      then jsonb_build_object('from', target.counts_for_attendance, 'to', coalesce(p_counts_for_attendance, true)) end,
    'venue_location_set', case when (target.venue_latitude is not null) is distinct from (p_venue_latitude is not null)
      then jsonb_build_object('from', target.venue_latitude is not null, 'to', p_venue_latitude is not null) end
  ));

  update public.club_events
  set event_type = p_event_type,
      title = btrim(p_title),
      description = btrim(coalesce(p_description, '')),
      location = btrim(coalesce(p_location, '')),
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      registration_deadline = p_registration_deadline,
      capacity = p_capacity,
      counts_for_attendance = coalesce(p_counts_for_attendance, true),
      venue_latitude = p_venue_latitude,
      venue_longitude = p_venue_longitude,
      updated_by_app_account_id = actor_id,
      version = target.version + 1,
      updated_at = now()
  where id = target.id
  returning * into target;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'event.updated', 'club_event', target.id,
    jsonb_build_object('event_status', target.event_status, 'changed', changed));

  return jsonb_build_object(
    'event_id', target.id,
    'status', target.event_status,
    'version', target.version,
    'changed_field_count', (select count(*) from jsonb_object_keys(changed)),
    -- Only a published event has an audience that was told anything, and only
    -- these three fields change what they were told about when and where.
    'notify_members', target.event_status = 'published' and (
      changed ? 'starts_at' or changed ? 'ends_at' or changed ? 'location'
    )
  );
end;
$$;

revoke all on function public.update_club_event(uuid, uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, integer, boolean, numeric, numeric, integer) from public, anon;
grant execute on function public.update_club_event(uuid, uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, integer, boolean, numeric, numeric, integer) to authenticated;

-- One push per event was right while an event could only be announced once.
-- Now that it can be edited, the key becomes the event version: each edit gets
-- one notification, and a retry of that edit gets none.
alter table public.line_push_logs
  add column if not exists source_event_version integer;

-- Existing announcements were all sent at the version the event carries now,
-- because nothing could edit an event before this migration.
update public.line_push_logs as log
set source_event_version = event.version
from public.club_events as event
where log.source_event_id = event.id
  and log.source_event_version is null;

drop index if exists line_push_logs_one_per_event;
create unique index line_push_logs_one_per_event_version
  on public.line_push_logs (source_event_id, source_event_version)
  where source_event_id is not null;

create or replace function public.record_club_event_line_push(
  p_club_id uuid,
  p_event_id uuid,
  p_recipient_count integer,
  p_payload_summary jsonb,
  p_delivery_status text,
  p_provider_request_id text default null,
  p_failure_code text default null,
  p_event_version integer default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  target_event public.club_events;
  oa_id uuid;
  push_id uuid;
  effective_version integer;
begin
  if not public.current_has_club_permission(p_club_id, 'event.manage') then
    raise exception using errcode = '42501', message = 'event_manage_required';
  end if;

  select event.* into target_event
  from public.club_events as event
  where event.id = p_event_id and event.club_id = p_club_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'event_not_found';
  end if;

  -- A caller that does not name a version means the event as it stands, which
  -- is what the publish path has always meant.
  effective_version := coalesce(p_event_version, target_event.version);

  select id into oa_id
  from public.line_oa_accounts
  where club_id = p_club_id and account_status <> 'disabled';
  if oa_id is null then
    raise exception using errcode = 'P0002', message = 'oa_not_configured';
  end if;

  select id into push_id
  from public.line_push_logs
  where source_event_id = p_event_id and source_event_version = effective_version;
  if push_id is not null then
    return push_id;
  end if;

  insert into public.line_push_logs (
    line_oa_account_id, club_id, requested_by_app_account_id, push_kind,
    recipient_count, payload_summary, delivery_status, provider_request_id,
    failure_code, completed_at, source_event_id, source_event_version
  ) values (
    oa_id, p_club_id, public.current_app_account_id(), 'multicast',
    greatest(p_recipient_count, 0), coalesce(p_payload_summary, '{}'::jsonb),
    p_delivery_status, p_provider_request_id, p_failure_code,
    case when p_delivery_status <> 'queued' then now() else null end,
    p_event_id, effective_version
  ) returning id into push_id;

  return push_id;
end;
$$;

revoke all on function public.record_club_event_line_push(uuid, uuid, integer, jsonb, text, text, text, integer) from public, anon;
grant execute on function public.record_club_event_line_push(uuid, uuid, integer, jsonb, text, text, text, integer) to authenticated;

commit;
