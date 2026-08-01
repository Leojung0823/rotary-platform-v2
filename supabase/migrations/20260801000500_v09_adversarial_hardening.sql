begin;

-- Publication metadata is initialized only by the two trusted publication
-- paths. Direct table writes (including the service-role REST surface) cannot
-- manufacture a published state or rewind an existing lifecycle.
create or replace function public.v09_announcement_protect_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.id is distinct from new.id
    or old.club_id is distinct from new.club_id
    or old.created_by_account_id is distinct from new.created_by_account_id
    or old.created_at is distinct from new.created_at then
    raise exception using errcode = '23514', message = 'announcement_identity_immutable';
  end if;

  if old.status is distinct from new.status and not (
    (old.status = 'draft' and new.status in ('scheduled', 'published', 'cancelled'))
    or (old.status = 'scheduled' and new.status in ('published', 'cancelled'))
    or (old.status = 'published' and new.status in ('expired', 'cancelled', 'archived'))
    or (old.status in ('expired', 'cancelled') and new.status = 'archived')
  ) then
    raise exception using errcode = '23514', message = 'announcement_transition_immutable';
  end if;

  if new.status = 'published'
    and old.status is distinct from new.status
    and current_setting('v09.publish_transition', true) <> 'authorized' then
    raise exception using errcode = '23514', message = 'announcement_publish_transition_denied';
  end if;

  if old.published_by_account_id is distinct from new.published_by_account_id
    or old.published_at is distinct from new.published_at then
    if old.published_by_account_id is not null
      or old.published_at is not null
      or old.status not in ('draft', 'scheduled')
      or new.status <> 'published'
      or new.published_by_account_id is null
      or new.published_at is null
      or current_setting('v09.publish_transition', true) <> 'authorized' then
      raise exception using errcode = '23514', message = 'announcement_identity_immutable';
    end if;
  end if;

  if old.status in ('published', 'expired', 'cancelled', 'archived')
    and (old.title is distinct from new.title or old.body is distinct from new.body) then
    raise exception using errcode = '23514', message = 'published_announcement_content_immutable';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.publish_club_announcement(
  p_club_id uuid,
  p_announcement_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare actor_id uuid := public.current_app_account_id(); result jsonb;
begin
  if not public.v09_manage_allowed(p_club_id) then
    raise exception using errcode = '42501', message = 'announcement_manage_denied';
  end if;
  perform set_config('v09.publish_transition', 'authorized', true);
  result := public.v09_publish_announcement_locked(
    p_club_id, p_announcement_id, actor_id, 'announcement.published'
  );
  perform set_config('v09.publish_transition', '', true);
  return result;
end;
$$;

drop function public.complete_scheduled_announcement_claim(uuid, text);
drop function public.fail_scheduled_announcement_claim(uuid, text, text);

create function public.complete_scheduled_announcement_claim(
  p_announcement_id uuid,
  p_claim_token text,
  p_worker_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.club_announcements;
  result jsonb;
begin
  if p_announcement_id is null
     or btrim(coalesce(p_claim_token, '')) = ''
     or not public.v09_worker_id_is_valid(p_worker_id) then
    raise exception using errcode = '22023', message = 'worker_input_invalid';
  end if;
  select * into target from public.club_announcements where id = p_announcement_id for update;
  if not found
     or target.status <> 'scheduled'
     or target.schedule_lease_expires_at <= clock_timestamp()
     or target.schedule_claim_token_hash is distinct from public.v09_claim_token_hash(p_claim_token)
     or target.schedule_worker_hash is distinct from public.v09_claim_token_hash(p_worker_id) then
    raise exception using errcode = 'P0002', message = 'worker_claim_not_available';
  end if;
  perform set_config('v09.publish_transition', 'authorized', true);
  result := public.v09_publish_announcement_locked(target.club_id, target.id, null, 'announcement.worker_published');
  perform set_config('v09.publish_transition', '', true);
  update public.club_announcements
  set schedule_claimed_at = null, schedule_lease_expires_at = null,
      schedule_claim_token_hash = null, schedule_worker_hash = null, schedule_error_code = null
  where id = target.id;
  return result;
end;
$$;

create function public.fail_scheduled_announcement_claim(
  p_announcement_id uuid,
  p_claim_token text,
  p_worker_id text,
  p_error_code text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare target public.club_announcements; retryable boolean;
begin
  if p_error_code not in ('worker_temporary', 'database_temporary', 'worker_permanent', 'club_unavailable')
     or not public.v09_worker_id_is_valid(p_worker_id) then
    raise exception using errcode = '22023', message = 'worker_input_invalid';
  end if;
  retryable := p_error_code in ('worker_temporary', 'database_temporary');
  select * into target from public.club_announcements where id = p_announcement_id for update;
  if not found or target.status <> 'scheduled'
     or target.schedule_claim_token_hash is distinct from public.v09_claim_token_hash(p_claim_token)
     or target.schedule_worker_hash is distinct from public.v09_claim_token_hash(p_worker_id) then
    raise exception using errcode = 'P0002', message = 'worker_claim_not_available';
  end if;
  if retryable and target.schedule_attempt_count < target.schedule_max_attempts then
    update public.club_announcements
    set next_schedule_attempt_at = clock_timestamp() + make_interval(secs => public.v09_retry_backoff_seconds(target.schedule_attempt_count)),
        schedule_claimed_at = null, schedule_lease_expires_at = null, schedule_claim_token_hash = null,
        schedule_worker_hash = null, schedule_error_code = p_error_code
    where id = target.id;
    return 'retry_wait';
  end if;
  update public.club_announcements
  set status = 'cancelled', cancelled_at = clock_timestamp(), cancelled_by_account_id = target.created_by_account_id,
      cancel_reason = 'scheduled_delivery_failed', schedule_claimed_at = null, schedule_lease_expires_at = null,
      schedule_claim_token_hash = null, schedule_worker_hash = null, schedule_error_code = p_error_code
  where id = target.id;
  perform public.v09_append_version(target.id, target.created_by_account_id, 'schedule_failed');
  insert into public.audit_logs (club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata)
  values (target.club_id, null, 'announcement.worker_failed', 'announcement', target.id,
    jsonb_build_object('error_code', p_error_code, 'attempt_count', target.schedule_attempt_count));
  return 'failed';
end;
$$;

drop function public.complete_notification_delivery(uuid, text, text);
drop function public.fail_notification_delivery(uuid, text, text);

create function public.complete_notification_delivery(
  p_delivery_id uuid,
  p_claim_token text,
  p_worker_id text,
  p_provider_message_reference text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare target public.notification_deliveries;
begin
  if char_length(btrim(coalesce(p_provider_message_reference, ''))) not between 1 and 200
     or p_provider_message_reference !~ '^[A-Za-z0-9._:-]+$'
     or not public.v09_worker_id_is_valid(p_worker_id) then
    raise exception using errcode = '22023', message = 'worker_input_invalid';
  end if;
  select * into target from public.notification_deliveries where id = p_delivery_id for update;
  if not found or target.status <> 'processing' or target.lease_expires_at <= clock_timestamp()
     or target.claim_token_hash is distinct from public.v09_claim_token_hash(p_claim_token)
     or target.claimed_by_worker_hash is distinct from public.v09_claim_token_hash(p_worker_id) then
    raise exception using errcode = 'P0002', message = 'worker_claim_not_available';
  end if;
  update public.notification_deliveries
  set status = 'sent', sent_at = clock_timestamp(), failed_at = null,
      provider_message_id_hash = public.v09_claim_token_hash(p_provider_message_reference),
      claimed_at = null, lease_expires_at = null, claim_token_hash = null,
      claimed_by_worker_hash = null, generalized_error_code = null
  where id = target.id;
end;
$$;

create function public.fail_notification_delivery(
  p_delivery_id uuid,
  p_claim_token text,
  p_worker_id text,
  p_error_code text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare target public.notification_deliveries; retryable boolean;
begin
  if p_error_code not in ('provider_temporary', 'network_temporary', 'rate_limited', 'provider_permanent', 'recipient_unavailable', 'disabled')
     or not public.v09_worker_id_is_valid(p_worker_id) then
    raise exception using errcode = '22023', message = 'worker_input_invalid';
  end if;
  retryable := p_error_code in ('provider_temporary', 'network_temporary', 'rate_limited');
  select * into target from public.notification_deliveries where id = p_delivery_id for update;
  if not found or target.status <> 'processing'
     or target.claim_token_hash is distinct from public.v09_claim_token_hash(p_claim_token)
     or target.claimed_by_worker_hash is distinct from public.v09_claim_token_hash(p_worker_id) then
    raise exception using errcode = 'P0002', message = 'worker_claim_not_available';
  end if;
  if retryable and target.attempt_count < target.max_attempts then
    update public.notification_deliveries
    set status = 'retry_wait', next_attempt_at = clock_timestamp() + make_interval(secs => public.v09_retry_backoff_seconds(target.attempt_count)),
        claimed_at = null, lease_expires_at = null, claim_token_hash = null,
        claimed_by_worker_hash = null, generalized_error_code = p_error_code
    where id = target.id;
    return 'retry_wait';
  end if;
  update public.notification_deliveries
  set status = 'failed', failed_at = clock_timestamp(), claimed_at = null,
      lease_expires_at = null, claim_token_hash = null, claimed_by_worker_hash = null,
      generalized_error_code = p_error_code
  where id = target.id;
  return 'failed';
end;
$$;

revoke all on function public.complete_scheduled_announcement_claim(uuid, text, text) from public, anon, authenticated;
revoke all on function public.fail_scheduled_announcement_claim(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.complete_notification_delivery(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.fail_notification_delivery(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_scheduled_announcement_claim(uuid, text, text) to service_role;
grant execute on function public.fail_scheduled_announcement_claim(uuid, text, text, text) to service_role;
grant execute on function public.complete_notification_delivery(uuid, text, text, text) to service_role;
grant execute on function public.fail_notification_delivery(uuid, text, text, text) to service_role;

commit;
