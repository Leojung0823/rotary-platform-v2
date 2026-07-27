-- LINE webhook fixed-window rate-limit verification.
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
begin
  if has_table_privilege('anon', 'public.line_webhook_rate_limits', 'SELECT')
     or has_table_privilege('authenticated', 'public.line_webhook_rate_limits', 'SELECT')
     or has_table_privilege('authenticated', 'public.line_webhook_rate_limits', 'INSERT')
     or has_function_privilege('anon', 'public.consume_line_webhook_rate_limit(uuid,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.consume_line_webhook_rate_limit(uuid,integer)', 'EXECUTE') then
    raise exception 'browser role gained webhook limiter access';
  end if;

  if not has_function_privilege('service_role', 'public.consume_line_webhook_rate_limit(uuid,integer)', 'EXECUTE') then
    raise exception 'service_role webhook limiter grant missing';
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
end $$;

rollback;
