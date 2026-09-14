begin;

-- Looking an address up costs a billed Google request, so the lookup is gated
-- on the same authority as creating the event it belongs to. The check itself
-- lives here rather than in the action: current_has_club_permission is revoked
-- from authenticated, which is correct -- a browser must not be able to ask
-- arbitrary permission questions -- so this exposes exactly one answer.

create or replace function public.current_can_manage_club_events(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.current_app_account_id() is not null
    and public.current_has_club_permission(p_club_id, 'event.manage')
$$;

revoke all on function public.current_can_manage_club_events(uuid) from public, anon;
grant execute on function public.current_can_manage_club_events(uuid) to authenticated;

commit;
