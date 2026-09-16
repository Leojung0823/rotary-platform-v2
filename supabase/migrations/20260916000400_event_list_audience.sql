begin;

-- 編輯活動時要看得到目前的發送對象。
--
-- The edit page renders the audience picker, but nothing ever told it what the
-- event's audience is, so it opened on "whole club" for every event -- for a
-- targeted one too. An officer who changed it found nothing had changed
-- (updateEventAction never saved it either), and once saving worked, opening
-- the page and saving anything else would have quietly widened the audience to
-- the whole club.
--
-- Restated from the current definition with two fields added, both gated on
-- can_manage like the venue coordinates beside them; nothing else changes.

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
        and now() < event.starts_at,
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

commit;
