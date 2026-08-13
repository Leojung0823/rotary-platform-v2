begin;

-- Archiving is intentionally reversible (distinct from any future hard-delete
-- flow). club_status already allowed 'archived' since the original schema;
-- every member-facing and event/attendance RPC already gates on
-- club_status = 'active', so archiving a club locks it out of that surface
-- for free. Same platform-admin gate as club creation covers rename too.

create or replace function public.update_club_name(p_club_id uuid, p_club_name text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target_club public.clubs;
  normalized_name text := btrim(coalesce(p_club_name, ''));
begin
  if actor_id is null or not public.current_has_platform_role(array['superadmin', 'platform_admin']) then
    raise exception using errcode = '42501', message = 'platform_admin_required';
  end if;
  if normalized_name = '' or char_length(normalized_name) > 100 then
    raise exception using errcode = '22023', message = 'invalid_club_name';
  end if;

  select * into target_club from public.clubs where id = p_club_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'club_not_found';
  end if;

  update public.clubs set club_name = normalized_name where id = p_club_id
  returning * into target_club;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (target_club.id, actor_id, 'club.renamed', 'club', target_club.id,
    jsonb_build_object('club_name', normalized_name));

  return jsonb_build_object('club_id', target_club.id, 'club_name', target_club.club_name);
end;
$$;

create or replace function public.archive_club(p_club_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target_club public.clubs;
  previous_status text;
begin
  if actor_id is null or not public.current_has_platform_role(array['superadmin', 'platform_admin']) then
    raise exception using errcode = '42501', message = 'platform_admin_required';
  end if;

  select * into target_club from public.clubs where id = p_club_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'club_not_found';
  end if;

  if target_club.club_status = 'archived' then
    return jsonb_build_object('club_id', target_club.id, 'club_status', target_club.club_status, 'idempotent', true);
  end if;
  if target_club.club_status = 'provisioning' then
    raise exception using errcode = '23514', message = 'provisioning_club_cannot_be_archived';
  end if;

  previous_status := target_club.club_status;
  update public.clubs set club_status = 'archived' where id = p_club_id
  returning * into target_club;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (target_club.id, actor_id, 'club.archived', 'club', target_club.id,
    jsonb_build_object('previous_status', previous_status));

  return jsonb_build_object('club_id', target_club.id, 'club_status', target_club.club_status, 'idempotent', false);
end;
$$;

create or replace function public.unarchive_club(p_club_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target_club public.clubs;
begin
  if actor_id is null or not public.current_has_platform_role(array['superadmin', 'platform_admin']) then
    raise exception using errcode = '42501', message = 'platform_admin_required';
  end if;

  select * into target_club from public.clubs where id = p_club_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'club_not_found';
  end if;

  if target_club.club_status = 'active' then
    return jsonb_build_object('club_id', target_club.id, 'club_status', target_club.club_status, 'idempotent', true);
  end if;
  if target_club.club_status <> 'archived' then
    raise exception using errcode = '23514', message = 'club_not_archived';
  end if;

  update public.clubs set club_status = 'active' where id = p_club_id
  returning * into target_club;

  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id)
  values (target_club.id, actor_id, 'club.unarchived', 'club', target_club.id);

  return jsonb_build_object('club_id', target_club.id, 'club_status', target_club.club_status, 'idempotent', false);
end;
$$;

revoke all on function public.update_club_name(uuid, text) from public, anon, authenticated;
revoke all on function public.archive_club(uuid) from public, anon, authenticated;
revoke all on function public.unarchive_club(uuid) from public, anon, authenticated;
grant execute on function public.update_club_name(uuid, text) to authenticated;
grant execute on function public.archive_club(uuid) to authenticated;
grant execute on function public.unarchive_club(uuid) to authenticated;

commit;
