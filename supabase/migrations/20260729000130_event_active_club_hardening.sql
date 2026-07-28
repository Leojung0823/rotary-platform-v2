begin;

create or replace function public.current_can_manage_active_club_events(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.clubs as club
    where club.id = p_club_id
      and club.club_status = 'active'
  ) and public.current_has_club_permission(p_club_id, 'event.manage')
$$;

create or replace function public.publish_club_event(p_club_id uuid, p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_events;
begin
  if actor_id is null or not public.current_can_manage_active_club_events(p_club_id) then
    raise exception using errcode = '42501', message = 'event_manage_required';
  end if;
  select * into target from public.club_events
  where id = p_event_id and club_id = p_club_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'event_not_available'; end if;
  if target.event_status <> 'draft' or target.starts_at <= now() or target.registration_deadline <= now() then
    raise exception using errcode = '22023', message = 'event_cannot_be_published';
  end if;
  update public.club_events set event_status = 'published', updated_by_app_account_id = actor_id
  where id = target.id;
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id)
  values (p_club_id, actor_id, 'event.published', 'club_event', target.id);
end;
$$;

create or replace function public.cancel_club_event(p_club_id uuid, p_event_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := public.current_app_account_id();
  target public.club_events;
  reason text := btrim(coalesce(p_reason, ''));
begin
  if actor_id is null or not public.current_can_manage_active_club_events(p_club_id) then
    raise exception using errcode = '42501', message = 'event_manage_required';
  end if;
  if reason = '' or char_length(reason) > 500 then
    raise exception using errcode = '22023', message = 'invalid_event_cancellation';
  end if;
  select * into target from public.club_events
  where id = p_event_id and club_id = p_club_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'event_not_available'; end if;
  if target.event_status in ('cancelled', 'completed') then return; end if;
  update public.club_events set event_status = 'cancelled', cancellation_reason = reason,
    updated_by_app_account_id = actor_id where id = target.id;
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (p_club_id, actor_id, 'event.cancelled', 'club_event', target.id,
    jsonb_build_object('reason', reason));
end;
$$;

revoke all on function public.current_can_manage_active_club_events(uuid) from public, anon, authenticated;
revoke all on function public.publish_club_event(uuid, uuid) from public, anon;
revoke all on function public.cancel_club_event(uuid, uuid, text) from public, anon;
grant execute on function public.publish_club_event(uuid, uuid) to authenticated;
grant execute on function public.cancel_club_event(uuid, uuid, text) to authenticated;

commit;
