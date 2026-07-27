begin;

create table public.line_webhook_rate_limits (
  line_oa_account_id uuid not null references public.line_oa_accounts(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (line_oa_account_id, window_start)
);

comment on table public.line_webhook_rate_limits is
  'Trusted per-OA fixed-window request limiter for LINE webhook ingestion.';

revoke all on table public.line_webhook_rate_limits from public, anon, authenticated;

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

  -- Bounded maintenance. Operational retention can later move to a scheduled job.
  delete from public.line_webhook_rate_limits
  where window_start < current_window - interval '1 day';

  return current_count <= p_limit;
end;
$$;

revoke all on function public.consume_line_webhook_rate_limit(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.consume_line_webhook_rate_limit(uuid, integer)
  to service_role;

commit;
