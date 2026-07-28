-- LINE webhook fixed-window ingress and event-claim verification.
-- Run only against Supabase local. All fixtures are rolled back.

begin;

insert into public.clubs (id, club_code, club_name, club_status, activated_at)
values ('54000000-0000-4000-8000-000000000001', 'RATE-OA', 'Webhook Rate Test', 'active', now());

insert into public.line_oa_accounts (id, club_id, display_name, account_status)
values (
  '74000000-0000-4000-8000-000000000001',
  '54000000-0000-4000-8000-000000000001',
  'Rate Test OA',
  'active'
);

do $$
declare
  first_claim record;
  replay_claim record;
  failed_claim record;
  retry_claim record;
begin
  if has_table_privilege('anon', 'public.line_webhook_rate_limits', 'SELECT')
     or has_table_privilege('authenticated', 'public.line_webhook_rate_limits', 'SELECT')
     or has_table_privilege('authenticated', 'public.line_webhook_rate_limits', 'INSERT')
     or has_function_privilege('anon', 'public.consume_line_webhook_rate_limit(uuid,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.consume_line_webhook_rate_limit(uuid,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.claim_line_webhook_event(uuid,uuid,text,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.claim_line_webhook_event(uuid,uuid,text,text,text)', 'EXECUTE') then
    raise exception 'browser role gained webhook ingress access';
  end if;

  if not has_function_privilege('service_role', 'public.consume_line_webhook_rate_limit(uuid,integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.claim_line_webhook_event(uuid,uuid,text,text,text)', 'EXECUTE') then
    raise exception 'service_role webhook ingress grant missing';
  end if;

  if public.consume_line_webhook_rate_limit('74000000-0000-4000-8000-000000000001', 2) is not true then
    raise exception 'first webhook request was denied';
  end if;
  if public.consume_line_webhook_rate_limit('74000000-0000-4000-8000-000000000001', 2) is not true then
    raise exception 'second webhook request was denied';
  end if;
  if public.consume_line_webhook_rate_limit('74000000-0000-4000-8000-000000000001', 2) is not false then
    raise exception 'third webhook request exceeded the limit but was allowed';
  end if;

  if (select request_count from public.line_webhook_rate_limits
      where line_oa_account_id = '74000000-0000-4000-8000-000000000001'
        and window_start = date_trunc('minute', clock_timestamp())) <> 3 then
    raise exception 'webhook limiter count was not atomically incremented';
  end if;

  select * into first_claim
  from public.claim_line_webhook_event(
    '74000000-0000-4000-8000-000000000001',
    '54000000-0000-4000-8000-000000000001',
    'follow',
    'evt-processed',
    repeat('a', 64)
  );
  if first_claim.should_process is not true then
    raise exception 'new provider event was not claimed';
  end if;

  update public.line_webhooks
  set processing_status = 'processed', processed_at = now()
  where id = first_claim.log_id;

  select * into replay_claim
  from public.claim_line_webhook_event(
    '74000000-0000-4000-8000-000000000001',
    '54000000-0000-4000-8000-000000000001',
    'follow',
    'evt-processed',
    repeat('a', 64)
  );
  if replay_claim.log_id <> first_claim.log_id or replay_claim.should_process is not false then
    raise exception 'processed provider event replay was not suppressed';
  end if;

  begin
    perform public.claim_line_webhook_event(
      '74000000-0000-4000-8000-000000000001',
      '54000000-0000-4000-8000-000000000001',
      'follow',
      'evt-processed',
      repeat('b', 64)
    );
    raise exception 'provider event payload mismatch was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  select * into failed_claim
  from public.claim_line_webhook_event(
    '74000000-0000-4000-8000-000000000001',
    '54000000-0000-4000-8000-000000000001',
    'unfollow',
    'evt-retry',
    repeat('c', 64)
  );
  update public.line_webhooks
  set processing_status = 'failed', failure_code = 'temporary_failure'
  where id = failed_claim.log_id;

  select * into retry_claim
  from public.claim_line_webhook_event(
    '74000000-0000-4000-8000-000000000001',
    '54000000-0000-4000-8000-000000000001',
    'unfollow',
    'evt-retry',
    repeat('c', 64)
  );
  if retry_claim.log_id <> failed_claim.log_id or retry_claim.should_process is not true then
    raise exception 'failed provider event was not made retryable';
  end if;
  if (select processing_status from public.line_webhooks where id = retry_claim.log_id) <> 'received' then
    raise exception 'retried provider event did not return to received state';
  end if;
end $$;

rollback;
