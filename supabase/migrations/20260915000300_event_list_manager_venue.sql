begin;

-- The edit-published-event page could never load an event, and would have
-- destroyed data if it had.
--
-- This list returns only `venue_location_set` -- whether a location was set --
-- because a member has no business reading the coordinates of a venue. That is
-- right for a member and wrong for the officer editing the event: with no way
-- to read the current coordinates the edit form had nothing to pre-fill, so
-- saving any edit would have written null over them and silently lost the
-- geocoded location that the address lookup exists to produce.
--
-- The coordinates are added for callers who can manage the event. Everything
-- else about this function, including which rows a member sees and how far
-- back the list reaches, is carried over unchanged -- restated from the
-- current definition rather than rewritten from memory.

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
        and now() <= event.registration_deadline
        and now() < event.starts_at
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

commit;
