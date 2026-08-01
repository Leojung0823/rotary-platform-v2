begin;

alter table public.club_announcements
  add column schedule_attempt_count integer not null default 0,
  add column schedule_max_attempts integer not null default 3,
  add column next_schedule_attempt_at timestamptz not null default clock_timestamp(),
  add column schedule_claimed_at timestamptz,
  add column schedule_lease_expires_at timestamptz,
  add column schedule_claim_token_hash text,
  add column schedule_worker_hash text,
  add column schedule_error_code text,
  add constraint club_announcements_schedule_attempts_check
    check (schedule_attempt_count >= 0 and schedule_max_attempts between 1 and 10),
  add constraint club_announcements_schedule_claim_check
    check (
      (schedule_claimed_at is null and schedule_lease_expires_at is null
        and schedule_claim_token_hash is null and schedule_worker_hash is null)
      or (schedule_claimed_at is not null and schedule_lease_expires_at > schedule_claimed_at
        and schedule_claim_token_hash is not null and schedule_worker_hash is not null)
    );

create index club_announcements_schedule_claim_idx
  on public.club_announcements (next_schedule_attempt_at, publish_at, id)
  where status = 'scheduled';

alter table public.notification_deliveries
  add column lease_expires_at timestamptz,
  add column claimed_by_worker_hash text,
  add constraint notification_deliveries_lease_check
    check (
      status <> 'processing'
      or (
        claimed_at is not null
        and lease_expires_at > claimed_at
        and claim_token_hash is not null
        and claimed_by_worker_hash is not null
      )
    );

create or replace function public.v09_worker_id_is_valid(p_worker_id text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_worker_id is not null
    and char_length(p_worker_id) between 3 and 64
    and p_worker_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,63}$'
$$;

create or replace function public.v09_claim_token_hash(p_claim_token text)
returns text
language sql
immutable
set search_path = pg_catalog, extensions
as $$
  select encode(extensions.digest(p_claim_token, 'sha256'), 'hex')
$$;

create or replace function public.v09_retry_backoff_seconds(p_attempt_count integer)
returns integer
language sql
immutable
set search_path = pg_catalog
as $$
  select least(3600, (30 * power(2, greatest(0, least(p_attempt_count, 10) - 1)))::integer)
$$;

create or replace function public.claim_due_scheduled_announcements(
  p_limit integer,
  p_worker_id text
)
returns table (
  announcement_id uuid,
  club_id uuid,
  claim_token text,
  attempt_count integer,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  claimed record;
  exhausted record;
  token_value text;
begin
  if p_limit is null or p_limit < 1 or p_limit > 50
     or not public.v09_worker_id_is_valid(p_worker_id) then
    raise exception using errcode = '22023', message = 'worker_input_invalid';
  end if;

  -- A worker can disappear after claiming its final permitted attempt. Finalize
  -- those expired leases before selecting new claims so no scheduled row is
  -- left permanently stranded at its retry ceiling.
  for exhausted in
    select announcement.id, announcement.club_id, announcement.created_by_account_id,
      announcement.schedule_attempt_count, announcement.schedule_error_code
    from public.club_announcements as announcement
    join public.clubs as club on club.id = announcement.club_id
    where announcement.status = 'scheduled'
      and announcement.publish_at <= clock_timestamp()
      and club.club_status = 'active'
      and announcement.schedule_attempt_count >= announcement.schedule_max_attempts
      and (
        announcement.schedule_lease_expires_at is null
        or announcement.schedule_lease_expires_at <= clock_timestamp()
      )
    order by announcement.publish_at, announcement.id
    for update of announcement skip locked
    limit p_limit
  loop
    update public.club_announcements
    set status = 'cancelled',
        cancelled_at = clock_timestamp(),
        cancelled_by_account_id = exhausted.created_by_account_id,
        cancel_reason = 'scheduled_delivery_failed',
        schedule_claimed_at = null,
        schedule_lease_expires_at = null,
        schedule_claim_token_hash = null,
        schedule_worker_hash = null,
        schedule_error_code = coalesce(exhausted.schedule_error_code, 'worker_timeout')
    where id = exhausted.id;
    perform public.v09_append_version(exhausted.id, exhausted.created_by_account_id, 'schedule_exhausted');
    insert into public.audit_logs (
      club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
    ) values (
      exhausted.club_id, null, 'announcement.worker_exhausted', 'announcement', exhausted.id,
      jsonb_build_object('attempt_count', exhausted.schedule_attempt_count)
    );
  end loop;

  for claimed in
    select announcement.id, announcement.club_id
    from public.club_announcements as announcement
    join public.clubs as club on club.id = announcement.club_id
    where announcement.status = 'scheduled'
      and announcement.publish_at <= clock_timestamp()
      and announcement.next_schedule_attempt_at <= clock_timestamp()
      and club.club_status = 'active'
      and (
        announcement.schedule_lease_expires_at is null
        or announcement.schedule_lease_expires_at <= clock_timestamp()
      )
      and announcement.schedule_attempt_count < announcement.schedule_max_attempts
    order by announcement.publish_at, announcement.id
    for update of announcement skip locked
    limit p_limit
  loop
    token_value := extensions.gen_random_uuid()::text;
    update public.club_announcements
    set schedule_attempt_count = schedule_attempt_count + 1,
        schedule_claimed_at = clock_timestamp(),
        schedule_lease_expires_at = clock_timestamp() + interval '5 minutes',
        schedule_claim_token_hash = public.v09_claim_token_hash(token_value),
        schedule_worker_hash = public.v09_claim_token_hash(p_worker_id),
        schedule_error_code = null
    where id = claimed.id;

    announcement_id := claimed.id;
    club_id := claimed.club_id;
    claim_token := token_value;
    select announcement.schedule_attempt_count, announcement.schedule_lease_expires_at
      into attempt_count, lease_expires_at
    from public.club_announcements as announcement
    where announcement.id = claimed.id;
    return next;
  end loop;
end;
$$;

create or replace function public.complete_scheduled_announcement_claim(
  p_announcement_id uuid,
  p_claim_token text
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
  if p_announcement_id is null or btrim(coalesce(p_claim_token, '')) = '' then
    raise exception using errcode = '22023', message = 'worker_input_invalid';
  end if;
  select * into target
  from public.club_announcements
  where id = p_announcement_id
  for update;
  if not found
     or target.status <> 'scheduled'
     or target.schedule_lease_expires_at <= clock_timestamp()
     or target.schedule_claim_token_hash is distinct from public.v09_claim_token_hash(p_claim_token) then
    raise exception using errcode = 'P0002', message = 'worker_claim_not_available';
  end if;

  result := public.v09_publish_announcement_locked(
    target.club_id, target.id, null, 'announcement.worker_published'
  );
  update public.club_announcements
  set schedule_claimed_at = null,
      schedule_lease_expires_at = null,
      schedule_claim_token_hash = null,
      schedule_worker_hash = null,
      schedule_error_code = null
  where id = target.id;
  return result;
end;
$$;

create or replace function public.fail_scheduled_announcement_claim(
  p_announcement_id uuid,
  p_claim_token text,
  p_error_code text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.club_announcements;
  retryable boolean;
begin
  if p_error_code not in (
    'worker_temporary', 'database_temporary', 'worker_permanent', 'club_unavailable'
  ) then
    raise exception using errcode = '22023', message = 'worker_input_invalid';
  end if;
  retryable := p_error_code in ('worker_temporary', 'database_temporary');
  select * into target from public.club_announcements
  where id = p_announcement_id for update;
  if not found
     or target.status <> 'scheduled'
     or target.schedule_claim_token_hash is distinct from public.v09_claim_token_hash(p_claim_token) then
    raise exception using errcode = 'P0002', message = 'worker_claim_not_available';
  end if;

  if retryable and target.schedule_attempt_count < target.schedule_max_attempts then
    update public.club_announcements
    set next_schedule_attempt_at = clock_timestamp() + make_interval(
          secs => public.v09_retry_backoff_seconds(target.schedule_attempt_count)
        ),
        schedule_claimed_at = null,
        schedule_lease_expires_at = null,
        schedule_claim_token_hash = null,
        schedule_worker_hash = null,
        schedule_error_code = p_error_code
    where id = target.id;
    return 'retry_wait';
  end if;

  update public.club_announcements
  set status = 'cancelled',
      cancelled_at = clock_timestamp(),
      cancelled_by_account_id = target.created_by_account_id,
      cancel_reason = 'scheduled_delivery_failed',
      schedule_claimed_at = null,
      schedule_lease_expires_at = null,
      schedule_claim_token_hash = null,
      schedule_worker_hash = null,
      schedule_error_code = p_error_code
  where id = target.id;
  perform public.v09_append_version(target.id, target.created_by_account_id, 'schedule_failed');
  insert into public.audit_logs (
    club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
  ) values (
    target.club_id, null, 'announcement.worker_failed', 'announcement', target.id,
    jsonb_build_object('error_code', p_error_code, 'attempt_count', target.schedule_attempt_count)
  );
  return 'failed';
end;
$$;

create or replace function public.expire_due_announcements(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target record;
  affected integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = '22023', message = 'worker_input_invalid';
  end if;
  for target in
    select announcement.id, announcement.club_id, announcement.created_by_account_id
    from public.club_announcements as announcement
    where announcement.status = 'published'
      and announcement.expire_at is not null
      and announcement.expire_at <= clock_timestamp()
    order by announcement.expire_at, announcement.id
    for update skip locked
    limit p_limit
  loop
    update public.club_announcements set status = 'expired' where id = target.id;
    perform public.v09_append_version(target.id, target.created_by_account_id, 'expired');
    insert into public.audit_logs (
      club_id, actor_app_account_id, action_key, subject_type, subject_id, metadata
    ) values (
      target.club_id, null, 'announcement.expired', 'announcement', target.id, '{}'::jsonb
    );
    affected := affected + 1;
  end loop;
  return affected;
end;
$$;

create or replace function public.claim_notification_deliveries(
  p_limit integer,
  p_worker_id text
)
returns table (
  delivery_id uuid,
  notification_id uuid,
  channel text,
  claim_token text,
  idempotency_key text,
  attempt_count integer,
  max_attempts integer,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  claimed record;
  token_value text;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100
     or not public.v09_worker_id_is_valid(p_worker_id) then
    raise exception using errcode = '22023', message = 'worker_input_invalid';
  end if;

  -- A delivery whose final processing lease expired cannot be reclaimed: it
  -- has already consumed its bounded retry budget. Mark it terminal instead
  -- of leaving a row which no worker can ever claim again.
  update public.notification_deliveries as delivery
  set status = 'failed',
      failed_at = clock_timestamp(),
      claimed_at = null,
      lease_expires_at = null,
      claim_token_hash = null,
      claimed_by_worker_hash = null,
      generalized_error_code = 'worker_timeout'
  from public.clubs as club
  where club.id = delivery.club_id
    and club.club_status = 'active'
    and delivery.status = 'processing'
    and delivery.lease_expires_at <= clock_timestamp()
    and delivery.attempt_count >= delivery.max_attempts;

  for claimed in
    select delivery.id, delivery.notification_id, delivery.channel,
      delivery.attempt_count, delivery.max_attempts
    from public.notification_deliveries as delivery
    join public.account_notifications as notification on notification.id = delivery.notification_id
    join public.clubs as club on club.id = delivery.club_id
    where club.club_status = 'active'
      and (
        (delivery.status in ('pending', 'retry_wait') and delivery.next_attempt_at <= clock_timestamp())
        or (delivery.status = 'processing' and delivery.lease_expires_at <= clock_timestamp())
      )
      and delivery.attempt_count < delivery.max_attempts
      and public.v09_membership_is_current(
        delivery.club_id, delivery.account_id, delivery.membership_id
      )
      and notification.id = delivery.notification_id
    order by delivery.next_attempt_at, delivery.created_at, delivery.id
    for update of delivery skip locked
    limit p_limit
  loop
    token_value := extensions.gen_random_uuid()::text;
    update public.notification_deliveries as delivery
    set status = 'processing',
        attempt_count = delivery.attempt_count + 1,
        claimed_at = clock_timestamp(),
        lease_expires_at = clock_timestamp() + interval '5 minutes',
        claim_token_hash = public.v09_claim_token_hash(token_value),
        claimed_by_worker_hash = public.v09_claim_token_hash(p_worker_id),
        generalized_error_code = null
    where delivery.id = claimed.id;

    delivery_id := claimed.id;
    notification_id := claimed.notification_id;
    channel := claimed.channel;
    claim_token := token_value;
    idempotency_key := 'delivery:' || claimed.id::text;
    select delivery.attempt_count, delivery.max_attempts, delivery.lease_expires_at
      into attempt_count, max_attempts, lease_expires_at
    from public.notification_deliveries as delivery where delivery.id = claimed.id;
    return next;
  end loop;
end;
$$;

create or replace function public.complete_notification_delivery(
  p_delivery_id uuid,
  p_claim_token text,
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
     or p_provider_message_reference !~ '^[A-Za-z0-9._:-]+$' then
    raise exception using errcode = '22023', message = 'worker_input_invalid';
  end if;
  select * into target from public.notification_deliveries
  where id = p_delivery_id for update;
  if not found
     or target.status <> 'processing'
     or target.lease_expires_at <= clock_timestamp()
     or target.claim_token_hash is distinct from public.v09_claim_token_hash(p_claim_token) then
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

create or replace function public.fail_notification_delivery(
  p_delivery_id uuid,
  p_claim_token text,
  p_error_code text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target public.notification_deliveries;
  retryable boolean;
begin
  if p_error_code not in (
    'provider_temporary', 'network_temporary', 'rate_limited',
    'provider_permanent', 'recipient_unavailable', 'disabled'
  ) then
    raise exception using errcode = '22023', message = 'worker_input_invalid';
  end if;
  retryable := p_error_code in ('provider_temporary', 'network_temporary', 'rate_limited');
  select * into target from public.notification_deliveries
  where id = p_delivery_id for update;
  if not found
     or target.status <> 'processing'
     or target.claim_token_hash is distinct from public.v09_claim_token_hash(p_claim_token) then
    raise exception using errcode = 'P0002', message = 'worker_claim_not_available';
  end if;

  if retryable and target.attempt_count < target.max_attempts then
    update public.notification_deliveries
    set status = 'retry_wait',
        next_attempt_at = clock_timestamp() + make_interval(
          secs => public.v09_retry_backoff_seconds(target.attempt_count)
        ),
        claimed_at = null, lease_expires_at = null, claim_token_hash = null,
        claimed_by_worker_hash = null, generalized_error_code = p_error_code
    where id = target.id;
    return 'retry_wait';
  end if;

  update public.notification_deliveries
  set status = 'failed', failed_at = clock_timestamp(),
      claimed_at = null, lease_expires_at = null, claim_token_hash = null,
      claimed_by_worker_hash = null, generalized_error_code = p_error_code
  where id = target.id;
  return 'failed';
end;
$$;

revoke all on function public.v09_worker_id_is_valid(text) from public, anon, authenticated;
revoke all on function public.v09_claim_token_hash(text) from public, anon, authenticated;
revoke all on function public.v09_retry_backoff_seconds(integer) from public, anon, authenticated;
revoke all on function public.claim_due_scheduled_announcements(integer, text) from public, anon, authenticated;
revoke all on function public.complete_scheduled_announcement_claim(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_scheduled_announcement_claim(uuid, text, text) from public, anon, authenticated;
revoke all on function public.expire_due_announcements(integer) from public, anon, authenticated;
revoke all on function public.claim_notification_deliveries(integer, text) from public, anon, authenticated;
revoke all on function public.complete_notification_delivery(uuid, text, text) from public, anon, authenticated;
revoke all on function public.fail_notification_delivery(uuid, text, text) from public, anon, authenticated;

grant execute on function public.claim_due_scheduled_announcements(integer, text) to service_role;
grant execute on function public.complete_scheduled_announcement_claim(uuid, text) to service_role;
grant execute on function public.fail_scheduled_announcement_claim(uuid, text, text) to service_role;
grant execute on function public.expire_due_announcements(integer) to service_role;
grant execute on function public.claim_notification_deliveries(integer, text) to service_role;
grant execute on function public.complete_notification_delivery(uuid, text, text) to service_role;
grant execute on function public.fail_notification_delivery(uuid, text, text) to service_role;

commit;
