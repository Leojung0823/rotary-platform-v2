begin;

-- Keep the existing canonical club-management predicate, but harden the
-- platform/management rename path without changing club identity or code.
create or replace function public.update_club_name(p_club_id uuid, p_club_name text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target_club public.clubs;
  previous_name text;
  normalized_name text := btrim(coalesce(p_club_name, ''));
begin
  if actor_id is null or not public.current_can_manage_club(p_club_id) then
    raise exception using errcode = '42501', message = 'club_manager_required';
  end if;

  if char_length(normalized_name) < 2
     or char_length(normalized_name) > 100
     or normalized_name ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'invalid_club_name';
  end if;

  select * into target_club
  from public.clubs
  where id = p_club_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'club_not_found';
  end if;

  previous_name := target_club.club_name;
  if previous_name = normalized_name then
    return jsonb_build_object(
      'club_id', target_club.id,
      'club_name', target_club.club_name,
      'idempotent', true
    );
  end if;

  update public.clubs
  set club_name = normalized_name
  where id = p_club_id
  returning * into target_club;

  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    target_club.id,
    actor_id,
    'club.renamed',
    'club',
    target_club.id,
    jsonb_build_object(
      'club_name', normalized_name,
      'before', jsonb_build_object('club_name', previous_name),
      'after', jsonb_build_object('club_name', normalized_name)
    )
  );

  return jsonb_build_object(
    'club_id', target_club.id,
    'club_name', target_club.club_name,
    'idempotent', false
  );
end;
$$;

revoke all on function public.update_club_name(uuid, text) from public, anon, authenticated;
grant execute on function public.update_club_name(uuid, text) to authenticated;

commit;
