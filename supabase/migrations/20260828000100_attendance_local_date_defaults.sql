begin;

-- The attendance projection previously used the database session's
-- current_date for its implicit end date. Hosted Postgres runs in UTC, while
-- event_date is deliberately derived in each club's timezone. Around local
-- midnight that made a just-started local event disappear from the page.
-- Resolve both implicit bounds from the selected club's timezone. Explicit
-- bounds remain untouched.

create or replace function public.current_attendance_club_local_date(p_club_id uuid)
returns date
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  timezone_name text;
begin
  -- The projection wrappers run as the caller, so they cannot read clubs
  -- directly under the normal RLS boundary. Keep the narrow table lookup in a
  -- security-definer helper with the same membership/management guard.
  if p_club_id is null
     or (
       public.current_club_membership_id(p_club_id) is null
       and not public.current_has_club_permission(p_club_id, 'attendance.manage')
     ) then
    raise exception using errcode = '42501', message = 'attendance_club_access_required';
  end if;

  select coalesce(nullif(club.timezone_name, ''), 'UTC')
  into timezone_name
  from public.clubs as club
  where club.id = p_club_id
    and club.club_status = 'active';
  if not found then
    raise exception using errcode = '42501', message = 'attendance_club_access_required';
  end if;

  return (now() at time zone timezone_name)::date;
end;
$$;

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
  local_today date;
  date_from date := p_date_from;
  date_to date := p_date_to;
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
    local_today := public.current_attendance_club_local_date(selected);
  else
    local_today := current_date;
  end if;
  date_from := coalesce(date_from, public.current_rotary_year_start(local_today));
  date_to := coalesce(date_to, local_today);

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
  local_today date;
  date_from date := p_date_from;
  date_to date := p_date_to;
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
    local_today := public.current_attendance_club_local_date(selected);
  else
    local_today := current_date;
  end if;
  date_from := coalesce(date_from, public.current_rotary_year_start(local_today));
  date_to := coalesce(date_to, local_today);

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

-- CREATE OR REPLACE preserves the existing grants, but state the boundary
-- explicitly here so a future signature or privilege change cannot silently
-- make this page callable by an anonymous client.
revoke all on function public.current_attendance_club_local_date(uuid) from public, anon, authenticated;
grant execute on function public.current_attendance_club_local_date(uuid) to authenticated;
revoke all on function public.get_my_attendance_page(uuid, date, date) from public, anon;
grant execute on function public.get_my_attendance_page(uuid, date, date) to authenticated;
revoke all on function public.get_club_attendance_page(uuid, date, date, uuid) from public, anon;
grant execute on function public.get_club_attendance_page(uuid, date, date, uuid) to authenticated;

commit;
