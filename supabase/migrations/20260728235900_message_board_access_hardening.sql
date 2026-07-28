begin;

create or replace function public.current_has_active_board_membership(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.app_accounts as account
    join public.club_memberships as membership
      on membership.person_id = account.person_id
    join public.clubs as club
      on club.id = membership.club_id
    where account.auth_user_id = auth.uid()
      and account.account_status = 'active'
      and membership.club_id = p_club_id
      and membership.membership_status = 'active'
      and club.club_status = 'active'
  )
$$;

create or replace function public.list_my_board_clubs()
returns table (club_id uuid, club_code text, club_name text)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select club.id, club.club_code, club.club_name
  from public.app_accounts as account
  join public.club_memberships as membership
    on membership.person_id = account.person_id
   and membership.membership_status = 'active'
  join public.clubs as club
    on club.id = membership.club_id
   and club.club_status = 'active'
  where account.auth_user_id = auth.uid()
    and account.account_status = 'active'
  order by club.club_name, club.id
$$;

revoke all on function public.current_has_active_board_membership(uuid) from public, anon, authenticated;
revoke all on function public.list_my_board_clubs() from public, anon;
grant execute on function public.list_my_board_clubs() to authenticated;

commit;
