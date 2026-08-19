begin;

-- The events and directory pages each asked which clubs the caller belongs to,
-- then asked for the selected club's rows -- and the second question could not
-- start until the first was answered, because the selection is "the club in the
-- query string, otherwise the first one". On hosted Supabase a round trip costs
-- roughly a quarter of a second, so that ordering was worth ~250ms per page.
--
-- These wrappers move the selection into the database so both answers come back
-- together. They compose the existing functions rather than restating their
-- queries: authorization, filtering and ordering all stay defined in exactly one
-- place, and WITH ORDINALITY preserves each inner function's own ordering
-- without repeating its ORDER BY here.
--
-- Deliberately SECURITY INVOKER: every function called below is already
-- SECURITY DEFINER and performs its own authorization against the caller's JWT,
-- so the wrapper needs no privilege of its own. The only club id ever passed on
-- is one the caller's own club list returned.

create or replace function public.list_my_event_page(p_club_id uuid default null)
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
    events := public.list_club_events(selected);
  end if;

  return jsonb_build_object(
    'clubs', clubs,
    'selected_club_id', selected,
    'events', coalesce(events -> 'events', '[]'::jsonb)
  );
end;
$$;

create or replace function public.list_my_directory_page(
  p_club_id uuid default null,
  p_query text default null
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
  members jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(club) - 'ord' order by club.ord), '[]'::jsonb)
  into clubs
  from public.list_my_directory_clubs() with ordinality
    as club(club_id, club_code, club_name, ord);

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
    select coalesce(jsonb_agg(to_jsonb(member) - 'ord' order by member.ord), '[]'::jsonb)
    into members
    from public.list_club_member_directory(selected, p_query) with ordinality
      as member(
        membership_id, display_name, avatar_url, role_key, occupation,
        email, phone, birth_year, is_self, ord
      );
  end if;

  return jsonb_build_object(
    'clubs', clubs,
    'selected_club_id', selected,
    'members', coalesce(members, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.list_my_event_page(uuid) from public, anon;
grant execute on function public.list_my_event_page(uuid) to authenticated;
revoke all on function public.list_my_directory_page(uuid, text) from public, anon;
grant execute on function public.list_my_directory_page(uuid, text) to authenticated;

commit;
