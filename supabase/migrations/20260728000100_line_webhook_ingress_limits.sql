begin;

create table public.line_webhook_rate_limits (
  line_oa_account_id uuid not null references public.line_oa_accounts(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (line_oa_account_id, window_start)
);

comment on table public.line_webhook_rate_limits is
  'Trusted per-OA fixed-window request limiter for valid signed LINE webhook ingestion.';

alter table public.line_webhook_rate_limits enable row level security;
revoke all on table public.line_webhook_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.line_webhook_rate_limits to service_role;

create or replace function public.consume_line_webhook_rate_limit(
  p_line_oa_account_id uuid,
  p_limit integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_window timestamptz := date_trunc('minute', clock_timestamp());
  current_count integer;
begin
  if p_line_oa_account_id is null or p_limit is null or p_limit < 1 or p_limit > 10000 then
    raise exception using errcode = '22023', message = 'invalid_webhook_rate_limit_input';
  end if;

  if not exists (
    select 1
    from public.line_oa_accounts as account
    where account.id = p_line_oa_account_id
      and account.account_status <> 'disabled'
  ) then
    raise exception using errcode = 'P0002', message = 'line_oa_account_not_available';
  end if;

  insert into public.line_webhook_rate_limits (
    line_oa_account_id, window_start, request_count, updated_at
  ) values (
    p_line_oa_account_id, current_window, 1, clock_timestamp()
  )
  on conflict (line_oa_account_id, window_start)
  do update set
    request_count = public.line_webhook_rate_limits.request_count + 1,
    updated_at = clock_timestamp()
  returning request_count into current_count;

  delete from public.line_webhook_rate_limits
  where window_start < current_window - interval '1 day';

  return current_count <= p_limit;
end;
$$;

create or replace function public.claim_line_webhook_event(
  p_line_oa_account_id uuid,
  p_club_id uuid,
  p_event_type text,
  p_provider_event_id text,
  p_payload_hash text
)
returns table (log_id bigint, should_process boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  claimed public.line_webhooks;
begin
  if p_line_oa_account_id is null
     or p_club_id is null
     or btrim(coalesce(p_event_type, '')) = ''
     or p_payload_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_webhook_event_claim_input';
  end if;

  if not exists (
    select 1
    from public.line_oa_accounts as account
    where account.id = p_line_oa_account_id
      and account.club_id = p_club_id
      and account.account_status <> 'disabled'
  ) then
    raise exception using errcode = 'P0002', message = 'line_oa_account_not_available';
  end if;

  if nullif(btrim(coalesce(p_provider_event_id, '')), '') is null then
    insert into public.line_webhooks (
      line_oa_account_id, club_id, event_type, provider_event_id,
      signature_valid, payload_hash, processing_status, failure_code
    ) values (
      p_line_oa_account_id, p_club_id, btrim(p_event_type), null,
      true, p_payload_hash, 'received', null
    ) returning * into claimed;

    return query select claimed.id, true;
    return;
  end if;

  insert into public.line_webhooks (
    line_oa_account_id, club_id, event_type, provider_event_id,
    signature_valid, payload_hash, processing_status, failure_code
  ) values (
    p_line_oa_account_id, p_club_id, btrim(p_event_type), btrim(p_provider_event_id),
    true, p_payload_hash, 'received', null
  )
  on conflict (line_oa_account_id, provider_event_id)
    where provider_event_id is not null
  do nothing
  returning * into claimed;

  if found then
    return query select claimed.id, true;
    return;
  end if;

  select webhook.* into claimed
  from public.line_webhooks as webhook
  where webhook.line_oa_account_id = p_line_oa_account_id
    and webhook.provider_event_id = btrim(p_provider_event_id)
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'webhook_event_claim_missing';
  end if;
  if claimed.club_id <> p_club_id or claimed.payload_hash <> p_payload_hash then
    raise exception using errcode = '22023', message = 'webhook_event_payload_mismatch';
  end if;
  if claimed.processing_status = 'processed' then
    return query select claimed.id, false;
    return;
  end if;

  update public.line_webhooks
  set event_type = btrim(p_event_type),
      signature_valid = true,
      processing_status = 'received',
      failure_code = null,
      processed_at = null
  where id = claimed.id
  returning * into claimed;

  return query select claimed.id, true;
end;
$$;

revoke all on function public.consume_line_webhook_rate_limit(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.consume_line_webhook_rate_limit(uuid, integer)
  to service_role;

revoke all on function public.claim_line_webhook_event(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_line_webhook_event(uuid, uuid, text, text, text)
  to service_role;

commit;
