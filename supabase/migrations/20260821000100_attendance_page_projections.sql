begin;

-- The attendance domain (20260811000100) already answers every attendance
-- question this platform needs, but nothing has ever called it: there was no
-- UI. These functions are the projection layer that the attendance pages read.
--
-- Two concerns are handled here:
--
-- 1. A club list for the manager's event picker. The roster function's
--    authority is 'attendance.manage' -- not event.read -- so listing the
--    events a manager may take a roster for is an attendance-domain question
--    and is answered here with the same guard, rather than by borrowing
--    list_club_events (whose guard is current_can_access_club_events, an
--    authority an attendance manager is not guaranteed to hold).
--
-- 2. Round trips. Both pages otherwise have to ask "which clubs am I in",
--    wait, then ask for that club's numbers -- and on hosted Supabase each
--    sequential round trip costs roughly 180ms. The page wrappers move the
--    club selection into the database so one call returns everything, in the
--    same shape and for the same reason as list_my_event_page.

create or replace function public.current_rotary_year_start(p_today date default current_date)
returns date
language sql
immutable
set search_path = pg_catalog
as $$
  -- The Rotary year runs 1 July to 30 June. Derived rather than read from
  -- public.rotary_years so the attendance pages work for clubs that have not
  -- configured their archive years yet.
  select make_date(
    extract(year from p_today)::integer - case when extract(month from p_today) >= 7 then 0 else 1 end,
    7,
    1
  )
$$;

create or replace function public.list_club_attendance_events(
  p_club_id uuid,
  p_date_from date,
  p_date_to date
)
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
  if actor_id is null
     or not public.current_has_club_permission(p_club_id, 'attendance.manage')
     or not exists (select 1 from public.clubs where id = p_club_id and club_status = 'active') then
    raise exception using errcode = '42501', message = 'attendance_manage_required';
  end if;
  if not public.attendance_date_range_is_valid(p_date_from, p_date_to) then
    raise exception using errcode = '22023', message = 'invalid_attendance_date_range';
  end if;

  -- Deliberately no per-event attendance tallies: that would mean evaluating
  -- attendance_result_for_member for every member of every event on a page
  -- load. The club summary already gives the aggregate and the roster gives
  -- the detail for the one event a manager opens.
  select jsonb_build_object(
    'events', coalesce(jsonb_agg(jsonb_build_object(
      'event_id', row.id,
      'title', row.title,
      'starts_at', row.starts_at,
      'event_date', row.event_date,
      'status', row.event_status
    ) order by row.starts_at desc, row.id desc), '[]'::jsonb)
  ) into result
  from (
    select event.id,
      event.title,
      event.starts_at,
      event.event_status,
      (event.starts_at at time zone club.timezone_name)::date as event_date
    from public.club_events as event
    join public.clubs as club on club.id = event.club_id
    where event.club_id = p_club_id
      and event.event_status in ('published', 'completed')
      and event.counts_for_attendance
      and event.starts_at <= now()
      and (event.starts_at at time zone club.timezone_name)::date between p_date_from and p_date_to
    order by event.starts_at desc, event.id desc
    limit 500
  ) as row;

  return coalesce(result, jsonb_build_object('events', '[]'::jsonb));
end;
$$;

-- Deliberately SECURITY INVOKER: every function called below is already
-- SECURITY DEFINER and authorizes against the caller's own JWT, so these
-- wrappers need no privilege of their own, and the only club id ever passed
-- on is one the caller's own club list returned.

create or replace function public.get_my_attendance_page(
  p_club_id uuid default null,
  p_date_from date default null,
  p_date_to date default null
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
  date_from date := coalesce(p_date_from, public.current_rotary_year_start());
  date_to date := coalesce(p_date_to, current_date);
  summary jsonb;
  history jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(club) - 'ord' order by club.ord), '[]'::jsonb)
  into clubs
  from public.list_my_attendance_clubs() with ordinality
    as club(club_id, club_code, club_name, membership_id, can_manage, ord);

  -- Only clubs where the caller actually holds a membership can answer "my"
  -- attendance; list_my_attendance_clubs also returns clubs the caller merely
  -- manages, and the summary function rejects those.
  if p_club_id is not null then
    select (entry->>'club_id')::uuid into selected
    from jsonb_array_elements(clubs) as entry
    where (entry->>'club_id')::uuid = p_club_id
      and entry->>'membership_id' is not null
    limit 1;
  end if;
  if selected is null then
    select (entry->>'club_id')::uuid into selected
    from jsonb_array_elements(clubs) as entry
    where entry->>'membership_id' is not null
    limit 1;
  end if;

  if selected is not null then
    summary := public.get_my_attendance_summary(selected, date_from, date_to);
    history := public.list_my_attendance_history(selected, date_from, date_to);
  end if;

  return jsonb_build_object(
    'clubs', clubs,
    'selected_club_id', selected,
    'date_from', date_from,
    'date_to', date_to,
    'summary', summary,
    'records', coalesce(history -> 'records', '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_club_attendance_page(
  p_club_id uuid default null,
  p_date_from date default null,
  p_date_to date default null,
  p_event_id uuid default null
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
  date_from date := coalesce(p_date_from, public.current_rotary_year_start());
  date_to date := coalesce(p_date_to, current_date);
  summary jsonb;
  events jsonb;
  roster jsonb;
  roster_event uuid;
begin
  select coalesce(jsonb_agg(to_jsonb(club) - 'ord' order by club.ord), '[]'::jsonb)
  into clubs
  from public.list_my_attendance_clubs() with ordinality
    as club(club_id, club_code, club_name, membership_id, can_manage, ord)
  where club.can_manage;

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
    summary := public.get_club_attendance_summary(selected, date_from, date_to);
    events := public.list_club_attendance_events(selected, date_from, date_to);

    -- Only take a roster for an event this same call already listed, so a
    -- stale or forged event id renders an empty picker instead of raising
    -- event_not_available and failing the whole page.
    if p_event_id is not null then
      select (entry->>'event_id')::uuid into roster_event
      from jsonb_array_elements(events -> 'events') as entry
      where (entry->>'event_id')::uuid = p_event_id
      limit 1;
    end if;
    if roster_event is not null then
      roster := public.get_event_attendance_roster(selected, roster_event);
    end if;
  end if;

  return jsonb_build_object(
    'clubs', clubs,
    'selected_club_id', selected,
    'date_from', date_from,
    'date_to', date_to,
    'summary', summary,
    'events', coalesce(events -> 'events', '[]'::jsonb),
    'selected_event_id', roster_event,
    'roster', roster
  );
end;
$$;

revoke all on function public.current_rotary_year_start(date) from public, anon;
grant execute on function public.current_rotary_year_start(date) to authenticated;
revoke all on function public.list_club_attendance_events(uuid, date, date) from public, anon;
grant execute on function public.list_club_attendance_events(uuid, date, date) to authenticated;
revoke all on function public.get_my_attendance_page(uuid, date, date) from public, anon;
grant execute on function public.get_my_attendance_page(uuid, date, date) to authenticated;
revoke all on function public.get_club_attendance_page(uuid, date, date, uuid) from public, anon;
grant execute on function public.get_club_attendance_page(uuid, date, date, uuid) to authenticated;

commit;
