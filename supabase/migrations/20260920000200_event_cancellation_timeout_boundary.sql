begin;

-- A cancellation also closes check-in sessions and revokes active QR
-- credentials through an AFTER UPDATE trigger. Keep that transaction bounded:
-- a lock or a slow trigger must return a retryable error rather than leaving
-- the officer's server action waiting indefinitely.
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

  -- The timeout is local to this function call. A failed cancellation rolls
  -- back atomically, so the officer can safely submit the same request again.
  set local lock_timeout = '8s';
  set local statement_timeout = '20s';

  begin
    select * into target from public.club_events
    where id = p_event_id and club_id = p_club_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'event_not_available'; end if;
    if target.event_status in ('cancelled', 'completed') then return; end if;
    update public.club_events set event_status = 'cancelled', cancellation_reason = reason,
      updated_by_app_account_id = actor_id where id = target.id;
    insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
    values (p_club_id, actor_id, 'event.cancelled', 'club_event', target.id,
      jsonb_build_object('reason', reason));
  exception
    when lock_not_available then
      raise exception using errcode = '55P03', message = 'event_cancel_lock_timeout';
    when query_canceled then
      raise exception using errcode = '57014', message = 'event_cancel_statement_timeout';
  end;
end;
$$;

revoke all on function public.cancel_club_event(uuid, uuid, text) from public, anon;
grant execute on function public.cancel_club_event(uuid, uuid, text) to authenticated;

commit;
