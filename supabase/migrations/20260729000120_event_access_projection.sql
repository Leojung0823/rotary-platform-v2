begin;

drop function public.list_my_event_clubs();

create function public.list_my_event_clubs()
returns table (
  club_id uuid,
  club_code text,
  club_name text,
  can_manage boolean,
  can_register boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select club.id,
    club.club_code,
    club.club_name,
    public.current_has_club_permission(club.id, 'event.manage') as can_manage,
    public.current_has_active_event_membership(club.id) as can_register
  from public.clubs as club
  where club.club_status = 'active'
    and public.current_can_access_club_events(club.id)
  order by club.club_name, club.id
$$;

revoke all on function public.list_my_event_clubs() from public, anon;
grant execute on function public.list_my_event_clubs() to authenticated;

commit;
