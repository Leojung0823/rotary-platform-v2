begin;

-- One event, by id, for the detail page.
--
-- It composes list_club_events rather than selecting the event directly: that
-- function already decides who may see an event -- draft visibility, the
-- 30-day window, and the audience -- and restating any of it here would give
-- the detail page a second, quietly diverging answer to "may I see this".
--
-- SECURITY DEFINER is needed for one thing only: mapping an event id to its
-- club, since application roles cannot read the table directly. That lookup
-- reveals nothing on its own, and every visibility decision still comes from
-- list_club_events evaluated against the caller''s own identity. Resolving the
-- club from the event rather than trusting one supplied alongside it is also
-- what stops a caller pairing an event id with a club they happen to belong
-- to.

create or replace function public.get_my_club_event(
  p_event_id uuid,
  p_as_member boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  club uuid;
  events jsonb;
  found jsonb;
begin
  select club_id into club from public.club_events where id = p_event_id;
  if club is null then
    return null;
  end if;

  -- Raises if the caller may not read this club's events at all.
  events := public.list_club_events(club, p_as_member);

  select entry into found
  from jsonb_array_elements(events -> 'events') as entry
  where (entry->>'id')::uuid = p_event_id
  limit 1;

  -- Absent means the event exists but is not for this caller, which is the
  -- same answer as "no such event" -- deliberately indistinguishable.
  if found is null then
    return null;
  end if;

  -- Whether the event is running is decided here rather than in the browser:
  -- the database is already the clock for registration_open, and a page that
  -- computed it from the viewer's device would offer check-in at the wrong
  -- moment to anyone whose clock or timezone differs.
  return jsonb_build_object(
    'club_id', club,
    'event', found,
    'happening_now', (found->>'status') = 'published'
      and (found->>'counts_for_attendance')::boolean
      and now() between (found->>'starts_at')::timestamptz and (found->>'ends_at')::timestamptz,
    'is_past', now() > (found->>'ends_at')::timestamptz
  );
end;
$$;

revoke all on function public.get_my_club_event(uuid, boolean) from public, anon;
grant execute on function public.get_my_club_event(uuid, boolean) to authenticated;

commit;
