-- Keep the legacy projection and JSON shape untouched. All authorization and
-- ranking rules remain in that projection; this only resolves its event IDs
-- within the same statement snapshot, without another network round trip.
create or replace function public.get_my_member_home_with_event_ids(p_club_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  home jsonb := public.get_my_member_home_projection(p_club_id);
  slot text;
  target_id uuid;
  primary_id uuid;
begin
  foreach slot in array array['primary_event', 'next_event'] loop
    if home->slot is null or home->slot = 'null'::jsonb then continue; end if;
    -- Equal start times are ordered by UUID in the original projection too.
    -- Match all identity fields, and gate the audience again so a hidden
    -- identical event cannot supply its identity instead.
    select event.id into target_id
    from public.club_events as event
    where event.club_id = p_club_id
      and event.event_status = 'published'
      and event.ends_at > now()
      and public.event_includes_current_member(event.id)
      and (slot <> 'next_event' or primary_id is null or event.id <> primary_id)
      and event.event_type = home->slot->>'event_type'
      and event.title = home->slot->>'title'
      and event.location = home->slot->>'location'
      and event.starts_at = (home->slot->>'starts_at')::timestamptz
      and event.ends_at = (home->slot->>'ends_at')::timestamptz
      and event.time_unspecified = (home->slot->>'time_unspecified')::boolean
      and event.cover_image_path is not distinct from (home->slot->>'cover_image_path')
    order by event.id limit 1;
    if target_id is null then
      raise exception using errcode = '42501', message = 'member_home_event_identity_unavailable';
    end if;
    if slot = 'primary_event' then primary_id := target_id; end if;
    home := jsonb_set(home, array[slot, 'event_id'], to_jsonb(target_id), true);
  end loop;
  return home;
end;
$$;

revoke all on function public.get_my_member_home_with_event_ids(uuid) from public, anon, authenticated;
grant execute on function public.get_my_member_home_with_event_ids(uuid) to authenticated;
