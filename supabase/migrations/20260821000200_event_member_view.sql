begin;

-- A club officer is also an ordinary member, and while they are in member mode
-- the events page must show them exactly what a member sees -- no drafts, no
-- management controls, and their own check-in available. Previously the page
-- keyed off permission alone, so a president could never see the member view
-- of their own club's events.
--
-- The member/manager distinction is a single boolean inside list_club_events
-- (which statuses are visible, how far back, and the per-row can_manage flag
-- all derive from it), so asking "answer as a member" only needs that value
-- forced false. Both functions are recreated rather than replaced because
-- adding a defaulted parameter to an existing signature would leave the old
-- one callable and the call ambiguous.

drop function if exists public.list_my_event_page(uuid);
drop function if exists public.list_club_events(uuid);

create function public.list_club_events(p_club_id uuid, p_as_member boolean default false)
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

create function public.list_my_event_page(
  p_club_id uuid default null,
  p_as_member boolean default false
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, auth
as $$
declare
  clubs jsonb;
  selected uuid;
  events jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(club) - 'ord' order by club.ord), '[]'::jsonb)
  into clubs
  from public.list_my_event_clubs() with ordinality
    as club(club_id, club_code, club_name, can_manage, can_register, ord);

  if p_club_id is not null then
    select (entry->>'club_id')::uuid into selected
    from jsonb_array_elements(clubs) as entry
    where (entry->>'club_id')::uuid = p_club_id
    limit 1;
  end if;
  if selected is null then
    selected := (clubs->0->>'club_id')::uuid;
  end if;

  if selected is not null then
    events := public.list_club_events(selected, p_as_member);
  end if;

  return jsonb_build_object(
    'clubs', clubs,
    'selected_club_id', selected,
    'events', coalesce(events -> 'events', '[]'::jsonb)
  );
end;
$$;

revoke all on function public.list_club_events(uuid, boolean) from public, anon;
grant execute on function public.list_club_events(uuid, boolean) to authenticated;
revoke all on function public.list_my_event_page(uuid, boolean) from public, anon;
grant execute on function public.list_my_event_page(uuid, boolean) to authenticated;

commit;
