begin;

-- The club-affairs page is a member-facing read projection. The original
-- guard checked member.read, which is intentionally not granted to the
-- ordinary member role because that permission also covers administrative
-- directory reads. Keep that broader permission unchanged and add only the
-- narrow condition this projection needs: the caller's own active membership
-- in the requested club.
--
-- Extract the current function definition from PostgreSQL and replace only
-- its guard. This keeps the 20260916000200 officer-list hardening and the
-- 20260915000200 Rotary-year repair intact instead of restating the function
-- from memory.
do $migration$
declare
  function_definition text;
  old_guard constant text := $replace$if actor_id is null or not public.current_has_club_permission(p_club_id, 'member.read') then$replace$;
  new_guard constant text := $replace$if actor_id is null or not (
    public.current_has_club_permission(p_club_id, 'member.read')
    or exists (
      select 1
      from public.club_memberships as membership
      join public.app_accounts as account on account.person_id = membership.person_id
      where account.id = actor_id
        and membership.club_id = p_club_id
        and membership.membership_status = 'active'
    )
  ) then$replace$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.get_club_affairs_page(uuid,integer,boolean)'::pg_catalog.regprocedure
  ) into function_definition;

  if function_definition is null then
    raise exception 'get_club_affairs_page(uuid,integer,boolean) was not found';
  end if;
  if pg_catalog.strpos(function_definition, old_guard) = 0 then
    raise exception 'get_club_affairs_page guard no longer matches the expected current definition';
  end if;

  execute pg_catalog.replace(function_definition, old_guard, new_guard);
end;
$migration$;

commit;
